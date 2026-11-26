/**
 * Highlights v2 job (daily). Features in SQL → pure rules (core/signals/highlights) → diff →
 * bulk update + highlight_events history → outbox UPDATED for changed entities.
 * First run per entity type writes a baseline (history without "new" flags), so a rule change
 * is never reported to users as a real-world change.
 */
import {
  companyHighlights,
  COMPUTED_PERSON_HIGHLIGHTS,
  diffHighlights,
  HIGHLIGHT_THRESHOLDS,
  investorHighlights,
  mergeHighlights,
  percentileRanks,
  personHighlights,
} from "@founders/core/signals/highlights";
import { COMPANY_HIGHLIGHTS, INVESTOR_HIGHLIGHTS, MAJOR_EMPLOYERS } from "@founders/core/taxonomy";
import { pg } from "../db";
import { emit } from "../outbox";
import type { JobContext, JobDef } from "../runner";

type EntityType = "COMPANY" | "PERSON" | "INVESTOR";
type Change = { id: string; next: string[]; added: string[]; removed: string[] };

async function isBaseline(type: EntityType): Promise<boolean> {
  const [r] = await pg()<{ n: number }[]>`SELECT count(*)::int AS n FROM (SELECT 1 FROM highlight_events WHERE entity_type = ${type} LIMIT 1) x`;
  return (r?.n ?? 0) === 0;
}

/** Persist changes: highlights column, history rows, outbox. */
async function apply(ctx: JobContext, type: EntityType, table: "companies" | "people" | "investors", changes: Change[], baseline: boolean) {
  const sql = pg();
  const BATCH = 5000;
  for (let i = 0; i < changes.length; i += BATCH) {
    const chunk = changes.slice(i, i + BATCH);
    const payload = chunk.map((c) => ({ id: c.id, h: c.next }));
    await sql`UPDATE ${sql(table)} t SET highlights = ARRAY(SELECT jsonb_array_elements_text(x.h))
      FROM jsonb_to_recordset(${sql.json(payload)}) AS x(id text, h jsonb) WHERE t.id = x.id`;
    const added = chunk.flatMap((c) => c.added.map((h) => ({ id: c.id, h })));
    const removed = chunk.flatMap((c) => c.removed.map((h) => ({ id: c.id, h })));
    if (added.length) {
      // Baseline rows are back-dated beyond the "new" window so they never surface as new.
      const at = baseline ? new Date(Date.now() - 365 * 86_400_000) : new Date();
      await sql`INSERT INTO highlight_events (entity_id, entity_type, highlight, added_at)
        SELECT x.id, ${type}, x.h, ${at} FROM jsonb_to_recordset(${sql.json(added)}) AS x(id text, h text) ON CONFLICT DO NOTHING`;
    }
    if (removed.length) {
      await sql`UPDATE highlight_events e SET removed_at = now() FROM jsonb_to_recordset(${sql.json(removed)}) AS x(id text, h text)
        WHERE e.entity_id = x.id AND e.highlight = x.h AND e.removed_at IS NULL`;
    }
  }
  ctx.count(`${table}_changed`, changes.length);
  ctx.count(`${table}_highlights_added`, changes.reduce((a, c) => a + c.added.length, 0));
  ctx.count(`${table}_highlights_removed`, changes.reduce((a, c) => a + c.removed.length, 0));
  if (!baseline) {
    const product = table;
    await emit(product, changes.filter((c) => c.added.length).map((c) => c.id), "UPDATED");
  }
}

function collect(id: string, previous: string[], next: string[], baseline: boolean): Change | null {
  const d = diffHighlights(previous, next);
  // Baseline: every current highlight gets a history row even if unchanged.
  if (baseline) return { id, next, added: next, removed: [] };
  if (!d.added.length && !d.removed.length) return null;
  return { id, next, ...d };
}

