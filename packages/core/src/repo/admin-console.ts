/**
 * Internal admin console, the rest of plan 7.14: customer accounts & credits, the cross-workspace
 * API key approval queue, entity editor & merge tool, taxonomy manager, signal / classifier QA.
 * Platform-admin only (PLATFORM_ADMIN_EMAILS); every write is in the platform audit log, and
 * account changes also in the customer's own log.
 */
import { sql } from "drizzle-orm";
import { newId } from "../ids";
import { API_TRIAL_CREDITS } from "../limits";
import { assertPlatformAdmin, type AdminContext } from "./admin";
import { PLATFORM_ORG, recordAudit } from "./audit";
import { getBillingAccount } from "./billing";
import { grantCredits } from "./credits";
import { rawQuery as q } from "./entities";
import { NotFoundError } from "./workspace";

const audit = (a: AdminContext, action: string, target: string, metadata?: Record<string, unknown>) =>
  recordAudit({ orgId: PLATFORM_ORG, actor: a.email, actorType: "platform_admin", action, target, metadata });

/* ------------------------------------------------------------------ */
/* Customer accounts & credits                                         */
/* ------------------------------------------------------------------ */

export type AccountRow = {
  id: string; name: string; slug: string; plan: string; seats: number; members: number; balance: number; overage_limit: number;
  subscription_status: string | null; credits_30d: number; calls_30d: number; last_active: string | null; created_at: string;
};

export function listAccounts(a: AdminContext, search?: string) {
  assertPlatformAdmin(a);
  const s = search?.trim() ? `%${search.trim().replace(/[%_]/g, "")}%` : null;
  return q<AccountRow>(sql`SELECT o.id, o.name, o.slug, o.plan, o.seats, o.created_at,
      (SELECT count(*)::int FROM member m WHERE m.organization_id = o.id) AS members,
      COALESCE(b.balance, 0) AS balance, COALESCE(b.overage_limit, 0) AS overage_limit, ba.subscription_status,
      COALESCE(u.credits, 0)::int AS credits_30d, COALESCE(u.calls, 0)::int AS calls_30d, u.last_active
    FROM organization o
    LEFT JOIN credit_balances b ON b.org_id = o.id
    LEFT JOIN billing_accounts ba ON ba.org_id = o.id
    LEFT JOIN LATERAL (SELECT sum(credits) AS credits, count(*) AS calls, max(at) AS last_active FROM usage_events e
      WHERE e.org_id = o.id AND e.at > now() - interval '30 days') u ON true
    ${s ? sql`WHERE o.name ILIKE ${s} OR o.slug ILIKE ${s} OR o.id = ${search!.trim()}` : sql``}
    ORDER BY u.last_active DESC NULLS LAST, o.created_at DESC LIMIT 200`);
}

export async function getAccount(a: AdminContext, orgId: string) {
  assertPlatformAdmin(a);
  const [org] = await q<{ id: string; name: string; plan: string; seats: number; mcp_overage_enabled: boolean; require_sso: boolean; require_2fa: boolean; created_at: string }>(
    sql`SELECT id, name, plan, seats, mcp_overage_enabled, require_sso, require_2fa, created_at FROM organization WHERE id = ${orgId}`,
  );
  if (!org) throw new NotFoundError("Workspace not found");
  const [billing, members, keys, ledger, [bal]] = await Promise.all([
    getBillingAccount(orgId),
    q<{ name: string; email: string; role: string; two_factor_enabled: boolean | null }>(sql`SELECT u.name, u.email, m.role, u.two_factor_enabled FROM member m JOIN "user" u ON u.id = m.user_id WHERE m.organization_id = ${orgId} ORDER BY m.created_at`),
    q<{ id: string; name: string; prefix: string; status: string; scopes: string[]; created_at: string; last_used_at: string | null }>(sql`SELECT id, name, prefix, status, scopes, created_at, last_used_at FROM api_keys WHERE org_id = ${orgId} ORDER BY created_at DESC LIMIT 50`),
    q<{ delta: number; reason: string; operation: string | null; at: string }>(sql`SELECT delta, reason, operation, at FROM credit_ledger WHERE org_id = ${orgId} ORDER BY at DESC LIMIT 25`),
    q<{ balance: number; overage_limit: number }>(sql`SELECT balance, overage_limit FROM credit_balances WHERE org_id = ${orgId}`),
  ]);
  return { org, billing, members, keys, ledger, balance: bal?.balance ?? 0, overageLimit: bal?.overage_limit ?? 0 };
}

