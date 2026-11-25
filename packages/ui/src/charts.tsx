/** Lightweight SVG charts shared by app and marketing mocks (no chart lib on marketing pages). */
import { cn } from "./primitives";

export function Sparkline({ values, width = 80, height = 24, className, positive }: { values: number[]; width?: number; height?: number; className?: string; positive?: boolean }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - ((v - min) / span) * (height - 2) - 1}`);
  const up = positive ?? (values[values.length - 1] ?? 0) >= (values[0] ?? 0);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden>
      <polyline points={pts.join(" ")} fill="none" stroke={up ? "#d8ff4a" : "#f87171"} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export type BandPoint = { label: string; p10: number; p50: number; p90: number; anchor?: number | null };

/** Confidence-band chart (P10–P90 band + P50 line + disclosure anchors) — plan 4.2 / 6.10. */
export function BandChart({ points, height = 180, className, format = (n: number) => `${Math.round(n)}` }: { points: BandPoint[]; height?: number; className?: string; format?: (n: number) => string }) {
  const width = 560;
  const pad = { l: 8, r: 8, t: 12, b: 22 };
  if (!points.length) return null;
  const max = Math.max(...points.map((p) => Math.max(p.p90, p.anchor ?? 0))) * 1.05 || 1;
  const x = (i: number) => pad.l + (i / Math.max(1, points.length - 1)) * (width - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / max) * (height - pad.t - pad.b);
  const upper = points.map((p, i) => `${x(i)},${y(p.p90)}`).join(" ");
  const lower = [...points].reverse().map((p, i) => `${x(points.length - 1 - i)},${y(p.p10)}`).join(" ");
  const mid = points.map((p, i) => `${x(i)},${y(p.p50)}`).join(" ");
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn("w-full", className)} role="img" aria-label={`Estimate range chart, latest median ${last ? format(last.p50) : ""}`}>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={pad.l} x2={width - pad.r} y1={pad.t + f * (height - pad.t - pad.b)} y2={pad.t + f * (height - pad.t - pad.b)} stroke="rgba(255,255,255,0.06)" />
      ))}
      <polygon points={`${upper} ${lower}`} fill="rgba(216,255,74,0.12)" />
      <polyline points={mid} fill="none" stroke="#d8ff4a" strokeWidth="2" />
      {points.map((p, i) =>
        p.anchor ? <circle key={i} cx={x(i)} cy={y(p.anchor)} r="4.5" fill="#0a0a0a" stroke="#d8ff4a" strokeWidth="2" /> : null,
      )}
      {points.map((p, i) =>
        i % Math.ceil(points.length / 6) === 0 || i === points.length - 1 ? (
          <text key={`t${i}`} x={x(i)} y={height - 6} fontSize="10" fill="#6b6b6b" textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}>
            {p.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/** Simple multi-series line chart for traction metrics. */
export function LineChart({ series, labels, height = 160, className }: { series: { name: string; values: number[]; color?: string }[]; labels: string[]; height?: number; className?: string }) {
  const width = 560;
  const pad = { l: 8, r: 8, t: 10, b: 22 };
  const all = series.flatMap((s) => s.values);
  if (!all.length) return null;
  const max = Math.max(...all) * 1.05 || 1;
  const min = Math.min(0, ...all);
  const x = (i: number, n: number) => pad.l + (i / Math.max(1, n - 1)) * (width - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (height - pad.t - pad.b);
  const colors = ["#d8ff4a", "#60a5fa", "#f0abfc", "#fbbf24"];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn("w-full", className)} role="img" aria-label={series.map((s) => s.name).join(", ")}>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={pad.l} x2={width - pad.r} y1={pad.t + f * (height - pad.t - pad.b)} y2={pad.t + f * (height - pad.t - pad.b)} stroke="rgba(255,255,255,0.06)" />
      ))}
      {series.map((s, si) => (
        <polyline key={s.name} fill="none" stroke={s.color ?? colors[si % colors.length]} strokeWidth="2" strokeLinejoin="round"
          points={s.values.map((v, i) => `${x(i, s.values.length)},${y(v)}`).join(" ")} />
      ))}
      {labels.map((l, i) =>
        i % Math.ceil(labels.length / 6) === 0 || i === labels.length - 1 ? (
          <text key={l + i} x={x(i, labels.length)} y={height - 6} fontSize="10" fill="#6b6b6b" textAnchor={i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"}>
            {l}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/** Stacked horizontal bar (team mix, usage mix). */
export function StackBar({ parts, className }: { parts: { label: string; value: number }[]; className?: string }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const colors = ["#d8ff4a", "#60a5fa", "#f0abfc", "#fbbf24", "#4ade80", "#a3a3a3", "#fb923c", "#22d3ee"];
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-white/[0.05]">
        {parts.map((p, i) => (
          <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: colors[i % colors.length] }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
        {parts.map((p, i) => (
          <span key={p.label} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: colors[i % colors.length] }} />
            {p.label} <span className="tabular text-text">{Math.round((p.value / total) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function DriverBars({ drivers }: { drivers: { label: string; impact: number }[] }) {
  const max = Math.max(...drivers.map((d) => Math.abs(d.impact)), 0.01);
  return (
    <div className="flex flex-col gap-2">
      {drivers.map((d) => (
        <div key={d.label} className="grid grid-cols-[140px_1fr_52px] items-center gap-3 text-[13px]">
          <span className="text-muted">{d.label}</span>
          <div className="relative h-2 rounded-full bg-white/[0.05]">
            <div className={cn("absolute top-0 h-2 rounded-full", d.impact >= 0 ? "left-1/2 bg-accent" : "right-1/2 bg-negative")} style={{ width: `${(Math.abs(d.impact) / max) * 50}%` }} />
            <div className="absolute left-1/2 top-[-3px] h-[14px] w-px bg-white/20" />
          </div>
          <span className={cn("tabular text-right", d.impact >= 0 ? "text-positive" : "text-negative")}>
            {d.impact >= 0 ? "+" : ""}
            {Math.round(d.impact * 100)}%
          </span>
        </div>
      ))}
    </div>
  );
}