async function companies(ctx: JobContext) {
  const sql = pg();
  const baseline = await isBaseline("COMPANY");
  const rows = await sql<{
    id: string; growth_stage: string; employee_count: number | null; headcount_growth_3m: number | null; web_visits: number | null;
    web_visits_growth_3m: number | null; social_growth_3m: number | null; bootstrapped: boolean; days_since: number | null;
    tier1: boolean; accel: boolean; highlights: string[];
  }[]>`
    WITH inv AS (
      SELECT fr.company_id,
        bool_or('Tier-1' = ANY(i.highlights)) AS tier1,
        bool_or(i.type = 'Accelerator') AS accel
      FROM funding_rounds fr JOIN round_investors ri ON ri.round_id = fr.id JOIN investors i ON i.id = ri.investor_id
      GROUP BY fr.company_id
    )
    SELECT c.id, c.growth_stage, c.employee_count, c.headcount_growth_3m, c.web_visits, c.web_visits_growth_3m, c.social_growth_3m,
      c.bootstrapped, (current_date - c.last_funding_date)::int AS days_since,
      COALESCE(inv.tier1, false) AS tier1, COALESCE(inv.accel, false) AS accel, c.highlights
    FROM companies c LEFT JOIN inv ON inv.company_id = c.id WHERE c.deleted_at IS NULL`;
  const pct = percentileRanks(rows, (r) => r.growth_stage, (r) => r.headcount_growth_3m);
  const changes: Change[] = [];
  for (const r of rows) {
    const computed = companyHighlights({
      employeeCount: r.employee_count,
      headcountGrowth3m: r.headcount_growth_3m,
      headcountGrowthStagePct: pct.get(r) ?? null,
      webVisits: r.web_visits,
      webVisitsGrowth3m: r.web_visits_growth_3m,
      socialGrowth3m: r.social_growth_3m,
      hasTier1Investor: r.tier1,
      hasAccelerator: r.accel,
      daysSinceLastRound: r.days_since,
      bootstrapped: r.bootstrapped,
    });
    const next = mergeHighlights(r.highlights, computed, COMPANY_HIGHLIGHTS);
    const ch = collect(r.id, r.highlights, next, baseline);
    if (ch) changes.push(ch);
  }
  ctx.log(`companies: ${rows.length} scored, ${changes.length} changed${baseline ? " (baseline)" : ""}`);
  await apply(ctx, "COMPANY", "companies", changes, baseline);
  // new_highlights = highlights with an open history row added inside the window.
  await sql`UPDATE companies c SET new_highlights = COALESCE(n.h, '{}') FROM (
      SELECT c2.id, array_agg(e.highlight ORDER BY e.highlight) FILTER (WHERE e.highlight IS NOT NULL) AS h
      FROM companies c2 LEFT JOIN highlight_events e ON e.entity_id = c2.id AND e.removed_at IS NULL
        AND e.added_at > now() - make_interval(days => ${HIGHLIGHT_THRESHOLDS.newWindowDays})
      GROUP BY c2.id) n
    WHERE n.id = c.id AND c.new_highlights IS DISTINCT FROM COALESCE(n.h, '{}')`;
}

