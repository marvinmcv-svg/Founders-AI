"use client";
/** Tabbed integrations directory (plan 6.14 #3). Copy is passed in from the server component. */
import Link from "next/link";
import { useState } from "react";
import { cn, Favicon } from "@founders/ui";

export function IntegrationDirectory({ tabs, ask }: { tabs: { id: string; label: string; items: string[] }[]; ask: string }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  const current = tabs.find((x) => x.id === active) ?? tabs[0];
  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Integration categories">
        {tabs.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={x.id === active}
            onClick={() => setActive(x.id)}
            className={cn("rounded-full border px-4 py-1.5 text-[13px]", x.id === active ? "border-accent bg-accent text-accent-ink" : "border-line text-muted hover:text-ink")}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {current?.items.map((name) => (
          <div key={name} className="flex items-center gap-3 rounded-[14px] border border-line bg-paper px-4 py-3 text-[14px] text-ink">
            <Favicon name={name} size={24} />
            {name}
          </div>
        ))}
      </div>
      <p className="mt-5 text-[14px] text-muted">
        <Link href="/contact" className="text-accent hover:underline">
          {ask}
        </Link>
      </p>
    </div>
  );
}
