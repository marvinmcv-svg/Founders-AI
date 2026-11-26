"use server";
import { headers } from "next/headers";
import { getMemberships } from "@founders/core/repo";
import { auth } from "@/lib/auth";

/**
 * Sets the workspace this connection will use. Done server-side: on the consent page the OAuth client
 * plugin adds the signed query to every auth-client POST, which would turn a plain `setActive` into
 * an authorization continuation.
 */
export async function chooseConsentWorkspace(orgId: string): Promise<{ ok: boolean; error?: string }> {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  if (!session) return { ok: false, error: "Your session expired. Sign in again." };
  if (!(await getMemberships(session.user.id)).some((m) => m.org_id === orgId)) return { ok: false, error: "You are not a member of that workspace." };
  await auth.api.setActiveOrganization({ headers: h, body: { organizationId: orgId } });
  return { ok: true };
}
