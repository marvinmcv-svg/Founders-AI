/**
 * Filter AST → OpenSearch 2.x query DSL (plan 8, D-075). Implements the same contract as the SQL
 * compiler (`filters/compile.ts`), operator by operator, over documents whose fields are the
 * registry keys (see `documentFields`). Org-scoped conditions (lists, CRM, network) are never in
 * the index: they arrive as Postgres ID sets and become `terms` on `id` (plan 8 "terms lookups").
 * Pure: no I/O.
 */
import { isGroup, type Condition, type FilterNode, type Product } from "../filters/ast";
import { FIELDS, getField, PRODUCT_META, type FieldDef } from "../filters/fields";

export type Dsl = Record<string, unknown>;

/** Fields stored in the index: everything filterable that is not org-scoped. */
export function documentFields(product: Product): FieldDef[] {
  return FIELDS[product].filter((f) => !f.scope && f.type !== "list" && f.column !== "TRUE");
}

/** True when the condition must be answered from Postgres (org-scoped or list membership). */
export function isScopedCondition(product: Product, c: Condition): boolean {
  const f = getField(product, c.field);
  return !!f && (!!f.scope || c.operator === "in_list" || c.operator === "not_in_list");
}

/** Stable key for one scoped condition (the resolver and the compiler must agree). */
export const scopedKey = (c: Condition) => JSON.stringify([c.field, c.operator, c.value ?? null]);

const MATCH_ALL: Dsl = { match_all: {} };
const MATCH_NONE: Dsl = { match_none: {} };
const not = (q: Dsl): Dsl => ({ bool: { must_not: [q] } });

function arr(v: unknown): (string | number | boolean)[] {
  if (Array.isArray(v)) return v as (string | number | boolean)[];
  if (v === undefined || v === null) return [];
  return [v as string | number | boolean];
}
const num = (f: FieldDef, v: unknown) => (f.type === "percent" ? Number(v) / 100 : Number(v));
const escapeWildcard = (s: string) => s.replace(/[\\*?]/g, (m) => `\\${m}`);

function compileOp(f: FieldDef, c: Condition): Dsl {
  const k = f.key;
  const v = c.value;
  const multi = f.type === "multi";
  switch (c.operator) {
    case "contains":
      return { wildcard: { [k]: { value: `*${escapeWildcard(String(v))}*`, case_insensitive: true } } };
    case "starts_with":
      return { prefix: { [k]: { value: String(v), case_insensitive: true } } };
    case "is":
      return { term: { [k]: { value: String(v), case_insensitive: true } } };
    case "is_not":
      return not({ term: { [k]: { value: String(v), case_insensitive: true } } });
    case "any_of": {
      const xs = arr(v);
      return xs.length ? { terms: { [k]: xs.map(String) } } : MATCH_ALL;
    }
    case "all_of": {
      const xs = arr(v);
      if (!xs.length) return MATCH_ALL;
      return multi ? { bool: { filter: xs.map((x) => ({ term: { [k]: String(x) } })) } } : { terms: { [k]: xs.map(String) } };
    }
    case "none_of": {
      const xs = arr(v);
      return xs.length ? not({ terms: { [k]: xs.map(String) } }) : MATCH_ALL;
    }
    case "eq":
      return { term: { [k]: num(f, v) } };
    case "neq":
      return not({ term: { [k]: num(f, v) } });
    case "gte":
      return { range: { [k]: { gte: num(f, v) } } };
    case "lte":
      return { range: { [k]: { lte: num(f, v) } } };
    case "between": {
      const [lo, hi] = arr(v);
      return { range: { [k]: { gte: num(f, lo), lte: num(f, hi) } } };
    }
    case "before":
      return { range: { [k]: { lt: String(v) } } };
    case "after":
      return { range: { [k]: { gt: String(v) } } };
    case "within_last_days":
      return { range: { [k]: { gte: `now/d-${Math.max(0, Math.floor(Number(v)))}d` } } };
    case "is_true":
      return { term: { [k]: true } };
    case "is_false":
      return not({ term: { [k]: true } });
    case "exists":
      return { exists: { field: k } };
    case "not_exists":
      return not({ exists: { field: k } });
    default:
      return MATCH_NONE;
  }
}

/**
 * `scopedIds` maps `scopedKey(condition)` → the matching entity ids, computed in Postgres with the
 * caller's OrgContext. A scoped condition without an entry matches nothing (fail closed).
 */
export function compileDsl(product: Product, node: FilterNode, scopedIds: Map<string, string[]> = new Map()): Dsl {
  if (isGroup(node)) {
    const parts = node.children.map((c) => compileDsl(product, c, scopedIds));
    if (!parts.length) return MATCH_ALL;
    if (parts.length === 1) return parts[0]!;
    return node.op === "AND" ? { bool: { filter: parts } } : { bool: { should: parts, minimum_should_match: 1 } };
  }
  const f = getField(product, node.field);
  if (!f) return MATCH_NONE;
  if (isScopedCondition(product, node)) {
    const ids = scopedIds.get(scopedKey(node));
    return ids ? { terms: { id: ids } } : MATCH_NONE;
  }
  return compileOp(f, node);
}

/** Quick search box: any text column contains the phrase (case-insensitive), like `compileQuery`. */
export function compileDslQuery(q?: string | null): Dsl {
  if (!q || !q.trim()) return MATCH_ALL;
  return { wildcard: { search_text: { value: `*${escapeWildcard(q.trim())}*`, case_insensitive: true } } };
}

/** Same field whitelist and fallback as `compileSort`; ties broken by id. */
export function compileDslSort(product: Product, sort?: { field: string; dir: "asc" | "desc" } | null): Dsl[] {
  const meta = PRODUCT_META[product];
  const requested = sort && getField(product, sort.field)?.sortable && documentFields(product).some((f) => f.key === sort.field) ? sort : meta.defaultSort;
  return [{ [requested.field]: { order: requested.dir, missing: "_last" } }, { id: { order: "asc" } }];
}

/* ------------------------------------------------------------------ */
/* Mappings                                                            */
/* ------------------------------------------------------------------ */

function mappingFor(f: FieldDef): Dsl {
  switch (f.type) {
    case "number":
    case "money":
    case "percent":
      return { type: "double" };
    case "date":
      return { type: "date", format: "strict_date_optional_time||yyyy-MM-dd" };
    case "boolean":
      return { type: "boolean" };
    case "text":
      return { type: "keyword", ignore_above: 512, fields: { text: { type: "text" } } };
    default:
      return { type: "keyword", ignore_above: 512 };
  }
}

/** Index settings + mappings: strict, so a field missing from the registry is an error, not a guess. */
export function indexDefinition(product: Product): Dsl {
  const properties: Record<string, Dsl> = { id: { type: "keyword" }, search_text: { type: "keyword", ignore_above: 512 } };
  for (const f of documentFields(product)) properties[f.key] = mappingFor(f);
  return {
    settings: { number_of_shards: 1, number_of_replicas: 1, "index.max_result_window": 100_000 },
    mappings: { dynamic: "strict", properties },
  };
}
