/**
 * SEC Form D public pipeline (plan 9.1, R1 acceptance, D-073) — daily.
 *   index  EDGAR daily form index → Form D / D/A rows
 *   parse  primary_doc.xml → typed filing → company | fund | skip
 *   link   companies: earlier filing of the same CIK, else an existing company that entity resolution
 *          scores ≥ 0.95 on name + location + founding year, else a new company (placeholder domain)
 *          funds (VC/PE): earlier filing of the same CIK, else an investor with the same name, else new
 *   write  funding round (amount sold, first-sale date, inferred stage), aggregates, provenance, outbox
 * Amendments update the round of the original offering instead of adding one. Re-runs are no-ops.
 *
 * Needs SEC_USER_AGENT ("Company contact@example.com", SEC fair-access policy) for live fetches;
 * without it the job logs and exits cleanly. Options: --date=YYYY-MM-DD (default yesterday UTC),
 * --days=N (backfill N days ending at --date), --limit=N filings, --fixtures=<dir> (offline).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { newId } from "@founders/core/ids";
import { scoreCompanies } from "@founders/core/resolution";
import { pg } from "../db";
import {
  classify, dailyIndexUrl, filingIndexUrl, location, primaryDocUrl, SecClient, secPlaceholderDomain,
  type FetchText, type FormDFiling, type IndexEntry,
} from "../providers/sec-formd";
import type { JobContext, JobDef } from "../runner";

/** Link to an existing company only when resolution is this sure (no hard key on Form D). */
const LINK_PROBABILITY = 0.95;

const provenance = (url: string, fetchedAt: string, fields: string[], extra: Record<string, unknown> = {}) =>
  Object.fromEntries(fields.map((f) => [f, { source: "sec_form_d", url, fetched_at: fetchedAt, redistributable: true, ...extra }]));

export type IngestOutcome = { outcome: "company" | "fund" | "skip" | "duplicate"; companyId?: string; investorId?: string; roundId?: string; created?: boolean; reason?: string };

async function findCompany(f: FormDFiling, loc: ReturnType<typeof location>): Promise<string | null> {
  const sql = pg();
  const [prior] = await sql<{ company_id: string }[]>`
    SELECT s.company_id FROM sec_filings s JOIN companies c ON c.id = s.company_id AND c.deleted_at IS NULL
    WHERE s.cik = ${f.cik} AND s.company_id IS NOT NULL ORDER BY s.filed_date DESC LIMIT 1`;
  if (prior) return prior.company_id;
  const cands = await sql<{ id: string; name: string; domain: string; hq_country: string | null; hq_city: string | null; founded_year: number | null }[]>`
    SELECT id, name, domain, hq_country, hq_city, founded_year FROM companies
    WHERE deleted_at IS NULL AND (name % ${f.name} OR ${f.name} = ANY(aliases)) ORDER BY similarity(name, ${f.name}) DESC LIMIT 10`;
  let best: { id: string; p: number } | null = null;
  for (const c of cands) {
    const s = scoreCompanies(
      { id: "sec", name: f.name, hqCountry: loc.country, hqCity: loc.city, foundedYear: f.yearOfInc },
      { id: c.id, name: c.name, domain: c.domain, hqCountry: c.hq_country, hqCity: c.hq_city, foundedYear: c.founded_year },
    );
    if (!best || s.probability > best.p) best = { id: c.id, p: s.probability };
  }
  return best && best.p >= LINK_PROBABILITY ? best.id : null;
}

async function refreshCompanyFunding(companyId: string) {
  const sql = pg();
  await sql`
    UPDATE companies c SET total_funding_usd = x.total, round_count = x.n, last_funding_usd = x.last_amount, last_funding_date = x.last_date,
      last_funding_type = x.last_type, updated_at = now()
    FROM (
      SELECT count(*)::int AS n, sum(amount_usd) AS total,
        (array_agg(amount_usd ORDER BY announced_date DESC))[1] AS last_amount,
        max(announced_date) AS last_date,
        (array_agg(type ORDER BY announced_date DESC))[1] AS last_type
      FROM funding_rounds WHERE company_id = ${companyId}
    ) x WHERE c.id = ${companyId}`;
}

