/**
 * MCP server tests (plan 12 / 15 Phase 7): the 29-tool inventory and annotations, protocol round
 * trips through the HTTP handler, metering (100 free/day, overage), tenancy, and principals.
 */
import { MCP_TOOL_COUNT, MCP_WRITE_TOOL_COUNT } from "@founders/core/limits";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
config({ path: new URL("../../../.env", import.meta.url).pathname, quiet: true });
import { getSql } from "@founders/db";
import { MCP_FREE_CALLS_PER_DAY } from "@founders/core/limits";
import * as repo from "@founders/core/repo";
import { ORG_CLAIM, principalFromClaims, serveMcp, TOOLS, type McpPrincipal } from "../src";

const ORG = "org_demo000000000000000000001";
const P: McpPrincipal = { orgId: ORG, userId: "usr_mcp_test_00000000001", role: "owner", via: "api_key", clientId: "test" };
const SECRET_LIST_OF_OTHER_ORG = "lst_other_org_secret_0000001";

const SPEC = {
  read: ["find_company", "find_person", "find_investor", "search", "get_company_profile", "get_company_competitors", "get_company_funding", "get_company_revenue", "get_company_valuation", "get_company_news", "get_company_investor_interest", "get_company_people", "get_company_traction", "get_company_transactions", "get_person_profile", "get_person_email", "get_person_talent_signals", "get_investor_profile", "get_investor_rounds", "get_investor_interest_signals", "get_lists", "get_list_items", "get_saved_searches", "get_saved_search_items"],
  write: ["create_list", "add_to_list", "remove_from_list", "create_saved_search", "update_saved_search"],
};

let dbUp = false;
let companyId = "";