/** Manual credit adjustment (contracts, goodwill, corrections). Negative amounts debit. */
export async function adminAdjustCredits(a: AdminContext, orgId: string, amount: number, note: string) {
  assertPlatformAdmin(a);
  const n = Math.trunc(amount);
  if (!n || Math.abs(n) > 10_000_000) throw new Error("Amount must be a non-zero whole number");
  if (!note.trim()) throw new Error("A note is required");
  const [o] = await q(sql`SELECT 1 FROM organization WHERE id = ${orgId}`);
  if (!o) throw new NotFoundError("Workspace not found");
  await grantCredits(orgId, n, n > 0 ? "admin_grant" : "admin_debit");
  await audit(a, "account.credits.adjust", orgId, { amount: n, note: note.slice(0, 200) });
  await recordAudit({ orgId, actor: a.email, actorType: "platform_admin", action: "credits.adjust", target: String(n), metadata: { note: note.slice(0, 200) } });
}

export type AccountPatch = { plan?: string; seats?: number; periodCredits?: number; rolloverPct?: number; rolloverCap?: number; overageLimit?: number };

/** Contract terms for sales-led accounts (and corrections). Stripe-managed seats are overwritten by the next subscription event. */
export async function adminUpdateAccount(a: AdminContext, orgId: string, p: AccountPatch) {
  assertPlatformAdmin(a);
  const before = await getAccount(a, orgId);
  const int = (v: number | undefined, lo: number, hi: number) => (v === undefined || Number.isNaN(v) ? undefined : Math.max(lo, Math.min(hi, Math.trunc(v))));
  const seats = int(p.seats, Math.max(1, before.members.length), 10_000);
  const plan = p.plan && /^[a-z_]{2,20}$/.test(p.plan) ? p.plan : undefined;
  if (seats !== undefined || plan) await q(sql`UPDATE organization SET seats = COALESCE(${seats ?? null}::int, seats), plan = COALESCE(${plan ?? null}, plan) WHERE id = ${orgId}`);
  const periodCredits = int(p.periodCredits, 0, 100_000_000);
  const rolloverPct = int(p.rolloverPct, 0, 100);
  const rolloverCap = int(p.rolloverCap, 0, 100_000_000);
  await q(sql`UPDATE billing_accounts SET period_credits = COALESCE(${periodCredits ?? null}::int, period_credits),
      rollover_pct = COALESCE(${rolloverPct ?? null}::int, rollover_pct), rollover_cap = COALESCE(${rolloverCap ?? null}::int, rollover_cap), updated_at = now()
    WHERE org_id = ${orgId}`);
  const overage = int(p.overageLimit, 0, 10_000_000);
  if (overage !== undefined) {
    await q(sql`INSERT INTO credit_balances (org_id, balance, overage_limit) VALUES (${orgId}, 0, ${overage}) ON CONFLICT (org_id) DO UPDATE SET overage_limit = ${overage}`);
    await q(sql`UPDATE billing_accounts SET overage_enabled = ${overage > 0} WHERE org_id = ${orgId}`);
  }
  const changes = { plan, seats, periodCredits, rolloverPct, rolloverCap, overageLimit: overage };
  await audit(a, "account.update", orgId, changes);
  await recordAudit({ orgId, actor: a.email, actorType: "platform_admin", action: "account.terms.update", metadata: changes });
}

/* ------------------------------------------------------------------ */
/* API key approval queue (all workspaces)                             */
/* ------------------------------------------------------------------ */

export function listPendingApiKeys(a: AdminContext) {
  assertPlatformAdmin(a);
  return q<{ id: string; name: string; prefix: string; scopes: string[]; created_at: string; org_id: string; org_name: string; user_name: string | null; user_email: string | null }>(
    sql`SELECT k.id, k.name, k.prefix, k.scopes, k.created_at, k.org_id, o.name AS org_name, u.name AS user_name, u.email AS user_email
      FROM api_keys k JOIN organization o ON o.id = k.org_id LEFT JOIN "user" u ON u.id = k.user_id
      WHERE k.status = 'PENDING' ORDER BY k.created_at ASC LIMIT 200`,
  );
}

