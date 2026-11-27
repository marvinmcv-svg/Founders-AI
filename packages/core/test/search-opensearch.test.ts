/**
 * OpenSearch backend (plan 8, D-075): DSL compiler, mappings, and parity with the SQL compiler on
 * the seeded rows (through an in-memory OpenSearch), searchEntities on the index with Postgres
 * hydration and fallback, and the outbox indexer (denormalised children, deletes).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
config({ path: "../../.env" });
import { getSql } from "@founders/db";
import type { Condition, Group, Product } from "../src/filters/ast";
import * as repo from "../src/repo";
import {
  compileDsl, documentFields, indexDefinition, indexName, OpenSearchClient, processSearchOutbox, reindexProduct, searchIds, setSearchClient,
} from "../src/search";
import { FakeOpenSearch } from "./helpers/fake-opensearch";

const G = (children: (Group | Condition)[], op: "AND" | "OR" = "AND"): Group => ({ kind: "group", op, children });
const C = (field: string, operator: Condition["operator"], value?: Condition["value"]): Condition => ({ kind: "condition", field, operator, value });

describe("DSL compiler", () => {
  it("maps operators like the SQL compiler", () => {
    expect(compileDsl("companies", G([]))).toEqual({ match_all: {} });
    expect(compileDsl("companies", C("name", "contains", "pay*"))).toEqual({ wildcard: { name: { value: "*pay\\**", case_insensitive: true } } });
    expect(compileDsl("companies", C("headcount_growth_3m", "gte", 25))).toEqual({ range: { headcount_growth_3m: { gte: 0.25 } } });
    expect(compileDsl("companies", C("highlights", "all_of", ["a", "b"]))).toEqual({ bool: { filter: [{ term: { highlights: "a" } }, { term: { highlights: "b" } }] } });
    expect(compileDsl("companies", C("hq_country", "none_of", ["Bolivia"]))).toEqual({ bool: { must_not: [{ terms: { hq_country: ["Bolivia"] } }] } });
    expect(compileDsl("companies", C("last_funding_date", "within_last_days", 30))).toEqual({ range: { last_funding_date: { gte: "now/d-30d" } } });
    expect(compileDsl("companies", G([C("bootstrapped", "is_true"), C("rank", "lte", 10)], "OR"))).toEqual({
      bool: { should: [{ term: { bootstrapped: true } }, { range: { rank: { lte: 10 } } }], minimum_should_match: 1 },
    });
    expect(compileDsl("companies", C("no_such_field", "is", "x"))).toEqual({ match_none: {} });
  });

  it("fails closed on org-scoped conditions without a Postgres ID set", () => {
    expect(compileDsl("companies", C("list", "in_list", "lst_x"))).toEqual({ match_none: {} });
    expect(compileDsl("companies", C("list", "in_list", "lst_x"), new Map([[JSON.stringify(["list", "in_list", "lst_x"]), ["com_1"]]]))).toEqual({ terms: { id: ["com_1"] } });
  });

  it("derives strict mappings from the field registry, without org-scoped fields", () => {
    const d = indexDefinition("companies") as { mappings: { dynamic: string; properties: Record<string, { type: string }> } };
    expect(d.mappings.dynamic).toBe("strict");
    expect(d.mappings.properties.total_funding_usd?.type).toBe("double");
    expect(d.mappings.properties.last_funding_date?.type).toBe("date");
    expect(d.mappings.properties.highlights?.type).toBe("keyword");
    expect(documentFields("companies").some((f) => f.scope)).toBe(false);
    expect(Object.keys(d.mappings.properties)).not.toContain("crm_status");
  });
});

/* ---------------- against the seeded database ---------------- */

const fake = new FakeOpenSearch();
const client = new OpenSearchClient("http://user:pw@opensearch.test:9200", fake.fetch);
const ORG = "org_demo000000000000000000001";
let dbUp = false;
let listId = "";
const env = { backend: process.env.SEARCH_BACKEND, url: process.env.OPENSEARCH_URL };

