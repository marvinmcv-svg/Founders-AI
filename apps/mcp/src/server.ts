/**
 * MCP server factory (plan 12). One McpServer per request (stateless Streamable HTTP, 2026-07-28
 * envelope with the stateless 2025 fallback for older clients), bound to the caller's principal.
 */
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { brand } from "@founders/config";
import { MCP_FREE_CALLS_PER_DAY } from "@founders/core/limits";
import * as repo from "@founders/core/repo";
import { TOOLS, type McpPrincipal } from "./tools";

export const SERVER_INFO = { name: "founders-ai", title: `${brand.name}`, version: "1.0.0" };

export const INSTRUCTIONS = `${brand.name}: private-markets data (companies, people, investors, funding rounds, talent and news signals, revenue/valuation estimates) plus the user's lists and saved searches.
Start with find_company / find_person / find_investor (free) or search (plain English), then use the ids with the get_* tools. Revenue and valuation are model estimates with a P10–P90 range. Results are paginated: pass next_cursor to continue.
Each user has ${MCP_FREE_CALLS_PER_DAY} free calls per day; write tools change the workspace and should be confirmed with the user.`;

/** Wraps a tool: allowance pre-check → run → meter; errors come back as tool errors, not protocol errors. */
async function invoke(p: McpPrincipal, name: string, input: unknown) {
  const tool = TOOLS.find((t) => t.name === name)!;
  try {
    await repo.assertMcpAllowance(p, tool.paid);
    const out = await tool.run(p, input as never);
    const m = await repo.meterMcpCall(p, { tool: name, credits: tool.paid ? out.credits : 0, paid: tool.paid, matched: out.matched });
    const meta = `\n\n_${m.charged ? `${m.charged} credit${m.charged === 1 ? "" : "s"} charged · ` : ""}${m.freeCallsLeft} free call${m.freeCallsLeft === 1 ? "" : "s"} left today_`;
    return {
      content: [{ type: "text" as const, text: out.markdown + meta }],
      structuredContent: { ...out.data, _meta_usage: { credits_charged: m.charged, credits_remaining: m.remaining, free_calls_left_today: m.freeCallsLeft } },
    };
  } catch (e) {
    const msg =
      e instanceof repo.McpLimitError || e instanceof repo.NotFoundError || e instanceof repo.ForbiddenError
        ? e.message
        : e instanceof Error && e.message.startsWith("Invalid filter")
          ? e.message
          : "Something went wrong running this tool. Try again, or narrow the request.";
    if (!(e instanceof repo.McpLimitError || e instanceof repo.NotFoundError || e instanceof repo.ForbiddenError)) console.error(`[mcp] ${name}`, e);
    return { content: [{ type: "text" as const, text: msg }], isError: true };
  }
}

export function createFoundersMcpServer(p: McpPrincipal): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS });
  for (const t of TOOLS) {
    server.registerTool(
      t.name,
      {
        title: t.title,
        description: t.description,
        inputSchema: t.input,
        annotations: {
          title: t.title,
          readOnlyHint: !t.write,
          destructiveHint: Boolean(t.destructive),
          idempotentHint: !t.write,
          openWorldHint: false,
        },
      },
      async (args: unknown) => invoke(p, t.name, args),
    );
  }

  // Server prompts (plan 12).
  server.registerPrompt(
    "qualify_competitors",
    { title: "Qualify competitors of a company", description: "Map and rank a company's competitors by overlap and momentum.", argsSchema: z.object({ company: z.string().min(1).describe("Company name or domain") }) },
    ({ company }) => ({
      messages: [{ role: "user" as const, content: { type: "text" as const, text: `Use find_company to resolve "${company}", then get_company_profile and get_company_competitors. Build a table of the closest competitors (overlap, stage, HQ, headcount growth, funding) and say which are the strongest threats and why. Cite company ids.` } }],
    }),
  );
  server.registerPrompt(
    "weekly_saved_search_digest",
    { title: "Weekly saved-search digest", description: "Summarise what is new across my saved searches." },
    () => ({
      messages: [{ role: "user" as const, content: { type: "text" as const, text: "Call get_saved_searches, then get_saved_search_items with since_last_read: true for each search that has new results. Write a short digest per search: what is new and the 3 most interesting records, with ids." } }],
    }),
  );
  server.registerPrompt(
    "warm_paths_to_list",
    { title: "Warm paths to a list", description: "Find warm introduction paths to the companies on a list.", argsSchema: z.object({ list: z.string().min(1).describe("List name or id") }) },
    ({ list }) => ({
      messages: [{ role: "user" as const, content: { type: "text" as const, text: `Call get_lists and find the list "${list}", then get_list_items. For each company, use get_company_people and get_company_funding to find founders and investors, and suggest the most promising warm-intro path (shared investors, former colleagues).` } }],
    }),
  );
  return server;
}

/** Streamable HTTP handler; `principal` arrives through `authInfo.extra` from the authenticated route. */
export const mcpHttp = createMcpHandler(
  (ctx) => {
    const p = ctx.authInfo?.extra?.principal as McpPrincipal | undefined;
    if (!p) throw new Error("MCP request without an authenticated principal");
    return createFoundersMcpServer(p);
  },
  { onerror: (e) => console.error("[mcp]", e.message) },
);

export function serveMcp(req: Request, p: McpPrincipal): Promise<Response> {
  return mcpHttp.fetch(req, { authInfo: { token: "verified", clientId: p.clientId, scopes: [], extra: { principal: p } } });
}
