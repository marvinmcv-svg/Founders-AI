/**
 * MCP metering (plan 12, 14): every tool call — free or paid — counts toward the user's
 * MCP_FREE_CALLS_PER_DAY (resets 00:00 UTC). After the allowance, free tools keep working; paid tools
 * draw org credits only if an admin enabled overage, otherwise the call is refused with the reset time.
 */
import { sql } from "drizzle-orm";
import { MCP_FREE_CALLS_PER_DAY } from "../limits";
import { charge, InsufficientCreditsError } from "./credits";
import { rawQuery as q } from "./entities";
import { ForbiddenError, type OrgContext } from "./workspace";

export class McpLimitError extends Error {
  constructor(message: string, public resetAt: string) {
    super(message);
    this.name = "McpLimitError";
  }
}

export function nextUtcMidnight(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return d.toISOString();
}

export async function mcpCallsToday(ctx: Pick<OrgContext, "orgId" | "userId">): Promise<number> {
  const [r] = await q<{ n: number }>(sql`SELECT count(*)::int AS n FROM usage_events
    WHERE org_id = ${ctx.orgId} AND actor_id = ${ctx.userId} AND surface = 'MCP' AND at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`);
  return r?.n ?? 0;
}

export async function getMcpOverage(orgId: string): Promise<boolean> {
  const [r] = await q<{ v: boolean }>(sql`SELECT mcp_overage_enabled AS v FROM organization WHERE id = ${orgId}`);
  return Boolean(r?.v);
}

export async function setMcpOverage(ctx: OrgContext, enabled: boolean) {
  if (ctx.role !== "owner" && ctx.role !== "admin") throw new ForbiddenError("Only workspace admins can change MCP overage");
  await q(sql`UPDATE organization SET mcp_overage_enabled = ${enabled} WHERE id = ${ctx.orgId}`);
}

/** Pre-check before running a paid tool, so an over-limit call does no work. */
export async function assertMcpAllowance(ctx: Pick<OrgContext, "orgId" | "userId">, paid: boolean) {
  if (!paid) return;
  if ((await mcpCallsToday(ctx)) < MCP_FREE_CALLS_PER_DAY) return;
  if (await getMcpOverage(ctx.orgId)) return;
  throw new McpLimitError(
    `You've used today's ${MCP_FREE_CALLS_PER_DAY} free MCP calls. Free tools (find_*, lists, saved searches) keep working; paid tools resume at ${nextUtcMidnight()} (00:00 UTC), or a workspace admin can allow overage on credits in Settings → MCP.`,
    nextUtcMidnight(),
  );
}

/**
 * Decide and record one MCP tool call. `credits` is the call's price at the Section 11 table (0 for
 * free tools; for paid tools, 0 when nothing was matched — misses are free). Within the daily
 * allowance the call is free; after it, paid calls charge credits only with overage on.
 */
export async function meterMcpCall(ctx: Pick<OrgContext, "orgId" | "userId">, input: { tool: string; credits: number; paid: boolean; matched: boolean; requestId?: string }) {
  const used = await mcpCallsToday(ctx);
  const withinAllowance = used < MCP_FREE_CALLS_PER_DAY;
  let creditsToCharge = 0;
  if (!withinAllowance && input.paid && input.credits > 0) {
    if (!(await getMcpOverage(ctx.orgId))) {
      throw new McpLimitError(
        `You've used today's ${MCP_FREE_CALLS_PER_DAY} free MCP calls. Free tools (find_*, lists, saved searches) keep working; paid tools resume at ${nextUtcMidnight()} (00:00 UTC), or a workspace admin can allow overage on credits in Settings → MCP.`,
        nextUtcMidnight(),
      );
    }
    creditsToCharge = input.credits;
  }
  try {
    const r = await charge({ orgId: ctx.orgId, actorType: "mcp_client", actorId: ctx.userId, surface: "MCP", operation: `mcp.${input.tool}`, credits: creditsToCharge, matched: input.matched || creditsToCharge === 0, requestId: input.requestId });
    return { charged: r.charged, remaining: r.remaining, freeCallsLeft: Math.max(0, MCP_FREE_CALLS_PER_DAY - used - 1) };
  } catch (e) {
    if (e instanceof InsufficientCreditsError) throw new McpLimitError(`Not enough workspace credits for this call (needs ${e.needed}, balance ${e.balance}).`, nextUtcMidnight());
    throw e;
  }
}

/** Settings → MCP: per-user calls today and over the last 30 days. */
export function getMcpUsage(ctx: OrgContext) {
  return q<{ user_id: string; name: string; email: string; today: number; last_30d: number; credits_30d: number }>(sql`
    SELECT u.id AS user_id, u.name, u.email,
      count(*) FILTER (WHERE e.at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')::int AS today,
      count(*)::int AS last_30d, coalesce(sum(e.credits), 0)::int AS credits_30d
    FROM usage_events e JOIN "user" u ON u.id = e.actor_id
    WHERE e.org_id = ${ctx.orgId} AND e.surface = 'MCP' AND e.at > now() - interval '30 days'
    GROUP BY u.id, u.name, u.email ORDER BY last_30d DESC`);
}

/** Settings → MCP: apps this user connected over OAuth (one row per client), with revoke. */
export function getMcpConnections(ctx: OrgContext) {
  return q<{ client_id: string; name: string | null; created_at: string; scopes: string[] }>(sql`
    SELECT c.client_id, c.name, max(k.created_at) AS created_at, (array_agg(k.scopes))[1] AS scopes
    FROM oauth_consent k JOIN oauth_client c ON c.client_id = k.client_id
    WHERE k.user_id = ${ctx.userId} AND (k.reference_id = ${ctx.orgId} OR k.reference_id IS NULL)
    GROUP BY c.client_id, c.name ORDER BY max(k.created_at) DESC`);
}

/** Disconnect: removes the consent and revokes this user's tokens for the client. */
export async function revokeMcpConnection(ctx: OrgContext, clientId: string) {
  await q(sql`DELETE FROM oauth_consent WHERE user_id = ${ctx.userId} AND client_id = ${clientId}`);
  await q(sql`UPDATE oauth_access_token SET revoked = now() WHERE user_id = ${ctx.userId} AND client_id = ${clientId} AND revoked IS NULL`);
  await q(sql`UPDATE oauth_refresh_token SET revoked = now() WHERE user_id = ${ctx.userId} AND client_id = ${clientId} AND revoked IS NULL`);
}
