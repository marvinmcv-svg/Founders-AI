/**
 * Agent runtime (plan 10.1): start a turn, execute it with Claude (or the rules engine when Claude
 * is unavailable), pause for confirmations, resume, and charge credits. State lives in Postgres so
 * each step works on any serverless instance; the UI polls the thread while a turn runs.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { AGENT_DAILY_TURNS_PER_USER } from "@founders/core/limits";
import { llmAvailable } from "@founders/core/llm";
import { CREDIT_PRICES } from "@founders/core/pricing";
import * as repo from "@founders/core/repo";
import { collectEvidence, unsourcedNumbers } from "./guard";
import { parseMentions, parseSkillCommand, plainText } from "./mentions";
import { STABLE_SYSTEM, dynamicSystem } from "./prompt";
import { TurnRecorder } from "./recorder";
import { CURATED_BY_SLUG, type Skill } from "./skills";
import { runClaude, type ClaudeTurnState } from "./engine/claude";
import { confirmationText, runRules } from "./engine/rules";
import { TOOL_BY_NAME } from "./tools";

type Ctx = repo.OrgContext & { orgName?: string };
type Param = Anthropic.Beta.BetaMessageParam;

export class AgentLimitError extends Error {}

export const HISTORY_TURNS = 10;

/** Resolves `/slug`: the user's/team's skill first, then the curated library. */
export async function resolveSkill(ctx: repo.OrgContext, slug: string): Promise<Skill | null> {
  const own = await repo.getSkillBySlug(ctx, slug);
  if (own) return { slug: own.slug, name: own.name, description: own.description, steps: own.steps, inputs: own.inputs ?? [], outputFormat: own.output_format, curated: false };
  return CURATED_BY_SLUG.get(slug) ?? null;
}

/** Creates (or continues) a thread and queues the user's message. Returns ids immediately. */
export async function startTurn(ctx: Ctx, input: { threadId?: string | null; text: string; context?: { entityId?: string } | null }) {
  const text = input.text.trim().slice(0, 8000);
  if (!text) throw new AgentLimitError("Type a question or a /skill.");
  if ((await repo.agentTurnsToday(ctx)) >= AGENT_DAILY_TURNS_PER_USER) throw new AgentLimitError(`You reached today's limit of ${AGENT_DAILY_TURNS_PER_USER} agent messages.`);
  if ((await repo.getBalance(ctx.orgId)) < CREDIT_PRICES["agent.turn"]) throw new AgentLimitError("Your workspace is out of credits.");
  let threadId = input.threadId ?? null;
  if (threadId) {
    await repo.getThread(ctx, threadId);
    const busy = (await repo.getMessages(ctx, threadId)).some((m) => m.status === "running" || m.status === "awaiting_confirmation");
    if (busy) throw new AgentLimitError("Finish or answer the current step first.");
  } else {
    const cmd = parseSkillCommand(text);
    const title = cmd ? `/${cmd.slug}${cmd.rest ? ` ${plainText(cmd.rest)}` : ""}` : plainText(text);
    threadId = await repo.createThread(ctx, { title: title.slice(0, 80), context: input.context?.entityId ? { entityId: input.context.entityId } : null });
  }
  await repo.addMessage(ctx, threadId, { role: "user", text });
  const messageId = await repo.addMessage(ctx, threadId, { role: "assistant", text: "", status: "running" });
  return { threadId, messageId };
}

function historyFor(msgs: repo.MessageRow[], upToIndex: number): Param[] {
  const prior = msgs.slice(0, upToIndex);
  // Keep the last HISTORY_TURNS user turns (plan 10.1 cost guardrails).
  const userIdx = prior.map((m, i) => (m.role === "user" ? i : -1)).filter((i) => i >= 0);
  const from = userIdx.length > HISTORY_TURNS ? userIdx[userIdx.length - HISTORY_TURNS]! : 0;
  const out: Param[] = [];
  for (const m of prior.slice(from)) {
    if (m.role === "user") out.push({ role: "user", content: m.text });
    else if (m.status === "done") {
      if (m.engine === "claude" && Array.isArray(m.transcript) && m.transcript.length) out.push(...(m.transcript as Param[]));
      else if (m.text) out.push({ role: "assistant", content: m.text });
    }
  }
  return out;
}

