/**
 * Claude engine (plan 10.1): a manual tool-use loop on the Messages API, so a turn can pause on a
 * write tool, persist its transcript, and resume after the user confirms — across serverless
 * requests. Plan → act → answer: Claude chooses the tools; every call goes through the recorder.
 *
 * Model: LLM_MODEL (Claude Opus 5.5 by default) with adaptive thinking (the model default) at
 * medium effort, server-side refusal fallbacks, prompt caching on the stable system prompt, and
 * Anthropic's web_search server tool alongside our client tools.
 */
import Anthropic from "@anthropic-ai/sdk";
import { AGENT_MAX_INPUT_TOKENS_PER_TURN, AGENT_MAX_STEPS } from "@founders/core/limits";
import { getLlmClient, LLM_MODEL, tripLlmBreaker } from "@founders/core/llm";
import type { AgentPending } from "@founders/core/repo";
import { unsourcedNumbers } from "../guard";
import type { TurnRecorder } from "../recorder";
import { TOOL_BY_NAME, toolJsonSchemas } from "../tools";

type Param = Anthropic.Beta.BetaMessageParam;
type ToolResultBlock = Anthropic.Beta.BetaToolResultBlockParam;
type ToolUse = Anthropic.Beta.BetaToolUseBlock;

export type ClaudeTurnState = {
  /** Messages produced in this turn so far (assistant content + tool_result user messages). */
  turn: Param[];
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number };
};

export type ClaudeOutput = { text: string; pending?: AgentPending; state: ClaudeTurnState; error?: string };

const RESULT_MAX_CHARS = 24_000;

function toolResultContent(data: unknown, sourceIds: string[]): string {
  const body = typeof data === "string" ? data : JSON.stringify(data);
  const clipped = body.length > RESULT_MAX_CHARS ? `${body.slice(0, RESULT_MAX_CHARS)}… [truncated]` : body;
  return sourceIds.length ? `${clipped}\n\nsource ids (cite as [[id]]): ${sourceIds.slice(0, 40).join(", ")}` : clipped;
}

function tools(): Anthropic.Beta.BetaToolUnion[] {
  const client: Anthropic.Beta.BetaToolUnion[] = toolJsonSchemas().map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema as Anthropic.Beta.BetaTool.InputSchema }));
  return [...client, { type: "web_search_20260209", name: "web_search", max_uses: 3 }];
}

/**
 * Executes the tool_use blocks of the last assistant message that have no result yet. Read tools
 * run first; a write tool that needs confirmation pauses the turn with the results so far saved.
 */
async function runToolBlocks(rec: TurnRecorder, blocks: ToolUse[], done: ToolResultBlock[], approved?: { toolUseId: string; allow: boolean }): Promise<{ results: ToolResultBlock[]; pending?: AgentPending }> {
  const results = [...done];
  const order = [...blocks].sort((x, y) => Number(Boolean(TOOL_BY_NAME.get(x.name)?.write)) - Number(Boolean(TOOL_BY_NAME.get(y.name)?.write)));
  for (const b of order) {
    if (results.some((r) => r.tool_use_id === b.id)) continue;
    if (approved && approved.toolUseId === b.id && !approved.allow) {
      results.push({ type: "tool_result", tool_use_id: b.id, is_error: true, content: "The user declined this action. Do not retry it; tell the user it was not done." });
      continue;
    }
    const r = await rec.call(b.name, b.input, { toolUseId: b.id, approved: approved?.toolUseId === b.id && approved.allow });
    if (r.kind === "pending") return { results, pending: r.pending };
    if (r.kind === "error") results.push({ type: "tool_result", tool_use_id: b.id, is_error: true, content: r.error });
    else results.push({ type: "tool_result", tool_use_id: b.id, content: toolResultContent(r.result.data, r.result.sources.map((s) => s.id)) });
  }
  return { results };
}

