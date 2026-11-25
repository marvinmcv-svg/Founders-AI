import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getMemberships, type OrgContext, type Role } from "@founders/core/repo";
import { auth } from "./auth";

export const ORG_COOKIE = "fai-org";

/** Resolves the signed-in user + active workspace. Every org-scoped call takes this context. */
export const getCtx = cache(async (): Promise<OrgContext & { userName: string; email: string; orgName: string; orgs: { id: string; name: string; role: Role }[] }> => {
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
  };
});
