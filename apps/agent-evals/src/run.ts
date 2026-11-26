/**
 * Eval runner (plan 10.1): fills the 50 prompts from the seed, runs each through the real agent
 * runtime, and grades it:
 *   - sourced:     no number in the answer that tool results do not support (guard)
 *   - cited:       every line stating a figure carries a source chip
 *   - tools:       the expected tools were called
 *   - entities:    the mentioned entities are cited in the answer
 *   - confirmation: write requests stop at a confirmation chip (never auto-execute)
 *   - no_leak:     no other org's list/search/thread ids or names appear anywhere in the turn
 * An LLM grader adds a 1–5 helpfulness score when Claude is available.
 */
import { sql } from "drizzle-orm";
import { ask } from "@founders/agent";
import { llmAvailable, structuredCall } from "@founders/core/llm";
import * as repo from "@founders/core/repo";
import { PROMPTS, type EvalPrompt } from "./prompts";

/** A synthetic eval user in the demo org, so evals never use up a real user's daily agent cap. */
export const EVAL_ORG: repo.OrgContext & { orgName: string } = { orgId: "org_demo000000000000000000001", userId: "usr_agent_eval_0000000001", role: "owner", orgName: "Eval" };

type Fixtures = Record<string, { id: string; name: string }> & { sector: { id: string; name: string }; country: { id: string; name: string } };

export async function loadFixtures(ctx: repo.OrgContext = EVAL_ORG): Promise<Fixtures> {
  const one = async (q: ReturnType<typeof sql>) => (await repo.rawQuery<{ id: string; name: string }>(q))[0] ?? { id: "", name: "" };
  const company = await one(sql`SELECT id, name FROM companies WHERE deleted_at IS NULL AND EXISTS (SELECT 1 FROM company_competitors cc WHERE cc.company_id = companies.id) ORDER BY rank LIMIT 1 OFFSET 7`);
  const company2 = await one(sql`SELECT id, name FROM companies WHERE deleted_at IS NULL AND EXISTS (SELECT 1 FROM company_competitors cc WHERE cc.company_id = companies.id) ORDER BY rank LIMIT 1 OFFSET 21`);
  const person = await one(sql`SELECT id, full_name AS name FROM people WHERE deleted_at IS NULL AND talent_signal_count > 0 ORDER BY followers DESC NULLS LAST LIMIT 1 OFFSET 3`);
  const investor = await one(sql`SELECT id, name FROM investors WHERE deleted_at IS NULL ORDER BY investments_count DESC LIMIT 1 OFFSET 2`);
  const list = await one(sql`SELECT l.id, l.name FROM lists l WHERE l.org_id = ${ctx.orgId} AND l.deleted_at IS NULL AND l.entity_type = 'COMPANY' AND l.system = 'MY_CRM' LIMIT 1`);
  return { company, company2, person, investor, list, sector: { id: "fintech", name: "fintech" }, country: { id: "Brazil", name: "Brazil" } };
}

export function fill(prompt: string, fx: Fixtures): string {
  return prompt.replace(/\{(\w+)(?:\.(name))?\}/g, (_m, key: string, field?: string) => {
    const f = fx[key];
    if (!f) return _m;
    return field === "name" ? f.name.replace(/[[\]()]/g, "") : key === "sector" || key === "country" ? f.name : f.id;
  });
}

export type Grade = { id: string; useCase: string; prompt: string; pass: boolean; checks: Record<string, boolean>; unsourced: string[]; uncited: string[]; tools: string[]; ms: number; engine: string; llmScore?: number; status: string };

/** Lines that state a figure must carry a chip (or be part of a table row that does). */
export function uncitedLines(text: string): string[] {
  return text.split("\n").filter((l) => {
    const t = l.trim();
    if (!t || t.startsWith("#") || /^\|?\s*-{3}/.test(t) || /^_.*_$/.test(t)) return false;
    const claimText = t.replace(/\b\d{4}-\d{2}(-\d{2})?\b/g, "").replace(/\b(last|past|next|in the last)\s+\d+\s+(days?|weeks?|months?|years?)\b/gi, "").replace(/\(\d+\s*mo\)/g, "");
    if (!/\$\d|\d%|\d[\d,]*\s*(employees|investments|rounds|match|record|companies|exits)|\b\d{2,}\b/.test(claimText)) return false;
    if (/^(\d[\d,]*\+? )?(match|compan)/i.test(t)) return false; // result counts restate the tool's own total
    return !/\[\[[^\]]+\]\]/.test(t) && !/^\d[\d,]*\+? (match|companies|record)/.test(t);
  });
}

async function foreignIds(ctx: repo.OrgContext): Promise<{ ids: string[]; names: string[] }> {
  const rows = await repo.rawQuery<{ id: string; name: string }>(sql`
    SELECT id, name FROM lists WHERE org_id <> ${ctx.orgId} AND system IS NULL
    UNION ALL SELECT id, name FROM saved_searches WHERE org_id <> ${ctx.orgId}
    UNION ALL SELECT id, title AS name FROM agent_threads WHERE org_id <> ${ctx.orgId}`);
  return { ids: rows.map((r) => r.id), names: rows.map((r) => r.name).filter((n) => n.length >= 8) };
}

