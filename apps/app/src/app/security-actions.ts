"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { validateEgressUrl } from "@founders/core/egress";
import * as repo from "@founders/core/repo";
import { auth } from "@/lib/auth";
import { getCtxUnenforced } from "@/lib/session";

type Result<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : "Something went wrong" });

async function adminCtx() {
  const ctx = await getCtxUnenforced();
  if (ctx.role !== "admin" && ctx.role !== "owner") throw new repo.ForbiddenError("Only workspace admins can change security settings");
  return ctx;
}

const slug = (v: string) => v.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/** Register an OIDC or SAML provider for this workspace (Better Auth checks admin membership too). */
export async function registerSsoAction(v: Record<string, string>): Promise<Result<{ providerId: string }>> {
  try {
    const ctx = await adminCtx();
    const providerId = slug(v.providerId || `${ctx.orgName}-${v.protocol}`);
    const domain = (v.domain ?? "").trim().toLowerCase();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new Error("Enter the e-mail domain, e.g. fund.com");
    let body: Record<string, unknown>;
    if (v.protocol === "saml") {
      const entryPoint = validateEgressUrl(v.entryPoint ?? "").toString();
      const cert = (v.cert ?? "").trim();
      if (!cert.includes("BEGIN CERTIFICATE")) throw new Error("Paste the IdP signing certificate (PEM)");
      const issuer = (v.issuer ?? "").trim();
      if (!issuer) throw new Error("Enter the IdP entity ID");
      body = { providerId, domain, issuer: /^https?:\/\//.test(issuer) ? issuer : `https://${domain}`, organizationId: ctx.orgId, samlConfig: { entryPoint, cert, idpMetadata: { entityID: issuer, cert }, spMetadata: {}, wantAssertionsSigned: true } };
    } else {
      const disco = await repo.discoverOidc(v.discoveryUrl ?? "");
      if (!v.clientId || !v.clientSecret) throw new Error("Client ID and secret are required");
      body = {
        providerId, domain, issuer: disco.issuer, organizationId: ctx.orgId,
        oidcConfig: { clientId: v.clientId.trim(), clientSecret: v.clientSecret.trim(), skipDiscovery: true, authorizationEndpoint: disco.authorizationEndpoint, tokenEndpoint: disco.tokenEndpoint, jwksEndpoint: disco.jwksEndpoint, userInfoEndpoint: disco.userInfoEndpoint, pkce: true, scopes: ["openid", "email", "profile"] },
      };
    }
    await auth.api.registerSSOProvider({ body: body as never, headers: await headers() });
    await repo.auditSecurityEvent(ctx, "sso.provider.register", providerId, { protocol: v.protocol, domain });
    revalidatePath("/settings/security");
    return { ok: true, data: { providerId }, message: "Provider added. Verify the domain to turn it on." };
  } catch (e) {
    return fail(e);
  }
}

export async function requestDomainTokenAction(providerId: string): Promise<Result<{ record: string; value: string }>> {
  try {
    await adminCtx();
    const r = (await auth.api.requestDomainVerification({ body: { providerId }, headers: await headers() })) as { domainVerificationToken: string };
    return { ok: true, data: { record: `_founders-ai-${providerId}`, value: r.domainVerificationToken } };
  } catch (e) {
    return fail(e);
  }
}

export async function verifyDomainAction(providerId: string): Promise<Result> {
  try {
    const ctx = await adminCtx();
    await auth.api.verifyDomain({ body: { providerId }, headers: await headers() });
    await repo.auditSecurityEvent(ctx, "sso.domain.verify", providerId);
    revalidatePath("/settings/security");
    return { ok: true, message: "Domain verified. People from it can now sign in with SSO." };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteSsoAction(providerId: string): Promise<Result> {
  try {
    const ctx = await adminCtx();
    const policy = await repo.getSecurityPolicy(ctx.orgId);
    if (policy.require_sso && (await repo.listSsoProviders(ctx)).filter((p) => p.domain_verified).length <= 1) throw new Error("Turn off “Require SSO” before removing the last verified provider");
    await auth.api.deleteSSOProvider({ body: { providerId }, headers: await headers() });
    await repo.auditSecurityEvent(ctx, "sso.provider.delete", providerId);
    revalidatePath("/settings/security");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setPolicyAction(p: { requireSso?: boolean; require2fa?: boolean }): Promise<Result> {
  try {
    const ctx = await adminCtx();
    await repo.setSecurityPolicy(ctx, p, { loginMethod: ctx.loginMethod, twoFactorEnabled: ctx.twoFactorEnabled });
    revalidatePath("/settings/security");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function createScimTokenAction(name: string): Promise<Result<{ secret: string }>> {
  try {
    const r = await repo.createScimToken(await adminCtx(), name);
    revalidatePath("/settings/security");
    return { ok: true, data: { secret: r.secret } };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeScimTokenAction(id: string): Promise<Result> {
  try {
    await repo.revokeScimToken(await adminCtx(), id);
    revalidatePath("/settings/security");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Called by the client after Better Auth enabled or disabled 2FA, so the change is in the audit log. */
export async function auditTwoFactorAction(enabled: boolean): Promise<void> {
  const ctx = await getCtxUnenforced();
  await repo.auditSecurityEvent(ctx, enabled ? "security.2fa.enable" : "security.2fa.disable", ctx.userId);
}
