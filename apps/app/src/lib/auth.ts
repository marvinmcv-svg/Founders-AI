import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { jwt, organization } from "better-auth/plugins";
import { cimd } from "@better-auth/cimd";
import { mcp } from "@better-auth/mcp";
import { egressFetch } from "@founders/core/egress";
import { ORG_CLAIM } from "@founders/mcp/claims";
import { sql } from "drizzle-orm";
import { getDb, schema } from "@founders/db";

const APP_BASE_URL = process.env.BETTER_AUTH_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001"));

/** Canonical MCP resource (RFC 8707/9728): access tokens are audience-bound to it (plan 12, D-043). */
export const MCP_RESOURCE = process.env.MCP_RESOURCE_URL ?? `${APP_BASE_URL.replace(/\/$/, "")}/mcp`;

/**
 * CIMD fetches a client-supplied metadata URL, so it goes through the egress proxy (AGENTS.md rule;
 * D-024): https only, DNS resolved once and pinned, private/metadata ranges refused, no redirects.
 */
async function fetchClientMetadataViaEgress(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const headers: Record<string, string> = { accept: "application/json" };
  new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
  const res = await egressFetch(url, { method: "GET", headers }, { timeoutMs: 5000, maxBytes: 64 * 1024 });
  return new Response(res.body, { status: res.status, headers: res.headers });
}

/**
 * Better Auth (plan 0A): email+password, organizations (multi-workspace membership).
 * Demo-led access (plan 7.1b): sign-up requires a pending invitation unless ALLOW_OPEN_SIGNUP=1.
 * Google/Microsoft SSO, 2FA and API-key plugins are added once OAuth apps exist (H2/H3).
 */
export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET ?? "dev-only-secret-change-me-dev-only-secret",
  baseURL: APP_BASE_URL,
  // The OAuth provider serves its own token endpoint (/oauth2/token); the JWT plugin's /token is off.
  disabledPaths: ["/token"],
  // Production alias, this deployment's own URL and its branch URL may all serve the app on Vercel.
  trustedOrigins: [
    ...[process.env.VERCEL_PROJECT_PRODUCTION_URL, process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL].filter((h): h is string => Boolean(h)).map((h) => `https://${h}`),
    ...[process.env.NEXT_PUBLIC_APP_URL, ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "").split(",")].map((o) => o?.trim()).filter((o): o is string => Boolean(o)),
  ],
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      organization: schema.organization,
      member: schema.member,
      invitation: schema.invitation,
      jwks: schema.jwks,
      oauthClient: schema.oauthClient,
      oauthResource: schema.oauthResource,
      oauthClientResource: schema.oauthClientResource,
      oauthRefreshToken: schema.oauthRefreshToken,
      oauthAccessToken: schema.oauthAccessToken,
      oauthConsent: schema.oauthConsent,
      oauthClientAssertion: schema.oauthClientAssertion,
    },
  }),
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  advanced: { database: { generateId: () => crypto.randomUUID().replace(/-/g, "").slice(0, 24) } },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (process.env.ALLOW_OPEN_SIGNUP === "1") return { data: user };
          const rows = (await getDb().execute(
            sql`SELECT 1 FROM invitation WHERE lower(email) = lower(${user.email}) AND status = 'pending' AND expires_at > now() LIMIT 1`,
          )) as unknown as unknown[];
          if (!rows.length) throw new APIError("FORBIDDEN", { message: "Sign-up is by invitation. Ask your workspace admin for an invite." });
          return { data: user };
        },
      },
    },
  },
  plugins: [
    organization({ allowUserToCreateOrganization: false }),
    jwt({ disableSettingJwtHeader: true }),
    /**
     * MCP authorization server (plan 12): OAuth 2.1 + PKCE, Client ID Metadata Documents and dynamic
     * client registration (clients such as Claude, ChatGPT, Cursor and Windsurf use one or the other).
     * The consent is tied to the workspace the user picks, and the token carries it as `org`.
     */
    mcp({
      resource: MCP_RESOURCE,
      loginPage: "/login",
      consentPage: "/oauth/consent",
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      clientRegistrationDefaultApplicationType: "infer",
      postLogin: {
        page: "/oauth/consent",
        shouldRedirect: () => false,
        // The session's active workspace (set on the consent page), else the user's first workspace.
        consentReferenceId: async ({ session, user }) => {
          const active = (session as Record<string, unknown>).activeOrganizationId;
          const rows = (await getDb().execute(sql`SELECT organization_id FROM member WHERE user_id = ${user.id} ORDER BY created_at`)) as unknown as { organization_id: string }[];
          const orgs = rows.map((r) => r.organization_id);
          if (typeof active === "string" && orgs.includes(active)) return active;
          if (!orgs[0]) throw new APIError("FORBIDDEN", { message: "Your account is not in a workspace yet." });
          return orgs[0];
        },
      },
      customAccessTokenClaims: ({ referenceId }) => (referenceId ? { [ORG_CLAIM]: referenceId } : {}),
    }),
    cimd({ fetchClientMetadataResource: fetchClientMetadataViaEgress, metadataProfile: "mcp-2026-07-28" }),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