export async function adminReviewApiKey(a: AdminContext, keyId: string, decision: "ACTIVE" | "REVOKED") {
  assertPlatformAdmin(a);
  const [k] = await q<{ org_id: string }>(sql`UPDATE api_keys SET status = ${decision} WHERE id = ${keyId} AND status = 'PENDING' RETURNING org_id`);
  if (!k) throw new NotFoundError("Pending key not found");
  if (decision === "ACTIVE") {
    const [{ n } = { n: 0 }] = await q<{ n: number }>(sql`SELECT count(*)::int AS n FROM credit_ledger WHERE org_id = ${k.org_id} AND reason = 'api_trial'`);
    if (n === 0) await grantCredits(k.org_id, API_TRIAL_CREDITS, "api_trial");
  }
  await audit(a, decision === "ACTIVE" ? "api_key.approve" : "api_key.reject", keyId, { org: k.org_id });
  await recordAudit({ orgId: k.org_id, actor: a.email, actorType: "platform_admin", action: `api_key.${decision === "ACTIVE" ? "approve" : "reject"}`, target: keyId });
}

/* ------------------------------------------------------------------ */
/* Entity editor & merge                                               */
/* ------------------------------------------------------------------ */

export const COMPANY_EDITABLE = ["name", "domain", "tagline", "description", "founded_year", "hq_city", "hq_country", "operating_status", "employee_count"] as const;
export const PERSON_EDITABLE = ["full_name", "headline", "current_title", "current_company_name", "location", "country", "linkedin_url"] as const;
type CompanyField = (typeof COMPANY_EDITABLE)[number];
type PersonField = (typeof PERSON_EDITABLE)[number];

export async function getEntityForEdit(a: AdminContext, id: string) {
  assertPlatformAdmin(a);
  if (id.startsWith("com_")) {
    const [c] = await q(sql`SELECT id, ${sql.raw(COMPANY_EDITABLE.join(", "))}, aliases, provenance, deleted_at FROM companies WHERE id = ${id}`);
    if (!c) throw new NotFoundError("Company not found");
    return { kind: "company" as const, row: c, fields: COMPANY_EDITABLE as readonly string[] };
  }
  if (id.startsWith("per_")) {
    const [p] = await q(sql`SELECT id, ${sql.raw(PERSON_EDITABLE.join(", "))}, provenance, deleted_at FROM people WHERE id = ${id}`);
    if (!p) throw new NotFoundError("Person not found");
    return { kind: "person" as const, row: p, fields: PERSON_EDITABLE as readonly string[] };
  }
  throw new NotFoundError("Enter a company (com_…) or person (per_…) id");
}

/** Edit whitelisted fields; each edited field's provenance becomes `admin_edit` (still redistributable). */
export async function updateEntityFields(a: AdminContext, id: string, patch: Record<string, string | number | null>) {
  const { kind } = await getEntityForEdit(a, id);
  const allowed: readonly string[] = kind === "company" ? COMPANY_EDITABLE : PERSON_EDITABLE;
  const entries = Object.entries(patch).filter(([k]) => allowed.includes(k));
  if (!entries.length) throw new Error("Nothing to change");
  const ints = new Set<string>(["founded_year", "employee_count"]);
  const sets = entries.map(([k, v]) => {
    const val = v === "" || v === null ? null : ints.has(k) ? Math.trunc(Number(v)) : String(v).slice(0, 2000);
    if (ints.has(k) && val !== null && !Number.isFinite(val as number)) throw new Error(`${k} must be a number`);
    return sql`${sql.raw(k)} = ${val}`;
  });
  const prov = Object.fromEntries(entries.map(([k]) => [k, { source: "admin_edit", fetched_at: new Date().toISOString(), redistributable: true }]));
  const table = kind === "company" ? "companies" : "people";
  await q(sql`UPDATE ${sql.raw(table)} SET ${sql.join(sets, sql`, `)}, provenance = COALESCE(provenance, '{}'::jsonb) || ${JSON.stringify(prov)}::jsonb WHERE id = ${id}`);
  await q(sql`INSERT INTO outbox_events (product, entity_id, kind) VALUES (${kind === "company" ? "companies" : "people"}, ${id}, 'UPDATED')`);
  await audit(a, `entity.edit`, id, { fields: entries.map(([k]) => k) as (CompanyField | PersonField)[] });
}

