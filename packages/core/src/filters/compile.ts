/**
 * Filter AST → Postgres SQL (Phase 3a: Postgres-only queries on the seed).
 * The OpenSearch DSL compiler (Phase 2/3b) will implement the same contract in packages/search.
 * Column expressions come only from the whitelisted registry; every value is a bound parameter.
 */
import { sql, type SQL } from "drizzle-orm";
import { isGroup, type Condition, type FilterNode, type Product } from "./ast";
import { getField, PRODUCT_META, type FieldDef } from "./fields";

export type CompileContext = {
  /** Required for org-scoped relations (lists). Without it those conditions match nothing. */
  orgId?: string;
};

const TRUE = sql`TRUE`;
const FALSE = sql`FALSE`;

function arr(v: unknown): (string | number | boolean)[] {
  if (Array.isArray(v)) return v as (string | number | boolean)[];
  if (v === undefined || v === null) return [];
  return [v as string | number | boolean];
}

function num(field: FieldDef, v: unknown): number {
  const n = Number(v);
  return field.type === "percent" ? n / 100 : n;
}

function textArray(values: (string | number | boolean)[]): SQL {
  return sql`ARRAY[${sql.join(
    values.map((x) => sql`${String(x)}`),
    sql`, `,
  )}]::text[]`;
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

function compileCondition(product: Product, c: Condition, ctx: CompileContext): SQL {
  const field = getField(product, c.field);
  if (!field) return FALSE;
  const col = sql.raw(field.column);
  const v = c.value;
  const isArrayCol = field.type === "multi";

  switch (c.operator) {
    case "contains":
      return sql`${col} ILIKE ${`%${escapeLike(String(v))}%`}`;
    case "starts_with":
      return sql`${col} ILIKE ${`${escapeLike(String(v))}%`}`;
    case "is":
      return sql`lower(${col}) = lower(${String(v)})`;
    case "is_not":
      return sql`(${col} IS NULL OR lower(${col}) <> lower(${String(v)}))`;
    case "any_of": {
      const values = arr(v);
      if (!values.length) return TRUE;
      return isArrayCol ? sql`${col} && ${textArray(values)}` : sql`${col} = ANY(${textArray(values)})`;
    }
    case "all_of": {
      const values = arr(v);
      if (!values.length) return TRUE;
      return isArrayCol ? sql`${col} @> ${textArray(values)}` : sql`${col} = ANY(${textArray(values)})`;
    }
    case "none_of": {
      const values = arr(v);
      if (!values.length) return TRUE;
      return isArrayCol
        ? sql`NOT (${col} && ${textArray(values)})`
        : sql`(${col} IS NULL OR NOT (${col} = ANY(${textArray(values)})))`;
    }
    case "eq":
      return sql`${col} = ${num(field, v)}`;
    case "neq":
      return sql`(${col} IS NULL OR ${col} <> ${num(field, v)})`;
    case "gte":
      return sql`${col} >= ${num(field, v)}`;
    case "lte":
      return sql`${col} <= ${num(field, v)}`;
    case "between": {
      const [lo, hi] = arr(v);
      return sql`${col} BETWEEN ${num(field, lo)} AND ${num(field, hi)}`;
    }
    case "before":
      return sql`${col} < ${String(v)}::date`;
    case "after":
      return sql`${col} > ${String(v)}::date`;
    case "within_last_days":
      return sql`${col} >= (CURRENT_DATE - ${Math.max(0, Math.floor(Number(v)))}::int)`;
    case "is_true":
      return sql`${col} IS TRUE`;
    case "is_false":
      return sql`${col} IS NOT TRUE`;
    case "exists":
      return isArrayCol ? sql`cardinality(${col}) > 0` : sql`${col} IS NOT NULL`;
    case "not_exists":
      return isArrayCol ? sql`cardinality(${col}) = 0` : sql`${col} IS NULL`;
    case "in_list":
    case "not_in_list": {
      if (!ctx.orgId) return c.operator === "in_list" ? FALSE : TRUE;
      const sub = sql`SELECT li.entity_id FROM list_items li JOIN lists l ON l.id = li.list_id
        WHERE li.list_id = ${String(v)} AND l.org_id = ${ctx.orgId} AND l.deleted_at IS NULL`;
      return c.operator === "in_list" ? sql`${col} IN (${sub})` : sql`${col} NOT IN (${sub})`;
    }
    default:
      return FALSE;
  }
}

export function compileFilter(product: Product, node: FilterNode, ctx: CompileContext = {}): SQL {
  if (!isGroup(node)) return compileCondition(product, node, ctx);
  const parts = node.children.map((c) => compileFilter(product, c, ctx));
  if (!parts.length) return TRUE;
  if (parts.length === 1) return parts[0] as SQL;
  return sql`(${sql.join(parts, node.op === "AND" ? sql` AND ` : sql` OR `)})`;
}

export type SortSpec = { field: string; dir: "asc" | "desc" };

export function compileSort(product: Product, sort?: SortSpec | null): SQL {
  const meta = PRODUCT_META[product];
  const requested = sort && getField(product, sort.field)?.sortable ? sort : meta.defaultSort;
  const field = getField(product, requested.field);
  const col = sql.raw(field?.column ?? "t.id");
  const dir = requested.dir === "asc" ? sql.raw("ASC") : sql.raw("DESC");
  return sql`${col} ${dir} NULLS LAST, t.id ASC`;
}

/** Quick free-text search box (name/domain…). */
export function compileQuery(product: Product, q?: string | null): SQL {
  if (!q || !q.trim()) return TRUE;
  const like = `%${escapeLike(q.trim())}%`;
  const cols = PRODUCT_META[product].textColumns.map((c) => sql`${sql.raw(c)} ILIKE ${like}`);
  return sql`(${sql.join(cols, sql` OR `)})`;
}
