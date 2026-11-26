/**
 * The single place that talks to Claude (plan 0A: provider wrapped so it can be swapped).
 * Uses the official Anthropic SDK with structured outputs. Returns null when no key is set.
 */
import Anthropic from "@anthropic-ai/sdk";

export const LLM_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic();
  return client;
}

/**
 * Circuit breaker: an auth/permission failure means every later call fails the same way, so the
 * process stops calling Claude and every caller uses its deterministic fallback.
 */
let disabledReason: string | null = null;

export function llmAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY) && !disabledReason;
}

export function llmStatus(): { available: boolean; model: string; reason: string | null } {
  return { available: llmAvailable(), model: LLM_MODEL, reason: process.env.ANTHROPIC_API_KEY ? disabledReason : "ANTHROPIC_API_KEY not set" };
}

/**
 * One structured-output call. The schema constrains the reply to JSON; the caller still
 * validates semantics. Server-side fallbacks are on so a policy decline is retried on the
 * routed fallback model inside the same call.
 */
export async function structuredCall<T>(opts: {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
}): Promise<T | null> {
  const c = getClient();
  if (!c || disabledReason) return null;
  let res;
  try {
    res = await c.beta.messages.create({
    model: LLM_MODEL,
    max_tokens: opts.maxTokens ?? 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: opts.system,
    output_config: { effort: opts.effort ?? "low", format: { type: "json_schema", schema: opts.schema } },
    messages: [{ role: "user", content: opts.user }],
    });
  } catch (err) {
    // Never let an LLM outage break a pipeline or a page: callers fall back to rules.
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      disabledReason = `${err.status} ${err.name}`;
    }
    return null;
  }
  if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return null;
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
