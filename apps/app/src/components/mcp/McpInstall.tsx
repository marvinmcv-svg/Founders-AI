/**
 * MCP install guide (plan 12): one server URL, OAuth sign-in, and the per-client setup. Used on
 * Settings → MCP and on the public /developers page.
 */
import { brand } from "@founders/config";
import { MCP_FREE_CALLS_PER_DAY } from "@founders/core/limits";
import { CopyBlock } from "./CopyBlock";

export function McpInstall({ url }: { url: string }) {
  const name = brand.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const json = (o: unknown) => JSON.stringify(o, null, 2);
  const clients: { title: string; steps: string[]; code?: string }[] = [
    { title: "Claude (claude.ai and Claude Desktop)", steps: ["Settings → Connectors → Add custom connector.", `Name it "${brand.name}" and paste the server URL.`, "Click Connect, sign in, pick your workspace and Allow."] },
    { title: "Claude Code", steps: ["Run this, then `/mcp` in Claude Code to sign in:"], code: `claude mcp add --transport http ${name} ${url}` },
    { title: "ChatGPT", steps: ["Settings → Apps & Connectors → Advanced → enable developer mode.", "Create connector → paste the server URL, authentication OAuth.", "Sign in, pick your workspace and Allow."] },
    { title: "Cursor", steps: ["Add to ~/.cursor/mcp.json, then sign in when Cursor prompts:"], code: json({ mcpServers: { [name]: { url } } }) },
    { title: "Windsurf", steps: ["Add to ~/.codeium/windsurf/mcp_config.json:"], code: json({ mcpServers: { [name]: { serverUrl: url } } }) },
    { title: "OpenCode", steps: ["Add to opencode.json, then run `opencode mcp auth " + name + "`:"], code: json({ $schema: "https://opencode.ai/config.json", mcp: { [name]: { type: "remote", url } } }) },
    { title: "Any client with an API key (no OAuth)", steps: ["Send an API key from Settings → API keys as a bearer token:"], code: json({ mcpServers: { [name]: { url, headers: { Authorization: "Bearer fai_…" } } } }) },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-1 text-[12px] text-muted">Server URL (Streamable HTTP, OAuth 2.1)</p>
        <CopyBlock text={url} />
        <p className="mt-1.5 text-[12px] text-faint">29 tools: resolve and search, company/person/investor intelligence, lists and saved searches. {MCP_FREE_CALLS_PER_DAY} free calls per user per day; tools that change your lists ask first.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {clients.map((c) => (
          <div key={c.title} className="rounded-xl border border-line p-3.5">
            <p className="mb-1.5 text-[13px] font-medium text-ink">{c.title}</p>
            <ol className="mb-2 list-decimal pl-4 text-[12.5px] text-muted">{c.steps.map((s) => <li key={s}>{s}</li>)}</ol>
            {c.code ? <CopyBlock text={c.code} /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
