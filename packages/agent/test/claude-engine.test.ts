/**
 * Claude engine loop, with a scripted Messages API client (the configured key is not usable in CI):
 * tool_use → our tools → tool_result; the unsourced-number retry; and pause/resume on a write tool
 * with the transcript replayed unchanged.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { config } from "dotenv";
config({ path: "../../.env", quiet: true });

type Block = Record<string, unknown>;
type Req = { messages: { role: string; content: unknown }[]; system: unknown; tools: { name: string }[] };
const script: ((req: Req) => { content: Block[]; stop_reason: string })[] = [];
const requests: Req[] = [];

vi.mock("@founders/core/llm", async (orig) => {
  const real = await orig<typeof import("@founders/core/llm")>();
  return {
    ...real,
    llmAvailable: () => true,
    getLlmClient: () => ({
      beta: {
        messages: {
          create: async (req: Req) => {
            requests.push(JSON.parse(JSON.stringify(req)) as Req);
            const step = script.shift();
            if (!step) throw new Error("script exhausted");
            const r = step(req);
            return { id: `msg_${requests.length}`, type: "message", role: "assistant", model: "test", ...r, usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } };
          },
        },
      },
    }),
  };
});

const { getSql } = await import("@founders/db");
const repo = await import("@founders/core/repo");
const { sql } = await import("drizzle-orm");
const { ask, resumeTurn } = await import("../src/runtime");

const A = { orgId: "org_demo000000000000000000001", userId: "usr_agent_ctest_000000001", role: "owner" as const };
let dbUp = false;
let company = { id: "", name: "", employees: 0 };
const threads: string[] = [];

beforeAll(async () => {
  try {
    const [c] = await repo.rawQuery<{ id: string; name: string; employee_count: number }>(sql`SELECT id, name, employee_count FROM companies WHERE deleted_at IS NULL ORDER BY rank LIMIT 1 OFFSET 9`);
    dbUp = Boolean(c);
    if (c) company = { id: c.id, name: c.name, employees: c.employee_count };
    await repo.grantCredits(A.orgId, 100, "test_topup");
  } catch {
    dbUp = false;
  }
});

afterAll(async () => {
  if (dbUp && threads.length) {
    const s = getSql();
    await s`DELETE FROM agent_messages WHERE thread_id = ANY(${threads})`;
    await s`DELETE FROM agent_threads WHERE id = ANY(${threads})`;
    await s`DELETE FROM usage_events WHERE actor_id = ${A.userId} AND surface = 'AGENT'`;
    await s`UPDATE lists SET deleted_at = now() WHERE org_id = ${A.orgId} AND name = 'Claude test list'`;
  }
  await getSql().end({ timeout: 1 });
});

const text = (t: string) => ({ type: "text", text: t });
const toolUse = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input });

describe("claude engine", () => {
  it("runs tools, retries once to drop unsourced numbers, cites sources and charges by tokens", async () => {
    if (!dbUp) return;
    script.push(
      () => ({ content: [{ type: "thinking", thinking: "", signature: "sig" }, toolUse("tu_1", "get_company", { company_id: company.id })], stop_reason: "tool_use" }),
      () => ({ content: [text(`${company.name} has ${company.employees.toLocaleString("en-US")} employees [[${company.id}]] and $999M revenue.`)], stop_reason: "end_turn" }),
      (req) => {
        const last = req.messages[req.messages.length - 1]!;
        expect(String(last.content)).toContain("$999M");
        return { content: [text(`${company.name} has ${company.employees.toLocaleString("en-US")} employees [[${company.id}]].`)], stop_reason: "end_turn" };
      },
    );
    const r = await ask(A, `how big is @[${company.name}](${company.id})?`);
    threads.push(r.threadId);
    expect(r.message.engine).toBe("claude");
    expect(r.message.status).toBe("done");
    expect(r.message.unsourced).toEqual([]);
    expect((r.message.sources ?? []).some((s) => s.id === company.id)).toBe(true);
    expect((r.message.steps ?? []).map((s) => s.tool)).toEqual(["get_company"]);
    expect(r.message.usage?.credits).toBe(1);
    // Tool results went back as a single user message right after the assistant turn, with source ids.
    const second = requests[requests.length - 2]!;
    const toolResultMsg = second.messages[second.messages.length - 1]!;
    expect(JSON.stringify(toolResultMsg.content)).toContain(`source ids (cite as [[id]]): ${company.id}`);
    // Stable system prompt is cached; personalization/skill text follows it.
    expect(JSON.stringify(second.system)).toContain("ephemeral");
    expect(second.tools.some((t) => t.name === "web_search")).toBe(true);
  });

  it("pauses on a write tool and resumes with the transcript replayed", async () => {
    if (!dbUp) return;
    script.push(() => ({ content: [text("Creating it."), toolUse("tu_w", "create_list", { name: "Claude test list", type: "companies", entity_ids: [company.id] })], stop_reason: "tool_use" }));
    const r = await ask(A, `put @[${company.name}](${company.id}) in a new list`);
    threads.push(r.threadId);
    expect(r.message.status).toBe("awaiting_confirmation");
    expect(r.message.pending?.toolUseId).toBe("tu_w");
    expect(r.message.usage?.credits).toBe(0);

    script.push((req) => {
      const last = req.messages[req.messages.length - 1]!;
      const block = (last.content as Block[])[0]!;
      expect(block.type).toBe("tool_result");
      expect(block.tool_use_id).toBe("tu_w");
      expect(String(block.content)).toContain("added");
      return { content: [text("Done — the list has 1 company.")], stop_reason: "end_turn" };
    });
    await resumeTurn(A, r.threadId, r.messageId, "once");
    const m = await repo.getMessage(A, r.threadId, r.messageId);
    expect(m.status).toBe("done");
    expect(m.text).toContain("Done");
    expect((m.steps ?? []).find((s) => s.tool === "create_list")?.status).toBe("done");
  });
});