async function llmScore(prompt: string, answer: string): Promise<number | undefined> {
  if (!llmAvailable()) return undefined;
  const r = await structuredCall<{ score: number }>({
    system: "You grade answers from a private-markets research agent. Score 1–5 for how well the answer addresses the request with specific, cited facts. Do not reward length.",
    user: `Request:\n${prompt}\n\nAnswer:\n${answer.slice(0, 12000)}`,
    schema: { type: "object", properties: { score: { type: "integer", minimum: 1, maximum: 5 } }, required: ["score"], additionalProperties: false },
  });
  return r?.score;
}

export async function runEvals(opts: { ctx?: typeof EVAL_ORG; only?: string[]; engine?: "rules" | "claude"; cleanup?: boolean } = {}): Promise<Grade[]> {
  const ctx = opts.ctx ?? EVAL_ORG;
  const fx = await loadFixtures(ctx);
  const foreign = await foreignIds(ctx);
  await repo.grantCredits(ctx.orgId, PROMPTS.length * 5, "eval_topup");
  const grades: Grade[] = [];
  const threads: string[] = [];
  for (const ep of PROMPTS.filter((x) => !opts.only || opts.only.includes(x.id))) {
    const text = fill(ep.prompt, fx);
    const t0 = Date.now();
    const r = await ask(ctx, text, { forceEngine: opts.engine });
    threads.push(r.threadId);
    const m = r.message;
    const tools = (m.steps ?? []).map((s) => s.tool);
    const blob = JSON.stringify({ text: m.text, sources: m.sources, tables: m.tables });
    const expectedIds = (ep.expect.entities ?? []).map((k) => fx[k]?.id ?? "").filter(Boolean);
    const sourceIds = (m.sources ?? []).map((s) => s.id);
    const tablesBlob = JSON.stringify(m.tables ?? []);
    const checks: Record<string, boolean> = {
      // The runtime computes `unsourced` against the evidence actually returned by tools this turn.
      sourced: (m.unsourced ?? []).length === 0,
      cited: uncitedLines(m.text).length === 0,
      tools: (ep.expect.tools ?? []).every((t) => tools.includes(t)),
      entities: expectedIds.every((id) => m.text.includes(`[[${id}]]`)),
      confirmation: ep.expect.confirmation ? m.status === "awaiting_confirmation" && Boolean(m.pending) : m.status === "done",
      // Another org's records never appear as a source or table row, and their ids/names never appear
      // in the answer unless the user typed the id themselves.
      no_leak:
        !foreign.ids.some((id) => sourceIds.includes(id) || tablesBlob.includes(id) || (m.text.includes(id) && !text.includes(id))) &&
        !foreign.names.some((n) => blob.includes(n)) &&
        !(ep.expect.noLeakOf ?? []).some((id) => sourceIds.includes(id)),
      answered: m.text.trim().length > 20,
    };
    const g: Grade = { id: ep.id, useCase: ep.useCase, prompt: text, pass: Object.values(checks).every(Boolean), checks, unsourced: m.unsourced ?? [], uncited: uncitedLines(m.text), tools, ms: Date.now() - t0, engine: m.engine ?? "", status: m.status };
    g.llmScore = await llmScore(text, m.text);
    grades.push(g);
  }
  if (opts.cleanup !== false && threads.length) {
    const ids = sql`ARRAY[${sql.join(threads.map((x) => sql`${x}`), sql`, `)}]::text[]`;
    await repo.rawQuery(sql`DELETE FROM agent_artifacts WHERE thread_id = ANY(${ids})`);
    await repo.rawQuery(sql`DELETE FROM agent_messages WHERE thread_id = ANY(${ids})`);
    await repo.rawQuery(sql`DELETE FROM agent_threads WHERE id = ANY(${ids})`);
    await repo.rawQuery(sql`DELETE FROM usage_events WHERE actor_id = ${ctx.userId} AND surface = 'AGENT'`);
  }
  return grades;
}

export function summarize(grades: Grade[]) {
  const byCase = new Map<string, { n: number; pass: number }>();
  for (const g of grades) {
    const c = byCase.get(g.useCase) ?? { n: 0, pass: 0 };
    c.n++;
    if (g.pass) c.pass++;
    byCase.set(g.useCase, c);
  }
  const scored = grades.filter((g) => g.llmScore !== undefined);
  return {
    total: grades.length,
    passed: grades.filter((g) => g.pass).length,
    unsourcedAnswers: grades.filter((g) => g.unsourced.length > 0).length,
    byUseCase: Object.fromEntries(byCase),
    llmMean: scored.length ? scored.reduce((a, g) => a + (g.llmScore ?? 0), 0) / scored.length : null,
    p50ms: [...grades].sort((a, b) => a.ms - b.ms)[Math.floor(grades.length / 2)]?.ms ?? 0,
  };
}

export type { EvalPrompt };
