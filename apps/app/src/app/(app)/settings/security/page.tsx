import type { Metadata } from "next";
import Link from "next/link";
import * as repo from "@founders/core/repo";
import { Badge, Card } from "@founders/ui";
import { getCtxUnenforced } from "@/lib/session";
import { PolicyToggles, ScimTokens, SsoProviders, TwoFactorPanel } from "./SecurityClient";

export const metadata: Metadata = { title: "Security" };

const appBase = () => (process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001").replace(/\/$/, "");

/** Settings → Security (plan 14.4): your 2FA; for admins SSO, SCIM and workspace policies. Not policy-gated, so a blocked user can fix it here. */
export default async function Security({ searchParams }: { searchParams: Promise<{ enforce?: string }> }) {
  const ctx = await getCtxUnenforced();
  const { enforce } = await searchParams;
  const isAdmin = ctx.role === "admin" || ctx.role === "owner";
  const overview = await repo.securityOverview(ctx);
  const [tokens, scimUsers] = isAdmin ? await Promise.all([repo.listScimTokens(ctx), repo.scimUsersSummary(ctx)]) : [[], { active: 0, inactive: 0 }];
  const base = appBase();
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 p-6">
      <div>
        <Link href="/settings" className="text-[12px] text-muted hover:text-ink">← Settings</Link>
        <h1 className="mt-1 text-[22px] font-semibold">Security</h1>
        <p className="text-[13px] text-muted">Two-factor authentication for your account; single sign-on, SCIM provisioning and sign-in policies for the workspace.</p>
      </div>
      {enforce === "2fa" ? (
        <Card className="border-warning/40 p-4 text-[13px] text-warning" role="alert">{ctx.orgName} requires two-factor authentication. Turn it on below to continue.</Card>
      ) : null}

      <section>
        <h2 className="text-[16px] font-semibold">Two-factor authentication</h2>
        <p className="mb-3 text-[13px] text-muted">An authenticator app code at sign-in, with one-time backup codes. Sessions started through SSO use your identity provider's MFA instead.</p>
        <TwoFactorPanel enabled={ctx.twoFactorEnabled} />
      </section>

      {isAdmin ? (
        <>
          <section>
            <h2 className="text-[16px] font-semibold">Single sign-on</h2>
            <p className="mb-3 text-[13px] text-muted">OIDC (Okta, Entra ID, Google Workspace…) or SAML 2.0. People with an e-mail at a verified domain sign in through your identity provider and join this workspace (within your seats).</p>
            <Card className="mb-3 grid gap-1 p-4 font-mono text-[11.5px] text-muted">
              <span>OIDC redirect URI: <span className="text-ink">{base}/api/auth/sso/callback/&lt;provider-id&gt;</span></span>
              <span>SAML ACS URL: <span className="text-ink">{base}/api/auth/sso/saml2/sp/acs/&lt;provider-id&gt;</span></span>
              <span>SAML SP metadata: <span className="text-ink">{base}/api/auth/sso/saml2/sp/metadata?providerId=&lt;provider-id&gt;</span></span>
            </Card>
            <SsoProviders providers={overview.providers.map((p) => ({ providerId: p.provider_id, protocol: p.protocol, domain: p.domain, issuer: p.issuer, verified: p.domain_verified }))} />
          </section>

          <section>
            <h2 className="text-[16px] font-semibold">Sign-in policies</h2>
            <p className="mb-3 text-[13px] text-muted">{overview.members.with_2fa} of {overview.members.total} members have two-factor authentication on. You signed in with <Badge tone="neutral">{ctx.loginMethod ?? "unknown"}</Badge>.</p>
            <PolicyToggles requireSso={overview.policy.require_sso} require2fa={overview.policy.require_2fa} canRequireSso={overview.providers.some((p) => p.domain_verified)} />
          </section>

          <section>
            <h2 className="text-[16px] font-semibold">SCIM provisioning</h2>
            <p className="mb-3 text-[13px] text-muted">Let your identity provider create, update and deactivate members automatically. Deactivating someone removes them from this workspace and frees the seat. {scimUsers.active} provisioned · {scimUsers.inactive} deactivated.</p>
            <Card className="mb-3 p-4 font-mono text-[11.5px] text-muted">SCIM base URL: <span className="text-ink">{base}/scim/v2</span> · auth: Bearer token · Users (create, update, PATCH active, delete); groups not supported</Card>
            <ScimTokens tokens={tokens} />
          </section>
        </>
      ) : null}
    </div>
  );
}