/** Rows that point at an entity id, moved by merges. ON CONFLICT-prone tables are handled with deletes of duplicates first. */
const COMPANY_REFS: [string, string][] = [
  ["company_people", "company_id"], ["person_experience", "company_id"], ["funding_rounds", "company_id"], ["acquisitions", "acquirer_id"], ["acquisitions", "target_id"],
  ["ipos", "company_id"], ["news_signals", "company_id"], ["revenue_disclosures", "company_id"], ["talent_signals", "new_company_id"], ["people", "current_company_id"],
  ["interest_signals", "target_company_id"], ["company_competitors", "company_id"], ["company_competitors", "competitor_id"],
];
const PERSON_REFS: [string, string][] = [
  ["person_emails", "person_id"], ["person_experience", "person_id"], ["person_education", "person_id"], ["company_people", "person_id"], ["talent_signals", "person_id"],
  ["person_changes", "person_id"], ["network_edges", "person_id"], ["investors", "person_id"], ["interest_signals", "target_person_id"],
];
const ENTITY_REFS = ["list_items", "notes", "likes", "hides", "entity_status", "crm_records", "highlight_events"];

/** Move one table's references row by row, so a unique clash only drops that duplicate (the survivor already has it). */
async function moveRefs(table: string, col: string, from: string, to: string) {
  const rows = await q<{ ctid: string }>(sql`SELECT ctid::text AS ctid FROM ${sql.raw(table)} WHERE ${sql.raw(col)} = ${from}`);
  let moved = 0;
  for (const r of rows) {
    try {
      await q(sql`UPDATE ${sql.raw(table)} SET ${sql.raw(col)} = ${to} WHERE ctid = ${r.ctid}::tid`);
      moved++;
    } catch (e) {
      const code = (e as { code?: string }).code ?? (e as { cause?: { code?: string } }).cause?.code;
      if (code !== "23505") throw e;
      await q(sql`DELETE FROM ${sql.raw(table)} WHERE ctid = ${r.ctid}::tid`);
    }
  }
  return moved;
}

/**
 * Merge `dropId` into `keepId` (same kind): every reference moves to the survivor, the dropped
 * record's name/domain become aliases, and it is soft-deleted. Both ids are re-published.
 */
export async function mergeEntities(a: AdminContext, keepId: string, dropId: string) {
  assertPlatformAdmin(a);
  if (keepId === dropId) throw new Error("Pick two different records");
  const kind = keepId.slice(0, 4);
  if (kind !== dropId.slice(0, 4) || !["com_", "per_"].includes(kind)) throw new Error("Both ids must be companies (com_) or both people (per_)");
  const table = kind === "com_" ? "companies" : "people";
  const both = await q<{ id: string; deleted_at: string | null }>(sql`SELECT id, deleted_at FROM ${sql.raw(table)} WHERE id IN (${keepId}, ${dropId})`);
  if (both.length !== 2) throw new NotFoundError("Both records must exist");
  if (both.some((r) => r.deleted_at)) throw new Error("One of the records is already deleted or merged");
  const moved: Record<string, number> = {};
  for (const [t, c] of kind === "com_" ? COMPANY_REFS : PERSON_REFS) moved[`${t}.${c}`] = await moveRefs(t, c, dropId, keepId);
  for (const t of ENTITY_REFS) moved[`${t}.entity_id`] = await moveRefs(t, "entity_id", dropId, keepId);
  if (kind === "com_") {
    await q(sql`UPDATE talent_signals SET prev_company_ids = array_replace(prev_company_ids, ${dropId}, ${keepId}) WHERE ${dropId} = ANY(prev_company_ids)`);
    await q(sql`UPDATE companies k SET aliases = (SELECT array_agg(DISTINCT x) FROM unnest(k.aliases || d.aliases || ARRAY[d.name]) x WHERE x <> k.name),
        domain_aliases = (SELECT array_agg(DISTINCT x) FROM unnest(COALESCE(k.domain_aliases, '{}') || COALESCE(d.domain_aliases, '{}') || ARRAY[d.domain]) x WHERE x <> k.domain)
      FROM companies d WHERE k.id = ${keepId} AND d.id = ${dropId}`);
    await q(sql`DELETE FROM company_competitors WHERE company_id = competitor_id`);
    await q(sql`UPDATE companies SET deleted_at = now() WHERE id = ${dropId}`);
  } else {
    await q(sql`UPDATE people SET deleted_at = now() WHERE id = ${dropId}`);
  }
  await q(sql`INSERT INTO outbox_events (product, entity_id, kind) VALUES (${table}, ${keepId}, 'UPDATED'), (${table}, ${dropId}, 'DELETED')`);
  await audit(a, "entity.merge", keepId, { merged: dropId, moved: Object.fromEntries(Object.entries(moved).filter(([, n]) => n > 0)) });
  return moved;
}

