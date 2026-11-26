"use client";
import { useState, useTransition } from "react";
import type { AgentInstructions } from "@founders/core/repo";
import { Button, Card } from "@founders/ui";
import { saveAgentInstructions } from "@/app/agent-actions";

const input = "w-full rounded-md border border-line bg-sunken px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-accent/60";
const list = (v?: string[]) => (v ?? []).join(", ");
const parse = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 20);

function Form({ title, hint, initial, scope }: { title: string; hint: string; initial: AgentInstructions; scope: "user" | "workspace" }) {
  const [v, setV] = useState({ role: initial.role ?? "", thesis: initial.thesis ?? "", sectors: list(initial.sectors), stages: list(initial.stages), geographies: list(initial.geographies), style: initial.style ?? "", notes: initial.notes ?? "", flagCrm: Boolean(initial.flagCrm) });
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const field = (k: keyof typeof v, label: string, placeholder: string, area = false) => (
    <label className="flex flex-col gap-1 text-[12px] text-muted">
      {label}
      {area ? <textarea rows={3} className={input} value={String(v[k])} placeholder={placeholder} onChange={(e) => setV({ ...v, [k]: e.target.value })} /> : <input className={input} value={String(v[k])} placeholder={placeholder} onChange={(e) => setV({ ...v, [k]: e.target.value })} />}
    </label>
  );
  return (
    <Card className="mb-5 p-5">
      <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
      <p className="mb-4 text-[12.5px] text-faint">{hint}</p>
      <div className="grid gap-3 md:grid-cols-2">
        {field("role", "Role", "e.g. Partner at a seed fund")}
        {field("style", "Answer style", "e.g. Bullets first, short, include a table")}
        <div className="md:col-span-2">{field("thesis", "Thesis", "e.g. B2B fintech infrastructure in LatAm with strong engineering teams", true)}</div>
        {field("sectors", "Sectors (comma-separated)", "Fintech, AI")}
        {field("stages", "Stages (comma-separated)", "Pre-seed / Seed, Early")}
        {field("geographies", "Geographies (comma-separated)", "Brazil, Mexico, Colombia")}
        <label className="flex items-center gap-2 self-end pb-1.5 text-[12.5px] text-muted"><input type="checkbox" checked={v.flagCrm} onChange={(e) => setV({ ...v, flagCrm: e.target.checked })} /> Flag anything already in My CRM</label>
        <div className="md:col-span-2">{field("notes", "Other instructions", "Anything else the agent should always do", true)}</div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button size="sm" disabled={pending} onClick={() => start(async () => {
          const r = await saveAgentInstructions(scope, { role: v.role.trim() || undefined, thesis: v.thesis.trim() || undefined, sectors: parse(v.sectors), stages: parse(v.stages), geographies: parse(v.geographies), style: v.style.trim() || undefined, notes: v.notes.trim() || undefined, flagCrm: v.flagCrm });
          setMsg(r.ok ? "Saved." : r.error);
        })}>Save</Button>
        {msg ? <span className="text-[12.5px] text-accent">{msg}</span> : null}
      </div>
    </Card>
  );
}

export function PersonalizationClient({ user, workspace, isAdmin }: { user: AgentInstructions; workspace: AgentInstructions; isAdmin: boolean }) {
  return (
    <>
      <Form title="Your instructions" hint="Only you see these. Pre-filled from your onboarding thesis." initial={user} scope="user" />
      {isAdmin ? <Form title="Workspace defaults" hint="Apply to everyone in the workspace unless they set their own." initial={workspace} scope="workspace" /> : null}
    </>
  );
}
