/**
 * Read access to the shared (non-org) datasets. Postgres-only in Phase 3a; the search adapter
 * switches to OpenSearch in Phase 3b without changing these signatures.
 */
import { canonicalDomain, canonicalLinkedIn } from "../resolution";
import { getDb } from "@founders/db";
import { sql, type SQL } from "drizzle-orm";
import { emptyFilter, type Group, type Product } from "../filters/ast";
import { compileFilter, compileQuery, compileSort, type SortSpec } from "../filters/compile";
import { PRODUCT_META } from "../filters/fields";
import { EXACT_COUNT_CAP } from "../limits";
import { isFlagOn } from "./flags";

export type Row = Record<string, unknown>;

const inList = (ids: string[]) => sql.join(ids.map((x) => sql`${x}`), sql`, `);

async function q<T = Row>(query: SQL): Promise<T[]> {
  const res = await getDb().execute(query);
  return res as unknown as T[];
}

const SELECT: Record<Product, string> = {
  companies: `t.id, t.name, t.domain, t.tagline, t.growth_stage, t.hq_city, t.hq_country, t.hq_region, t.operating_status,
    t.employee_count, t.employee_range, t.headcount_growth_3m, t.headcount_growth_12m, t.web_visits, t.web_visits_growth_3m,
    t.linkedin_followers, t.total_funding_usd, t.last_funding_usd, t.last_funding_date, t.last_funding_type, t.round_count,
    t.investor_count, t.business_models, t.customer_focus, t.sector_id, t.industry_ids, t.tech_vertical_ids, t.est_revenue_usd,
    t.est_valuation_usd, t.rank, t.highlights, t.founded_year`,
  people: `t.id, t.full_name, t.headline, t.current_title, t.current_company_id, t.current_company_name, t.seniority, t.department,
    t.location, t.country, t.years_experience, t.highlights, t.education_summary, t.followers, t.connections, t.talent_signal_count, t.linkedin_url`,
  investors: `t.id, t.name, t.type, t.domain, t.hq_city, t.hq_country, t.aum_usd, t.check_min, t.check_max, t.target_stages,
    t.geographies, t.sectors, t.investments_count, t.exits_count, t.leads_count, t.follow_on_rate, t.unicorn_count, t.highlights`,
  funding_rounds: `t.id, t.company_id, c.name AS company_name, c.domain AS company_domain, c.hq_country AS company_country, t.type,
    t.amount_usd, t.announced_date, t.pre_money_usd, t.post_money_usd`,
  talent_signals: `t.id, t.person_id, p.full_name AS person_name, p.current_title, p.current_company_id, p.current_company_name,
    p.highlights AS person_highlights, t.type, t.status, t.score, t.summary, t.signal_date, t.new_company_id`,
  acquisitions: `t.id, t.target_id, c.name AS target_name, c.domain AS target_domain, c.hq_country AS target_country, c.tagline AS target_tagline,
    t.acquirer_id, t.acquirer_name, t.date, t.amount_usd, t.status`,
  ipos: `t.id, t.company_id, c.name AS company_name, c.domain AS company_domain, c.hq_country AS company_country, t.date, t.exchange,
    t.ticker, t.share_price, t.valuation_usd, t.raised_usd`,
  news_signals: `t.id, t.company_id, c.name AS company_name, c.domain AS company_domain, c.hq_country AS company_country, t.category,
    t.summary, t.score, t.is_major, t.published_at, ni.title, ni.publisher, ni.url`,
  interest_signals: `t.id, t.target_company_id, c.name AS target_name, c.domain AS target_domain, c.hq_country AS target_country, c.growth_stage AS target_stage,
    t.investor_id, i.name AS investor_name, t.investor_type, t.score, t.signal_date, t.source_type, t.evidence`,
};