async function people(ctx: JobContext) {
  const sql = pg();
  const baseline = await isBaseline("PERSON");
  const rows = await sql<{
    id: string; highlights: string[]; founder_roles: number; founded_acquired: boolean; founded_ipo: boolean; major: boolean;
    top_uni: boolean; conn_pct: number | null; foll_pct: number | null; stealth: boolean; repeat_cof: boolean;
  }[]>`
    WITH fx AS (
      SELECT pe.person_id,
        count(*) FILTER (WHERE pe.is_founder)::int AS founder_roles,
        bool_or(pe.is_founder AND pe.company_id IN (SELECT target_id FROM acquisitions)) AS founded_acquired,
        bool_or(pe.is_founder AND pe.company_id IN (SELECT company_id FROM ipos)) AS founded_ipo,
        bool_or(pe.company_name = ANY(${[...MAJOR_EMPLOYERS]}::text[])) AS major
      FROM person_experience pe GROUP BY pe.person_id
    ),
    cof AS (
      SELECT DISTINCT a.person_id FROM person_experience a
      JOIN person_experience b ON b.company_id = a.company_id AND b.is_founder AND b.person_id <> a.person_id
      WHERE a.is_founder AND a.company_id IS NOT NULL
      GROUP BY a.person_id, b.person_id HAVING count(DISTINCT a.company_id) >= 2
    ),
    uni AS (SELECT DISTINCT pe.person_id FROM person_education pe JOIN schools s ON s.id = pe.school_id WHERE s.tier = 1),
    stl AS (SELECT DISTINCT person_id FROM talent_signals WHERE status = 'STEALTH'
      AND signal_date >= current_date - ${HIGHLIGHT_THRESHOLDS.person.stealthDays}::int)
    SELECT p.id, p.highlights,
      COALESCE(fx.founder_roles, 0) AS founder_roles, COALESCE(fx.founded_acquired, false) AS founded_acquired,
      COALESCE(fx.founded_ipo, false) AS founded_ipo, COALESCE(fx.major, false) AS major,
      uni.person_id IS NOT NULL AS top_uni,
      CASE WHEN p.connections IS NULL THEN NULL ELSE percent_rank() OVER (ORDER BY p.connections NULLS FIRST) END AS conn_pct,
      CASE WHEN p.followers IS NULL THEN NULL ELSE percent_rank() OVER (ORDER BY p.followers NULLS FIRST) END AS foll_pct,
      stl.person_id IS NOT NULL AS stealth, cof.person_id IS NOT NULL AS repeat_cof
    FROM people p
    LEFT JOIN fx ON fx.person_id = p.id
    LEFT JOIN uni ON uni.person_id = p.id
    LEFT JOIN stl ON stl.person_id = p.id
    LEFT JOIN cof ON cof.person_id = p.id
    WHERE p.deleted_at IS NULL`;
  const changes: Change[] = [];
  for (const r of rows) {
    const computed = personHighlights({
      founderRoles: r.founder_roles,
      foundedAcquired: r.founded_acquired,
      foundedIpo: r.founded_ipo,
      majorEmployer: r.major,
      topUniversity: r.top_uni,
      connectionsPct: r.conn_pct,
      followersPct: r.foll_pct,
      recentStealthSignal: r.stealth,
      repeatCofounder: r.repeat_cof,
    });
    const next = mergeHighlights(r.highlights, computed, COMPUTED_PERSON_HIGHLIGHTS);
    const ch = collect(r.id, r.highlights, next, baseline);
    if (ch) changes.push(ch);
  }
  ctx.log(`people: ${rows.length} scored, ${changes.length} changed${baseline ? " (baseline)" : ""}`);
  await apply(ctx, "PERSON", "people", changes, baseline);
}

async function investors(ctx: JobContext) {
  const sql = pg();
  const baseline = await isBaseline("INVESTOR");
  const rows = await sql<{ id: string; highlights: string[]; leads_count: number; follow_on_rate: number | null; deals_12m: number; max_val: number | null }[]>`
    WITH d AS (
      SELECT ri.investor_id,
        count(DISTINCT fr.id) FILTER (WHERE fr.announced_date >= current_date - 365)::int AS deals_12m,
        max(GREATEST(COALESCE(c.post_money_valuation_usd, 0), COALESCE(c.est_valuation_usd, 0))) AS max_val
      FROM round_investors ri JOIN funding_rounds fr ON fr.id = ri.round_id JOIN companies c ON c.id = fr.company_id
      GROUP BY ri.investor_id
    )
    SELECT i.id, i.highlights, i.leads_count, i.follow_on_rate, COALESCE(d.deals_12m, 0) AS deals_12m, d.max_val
    FROM investors i LEFT JOIN d ON d.investor_id = i.id WHERE i.deleted_at IS NULL`;
  const changes: Change[] = [];
  for (const r of rows) {
    const computed = investorHighlights({
      curatedTier1: r.highlights.includes("Tier-1"),
      leadsCount: r.leads_count,
      deals12m: r.deals_12m,
      followOnRate: r.follow_on_rate,
      maxPortfolioValuationUsd: r.max_val,
    });
    const next = mergeHighlights(r.highlights, computed, INVESTOR_HIGHLIGHTS);
    const ch = collect(r.id, r.highlights, next, baseline);
    if (ch) changes.push(ch);
  }
  ctx.log(`investors: ${rows.length} scored, ${changes.length} changed${baseline ? " (baseline)" : ""}`);
  await apply(ctx, "INVESTOR", "investors", changes, baseline);
}

export const highlightsJob: JobDef = {
  name: "highlights",
  description: "Recompute company, person and investor highlights (v2) and the 30-day new_highlights window",
  async run(ctx) {
    const only = ctx.options.only ? String(ctx.options.only) : null;
    if (!only || only === "companies") await companies(ctx);
    if (!only || only === "people") await people(ctx);
    if (!only || only === "investors") await investors(ctx);
  },
};
