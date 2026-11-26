"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import { Badge, buttonClass, cn, Wordmark } from "@founders/ui";
import type { MenuGroup, MenuItem } from "@/lib/nav";

export type HeaderProps = {
  labels: Record<"platform" | "agents" | "api" | "integrations" | "resources" | "pricing" | "login" | "getStarted" | "soon" | "new", string>;
  platform: { overview: MenuItem; groups: MenuGroup[]; promo: { title: string; desc: string; cta: string; href: string } };
  integrations: MenuGroup[];
  resources: MenuGroup[];
  links: { agents: string; api: string; login: string; signup: string };
};

function ItemLink({ item, soonLabel, newLabel, onClick }: { item: MenuItem; soonLabel: string; newLabel?: string; onClick?: () => void }) {
  const external = item.href.startsWith("http");
  const cls = "group flex flex-col gap-0.5 rounded-lg px-3 py-2 hover:bg-white/[0.05]";
  const inner = (
    <>
      <span className="flex items-center gap-2 text-[14px] text-ink">
        {item.title}
        {item.badge === "soon" ? <Badge tone="neutral">{soonLabel}</Badge> : item.badge === "new" && newLabel ? <Badge>{newLabel}</Badge> : null}
      </span>
      <span className="text-[12px] text-muted">{item.desc}</span>
    </>
  );
  return external ? (
    <a href={item.href} className={cls} onClick={onClick}>
      {inner}
    </a>
  ) : (
    <Link href={item.href} className={cls} onClick={onClick}>
      {inner}
    </Link>
  );
}

export function Header(p: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (setOpen(null), setMobile(false));
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  const hover = (id: string | null) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (id) setOpen(id);
    else closeTimer.current = setTimeout(() => setOpen(null), 120);
  };

  const Trigger = ({ id, label }: { id: string; label: string }) => (
    <button
      className={cn("inline-flex items-center gap-1 rounded-full px-3 py-2 text-[14px] transition-colors", open === id ? "text-ink" : "text-text hover:text-ink")}
      aria-expanded={open === id}
      aria-haspopup="true"
      onMouseEnter={() => hover(id)}
      onMouseLeave={() => hover(null)}
      onFocus={() => hover(id)}
      onClick={() => setOpen(open === id ? null : id)}
    >
      {label}
      <ChevronDown size={14} className={cn("transition-transform", open === id && "rotate-180")} />
    </button>
  );

  const Panel = ({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) =>
    open === id ? (
      <div
        className={cn("absolute left-1/2 top-full z-50 -translate-x-1/2 pt-3", className)}
        onMouseEnter={() => hover(id)}
        onMouseLeave={() => hover(null)}
      >
        <div className="animate-fade-up rounded-[16px] border border-line-strong bg-paper/95 p-3 shadow-[var(--shadow-window)] backdrop-blur-xl">{children}</div>
      </div>
    ) : null;

  const groups = (gs: MenuGroup[]) => (
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${gs.length}, minmax(240px, 1fr))` }}>
      {gs.map((g) => (
        <div key={g.label}>
          <p className="px-3 pb-1 pt-1 text-[11px] uppercase tracking-[0.12em] text-faint">{g.label}</p>
          {g.items.map((it) => (
            <ItemLink key={it.title} item={it} soonLabel={p.labels.soon} newLabel={p.labels.new} onClick={() => setOpen(null)} />
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <header className={cn("sticky top-0 z-40 transition-colors", scrolled ? "border-b border-line bg-canvas/75 backdrop-blur-xl" : "border-b border-transparent")}>
      <nav className="mx-auto flex h-16 max-w-[1200px] items-center gap-6 px-5" aria-label="Main">
        <Link href="/" aria-label="Home">
          <Wordmark />
        </Link>
        <div className="relative hidden items-center lg:flex">
          <div className="relative">
            <Trigger id="platform" label={p.labels.platform} />
            <Panel id="platform" className="w-[640px]">
              <ItemLink item={p.platform.overview} soonLabel={p.labels.soon} newLabel={p.labels.new} onClick={() => setOpen(null)} />
              <div className="my-2 border-t border-line" />
              {groups(p.platform.groups)}
              <Link href={p.platform.promo.href} onClick={() => setOpen(null)} className="mt-3 flex items-center justify-between rounded-xl border border-accent/25 bg-accent-soft px-4 py-3">
                <span>
                  <span className="block text-[14px] text-ink">{p.platform.promo.title}</span>
                  <span className="text-[12px] text-muted">{p.platform.promo.desc}</span>
                </span>
                <span className="text-[13px] text-accent">{p.platform.promo.cta} →</span>
              </Link>
            </Panel>
          </div>
          <Link href={p.links.agents} className="rounded-full px-3 py-2 text-[14px] text-text hover:text-ink">
            {p.labels.agents}
          </Link>
          <a href={p.links.api} className="rounded-full px-3 py-2 text-[14px] text-text hover:text-ink">
            {p.labels.api}
          </a>
          <div className="relative">
            <Trigger id="integrations" label={p.labels.integrations} />
            <Panel id="integrations">{groups(p.integrations)}</Panel>
          </div>
          <div className="relative">
            <Trigger id="resources" label={p.labels.resources} />
            <Panel id="resources">{groups(p.resources)}</Panel>
          </div>
          <Link href="/pricing" className="rounded-full px-3 py-2 text-[14px] text-text hover:text-ink">
            {p.labels.pricing}
          </Link>
        </div>
        <div className="ml-auto hidden items-center gap-2 lg:flex">
          <a href={p.links.login} className={buttonClass("ghost", "sm")}>
            {p.labels.login}
          </a>
          <a href={p.links.signup} className={buttonClass("primary", "sm")}>
            {p.labels.getStarted}
          </a>
        </div>
        <button className="ml-auto rounded-full p-2 text-ink lg:hidden" aria-label="Open menu" onClick={() => setMobile(true)}>
          <Menu size={22} />
        </button>
      </nav>

      {mobile ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-canvas lg:hidden" role="dialog" aria-modal="true">
          <div className="flex h-16 items-center justify-between border-b border-line px-5">
            <Wordmark />
            <button className="rounded-full p-2" aria-label="Close menu" onClick={() => setMobile(false)}>
              <X size={22} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            {[
              { label: p.labels.platform, items: [p.platform.overview, ...p.platform.groups.flatMap((g) => g.items)] },
              { label: p.labels.integrations, items: p.integrations.flatMap((g) => g.items) },
              { label: p.labels.resources, items: p.resources.flatMap((g) => g.items) },
            ].map((sec) => (
              <details key={sec.label} className="border-b border-line py-2">
                <summary className="cursor-pointer list-none px-3 py-2 font-display text-[18px] text-ink">{sec.label}</summary>
                {sec.items.map((it) => (
                  <ItemLink key={it.title} item={it} soonLabel={p.labels.soon} newLabel={p.labels.new} onClick={() => setMobile(false)} />
                ))}
              </details>
            ))}
            <Link href="/pricing" onClick={() => setMobile(false)} className="block px-3 py-4 font-display text-[18px] text-ink">
              {p.labels.pricing}
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-line p-4">
            <a href={p.links.login} className={buttonClass("secondary", "md")}>
              {p.labels.login}
            </a>
            <a href={p.links.signup} className={buttonClass("primary", "md")} onClick={() => setMobile(false)}>
              {p.labels.getStarted}
            </a>
          </div>
        </div>
      ) : null}
    </header>
  );
}