export type SearchParams = {
  filter?: Group;
  q?: string | null;
  sort?: SortSpec | null;
  limit?: number;
  offset?: number;
  orgId?: string;
  /** Only return ids (saved-search snapshots). */
  idsOnly?: boolean;
  /** Restrict to these entity ids (real-time alert matching against freshly ingested rows). */
  ids?: string[];
};

export type SearchResult = { rows: Row[]; total: number; totalCapped: boolean };

function fromClause(product: Product): SQL {
  const meta = PRODUCT_META[product];
  const softDelete = product === "companies" || product === "people" || product === "investors" ? " AND t.deleted_at IS NULL" : "";
  return sql.raw(`FROM ${meta.table} t ${meta.join ?? ""} WHERE TRUE${softDelete}`);
}

export async function searchEntities(product: Product, p: SearchParams = {}): Promise<SearchResult> {
  // Interest signals exist only for orgs with the flag (legal sign-off H8); everyone else sees nothing.
  if (product === "interest_signals" && !(await isFlagOn("interest_signals", p.orgId))) return { rows: [], total: 0, totalCapped: false };
  const filter = compileFilter(product, p.filter ?? emptyFilter(), { orgId: p.orgId });
  const text = p.ids ? sql`${compileQuery(product, p.q)} AND t.id IN (${p.ids.length ? inList(p.ids) : sql`NULL`})` : compileQuery(product, p.q);
  const order = compileSort(product, p.sort);
  const limit = Math.max(1, Math.min(p.limit ?? 100, 5000));
  const offset = Math.max(0, p.offset ?? 0);
  const from = fromClause(product);
  const cols = sql.raw(p.idsOnly ? "t.id" : SELECT[product]);
  const [rows, count] = await Promise.all([
    q(sql`SELECT ${cols} ${from} AND ${filter} AND ${text} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`),
    q<{ n: number }>(sql`SELECT count(*)::int AS n FROM (SELECT 1 ${from} AND ${filter} AND ${text} LIMIT ${EXACT_COUNT_CAP + 1}) x`),
  ]);
  const n = count[0]?.n ?? 0;
  if (!p.idsOnly) await decorate(product, rows);
  return { rows, total: Math.min(n, EXACT_COUNT_CAP), totalCapped: n > EXACT_COUNT_CAP };
}

/** Add founders (companies) / investors (rounds) to a page of rows. */
async function decorate(product: Product, rows: Row[]) {
  if (!rows.length) return;
  const ids = rows.map((r) => String(r.id));
  if (product === "companies") {
    const founders = await q<{ company_id: string; id: string; full_name: string }>(
      sql`SELECT cp.company_id, p.id, p.full_name FROM company_people cp JOIN people p ON p.id = cp.person_id
          WHERE cp.is_founder AND cp.company_id IN (${sql.join(ids.map((x) => sql`${x}`), sql`, `)})`,
    );
    const by = new Map<string, { id: string; name: string }[]>();
    for (const f of founders) by.set(f.company_id, [...(by.get(f.company_id) ?? []), { id: f.id, name: f.full_name }]);
    for (const r of rows) r.founders = by.get(String(r.id)) ?? [];
  }
  if (product === "funding_rounds") {
    const inv = await q<{ round_id: string; id: string; name: string; is_lead: boolean }>(
      sql`SELECT ri.round_id, i.id, i.name, ri.is_lead FROM round_investors ri JOIN investors i ON i.id = ri.investor_id
          WHERE ri.round_id IN (${sql.join(ids.map((x) => sql`${x}`), sql`, `)}) ORDER BY ri.is_lead DESC`,
    );
    const by = new Map<string, { id: string; name: string; is_lead: boolean }[]>();
    for (const i of inv) by.set(i.round_id, [...(by.get(i.round_id) ?? []), { id: i.id, name: i.name, is_lead: i.is_lead }]);
    for (const r of rows) r.investors = by.get(String(r.id)) ?? [];
  }
}

