/**
 * Audit log v2 (plan 14.4). One `recordAudit()` for workspace and platform actions.
 *
 * Rows are append-only (a trigger refuses UPDATE/DELETE, migration 0009) and hash-chained per org:
 * `hash = sha256(prev_hash | canonical(row))`, `seq` = 1, 2, 3 … So a row edited or removed outside
 * the sanctioned maintenance path breaks `verifyAuditChain`. Appends are serialised per org by a
 * transaction-scoped advisory lock (works through the transaction pooler); the unique (org_id, seq)
 * index is the backstop.
 */
import { sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { newId } from "../ids";
import { getDb } from "@founders/db";
import { rawQuery as q } from "./entities";
import { ForbiddenError, type OrgContext } from "./workspace";

export type AuditActorType = "user" | "api_key" | "scim" | "system" | "platform_admin" | "stripe";

export type AuditInput = {
  orgId: string;
  actor: string;
  actorType?: AuditActorType;
  action: string;
  target?: string | null;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
};

/** Platform-wide (internal admin) actions live under this pseudo org. */
export const PLATFORM_ORG = "platform";

type ChainRow = { seq: number; hash: string };

/** Stable JSON: keys sorted at every level, so the hash does not depend on key order. */
function canonical(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .filter((k) => o[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

export function auditHash(prevHash: string | null, row: { orgId: string; seq: number; actor: string; actorType: string; action: string; target: string | null; metadata: unknown; at: string }) {
  const body = canonical([row.orgId, row.seq, row.actor, row.actorType, row.action, row.target, row.metadata ?? null, row.at]);
  return createHash("sha256").update(`${prevHash ?? ""}|${body}`).digest("hex");
}

/** Keep metadata small and free of secrets: drop obviously sensitive keys, cap strings. */
function scrub(meta: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!meta) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (/secret|token|password|key$|authorization/i.test(k)) continue;
    out[k] = typeof v === "string" ? v.slice(0, 500) : v;
  }
  return out;
}

export async function recordAudit(input: AuditInput): Promise<{ id: string; seq: number }> {
  const actorType = input.actorType ?? "user";
  const target = input.target ?? null;
  const metadata = scrub(input.metadata);
  const id = newId("audit");
  // One transaction per append, serialised per org by an advisory lock, so the chain has no forks.
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`audit:${input.orgId}`}))`);
    const [prev] = (await tx.execute(sql`SELECT seq::int AS seq, hash FROM audit_log WHERE org_id = ${input.orgId} AND seq IS NOT NULL ORDER BY seq DESC LIMIT 1`)) as unknown as ChainRow[];
    const seq = (prev?.seq ?? 0) + 1;
    const at = new Date().toISOString();
    const hash = auditHash(prev?.hash ?? null, { orgId: input.orgId, seq, actor: input.actor, actorType, action: input.action, target, metadata, at });
    await tx.execute(sql`INSERT INTO audit_log (id, org_id, actor, actor_type, action, target, metadata, ip, user_agent, seq, prev_hash, hash, at)
      VALUES (${id}, ${input.orgId}, ${input.actor}, ${actorType}, ${input.action}, ${target}, ${metadata ? JSON.stringify(metadata) : null}::jsonb,
        ${input.ip?.slice(0, 64) ?? null}, ${input.userAgent?.slice(0, 300) ?? null}, ${seq}, ${prev?.hash ?? null}, ${hash}, ${at}::timestamptz)`);
    return { id, seq };
  });
}

export type AuditRow = {
  id: string;
  actor: string;
  actor_type: string;
  actor_name: string | null;
  action: string;
  target: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  seq: number | null;
  at: string;
};

export type AuditFilter = { action?: string; actor?: string; from?: string; to?: string; limit?: number; before?: string };

function assertAuditReader(ctx: OrgContext) {
  if (ctx.role !== "admin" && ctx.role !== "owner") throw new ForbiddenError("Only workspace admins can read the audit log");
}

function auditWhere(orgId: string, f: AuditFilter) {
  return sql`a.org_id = ${orgId}
    ${f.action ? sql`AND a.action LIKE ${`${f.action.replace(/[%_]/g, "")}%`}` : sql``}
    ${f.actor ? sql`AND (a.actor = ${f.actor} OR u.email ILIKE ${`%${f.actor.replace(/[%_]/g, "")}%`})` : sql``}
    ${f.from ? sql`AND a.at >= ${f.from}::timestamptz` : sql``}
    ${f.to ? sql`AND a.at < (${f.to}::date + 1)` : sql``}
    ${f.before ? sql`AND a.at < ${f.before}::timestamptz` : sql``}`;
}

function readAudit(orgId: string, f: AuditFilter) {
  const limit = Math.min(Math.max(f.limit ?? 100, 1), 5000);
  return q<AuditRow>(sql`SELECT a.id, a.actor, a.actor_type, u.name AS actor_name, a.action, a.target, a.metadata, a.ip, a.seq::int AS seq, a.at
    FROM audit_log a LEFT JOIN "user" u ON u.id = a.actor
    WHERE ${auditWhere(orgId, f)} ORDER BY a.at DESC, a.seq DESC NULLS LAST LIMIT ${limit}`);
}

/** Settings → Audit log (workspace admins only). */
export async function listAudit(ctx: OrgContext, f: AuditFilter = {}) {
  assertAuditReader(ctx);
  return readAudit(ctx.orgId, f);
}

export async function auditActions(ctx: OrgContext) {
  assertAuditReader(ctx);
  const rows = await q<{ action: string }>(sql`SELECT DISTINCT action FROM audit_log WHERE org_id = ${ctx.orgId} ORDER BY 1 LIMIT 300`);
  return rows.map((r) => r.action);
}

const csvCell = (v: unknown) => {
  let s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // CSV injection guard (plan 14.4)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function auditCsv(ctx: OrgContext, f: AuditFilter = {}) {
  assertAuditReader(ctx);
  const rows = await readAudit(ctx.orgId, { ...f, limit: f.limit ?? 5000 });
  const head = ["at", "seq", "actor", "actor_name", "actor_type", "action", "target", "ip", "metadata"];
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
  const lines = rows.map((r) => [iso(r.at as unknown), r.seq, r.actor, r.actor_name, r.actor_type, r.action, r.target, r.ip, r.metadata].map(csvCell).join(","));
  return [head.join(","), ...lines].join("\n");
}

export type ChainCheck = { ok: boolean; rows: number; legacy: number; brokenAt?: number; reason?: string };

/** Recompute the chain for an org. Legacy rows (before migration 0009) have no seq and are counted, not checked. */
export async function verifyAuditChain(orgId: string): Promise<ChainCheck> {
  const rows = await q<{ seq: number | null; actor: string; actor_type: string; action: string; target: string | null; metadata: unknown; at: Date | string; prev_hash: string | null; hash: string | null }>(
    sql`SELECT seq::int AS seq, actor, actor_type, action, target, metadata, at, prev_hash, hash FROM audit_log WHERE org_id = ${orgId} ORDER BY seq NULLS FIRST`,
  );
  let legacy = 0;
  let prev: string | null = null;
  let expectSeq = 1;
  for (const r of rows) {
    if (r.seq == null) {
      legacy++;
      continue;
    }
    if (r.seq !== expectSeq) return { ok: false, rows: rows.length, legacy, brokenAt: expectSeq, reason: `missing row ${expectSeq}` };
    if ((r.prev_hash ?? null) !== prev) return { ok: false, rows: rows.length, legacy, brokenAt: r.seq, reason: "prev_hash mismatch" };
    const at = r.at instanceof Date ? r.at.toISOString() : new Date(r.at).toISOString();
    const h = auditHash(prev, { orgId, seq: r.seq, actor: r.actor, actorType: r.actor_type, action: r.action, target: r.target, metadata: r.metadata, at });
    if (h !== r.hash) return { ok: false, rows: rows.length, legacy, brokenAt: r.seq, reason: "hash mismatch (row edited)" };
    prev = r.hash;
    expectSeq++;
  }
  return { ok: true, rows: rows.length, legacy };
}
