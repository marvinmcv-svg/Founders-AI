"use client";
/**
 * EntityGrid (plan 7.3) — shared by every database view. Virtualised rows, URL-encoded state
 * (filters, sort, query) so any view is shareable, infinite scroll, column chooser, keyboard
 * navigation, selection + bulk actions, NL → filters, Save Search and credit-costed export.
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, Bookmark, Columns3, Download, Eraser, Loader2, Search, Sparkles, X } from "lucide-react";
import { countConditions, emptyFilter, encodeFilter, PRODUCT_META, type Group, type Product } from "@founders/core/filters";
import type { SortSpec } from "@founders/core/filters/compile";
import { pageCost } from "@founders/core/pricing";
import { EXACT_COUNT_CAP, EXPORT_MAX_ROWS } from "@founders/core/limits";
import { Badge, buttonClass, cn, COLUMNS, type Row } from "@founders/ui";
import { addToList, createList, nlSearch, runGrid, saveSearch, setStatus, type GridResult } from "@/app/actions";
import { FilterBar } from "./FilterBuilder";
import { appLink, PRODUCT_PATH } from "./links";

export { appLink, PRODUCT_PATH };

const ENTITY: Partial<Record<Product, "COMPANY" | "PERSON" | "INVESTOR">> = { companies: "COMPANY", people: "PERSON", investors: "INVESTOR" };
const ROW_H = 42;

function rowHref(product: Product, r: Row): string {
  if (product === "companies") return `/companies/${String(r.id)}`;
  if (product === "people") return `/people/${String(r.id)}`;
  if (product === "investors") return `/investors/${String(r.id)}`;
  if (product === "funding_rounds") return `/companies/${String(r.company_id)}?tab=financials`;
  return `/people/${String(r.person_id)}`;
}

type Props = {
  product: Product;
  initial: GridResult & { filter: Group; sort: SortSpec | null; q: string };
  lists: { id: string; name: string; entity_type: string }[];
  statuses: { id: string; label: string; color: string }[];
  canWrite: boolean;
};

export function EntityGrid({ product, initial, lists, statuses, canWrite }: Props) {
  const router = useRouter();
  const meta = PRODUCT_META[product];
  const entity = ENTITY[product];
  const [filter, setFilter] = useState<Group>(initial.filter);
  const [sort, setSort] = useState<SortSpec | null>(initial.sort);
  const [q, setQ] = useState(initial.q);
  const [rows, setRows] = useState<Row[]>(initial.rows);
  const [total, setTotal] = useState(initial.total);
  const [capped, setCapped] = useState(initial.totalCapped);
  const [rowStatus, setRowStatus] = useState(initial.statuses);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState(-1);
  const [nl, setNl] = useState("");
  const [nlInfo, setNlInfo] = useState<{ text: string; engine: string } | null>(null);
  const [nlBusy, setNlBusy] = useState(false);
  const [dialog, setDialog] = useState<null | "save" | "export" | "columns" | "list" | "status">(null);
  const [toast, setToast] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [, start] = useTransition();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastKey = useRef(JSON.stringify([initial.filter, initial.sort, initial.q]));
  const reqSeq = useRef(0);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  useEffect(() => {
    const saved = localStorage.getItem(`fai-cols-${product}`);
    if (saved) setHidden(new Set(JSON.parse(saved) as string[]));
  }, [product]);

  const columns = useMemo(() => COLUMNS[product].filter((c) => !hidden.has(c.key)), [product, hidden]);
  const gridTemplate = `40px ${entity ? "112px " : ""}${columns.map((c) => `${c.width}px`).join(" ")}`;
  const totalWidth = 40 + (entity ? 112 : 0) + columns.reduce((a, c) => a + c.width, 0);

  /* URL state (shareable views) */
  useEffect(() => {
    const p = new URLSearchParams();
    if (filter.children.length) p.set("f", encodeFilter(filter));
    if (sort) p.set("s", `${sort.field}:${sort.dir}`);
    if (q) p.set("q", q);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [filter, sort, q]);

  /* Query on change (debounced 300ms — live result count) */
  useEffect(() => {
    // Only re-query when the query actually changed (safe under StrictMode double effects).
    const key = JSON.stringify([filter, sort, q]);
    if (key === lastKey.current) return;
    lastKey.current = key;
    const id = ++reqSeq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await runGrid(product, filter, sort, q, 0);
        if (id !== reqSeq.current) return;
        setRows(r.rows);
        setTotal(r.total);
        setCapped(r.totalCapped);
        setRowStatus(r.statuses);
        setSelected(new Set());
        setError(null);
        scrollRef.current?.scrollTo({ top: 0 });
      } catch {
        if (id === reqSeq.current) setError("Couldn't load results. Retry?");
      } finally {
        if (id === reqSeq.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [product, filter, sort, q]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || rows.length >= total) return;
    setLoadingMore(true);
    try {
      const r = await runGrid(product, filter, sort, q, rows.length);
      setRows((prev) => [...prev, ...r.rows]);
      setRowStatus((prev) => ({ ...prev, ...r.statuses }));
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, loading, rows.length, total, product, filter, sort, q]);

  const virt = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_H, overscan: 14 });
  const items = virt.getVirtualItems();
  useEffect(() => {
    const last = items[items.length - 1];
    if (last && last.index >= rows.length - 20) void loadMore();
  }, [items, rows.length, loadMore]);

  const toggleSort = (field?: string) => {
    if (!field) return;
    setSort((s) => (s?.field === field ? { field, dir: s.dir === "desc" ? "asc" : "desc" } : { field, dir: "desc" }));
  };
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3000);
  };

  async function runNl() {
    if (!nl.trim()) return;
    setNlBusy(true);
    try {
      const r = await nlSearch(nl, undefined);
      if (r.product !== product) {
        router.push(`${PRODUCT_PATH[r.product]}?f=${encodeFilter(r.filter)}${r.sort ? `&s=${r.sort.field}:${r.sort.dir}` : ""}&nl=${encodeURIComponent(nl)}`);
        return;
      }
      setFilter(r.filter);
      if (r.sort) setSort(r.sort);
      setNlInfo({ text: r.explanation, engine: r.engine });
    } finally {
      setNlBusy(false);
    }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (!rows.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const n = Math.min(rows.length - 1, focus + 1);
      setFocus(n);
      virt.scrollToIndex(n);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const n = Math.max(0, focus - 1);
      setFocus(n);
      virt.scrollToIndex(n);
    } else if (e.key === "Enter" && focus >= 0) {
      router.push(rowHref(product, rows[focus] as Row));
    } else if (e.key === " " && focus >= 0) {
      e.preventDefault();
      toggle(String(rows[focus]?.id));
    }
  };

  const exportCount = selected.size || Math.min(total, EXPORT_MAX_ROWS);
  const exportHref = () => {
    const p = new URLSearchParams({ product });
    if (selected.size) p.set("ids", [...selected].join(","));
    else {
      if (filter.children.length) p.set("f", encodeFilter(filter));
      if (sort) p.set("s", `${sort.field}:${sort.dir}`);
      if (q) p.set("q", q);
    }
    p.set("cols", columns.map((c) => c.key).join(","));
    return `/api/export?${p.toString()}`;
  };

  const listsForEntity = lists.filter((l) => l.entity_type === entity);
  const countLabel = `${total.toLocaleString()}${capped ? "+" : ""} ${total === 1 ? meta.singular : meta.label.toLowerCase()}`;

  return (
    <div className="flex h-[calc(100vh-0px)] min-h-0 flex-col max-lg:h-[calc(100vh-48px)]" data-hydrated={hydrated ? "true" : undefined}>
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <h1 className="text-[15px] font-medium text-ink">
          {meta.label} <span className="text-muted">/ Database</span>
        </h1>
        <span className="text-[13px] text-muted">· {loading ? <Loader2 size={12} className="inline animate-spin" /> : countLabel}</span>
        <div className="ml-auto flex items-center gap-2">
          <button className={buttonClass("ghost", "sm")} onClick={() => setDialog("columns")}>
            <Columns3 size={14} /> Columns
          </button>
          <button className={buttonClass("secondary", "sm")} onClick={() => setDialog("export")} disabled={!total}>
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      {/* NL search */}
      <div className="flex flex-col gap-1 border-b border-line px-5 py-2.5">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void runNl();
          }}
        >
          <Sparkles size={15} className="text-accent" />
          <input
            value={nl}
            onChange={(e) => setNl(e.target.value)}
            placeholder={`Describe what you're looking for — e.g. "seed fintech in Bolivia growing fast"`}
            className="h-9 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-faint"
            aria-label="Describe what you're looking for"
          />
          <button className={buttonClass("primary", "sm")} disabled={nlBusy || !nl.trim()}>
            {nlBusy ? <Loader2 size={13} className="animate-spin" /> : "Search"}
          </button>
        </form>
        {nlInfo ? (
          <p className="pl-6 text-[12px] text-muted">
            {nlInfo.text} <Badge tone="neutral">{nlInfo.engine === "claude" ? "Claude" : "rules"}</Badge> <span className="text-faint">· filters below are editable</span>
          </p>
        ) : null}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-2.5">
        <span className="rounded-md bg-white/[0.07] px-2.5 py-1 text-[12px] text-ink">All {meta.label}</span>
        <div className="relative flex items-center">
          <Search size={13} className="absolute left-2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name…" className="h-8 w-[180px] rounded-md border border-line bg-white/[0.03] pl-7 pr-2 text-[12.5px] text-ink outline-none focus:border-accent/50" />
        </div>
        <FilterBar product={product} filter={filter} onChange={setFilter} lists={listsForEntity} />
        <div className="ml-auto flex items-center gap-1.5">
          {countConditions(filter) || q ? (
            <button
              className={buttonClass("ghost", "sm")}
              onClick={() => {
                setFilter(emptyFilter());
                setQ("");
                setNlInfo(null);
              }}
            >
              <Eraser size={13} /> Clear Search
            </button>
          ) : null}
          {canWrite ? (
            <button className={buttonClass("secondary", "sm")} onClick={() => setDialog("save")}>
              <Bookmark size={13} /> Save Search
            </button>
          ) : null}
        </div>
      </div>

      {/* Bulk bar */}
      {selected.size ? (
        <div className="flex items-center gap-2 border-b border-accent/30 bg-accent-soft px-5 py-2 text-[13px]">
          <span className="text-ink">{selected.size} selected</span>
          {entity && canWrite ? (
            <>
              <button className={buttonClass("secondary", "sm")} onClick={() => setDialog("list")}>
                Add to list
              </button>
              <button className={buttonClass("secondary", "sm")} onClick={() => setDialog("status")}>
                Set status
              </button>
            </>
          ) : null}
          <button className={buttonClass("secondary", "sm")} onClick={() => setDialog("export")}>
            Export selected
          </button>
          <button className="ml-auto text-muted hover:text-ink" onClick={() => setSelected(new Set())} aria-label="Clear selection">
            <X size={15} />
          </button>
        </div>
      ) : null}

      {/* Grid */}
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto outline-none" tabIndex={0} onKeyDown={onKey} role="grid" aria-rowcount={total} aria-label={`${meta.label} results`}>
        <div style={{ width: totalWidth, minWidth: "100%" }}>
          <div className="sticky top-0 z-10 grid border-b border-line bg-canvas/95 text-[11px] uppercase tracking-wide text-faint backdrop-blur" style={{ gridTemplateColumns: gridTemplate }} role="row">
            <div className="flex items-center justify-center py-2.5">
              <input
                type="checkbox"
                className="accent-[#d8ff4a]"
                aria-label="Select all loaded rows"
                checked={rows.length > 0 && selected.size === rows.length}
                onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => String(r.id))) : new Set())}
              />
            </div>
            {entity ? <div className="px-3 py-2.5 font-medium">Status</div> : null}
            {columns.map((c) => (
              <button
                key={c.key}
                role="columnheader"
                onClick={() => toggleSort(c.sortField)}
                className={cn("flex items-center gap-1 px-3 py-2.5 text-left font-medium uppercase", c.align === "right" && "justify-end", c.sortField ? "hover:text-ink" : "cursor-default")}
                aria-sort={sort?.field === c.sortField ? (sort?.dir === "asc" ? "ascending" : "descending") : undefined}
              >
                {c.label}
                {sort?.field === c.sortField && c.sortField ? sort?.dir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} /> : null}
              </button>
            ))}
          </div>

          {error ? (
            <div className="p-10 text-center text-[13px] text-negative">
              {error}{" "}
              <button className="underline" onClick={() => { lastKey.current = ""; setFilter({ ...filter }); }}>
                Retry
              </button>
            </div>
          ) : null}
          {!loading && !error && rows.length === 0 ? (
            <div className="p-16 text-center">
              <p className="font-display text-[17px] text-ink">No {meta.label.toLowerCase()} match these filters.</p>
              <p className="mt-1 text-[13px] text-muted">Remove a filter or broaden the ranges.</p>
            </div>
          ) : null}

          <div style={{ height: virt.getTotalSize(), position: "relative" }} className={cn(loading && "opacity-50 transition-opacity")}>
            {items.map((v) => {
              const r = rows[v.index] as Row;
              const id = String(r.id);
              const st = rowStatus[id];
              return (
                <div
                  key={id}
                  role="row"
                  aria-selected={selected.has(id)}
                  onClick={() => router.push(rowHref(product, r))}
                  className={cn(
                    "absolute left-0 grid w-full cursor-pointer items-center border-b border-line/60 text-[13px] hover:bg-white/[0.03]",
                    selected.has(id) && "bg-accent-soft/60",
                    focus === v.index && "outline outline-1 -outline-offset-1 outline-accent/60",
                  )}
                  style={{ top: v.start, height: ROW_H, gridTemplateColumns: gridTemplate }}
                >
                  <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" className="accent-[#d8ff4a]" checked={selected.has(id)} onChange={() => toggle(id)} aria-label="Select row" />
                  </div>
                  {entity ? (
                    <div className="px-3">
                      {st ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-[11px]" style={{ color: st.color }}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: st.color }} />
                          {st.label}
                        </span>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </div>
                  ) : null}
                  {columns.map((c) => (
                    <div key={c.key} className={cn("min-w-0 overflow-hidden whitespace-nowrap px-3", c.align === "right" && "text-right")}>
                      {c.render(r, appLink)}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          {loadingMore ? (
            <div className="flex items-center justify-center gap-2 py-4 text-[12px] text-muted">
              <Loader2 size={13} className="animate-spin" /> Loading more…
            </div>
          ) : rows.length && rows.length >= total ? (
            <p className="py-4 text-center text-[12px] text-faint">
              Showing {rows.length.toLocaleString()} of {total.toLocaleString()}
              {capped ? `+ (exact count up to ${EXACT_COUNT_CAP.toLocaleString()})` : ""}
            </p>
          ) : null}
        </div>
      </div>

      {/* Dialogs */}
      {dialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => setDialog(null)}>
          <div className="w-full max-w-md rounded-2xl border border-line-strong bg-paper p-5 shadow-[var(--shadow-window)]" onClick={(e) => e.stopPropagation()}>
            {dialog === "export" ? (
              <div className="flex flex-col gap-3">
                <h2 className="text-[17px] font-semibold">Export to CSV</h2>
                <p className="text-[13px] text-muted">
                  {selected.size ? `${selected.size} selected rows` : `${exportCount.toLocaleString()} rows${total > EXPORT_MAX_ROWS ? ` (first ${EXPORT_MAX_ROWS.toLocaleString()})` : ""}`} · visible columns.
                </p>
                <p className="rounded-lg border border-accent/30 bg-accent-soft p-3 text-[13px] text-ink">
                  Costs <strong>{pageCost(exportCount)}</strong> credit{pageCost(exportCount) === 1 ? "" : "s"} (1 per 100 rows).
                </p>
                <div className="flex justify-end gap-2">
                  <button className={buttonClass("ghost", "sm")} onClick={() => setDialog(null)}>
                    Cancel
                  </button>
                  <a
                    className={buttonClass("primary", "sm")}
                    href={exportHref()}
                    onClick={() => {
                      setDialog(null);
                      flash("Export started — check your downloads.");
                    }}
                  >
                    Export
                  </a>
                </div>
              </div>
            ) : null}
            {dialog === "save" ? (
              <SaveSearchForm
                onCancel={() => setDialog(null)}
                onSave={async (name, cadence, visibility) => {
                  const r = await saveSearch({ name, product, filter, nlQuery: nl || undefined, cadence, visibility, sort });
                  setDialog(null);
                  flash("Search saved — we'll flag new matches.");
                  router.refresh();
                  return r;
                }}
              />
            ) : null}
            {dialog === "columns" ? (
              <div className="flex flex-col gap-3">
                <h2 className="text-[17px] font-semibold">Columns</h2>
                <div className="grid max-h-[50vh] grid-cols-2 gap-1 overflow-y-auto">
                  {COLUMNS[product].map((c) => (
                    <label key={c.key} className="flex items-center gap-2 rounded px-2 py-1.5 text-[13px] hover:bg-white/[0.05]">
                      <input
                        type="checkbox"
                        className="accent-[#d8ff4a]"
                        checked={!hidden.has(c.key)}
                        onChange={(e) => {
                          const n = new Set(hidden);
                          if (e.target.checked) n.delete(c.key);
                          else n.add(c.key);
                          setHidden(n);
                          localStorage.setItem(`fai-cols-${product}`, JSON.stringify([...n]));
                        }}
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
                <button className={buttonClass("primary", "sm", "self-end")} onClick={() => setDialog(null)}>
                  Done
                </button>
              </div>
            ) : null}
            {dialog === "list" && entity ? (
              <ListPicker
                lists={listsForEntity}
                onPick={(listId, name) =>
                  start(async () => {
                    const n = await addToList(listId, [...selected]);
                    setDialog(null);
                    setSelected(new Set());
                    flash(`Added ${n} to ${name}`);
                  })
                }
                onCreate={(name) =>
                  start(async () => {
                    await createList(name, entity, [...selected]);
                    setDialog(null);
                    setSelected(new Set());
                    flash(`Created ${name}`);
                    router.refresh();
                  })
                }
              />
            ) : null}
            {dialog === "status" && entity ? (
              <div className="flex flex-col gap-2">
                <h2 className="mb-1 text-[17px] font-semibold">Set status</h2>
                {[...statuses, { id: "", label: "Clear status", color: "#6b6b6b" }].map((s) => (
                  <button
                    key={s.id || "clear"}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-white/[0.05]"
                    onClick={() =>
                      start(async () => {
                        await setStatus(entity, [...selected], s.id || null);
                        setRowStatus((prev) => {
                          const n = { ...prev };
                          for (const id of selected) {
                            if (s.id) n[id] = s;
                            else delete n[id];
                          }
                          return n;
                        });
                        setDialog(null);
                        setSelected(new Set());
                      })
                    }
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                    {s.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {toast ? <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border border-line-strong bg-paper px-4 py-2 text-[13px] text-ink shadow-[var(--shadow-window)]">{toast}</div> : null}
    </div>
  );
}

function SaveSearchForm({ onSave, onCancel }: { onSave: (name: string, cadence: "OFF" | "REALTIME" | "DAILY" | "WEEKLY", visibility: "PRIVATE" | "TEAM") => Promise<unknown>; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [cadence, setCadence] = useState<"OFF" | "REALTIME" | "DAILY" | "WEEKLY">("DAILY");
  const [visibility, setVisibility] = useState<"PRIVATE" | "TEAM">("TEAM");
  const [busy, setBusy] = useState(false);
  const input = "h-9 w-full rounded-md border border-line bg-white/[0.03] px-2.5 text-[13px] text-ink focus:border-accent/60 focus:outline-none";
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setBusy(true);
        await onSave(name.trim(), cadence, visibility);
        setBusy(false);
      }}
    >
      <h2 className="text-[17px] font-semibold">Save search</h2>
      <input autoFocus className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Seed fintech in Bolivia" />
      <label className="text-[12px] text-muted">
        Alerts
        <select className={cn(input, "mt-1")} value={cadence} onChange={(e) => setCadence(e.target.value as typeof cadence)}>
          <option value="OFF">Off</option>
          <option value="REALTIME">Real-time</option>
          <option value="DAILY">Daily digest</option>
          <option value="WEEKLY">Weekly digest</option>
        </select>
      </label>
      <label className="text-[12px] text-muted">
        Visibility
        <select className={cn(input, "mt-1")} value={visibility} onChange={(e) => setVisibility(e.target.value as typeof visibility)}>
          <option value="TEAM">Team</option>
          <option value="PRIVATE">Private</option>
        </select>
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" className={buttonClass("ghost", "sm")} onClick={onCancel}>
          Cancel
        </button>
        <button className={buttonClass("primary", "sm")} disabled={busy || !name.trim()}>
          Save
        </button>
      </div>
    </form>
  );
}

function ListPicker({ lists, onPick, onCreate }: { lists: { id: string; name: string }[]; onPick: (id: string, name: string) => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <h2 className="mb-1 text-[17px] font-semibold">Add to list</h2>
      <div className="max-h-[40vh] overflow-y-auto">
        {lists.map((l) => (
          <button key={l.id} className="block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-white/[0.05]" onClick={() => onPick(l.id, l.name)}>
            {l.name}
          </button>
        ))}
      </div>
      <form
        className="flex gap-2 border-t border-line pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onCreate(name.trim());
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New list name" className="h-9 flex-1 rounded-md border border-line bg-white/[0.03] px-2.5 text-[13px] text-ink outline-none" />
        <button className={buttonClass("primary", "sm")}>Create</button>
      </form>
    </div>
  );
}