/* ------------------------------------------------------------------ */
/* Profiles                                                            */
/* ------------------------------------------------------------------ */


export async function getCompany(id: string): Promise<Row | null> {
  const [c] = await q(sql`SELECT * FROM companies WHERE id = ${id} AND deleted_at IS NULL`);
  if (!c) return null;
  delete c.embedding;
  return c;
}

export async function getCompanyByDomain(domain: string): Promise<Row | null> {
  const d = canonicalDomain(domain);
  if (!d) return null;
  const [c] = await q(sql`SELECT id FROM companies WHERE (domain = ${d} OR ${d} = ANY(domain_aliases)) AND deleted_at IS NULL LIMIT 1`);
  return c ? getCompany(String(c.id)) : null;
}

export function getCompanyPeople(companyId: string, limit = 50) {
  return q(sql`SELECT p.id, p.full_name, p.current_title, p.seniority, p.department, p.highlights, p.location, p.talent_signal_count,
      cp.is_founder, cp.title, cp.start
    FROM company_people cp JOIN people p ON p.id = cp.person_id
    WHERE cp.company_id = ${companyId} ORDER BY cp.is_founder DESC, p.seniority LIMIT ${limit}`);
}

export async function getCompanyRounds(companyId: string) {
  const rounds = await q(sql`SELECT * FROM funding_rounds WHERE company_id = ${companyId} ORDER BY announced_date DESC`);
  await decorate("funding_rounds", rounds);
  return rounds;
}

export function getCompanyInvestors(companyId: string) {
  return q(sql`SELECT i.id, i.name, i.type, i.highlights, bool_or(ri.is_lead) AS is_lead, count(*)::int AS rounds,
      max(fr.announced_date) AS last_round_date
    FROM funding_rounds fr JOIN round_investors ri ON ri.round_id = fr.id JOIN investors i ON i.id = ri.investor_id
    WHERE fr.company_id = ${companyId} GROUP BY i.id ORDER BY bool_or(ri.is_lead) DESC, count(*) DESC`);
}

export function getCompanyCompetitors(companyId: string, limit = 10, minOverlap = 0) {
  return q(sql`SELECT c.id, c.name, c.domain, c.tagline, c.growth_stage, c.hq_country, c.employee_count, c.headcount_growth_3m,
      c.total_funding_usd, c.est_revenue_usd, cc.overlap_score, cc.reason
    FROM company_competitors cc JOIN companies c ON c.id = cc.competitor_id
    WHERE cc.company_id = ${companyId} AND cc.overlap_score >= ${minOverlap} AND c.deleted_at IS NULL
    ORDER BY cc.overlap_score DESC LIMIT ${limit}`);
}

export function getCompanyNews(companyId: string, limit = 50) {
  return q(sql`SELECT ns.id, ns.category, ns.summary, ns.score, ns.is_major, ns.figures, ns.published_at, ni.title, ni.url, ni.publisher
    FROM news_signals ns JOIN news_items ni ON ni.id = ns.news_item_id
    WHERE ns.company_id = ${companyId} ORDER BY ns.published_at DESC LIMIT ${limit}`);
}

/**
 * Estimates from the active REVENUE model (plan 9.6: rollback = repoint `model_versions.active`).
 * Falls back to whatever version exists for the company (e.g. v0 before the ML job has run).
 */
const ACTIVE_ESTIMATE_VERSION = sql`COALESCE(
  (SELECT e2.model_version FROM company_estimates e2 JOIN model_versions mv ON mv.version = e2.model_version AND mv.kind = 'REVENUE' AND mv.active
    WHERE e2.company_id = e.company_id LIMIT 1),
  (SELECT e3.model_version FROM company_estimates e3 WHERE e3.company_id = e.company_id ORDER BY e3.model_version DESC LIMIT 1))`;