async function rpc(method: string, params: object, p: McpPrincipal = P) {
  const req = new Request("http://localhost/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const res = await serveMcp(req, p);
  const text = await res.text();
  const line = text.split("\n").find((l) => l.startsWith("data: ")) ?? text;
  return JSON.parse(line.replace(/^data: /, "")) as { result: { content?: { text: string }[]; isError?: boolean; structuredContent?: Record<string, unknown>; tools?: { name: string; annotations: Record<string, boolean> }[] } };
}
const call = (name: string, args: object, p: McpPrincipal = P) => rpc("tools/call", { name, arguments: args }, p);
const clearUsage = () => getSql()`DELETE FROM usage_events WHERE actor_id = ${P.userId}`;

beforeAll(async () => {
  try {
    const [c] = await getSql()<{ id: string }[]>`SELECT id FROM companies WHERE deleted_at IS NULL ORDER BY rank LIMIT 1 OFFSET 3`;
    dbUp = Boolean(c);
    companyId = c?.id ?? "";
  } catch {
    dbUp = false;
  }
  if (dbUp) {
    await clearUsage();
    await repo.grantCredits(ORG, 100, "test_topup");
  }
});

afterAll(async () => {
  if (dbUp) {
    await clearUsage();
    await getSql()`UPDATE organization SET mcp_overage_enabled = false WHERE id = ${ORG}`;
    await getSql()`UPDATE lists SET deleted_at = now() WHERE org_id = ${ORG} AND name = 'MCP test list'`;
  }
  await getSql().end({ timeout: 1 });
});

describe("inventory", () => {
  it("has the 29 tools of plan 12: 24 read + 5 write", () => {
    expect(TOOLS).toHaveLength(29);
    expect(TOOLS).toHaveLength(MCP_TOOL_COUNT);
    expect(TOOLS.filter((t) => t.write)).toHaveLength(MCP_WRITE_TOOL_COUNT);
    expect(TOOLS.filter((t) => !t.write).map((t) => t.name).sort()).toEqual([...SPEC.read].sort());
    expect(TOOLS.filter((t) => t.write).map((t) => t.name).sort()).toEqual([...SPEC.write].sort());
    // Resolve and list/search management are free; intelligence tools are paid.
    for (const n of ["find_company", "find_person", "find_investor", "get_lists", "get_saved_searches", ...SPEC.write]) expect(TOOLS.find((t) => t.name === n)!.paid).toBe(false);
    for (const n of ["search", "get_company_profile", "get_person_email", "get_list_items", "get_saved_search_items"]) expect(TOOLS.find((t) => t.name === n)!.paid).toBe(true);
  });

  it("advertises read-only / destructive hints so clients confirm writes", async () => {
    if (!dbUp) return;
    const r = await rpc("tools/list", {});
    const tools = r.result.tools!;
    expect(tools).toHaveLength(29);
    for (const t of tools) expect(t.annotations.readOnlyHint).toBe(SPEC.read.includes(t.name));
    expect(tools.find((t) => t.name === "remove_from_list")!.annotations.destructiveHint).toBe(true);
    const prompts = await rpc("prompts/list", {});
    expect(JSON.stringify(prompts)).toContain("qualify_competitors");
  });
});

describe("tools", () => {
  it("returns compact markdown plus structured data, and records usage", async () => {
    if (!dbUp) return;
    await clearUsage();
    const r = await call("get_company_profile", { company_id: companyId });
    expect(r.result.isError).toBeFalsy();
    expect(r.result.content![0]!.text).toContain(companyId);
    expect(r.result.content![0]!.text.length).toBeLessThan(16_000);
    expect(r.result.structuredContent).toMatchObject({ id: companyId });
    expect(await repo.mcpCallsToday(P)).toBe(1);
  });

  it("pages with next_cursor and keeps results inside the workspace", async () => {
    if (!dbUp) return;
    const first = await call("search", { query: "fintech companies in Brazil", limit: 5 });
    const next = first.result.structuredContent!.next_cursor as string;
    expect(next).toBeTruthy();
    const second = await call("search", { query: "fintech companies in Brazil", limit: 5, cursor: next });
    expect(JSON.stringify(second.result.structuredContent!.items)).not.toBe(JSON.stringify(first.result.structuredContent!.items));
    const leak = await call("get_list_items", { list_id: SECRET_LIST_OF_OTHER_ORG });
    expect(leak.result.isError).toBe(true);
    expect(leak.result.content![0]!.text).not.toContain("secret");
  });

  it("write tools change the workspace", async () => {
    if (!dbUp) return;
    const r = await call("create_list", { name: "MCP test list", type: "companies", entity_ids: [companyId] });
    expect(r.result.content![0]!.text).toMatch(/with 1 record/);
    const listId = r.result.structuredContent!.list_id as string;
    const rm = await call("remove_from_list", { list_id: listId, entity_ids: [companyId] });
    expect(rm.result.structuredContent!.removed).toBe(1);
  });

  it("R3 interest tools answer that they are coming, for free", async () => {
    if (!dbUp) return;
    const r = await call("get_company_investor_interest", { company_id: companyId });
    expect(r.result.content![0]!.text).toMatch(/not enabled for this workspace/);
    expect((r.result.structuredContent!._meta_usage as { credits_charged: number }).credits_charged).toBe(0);
  });
});

describe("metering", () => {
  it(`after ${MCP_FREE_CALLS_PER_DAY} calls paid tools stop unless overage is on; free tools keep working`, async () => {
    if (!dbUp) return;
    await clearUsage();
    await getSql()`INSERT INTO usage_events (id, org_id, actor_type, actor_id, surface, operation, matched, credits)
      SELECT 'evt_mcptest_' || g, ${ORG}, 'mcp_client', ${P.userId}, 'MCP', 'mcp.test', true, 0 FROM generate_series(1, ${MCP_FREE_CALLS_PER_DAY}) g`;
    await getSql()`UPDATE organization SET mcp_overage_enabled = false WHERE id = ${ORG}`;
    const blocked = await call("get_company_profile", { company_id: companyId });
    expect(blocked.result.isError).toBe(true);
    expect(blocked.result.content![0]!.text).toMatch(/free MCP calls.*00:00 UTC/s);
    const free = await call("get_lists", {});
    expect(free.result.isError).toBeFalsy();

    await getSql()`UPDATE organization SET mcp_overage_enabled = true WHERE id = ${ORG}`;
    // Other suites charge the same demo org in parallel, so assert on this call's own charge.
    const usage = (r: Awaited<ReturnType<typeof call>>) => r.result.structuredContent?._meta_usage as { credits_charged: number } | undefined;
    const paid = await call("get_company_profile", { company_id: companyId });
    expect(paid.result.isError).toBeFalsy();
    expect(usage(paid)?.credits_charged).toBe(1);
    // Misses are free even in overage.
    const missed = await call("get_company_profile", { company_id: "com_000000000000000000000000" });
    expect(missed.result.content![0]!.text).toMatch(/Misses are free/);
    expect(usage(missed)?.credits_charged).toBe(0);
  });
});

describe("principals", () => {
  it("OAuth claims map to a workspace the user still belongs to", async () => {
    if (!dbUp) return;
    const ok = await principalFromClaims({ sub: "usr_demo000000000000000000001", [ORG_CLAIM]: ORG, azp: "client" });
    expect(ok).toMatchObject({ orgId: ORG, via: "oauth", clientId: "client" });
    expect(await principalFromClaims({ sub: "usr_demo000000000000000000001", [ORG_CLAIM]: "org_demo000000000000000000002" })).toBeNull();
    expect(await principalFromClaims({ sub: "usr_nobody" })).toBeNull();
  });
});

