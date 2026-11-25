"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import {
  Bell, Bookmark, Building2, ChevronsUpDown, Code2, Command, Handshake, Landmark, List, LogOut, Network, Settings, Sparkles, Star, TrendingUp, Users,
} from "lucide-react";
import { cn, LogoMark } from "@founders/ui";
import { markNotificationsRead, switchOrg } from "@/app/actions";
import { authClient } from "@/lib/auth-client";

export type SidebarData = {
  orgName: string;
  orgs: { id: string; name: string; role: string }[];
  activeOrgId: string;
  userName: string;
  email: string;
  searchCount: number;
  newResults: number;
  lists: { id: string; name: string; system: string | null; entity_type: string }[];
  notifications: { id: string; kind: string; payload: Record<string, unknown>; read_at: string | null; created_at: string }[];
  unread: number;
};

function Item({ href, icon, label, badge, exact }: { href: string; icon: ReactNode; label: string; badge?: ReactNode; exact?: boolean }) {
  const path = usePathname();
  const active = exact ? path === href : path === href || path.startsWith(`${href}/`);
  return (
    <Link href={href} className={cn("flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors", active ? "bg-white/[0.08] text-ink" : "text-muted hover:bg-white/[0.04] hover:text-ink")}>
      <span className={active ? "text-accent" : "text-faint"}>{icon}</span>
      <span className="truncate">{label}</span>
      {badge ? <span className="ml-auto">{badge}</span> : null}
    </Link>
  );
}

const Group = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-0.5">
    <p className="px-2 pb-1 text-[10.5px] uppercase tracking-[0.12em] text-faint">{label}</p>
    {children}
  </div>
);

