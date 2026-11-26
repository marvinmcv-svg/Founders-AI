"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent } from "react";
import { ArrowUp, Check, ChevronDown, ChevronRight, CircleAlert, FileText, Loader2, Lock, Pencil, ShieldQuestion, Sparkles, Trash2, Users, X } from "lucide-react";
import type { AgentSource, AgentStep, AgentTable, MessageRow } from "@founders/core/repo";
import { Button, cn } from "@founders/ui";
import { quickSearch } from "@/app/actions";
import { confirmAgentAction, deleteAgentThread, runAgentMessage, saveAgentTableToList, sendAgentMessage, updateAgentThread } from "@/app/agent-actions";
import { Markdown, type SourceMap } from "./Markdown";

export type ChatMessage = Omit<MessageRow, "transcript">;
export type SkillOption = { slug: string; name: string; description: string };
export type Pickable = { id: string; name: string };
type ArtifactRef = { id: string; kind: string; title: string };
type ThreadInfo = { id: string; title: string; visibility: "PRIVATE" | "TEAM"; mine: boolean };

/* ---------------- composer ---------------- */

type Suggestion = { key: string; label: string; sub: string; insert: string };

function triggerAt(text: string, caret: number): { sigil: "@" | "#" | "/"; term: string; start: number } | null {
  const before = text.slice(0, caret);
  const m = before.match(/(^|\s)([@#/])([^\s@#/[\]]{0,40})$/);
  if (!m) return null;
  const sigil = m[2] as "@" | "#" | "/";
  if (sigil === "/" && before.slice(0, before.length - m[3]!.length - 1).trim() !== "") return null; // skills only at the start
  return { sigil, term: m[3]!, start: caret - m[3]!.length - 1 };
}

export function Composer({ onSend, disabled, skills, lists, searches, initial, autoFocus }: { onSend: (text: string) => void; disabled?: boolean; skills: SkillOption[]; lists: Pickable[]; searches: Pickable[]; initial?: string; autoFocus?: boolean }) {
  const [text, setText] = useState(initial ?? "");
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const reqId = useRef(0);

  const refresh = useCallback(async (value: string, caret: number) => {
    const t = triggerAt(value, caret);
    if (!t) return setSugs([]);
    const term = t.term.toLowerCase();
    if (t.sigil === "/") {
      setSugs(skills.filter((s) => s.slug.includes(term) || s.name.toLowerCase().includes(term)).slice(0, 8).map((s) => ({ key: s.slug, label: `/${s.slug}`, sub: s.description, insert: `/${s.slug} ` })));
    } else if (t.sigil === "#") {
      setSugs([
        ...lists.filter((l) => l.name.toLowerCase().includes(term)).slice(0, 5).map((l) => ({ key: l.id, label: l.name, sub: "List", insert: `#[${l.name}](${l.id}) ` })),
        ...searches.filter((s) => s.name.toLowerCase().includes(term)).slice(0, 5).map((s) => ({ key: s.id, label: s.name, sub: "Saved search", insert: `#[${s.name}](${s.id}) ` })),
      ]);
    } else {
      if (term.length < 2) return setSugs([]);
      const id = ++reqId.current;
      const r = await quickSearch(t.term);
      if (id !== reqId.current) return;
      setSugs(r.hits.slice(0, 8).map((h) => ({ key: h.id, label: h.title, sub: `${h.kind}${h.subtitle ? ` · ${h.subtitle}` : ""}`, insert: `@[${h.title}](${h.id}) ` })));
    }
    setActive(0);
  }, [skills, lists, searches]);

  const apply = (s: Suggestion) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? text.length;
    const t = triggerAt(text, caret);
    if (!t) return;
    const next = text.slice(0, t.start) + s.insert + text.slice(caret);
    setText(next);
    setSugs([]);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = t.start + s.insert.length;
      el?.setSelectionRange(pos, pos);
    });
  };

  const submit = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText("");
    setSugs([]);
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (sugs.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % sugs.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + sugs.length) % sugs.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); apply(sugs[active]!); return; }
      if (e.key === "Escape") { setSugs([]); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="relative">
      {sugs.length ? (
        <div role="listbox" className="absolute bottom-full left-0 z-30 mb-2 w-full max-w-[520px] overflow-hidden rounded-xl border border-line-strong bg-paper p-1 shadow-[var(--shadow-window)]">
          {sugs.map((s, j) => (
            <button key={s.key} role="option" aria-selected={j === active} onMouseDown={(e) => { e.preventDefault(); apply(s); }} className={cn("flex w-full flex-col rounded-lg px-2.5 py-1.5 text-left", j === active ? "bg-white/[0.07]" : "hover:bg-white/[0.04]")}>
              <span className="text-[13px] text-ink">{s.label}</span>
              <span className="truncate text-[11px] text-faint">{s.sub}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-2 rounded-2xl border border-line-strong bg-paper p-2 focus-within:border-accent/60">
        <textarea
          ref={ref}
          value={text}
          autoFocus={autoFocus}
          aria-label="Message the agent"
          placeholder="Ask about companies, people, investors… Type @ to mention, # for a list or search, / for a skill"
          rows={2}
          onChange={(e) => { setText(e.target.value); void refresh(e.target.value, e.target.selectionStart); }}
          onKeyDown={onKey}
          onClick={(e) => void refresh(text, (e.target as HTMLTextAreaElement).selectionStart)}
          className="max-h-[220px] min-h-[44px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[14px] text-ink outline-none placeholder:text-faint"
        />
        <button onClick={submit} disabled={disabled || !text.trim()} aria-label="Send" className="mb-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-ink disabled:opacity-40">
          {disabled ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={16} />}
        </button>
      </div>
    </div>
  );
}

/* ---------------- message parts ---------------- */

/** Shows the user's text with @/#tokens as plain names. */
const plain = (t: string) => t.replace(/([@#])\[([^\]]+)\]\([a-z]{3}_[a-z0-9]+\)/g, "$1$2");

function Steps({ steps, running }: { steps: AgentStep[]; running: boolean }) {
  const [open, setOpen] = useState(running);
  useEffect(() => { if (running) setOpen(true); }, [running]);
  if (!steps.length) return running ? <p className="flex items-center gap-2 text-[12.5px] text-muted"><Loader2 size={13} className="animate-spin" /> Planning…</p> : null;
  return (
    <div className="mb-2 rounded-lg border border-line bg-sunken/60 px-3 py-2">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-1.5 text-[11.5px] uppercase tracking-wide text-faint">
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {steps.length} step{steps.length === 1 ? "" : "s"}
      </button>
      {open ? (
        <ol className="mt-1.5 flex flex-col gap-1">
          {steps.map((s) => (
            <li key={s.id} className="flex items-start gap-2 text-[12.5px]">
              <span className="mt-0.5">
                {s.status === "running" ? <Loader2 size={13} className="animate-spin text-accent" /> : s.status === "done" ? <Check size={13} className="text-accent" /> : s.status === "awaiting_confirmation" ? <ShieldQuestion size={13} className="text-amber-300" /> : s.status === "denied" ? <X size={13} className="text-faint" /> : <CircleAlert size={13} className="text-red-400" />}
              </span>
              <span className={cn("flex-1", s.status === "denied" ? "text-faint line-through" : "text-ink/85")}>
                {s.label}
                {s.summary ? <span className="text-faint"> — {s.summary}</span> : null}
              </span>
              {s.ms !== undefined ? <span className="text-[10.5px] text-faint">{(s.ms / 1000).toFixed(1)}s</span> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function TableCard({ table, sources, onSave, lists }: { table: AgentTable; sources: SourceMap; onSave: (target: { listId?: string; newName?: string }) => Promise<string | null>; lists: Pickable[] }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const savable = table.rows.some((r) => /^(com|per|inv)_/.test(String(r.person_id ?? r.company_id ?? r.target_id ?? r.id ?? "")));
  const fmt = (v: unknown) => (v === null || v === undefined ? "—" : typeof v === "number" ? (Math.abs(v) >= 1000 ? v.toLocaleString("en-US") : String(Math.round(v * 1000) / 1000)) : Array.isArray(v) ? v.join(", ") : String(v));
  const rowHref = (r: Record<string, unknown>) => { const id = String(r.id ?? ""); return /^(com|per|inv)_/.test(id) ? `/${id.startsWith("com") ? "companies" : id.startsWith("per") ? "people" : "investors"}/${id}` : null; };
  return (
    <div className="my-2 rounded-xl border border-line">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <button onClick={() => setShown((x) => !x)} className="flex min-w-0 items-center gap-1.5 text-left text-[12.5px] font-medium text-ink">
          {shown ? <ChevronDown size={13} className="shrink-0 text-faint" /> : <ChevronRight size={13} className="shrink-0 text-faint" />}
          <span className="truncate">{table.title} <span className="text-faint">· {table.rows.length} rows · {shown ? "hide" : "show"} data</span></span>
        </button>
        {savable ? (
          <div className="relative">
            <Button size="sm" variant="secondary" onClick={() => setOpen((o) => !o)} disabled={pending}>Save to list</Button>
            {open ? (
              <div className="absolute right-0 top-9 z-20 w-[240px] rounded-xl border border-line-strong bg-paper p-1.5 shadow-[var(--shadow-window)]">
                <button className="w-full rounded-md px-2 py-1.5 text-left text-[12.5px] text-accent hover:bg-white/[0.05]" onClick={() => start(async () => { setMsg(await onSave({ newName: table.title })); setOpen(false); })}>+ New list "{table.title.slice(0, 30)}"</button>
                {lists.slice(0, 8).map((l) => (
                  <button key={l.id} className="w-full truncate rounded-md px-2 py-1.5 text-left text-[12.5px] text-muted hover:bg-white/[0.05] hover:text-ink" onClick={() => start(async () => { setMsg(await onSave({ listId: l.id })); setOpen(false); })}>{l.name}</button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {msg ? <p className="border-b border-line px-3 py-1.5 text-[12px] text-accent">{msg}</p> : null}
      {shown ? <div className="max-h-[320px] overflow-auto">
        <table className="w-full text-[12.5px]">
          <thead className="sticky top-0 bg-paper"><tr className="text-left text-[10.5px] uppercase tracking-wide text-faint">{table.columns.map((c) => <th key={c.key} className="px-3 py-1.5 font-medium">{c.label}</th>)}</tr></thead>
          <tbody>
            {table.rows.map((r, i) => (
              <tr key={i} className="border-t border-line/50">
                {table.columns.map((c, j) => {
                  const href = j === 0 ? rowHref(r) : null;
                  return <td key={c.key} className="px-3 py-1.5">{href ? <Link href={href} className="text-ink hover:text-accent">{fmt(r[c.key])}</Link> : fmt(r[c.key])}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div> : null}
      <span className="sr-only">{Object.keys(sources).length} sources</span>
    </div>
  );
}

function Confirm({ label, onDecide, busy }: { label: string; onDecide: (d: "once" | "always" | "deny") => void; busy: boolean }) {
  return (
    <div className="my-2 rounded-xl border border-amber-300/30 bg-amber-300/[0.06] p-3">
      <p className="mb-2 flex items-center gap-2 text-[13px] text-ink"><ShieldQuestion size={15} className="text-amber-300" /> The agent wants to: <strong>{label}</strong></p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onDecide("once")} disabled={busy}>Allow once</Button>
        <Button size="sm" variant="secondary" onClick={() => onDecide("always")} disabled={busy}>Always for this thread</Button>
        <Button size="sm" variant="ghost" onClick={() => onDecide("deny")} disabled={busy}>Deny</Button>
      </div>
    </div>
  );
}

/* ---------------- chat ---------------- */

export function AgentChat(props: {
  thread: ThreadInfo | null;
  messages: ChatMessage[];
  artifacts: ArtifactRef[];
  skills: SkillOption[];
  lists: Pickable[];
  searches: Pickable[];
  initialText?: string;
  contextEntityId?: string | null;
}) {
  const router = useRouter();
  const [thread, setThread] = useState<ThreadInfo | null>(props.thread);
  const [messages, setMessages] = useState<ChatMessage[]>(props.messages);
  const [artifacts, setArtifacts] = useState<ArtifactRef[]>(props.artifacts);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const running = messages.some((m) => m.status === "running");

  const load = useCallback(async (id: string) => {
    const r = await fetch(`/api/agent/threads/${id}`, { cache: "no-store" });
    if (!r.ok) return;
    const d = (await r.json()) as { thread: ThreadInfo; messages: ChatMessage[]; artifacts: ArtifactRef[] };
    setThread(d.thread);
    setMessages(d.messages);
    setArtifacts(d.artifacts);
  }, []);

  useEffect(() => {
    if (!running || !thread) return;
    const t = setInterval(() => void load(thread.id), 900);
    return () => clearInterval(t);
  }, [running, thread, load]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages.length, running]);

  const send = async (text: string) => {
    setError(null);
    setBusy(true);
    const s = await sendAgentMessage(thread?.id ?? null, text, props.contextEntityId ?? null);
    if (!s.ok) { setError(s.error); setBusy(false); return; }
    const { threadId, messageId } = s.data;
    if (!thread) window.history.replaceState(null, "", `/agent/${threadId}`);
    await load(threadId);
    const r = await runAgentMessage(threadId, messageId);
    if (!r.ok) setError(r.error);
    await load(threadId);
    setBusy(false);
    router.refresh();
  };

  const decide = async (m: ChatMessage, d: "once" | "always" | "deny") => {
    if (!thread) return;
    setBusy(true);
    const r = await confirmAgentAction(thread.id, m.id, d);
    if (!r.ok) setError(r.error);
    await load(thread.id);
    setBusy(false);
    router.refresh();
  };

  const sourceMap = useMemo(() => {
    const map: SourceMap = {};
    for (const m of messages) for (const s of (m.sources ?? []) as AgentSource[]) map[s.id] = s;
    return map;
  }, [messages]);

  const empty = !messages.length;

  return (
    <div className="flex h-screen flex-col">
      {thread ? (
        <header className="flex items-center gap-2 border-b border-line px-6 py-3">
          {editing && thread.mine ? (
            <form className="flex flex-1 gap-2" onSubmit={async (e) => { e.preventDefault(); const v = new FormData(e.currentTarget).get("title"); await updateAgentThread(thread.id, { title: String(v) }); setEditing(false); await load(thread.id); router.refresh(); }}>
              <input name="title" defaultValue={thread.title} autoFocus className="flex-1 rounded-md border border-line bg-sunken px-2 py-1 text-[14px] text-ink outline-none" />
              <Button size="sm" type="submit">Save</Button>
            </form>
          ) : (
            <h1 className="flex-1 truncate text-[15px] font-medium text-ink">{thread.title}</h1>
          )}
          {thread.mine ? (
            <>
              <button title="Rename" onClick={() => setEditing((e) => !e)} className="rounded-md p-1.5 text-faint hover:bg-white/[0.05] hover:text-ink"><Pencil size={14} /></button>
              <button
                onClick={async () => { await updateAgentThread(thread.id, { visibility: thread.visibility === "TEAM" ? "PRIVATE" : "TEAM" }); await load(thread.id); router.refresh(); }}
                className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[12px] text-muted hover:text-ink"
              >
                {thread.visibility === "TEAM" ? <><Users size={13} /> Shared with team</> : <><Lock size={13} /> Private</>}
              </button>
              <button title="Delete thread" onClick={async () => { if (!confirm("Delete this thread?")) return; await deleteAgentThread(thread.id); router.push("/agent"); router.refresh(); }} className="rounded-md p-1.5 text-faint hover:bg-white/[0.05] hover:text-red-400"><Trash2 size={14} /></button>
            </>
          ) : <span className="text-[12px] text-faint">Shared by a teammate</span>}
        </header>
      ) : null}

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex max-w-[820px] flex-col gap-5">
          {empty ? (
            <div className="mt-[10vh] flex flex-col items-center gap-3 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-accent"><Sparkles size={20} /></span>
              <h1 className="text-[22px] font-semibold text-ink">What are you researching?</h1>
              <p className="max-w-[520px] text-[13.5px] text-muted">The agent searches companies, people, investors, rounds and signals, cites a source for every fact, and asks before it changes your lists.</p>
              <div className="mt-3 flex max-w-[680px] flex-wrap justify-center gap-2">
                {props.skills.slice(0, 8).map((s) => (
                  <button key={s.slug} onClick={() => void send(`/${s.slug}`)} disabled={busy} className="rounded-full border border-line px-3 py-1.5 text-[12.5px] text-muted hover:border-accent/50 hover:text-ink" title={s.description}>/{s.slug}</button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="self-end rounded-2xl rounded-br-md bg-white/[0.07] px-4 py-2.5 text-[14px] text-ink">{plain(m.text)}</div>
            ) : (
              <div key={m.id} className="flex flex-col">
                <Steps steps={(m.steps ?? []) as AgentStep[]} running={m.status === "running"} />
                {m.text ? <Markdown text={m.text} sources={sourceMap} /> : null}
                {((m.tables ?? []) as AgentTable[]).filter((t) => t.rows.length > 0).slice(0, 4).map((t) => (
                  <TableCard key={t.id} table={t} sources={sourceMap} lists={props.lists} onSave={async (target) => { if (!thread) return null; const r = await saveAgentTableToList(thread.id, m.id, t.id, target); router.refresh(); return r.ok ? `Saved ${String(r.data.added)} record(s).` : r.error; }} />
                ))}
                {(m.artifact_ids ?? []).length ? (
                  <div className="my-1 flex flex-wrap gap-2">
                    {artifacts.filter((a) => (m.artifact_ids ?? []).includes(a.id)).map((a) => (
                      <Link key={a.id} href={`/agent/artifacts/${a.id}`} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[12.5px] text-ink hover:border-accent/50"><FileText size={14} className="text-accent" /> {a.title} <span className="text-faint">· {a.kind}</span></Link>
                    ))}
                  </div>
                ) : null}
                {m.status === "awaiting_confirmation" && m.pending ? <Confirm label={m.pending.label} busy={busy} onDecide={(d) => void decide(m, d)} /> : null}
                {m.status === "error" ? <p className="text-[12.5px] text-red-400">{m.text}</p> : null}
                {m.status === "done" ? (
                  <p className="mt-1 text-[11px] text-faint">
                    {m.engine === "rules" ? "Answered by the built-in research engine" : "Answered by Claude"} · {Object.keys(sourceMap).length ? `${((m.sources ?? []) as AgentSource[]).length} sources` : "no sources"}
                    {m.usage?.credits !== undefined ? ` · ${String(m.usage.credits)} credit${m.usage.credits === 1 ? "" : "s"}` : ""}
                    {(m.unsourced ?? []).length ? <span className="text-amber-300"> · unverified numbers: {(m.unsourced ?? []).join(", ")}</span> : null}
                  </p>
                ) : null}
              </div>
            ),
          )}
          <div ref={bottom} />
        </div>
      </div>

      <div className="border-t border-line px-6 py-4">
        <div className="mx-auto max-w-[820px]">
          {error ? <p className="mb-2 text-[12.5px] text-red-400">{error}</p> : null}
          <Composer onSend={(t) => void send(t)} disabled={busy || running} skills={props.skills} lists={props.lists} searches={props.searches} initial={props.initialText} autoFocus />
        </div>
      </div>
    </div>
  );
}
