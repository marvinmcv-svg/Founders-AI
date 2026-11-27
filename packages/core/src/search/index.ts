/**
 * OpenSearch search backend + outbox indexer (plan 8, D-075).
 *
 *   documents  every non-scoped registry field evaluated in SQL (the same expressions the SQL
 *              compiler filters on), so both backends answer the same filter the same way
 *   search     scoped conditions → Postgres ID sets → DSL → ordered ids + total → rows hydrated from
 *              Postgres by the caller (response shape unchanged)
 *   indexer    outbox_events (search_indexed_at IS NULL) → affected documents per product, including
 *              denormalised children (a company change re-indexes its rounds, M&A, IPOs, news)
 *
 * Enabled only with OPENSEARCH_URL and SEARCH_BACKEND=opensearch; Postgres stays the default and
 * the fallback (searchEntities falls back on any OpenSearch error).
 */
import { getDb } from "@founders/db";
import { sql, type SQL } from "drizzle-orm";
import { emptyFilter, isGroup, PRODUCTS, type Condition, type FilterNode, type Group, type Product } from "../filters/ast";
import { compileFilter } from "../filters/compile";
import { PRODUCT_META } from "../filters/fields";
import { compileDsl, compileDslQuery, compileDslSort, documentFields, indexDefinition, isScopedCondition, scopedKey, type Dsl } from "./dsl";
import { OpenSearchClient } from "./opensearch";

export { compileDsl, compileDslQuery, compileDslSort, documentFields, indexDefinition } from "./dsl";
export { OpenSearchClient, OpenSearchError, type OsFetch } from "./opensearch";

type Row = Record<string, unknown>;
const q = async <T = Row>(query: SQL): Promise<T[]> => (await getDb().execute(query)) as unknown as T[];
const idList = (ids: string[]) => sql.join(ids.map((x) => sql`${x}`), sql`, `);

/** Org-scoped ID sets are capped; a filter wider than this falls back to Postgres. */
export const SCOPED_ID_CAP = 65_536;

export const indexName = (product: Product) => `${process.env.OPENSEARCH_INDEX_PREFIX ?? "founders_"}${product}`;

export function searchBackendEnabled(): boolean {
  return process.env.SEARCH_BACKEND === "opensearch" && !!process.env.OPENSEARCH_URL?.trim();
}

let shared: OpenSearchClient | null | undefined;
export function getSearchClient(): OpenSearchClient | null {
  if (shared === undefined) shared = OpenSearchClient.fromEnv();
  return shared;
}
/** Test hook. */
export function setSearchClient(c: OpenSearchClient | null | undefined) {
  shared = c;
}

const fromClause = (product: Product) => {
  const meta = PRODUCT_META[product];
  const softDelete = product === "companies" || product === "people" || product === "investors" ? " AND t.deleted_at IS NULL" : "";
  return sql.raw(`FROM ${meta.table} t ${meta.join ?? ""} WHERE TRUE${softDelete}`);
};

/* ------------------------------------------------------------------ */
/* Documents                                                           */
/* ------------------------------------------------------------------ */

const toJson = (v: unknown): unknown => (v instanceof Date ? v.toISOString() : typeof v === "bigint" ? Number(v) : v);

/** Live documents for `ids`; ids that are missing (deleted) are simply absent from the result. */
export async function buildDocuments(product: Product, ids: string[]): Promise<{ id: string; doc: Row }[]> {
  if (!ids.length) return [];
  const fields = documentFields(product);
  const cols = fields.map((f) => sql`${sql.raw(f.column)} AS ${sql.identifier(f.key)}`);
  const text = PRODUCT_META[product].textColumns.map((c) => sql.raw(`${c}::text`));
  const rows = await q<Row>(sql`SELECT t.id AS __id, ${sql.join(cols, sql`, `)}, array_remove(ARRAY[${sql.join(text, sql`, `)}], NULL) AS __text
    ${fromClause(product)} AND t.id IN (${idList(ids)})`);
  return rows.map((r) => {
    const doc: Row = { id: String(r.__id), search_text: r.__text };
    for (const f of fields) {
      const v = r[f.key];
      if (v === null || v === undefined || (Array.isArray(v) && !v.length)) continue;
      doc[f.key] = f.type === "number" || f.type === "money" || f.type === "percent" ? Number(v) : toJson(v);
    }
    return { id: String(r.__id), doc };
  });
}