/** Likely duplicates for the merge tool: same normalised domain, or same name with a different id. */
export function duplicateCandidates(a: AdminContext, limit = 30) {
  assertPlatformAdmin(a);
  return q<{ keep_id: string; keep_name: string; drop_id: string; drop_name: string; reason: string }>(sql`
    SELECT * FROM (
      SELECT a.id AS keep_id, a.name AS keep_name, b.id AS drop_id, b.name AS drop_name, 'same domain' AS reason
      FROM companies a JOIN companies b ON lower(a.domain) = lower(b.domain) AND a.id < b.id
      WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL
      UNION ALL
      SELECT a.id, a.name, b.id, b.name, 'same name'
      FROM companies a JOIN companies b ON lower(a.name) = lower(b.name) AND a.id < b.id AND lower(a.domain) <> lower(b.domain)
      WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL
      UNION ALL
      SELECT a.id, a.name, b.id, b.name, 'same domain label, similar name'
      FROM companies a JOIN companies b ON split_part(lower(a.domain), '.', 1) = split_part(lower(b.domain), '.', 1) AND a.id < b.id
        AND lower(a.domain) <> lower(b.domain) AND lower(a.name) <> lower(b.name) AND similarity(a.name, b.name) > 0.5
      WHERE a.deleted_at IS NULL AND b.deleted_at IS NULL
    ) x LIMIT ${limit}`);
}

/* ------------------------------------------------------------------ */
/* Taxonomy manager                                                    */
/* ------------------------------------------------------------------ */

export function listTaxonomy(a: AdminContext, kind?: string) {
  assertPlatformAdmin(a);
  return q<{ id: string; kind: string; name: string; slug: string; parent_id: string | null; path: string | null; companies: number }>(sql`
    SELECT t.id, t.kind, t.name, t.slug, t.parent_id, t.path,
      (SELECT count(*)::int FROM companies c WHERE c.deleted_at IS NULL AND (c.sector_id = t.id OR t.id = ANY(c.industry_ids) OR t.id = ANY(c.tech_vertical_ids))) AS companies
    FROM taxonomy_nodes t ${kind ? sql`WHERE t.kind = ${kind}` : sql``} ORDER BY t.kind, t.path NULLS FIRST, t.name LIMIT 1000`);
}

/** Rename a node (label only: ids and slugs stay stable for saved searches and the API). */
export async function renameTaxonomyNode(a: AdminContext, id: string, name: string) {
  assertPlatformAdmin(a);
  const n = name.trim();
  if (n.length < 2 || n.length > 80) throw new Error("Name must be 2–80 characters");
  const [r] = await q<{ name: string }>(sql`UPDATE taxonomy_nodes t SET name = ${n} FROM (SELECT name FROM taxonomy_nodes WHERE id = ${id}) old WHERE t.id = ${id} RETURNING old.name`);
  if (!r) throw new NotFoundError("Taxonomy node not found");
  await audit(a, "taxonomy.rename", id, { from: r.name, to: n });
}

/* ------------------------------------------------------------------ */
/* Signal & classifier QA                                              */
/* ------------------------------------------------------------------ */

export type QaKind = "TALENT" | "NEWS";