async function chargeTurn(ctx: Ctx, engine: string, usage: Record<string, number>) {
  const tokens = (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
  const credits = engine === "claude" ? Math.max(1, Math.ceil(tokens / 10_000) * CREDIT_PRICES["agent.per_10k_tokens"]) : CREDIT_PRICES["agent.turn"];
  try {
    return (await repo.charge({ orgId: ctx.orgId, actorType: "user", actorId: ctx.userId, surface: "AGENT", operation: "agent.turn", credits, matched: true })).charged;
  } catch (e) {
    if (e instanceof repo.InsufficientCreditsError) return 0; // answered already; the next turn is refused upfront
    throw e;
  }
}

/** Runs the queued assistant message to completion or to its first confirmation. */
export async function executeTurn(ctx: Ctx, threadId: string, messageId: string, opts: { forceEngine?: "rules" | "claude" } = {}) {
  const thread = await repo.getThread(ctx, threadId);
  const msgs = await repo.getMessages(ctx, threadId);
  const idx = msgs.findIndex((m) => m.id === messageId);
  const userMsg = idx > 0 ? msgs[idx - 1] : undefined;
  if (idx < 0 || !userMsg || userMsg.role !== "user") throw new repo.NotFoundError("Message not found");
  const raw = userMsg.text;
  const cmd = parseSkillCommand(raw);
  const skill = cmd ? await resolveSkill(ctx, cmd.slug) : null;
  const text = cmd && !skill ? raw : cmd ? cmd.rest : raw;
  const { merged: instructions } = await repo.getAgentInstructions(ctx);
  const contextEntityId = typeof thread.context?.entityId === "string" ? thread.context.entityId : null;
  const rec = new TurnRecorder(ctx, threadId, messageId, thread.allowed_tools);
  const useClaude = opts.forceEngine ? opts.forceEngine === "claude" : llmAvailable();
  let engine = "rules";
  let answer = "";
  let pending: repo.AgentPending | undefined;
  let transcript: unknown[] = [];
  let usage: Record<string, number> = {};
  let title: string | undefined;

  try {
    if (useClaude) {
      const out = await runClaude(rec, {
        system: { stable: STABLE_SYSTEM, dynamic: dynamicSystem({ instructions, orgName: ctx.orgName ?? "", contextEntityId, skill, skillInput: cmd?.rest ?? "", today: new Date().toISOString().slice(0, 10) }) },
        history: historyFor(msgs, idx - 1),
        userText: skill ? `/${skill.slug} ${cmd?.rest ?? ""}`.trim() : raw,
      });
      if (out.error === "llm_unavailable") engine = "rules";
      else {
        engine = "claude";
        answer = out.text;
        pending = out.pending;
        transcript = out.state.turn;
        usage = out.state.usage;
      }
    }
    if (engine === "rules") {
      const out = await runRules(rec, { text, mentions: parseMentions(raw), skill, skillInput: cmd?.rest ?? "", instructions, contextEntityId });
      answer = out.text;
      pending = out.pending;
      title = out.title;
    }
  } catch (e) {
    await repo.updateMessage(ctx, messageId, { status: "error", text: `Something went wrong: ${e instanceof Error ? e.message.slice(0, 300) : String(e)}`, engine });
    throw e;
  }

  const unsourced = unsourcedNumbers(answer, rec.evidence, raw);
  const charged = pending ? 0 : await chargeTurn(ctx, engine, usage);
  await repo.updateMessage(ctx, messageId, {
    text: answer, engine, transcript, usage: { ...usage, credits: charged }, unsourced, pending: pending ?? null,
    status: pending ? "awaiting_confirmation" : "done", steps: rec.steps, sources: rec.sources, tables: rec.tables, artifactIds: rec.artifactIds,
  });
  if (title && msgs.filter((m) => m.role === "user").length === 1 && /^\/|^.{0,80}$/.test(thread.title)) await repo.updateThread(ctx, threadId, { title }).catch(() => undefined);
  await repo.touchThread(threadId);
  return { messageId, status: pending ? "awaiting_confirmation" : "done" };
}

/** The user answered a confirmation chip: Allow once / Always for this thread / Deny. */
export async function resumeTurn(ctx: Ctx, threadId: string, messageId: string, decision: "once" | "always" | "deny") {
  const thread = await repo.getThread(ctx, threadId);
  const m = await repo.getMessage(ctx, threadId, messageId);
  if (m.status !== "awaiting_confirmation" || !m.pending) throw new AgentLimitError("Nothing is waiting for confirmation.");
  const pending = m.pending;
  if (!TOOL_BY_NAME.get(pending.tool)?.write) throw new AgentLimitError("Unknown action.");
  if (decision === "always") await repo.allowToolForThread(ctx, threadId, pending.tool);
  const allow = decision !== "deny";
  await repo.updateMessage(ctx, messageId, { status: "running" });
  const rec = new TurnRecorder(ctx, threadId, messageId, [...thread.allowed_tools, ...(decision === "always" ? [pending.tool] : [])]);
  const transcript = (m.transcript ?? []) as Param[];
  rec.load(m, collectEvidence(transcript.filter((t) => t.role === "user")));
  const msgs = await repo.getMessages(ctx, threadId);
  const idx = msgs.findIndex((x) => x.id === messageId);
  const userText = msgs[idx - 1]?.text ?? "";
  let text = m.text;
  let next: repo.AgentPending | undefined;
  let usage: Record<string, number> = m.usage ?? {};
  let newTranscript: unknown[] = transcript;

  if (m.engine === "claude") {
    const state: ClaudeTurnState = { turn: transcript, usage: { input_tokens: usage.input_tokens ?? 0, output_tokens: usage.output_tokens ?? 0, cache_read_input_tokens: usage.cache_read_input_tokens ?? 0 } };
    const { merged: instructions } = await repo.getAgentInstructions(ctx);
    const contextEntityId = typeof thread.context?.entityId === "string" ? thread.context.entityId : null;
    const cmd = parseSkillCommand(userText);
    const skill = cmd ? await resolveSkill(ctx, cmd.slug) : null;
    const out = await runClaude(rec, {
      system: { stable: STABLE_SYSTEM, dynamic: dynamicSystem({ instructions, orgName: ctx.orgName ?? "", contextEntityId, skill, skillInput: cmd?.rest ?? "", today: new Date().toISOString().slice(0, 10) }) },
      history: historyFor(msgs, idx - 1),
      userText: skill ? `/${skill.slug} ${cmd?.rest ?? ""}`.trim() : userText,
      state,
      approved: { toolUseId: pending.toolUseId, allow },
    });
    text = out.error ? `${text}\n\n${allow ? "I couldn't finish after your confirmation." : "Okay, I didn't do that."}` : out.text;
    next = out.pending;
    newTranscript = out.state.turn;
    usage = out.state.usage;
  } else if (allow) {
    const r = await rec.call(pending.tool, pending.input, { approved: true });
    text += r.kind === "ok" ? confirmationText(r.result) : `\n\nI couldn't do that: ${r.kind === "error" ? r.error : "it needs confirmation again"}.`;
  } else {
    await rec.deny(pending);
    text += "\n\nOkay, I didn't do that.";
  }

  const charged = next ? 0 : await chargeTurn(ctx, m.engine ?? "rules", usage);
  await repo.updateMessage(ctx, messageId, {
    text, transcript: newTranscript, usage: { ...usage, credits: charged }, unsourced: unsourcedNumbers(text, rec.evidence, userText),
    pending: next ?? null, status: next ? "awaiting_confirmation" : "done", steps: rec.steps, sources: rec.sources, tables: rec.tables, artifactIds: rec.artifactIds,
  });
  return { status: next ? "awaiting_confirmation" : "done" };
}

/** Convenience for jobs and tests: start + execute in one call. */
export async function ask(ctx: Ctx, text: string, opts: { threadId?: string | null; forceEngine?: "rules" | "claude"; context?: { entityId?: string } | null } = {}) {
  const { threadId, messageId } = await startTurn(ctx, { threadId: opts.threadId, text, context: opts.context });
  await executeTurn(ctx, threadId, messageId, { forceEngine: opts.forceEngine });
  return { threadId, messageId, message: await repo.getMessage(ctx, threadId, messageId) };
}