/** Ids of children whose documents embed fields of a changed parent (denormalised joins). */
async function dependents(product: string, ids: string[]): Promise<[Product, string[]][]> {
  if (!ids.length) return [];
  const list = idList(ids);
  const pick = async (p: Product, query: SQL): Promise<[Product, string[]]> => [p, (await q<{ id: string }>(query)).map((r) => r.id)];
  if (product === "companies")
    return Promise.all([
      pick("funding_rounds", sql`SELECT id FROM funding_rounds WHERE company_id IN (${list})`),
      pick("acquisitions", sql`SELECT id FROM acquisitions WHERE target_id IN (${list})`),
      pick("ipos", sql`SELECT id FROM ipos WHERE company_id IN (${list})`),
      pick("news_signals", sql`SELECT id FROM news_signals WHERE company_id IN (${list})`),
      pick("interest_signals", sql`SELECT id FROM interest_signals WHERE target_company_id IN (${list})`),
    ]);
  if (product === "people") return [await pick("talent_signals", sql`SELECT id FROM talent_signals WHERE person_id IN (${list})`)];
  if (product === "investors") return [await pick("interest_signals", sql`SELECT id FROM interest_signals WHERE investor_id IN (${list})`)];
  return [];
}

/** Index (or delete, when gone) the given entities. */
export async function indexEntities(client: OpenSearchClient, product: Product, ids: string[]): Promise<{ indexed: number; deleted: number }> {
  const unique = [...new Set(ids)];
  let indexed = 0;
  let deleted = 0;
  for (let i = 0; i < unique.length; i += 1000) {
    const chunk = unique.slice(i, i + 1000);
    const docs = await buildDocuments(product, chunk);
    const live = new Set(docs.map((d) => d.id));
    const r = await client.bulk([
      ...docs.map((d) => ({ index: { _index: indexName(product), _id: d.id }, doc: d.doc })),
      ...chunk.filter((id) => !live.has(id)).map((id) => ({ delete: { _index: indexName(product), _id: id } })),
    ]);
    indexed += r.indexed;
    deleted += r.deleted;
  }
  return { indexed, deleted };
}

/** Create missing indices with the registry-derived mappings. */
export async function ensureIndices(client: OpenSearchClient, products: readonly Product[] = PRODUCTS): Promise<string[]> {
  const created: string[] = [];
  for (const p of products) {
    if (await client.indexExists(indexName(p))) continue;
    await client.request("PUT", `/${indexName(p)}`, indexDefinition(p));
    created.push(indexName(p));
  }
  return created;
}

/** Full rebuild of one product: recreate the index, stream every live row in id order. */
export async function reindexProduct(client: OpenSearchClient, product: Product, opts: { batch?: number; onProgress?: (n: number) => void } = {}): Promise<number> {
  await client.request("DELETE", `/${indexName(product)}`, undefined, { allow404: true });
  await client.request("PUT", `/${indexName(product)}`, indexDefinition(product));
  const batch = opts.batch ?? 2000;
  let after = "";
  let total = 0;
  for (;;) {
    const ids = (await q<{ id: string }>(sql`SELECT t.id ${fromClause(product)} AND t.id > ${after} ORDER BY t.id LIMIT ${batch}`)).map((r) => r.id);
    if (!ids.length) break;
    total += (await indexEntities(client, product, ids)).indexed;
    after = ids[ids.length - 1]!;
    opts.onProgress?.(total);
  }
  await client.request("POST", `/${indexName(product)}/_refresh`);
  return total;
}

/**
 * Apply pending outbox events (oldest first). Each event re-indexes its entity and the documents
 * that embed it. Returns how many events were applied; lag target < 5 min (plan 15).
 */
