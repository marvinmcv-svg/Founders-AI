/**
 * Workspace security (plan 14.4): SSO providers (Better Auth `@better-auth/sso` owns registration and
 * sign-in; we read and govern), "require SSO" / "require 2FA" policies, and the access check every
 * signed-in request goes through.
 */
import { sql } from "drizzle-orm";
import { recordAudit } from "./audit";
import { rawQuery as q } from "./entities";
import { ForbiddenError, type OrgContext } from "./workspace";

function assertAdmin(ctx: OrgContext) {
  if (ctx.role !== "admin" && ctx.role !== "owner") throw new ForbiddenError("Only workspace admins can change security settings");
}

export type SsoProviderRow = { id: string; provider_id: string; issuer: string; domain: string; domain_verified: boolean; protocol: "OIDC" | "SAML"; created_at: string };

/** Providers bound to this workspace; secrets and certificates are never returned. */
export function listSsoProviders(ctx: OrgContext) {
  return q<SsoProviderRow>(sql`SELECT id, provider_id, issuer, domain, COALESCE(domain_verified, false) AS domain_verified,
      CASE WHEN saml_config IS NOT NULL THEN 'SAML' ELSE 'OIDC' END AS protocol, created_at
    FROM sso_provider WHERE organization_id = ${ctx.orgId} ORDER BY created_at`);
}

export async function getSecurityPolicy(orgId: string) {
  const [o] = await q<{ require_sso: boolean; require_2fa: boolean }>(sql`SELECT require_sso, require_2fa FROM organization WHERE id = ${orgId}`);
  return o ?? { require_sso: false, require_2fa: false };
}

/**
 * Turn the policies on or off. "Require SSO" needs a verified provider, and the admin turning it on
 * must be signed in through SSO themselves, so nobody locks the workspace out by accident.
 */
export async function setSecurityPolicy(ctx: OrgContext, p: { requireSso?: boolean; require2fa?: boolean }, session: { loginMethod: string | null; twoFactorEnabled: boolean }) {
  assertAdmin(ctx);
  if (p.requireSso) {
    const verified = (await listSsoProviders(ctx)).some((x) => x.domain_verified);
    if (!verified) throw new Error("Add an SSO provider and verify its domain first");
    if (session.loginMethod !== "sso") throw new Error("Sign in through SSO yourself before requiring it");
  }
  if (p.require2fa && !session.twoFactorEnabled) throw new Error("Turn on two-factor authentication for your own account first");
  const before = await getSecurityPolicy(ctx.orgId);
  await q(sql`UPDATE organization SET require_sso = COALESCE(${p.requireSso ?? null}::boolean, require_sso), require_2fa = COALESCE(${p.require2fa ?? null}::boolean, require_2fa) WHERE id = ${ctx.orgId}`);
  const after = await getSecurityPolicy(ctx.orgId);
  await recordAudit({ orgId: ctx.orgId, actor: ctx.userId, action: "security.policy.update", metadata: { before, after } });
  return after;
}

export type AccessDecision = { ok: true } | { ok: false; reason: "sso_required" | "2fa_required" };

/** Checked on every signed-in page load (getCtx). API keys and SCIM are separate credentials and unaffected. */
export async function checkAccessPolicy(orgId: string, s: { loginMethod: string | null; twoFactorEnabled: boolean }): Promise<AccessDecision> {
  const p = await getSecurityPolicy(orgId);
  if (p.require_sso && s.loginMethod !== "sso") return { ok: false, reason: "sso_required" };
  // SSO sessions satisfy the 2FA policy: the identity provider owns MFA for them.
  if (p.require_2fa && s.loginMethod !== "sso" && !s.twoFactorEnabled) return { ok: false, reason: "2fa_required" };
  return { ok: true };
}

/** Security overview for Settings → Security. */
export async function securityOverview(ctx: OrgContext) {
  const [providers, policy, members] = await Promise.all([
    listSsoProviders(ctx),
    getSecurityPolicy(ctx.orgId),
    q<{ total: number; with_2fa: number }>(sql`SELECT count(*)::int AS total, count(*) FILTER (WHERE u.two_factor_enabled)::int AS with_2fa
      FROM member m JOIN "user" u ON u.id = m.user_id WHERE m.organization_id = ${ctx.orgId}`),
  ]);
  return { providers, policy, members: members[0] ?? { total: 0, with_2fa: 0 } };
}

export async function auditSecurityEvent(ctx: OrgContext, action: string, target?: string, metadata?: Record<string, unknown>) {
  await recordAudit({ orgId: ctx.orgId, actor: ctx.userId, action, target, metadata });
}

/* ------------------------------------------------------------------ */
/* SSO provider preparation (egress rule, AGENTS.md)                   */
/* ------------------------------------------------------------------ */

export type OidcEndpoints = { issuer: string; authorizationEndpoint: string; tokenEndpoint: string; jwksEndpoint: string; userInfoEndpoint?: string };

/**
 * Fetch an IdP's OIDC discovery document through the egress proxy and check every endpoint
 * against the egress policy (https, public host). Registration then skips Better Auth's own
 * discovery fetch. Token and JWKS calls at sign-in go to these vetted endpoints.
 */
export async function discoverOidc(discoveryUrl: string): Promise<OidcEndpoints> {
  const { egressFetch, validateEgressUrl } = await import("../egress");
  const res = await egressFetch(discoveryUrl, { method: "GET", headers: { accept: "application/json" } }, { timeoutMs: 8000, maxBytes: 256 * 1024 });
  if (res.status !== 200) throw new Error(`Discovery returned HTTP ${res.status}`);
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(res.body) as Record<string, unknown>;
  } catch {
    throw new Error("Discovery document is not JSON");
  }
  const need = (k: string) => {
    const v = doc[k];
    if (typeof v !== "string") throw new Error(`Discovery document has no ${k}`);
    return validateEgressUrl(v).toString();
  };
  const issuer = String(doc.issuer ?? "");
  if (!issuer) throw new Error("Discovery document has no issuer");
  return {
    issuer,
    authorizationEndpoint: need("authorization_endpoint"),
    tokenEndpoint: need("token_endpoint"),
    jwksEndpoint: need("jwks_uri"),
    userInfoEndpoint: typeof doc.userinfo_endpoint === "string" ? validateEgressUrl(doc.userinfo_endpoint).toString() : undefined,
  };
}

/** Support path: a platform admin marks a provider's domain verified (e.g. confirmed by contract) when DNS can't be used. */
export async function adminVerifySsoDomain(a: { email: string }, providerId: string) {
  const { isPlatformAdmin } = await import("./admin");
  if (!isPlatformAdmin(a.email)) throw new ForbiddenError("Platform admin only");
  const [p] = await q<{ organization_id: string | null; domain: string }>(sql`UPDATE sso_provider SET domain_verified = true, updated_at = now() WHERE provider_id = ${providerId} RETURNING organization_id, domain`);
  if (!p) throw new Error("Provider not found");
  await recordAudit({ orgId: "platform", actor: a.email, actorType: "platform_admin", action: "sso.domain.verify", target: providerId, metadata: { domain: p.domain } });
  if (p.organization_id) await recordAudit({ orgId: p.organization_id, actor: a.email, actorType: "platform_admin", action: "sso.domain.verify", target: providerId });
}