/** Ingest one parsed filing. Idempotent on the accession number. */
export async function ingestFiling(e: IndexEntry, f: FormDFiling, fetchedAt = new Date().toISOString()): Promise<IngestOutcome> {
  const sql = pg();
  const [seen] = await sql`SELECT 1 FROM sec_filings WHERE accession = ${e.accession}`;
  if (seen) return { outcome: "duplicate" };
  const url = filingIndexUrl(e);
  const loc = location(f);
  const c = classify(f);
  const record = async (o: IngestOutcome) => {
    await sql`INSERT INTO sec_filings (accession, cik, form_type, filed_date, issuer_name, outcome, skip_reason, company_id, investor_id, round_id,
        date_of_first_sale, amount_sold_usd, previous_accession, parsed)
      VALUES (${e.accession}, ${f.cik}, ${e.form}, ${e.filedDate}, ${f.name}, ${o.outcome}, ${o.reason ?? null}, ${o.companyId ?? null}, ${o.investorId ?? null},
        ${o.roundId ?? null}, ${f.dateOfFirstSale}, ${f.totalAmountSold}, ${f.previousAccession}, ${sql.json(JSON.parse(JSON.stringify(f)))})
      ON CONFLICT (accession) DO NOTHING`;
    return o;
  };

  if (c.kind === "skip") return record({ outcome: "skip", reason: c.reason });

  if (c.kind === "fund") {
    const [prior] = await sql<{ investor_id: string }[]>`SELECT investor_id FROM sec_filings WHERE cik = ${f.cik} AND investor_id IS NOT NULL LIMIT 1`;
    const [byName] = prior ? [] : await sql<{ id: string }[]>`SELECT id FROM investors WHERE lower(name) = lower(${f.name}) AND deleted_at IS NULL LIMIT 1`;
    let investorId = prior?.investor_id ?? byName?.id;
    let created = false;
    if (!investorId) {
      investorId = newId("investor");
      created = true;
      await sql`INSERT INTO investors (id, name, type, hq_city, hq_country, founded_year, geographies, provenance)
        VALUES (${investorId}, ${f.name}, ${c.investorType}, ${loc.city}, ${loc.country}, ${f.yearOfInc}, ${loc.region ? [loc.region] : []},
          ${sql.json(provenance(url, fetchedAt, ["name", "type", "hq_city", "hq_country"]))})`;
    }
    return record({ outcome: "fund", investorId, created });
  }

  let companyId = await findCompany(f, loc);
  let created = false;
  if (!companyId) {
    companyId = newId("company");
    created = true;
    await sql`INSERT INTO companies (id, name, aliases, domain, founded_year, hq_city, hq_state, hq_country, hq_region, growth_stage, tags, provenance)
      VALUES (${companyId}, ${f.name}, ${[]}, ${secPlaceholderDomain(f.cik)}, ${f.yearOfInc}, ${loc.city}, ${loc.state}, ${loc.country}, ${loc.region},
        ${c.growthStage}, ${["sec-form-d"]}, ${sql.json(provenance(url, fetchedAt, ["name", "founded_year", "hq_city", "hq_state", "hq_country"]))})`;
  }

  // An amendment (or a re-filed offering) updates the round of the same offering.
  const firstSale = f.dateOfFirstSale ?? e.filedDate;
  const [existing] = await sql<{ round_id: string }[]>`
    SELECT round_id FROM sec_filings WHERE cik = ${f.cik} AND round_id IS NOT NULL
      AND (accession = ${f.previousAccession ?? ""} OR date_of_first_sale = ${firstSale}) ORDER BY filed_date DESC LIMIT 1`;
  const roundProv = provenance(url, fetchedAt, ["amount_usd", "announced_date"]);
  const typeProv = provenance(url, fetchedAt, ["type"], { inferred: "amount sold (D-073)" });
  let roundId = existing?.round_id;
  if (roundId) {
    await sql`UPDATE funding_rounds SET amount_usd = ${f.totalAmountSold}, type = ${c.roundType}, source_urls = array_append(array_remove(source_urls, ${url}), ${url}),
      provenance = COALESCE(provenance, '{}'::jsonb) || ${sql.json({ ...roundProv, ...typeProv })} WHERE id = ${roundId}`;
  } else {
    roundId = newId("round");
    await sql`INSERT INTO funding_rounds (id, company_id, type, amount_usd, announced_date, source_urls, provenance)
      VALUES (${roundId}, ${companyId}, ${c.roundType}, ${f.totalAmountSold}, ${firstSale}, ${[url]}, ${sql.json({ ...roundProv, ...typeProv })})`;
  }
  await refreshCompanyFunding(companyId);
  await sql`INSERT INTO outbox_events (product, entity_id, kind) VALUES ('companies', ${companyId}, ${created ? "CREATED" : "UPDATED"})`;
  return record({ outcome: "company", companyId, roundId, created });
}

