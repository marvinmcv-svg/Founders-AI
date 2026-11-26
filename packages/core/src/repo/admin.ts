/**
 * Internal admin (plan 7.14): disclosure (revenue anchor) review queue, pipeline monitor, model registry.
 * These are platform-wide (not org-scoped) and gated by PLATFORM_ADMIN_EMAILS (comma-separated).
 */
import { sql } from "drizzle-orm";
import { rawQuery as q } from "./entities";
import { ForbiddenError, NotFoundError } from "./workspace";

export type AdminContext = { email: string; userId: string };

export function isPlatformAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.PLATFORM_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.toLowerCase());
}

function assertAdmin(a: AdminContext) {
  if (!isPlatformAdmin(a.email)) throw new ForbiddenError("Platform admin only");
}

export type DisclosureRow = {
  id: string; company_id: string; company_name: string; amount_usd: number; type: string; period: string; source_url: string | null;
  publisher: string | null; published_at: string | null; status: string; origin: string; evidence: string | null; verified_by: string | null;
  reviewed_at: string | null; current_estimate_usd: number | null;
};

export function listDisclosures(a: AdminContext, status: "pending" | "verified" | "rejected" = "pending", limit = 100) {
  assertAdmin(a);
  return q<DisclosureRow>(sql`SELECT d.id, d.company_id, c.name AS company_name, d.amount_usd, d.type, d.period::text AS period, d.source_url, d.publisher,
      d.published_at, d.status, d.origin, d.evidence, d.verified_by, d.reviewed_at, c.est_revenue_usd AS current_estimate_usd
    FROM revenue_disclosures d JOIN companies c ON c.id = d.company_id
    WHERE d.status = ${status} ORDER BY COALESCE(d.published_at, d.created_at) DESC LIMIT ${limit}`);
}

export async function disclosureCounts(a: AdminContext) {
  assertAdmin(a);
  const rows = await q<{ status: string; n: number }>(sql`SELECT status, count(*)::int AS n FROM revenue_disclosures GROUP BY 1`);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
}

/**
 * Approve or reject an extracted anchor. Approved anchors are used by the next ML run (plan 9.6:
 * "LLM extraction → human verification queue → revenue_disclosures"); the company is queued for re-rating.
 */
export async function reviewDisclosure(a: AdminContext, id: string, decision: "verified" | "rejected", amountUsd?: number) {
  assertAdmin(a);
  const [d] = await q<{ company_id: string }>(sql`UPDATE revenue_disclosures SET status = ${decision}, verified_by = ${a.email}, reviewed_at = now(),
      amount_usd = COALESCE(${amountUsd ?? null}::bigint, amount_usd)
    WHERE id = ${id} AND status = 'pending' RETURNING company_id`);
  if (!d) throw new NotFoundError("Pending disclosure not found");
  if (decision === "verified") await q(sql`INSERT INTO outbox_events (product, entity_id, kind) VALUES ('companies', ${d.company_id}, 'UPDATED')`);
  return d;
}

export function recentPipelineRuns(a: AdminContext, limit = 40) {
  assertAdmin(a);
  return q<{ id: string; job: string; status: string; trigger: string; counts: Record<string, number> | null; error: string | null; started_at: string; finished_at: string | null }>(
    sql`SELECT id, job, status, trigger, counts, error, started_at, finished_at FROM pipeline_runs ORDER BY started_at DESC LIMIT ${limit}`,
  );
}

export function modelRegistry(a: AdminContext) {
  assertAdmin(a);
  return q<{ version: string; kind: string; active: boolean; metrics: Record<string, unknown> | null; created_at: string }>(
    sql`SELECT version, kind, active, metrics, created_at FROM model_versions ORDER BY kind, created_at DESC`,
  );
}

/** Rollback / roll forward = repoint the active version of a kind (plan 9.6). */
export async function activateModel(a: AdminContext, version: string) {
  assertAdmin(a);
  const [m] = await q<{ kind: string }>(sql`SELECT kind FROM model_versions WHERE version = ${version}`);
  if (!m) throw new NotFoundError("Model version not found");
  if (m.kind === "REVENUE") {
    const [has] = await q<{ n: number }>(sql`SELECT count(*)::int AS n FROM (SELECT 1 FROM company_estimates WHERE model_version = ${version} LIMIT 1) x`);
    if (!has?.n) throw new Error("No estimates stored for that version; it was pruned");
  }
  await q(sql`UPDATE model_versions SET active = (version = ${version}) WHERE kind = ${m.kind}`);
  if (m.kind === "REVENUE") {
    await q(sql`UPDATE companies c SET est_revenue_usd = e.revenue_p50, est_valuation_usd = e.valuation_p50
      FROM (SELECT DISTINCT ON (company_id) company_id, revenue_p50, valuation_p50 FROM company_estimates WHERE model_version = ${version}
            ORDER BY company_id, month DESC) e WHERE e.company_id = c.id`);
  }
}
