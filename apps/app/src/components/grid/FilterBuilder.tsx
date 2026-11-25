"use client";
/**
 * Filter builder (plan 7.4): searchable grouped field picker, per-type operators and value editors,
 * chips summarising top-level conditions, and an advanced tree editor for nested AND/OR groups.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Filter, FolderTree, Plus, Trash2, X } from "lucide-react";
import {
  describeCondition, describeFilter, FIELDS, OPERATOR_LABELS, OPERATORS_BY_TYPE, isGroup,
  type Condition, type FieldDef, type FilterNode, type Group, type Operator, type Product,
} from "@founders/core/filters";
import { buttonClass, Chip, cn } from "@founders/ui";

const NO_VALUE = new Set<Operator>(["exists", "not_exists", "is_true", "is_false"]);
const input = "h-9 w-full rounded-md border border-line bg-white/[0.03] px-2.5 text-[13px] text-ink focus:border-accent/60 focus:outline-none";

/** "5M" → 5000000, "250k" → 250000. */
export function parseAmount(s: string): number | null {
  const m = s.trim().toLowerCase().replace(/[$,\s]/g, "").match(/^(-?\d+(?:\.\d+)?)(k|m|b|bn)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  const u = m[2];
  return u === "k" ? n * 1e3 : u === "m" ? n * 1e6 : u === "b" || u === "bn" ? n * 1e9 : n;
}

function Popover({ open, onClose, children, className }: { open: boolean; onClose: () => void; children: ReactNode; className?: string }) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className={cn("absolute z-50 mt-2 rounded-xl border border-line-strong bg-paper p-3 shadow-[var(--shadow-window)]", className)}>{children}</div>
    </>
  );
}

export function FieldPicker({ product, onPick }: { product: Product; onPick: (f: FieldDef) => void }) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const by = new Map<string, FieldDef[]>();
    for (const f of FIELDS[product]) {
      if (q && !`${f.label} ${f.group}`.toLowerCase().includes(q.toLowerCase())) continue;
      by.set(f.group, [...(by.get(f.group) ?? []), f]);
    }
    return [...by.entries()];
  }, [product, q]);
  return (
    <div className="w-[300px]">
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search fields…" className={input} />
      <div className="mt-2 max-h-[340px] overflow-y-auto">
        {groups.map(([g, fs]) => (
          <div key={g} className="py-1">
            <p className="px-2 py-1 text-[10.5px] uppercase tracking-wider text-faint">{g}</p>
            {fs.map((f) => (
              <button key={f.key} onClick={() => onPick(f)} className="block w-full rounded-md px-2 py-1.5 text-left text-[13px] text-text hover:bg-white/[0.06] hover:text-ink">
                {f.label}
              </button>
            ))}
          </div>
        ))}
        {groups.length === 0 ? <p className="px-2 py-3 text-[13px] text-muted">No matching fields.</p> : null}
      </div>
    </div>
  );
}

export function ValueEditor({ field, op, value, onChange, lists }: { field: FieldDef; op: Operator; value: Condition["value"]; onChange: (v: Condition["value"]) => void; lists: { id: string; name: string }[] }) {
  const [q, setQ] = useState("");
  if (NO_VALUE.has(op)) return null;
  if (field.type === "list")
    return (
      <select className={input} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose a list…</option>
        {lists.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    );
  if (field.options && (op === "any_of" || op === "none_of" || op === "all_of")) {
    const selected = new Set((Array.isArray(value) ? value : value ? [value] : []).map(String));
    const opts = field.options.filter((o) => !q || o.label.toLowerCase().includes(q.toLowerCase()));
    return (
      <div className="flex flex-col gap-2">
        {field.options.length > 8 ? <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search values…" className={input} /> : null}
        <div className="max-h-[220px] overflow-y-auto rounded-md border border-line p-1">
          {opts.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] text-text hover:bg-white/[0.05]">
              <input
                type="checkbox"
                className="accent-[#d8ff4a]"
                checked={selected.has(o.value)}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(o.value);
                  else next.delete(o.value);
                  onChange([...next]);
                }}
              />
              {o.label}
            </label>
          ))}
        </div>
      </div>
    );
  }
  if (op === "between") {
    const [a, b] = Array.isArray(value) ? value : [];
    const conv = (s: string) => (field.type === "money" ? parseAmount(s) : s === "" ? null : Number(s));
    return (
      <div className="flex items-center gap-2">
        <input className={input} defaultValue={a === undefined ? "" : String(a)} placeholder="min" onChange={(e) => onChange([conv(e.target.value) ?? 0, Number(b ?? 0)])} />
        <span className="text-muted">–</span>
        <input className={input} defaultValue={b === undefined ? "" : String(b)} placeholder="max" onChange={(e) => onChange([Number(a ?? 0), conv(e.target.value) ?? 0])} />
      </div>
    );
  }
  if (op === "within_last_days")
    return (
      <div className="flex items-center gap-2">
        <input type="number" min={1} className={input} value={value === undefined || value === null ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} />
        <span className="text-[13px] text-muted">days</span>
      </div>
    );
  if (op === "before" || op === "after") return <input type="date" className={input} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
  if (field.type === "money")
    return <input className={input} placeholder="e.g. 5M, 250k" defaultValue={value === undefined || value === null ? "" : String(value)} onChange={(e) => onChange(parseAmount(e.target.value) ?? undefined)} />;
  if (field.type === "number" || field.type === "percent")
    return (
      <div className="flex items-center gap-2">
        <input type="number" className={input} value={value === undefined || value === null ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))} />
        {field.type === "percent" ? <span className="text-[13px] text-muted">%</span> : null}
      </div>
    );
  return <input className={input} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} placeholder="Value" />;
}