/** Serve EDGAR URLs from a fixtures directory (`form.YYYYMMDD.idx`, `<accession>.xml`). */
export function fixtureFetcher(dir: string): FetchText {
  return async (url) => {
    const name = url.endsWith(".idx") ? url.split("/").pop()! : url.endsWith("primary_doc.xml") ? `${url.split("/").at(-2)!.replace(/^(\d{10})(\d{2})(\d{6})$/, "$1-$2-$3")}.xml` : "";
    try {
      return { status: 200, text: await readFile(path.join(dir, name), "utf8") };
    } catch {
      return { status: 404, text: "" };
    }
  };
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export async function runSecFormD(client: SecClient, dates: string[], ctx: Pick<JobContext, "count" | "log">, limit = Infinity) {
  let processed = 0;
  for (const date of dates) {
    const entries = await client.dailyIndex(date);
    ctx.count("index_entries", entries.length);
    ctx.log(`${date}: ${entries.length} Form D filings in ${dailyIndexUrl(date)}`);
    for (const e of entries) {
      if (processed >= limit) return;
      processed++;
      const [seen] = await pg()`SELECT 1 FROM sec_filings WHERE accession = ${e.accession}`;
      if (seen) {
        ctx.count("duplicate");
        continue;
      }
      let f: FormDFiling | null = null;
      try {
        f = await client.filing(e);
      } catch (err) {
        ctx.log(`parse failed ${primaryDocUrl(e)}: ${err instanceof Error ? err.message : String(err)}`);
      }
      if (!f) {
        ctx.count("fetch_failed");
        continue;
      }
      const o = await ingestFiling(e, f);
      ctx.count(o.outcome);
      if (o.created) ctx.count(o.outcome === "fund" ? "investors_created" : "companies_created");
      if (o.outcome === "company" && !o.created) ctx.count("companies_linked");
    }
  }
}

export const secFormDJob: JobDef = {
  name: "sec-formd",
  description: "Ingest SEC Form D filings (EDGAR daily index) into companies, funding rounds and investors",
  async run(ctx) {
    const end = typeof ctx.options.date === "string" ? ctx.options.date : isoDay(new Date(Date.now() - 86_400_000));
    const days = typeof ctx.options.days === "number" ? Math.max(1, Math.min(90, ctx.options.days)) : 1;
    const dates = Array.from({ length: days }, (_, i) => isoDay(new Date(Date.parse(`${end}T00:00:00Z`) - (days - 1 - i) * 86_400_000)));
    const limit = typeof ctx.options.limit === "number" ? ctx.options.limit : Infinity;
    let client: SecClient;
    if (typeof ctx.options.fixtures === "string") {
      client = new SecClient(fixtureFetcher(ctx.options.fixtures), 0);
    } else {
      const ua = process.env.SEC_USER_AGENT?.trim();
      if (!ua) {
        ctx.log("SEC_USER_AGENT is not set (SEC fair-access policy needs a contact); skipping live fetch");
        ctx.count("skipped_no_user_agent");
        return;
      }
      client = SecClient.live(ua);
    }
    await runSecFormD(client, dates, ctx, limit);
  },
};
