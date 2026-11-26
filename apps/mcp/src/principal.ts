/**
 * Who is calling (plan 12): an OAuth access token (user + consented workspace) or, for clients that
 * only take a header, an API key. Membership is re-checked on every request, so removing a user from
 * a workspace cuts their MCP access immediately.
 */
import * as repo from "@founders/core/repo";
import type { McpPrincipal } from "./tools";

import { ORG_CLAIM } from "./claims";

export { ORG_CLAIM };

export async function principalFromClaims(claims: Record<string, unknown>): Promise<McpPrincipal | null> {
  const userId = typeof claims.sub === "string" ? claims.sub : null;
  if (!userId) return null;
  const memberships = await repo.getMemberships(userId);
  const wanted = typeof claims[ORG_CLAIM] === "string" ? (claims[ORG_CLAIM] as string) : null;
  const m = wanted ? memberships.find((x) => x.org_id === wanted) : memberships[0];
  if (!m) return null;
  return { orgId: m.org_id, userId, role: m.role, via: "oauth", clientId: typeof claims.azp === "string" ? claims.azp : "oauth" };
}

/** `Authorization: Bearer fai_…` or `X-API-Key: fai_…`. Keys act for the user who created them. */
export async function principalFromApiKey(req: Request): Promise<McpPrincipal | null | undefined> {
  const header = req.headers.get("x-api-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!header?.startsWith("fai_")) return undefined; // not an API key: fall through to OAuth
  const k = await repo.verifyApiKey(header.trim());
  if (!k) return null;
  const m = (await repo.getMemberships(k.userId)).find((x) => x.org_id === k.orgId);
  if (!m) return null;
  return { orgId: k.orgId, userId: k.userId, role: m.role, via: "api_key", clientId: `key:${k.keyId}` };
}
