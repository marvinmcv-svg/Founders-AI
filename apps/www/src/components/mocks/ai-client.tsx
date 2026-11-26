"use client";
/** Interactive mocks for the Agents, API and MCP pages (decorative product UI, fixture data). */
import { useState } from "react";
import { Check, Copy, ShieldCheck } from "lucide-react";
import { cn } from "@founders/ui";
import { CodeBlock } from "@founders/ui/code";

export type ApiSample = { id: string; label: string; method: string; path: string; json: string };

const curl = (base: string, s: ApiSample) =>
  s.method === "GET"
    ? `curl -H "X-API-Key: $FOUNDERS_API_KEY" \\\n  "${base}/api/v1${s.path}"`
    : `curl -X ${s.method} -H "X-API-Key: $FOUNDERS_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  "${base}/api/v1${s.path}" -d '{...}'`;
const py = (base: string, s: ApiSample) => `import requests\n\nres = requests.${s.method.toLowerCase()}(\n    "${base}/api/v1${s.path}",\n    headers={"X-API-Key": FOUNDERS_API_KEY},\n)\nprint(res.json())`;
const js = (base: string, s: ApiSample) => `const res = await fetch("${base}/api/v1${s.path}", {\n  method: "${s.method}",\n  headers: { "X-API-Key": process.env.FOUNDERS_API_KEY },\n});\nconsole.log(await res.json());`;

/** Endpoint sample explorer (plan 6.12 #3): list of samples on the left, response + code tabs on the right. */
export function ApiExplorer({ samples, base }: { samples: ApiSample[]; base: string }) {
  const [id, setId] = useState(samples[0]?.id ?? "");
  const s = samples.find((x) => x.id === id) ?? samples[0];
  if (!s) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <div className="flex flex-col gap-1.5" role="tablist" aria-label="API samples">
        {samples.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={x.id === s.id}
            onClick={() => setId(x.id)}
            className={cn("flex items-center gap-3 rounded-[12px] border px-4 py-3 text-left text-[14px] transition-colors", x.id === s.id ? "border-accent/50 bg-accent/10 text-ink" : "border-line bg-paper text-muted hover:border-line-strong hover:text-ink")}
          >
            <span className={cn("rounded px-1.5 py-0.5 font-mono text-[10.5px] font-semibold", x.method === "GET" ? "bg-info/15 text-info" : "bg-accent/15 text-accent")}>{x.method}</span>
            {x.label}
          </button>
        ))}
      </div>
      <CodeBlock
        key={s.id}
        title={<span className="font-mono text-[12px] text-muted">{`${s.method} ${s.path}`}</span>}
        maxHeight={460}
        tabs={[
          { label: "Response", code: s.json, lang: "json" },
          { label: "cURL", code: curl(base, s), lang: "bash" },
          { label: "Python", code: py(base, s), lang: "python" },
          { label: "JavaScript", code: js(base, s), lang: "js" },
        ]}
      />
    </div>
  );
}

const CLIENTS = [
  { id: "claude", name: "Claude", tint: "#d97757" },
  { id: "chatgpt", name: "ChatGPT", tint: "#10a37f" },
  { id: "cursor", name: "Cursor", tint: "#9aa0a6" },
  { id: "windsurf", name: "Windsurf", tint: "#58c4dc" },
  { id: "opencode", name: "OpenCode", tint: "#d8ff4a" },
];

/** Generic chat mock whose chrome re-skins per MCP client (plan 6.13 #1). No client logos, names only. */
export function McpClientSwitcher({ prompt, toolCalls, answer, server }: { prompt: string; toolCalls: string[]; answer: string[]; server: string }) {
  const [id, setId] = useState(CLIENTS[0]!.id);
  const c = CLIENTS.find((x) => x.id === id) ?? CLIENTS[0]!;
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="MCP clients">
        {CLIENTS.map((x) => (
          <button key={x.id} role="tab" aria-selected={x.id === id} onClick={() => setId(x.id)} className={cn("rounded-full border px-3.5 py-1.5 text-[13px] transition-colors", x.id === id ? "border-accent/60 bg-accent/10 text-ink" : "border-line text-muted hover:text-ink")}>
            {x.name}
          </button>
        ))}
      </div>
      <div aria-hidden className="overflow-hidden rounded-[16px] border border-line-strong bg-paper">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-[12px]">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.tint }} />
          <span className="text-ink">{c.name}</span>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-positive" /> {server}
          </span>
        </div>
        <div className="flex flex-col gap-3 p-4 text-[13px]">
          <div className="ml-auto max-w-[80%] rounded-[14px] rounded-br-sm px-3.5 py-2.5 text-ink" style={{ background: `${c.tint}22` }}>
            {prompt}
          </div>
          <div className="flex flex-col gap-1.5">
            {toolCalls.map((t) => (
              <span key={t} className="inline-flex w-fit items-center gap-2 rounded-md border border-line bg-sunken px-2.5 py-1 font-mono text-[11.5px] text-muted">
                <Check size={12} className="text-positive" /> {t}
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-1.5 text-text">
            {answer.map((a) => (
              <p key={a}>{a}</p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PermissionDialogMock({ title, tool, kind, deny, allow }: { title: string; tool: string; kind: string; deny: string; allow: string }) {
  return (
    <div aria-hidden className="mx-auto max-w-md rounded-[16px] border border-line-strong bg-raised p-5 shadow-[var(--shadow-window)]">
      <div className="flex items-center gap-2 text-[14px] text-ink">
        <ShieldCheck size={16} className="text-accent" /> {title}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-[10px] border border-line bg-sunken px-3 py-2 font-mono text-[12.5px] text-ink">
        {tool}
        <span className="ml-auto rounded bg-warning/15 px-1.5 py-0.5 text-[10.5px] text-warning">{kind}</span>
      </div>
      <div className="mt-4 flex justify-end gap-2 text-[13px]">
        <span className="rounded-full border border-line px-3 py-1.5 text-muted">{deny}</span>
        <span className="rounded-full bg-accent px-3 py-1.5 font-medium text-accent-ink">{allow}</span>
      </div>
    </div>
  );
}

export function CopyUrl({ url, copy, copied }: { url: string; copy: string; copied: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-[12px] border border-line-strong bg-sunken p-1.5 pl-4">
      <code className="min-w-0 flex-1 truncate font-mono text-[13.5px] text-accent">{url}</code>
      <button
        onClick={() => {
          void navigator.clipboard?.writeText(url).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          });
        }}
        className="inline-flex items-center gap-1.5 rounded-[9px] bg-accent px-3 py-2 text-[13px] font-medium text-accent-ink"
      >
        {done ? <Check size={14} /> : <Copy size={14} />}
        {done ? copied : copy}
      </button>
    </div>
  );
}
