"use server";
import { revalidatePath } from "next/cache";
import * as repo from "@founders/core/repo";
import { getCtx } from "@/lib/session";

async function admin(): Promise<repo.AdminContext> {
  const ctx = await getCtx();
  if (!repo.isPlatformAdmin(ctx.email)) throw new repo.ForbiddenError("Platform admin only");
  return { email: ctx.email, userId: ctx.userId };
}

export async function reviewDisclosure(id: string, decision: "verified" | "rejected", amountUsd?: number) {
  const a = await admin();
  await repo.reviewDisclosure(a, id, decision, amountUsd && amountUsd > 0 ? Math.round(amountUsd) : undefined);
  revalidatePath("/admin");
}

export async function activateModel(version: string) {
  const a = await admin();
  await repo.activateModel(a, version);
  revalidatePath("/admin");
}

export async function setFeatureFlag(key: string, enabled: boolean, orgs: string[]) {
  const a = await admin();
  await repo.setFlag(a.email, key as repo.FlagKey, { enabled, orgs });
  revalidatePath("/admin");
}
