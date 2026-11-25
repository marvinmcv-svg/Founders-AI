"use client";
/** Animated mocks: NL-search typing demo, API log terminal, signal ticker (plan 4.3 motion rules). */
import { useEffect, useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { Card, Chip, cn } from "@founders/ui";
import { Ticker, Typewriter, useInView, useReducedMotion } from "@founders/ui/motion";

/** Prompt types at ~35 chars/s → steps with spinner → check → filter chips → loops after 6s idle. */
export function NlSearchDemo({ prompt, chips, result, className }: { prompt: string; chips: string[]; result: string; className?: string }) {
  const [phase, setPhase] = useState<"typing" | "steps" | "done">("typing");
  const [step, setStep] = useState(0);
  const [cycle, setCycle] = useState(0);
  const steps = ["Reading your request", "Mapping to taxonomy", "Building filters"];
  useEffect(() => {
    if (phase !== "steps") return;
    if (step >= steps.length) {
      setPhase("done");
      return;
    }
    const t = setTimeout(() => setStep((s) => s + 1), 700);
    return () => clearTimeout(t);
  }, [phase, step, steps.length]);
  useEffect(() => {
    if (phase !== "done") return;
    const t = setTimeout(() => {
      setPhase("typing");
      setStep(0);
      setCycle((c) => c + 1);
    }, 6000);
    return () => clearTimeout(t);
  }, [phase]);
  return (
    <Card className={cn("flex flex-col gap-3 bg-raised p-4", className)} aria-label={`Example search: ${prompt}`}>
      <div className="flex items-center gap-2 text-[11px] text-muted">
        <Sparkles size={12} className="text-accent" /> Describe what you're looking for
      </div>
      <div className="min-h-[48px] rounded-lg border border-line bg-canvas px-3 py-2.5 text-[14px] text-ink" aria-hidden>
        <Typewriter key={cycle} text={prompt} onDone={() => setPhase((p) => (p === "typing" ? "steps" : p))} />
      </div>
      <div className="flex flex-col gap-1.5 text-[12px]" aria-hidden>
        {steps.map((s, i) =>
          phase !== "typing" && i <= step ? (
            <div key={s} className="flex items-center gap-2 text-muted animate-fade-up">
              {i < step || phase === "done" ? <Check size={12} className="text-accent" /> : <Loader2 size={12} className="animate-spin" />}
              {s}
            </div>
          ) : null,
        )}
      </div>
      {phase === "done" ? (
        <div className="flex flex-col gap-2 animate-fade-up" aria-hidden>
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <Chip key={c} active className="text-[11px]">{c}</Chip>
            ))}
          </div>
          <p className="text-[12px] text-accent">{result}</p>
        </div>
      ) : null}
    </Card>
  );
}

const LOG_LINES: [string, string, string][] = [
  ["»", "cron", "talent-scan started · 3 sources"],
  ["›", "GET", "/v1/companies/com_…/latest-revenue 200 · 41ms"],
  ["›", "POST", "/v1/companies/resolve 200 · 18ms · 0 credits"],
  ["λ", "worker", "enrich-queue · 120 records"],
  ["›", "GET", "/v1/funding-rounds?announced_date_after=… 200 · 88ms"],
  ["›", "PATCH", "/v1/lists/companies/lst_… 200 · 22ms"],
  ["›", "GET", "/v1/searches/companies/srh_…/results?new_since_last_read=true 200"],
  ["✓", "done", "cycle complete · 0 errors"],
];

/** Lines append every 150–400ms, auto-scroll, loop. */
export function ApiTerminal({ className, metricLabel = "sum(requests)", metricValue }: { className?: string; metricLabel?: string; metricValue?: string }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.2);
  const reduced = useReducedMotion();
  const [n, setN] = useState(reduced ? LOG_LINES.length : 0);
  useEffect(() => {
    if (!inView || reduced) return;
    const t = setTimeout(() => setN((x) => (x >= LOG_LINES.length + 6 ? 0 : x + 1)), 150 + Math.random() * 250);
    return () => clearTimeout(t);
  }, [n, inView, reduced]);
  const shown = LOG_LINES.slice(0, Math.min(n, LOG_LINES.length));
  return (
    <div ref={ref} className={cn("overflow-hidden rounded-[12px] border border-line bg-[#0c0c0c] font-mono text-[11.5px]", className)} aria-hidden>
      <div className="flex items-center justify-between border-b border-line px-3 py-2 text-muted">
        <span>logs-acme-app ▾</span>
        <span>24H</span>
      </div>
      <div className="border-b border-line px-3 py-2 text-muted">
        {metricLabel} <span className="text-accent">{metricValue ?? "1,247"}</span>
      </div>
      <div className="flex h-[210px] flex-col justify-end gap-1 overflow-hidden p-3">
        {shown.map(([g, k, msg], i) => (
          <div key={i} className="flex gap-2 animate-fade-up">
            <span className={g === "✓" ? "text-accent" : "text-faint"}>{g}</span>
            <span className="w-12 shrink-0 text-info">{k}</span>
            <span className="truncate text-text">{msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export type TickerItem = { title: string; body: string; category: string; time: string };

export function SignalTicker({ items, className }: { items: TickerItem[]; className?: string }) {
  return (
    <Ticker
      className={className}
      items={items}
      max={3}
      interval={3000}
      render={(it) => (
        <Card className="flex items-start gap-3 bg-raised p-3">
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-accent">{it.category}</span>
              <span className="text-faint">· {it.time}</span>
            </div>
            <p className="truncate text-[13px] text-ink">{it.title}</p>
            <p className="line-clamp-2 text-[12px] text-muted">{it.body}</p>
          </div>
        </Card>
      )}
    />
  );
}