export async function processSearchOutbox(client: OpenSearchClient, limit = 5000): Promise<{ events: number; indexed: number; deleted: number }> {
  await ensureIndices(client); // a change can touch any product's documents (denormalised children)
  const events = await q<{ id: number; product: string; entity_id: string }>(
    sql`SELECT id, product, entity_id FROM outbox_events WHERE search_indexed_at IS NULL ORDER BY id LIMIT ${limit}`,
  );
  if (!events.length) return { events: 0, indexed: 0, deleted: 0 };
  const byProduct = new Map<string, string[]>();
  for (const e of events) byProduct.set(e.product, [...(byProduct.get(e.product) ?? []), e.entity_id]);
  let indexed = 0;
  let deleted = 0;
  for (const [product, ids] of byProduct) {
    const targets: [Product, string[]][] = [...((PRODUCTS as readonly string[]).includes(product) ? [[product as Product, ids] as [Product, string[]]] : []), ...(await dependents(product, ids))];
    for (const [p, xs] of targets) {
      const r = await indexEntities(client, p, xs);
      indexed += r.indexed;
      deleted += r.deleted;
    }
  }
  const maxId = events[events.length - 1]!.id;
  await q(sql`UPDATE outbox_events SET search_indexed_at = now() WHERE search_indexed_at IS NULL AND id <= ${maxId}`);
  return { events: events.length, indexed, deleted };
}

/** Mark the whole outbox as applied (after a full reindex). */
export async function markOutboxIndexed(): Promise<number> {
  const r = await q<{ n: number }>(sql`WITH u AS (UPDATE outbox_events SET search_indexed_at = now() WHERE search_indexed_at IS NULL RETURNING 1) SELECT count(*)::int AS n FROM u`);
  return r[0]?.n ?? 0;
}

/** Seconds since the oldest unapplied outbox event (0 when caught up). */
export async function searchIndexLagSeconds(): Promise<number> {
  const [r] = await q<{ s: number | null }>(sql`SELECT extract(epoch FROM now() - min(at))::int AS s FROM outbox_events WHERE search_indexed_at IS NULL`);
  return r?.s ?? 0;
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

function scopedConditions(product: Product, node: FilterNode, out: Condition[] = []): Condition[] {
  if (isGroup(node)) for (const c of node.children) scopedConditions(product, c, out);
  else if (isScopedCondition(product, node)) out.push(node);
  return out;
}

/** Postgres ID sets for org-scoped conditions, computed with the caller's org (never from the client). */
export async function resolveScopedIds(product: Product, node: FilterNode, orgId?: string): Promise<Map<string, string[]> | null> {
  const out = new Map<string, string[]>();
  for (const c of scopedConditions(product, node)) {
    const key = scopedKey(c);
    if (out.has(key)) continue;
    const group: Group = { kind: "group", op: "AND", children: [c] };
    const rows = await q<{ id: string }>(sql`SELECT t.id ${fromClause(product)} AND ${compileFilter(product, group, { orgId })} LIMIT ${SCOPED_ID_CAP + 1}`);
    if (rows.length > SCOPED_ID_CAP) return null; // too wide for a terms filter: let Postgres answer
    out.set(key, rows.map((r) => r.id));
  }
  return out;
}

export type SearchIdsParams = { filter?: FilterNode; q?: string | null; sort?: { field: string; dir: "asc" | "desc" } | null; limit: number; offset: number; orgId?: string; ids?: string[]; totalCap: number };

/** Build the full search body (exported for tests and debugging). */
export function searchBody(product: Product, p: SearchIdsParams, scoped: Map<string, string[]>): Dsl {
  const filter: Dsl[] = [compileDsl(product, p.filter ?? emptyFilter(), scoped), compileDslQuery(p.q)];
  if (p.ids) filter.push({ terms: { id: p.ids } });
  return {
    query: { bool: { filter } },
    sort: compileDslSort(product, p.sort),
    from: p.offset,
    size: p.limit,
    track_total_hits: p.totalCap + 1,
    _source: false,
  };
}

/** Ordered ids + total from OpenSearch, or null when this request must go to Postgres. */
export async function searchIds(client: OpenSearchClient, product: Product, p: SearchIdsParams): Promise<{ ids: string[]; total: number } | null> {
  if (p.offset + p.limit > 100_000) return null; // beyond max_result_window
  const scoped = await resolveScopedIds(product, p.filter ?? emptyFilter(), p.orgId);
  if (!scoped) return null;
  const r = await client.request<{ hits: { total: { value: number }; hits: { _id: string }[] } }>("POST", `/${indexName(product)}/_search`, searchBody(product, p, scoped));
  return { ids: r.hits.hits.map((h) => h._id), total: r.hits.total.value };
}
