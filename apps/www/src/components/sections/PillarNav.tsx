"use client";
import { useEffect, useState } from "react";
import { cn } from "@founders/ui";

/** Sticky sub-nav with scroll-spy (plan 4.3 "Tab sections"). */
export function PillarNav({ items }: { items: { id: string; label: string }[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => Boolean(e));
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (vis) setActive(vis.target.id);
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);
  return (
    <div className="sticky top-16 z-20 flex justify-center py-3">
      <nav className="flex gap-1 rounded-full border border-line-strong bg-paper/85 p-1 backdrop-blur-xl" aria-label="Sections">
        {items.map((i) => (
          <a
            key={i.id}
            href={`#${i.id}`}
            className={cn("rounded-full px-4 py-1.5 text-[13px] transition-colors", active === i.id ? "bg-accent text-accent-ink" : "text-muted hover:text-ink")}
          >
            {i.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
