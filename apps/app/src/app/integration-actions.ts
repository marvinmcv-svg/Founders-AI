"use server";
/** Server actions for Phase 8 integrations: CRM sync (network and bulk delivery live alongside). */
import { revalidatePath } from "next/cache";
import * as repo from "@founders/core/repo";
import { getCtx } from "@/lib/session";

type Res<T = unknown> = { ok: true; data: T } | { ok: false; error: string };
const err = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : "Something went wrong" });

export async function crmConnect(provider: string, input: repo.ConnectInput): Promise<Res<{ account: string }>> {
  try {
    const r = await repo.connectCrm(await getCtx(), provider, input);
    revalidatePath("/settings");
    return { ok: true, data: { account: r.account } };
  } catch (e) {
    return err(e);
  }
}

export async function crmDisconnect(provider: string): Promise<Res<null>> {
  try {
    await repo.disconnectCrm(await getCtx(), provider);
    revalidatePath("/settings");
    return { ok: true, data: null };
  } catch (e) {
    return err(e);
  }
}

export async function crmPreview(provider: string, objects: ("COMPANY" | "PERSON")[]): Promise<Res<repo.PullPreview>> {
  try {
    return { ok: true, data: await repo.previewCrmPull(await getCtx(), provider, objects) };
  } catch (e) {
    return err(e);
  }
}

export async function crmPull(provider: string): Promise<Res<repo.SyncResult>> {
  try {
    const r = await repo.runCrmPull(await getCtx(), provider);
    revalidatePath("/settings");
    return r.status === "FAILED" ? { ok: false, error: r.error ?? "Pull failed" } : { ok: true, data: r };
  } catch (e) {
    return err(e);
  }
}

export async function crmEnrich(provider: string): Promise<Res<number>> {
  try {
    const r = await repo.enrichCrm(await getCtx(), provider, "manual");
    revalidatePath("/settings");
    return { ok: true, data: Object.values(r).reduce((a, x) => a + (x.counts.created ?? 0) + (x.counts.updated ?? 0), 0) };
  } catch (e) {
    return err(e);
  }
}

export async function crmSaveConfig(provider: string, input: { pullConfig?: repo.PullConfig; pushConfig?: repo.PushConfig; schedule?: repo.CrmSchedule }): Promise<Res<null>> {
  try {
    await repo.updateCrmConfig(await getCtx(), provider, input);
    revalidatePath("/settings");
    return { ok: true, data: null };
  } catch (e) {
    return err(e);
  }
}

/** "Push to CRM" from grid / list / profile. Uses the workspace's first connected CRM unless one is named. */
export async function pushEntitiesToCrm(kind: "COMPANY" | "PERSON", ids: string[], provider?: string): Promise<Res<{ provider: string; created: number; updated: number; errors: number; message?: string }>> {
  try {
    const ctx = await getCtx();
    const target = provider ?? (await repo.defaultCrm(ctx));
    if (!target) return { ok: false, error: "Connect a CRM in Settings → Integrations first" };
    const r = await repo.pushToCrm(ctx, target, kind, ids);
    if (r.status === "FAILED") return { ok: false, error: r.error ?? "Push failed" };
    return { ok: true, data: { provider: target, created: r.counts.created ?? 0, updated: r.counts.updated ?? 0, errors: (r.counts.errors ?? 0) + (r.counts.skipped ?? 0), ...(r.error ? { message: r.error } : {}) } };
  } catch (e) {
    return err(e);
  }
}
