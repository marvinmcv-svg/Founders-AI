/**
 * Agent persistence (plan 10.1/10.2): threads, messages, artifacts, workspace skills,
 * personalization and scheduled skills. Everything is org-scoped through OrgContext.
 *
 * Visibility: a PRIVATE thread/skill is readable by its owner only; TEAM ones by every member of
 * the org. Only the owner can rename, share, or delete.
 */
import { sql } from "drizzle-orm";
import type { AgentPending, AgentSource, AgentStep, AgentTable } from "@founders/db/schema";
import { newId } from "../ids";
import { rawQuery as q } from "./entities";
import { canWrite, ForbiddenError, NotFoundError, type OrgContext } from "./workspace";

export type { AgentPending, AgentSource, AgentStep, AgentTable };

const arr = (xs: string[]) => sql`ARRAY[${sql.join(xs.map((x) => sql`${x}`), sql`, `)}]::text[]`;
const j = (v: unknown) => (v === undefined || v === null ? null : JSON.stringify(v));

/* ---------------- threads ---------------- */

export type ThreadRow = { id: string; org_id: string; owner_id: string; owner_name?: string; title: string; visibility: "PRIVATE" | "TEAM"; allowed_tools: string[]; context: Record<string, unknown> | null; created_at: string; updated_at: string };

export async function createThread(ctx: OrgContext, input: { title: string; context?: Record<string, unknown> | null; visibility?: "PRIVATE" | "TEAM" }) {
  if (!canWrite(ctx)) throw new ForbiddenError("Viewers cannot start agent threads");
  const id = newId("thread");
  await q(sql`INSERT INTO agent_threads (id, org_id, owner_id, title, visibility, context)
    VALUES (${id}, ${ctx.orgId}, ${ctx.userId}, ${input.title.slice(0, 120)}, ${input.visibility ?? "PRIVATE"}, ${j(input.context)}::jsonb)`);
  return id;
}

export function listThreads(ctx: OrgContext, limit = 100) {
  return q<ThreadRow>(sql`SELECT t.*, u.name AS owner_name FROM agent_threads t LEFT JOIN "user" u ON u.id = t.owner_id
    WHERE t.org_id = ${ctx.orgId} AND t.deleted_at IS NULL AND (t.owner_id = ${ctx.userId} OR t.visibility = 'TEAM')
    ORDER BY t.updated_at DESC LIMIT ${limit}`);
}

export async function getThread(ctx: OrgContext, id: string): Promise<ThreadRow> {
  const [t] = await q<ThreadRow>(sql`SELECT t.*, u.name AS owner_name FROM agent_threads t LEFT JOIN "user" u ON u.id = t.owner_id
    WHERE t.id = ${id} AND t.org_id = ${ctx.orgId} AND t.deleted_at IS NULL AND (t.owner_id = ${ctx.userId} OR t.visibility = 'TEAM')`);
  if (!t) throw new NotFoundError("Thread not found");
  return t;
}

async function ownThread(ctx: OrgContext, id: string) {
  const t = await getThread(ctx, id);
  if (t.owner_id !== ctx.userId) throw new ForbiddenError("Only the thread owner can change it");
  return t;
}

export async function updateThread(ctx: OrgContext, id: string, input: { title?: string; visibility?: "PRIVATE" | "TEAM" }) {
  await ownThread(ctx, id);
  if (input.title !== undefined) await q(sql`UPDATE agent_threads SET title = ${input.title.slice(0, 120)} WHERE id = ${id}`);
  if (input.visibility) await q(sql`UPDATE agent_threads SET visibility = ${input.visibility} WHERE id = ${id}`);
}

export async function deleteThread(ctx: OrgContext, id: string) {
  await ownThread(ctx, id);
  await q(sql`UPDATE agent_threads SET deleted_at = now() WHERE id = ${id}`);
}

/** "Always for this thread": future calls of `tool` in this thread skip the confirmation chip. */
export async function allowToolForThread(ctx: OrgContext, id: string, tool: string) {
  await getThread(ctx, id);
  await q(sql`UPDATE agent_threads SET allowed_tools = array_append(allowed_tools, ${tool}) WHERE id = ${id} AND NOT (${tool} = ANY(allowed_tools))`);
}

export async function touchThread(threadId: string) {
  await q(sql`UPDATE agent_threads SET updated_at = now() WHERE id = ${threadId}`);
}

/* ---------------- messages ---------------- */