export function getCompanyEstimates(companyId: string) {
  return q(sql`SELECT e.* FROM company_estimates e WHERE e.company_id = ${companyId} AND e.model_version = ${ACTIVE_ESTIMATE_VERSION} ORDER BY e.month ASC`);
}

export async function getActiveModelVersions() {
  return q<{ version: string; kind: string; metrics: Record<string, unknown> | null; created_at: string }>(
    sql`SELECT version, kind, metrics, created_at FROM model_versions WHERE active ORDER BY kind`,
  );
}

export function getCompanyDisclosures(companyId: string) {
  return q(sql`SELECT * FROM revenue_disclosures WHERE company_id = ${companyId} AND status = 'verified' ORDER BY period ASC`);
}

export function getCompanyMetrics(companyId: string) {
  return q<{ metric: string; date: string; value: number }>(
    sql`SELECT metric, date::text AS date, value FROM company_metrics_daily WHERE company_id = ${companyId} ORDER BY date ASC`,
  );
}

export function getCompanyAcquisitions(companyId: string) {
  return q(sql`SELECT a.*, t.name AS target_name FROM acquisitions a JOIN companies t ON t.id = a.target_id
    WHERE a.target_id = ${companyId} OR a.acquirer_id = ${companyId} ORDER BY a.date DESC`);
}

export function getCompanyIpos(companyId: string) {
  return q(sql`SELECT * FROM ipos WHERE company_id = ${companyId}`);
}

export function getCompanyTalentSignals(companyId: string, limit = 20) {
  return q(sql`SELECT ts.*, p.full_name AS person_name, p.current_title FROM talent_signals ts JOIN people p ON p.id = ts.person_id
    WHERE ts.new_company_id = ${companyId} OR p.current_company_id = ${companyId} ORDER BY ts.signal_date DESC LIMIT ${limit}`);
}

export async function getTeamBreakdown(companyId: string) {
  const [dept, seniority] = await Promise.all([
    q<{ department: string; n: number }>(sql`SELECT department, count(*)::int AS n FROM people WHERE current_company_id = ${companyId} GROUP BY 1 ORDER BY 2 DESC`),
    q<{ seniority: string; n: number }>(sql`SELECT seniority, count(*)::int AS n FROM people WHERE current_company_id = ${companyId} GROUP BY 1 ORDER BY 2 DESC`),
  ]);
  return { dept, seniority };
}

export async function getPerson(id: string): Promise<Row | null> {
  const [p] = await q(sql`SELECT * FROM people WHERE id = ${id} AND deleted_at IS NULL`);
  if (!p) return null;
  delete p.embedding;
  return p;
}

export function getPersonExperience(personId: string) {
  return q(sql`SELECT * FROM person_experience WHERE person_id = ${personId} ORDER BY is_current DESC, start DESC NULLS LAST`);
}

export function getPersonEducation(personId: string) {
  return q(sql`SELECT pe.*, s.name AS school_name, s.country AS school_country, s.tier FROM person_education pe
    JOIN schools s ON s.id = pe.school_id WHERE pe.person_id = ${personId}`);
}

export function getPersonTalentSignals(personId: string) {
  return q(sql`SELECT * FROM talent_signals WHERE person_id = ${personId} ORDER BY signal_date DESC`);
}

export function getPersonEmails(personId: string) {
  return q<{ email: string; type: string; status: string }>(
    sql`SELECT email, type, status FROM person_emails WHERE person_id = ${personId} ORDER BY status = 'verified' DESC`,
  );
}

export function getPersonInvestments(personId: string) {
  return q(sql`SELECT fr.id, fr.type, fr.amount_usd, fr.announced_date, c.id AS company_id, c.name AS company_name
    FROM investors i JOIN round_investors ri ON ri.investor_id = i.id JOIN funding_rounds fr ON fr.id = ri.round_id
    JOIN companies c ON c.id = fr.company_id WHERE i.person_id = ${personId} ORDER BY fr.announced_date DESC LIMIT 50`);
}

