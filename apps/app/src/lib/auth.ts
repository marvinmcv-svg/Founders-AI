import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins";
import { sql } from "drizzle-orm";
import { getDb, schema } from "@founders/db";

/**
 * Better Auth (plan 0A): email+password, organizations (multi-workspace membership).
 * Demo-led access (plan 7.1b): sign-up requires a pending invitation unless ALLOW_OPEN_SIGNUP=1.
 * Google/Microsoft SSO, 2FA and API-key plugins are added once OAuth apps exist (H2/H3).
 */
export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET ?? "dev-only-secret-change-me-dev-only-secret",
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001",
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
  plugins: [organization({ allowUserToCreateOrganization: false }), nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
