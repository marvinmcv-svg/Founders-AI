/**
 * OpenSearch sync (plan 8, D-075).
 *   search-index    apply pending outbox events (worker: every minute → lag < 5 min; cron: daily catch-up)
 *   search-reindex  rebuild indices from Postgres, then mark the outbox applied (first deploy, mapping change)
 * Both are no-ops without OPENSEARCH_URL. Options: --product=<name> (reindex one), --limit=N (events).
 */
import { PRODUCTS, type Product } from "@founders/core/filters";
import { getSearchClient, markOutboxIndexed, processSearchOutbox, reindexProduct, searchIndexLagSeconds } from "@founders/core/search";
import type { JobDef } from "../runner";

export const searchIndexJob: JobDef = {
  name: "search-index",
  description: "Apply pending outbox events to the OpenSearch indices",
  async run(ctx) {
    const client = getSearchClient();
    if (!client) {
      ctx.log("OPENSEARCH_URL is not set; search runs on Postgres. Skipping.");
      ctx.count("skipped_no_opensearch");
      return;
    }
    const limit = typeof ctx.options.limit === "number" ? ctx.options.limit : 5000;
    for (;;) {
      const r = await processSearchOutbox(client, limit);
      ctx.count("events", r.events);
      ctx.count("indexed", r.indexed);
      ctx.count("deleted", r.deleted);
      if (r.events < limit) break;
    }
    const lag = await searchIndexLagSeconds();
    ctx.count("lag_seconds", lag);
    ctx.log(`caught up; lag ${lag}s`);
  },
};

export const searchReindexJob: JobDef = {
  name: "search-reindex",
  description: "Rebuild the OpenSearch indices from Postgres",
  async run(ctx) {
    const client = getSearchClient();
    if (!client) {
      ctx.log("OPENSEARCH_URL is not set. Skipping.");
      ctx.count("skipped_no_opensearch");
      return;
    }
    const only = typeof ctx.options.product === "string" ? ctx.options.product : null;
    if (only && !(PRODUCTS as readonly string[]).includes(only)) throw new Error(`Unknown product ${only}; one of ${PRODUCTS.join(", ")}`);
    const products = (only ? [only] : PRODUCTS) as Product[];
    for (const p of products) {
      const t0 = Date.now();
      const n = await reindexProduct(client, p, { onProgress: (k) => k % 20_000 === 0 && ctx.log(`${p}: ${k}`) });
      ctx.count(`${p}_docs`, n);
      ctx.log(`${p}: ${n} documents in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }
    if (!only) ctx.count("outbox_marked", await markOutboxIndexed());
  },
};