export async function getInvestor(id: string): Promise<Row | null> {
  const [i] = await q(sql`SELECT * FROM investors WHERE id = ${id} AND deleted_at IS NULL`);
  return i ?? null;
}

export function getInvestorPortfolio(investorId: string, limit = 100) {
  return q(sql`SELECT c.id, c.name, c.domain, c.tagline, c.growth_stage, c.hq_country, c.total_funding_usd, c.operating_status,
      c.employee_count, c.headcount_growth_3m, bool_or(ri.is_lead) AS is_lead, min(fr.announced_date) AS first_invested,
      count(*)::int AS rounds
    FROM round_investors ri JOIN funding_rounds fr ON fr.id = ri.round_id JOIN companies c ON c.id = fr.company_id
    WHERE ri.investor_id = ${investorId} GROUP BY c.id ORDER BY min(fr.announced_date) DESC LIMIT ${limit}`);
}

export async function getInvestorRounds(investorId: string, limit = 100) {
  const rounds = await q(sql`SELECT fr.*, c.name AS company_name, ri.is_lead AS investor_is_lead FROM round_investors ri
    JOIN funding_rounds fr ON fr.id = ri.round_id JOIN companies c ON c.id = fr.company_id
    WHERE ri.investor_id = ${investorId} ORDER BY fr.announced_date DESC LIMIT ${limit}`);
  await decorate("funding_rounds", rounds);
  return rounds;
}

export function getCoInvestors(investorId: string, limit = 20) {
  return q(sql`SELECT i.id, i.name, i.type, count(*)::int AS shared_rounds FROM round_investors a
    JOIN round_investors b ON b.round_id = a.round_id AND b.investor_id <> a.investor_id
    JOIN investors i ON i.id = b.investor_id WHERE a.investor_id = ${investorId}
    GROUP BY i.id ORDER BY count(*) DESC LIMIT ${limit}`);
}

export function getInvestorStageMix(investorId: string) {
  return q<{ type: string; n: number }>(sql`SELECT fr.type, count(*)::int AS n FROM round_investors ri JOIN funding_rounds fr ON fr.id = ri.round_id
    WHERE ri.investor_id = ${investorId} GROUP BY 1 ORDER BY 2 DESC`);
}

export async function getRound(id: string): Promise<Row | null> {
  const rounds = await q(sql`SELECT fr.*, c.name AS company_name FROM funding_rounds fr JOIN companies c ON c.id = fr.company_id WHERE fr.id = ${id}`);
  await decorate("funding_rounds", rounds);
  return rounds[0] ?? null;
}

/** Most relevant backers for a company (fit score 0–100) — stage, sector, geography, activity. */
export function getRelevantBackers(companyId: string, limit = 8) {
  return q(sql`WITH c AS (SELECT * FROM companies WHERE id = ${companyId})
    SELECT i.id, i.name, i.type, i.investments_count, i.highlights,
      LEAST(99, round(
        40 * (c.growth_stage = ANY(i.target_stages))::int +
        25 * (c.sector_id = ANY(i.sectors))::int +
        20 * (c.hq_region = ANY(i.geographies))::int +
        LEAST(14, i.investments_count / 4.0)
      ))::int AS fit
    FROM investors i, c
    WHERE i.deleted_at IS NULL AND i.type <> 'Angel' AND NOT EXISTS (
      SELECT 1 FROM round_investors ri JOIN funding_rounds fr ON fr.id = ri.round_id WHERE fr.company_id = c.id AND ri.investor_id = i.id)
    ORDER BY fit DESC, i.investments_count DESC LIMIT ${limit}`);
}

/* ------------------------------------------------------------------ */
/* Resolve, quick search, stats                                        */
/* ------------------------------------------------------------------ */

export type ResolveInput = { domain?: string; name?: string; linkedin_url?: string; email?: string };

