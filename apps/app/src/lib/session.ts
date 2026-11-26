import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { checkAccessPolicy, getMemberships, type OrgContext, type Role } from "@founders/core/repo";
import { auth } from "./auth";

export const ORG_COOKIE = "fai-org";

export type AppCtx = OrgContext & {
  userName: string;
  email: string;
  orgName: string;
  orgs: { id: string; name: string; role: Role }[];
  loginMethod: string | null;
  twoFactorEnabled: boolean;
};

/** Signed-in user + active workspace, without the workspace security policy (Settings → Security uses this). */
export const getCtxUnenforced = cache(async (): Promise<AppCtx> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const memberships = await getMemberships(session.user.id);
  if (!memberships.length) redirect("/login?error=no-workspace");
  const wanted = (await cookies()).get(ORG_COOKIE)?.value ?? session.session.activeOrganizationId ?? undefined;
  const active = memberships.find((m) => m.org_id === wanted) ?? memberships[0]!;
  return {
    orgId: active.org_id,
    userId: session.user.id,
    role: active.role,
    userName: session.user.name,
    email: session.user.email,
    orgName: active.name,
    orgs: memberships.map((m) => ({ id: m.org_id, name: m.name, role: m.role })),
    loginMethod: (session.session as { loginMethod?: string | null }).loginMethod ?? null,
    twoFactorEnabled: Boolean((session.user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled),
  };
});

/**
 * Resolves the signed-in user + active workspace. Every org-scoped call takes this context.
 * Enforces the workspace's "require SSO" / "require 2FA" policies (plan 14.4).
 */
export const getCtx = cache(async (): Promise<AppCtx> => {
  const ctx = await getCtxUnenforced();
  const decision = await checkAccessPolicy(ctx.orgId, { loginMethod: ctx.loginMethod, twoFactorEnabled: ctx.twoFactorEnabled });
  if (!decision.ok) redirect(decision.reason === "sso_required" ? `/login/sso?error=sso-required&email=${encodeURIComponent(ctx.email)}` : "/settings/security?enforce=2fa");
  return ctx;
});
