/**
 * AppWindow — the mock window frame + product sidebar used in marketing mocks, mirroring the real
 * app shell's navigation (plan 6.1 hero mock / 7.1 shell).
 */
import type { ReactNode } from "react";
import { Bell, Bookmark, Building2, Command, Contact, Handshake, Landmark, List, Network, Sparkles, TrendingUp, Users } from "lucide-react";
import { cn, LogoMark } from "./primitives";

export function AppWindow({ children, className, title, sidebar = true, active = "Company DB" }: { children: ReactNode; className?: string; title?: string; sidebar?: boolean; active?: string }) {
  return (
    <div className={cn("min-w-0 max-w-full overflow-hidden rounded-[14px] border border-line-strong bg-paper shadow-[var(--shadow-window)]", className)}>
      <div className="flex h-9 items-center gap-2 border-b border-line bg-sunken px-3">
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        {title ? <span className="ml-3 text-[11px] text-faint">{title}</span> : null}
      </div>
      <div className="flex min-h-0">
        {sidebar ? <MockSidebar active={active} /> : null}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

function NavItem({ icon, label, active, badge }: { icon: ReactNode; label: string; active?: boolean; badge?: ReactNode }) {
  return (
    <div className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px]", active ? "bg-white/[0.07] text-ink" : "text-muted")}>
      <span className="text-faint">{icon}</span>
      <span className="truncate">{label}</span>
      {badge ? <span className="ml-auto">{badge}</span> : null}
    </div>
  );
}

export function MockSidebar({ active }: { active: string }) {
  const i = (C: typeof Bell) => <C size={13} strokeWidth={1.8} />;
  return (
    <aside className="hidden w-[188px] shrink-0 flex-col gap-3 border-r border-line bg-sunken p-3 md:flex" aria-hidden>
      <div className="flex items-center justify-between">
        <LogoMark size={22} />
        <span className="relative text-muted">
          {i(Bell)}
          <span className="absolute -right-1.5 -top-1.5 rounded-full bg-accent px-1 text-[9px] font-semibold text-accent-ink">3</span>
        </span>
      </div>
      <div className="grid grid-cols-2 rounded-md bg-white/[0.05] p-0.5 text-center text-[11px]">
        <span className="rounded bg-white/[0.1] py-1 text-ink">Browse</span>
        <span className="py-1 text-muted">Agent</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <NavItem icon={i(Command)} label="Quick Search" badge={<span className="text-[10px] text-faint">⌘K</span>} />
        <NavItem icon={i(Bookmark)} label="Searches" badge={<span className="text-[10px] text-faint">6</span>} />
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="px-2 text-[10px] uppercase tracking-wider text-faint">Lists</p>
        <NavItem icon={i(Handshake)} label="My CRM" />
        <NavItem icon={i(Network)} label="My Network" />
        <NavItem icon={i(List)} label="Portfolio" />
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="px-2 text-[10px] uppercase tracking-wider text-faint">Data</p>
        <NavItem icon={i(Building2)} label="Company DB" active={active === "Company DB"} />
        <NavItem icon={i(Users)} label="People DB" active={active === "People DB"} />
        <NavItem icon={i(Sparkles)} label="Talent Signals" active={active === "Talent Signals"} />
        <NavItem icon={i(Landmark)} label="Investor DB" active={active === "Investor DB"} />
        <NavItem icon={i(TrendingUp)} label="Funding Rounds" active={active === "Funding Rounds"} />
      </div>
      <div className="mt-auto flex items-center gap-2 rounded-md border border-line px-2 py-1.5 text-[11px] text-text">
        <Contact size={13} className="text-faint" />
        Acme Capital
      </div>
    </aside>
  );
}

export function WindowToolbar({ crumb, count, children }: { crumb: string; count?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
      <span className="text-[12px] text-muted">{crumb}</span>
      {count ? <span className="text-[12px] text-faint">· {count}</span> : null}
      <div className="ml-auto flex items-center gap-1.5">{children}</div>
    </div>
  );
}
