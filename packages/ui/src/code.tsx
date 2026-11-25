"use client";
import { useState, type ReactNode } from "react";
import { cn } from "./primitives";

/** Minimal JSON syntax highlighting (no dependency). */
export function highlightJson(json: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /("(?:\\.|[^"\\])*"\s*:?)|(\b-?\d+(?:\.\d+)?(?:e[+-]?\d+)?\b)|(\btrue\b|\bfalse\b|\bnull\b)/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(json))) {
    if (m.index > last) out.push(json.slice(last, m.index));
    const [tok] = m;
    const cls = m[1] ? (tok.trimEnd().endsWith(":") ? "text-[#93c5fd]" : "text-accent") : m[2] ? "text-[#fbbf24]" : "text-[#f0abfc]";
    out.push(
      <span key={k++} className={cls}>
        {tok}
      </span>,
    );
    last = m.index + tok.length;
  }
  if (last < json.length) out.push(json.slice(last));
  return out;
}

export type CodeTab = { label: string; code: string; lang?: "json" | "bash" | "python" | "js" };

export function CodeBlock({ tabs, className, maxHeight = 380, title }: { tabs: CodeTab[]; className?: string; maxHeight?: number; title?: ReactNode }) {
  const [i, setI] = useState(0);
  const [copied, setCopied] = useState(false);
  const tab = tabs[i] ?? tabs[0];
  if (!tab) return null;
  return (
    <div className={cn("overflow-hidden rounded-[12px] border border-line bg-[#0c0c0c]", className)}>
      <div className="flex items-center justify-between border-b border-line px-3">
        <div className="flex items-center gap-1" role="tablist">
          {title ? <span className="mr-2 text-[12px] text-muted">{title}</span> : null}
          {tabs.map((t, k) => (
            <button
              key={t.label}
              role="tab"
              aria-selected={k === i}
              onClick={() => setI(k)}
              className={cn("border-b-2 px-2.5 py-2.5 text-[12px] transition-colors", k === i ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink")}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          className="rounded px-2 py-1 text-[12px] text-muted hover:bg-white/[0.06] hover:text-ink"
          onClick={() => {
            void navigator.clipboard?.writeText(tab.code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-auto p-4 font-mono text-[12.5px] leading-relaxed text-text" style={{ maxHeight }}>
        <code>{tab.lang === "json" ? highlightJson(tab.code) : tab.code}</code>
      </pre>
    </div>
  );
}

const METHOD_COLORS: Record<string, string> = {
  GET: "text-positive border-positive/30 bg-positive/10",
  POST: "text-info border-info/30 bg-info/10",
  PATCH: "text-warning border-warning/30 bg-warning/10",
  DELETE: "text-negative border-negative/30 bg-negative/10",
};

export function EndpointPill({ method, path, className }: { method: string; path: string; className?: string }) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-2 overflow-hidden rounded-[8px] border border-line bg-white/[0.02] px-2 py-1 font-mono text-[12px]", className)}>
      <span className={cn("rounded border px-1.5 text-[10px] font-semibold", METHOD_COLORS[method] ?? "text-muted border-line")}>{method}</span>
      <span className="truncate text-text">{path}</span>
    </span>
  );
}

export function Tabs({ tabs, value, onChange, variant = "underline", className }: { tabs: { id: string; label: ReactNode }[]; value: string; onChange: (id: string) => void; variant?: "underline" | "pill"; className?: string }) {
  return (
    <div role="tablist" className={cn("flex items-center gap-1 overflow-x-auto", variant === "underline" && "border-b border-line", className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={t.id === value}
          onClick={() => onChange(t.id)}
          className={cn(
            "whitespace-nowrap text-[13px] transition-colors",
            variant === "underline" && cn("-mb-px border-b-2 px-3 py-2.5", t.id === value ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"),
            variant === "pill" && cn("rounded-full px-3 py-1.5", t.id === value ? "bg-white/[0.1] text-ink" : "text-muted hover:text-ink"),
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Accordion({ items, className }: { items: { q: ReactNode; a: ReactNode }[]; className?: string }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className={cn("divide-y divide-line rounded-[12px] border border-line", className)}>
      {items.map((it, i) => (
        <div key={i}>
          <button
            className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-[15px] text-ink"
            aria-expanded={open === i}
            onClick={() => setOpen(open === i ? null : i)}
          >
            {it.q}
            <span className={cn("text-accent transition-transform", open === i && "rotate-45")}>+</span>
          </button>
          {open === i ? <div className="px-5 pb-5 text-[14px] leading-relaxed text-muted">{it.a}</div> : null}
        </div>
      ))}
    </div>
  );
}
