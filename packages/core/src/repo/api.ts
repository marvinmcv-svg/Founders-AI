/** Public-API state that must survive across serverless instances: AI-search queries and idempotency. */
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { newId } from "../ids";
import { rawQuery as q } from "./entities";
import type { OrgContext } from "./workspace";

export const API_QUERY_TTL_DAYS = 7;
export const IDEMPOTENCY_TTL_HOURS = 24;

export async function saveApiQuery(ctx: OrgContext, input: { product: string; query: string; filter: unknown; sort: unknown; explanation: string | null }) {
  const id = newId("query");
  await q(sql`INSERT INTO api_queries (id, org_id, product, query, filter, sort, explanation)
    VALUES (${id}, ${ctx.orgId}, ${input.product}, ${input.query}, ${JSON.stringify(input.filter)}::jsonb, ${input.sort == null ? null : JSON.stringify(input.sort)}::jsonb, ${input.explanation})`);
  return id;
}

/** Org-scoped; queries expire after API_QUERY_TTL_DAYS. */
export async function getApiQuery(ctx: OrgContext, id: string) {
  const [r] = await q<{ id: string; product: string; query: string; filter: unknown; sort: unknown; explanation: string | null }>(
    sql`SELECT id, product, query, filter, sort, explanation FROM api_queries
      WHERE id = ${id} AND org_id = ${ctx.orgId} AND created_at > now() - make_interval(days => ${API_QUERY_TTL_DAYS})`,
  );
  return r ?? null;
}

export const bodyHash = (body: string) => createHash("sha256").update(body).digest("hex");

export type StoredResponse = { status: number; response: string; method: string; path: string; body_hash: string };

export async function getIdempotent(ctx: OrgContext, key: string): Promise<StoredResponse | null> {
  const [r] = await q<StoredResponse>(sql`SELECT status, response, method, path, body_hash FROM idempotency_keys
    WHERE org_id = ${ctx.orgId} AND key = ${key} AND created_at > now() - make_interval(hours => ${IDEMPOTENCY_TTL_HOURS})`);
  return r ?? null;
}

export async function storeIdempotent(ctx: OrgContext, key: string, r: StoredResponse) {
  await q(sql`INSERT INTO idempotency_keys (org_id, key, method, path, body_hash, status, response)
    VALUES (${ctx.orgId}, ${key}, ${r.method}, ${r.path}, ${r.body_hash}, ${r.status}, ${r.response})
    ON CONFLICT (org_id, key) DO UPDATE SET method = EXCLUDED.method, path = EXCLUDED.path, body_hash = EXCLUDED.body_hash,
      status = EXCLUDED.status, response = EXCLUDED.response, created_at = now()`);
}