function ConditionForm({ product, initial, onApply, onCancel, lists }: { product: Product; initial: Condition; onApply: (c: Condition) => void; onCancel: () => void; lists: { id: string; name: string }[] }) {
  const field = FIELDS[product].find((f) => f.key === initial.field);
  const [op, setOp] = useState<Operator>(initial.operator);
  const [value, setValue] = useState<Condition["value"]>(initial.value);
  if (!field) return null;
  return (
    <div className="flex w-[320px] flex-col gap-3">
      <p className="text-[13px] font-medium text-ink">{field.label}</p>
      <select className={input} value={op} onChange={(e) => setOp(e.target.value as Operator)}>
        {OPERATORS_BY_TYPE[field.type].map((o) => (
          <option key={o} value={o}>
            {OPERATOR_LABELS[o]}
          </option>
        ))}
      </select>
      <ValueEditor field={field} op={op} value={value} onChange={setValue} lists={lists} />
      <div className="flex justify-end gap-2">
        <button className={buttonClass("ghost", "sm")} onClick={onCancel}>
          Cancel
        </button>
        <button className={buttonClass("primary", "sm")} onClick={() => onApply({ kind: "condition", field: field.key, operator: op, value: NO_VALUE.has(op) ? undefined : value })}>
          Apply
        </button>
      </div>
    </div>
  );
}

function defaultCondition(f: FieldDef): Condition {
  return { kind: "condition", field: f.key, operator: OPERATORS_BY_TYPE[f.type][0] as Operator };
}

/* ---------------- advanced tree editor ---------------- */

function GroupEditor({ product, group, onChange, onRemove, depth, lists }: { product: Product; group: Group; onChange: (g: Group) => void; onRemove?: () => void; depth: number; lists: { id: string; name: string }[] }) {
  const [picking, setPicking] = useState(false);
  const set = (i: number, n: FilterNode | null) => {
    const children = [...group.children];
    if (n === null) children.splice(i, 1);
    else children[i] = n;
    onChange({ ...group, children });
  };
  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border p-3", depth ? "border-accent/25 bg-accent-soft/40" : "border-line")}>
      <div className="flex items-center gap-2 text-[12px]">
        <span className="text-muted">Match</span>
        {(["AND", "OR"] as const).map((op) => (
          <button key={op} onClick={() => onChange({ ...group, op })} className={cn("rounded-full px-2.5 py-0.5", group.op === op ? "bg-accent text-accent-ink" : "border border-line text-muted")}>
            {op === "AND" ? "all (AND)" : "any (OR)"}
          </button>
        ))}
        {onRemove ? (
          <button onClick={onRemove} className="ml-auto text-muted hover:text-negative" aria-label="Remove group">
            <Trash2 size={14} />
          </button>
        ) : null}
      </div>
      {group.children.map((c, i) =>
        isGroup(c) ? (
          <GroupEditor key={i} product={product} group={c} depth={depth + 1} onChange={(g) => set(i, g)} onRemove={() => set(i, null)} lists={lists} />
        ) : (
          <ConditionRow key={i} product={product} cond={c} onChange={(n) => set(i, n)} onRemove={() => set(i, null)} lists={lists} />
        ),
      )}
      <div className="relative flex gap-2">
        <button className={buttonClass("ghost", "sm")} onClick={() => setPicking(true)}>
          <Plus size={13} /> Condition
        </button>
        {depth < 3 ? (
          <button className={buttonClass("ghost", "sm")} onClick={() => onChange({ ...group, children: [...group.children, { kind: "group", op: group.op === "AND" ? "OR" : "AND", children: [] }] })}>
            <FolderTree size={13} /> Nested group
          </button>
        ) : null}
        <Popover open={picking} onClose={() => setPicking(false)} className="left-0 top-8">
          <FieldPicker
            product={product}
            onPick={(f) => {
              onChange({ ...group, children: [...group.children, defaultCondition(f)] });
              setPicking(false);
            }}
          />
        </Popover>
      </div>
    </div>
  );
}

