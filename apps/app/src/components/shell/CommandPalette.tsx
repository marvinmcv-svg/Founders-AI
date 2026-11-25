"use client";
/** Global Quick Search ⌘K (plan 7.2): companies, people, investors, lists, saved searches, commands. */
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bookmark, Building2, Landmark, List, Search, TrendingUp, User, Sparkles, Settings } from "lucide-react";
import { quickSearch } from "@/app/actions";

type Res = Awaited<ReturnType<typeof quickSearch>>;
const RECENT_KEY = "fai-recent";

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [res, setRes] = useState<Res | null>(null);
  const [recent, setRecent] = useState<{ href: string; title: string }[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    const ev = () => setOpen(true);
    window.addEventListener("keydown", key);
    window.addEventListener("fai:cmdk", ev);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("fai:cmdk", ev);
    };
  }, []);
  useEffect(() => {
    if (open) setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as { href: string; title: string }[]);
  }, [open]);
  useEffect(() => {
    if (term.trim().length < 2) {
      setRes(null);
      return;
    }
    const id = ++seq.current;
    const t = setTimeout(async () => {
      const r = await quickSearch(term);
      if (id === seq.current) setRes(r);
    }, 120);
    return () => clearTimeout(t);
  }, [term]);

  const go = (href: string, title: string, newTab = false) => {
    const next = [{ href, title }, ...recent.filter((r) => r.href !== href)].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    setOpen(false);
    setTerm("");
    if (newTab) window.open(href, "_blank");
    else router.push(href);
  };

  if (!open) return null;
  const hrefFor = (k: string, id: string) => (k === "company" ? `/companies/${id}` : k === "person" ? `/people/${id}` : `/investors/${id}`);
  const iconFor = (k: string) => (k === "company" ? <Building2 size={15} /> : k === "person" ? <User size={15} /> : <Landmark size={15} />);
  const item = "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] text-text aria-selected:bg-white/[0.07] aria-selected:text-ink";
  const group = "px-1 pb-1 text-[11px] uppercase tracking-wider text-faint [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5";
  const commands: [string, string, React.ReactNode][] = [
    ["Go to Company DB", "/companies", <Building2 key="a" size={15} />],
    ["Go to People DB", "/people", <User key="b" size={15} />],
    ["Go to Talent Signals", "/talent-signals", <Sparkles key="c" size={15} />],
    ["Go to Investor DB", "/investors", <Landmark key="d" size={15} />],
    ["Go to Funding Rounds", "/funding-rounds", <TrendingUp key="e" size={15} />],
    ["Create list", "/lists?new=1", <List key="f" size={15} />],
    ["Saved searches", "/searches", <Bookmark key="g" size={15} />],
    ["Settings & API keys", "/settings", <Settings key="h" size={15} />],
  ];
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
      <Command
        label="Quick search"
        shouldFilter={false}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[620px] overflow-hidden rounded-2xl border border-line-strong bg-paper shadow-[var(--shadow-window)]"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={16} className="text-faint" />
          <Command.Input autoFocus value={term} onValueChange={setTerm} placeholder="Search companies, people, investors, lists…" className="h-14 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-faint" />
          <kbd className="rounded border border-line px-1.5 text-[11px] text-faint">esc</kbd>
        </div>
        <Command.List className="max-h-[60vh] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-[13px] text-muted">{term.length < 2 ? "Type at least two characters." : "No matches."}</Command.Empty>
          {!res && recent.length ? (
            <Command.Group heading="Recent" className={group}>
              {recent.map((r) => (
                <Command.Item key={r.href} value={`recent-${r.href}`} onSelect={() => go(r.href, r.title)} className={item}>
                  {r.title}
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}
          {res?.hits.length ? (
            <Command.Group heading="Records" className={group}>
              {res.hits.map((h) => (
                <Command.Item
                  key={`${h.kind}-${h.id}`}
                  value={`${h.kind}-${h.id}`}
                  onSelect={() => go(hrefFor(h.kind, h.id), h.title)}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) go(hrefFor(h.kind, h.id), h.title, true);
                  }}
                  className={item}
                >
                  <span className="text-faint">{iconFor(h.kind)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink">{h.title}</span>
                    <span className="block truncate text-[12px] text-muted">{h.subtitle}</span>
                  </span>
                  <span className="text-[11px] capitalize text-faint">{h.kind}</span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}
          {res?.lists.length ? (
            <Command.Group heading="Lists" className={group}>
              {res.lists.map((l) => (
                <Command.Item key={l.id} value={`list-${l.id}`} onSelect={() => go(`/lists/${l.id}`, l.name)} className={item}>
                  <List size={15} className="text-faint" /> {l.name}
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}
          {res?.searches.length ? (
            <Command.Group heading="Saved searches" className={group}>
              {res.searches.map((s) => (
                <Command.Item key={s.id} value={`search-${s.id}`} onSelect={() => go(`/searches/${s.id}`, s.name)} className={item}>
                  <Bookmark size={15} className="text-faint" /> {s.name}
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}
          <Command.Group heading="Commands" className={group}>
            {commands
              .filter(([l]) => !term || l.toLowerCase().includes(term.toLowerCase()))
              .map(([l, href, icon]) => (
                <Command.Item key={l} value={`cmd-${l}`} onSelect={() => go(href, l)} className={item}>
                  <span className="text-faint">{icon}</span> {l}
                </Command.Item>
              ))}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