beforeAll(async () => {
  try {
    await getSql()`SELECT search_indexed_at FROM outbox_events LIMIT 1`;
    dbUp = true;
  } catch {
    return;
  }
  for (const p of ["companies", "funding_rounds", "people"] as Product[]) await reindexProduct(client, p);
  const [l] = (await getSql()`SELECT l.id FROM lists l WHERE l.org_id = ${ORG} AND l.entity_type = 'COMPANY' AND l.deleted_at IS NULL AND EXISTS (SELECT 1 FROM list_items li WHERE li.list_id = l.id) LIMIT 1`) as unknown as { id: string }[];
  listId = l?.id ?? "";
}, 180_000);

afterAll(async () => {
  process.env.SEARCH_BACKEND = env.backend;
  process.env.OPENSEARCH_URL = env.url;
  setSearchClient(undefined);
  await getSql().end({ timeout: 1 });
});

async function sqlIds(product: Product, filter: Group, q?: string) {
  process.env.SEARCH_BACKEND = "";
  const r = await repo.searchEntities(product, { filter, q, orgId: ORG, idsOnly: true, limit: 5000 });
  return r.rows.map((x) => String(x.id));
}
async function osIds(product: Product, filter: Group, q?: string) {
  const r = await searchIds(client, product, { filter, q, orgId: ORG, limit: 5000, offset: 0, totalCap: 10_000 });
  return r!.ids;
}

const PARITY: [Product, Group, string?][] = [
  ["companies", G([C("hq_country", "any_of", ["Bolivia", "Brazil"])])],
  ["companies", G([C("growth_stage", "none_of", ["Late", "Growth"]), C("total_funding_usd", "between", [1_000_000, 20_000_000])])],
  ["companies", G([C("headcount_growth_3m", "gte", 10), C("employee_count", "lte", 200)])],
  ["companies", G([C("highlights", "any_of", ["top_investors", "high_growth"]), C("bootstrapped", "is_false")], "OR")],
  ["companies", G([C("name", "contains", "ia"), C("hq_city", "is_not", "São Paulo")])],
  ["companies", G([C("name", "starts_with", "a")])],
  ["companies", G([C("last_funding_date", "after", "2025-06-30"), C("last_funding_date", "before", "2026-06-30")])],
  ["companies", G([C("est_revenue_usd", "exists"), C("tech_vertical", "not_exists")], "OR")],
  ["companies", G([C("founded_year", "eq", 2019)])],
  ["companies", G([C("founded_year", "neq", 2019), C("rank", "lte", 300)])],
  ["companies", G([]), "pay"],
  ["funding_rounds", G([C("type", "any_of", ["Seed", "Series A"]), C("amount_usd", "gte", 2_000_000), C("company_country", "is", "bolivia")])],
  ["funding_rounds", G([C("announced_date", "within_last_days", 365)])],
  ["people", G([C("seniority", "any_of", ["Founder", "C-Level"]), C("country", "is", "Mexico"), C("followers", "gte", 1000)])],
  ["people", G([C("full_name", "contains", "ana")])],
];

describe("parity with the SQL compiler on seeded rows", () => {
  it.each(PARITY.map((x, i) => [i, ...x] as const))("filter %i (%s) returns the same rows", async (_i, product, filter, q) => {
    if (!dbUp) return;
    const [a, b] = [await sqlIds(product, filter, q), await osIds(product, filter, q)];
    expect(a.length).toBeGreaterThan(0);
    expect(new Set(b)).toEqual(new Set(a));
  });

  it("orders like Postgres on the default sort", async () => {
    if (!dbUp) return;
    const f = G([C("hq_region", "is", "Latin America")]);
    expect((await osIds("companies", f)).slice(0, 50)).toEqual((await sqlIds("companies", f)).slice(0, 50));
  });

  it("answers list membership from Postgres ID sets with the caller's org only", async () => {
    if (!dbUp || !listId) return;
    const f = G([C("list", "in_list", listId)]);
    const a = await sqlIds("companies", f);
    expect(a.length).toBeGreaterThan(0);
    expect(new Set(await osIds("companies", f))).toEqual(new Set(a));
    const other = await searchIds(client, "companies", { filter: f, orgId: "org_someoneelse", limit: 50, offset: 0, totalCap: 10_000 });
    expect(other!.ids).toEqual([]);
  });
});

