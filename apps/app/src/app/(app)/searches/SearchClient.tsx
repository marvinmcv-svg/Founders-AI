"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { RefreshCw, Trash2 } from "lucide-react";
import { deleteSearch, markSearchRead, refreshSearch } from "@/app/actions";

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
