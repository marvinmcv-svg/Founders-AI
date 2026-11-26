"use server";
import { revalidatePath } from "next/cache";
import * as repo from "@founders/core/repo";
import { getCtx } from "@/lib/session";

export async function setMcpOverageAction(enabled: boolean) {
  const ctx = await getCtx();
  await repo.setMcpOverage(ctx, enabled);
  await repo.audit(ctx, enabled ? "mcp.overage.enable" : "mcp.overage.disable");
  revalidatePath("/settings");
}

export async function disconnectMcpApp(clientId: string) {
  const ctx = await getCtx();
  await repo.revokeMcpConnection(ctx, clientId);
  await repo.audit(ctx, "mcp.disconnect", clientId);
  revalidatePath("/settings");
}