export async function resolveCompanies(inputs: ResolveInput[]): Promise<{ input: ResolveInput; company_id: string | null; confidence: number }[]> {
  return Promise.all(
    inputs.map(async (input) => {
      if (input.domain) {
        const c = await getCompanyByDomain(input.domain);
        if (c) return { input, company_id: String(c.id), confidence: 1 };
      }
      if (input.name) {
        const [m] = await q<{ id: string; sim: number }>(
          sql`SELECT id, similarity(name, ${input.name}) AS sim FROM companies WHERE name % ${input.name} AND deleted_at IS NULL ORDER BY sim DESC, rank ASC LIMIT 1`,
        );
        if (m) return { input, company_id: m.id, confidence: Math.round(m.sim * 100) / 100 };
      }
      return { input, company_id: null, confidence: 0 };
    }),
  );
}

export async function resolvePeople(inputs: ResolveInput[]): Promise<{ input: ResolveInput; person_id: string | null; confidence: number }[]> {
  return Promise.all(
    inputs.map(async (input) => {
      if (input.linkedin_url) {
        const [m] = await q<{ id: string }>(sql`SELECT id FROM people WHERE linkedin_url = ${input.linkedin_url} AND deleted_at IS NULL LIMIT 1`);
        if (m) return { input, person_id: m.id, confidence: 1 };
        // Same profile written differently (www./country subdomain, trailing slash, query string).
        const canon = canonicalLinkedIn(input.linkedin_url);
        if (canon) {
          const [c] = await q<{ id: string }>(sql`SELECT id FROM people WHERE deleted_at IS NULL
            AND rtrim(split_part(regexp_replace(lower(linkedin_url), '^[a-z]+://(www[.]|[a-z]{2,3}[.])?', ''), '?', 1), '/') = ${canon} LIMIT 1`);
          if (c) return { input, person_id: c.id, confidence: 1 };
        }
      }
      if (input.email) {
        const [m] = await q<{ person_id: string }>(sql`SELECT person_id FROM person_emails WHERE lower(email) = lower(${input.email}) LIMIT 1`);
        if (m) return { input, person_id: m.person_id, confidence: 1 };
      }
      if (input.name) {
        const [m] = await q<{ id: string; sim: number }>(
          sql`SELECT id, similarity(full_name, ${input.name}) AS sim FROM people WHERE full_name % ${input.name} ORDER BY sim DESC, followers DESC LIMIT 1`,
        );
        if (m) return { input, person_id: m.id, confidence: Math.round(m.sim * 100) / 100 };
      }
      return { input, person_id: null, confidence: 0 };
    }),
  );
}

export async function resolveInvestors(inputs: ResolveInput[]): Promise<{ input: ResolveInput; investor_id: string | null; confidence: number }[]> {
  return Promise.all(
    inputs.map(async (input) => {
      if (input.domain) {
        const d = input.domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "");
        const [m] = await q<{ id: string }>(sql`SELECT id FROM investors WHERE domain = ${d} LIMIT 1`);
        if (m) return { input, investor_id: m.id, confidence: 1 };
      }
      if (input.name) {
        const [m] = await q<{ id: string; sim: number }>(
          sql`SELECT id, similarity(name, ${input.name}) AS sim FROM investors WHERE name % ${input.name} ORDER BY sim DESC LIMIT 1`,
        );
        if (m) return { input, investor_id: m.id, confidence: Math.round(m.sim * 100) / 100 };
      }
      return { input, investor_id: null, confidence: 0 };
    }),
  );
}

export type QuickHit = { kind: "company" | "person" | "investor"; id: string; title: string; subtitle: string };