export type MessageRow = {
  id: string; thread_id: string; role: "user" | "assistant"; author_id: string | null; text: string; transcript: unknown[] | null;
  steps: AgentStep[] | null; sources: AgentSource[] | null; tables: AgentTable[] | null; artifact_ids: string[] | null;
  pending: AgentPending | null; status: string; engine: string | null; skill_slug: string | null; usage: Record<string, number> | null;
  unsourced: string[] | null; created_at: string;
};

export async function getMessages(ctx: OrgContext, threadId: string) {
  await getThread(ctx, threadId);
  return q<MessageRow>(sql`SELECT * FROM agent_messages WHERE thread_id = ${threadId} AND org_id = ${ctx.orgId} ORDER BY created_at ASC, id ASC`);
}

export async function getMessage(ctx: OrgContext, threadId: string, messageId: string) {
  await getThread(ctx, threadId);
  const [m] = await q<MessageRow>(sql`SELECT * FROM agent_messages WHERE id = ${messageId} AND thread_id = ${threadId} AND org_id = ${ctx.orgId}`);
  if (!m) throw new NotFoundError("Message not found");
  return m;
}

export async function addMessage(ctx: OrgContext, threadId: string, input: { role: "user" | "assistant"; text: string; status?: string; skillSlug?: string | null; engine?: string | null }) {
  await getThread(ctx, threadId);
  const id = newId("message");
  await q(sql`INSERT INTO agent_messages (id, thread_id, org_id, role, author_id, text, status, skill_slug, engine)
    VALUES (${id}, ${threadId}, ${ctx.orgId}, ${input.role}, ${input.role === "user" ? ctx.userId : null}, ${input.text}, ${input.status ?? "done"}, ${input.skillSlug ?? null}, ${input.engine ?? null})`);
  await touchThread(threadId);
  return id;
}

export type MessagePatch = Partial<{
  text: string; transcript: unknown[]; steps: AgentStep[]; sources: AgentSource[]; tables: AgentTable[]; artifactIds: string[];
  pending: AgentPending | null; status: string; engine: string; usage: Record<string, number>; unsourced: string[];
}>;

/** Writes the given fields only (callers stream progress by patching `steps`). */
export async function updateMessage(ctx: OrgContext, messageId: string, p: MessagePatch) {
  const sets = [];
  if (p.text !== undefined) sets.push(sql`text = ${p.text}`);
  if (p.transcript !== undefined) sets.push(sql`transcript = ${j(p.transcript)}::jsonb`);
  if (p.steps !== undefined) sets.push(sql`steps = ${j(p.steps)}::jsonb`);
  if (p.sources !== undefined) sets.push(sql`sources = ${j(p.sources)}::jsonb`);
  if (p.tables !== undefined) sets.push(sql`tables = ${j(p.tables)}::jsonb`);
  if (p.artifactIds !== undefined) sets.push(sql`artifact_ids = ${arr(p.artifactIds)}`);
  if (p.pending !== undefined) sets.push(sql`pending = ${j(p.pending)}::jsonb`);
  if (p.status !== undefined) sets.push(sql`status = ${p.status}`);
  if (p.engine !== undefined) sets.push(sql`engine = ${p.engine}`);
  if (p.usage !== undefined) sets.push(sql`usage = ${j(p.usage)}::jsonb`);
  if (p.unsourced !== undefined) sets.push(sql`unsourced = ${arr(p.unsourced)}`);
  if (!sets.length) return;
  await q(sql`UPDATE agent_messages SET ${sql.join(sets, sql`, `)} WHERE id = ${messageId} AND org_id = ${ctx.orgId}`);
}

/* ---------------- artifacts ---------------- */

export async function createArtifact(ctx: OrgContext, input: { threadId: string | null; kind: string; title: string; content: unknown }) {
  const id = newId("artifact");
  await q(sql`INSERT INTO agent_artifacts (id, org_id, thread_id, kind, title, content, created_by)
    VALUES (${id}, ${ctx.orgId}, ${input.threadId}, ${input.kind}, ${input.title.slice(0, 200)}, ${j(input.content)}::jsonb, ${ctx.userId})`);
  return id;
}

export async function getArtifact(ctx: OrgContext, id: string) {
  const [a] = await q<{ id: string; thread_id: string | null; kind: string; title: string; content: unknown; created_at: string; created_by: string }>(
    sql`SELECT a.* FROM agent_artifacts a LEFT JOIN agent_threads t ON t.id = a.thread_id
      WHERE a.id = ${id} AND a.org_id = ${ctx.orgId} AND (a.created_by = ${ctx.userId} OR t.visibility = 'TEAM')`,
  );
  if (!a) throw new NotFoundError("Artifact not found");
  return a;
}