export async function runClaude(
  rec: TurnRecorder,
  opts: { system: { stable: string; dynamic: string }; history: Param[]; userText: string; state?: ClaudeTurnState; approved?: { toolUseId: string; allow: boolean } },
): Promise<ClaudeOutput> {
  const client = getLlmClient();
  const state: ClaudeTurnState = opts.state ?? { turn: [], usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0 } };
  if (!client) return { text: "", state, error: "llm_unavailable" };

  // Resuming after a confirmation: finish the paused tool round first.
  if (opts.approved) {
    const last = state.turn[state.turn.length - 1];
    const prevAssistant = state.turn[state.turn.length - 2];
    const done = last && last.role === "user" && Array.isArray(last.content) ? (last.content as ToolResultBlock[]) : [];
    const blocks = prevAssistant && prevAssistant.role === "assistant" && Array.isArray(prevAssistant.content) ? (prevAssistant.content as Anthropic.Beta.BetaContentBlock[]).filter((b): b is ToolUse => b.type === "tool_use") : [];
    const r = await runToolBlocks(rec, blocks, done, opts.approved);
    state.turn[state.turn.length - 1] = { role: "user", content: r.results };
    if (r.pending) return { text: "", pending: r.pending, state };
  }

  let retriedForSources = false;
  for (let step = 0; step < AGENT_MAX_STEPS; step++) {
    if (state.usage.input_tokens > AGENT_MAX_INPUT_TOKENS_PER_TURN) return { text: "I stopped here: this request reached the per-message usage cap. Try narrowing the question.", state };
    let res: Anthropic.Beta.BetaMessage;
    try {
      res = await client.beta.messages.create({
        model: LLM_MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system: [
          { type: "text", text: opts.system.stable, cache_control: { type: "ephemeral" } },
          ...(opts.system.dynamic ? [{ type: "text" as const, text: opts.system.dynamic }] : []),
        ],
        tools: tools(),
        messages: [...opts.history, { role: "user", content: opts.userText }, ...state.turn],
      });
    } catch (err) {
      if (tripLlmBreaker(err)) return { text: "", state, error: "llm_unavailable" };
      if (err instanceof Anthropic.RateLimitError) return { text: "Claude is busy right now. Please try again in a minute.", state, error: "rate_limited" };
      if (err instanceof Anthropic.APIError) return { text: "", state, error: `api_${String(err.status)}` };
      throw err;
    }
    state.usage.input_tokens += res.usage.input_tokens + (res.usage.cache_creation_input_tokens ?? 0) + (res.usage.cache_read_input_tokens ?? 0);
    state.usage.output_tokens += res.usage.output_tokens;
    state.usage.cache_read_input_tokens += res.usage.cache_read_input_tokens ?? 0;
    state.turn.push({ role: "assistant", content: res.content });

    if (res.stop_reason === "refusal") return { text: "I can't help with that request.", state };
    if (res.stop_reason === "pause_turn") continue;
    const toolUses = res.content.filter((b): b is ToolUse => b.type === "tool_use");
    if (res.stop_reason === "tool_use" && toolUses.length) {
      const r = await runToolBlocks(rec, toolUses, []);
      state.turn.push({ role: "user", content: r.results });
      if (r.pending) return { text: "", pending: r.pending, state };
      continue;
    }
    if (res.stop_reason === "max_tokens") return { text: "The answer was cut off. Ask for a shorter or narrower version.", state };
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
    // Guardrail (plan 10.5): one chance to remove numbers no tool returned.
    const bad = unsourcedNumbers(text, rec.evidence, opts.userText);
    if (bad.length && !retriedForSources) {
      retriedForSources = true;
      state.turn.push({ role: "user", content: `Before I show this answer: these numbers do not appear in any tool result: ${bad.join(", ")}. Rewrite the answer using only numbers returned by tools (call more tools if needed), and keep a [[id]] source chip after each fact.` });
      continue;
    }
    return { text, state };
  }
  return { text: "I reached the step limit for one message. Here is where I got to — ask me to continue.", state };
}
