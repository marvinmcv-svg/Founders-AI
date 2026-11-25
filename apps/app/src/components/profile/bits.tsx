import Link from "next/link";
import type { ReactNode } from "react";
import { Card, cn } from "@founders/ui";

export function Tabs({ base, tabs, active }: { base: string; tabs: { id: string; label: string; count?: number }[]; active: string }) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-line px-6" aria-label="Profile sections">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.id === tabs[0]?.id ? base : `${base}?tab=${t.id}`}
          scroll={false}
          className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-3 text-[13px]", active === t.id ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink")}
          aria-current={active === t.id ? "page" : undefined}
        >
          {t.label}
          {t.count !== undefined ? <span className="ml-1.5 text-faint">{t.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

export function Panel({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-[13.5px] font-medium text-ink">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </Card>
  );
}

export function Metric({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <Card className="flex flex-col gap-0.5 p-4">
      <span className="text-[11.5px] text-faint">{label}</span>
      <span className="font-display text-[20px] text-ink">{value}</span>
      {sub ? <span className="text-[12px]">{sub}</span> : null}
    </Card>
  );
}

export function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-[13px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 text-ink">{v ?? <span className="text-faint">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-[13px] text-muted">{children}</p>;
}
