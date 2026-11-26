"use server";
import { revalidatePath } from "next/cache";
import type { CreditPackId } from "@founders/core/pricing";
import * as repo from "@founders/core/repo";
import { getCtx } from "@/lib/session";

/** Server-action errors are masked in production, so these return `{ error }` instead of throwing. */
type Result = { ok: true; url?: string } | { ok: false; error: string };
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : "Something went wrong" });

export async function changeSeatsAction(seats: number): Promise<Result> {
  try {
    const ctx = await getCtx();
    const r = await repo.changeSeats(ctx, seats, ctx.email);
    revalidatePath("/settings/billing");
    return { ok: true, url: r.url };
  } catch (e) {
    return fail(e);
  }
}

export async function buyCreditPackAction(pack: CreditPackId): Promise<Result> {
  try {
    const ctx = await getCtx();
    return { ok: true, url: (await repo.buyCreditPack(ctx, pack, ctx.email)).url };
  } catch (e) {
    return fail(e);
  }
}

export async function openPortalAction(): Promise<Result> {
  try {
    return { ok: true, url: (await repo.openBillingPortal(await getCtx())).url };
  } catch (e) {
    return fail(e);
  }
}

export async function setOverageAction(enabled: boolean, limit: number): Promise<Result> {
  try {
    await repo.setOverage(await getCtx(), enabled, limit);
    revalidatePath("/settings/billing");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function completeSimulatedCheckoutAction(token: string): Promise<Result> {
  try {
    await repo.completeSimulatedCheckout(await getCtx(), token);
    revalidatePath("/settings/billing");
    return { ok: true, url: "/settings/billing?checkout=success" };
  } catch (e) {
    return fail(e);
  }
}