export function getArtifacts(ctx: OrgContext, ids: string[]) {
  if (!ids.length) return Promise.resolve([]);
  return q<{ id: string; kind: string; title: string; content: unknown; created_at: string }>(
    sql`SELECT id, kind, title, content, created_at FROM agent_artifacts WHERE org_id = ${ctx.orgId} AND id = ANY(${arr(ids)})`,
  );
}

/* ---------------- skills ---------------- */

export type SkillInput = { slug: string; name: string; description: string; steps: string[]; inputs?: { name: string; label: string; kind: "text" | "company" | "person" | "investor" | "list" | "search" }[]; outputFormat?: string; visibility?: "PRIVATE" | "TEAM"; status?: "DRAFT" | "SAVED" };
export type SkillRow = { id: string; org_id: string; owner_id: string; owner_name?: string; slug: string; name: string; description: string; steps: string[]; inputs: SkillInput["inputs"] | null; output_format: string; visibility: string; status: string; updated_at: string };

export const SKILL_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

export function listSkills(ctx: OrgContext) {
  return q<SkillRow>(sql`SELECT s.*, u.name AS owner_name FROM skills s LEFT JOIN "user" u ON u.id = s.owner_id
    WHERE s.org_id = ${ctx.orgId} AND s.deleted_at IS NULL AND (s.owner_id = ${ctx.userId} OR (s.visibility = 'TEAM' AND s.status = 'SAVED'))
    ORDER BY s.updated_at DESC`);
}

/** The caller's own skill wins over a teammate's shared skill with the same slug. */
export async function getSkillBySlug(ctx: OrgContext, slug: string): Promise<SkillRow | null> {
  const rows = await q<SkillRow>(sql`SELECT * FROM skills WHERE org_id = ${ctx.orgId} AND slug = ${slug} AND deleted_at IS NULL
    AND (owner_id = ${ctx.userId} OR (visibility = 'TEAM' AND status = 'SAVED')) ORDER BY (owner_id = ${ctx.userId}) DESC LIMIT 1`);
  return rows[0] ?? null;
}

export async function saveSkill(ctx: OrgContext, input: SkillInput, id?: string) {
  if (!canWrite(ctx)) throw new ForbiddenError("Viewers cannot edit skills");
  if (!SKILL_SLUG_RE.test(input.slug)) throw new ForbiddenError("Slug must be 2–40 lowercase letters, digits or dashes");
  const steps = input.steps.map((s) => s.trim()).filter(Boolean).slice(0, 20);
  if (!steps.length) throw new ForbiddenError("A skill needs at least one step");
  if (id) {
    const [own] = await q(sql`SELECT id FROM skills WHERE id = ${id} AND org_id = ${ctx.orgId} AND owner_id = ${ctx.userId} AND deleted_at IS NULL`);
    if (!own) throw new NotFoundError("Skill not found");
    await q(sql`UPDATE skills SET slug = ${input.slug}, name = ${input.name.slice(0, 80)}, description = ${input.description.slice(0, 500)}, steps = ${arr(steps)},
      inputs = ${j(input.inputs ?? [])}::jsonb, output_format = ${(input.outputFormat ?? "").slice(0, 2000)}, visibility = ${input.visibility ?? "PRIVATE"},
      status = ${input.status ?? "SAVED"}, updated_at = now() WHERE id = ${id}`);
    return id;
  }
  const newSkillId = newId("skill");
  await q(sql`INSERT INTO skills (id, org_id, owner_id, slug, name, description, steps, inputs, output_format, visibility, status)
    VALUES (${newSkillId}, ${ctx.orgId}, ${ctx.userId}, ${input.slug}, ${input.name.slice(0, 80)}, ${input.description.slice(0, 500)}, ${arr(steps)},
      ${j(input.inputs ?? [])}::jsonb, ${(input.outputFormat ?? "").slice(0, 2000)}, ${input.visibility ?? "PRIVATE"}, ${input.status ?? "SAVED"})`);
  return newSkillId;
}

export async function deleteSkill(ctx: OrgContext, id: string) {
  const r = await q(sql`UPDATE skills SET deleted_at = now() WHERE id = ${id} AND org_id = ${ctx.orgId} AND owner_id = ${ctx.userId} AND deleted_at IS NULL RETURNING id`);
  if (!r.length) throw new NotFoundError("Skill not found");
}

/* ---------------- personalization ---------------- */

export type AgentInstructions = { role?: string; thesis?: string; stages?: string[]; geographies?: string[]; sectors?: string[]; style?: string; flagCrm?: boolean; notes?: string };

