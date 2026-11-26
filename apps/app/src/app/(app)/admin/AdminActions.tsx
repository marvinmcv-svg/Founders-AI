"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button, type ButtonVariant } from "@founders/ui";
import type { AdminResult } from "./actions";

type Field = { name: string; label: string; type?: "text" | "number" | "select" | "textarea"; placeholder?: string; defaultValue?: string | number | null; options?: string[]; width?: string; required?: boolean };

const input = "h-8 rounded-md border border-line bg-white/[0.03] px-2 text-[12.5px] text-ink outline-none focus:border-accent/50";

function useRun() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const go = (fn: () => Promise<AdminResult>) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      setMsg(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error });
      if (r.ok) router.refresh();
    });
  // `data-hydrated` lets e2e tests wait until the form is interactive.
  return { pending, msg, go, hydrated: ready ? "true" : undefined };
}

const Msg = ({ msg }: { msg: { ok: boolean; text: string } | null }) => (msg ? <span role={msg.ok ? "status" : "alert"} className={`text-[12px] ${msg.ok ? "text-positive" : "text-negative"}`}>{msg.text}</span> : null);

/** A form whose fields arrive as `{ name: value }` at a (bound) server action. */
export function ActionForm({ action, fields, submit, variant = "primary", confirm }: { action: (v: Record<string, string>) => Promise<AdminResult>; fields: Field[]; submit: string; variant?: ButtonVariant; confirm?: string }) {
  const { pending, msg, go, hydrated } = useRun();
  return (
    <form
      data-hydrated={hydrated}
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const fd = new FormData(e.currentTarget);
        const v = Object.fromEntries([...fd.entries()].map(([k, x]) => [k, String(x)]));
        go(() => action(v));
      }}
    >
      {fields.map((f) => (
        <label key={f.name} className="flex flex-col gap-1 text-[11px] text-faint">
          {f.label}
          {f.type === "select" ? (
            <select name={f.name} defaultValue={f.defaultValue ?? ""} className={`${input} ${f.width ?? ""}`}>
              {(f.options ?? []).map((o) => <option key={o} value={o}>{o || "—"}</option>)}
            </select>
          ) : f.type === "textarea" ? (
            <textarea name={f.name} defaultValue={f.defaultValue ?? ""} placeholder={f.placeholder} rows={2} className={`${input} h-auto py-1.5 ${f.width ?? "w-72"}`} required={f.required} />
          ) : (
            <input name={f.name} type={f.type ?? "text"} defaultValue={f.defaultValue ?? ""} placeholder={f.placeholder} className={`${input} ${f.width ?? "w-40"}`} required={f.required} />
          )}
        </label>
      ))}
      <Button type="submit" size="sm" variant={variant} disabled={pending}>{pending ? "…" : submit}</Button>
      <Msg msg={msg} />
    </form>
  );
}

export function ActionButton({ action, label, variant = "secondary", confirm }: { action: () => Promise<AdminResult>; label: string; variant?: ButtonVariant; confirm?: string }) {
  const { pending, msg, go, hydrated } = useRun();
  return (
    <span className="inline-flex items-center gap-2" data-hydrated={hydrated}>
      <Button size="sm" variant={variant} disabled={pending} onClick={() => (!confirm || window.confirm(confirm)) && go(action)}>{pending ? "…" : label}</Button>
      <Msg msg={msg} />
    </span>
  );
}

/** DSAR: tick the profiles that are the requester, then link them. */
export function MatchPicker({ action, candidates, selected }: { action: (ids: string[]) => Promise<AdminResult>; candidates: { id: string; label: string; why: string[] }[]; selected: string[] }) {
  const { pending, msg, go, hydrated } = useRun();
  const [ids, setIds] = useState<string[]>(selected);
  return (
    <div className="flex flex-col gap-2" data-hydrated={hydrated}>
      {candidates.map((c) => (
        <label key={c.id} className="flex items-center gap-2 text-[12.5px]">
          <input type="checkbox" checked={ids.includes(c.id)} onChange={(e) => setIds(e.target.checked ? [...ids, c.id] : ids.filter((x) => x !== c.id))} />
          <a href={`/people/${c.id}`} className="text-ink hover:text-accent">{c.label}</a>
          <span className="text-faint">matched by {c.why.join(", ")}</span>
        </label>
      ))}
      {!candidates.length ? <p className="text-[12.5px] text-muted">No profile matches this e-mail, LinkedIn URL or name.</p> : null}
      <span className="flex items-center gap-2">
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => go(() => action(ids))}>Link {ids.length} profile(s)</Button>
        <Msg msg={msg} />
      </span>
    </div>
  );
}

/** Marks the page as interactive for e2e tests (rendered once on every admin tab). */
export function HydrationMarker() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready ? <span hidden data-hydrated="true" /> : null;
}