/** Unreviewed signals, newest first, with what the model said. */
export async function qaQueue(a: AdminContext, kind: QaKind, limit = 25) {
  assertPlatformAdmin(a);
  if (kind === "TALENT")
    return q<{ id: string; label: string; score: number; summary: string; date: string; subject: string }>(sql`
      SELECT s.id, s.type AS label, s.score, s.summary, s.signal_date AS date, p.full_name AS subject
      FROM talent_signals s JOIN people p ON p.id = s.person_id
      WHERE NOT EXISTS (SELECT 1 FROM signal_reviews r WHERE r.kind = 'TALENT' AND r.signal_id = s.id)
      ORDER BY s.signal_date DESC LIMIT ${limit}`);
  return q<{ id: string; label: string; score: number; summary: string; date: string; subject: string }>(sql`
    SELECT s.id, s.category AS label, s.score, s.summary, s.published_at AS date, c.name AS subject
    FROM news_signals s JOIN companies c ON c.id = s.company_id
    WHERE NOT EXISTS (SELECT 1 FROM signal_reviews r WHERE r.kind = 'NEWS' AND r.signal_id = s.id)
    ORDER BY s.published_at DESC LIMIT ${limit}`);
}

export async function qaLabels(kind: QaKind) {
  if (kind === "TALENT") return (await q<{ v: string }>(sql`SELECT DISTINCT type AS v FROM talent_signals ORDER BY 1`)).map((r) => r.v);
  return (await q<{ v: string }>(sql`SELECT DISTINCT category AS v FROM news_signals ORDER BY 1`)).map((r) => r.v);
}

/** Record a verdict. A correction relabels the signal (type / category) and is re-published. */
export async function reviewSignal(a: AdminContext, kind: QaKind, signalId: string, verdict: "CORRECT" | "WRONG", corrected?: string | null, note?: string) {
  assertPlatformAdmin(a);
  const [s] =
    kind === "TALENT"
      ? await q<{ label: string }>(sql`SELECT type AS label FROM talent_signals WHERE id = ${signalId}`)
      : await q<{ label: string }>(sql`SELECT category AS label FROM news_signals WHERE id = ${signalId}`);
  if (!s) throw new NotFoundError("Signal not found");
  const fix = verdict === "WRONG" && corrected && corrected !== s.label ? corrected : null;
  if (fix && !(await qaLabels(kind)).includes(fix)) throw new Error("Unknown label");
  await q(sql`INSERT INTO signal_reviews (id, kind, signal_id, verdict, original_label, corrected_label, note, reviewer)
    VALUES (${newId("event")}, ${kind}, ${signalId}, ${verdict}, ${s.label}, ${fix}, ${note?.slice(0, 500) ?? null}, ${a.email})
    ON CONFLICT (kind, signal_id) DO UPDATE SET verdict = EXCLUDED.verdict, corrected_label = EXCLUDED.corrected_label, note = EXCLUDED.note, reviewer = EXCLUDED.reviewer, at = now()`);
  if (fix) {
    if (kind === "TALENT") await q(sql`UPDATE talent_signals SET type = ${fix} WHERE id = ${signalId}`);
    else await q(sql`UPDATE news_signals SET category = ${fix} WHERE id = ${signalId}`);
    await q(sql`INSERT INTO outbox_events (product, entity_id, kind) VALUES (${kind === "TALENT" ? "talent_signals" : "news_signals"}, ${signalId}, 'UPDATED')`);
  }
  await audit(a, `qa.${kind.toLowerCase()}`, signalId, { verdict, corrected: fix });
}

/** Precision on the human-reviewed sample, per label (the H15 labelled set grows from here). */
export async function qaStats(a: AdminContext) {
  assertPlatformAdmin(a);
  return q<{ kind: string; label: string; reviewed: number; correct: number; precision: number }>(sql`
    SELECT kind, original_label AS label, count(*)::int AS reviewed, count(*) FILTER (WHERE verdict = 'CORRECT')::int AS correct,
      round(count(*) FILTER (WHERE verdict = 'CORRECT')::numeric / count(*), 3)::float AS precision
    FROM signal_reviews GROUP BY 1, 2 ORDER BY 1, 3 DESC`);
}
