"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { deleteSearch, markSearchRead, refreshSearch, updateSearchAlerts } from "@/app/actions";

export function SearchRowActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      {msg ? <span className="text-[11px] text-accent">{msg}</span> : null}
      <button aria-label="Re-run now" title="Re-run now" disabled={pending} className="text-muted hover:text-ink" onClick={() => start(async () => { const r = await refreshSearch(id); setMsg(`+${r.added} new`); router.refresh(); })}>
        <RefreshCw size={14} className={pending ? "animate-spin" : ""} />
      </button>
      <button aria-label="Delete" title="Delete" className="text-muted hover:text-negative" onClick={() => { if (confirm("Delete this saved search?")) start(async () => { await deleteSearch(id); router.refresh(); }); }}>
        <Trash2 size={14} />
      </button>
    </span>
  );
}

/** Marks the search read after the page has rendered the "new" badges. */
export function MarkRead({ id }: { id: string }) {
  useEffect(() => {
    const t = setTimeout(() => void markSearchRead(id), 1500);
    return () => clearTimeout(t);
  }, [id]);
  return null;
}

const CADENCES = ["OFF", "REALTIME", "DAILY", "WEEKLY"] as const;
const CHANNELS = [
  { id: "in_app", label: "In-app" },
  { id: "email", label: "Email" },
  { id: "slack", label: "Slack" },
] as const;

/** Alert cadence + delivery channels for one saved search (plan 7.5). */
export function AlertSettings({ id, cadence, channels, canEdit }: { id: string; cadence: string; channels: string[]; canEdit: boolean }) {
  const router = useRouter();
  const [c, setC] = useState(cadence);
  const [ch, setCh] = useState<string[]>(channels);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const save = (nc: string, nch: string[]) =>
    start(async () => {
      await updateSearchAlerts(id, nc as (typeof CADENCES)[number], nch as ("in_app" | "email" | "slack")[]);
      setSaved(true);
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
      <label className="flex items-center gap-2 text-muted">
        Alerts
        <select
          className="h-8 rounded-md border border-line bg-white/[0.03] px-2 text-ink"
          value={c}
          disabled={!canEdit || pending}
          onChange={(e) => {
            setC(e.target.value);
            save(e.target.value, ch);
          }}
        >
          {CADENCES.map((x) => (
            <option key={x} value={x}>
              {x === "REALTIME" ? "Real-time" : x.charAt(0) + x.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </label>
      {CHANNELS.map((x) => (
        <label key={x.id} className="flex items-center gap-1.5 text-muted">
          <input
            type="checkbox"
            checked={ch.includes(x.id)}
            disabled={!canEdit || pending || c === "OFF"}
            onChange={(e) => {
              const next = e.target.checked ? [...ch, x.id] : ch.filter((y) => y !== x.id);
              setCh(next);
              save(c, next);
            }}
          />
          {x.label}
        </label>
      ))}
      {saved && !pending ? <span className="text-positive">Saved</span> : null}
    </div>
  );
}