export function Sidebar(d: SidebarData) {
  const router = useRouter();
  const [orgOpen, setOrgOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [, start] = useTransition();
  const ic = (C: typeof Bell) => <C size={15} strokeWidth={1.8} />;
  const sys = (s: string) => d.lists.find((l) => l.system === s);
  const crm = sys("MY_CRM");
  const net = sys("MY_NETWORK");
  const user = d.lists.filter((l) => !l.system).slice(0, 6);
  return (
    <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-line bg-sunken px-3 py-4 lg:flex">
      <div className="flex items-center justify-between px-1">
        <Link href="/companies" aria-label="Home">
          <LogoMark size={26} />
        </Link>
        <div className="relative">
          <button
            className="relative rounded-md p-1.5 text-muted hover:bg-white/[0.06] hover:text-ink"
            aria-label={`Notifications (${d.unread} unread)`}
            onClick={() => {
              setBellOpen((o) => !o);
              if (d.unread) start(() => void markNotificationsRead());
            }}
          >
            {ic(Bell)}
            {d.unread ? <span className="absolute -right-0.5 -top-0.5 rounded-full bg-accent px-1 text-[9px] font-semibold text-accent-ink">{d.unread}</span> : null}
          </button>
          {bellOpen ? (
            <div className="absolute left-0 top-9 z-50 w-[320px] rounded-xl border border-line-strong bg-paper p-2 shadow-[var(--shadow-window)]">
              <p className="px-2 py-1 text-[11px] uppercase tracking-wider text-faint">Notifications</p>
              {d.notifications.length === 0 ? <p className="px-2 py-4 text-[13px] text-muted">You're all caught up.</p> : null}
              {d.notifications.slice(0, 8).map((n) => (
                <Link
                  key={n.id}
                  href={n.payload.searchId ? `/searches/${String(n.payload.searchId)}` : "/searches"}
                  onClick={() => setBellOpen(false)}
                  className="flex flex-col rounded-lg px-2 py-2 hover:bg-white/[0.05]"
                >
                  <span className="text-[13px] text-ink">
                    {String(n.payload.name ?? "Saved search")} <span className="text-accent">+{String(n.payload.count ?? 0)}</span>
                  </span>
                  <span className="text-[11px] text-muted">New results · {new Date(n.created_at).toLocaleDateString()}</span>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 rounded-lg bg-white/[0.05] p-0.5 text-center text-[12px]">
        <span className="rounded-md bg-white/[0.1] py-1 text-ink">Browse</span>
        <span className="cursor-not-allowed py-1 text-faint" title="Agent mode ships in Release 2">
          Agent
        </span>
      </div>

      <div className="flex flex-col gap-0.5">
        <button
          onClick={() => window.dispatchEvent(new Event("fai:cmdk"))}
          className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-muted hover:bg-white/[0.04] hover:text-ink"
        >
          <span className="text-faint">{ic(Command)}</span>
          Quick Search
          <span className="ml-auto text-[10px] text-faint">⌘K</span>
        </button>
        <Item href="/searches" icon={ic(Bookmark)} label="Searches" badge={d.newResults ? <span className="rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-ink">+{d.newResults}</span> : <span className="text-[11px] text-faint">{d.searchCount}</span>} />
      </div>

      <Group label="Lists">
        {crm ? <Item href={`/lists/${crm.id}`} icon={ic(Handshake)} label="My CRM" /> : null}
        {net ? <Item href={`/lists/${net.id}`} icon={ic(Network)} label="My Network" /> : null}
        {user.map((l) => (
          <Item key={l.id} href={`/lists/${l.id}`} icon={ic(l.system === "LIKED" ? Star : List)} label={l.name} />
        ))}
        <Item href="/lists" icon={ic(List)} label="All lists" exact />
      </Group>

      <Group label="Companies">
        <Item href="/companies" icon={ic(Building2)} label="Company DB" />
      </Group>
      <Group label="People">
        <Item href="/people" icon={ic(Users)} label="People DB" />
        <Item href="/talent-signals" icon={ic(Sparkles)} label="Talent Signals" />
      </Group>
      <Group label="Investors">
        <Item href="/investors" icon={ic(Landmark)} label="Investor DB" />
      </Group>
      <Group label="Transactions">
        <Item href="/funding-rounds" icon={ic(TrendingUp)} label="Funding Rounds" />
      </Group>

      <div className="mt-auto flex flex-col gap-0.5 border-t border-line pt-3">
        <Item href="/developers" icon={ic(Code2)} label="API & docs" />
        <Item href="/settings" icon={ic(Settings)} label="Settings" />
        <div className="relative mt-2">
          <button onClick={() => setOrgOpen((o) => !o)} className="flex w-full items-center gap-2 rounded-lg border border-line px-2 py-2 text-left hover:border-line-strong">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft font-display text-[12px] text-accent">{d.orgName.charAt(0)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] text-ink">{d.orgName}</span>
              <span className="block truncate text-[11px] text-faint">{d.email}</span>
            </span>
            <ChevronsUpDown size={14} className="text-faint" />
          </button>
          {orgOpen ? (
            <div className="absolute bottom-12 left-0 z-50 w-full rounded-xl border border-line-strong bg-paper p-1.5 shadow-[var(--shadow-window)]">
              <p className="px-2 py-1 text-[10.5px] uppercase tracking-wider text-faint">Workspaces</p>
              {d.orgs.map((o) => (
                <button
                  key={o.id}
                  onClick={() => start(async () => { await switchOrg(o.id); setOrgOpen(false); router.refresh(); })}
                  className={cn("flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-white/[0.05]", o.id === d.activeOrgId ? "text-ink" : "text-muted")}
                >
                  <span className="truncate">{o.name}</span>
                  <span className="text-[10px] text-faint">{o.role}</span>
                </button>
              ))}
              <button
                onClick={async () => { await authClient.signOut(); router.push("/login"); }}
                className="mt-1 flex w-full items-center gap-2 rounded-md border-t border-line px-2 py-2 text-left text-[13px] text-muted hover:text-ink"
              >
                <LogOut size={14} /> Log out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