describe("searchEntities on the index", () => {
  it("returns the same page as Postgres (rows hydrated from Postgres in index order)", async () => {
    if (!dbUp) return;
    const filter = G([C("hq_country", "any_of", ["Bolivia"])]);
    const params = { filter, orgId: ORG, limit: 25, offset: 25, sort: { field: "total_funding_usd", dir: "desc" as const } };
    process.env.SEARCH_BACKEND = "";
    const viaPg = await repo.searchEntities("companies", params);
    process.env.SEARCH_BACKEND = "opensearch";
    process.env.OPENSEARCH_URL = "http://opensearch.test:9200";
    setSearchClient(client);
    const before = fake.requests.filter((r) => r.path.endsWith("/_search")).length;
    const viaOs = await repo.searchEntities("companies", params);
    expect(fake.requests.filter((r) => r.path.endsWith("/_search")).length).toBe(before + 1);
    expect(viaOs.total).toBe(viaPg.total);
    expect(viaOs.rows.map((r) => r.id)).toEqual(viaPg.rows.map((r) => r.id));
    expect(viaOs.rows[0]).toEqual(viaPg.rows[0]);
  });

  it("falls back to Postgres when the index fails", async () => {
    if (!dbUp) return;
    process.env.SEARCH_BACKEND = "opensearch";
    setSearchClient(new OpenSearchClient("http://down.test:9200", async () => new Response("boom", { status: 503 })));
    const r = await repo.searchEntities("companies", { filter: G([C("hq_country", "any_of", ["Bolivia"])]), limit: 5 });
    expect(r.rows).toHaveLength(5);
    setSearchClient(client);
  });
});

describe("outbox indexer", () => {
  it("re-indexes a changed company and the rounds that embed its name; deletes removed rows", async () => {
    if (!dbUp) return;
    const s = getSql();
    await s`UPDATE outbox_events SET search_indexed_at = now() WHERE search_indexed_at IS NULL`;
    const [co] = (await s`SELECT c.id, c.name FROM companies c WHERE EXISTS (SELECT 1 FROM funding_rounds r WHERE r.company_id = c.id) AND c.deleted_at IS NULL LIMIT 1`) as unknown as { id: string; name: string }[];
    const [round] = (await s`SELECT id FROM funding_rounds WHERE company_id = ${co!.id} LIMIT 1`) as unknown as { id: string }[];
    try {
      await s`UPDATE companies SET name = ${`${co!.name} Indexed`} WHERE id = ${co!.id}`;
      await s`INSERT INTO outbox_events (product, entity_id, kind) VALUES ('companies', ${co!.id}, 'UPDATED')`;
      const r = await processSearchOutbox(client);
      expect(r.events).toBe(1);
      expect(fake.indices.get(indexName("companies"))!.get(co!.id)!.name).toBe(`${co!.name} Indexed`);
      expect(fake.indices.get(indexName("funding_rounds"))!.get(round!.id)!.company_name).toBe(`${co!.name} Indexed`);
      expect((await processSearchOutbox(client)).events).toBe(0);

      await s`UPDATE companies SET deleted_at = now() WHERE id = ${co!.id}`;
      await s`INSERT INTO outbox_events (product, entity_id, kind) VALUES ('companies', ${co!.id}, 'DELETED')`;
      const d = await processSearchOutbox(client);
      expect(d.deleted).toBeGreaterThanOrEqual(1);
      expect(fake.indices.get(indexName("companies"))!.has(co!.id)).toBe(false);
    } finally {
      await s`UPDATE companies SET name = ${co!.name}, deleted_at = NULL WHERE id = ${co!.id}`;
      await s`DELETE FROM outbox_events WHERE entity_id = ${co!.id} AND kind IN ('UPDATED', 'DELETED') AND at > now() - interval '5 minutes'`;
    }
  });

  it("sends basic auth from the URL, not in the URL", async () => {
    if (!dbUp) return;
    let seen: { url: string; auth?: string } | null = null;
    const c = new OpenSearchClient("https://admin:s3cret@os.test:9200/", async (url, init) => {
      seen = { url, auth: (init.headers as Record<string, string>).Authorization };
      return new Response("{}", { status: 200 });
    });
    await c.request("GET", "/_cluster/health");
    expect(seen).toEqual({ url: "https://os.test:9200/_cluster/health", auth: `Basic ${Buffer.from("admin:s3cret").toString("base64")}` });
  });
});