function ConditionRow({ product, cond, onChange, onRemove, lists }: { product: Product; cond: Condition; onChange: (c: Condition) => void; onRemove: () => void; lists: { id: string; name: string }[] }) {
  const field = FIELDS[product].find((f) => f.key === cond.field);
  if (!field) return null;
  return (
    <div className="grid grid-cols-[140px_130px_1fr_24px] items-start gap-2 rounded-md bg-white/[0.02] p-2">
      <span className="pt-2 text-[12.5px] text-ink">{field.label}</span>
      <select className={input} value={cond.operator} onChange={(e) => onChange({ ...cond, operator: e.target.value as Operator })}>
        {OPERATORS_BY_TYPE[field.type].map((o) => (
          <option key={o} value={o}>
            {OPERATOR_LABELS[o]}
          </option>
        ))}
      </select>
      <ValueEditor field={field} op={cond.operator} value={cond.value} onChange={(v) => onChange({ ...cond, value: v })} lists={lists} />
      <button onClick={onRemove} className="pt-2 text-muted hover:text-negative" aria-label="Remove condition">
        <X size={14} />
      </button>
    </div>
  );
}

/* ---------------- toolbar: chips + add filter + advanced ---------------- */

export function FilterBar({ product, filter, onChange, lists }: { product: Product; filter: Group; onChange: (g: Group) => void; lists: { id: string; name: string }[] }) {
  const [adding, setAdding] = useState<"pick" | Condition | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [draft, setDraft] = useState<Group>(filter);
  const listNames = Object.fromEntries(lists.map((l) => [l.id, l.name]));
  const count = filter.children.length;
  const replace = (i: number, n: FilterNode | null) => {
    const children = [...filter.children];
    if (n === null) children.splice(i, 1);
    else children[i] = n;
    onChange({ ...filter, children });
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="relative">
        <button className={buttonClass("secondary", "sm")} onClick={() => setAdding("pick")}>
          <Filter size={13} /> Add Filter
          {count ? <span className="rounded bg-accent px-1 text-[10px] font-semibold text-accent-ink">{count}</span> : null}
        </button>
        <Popover open={adding !== null} onClose={() => setAdding(null)} className="left-0">
          {adding === "pick" ? (
            <FieldPicker product={product} onPick={(f) => setAdding(defaultCondition(f))} />
          ) : adding ? (
            <ConditionForm
              product={product}
              initial={adding}
              lists={lists}
              onCancel={() => setAdding(null)}
              onApply={(c) => {
                onChange({ ...filter, children: [...filter.children, c] });
                setAdding(null);
              }}
            />
          ) : null}
        </Popover>
      </div>
      {count > 1 ? (
        <button
          onClick={() => onChange({ ...filter, op: filter.op === "AND" ? "OR" : "AND" })}
          className="rounded-full border border-line px-2 py-1 text-[11px] text-muted hover:text-ink"
          title="Toggle how top-level filters combine"
        >
          {filter.op === "AND" ? "Match all" : "Match any"}
        </button>
      ) : null}
      {filter.children.map((c, i) => (
        <div key={i} className="relative">
          <Chip active className="cursor-pointer py-1 text-[12px]" onClick={() => (isGroup(c) ? (setDraft(filter), setAdvanced(true)) : setEditing(i))} onRemove={() => replace(i, null)}>
            {isGroup(c) ? `(${describeFilter(product, c, listNames) || "empty group"})` : describeCondition(product, c, listNames)}
          </Chip>
          {editing === i && !isGroup(c) ? (
            <Popover open onClose={() => setEditing(null)} className="left-0">
              <ConditionForm
                product={product}
                initial={c}
                lists={lists}
                onCancel={() => setEditing(null)}
                onApply={(n) => {
                  replace(i, n);
                  setEditing(null);
                }}
              />
            </Popover>
          ) : null}
        </div>
      ))}
      <button
        className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] text-muted hover:text-ink"
        onClick={() => {
          setDraft(filter);
          setAdvanced(true);
        }}
      >
        <FolderTree size={13} /> Advanced
      </button>

      {advanced ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={() => setAdvanced(false)}>
          <div className="flex h-full w-full max-w-[620px] flex-col gap-4 overflow-y-auto border-l border-line-strong bg-paper p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-[18px] font-semibold">Edit filters</h2>
              <button onClick={() => setAdvanced(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <p className="text-[13px] text-muted">Combine conditions with nested AND / OR groups — e.g. an ecosystem of verticals (any) plus firm-level filters (all).</p>
            <GroupEditor product={product} group={draft} depth={0} onChange={setDraft} lists={lists} />
            <p className="text-[12px] text-faint">{describeFilter(product, draft, listNames) || "No filters"}</p>
            <div className="mt-auto flex justify-end gap-2">
              <button className={buttonClass("ghost")} onClick={() => setAdvanced(false)}>
                Cancel
              </button>
              <button
                className={buttonClass("primary")}
                onClick={() => {
                  onChange(draft);
                  setAdvanced(false);
                }}
              >
                Apply filters
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