/** ⌘K typeahead across companies, people and investors. */
export async function quickSearch(term: string, limit = 5): Promise<QuickHit[]> {
  const t = term.trim();
  if (!t) return [];
  const prefix = `${t.replace(/[\\%_]/g, "")}%`;
  const [cs, ps, is] = await Promise.all([
    q<{ id: string; name: string; domain: string; tagline: string }>(
      sql`SELECT id, name, domain, tagline FROM companies WHERE deleted_at IS NULL AND (name ILIKE ${prefix} OR domain ILIKE ${prefix})
          ORDER BY rank ASC LIMIT ${limit}`,
    ),
    q<{ id: string; full_name: string; headline: string }>(
      sql`SELECT id, full_name, headline FROM people WHERE deleted_at IS NULL AND (full_name ILIKE ${prefix} OR last ILIKE ${prefix})
          ORDER BY followers DESC NULLS LAST LIMIT ${limit}`,
    ),
    q<{ id: string; name: string; type: string; hq_country: string }>(
      sql`SELECT id, name, type, hq_country FROM investors WHERE deleted_at IS NULL AND name ILIKE ${prefix}
          ORDER BY investments_count DESC LIMIT ${limit}`,
    ),
  ]);
  return [
    ...cs.map((c) => ({ kind: "company" as const, id: c.id, title: c.name, subtitle: `${c.domain} · ${c.tagline ?? ""}` })),
    ...ps.map((p) => ({ kind: "person" as const, id: p.id, title: p.full_name, subtitle: p.headline ?? "" })),
    ...is.map((i) => ({ kind: "investor" as const, id: i.id, title: i.name, subtitle: `${i.type} · ${i.hq_country ?? ""}` })),
  ];
}

export type PlatformStats = {
  companies: number;
  people: number;
  investors: number;
  transactions: number;
  funding_rounds: number;
  talent_signals: number;
  talent_signals_7d: number;
  rounds_30d: number;
  news_signals: number;
  news_sources: number;
  revenue_disclosures: number;
  latam_companies: number;
  countries: number;
  refreshed_at: string;
};

/**
 * Reads the single platform_stats row; null when the view is empty. Errors propagate so the caller
 * can log the real cause (the marketing site falls back to words, never invented numbers).
 */
export async function getPlatformStats(): Promise<PlatformStats | null> {
  const [row] = await q<Record<string, unknown>>(sql`SELECT * FROM platform_stats LIMIT 1`);
  if (!row) return null;
  const num = (k: string) => Number(row[k] ?? 0);
  return {
    companies: num("companies"),
    people: num("people"),
    investors: num("investors"),
    transactions: num("transactions"),
    funding_rounds: num("funding_rounds"),
    talent_signals: num("talent_signals"),
    talent_signals_7d: num("talent_signals_7d"),
    rounds_30d: num("rounds_30d"),
    news_signals: num("news_signals"),
    news_sources: num("news_sources"),
    revenue_disclosures: num("revenue_disclosures"),
    latam_companies: num("latam_companies"),
    countries: num("countries"),
    refreshed_at: String(row.refreshed_at ?? ""),
  };
}

export async function getEntityNames(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const rows = await q<{ id: string; name: string }>(sql`
    SELECT id, name FROM companies WHERE id IN (${inList(ids)})
    UNION ALL SELECT id, full_name FROM people WHERE id IN (${inList(ids)})
    UNION ALL SELECT id, name FROM investors WHERE id IN (${inList(ids)})`);
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

/** Rows for a set of ids in the product's grid shape (lists, saved-search feeds). */
export async function getRowsByIds(product: Product, ids: string[]): Promise<Row[]> {
  if (!ids.length) return [];
  const meta = PRODUCT_META[product];
  const rows = await q(sql`SELECT ${sql.raw(SELECT[product])} FROM ${sql.raw(meta.table)} t ${sql.raw(meta.join ?? "")} WHERE t.id IN (${inList(ids)})`);
  await decorate(product, rows);
  const order = new Map(ids.map((id, i) => [id, i]));
  return rows.sort((a, b) => (order.get(String(a.id)) ?? 0) - (order.get(String(b.id)) ?? 0));
}

export { q as rawQuery };