/** Workspace default (user '*') overlaid with the user's own instructions. */
export async function getAgentInstructions(ctx: OrgContext): Promise<{ merged: AgentInstructions; workspace: AgentInstructions; user: AgentInstructions }> {
  const rows = await q<{ user_id: string; instructions: AgentInstructions }>(sql`SELECT user_id, instructions FROM agent_preferences WHERE org_id = ${ctx.orgId} AND user_id IN ('*', ${ctx.userId})`);
  const workspace = rows.find((r) => r.user_id === "*")?.instructions ?? {};
  const user = rows.find((r) => r.user_id === ctx.userId)?.instructions ?? {};
  const merged: AgentInstructions = { ...workspace };
  for (const [k, v] of Object.entries(user)) if (v !== undefined && v !== "" && !(Array.isArray(v) && !v.length)) (merged as Record<string, unknown>)[k] = v;
  return { merged, workspace, user };
}

export async function setAgentInstructions(ctx: OrgContext, scope: "user" | "workspace", instructions: AgentInstructions) {
  if (scope === "workspace" && ctx.role !== "owner" && ctx.role !== "admin") throw new ForbiddenError("Only workspace admins can set workspace defaults");
  const userId = scope === "workspace" ? "*" : ctx.userId;
  await q(sql`INSERT INTO agent_preferences (org_id, user_id, instructions) VALUES (${ctx.orgId}, ${userId}, ${JSON.stringify(instructions)}::jsonb)
    ON CONFLICT (org_id, user_id) DO UPDATE SET instructions = EXCLUDED.instructions, updated_at = now()`);
}

/* ---------------- scheduled skills ---------------- */

export type ScheduleRow = { id: string; org_id: string; user_id: string; skill_slug: string; prompt: string; cadence: "DAILY" | "WEEKLY"; weekday: number | null; hour: number; timezone: string; channels: string[]; status: string; last_run_at: string | null; last_thread_id: string | null };

export async function createSchedule(ctx: OrgContext, input: { skillSlug: string; prompt?: string; cadence: "DAILY" | "WEEKLY"; weekday?: number; hour: number; timezone: string; channels: string[] }) {
  if (!canWrite(ctx)) throw new ForbiddenError("Viewers cannot schedule skills");
  if (input.hour < 0 || input.hour > 23) throw new ForbiddenError("Hour must be 0–23");
  const id = newId("schedule");
  await q(sql`INSERT INTO skill_schedules (id, org_id, user_id, skill_slug, prompt, cadence, weekday, hour, timezone, channels)
    VALUES (${id}, ${ctx.orgId}, ${ctx.userId}, ${input.skillSlug}, ${input.prompt ?? ""}, ${input.cadence}, ${input.cadence === "WEEKLY" ? (input.weekday ?? 1) : null},
      ${input.hour}, ${input.timezone}, ${arr(input.channels.length ? input.channels : ["in_app"])})`);
  return id;
}

export function listSchedules(ctx: OrgContext) {
  return q<ScheduleRow>(sql`SELECT * FROM skill_schedules WHERE org_id = ${ctx.orgId} AND user_id = ${ctx.userId} ORDER BY created_at DESC`);
}

export async function deleteSchedule(ctx: OrgContext, id: string) {
  const r = await q(sql`DELETE FROM skill_schedules WHERE id = ${id} AND org_id = ${ctx.orgId} AND user_id = ${ctx.userId} RETURNING id`);
  if (!r.length) throw new NotFoundError("Schedule not found");
}

/** Platform worker: every ACTIVE schedule (callers decide which are due in each user's timezone). */
export function allActiveSchedules() {
  return q<ScheduleRow & { role: string }>(sql`SELECT s.*, m.role FROM skill_schedules s JOIN member m ON m.organization_id = s.org_id AND m.user_id = s.user_id WHERE s.status = 'ACTIVE'`);
}

export async function markScheduleRun(id: string, threadId: string) {
  await q(sql`UPDATE skill_schedules SET last_run_at = now(), last_thread_id = ${threadId} WHERE id = ${id}`);
}

/* ---------------- usage caps ---------------- */

/** Agent turns this user started today (UTC), from usage_events (surface AGENT). */
export async function agentTurnsToday(ctx: OrgContext) {
  const [r] = await q<{ n: number }>(sql`SELECT count(*)::int AS n FROM usage_events WHERE org_id = ${ctx.orgId} AND actor_id = ${ctx.userId}
    AND surface = 'AGENT' AND operation = 'agent.turn' AND at >= date_trunc('day', now())`);
  return r?.n ?? 0;
}
