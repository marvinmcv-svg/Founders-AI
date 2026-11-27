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

/* ---------------- Phase 10: admin console (plan 7.14) ---------------- */

export type AdminResult = { ok: true; message?: string } | { ok: false; error: string };
type Values = Record<string, string>;

/** Server-action errors are masked in production, so these return `{ error }`. */
async function run(fn: (a: repo.AdminContext) => Promise<string | void>): Promise<AdminResult> {
  try {
    const message = await fn(await admin());
    revalidatePath("/admin");
    return { ok: true, message: message ?? undefined };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function adjustCreditsAction(orgId: string, v: Values) {
  return run(async (a) => {
    await repo.adminAdjustCredits(a, orgId, Number(v.amount), v.note ?? "");
    return "Balance updated.";
  });
}

export async function updateAccountAction(orgId: string, v: Values) {
  const n = (k: string) => (v[k] === undefined || v[k] === "" ? undefined : Number(v[k]));
  return run(async (a) => {
    await repo.adminUpdateAccount(a, orgId, { plan: v.plan || undefined, seats: n("seats"), periodCredits: n("periodCredits"), rolloverPct: n("rolloverPct"), rolloverCap: n("rolloverCap"), overageLimit: n("overageLimit") });
    return "Terms saved.";
  });
}

export async function reviewKeyAction(keyId: string, decision: "ACTIVE" | "REVOKED") {
  return run(async (a) => {
    await repo.adminReviewApiKey(a, keyId, decision);
    return decision === "ACTIVE" ? "Approved." : "Rejected.";
  });
}

export async function dsarVerifyAction(id: string, v: Values) {
  return run(async (a) => repo.markDsarVerified(a, id, v.note ?? ""));
}
export async function dsarMatchAction(id: string, personIds: string[]) {
  return run(async (a) => {
    await repo.setDsarMatches(a, id, personIds);
    return `${personIds.length} profile(s) linked.`;
  });
}
export async function dsarCompleteAction(id: string) {
  return run(async (a) => {
    await repo.completeDsar(a, id);
    return "Completed.";
  });
}
export async function dsarRejectAction(id: string, v: Values) {
  return run(async (a) => repo.rejectDsar(a, id, v.reason ?? ""));
}
export async function addSuppressionAction(v: Values) {
  return run(async (a) => {
    const r = await repo.addSuppression(a, v.kind as "email" | "linkedin" | "person_id", v.value ?? "", v.note);
    return r.added ? `Suppressed${r.withdrawn ? `; ${r.withdrawn} profile(s) withdrawn` : ""}.` : "Already suppressed.";
  });
}

export async function updateEntityAction(id: string, v: Values) {
  return run(async (a) => {
    await repo.updateEntityFields(a, id, v);
    return "Saved.";
  });
}
export async function mergeEntitiesAction(v: Values) {
  return run(async (a) => {
    const moved = await repo.mergeEntities(a, (v.keep ?? "").trim(), (v.drop ?? "").trim());
    return `Merged: ${Object.values(moved).reduce((s, n) => s + n, 0)} references moved.`;
  });
}
export async function decideMatchAction(id: string, verdict: "keep-left" | "keep-right" | "reject", leftId: string, rightId: string) {
  return run(async (a) => {
    if (verdict === "reject") {
      await repo.decideMatchCandidate(a, id, { merge: false });
      return "Marked as not a duplicate; this pair won't be suggested again.";
    }
    const r = await repo.decideMatchCandidate(a, id, { merge: true, keepId: verdict === "keep-left" ? leftId : rightId });
    return `Merged: ${r.merged ? Object.values(r.moved).reduce((s, n) => s + n, 0) : 0} references moved.`;
  });
}
export async function renameTaxonomyAction(id: string, v: Values) {
  return run(async (a) => repo.renameTaxonomyNode(a, id, v.name ?? ""));
}
export async function reviewSignalAction(kind: repo.QaKind, id: string, verdict: "CORRECT" | "WRONG", v: Values) {
  return run(async (a) => repo.reviewSignal(a, kind, id, verdict, v.corrected || null, v.note));
}

export async function verifySsoDomainAction(providerId: string) {
  return run(async (a) => {
    await repo.adminVerifySsoDomain(a, providerId);
    return "Domain marked verified.";
  });
}

export async function createIncidentAction(v: Values) {
  return run(async (a) => {
    await repo.createIncident(a, { title: v.title ?? "", impact: v.impact ?? "minor", components: (v.components ?? "").split(/[\s,]+/).filter(Boolean), body: v.body ?? "" });
    return "Posted to the status page.";
  });
}
export async function updateIncidentAction(id: string, v: Values) {
  return run(async (a) => {
    await repo.updateIncident(a, id, v.status ?? "", v.body ?? "");
    return "Updated.";
  });
}
