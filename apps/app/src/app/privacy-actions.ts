"use server";
import { cookies, headers } from "next/headers";
import * as repo from "@founders/core/repo";
import { auth } from "@/lib/auth";
import { getCtx } from "@/lib/session";

/** Delete the signed-in user's account (plan 7.13 Data & privacy). Returns `{ error }` instead of throwing. */
export async function deleteMyAccountAction(confirmEmail: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const ctx = await getCtx();
    await repo.deleteMyAccount(ctx, confirmEmail);
    // Sessions are gone with the user row; this clears the cookies.
    await auth.api.signOut({ headers: await headers() }).catch(() => undefined);
    (await cookies()).delete("fai-org");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not delete the account" };
  }
}
