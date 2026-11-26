/**
 * Credit engine (plan 14.2). One `charge()` for app exports, email reveals, API, MCP and agent.
 * Atomic decrement → ledger row → usage_events row. Misses are free.
 */
import { sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { newId } from "../ids";
import { API_TRIAL_CREDITS } from "../limits";
import { rawQuery as q } from "./entities";
import { NotFoundError, type OrgContext } from "./workspace";

export type Surface = "API" | "MCP" | "APP" | "EXT" | "AGENT";

export class InsufficientCreditsError extends Error {
  constructor(
    public needed: number,
    public balance: number,
  ) {
    super(`This request needs ${needed} credits but the workspace has ${balance}. Ask an admin to top up.`);
    this.name = "InsufficientCreditsError";
  }
}

export async function getBalance(orgId: string): Promise<number> {
  const [r] = await q<{ balance: number }>(sql`SELECT balance FROM credit_balances WHERE org_id = ${orgId}`);
  return r?.balance ?? 0;
}

export async function grantCredits(orgId: string, amount: number, reason: string) {
  await q(sql`INSERT INTO credit_balances (org_id, balance) VALUES (${orgId}, ${amount})
    ON CONFLICT (org_id) DO UPDATE SET balance = credit_balances.balance + ${amount}`);
  await q(sql`INSERT INTO credit_ledger (id, org_id, delta, reason) VALUES (${newId("ledger")}, ${orgId}, ${amount}, ${reason})`);
}

export type ChargeInput = {
  orgId: string;
  actorType: "user" | "api_key" | "mcp_client";
  actorId: string;
  surface: Surface;
  operation: string;
  credits: number;
  matched: boolean;
  requestId?: string;
  latencyMs?: number;
};

/** Pre-flight check without charging (returns 402-able error). Counts the overage allowance. */
export async function assertCredits(orgId: string, credits: number) {
  if (credits <= 0) return;
  const [r] = await q<{ balance: number; overage_limit: number }>(sql`SELECT balance, overage_limit FROM credit_balances WHERE org_id = ${orgId}`);
  const balance = r?.balance ?? 0;
  if (balance + (r?.overage_limit ?? 0) < credits) throw new InsufficientCreditsError(credits, balance);
}

/** Charge atomically. Returns the remaining balance. Misses and zero-cost ops only log usage. */
export async function charge(input: ChargeInput): Promise<{ charged: number; remaining: number }> {
  const credits = input.matched ? Math.max(0, Math.floor(input.credits)) : 0;
  let remaining: number;
  if (credits > 0) {
    // Overage (plan 14.1): the balance may go down to −overage_limit (0 unless an admin turned overage on).
    const rows = await q<{ balance: number }>(sql`UPDATE credit_balances SET balance = balance - ${credits}
      WHERE org_id = ${input.orgId} AND balance - ${credits} >= -overage_limit RETURNING balance`);
    if (!rows.length) throw new InsufficientCreditsError(credits, await getBalance(input.orgId));
    remaining = rows[0]?.balance ?? 0;
    const overage = remaining < 0 ? Math.min(credits, -remaining) : 0;
    await q(sql`INSERT INTO credit_ledger (id, org_id, delta, reason, operation, request_id, overage)
      VALUES (${newId("ledger")}, ${input.orgId}, ${-credits}, ${input.surface}, ${input.operation}, ${input.requestId ?? null}, ${overage})`);
  } else {
    remaining = await getBalance(input.orgId);
  }
  await q(sql`INSERT INTO usage_events (id, org_id, actor_type, actor_id, surface, operation, matched, credits, latency_ms, request_id)
    VALUES (${newId("event")}, ${input.orgId}, ${input.actorType}, ${input.actorId}, ${input.surface}, ${input.operation}, ${input.matched},
      ${credits}, ${input.latencyMs ?? null}, ${input.requestId ?? null})`);
  return { charged: credits, remaining };
}

export function getLedger(ctx: OrgContext, limit = 50) {
  return q(sql`SELECT * FROM credit_ledger WHERE org_id = ${ctx.orgId} ORDER BY at DESC LIMIT ${limit}`);
}

export function getUsageByDay(orgId: string, days = 30) {
  return q<{ day: string; surface: string; operation: string; calls: number; credits: number }>(
    sql`SELECT to_char(date_trunc('day', at), 'YYYY-MM-DD') AS day, surface, operation, count(*)::int AS calls, sum(credits)::int AS credits
        FROM usage_events WHERE org_id = ${orgId} AND at > now() - make_interval(days => ${days})
        GROUP BY 1, 2, 3 ORDER BY 1 DESC, 5 DESC`,
  );
}

/* ------------------------------------------------------------------ */
/* API keys — shown once, stored as SHA-256, prefix visible (plan 11)  */
/* ------------------------------------------------------------------ */

export const API_KEY_SCOPES = ["read:data", "write:lists", "write:searches", "read:network", "admin"] as const;

export function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export const DEFAULT_KEY_SCOPES = ["read:data", "write:lists", "write:searches"];
/** Keys created by workspace admins can also manage webhooks (they can deliver org data off-platform). */
export const ADMIN_KEY_SCOPES = [...DEFAULT_KEY_SCOPES, "write:webhooks"];

export async function createApiKey(ctx: OrgContext, name: string, requested?: string[]) {
  const isAdmin = ctx.role === "admin" || ctx.role === "owner";
  const scopes = (requested ?? (isAdmin ? ADMIN_KEY_SCOPES : DEFAULT_KEY_SCOPES)).filter((s) => isAdmin || s !== "write:webhooks");
  const secret = `fai_${randomBytes(24).toString("base64url")}`;
  const id = newId("apiKey");
  // Keys start PENDING and need admin approval (≤ 1 business day). Admins' own keys auto-approve.
  const status = isAdmin ? "ACTIVE" : "PENDING";
  await q(sql`INSERT INTO api_keys (id, org_id, user_id, name, prefix, hash, scopes, status)
    VALUES (${id}, ${ctx.orgId}, ${ctx.userId}, ${name.slice(0, 80)}, ${secret.slice(0, 10)}, ${hashApiKey(secret)},
      ${sql`ARRAY[${sql.join(scopes.map((s) => sql`${s}`), sql`, `)}]::text[]`}, ${status})`);
  const [{ n } = { n: 0 }] = await q<{ n: number }>(sql`SELECT count(*)::int AS n FROM credit_ledger WHERE org_id = ${ctx.orgId} AND reason = 'api_trial'`);
  if (status === "ACTIVE" && n === 0) await grantCredits(ctx.orgId, API_TRIAL_CREDITS, "api_trial");
  return { id, secret, status };
}

export function listApiKeys(ctx: OrgContext) {
  return q<{ id: string; name: string; prefix: string; scopes: string[]; status: string; last_used_at: string | null; created_at: string; user_name: string }>(
    sql`SELECT k.id, k.name, k.prefix, k.scopes, k.status, k.last_used_at, k.created_at, u.name AS user_name
        FROM api_keys k LEFT JOIN "user" u ON u.id = k.user_id WHERE k.org_id = ${ctx.orgId} ORDER BY k.created_at DESC`,
  );
}

export async function setApiKeyStatus(ctx: OrgContext, keyId: string, status: "ACTIVE" | "REVOKED") {
  if (status === "ACTIVE" && ctx.role !== "admin" && ctx.role !== "owner") throw new Error("Only admins can approve keys");
  const r = await q(sql`UPDATE api_keys SET status = ${status} WHERE id = ${keyId} AND org_id = ${ctx.orgId} RETURNING id`);
  if (!r.length) throw new NotFoundError("API key not found");
  if (status === "ACTIVE") {
    const [{ n } = { n: 0 }] = await q<{ n: number }>(sql`SELECT count(*)::int AS n FROM credit_ledger WHERE org_id = ${ctx.orgId} AND reason = 'api_trial'`);
    if (n === 0) await grantCredits(ctx.orgId, API_TRIAL_CREDITS, "api_trial");
  }
}

export type ApiPrincipal = { keyId: string; orgId: string; userId: string; scopes: string[]; role: "member" };

export async function verifyApiKey(secret: string): Promise<ApiPrincipal | null> {
  if (!secret.startsWith("fai_")) return null;
  const [k] = await q<{ id: string; org_id: string; user_id: string; scopes: string[]; status: string }>(
    sql`SELECT id, org_id, user_id, scopes, status FROM api_keys WHERE hash = ${hashApiKey(secret)}`,
  );
  if (!k || k.status !== "ACTIVE") return null;
  void q(sql`UPDATE api_keys SET last_used_at = now() WHERE id = ${k.id}`);
  return { keyId: k.id, orgId: k.org_id, userId: k.user_id, scopes: k.scopes, role: "member" };
}

/* ------------------------------------------------------------------ */
/* Public forms (not org-scoped)                                       */
/* ------------------------------------------------------------------ */

export async function insertLead(input: {
  kind: "DEMO" | "PARTNER" | "NEWSLETTER";
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  firmType?: string;
  aum?: string;
  phone?: string;
  partnershipType?: string;
  message?: string;
  locale?: string;
}) {
  const id = newId("lead");
  const route = input.kind === "DEMO" ? routeLead(input.firmType, input.aum) : input.kind === "PARTNER" ? "partnerships" : "marketing";
  await q(sql`INSERT INTO leads (id, kind, first_name, last_name, email, company, firm_type, aum, phone, partnership_type, message, locale, route)
    VALUES (${id}, ${input.kind}, ${input.firstName ?? null}, ${input.lastName ?? null}, ${input.email}, ${input.company ?? null},
      ${input.firmType ?? null}, ${input.aum ?? null}, ${input.phone ?? null}, ${input.partnershipType ?? null}, ${input.message ?? null},
      ${input.locale ?? null}, ${route})`);
  return { id, route };
}

/** Route by firm type / AUM (plan 6.16). */
export function routeLead(firmType?: string, aum?: string): string {
  const big = aum === "$1–5B" || aum === "$5B+" || aum === "$250M–1B";
  if (firmType === "GTM / Sales team") return "gtm";
  if (big) return "enterprise";
  if (firmType === "Angel" || firmType === "Accelerator") return "self-serve";
  return "venture";
}
