"use server";
/**
 * Agent server actions (plan 10.1/10.2). `sendAgentMessage` queues the turn and returns ids at
 * once; the client then calls `runAgentMessage` (long) while it polls /api/agent/threads/[id] for
 * the step list.
 */
import { revalidatePath } from "next/cache";
import { AgentLimitError, executeTurn, resumeTurn, startTurn } from "@founders/agent";
import * as repo from "@founders/core/repo";
import { getCtx } from "@/lib/session";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function guard<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof AgentLimitError || e instanceof repo.ForbiddenError || e instanceof repo.NotFoundError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Something went wrong. Try again." };
  }
}

export async function sendAgentMessage(threadId: string | null, text: string, contextEntityId?: string | null) {
  return guard(async () => {
    const ctx = await getCtx();
    return startTurn(ctx, { threadId, text, context: contextEntityId ? { entityId: contextEntityId } : null });
  });
}

export async function runAgentMessage(threadId: string, messageId: string) {
  return guard(async () => {
    const ctx = await getCtx();
    const r = await executeTurn(ctx, threadId, messageId);
    revalidatePath("/agent", "layout");
    return r;
  });
}

export async function confirmAgentAction(threadId: string, messageId: string, decision: "once" | "always" | "deny") {
  return guard(async () => {
    const ctx = await getCtx();
    return resumeTurn(ctx, threadId, messageId, decision);
  });
}

export async function updateAgentThread(threadId: string, input: { title?: string; visibility?: "PRIVATE" | "TEAM" }) {
  return guard(async () => {
    const ctx = await getCtx();
    await repo.updateThread(ctx, threadId, input);
    revalidatePath("/agent", "layout");
    return true;
  });
}

export async function deleteAgentThread(threadId: string) {
  return guard(async () => {
    const ctx = await getCtx();
    await repo.deleteThread(ctx, threadId);
    revalidatePath("/agent", "layout");
    return true;
  });
}

/** "Save to list" on a result table: rows must carry entity ids (company/person/investor). */
export async function saveAgentTableToList(threadId: string, messageId: string, tableId: string, target: { listId?: string; newName?: string }) {
  return guard(async () => {
    const ctx = await getCtx();
    const m = await repo.getMessage(ctx, threadId, messageId);
    const t = (m.tables ?? []).find((x) => x.id === tableId);
    if (!t) throw new repo.NotFoundError("Table not found");
    const key = t.product === "talent_signals" ? "person_id" : t.product === "funding_rounds" || t.product === "news_signals" || t.product === "ipos" ? "company_id" : t.product === "acquisitions" ? "target_id" : "id";
    const ids = t.rows.map((r) => String(r[key] ?? "")).filter((x) => /^(com|per|inv)_/.test(x));
    if (!ids.length) throw new repo.ForbiddenError("This table has no companies, people or investors to save.");
    const prefix = ids[0]!.slice(0, 3);
    const entityType: repo.EntityType = prefix === "com" ? "COMPANY" : prefix === "per" ? "PERSON" : "INVESTOR";
    const listId = target.listId ?? (await repo.createList(ctx, { name: (target.newName || t.title).slice(0, 120), entityType })).id;
    const added = await repo.addToList(ctx, listId, ids.filter((x) => x.startsWith(prefix)));
    revalidatePath("/", "layout");
    return { listId, added };
  });
}

/* ---------------- skills ---------------- */

export async function saveAgentSkill(input: repo.SkillInput, id?: string) {
  return guard(async () => {
    const ctx = await getCtx();
    // A workspace skill may reuse a curated slug: the workspace copy then overrides the curated one.
    const skillId = await repo.saveSkill(ctx, input, id);
    revalidatePath("/agent/skills");
    return { id: skillId };
  });
}

export async function deleteAgentSkill(id: string) {
  return guard(async () => {
    const ctx = await getCtx();
    await repo.deleteSkill(ctx, id);
    revalidatePath("/agent/skills");
    return true;
  });
}

export async function scheduleAgentSkill(input: { skillSlug: string; prompt?: string; cadence: "DAILY" | "WEEKLY"; weekday?: number; hour: number; timezone: string; channels: string[] }) {
  return guard(async () => {
    const ctx = await getCtx();
    const id = await repo.createSchedule(ctx, input);
    revalidatePath("/agent/skills");
    return { id };
  });
}

export async function deleteAgentSchedule(id: string) {
  return guard(async () => {
    const ctx = await getCtx();
    await repo.deleteSchedule(ctx, id);
    revalidatePath("/agent/skills");
    return true;
  });
}

/* ---------------- personalization ---------------- */

export async function saveAgentInstructions(scope: "user" | "workspace", instructions: repo.AgentInstructions) {
  return guard(async () => {
    const ctx = await getCtx();
    await repo.setAgentInstructions(ctx, scope, instructions);
    revalidatePath("/agent/personalization");
    return true;
  });
}
