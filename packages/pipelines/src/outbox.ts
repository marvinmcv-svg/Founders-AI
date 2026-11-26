/**
 * Transactional outbox writer (plan 8). Pipelines call `emit` after writing entities that can
 * change saved-search results. Consumers: real-time alerts (jobs/alerts.ts) and, once H2 lands,
 * the OpenSearch indexer — both read `outbox_events` in id order.
 */
import type { Product } from "@founders/core/filters";
import { pg } from "./db";

export async function emit(product: Product, entityIds: string[], kind: "CREATED" | "UPDATED" = "CREATED"): Promise<number> {
  const ids = [...new Set(entityIds)];
  if (!ids.length) return 0;
  const sql = pg();
  for (let i = 0; i < ids.length; i += 5000) {
    const chunk = ids.slice(i, i + 5000);
    await sql`INSERT INTO outbox_events (product, entity_id, kind) SELECT ${product}, unnest(${chunk}::text[]), ${kind}`;
  }
  return ids.length;
}
