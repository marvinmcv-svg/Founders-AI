/**
 * API contract tests (plan 15, Phase 5 acceptance): every Section 11 route is registered and in the
 * OpenAPI document; auth, rate limit, credits headers, misses not charged, idempotency, webhooks,
 * extraction and R3 placeholders behave as specified. DB-backed cases skip when no seeded DB.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getSql } from "@founders/db";
import * as repo from "@founders/core/repo";
import { API_RATE_LIMIT_RPS } from "@founders/core/limits";
import { app, ENDPOINTS } from "../src/app";
import { openApiDocument } from "../src/kit";
import { SPEC_ROUTES } from "./spec";

/** Beyond the table: lists of investors get the same results/update routes as companies and people. */
const EXTENSIONS = ["GET /lists/investors/{listId}/results", "PATCH /lists/investors/{listId}"];
const norm = (r: string) => r.replace(/\{\w+\}/g, "{}");
const registered = ENDPOINTS.map((e) => `${e.method.toUpperCase()} ${e.path.replace(/:(\w+)/g, "{$1}")}`);

describe("route table", () => {
  it("registers all 74 routes of plan Section 11 (plus the documented investor-list extensions)", () => {
    expect(SPEC_ROUTES.length).toBe(74);
    expect(new Set(registered).size).toBe(registered.length);
    const spec = new Set(SPEC_ROUTES.map(norm));
    expect(SPEC_ROUTES.filter((r) => !registered.map(norm).includes(norm(r)))).toEqual([]);
    expect(registered.filter((r) => !spec.has(norm(r))).sort()).toEqual(EXTENSIONS);
  });

  it("documents every route in OpenAPI with credits, and R3 routes with a 501", () => {
    const doc = openApiDocument("https://example.invalid/api/v1") as { paths: Record<string, Record<string, { "x-credits"?: string; "x-release"?: string; responses: Record<string, unknown> }>> };
    const documented = Object.entries(doc.paths).flatMap(([p, ops]) => Object.keys(ops).map((m) => `${m.toUpperCase()} ${p}`));
    expect(documented.sort()).toEqual([...registered].sort());
    for (const [, ops] of Object.entries(doc.paths)) {
      for (const op of Object.values(ops)) {
        expect(op["x-credits"]).toBeTruthy();
        if (op["x-release"]) expect(op.responses["501"]).toBeTruthy();
      }
    }
    expect(ENDPOINTS.filter((e) => e.release === "R3").length).toBe(9);
  });
});

/* ---------------- behaviour (needs the seeded DB) ---------------- */

const OWNER: repo.OrgContext = { orgId: "org_demo000000000000000000001", userId: "usr_demo000000000000000000001", role: "owner" };
let dbUp = false;
let key = "";
let rlKey = "";
let readOnlyKey = "";
const keyIds: string[] = [];

async function call(path: string, init: RequestInit & { key?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.key !== "") headers.set("X-API-Key", init.key ?? key);
  if (init.body) headers.set("Content-Type", "application/json");
  const res = await app.request(`/api/v1${path}`, { ...init, headers });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    body = { text };
  }
  return { status: res.status, headers: res.headers, body };
}

beforeAll(async () => {
  try {
    const [r] = await getSql()`SELECT count(*)::int AS n FROM companies`;
    dbUp = Number(r?.n) > 0;
  } catch {
    dbUp = false;
  }
  if (!dbUp) return;
  await repo.grantCredits(OWNER.orgId, 1000, "test_topup");
  for (const [name, scopes] of [["contract-admin", undefined], ["contract-ratelimit", undefined], ["contract-readonly", ["read:data"]]] as const) {
    const k = await repo.createApiKey(OWNER, name, scopes ? [...scopes] : undefined);
    keyIds.push(k.id);
    if (name === "contract-admin") key = k.secret;
    else if (name === "contract-ratelimit") rlKey = k.secret;
    else readOnlyKey = k.secret;
  }
});

afterAll(async () => {
  if (dbUp) {
    await repo.rawQuery(sql`DELETE FROM api_keys WHERE id = ANY(${sql`ARRAY[${sql.join(keyIds.map((x) => sql`${x}`), sql`, `)}]::text[]`})`);
    await repo.rawQuery(sql`DELETE FROM webhooks WHERE org_id = ${OWNER.orgId} AND url LIKE 'https://hooks.example.com/%'`);
  }
  await getSql().end({ timeout: 1 });
});

describe("auth, credits and errors", () => {
  it("401 without a key, problem+json", async () => {
    if (!dbUp) return;
    const r = await call("/me", { key: "" });
    expect(r.status).toBe(401);
    expect(r.headers.get("content-type")).toContain("application/problem+json");
  });

  it("misses are 404 and not charged; hits carry X-Credits-* headers", async () => {
    if (!dbUp) return;
    const miss = await call("/companies/com_000000000000000000000000");
    expect(miss.status).toBe(404);
    expect(miss.headers.get("x-credits-charged")).toBeNull();
    const [c] = await repo.rawQuery<{ id: string }>(sql`SELECT id FROM companies WHERE deleted_at IS NULL ORDER BY rank LIMIT 1`);
    const hit = await call(`/companies/${c!.id}`);
    expect(hit.status).toBe(200);
    expect(hit.headers.get("x-credits-charged")).toBe("1");
    expect(Number(hit.headers.get("x-credits-remaining"))).toBeGreaterThanOrEqual(0);
  });

  it(`rate limits at ${API_RATE_LIMIT_RPS} rps with 429 + Retry-After`, async () => {
    if (!dbUp) return;
    const results = await Promise.all(Array.from({ length: API_RATE_LIMIT_RPS + 5 }, () => call("/taxonomy", { key: rlKey })));
    const limited = results.filter((r) => r.status === 429);
    expect(limited.length).toBeGreaterThan(0);
    expect(limited[0]!.headers.get("retry-after")).toBeTruthy();
  });
});

describe("5b endpoints", () => {
  it("news and revenue feeds page with cursors", async () => {
    if (!dbUp) return;
    const n = await call("/news-signals?limit=5&major_only=true");
    expect(n.status, JSON.stringify(n.body)).toBe(200);
    expect((n.body.items as unknown[]).length).toBeLessThanOrEqual(5);
    const r = await call("/revenue-signals?limit=3");
    expect(r.status).toBe(200);
    if ((r.body.total as number) > 3) expect(r.body.next_cursor).toBeTruthy();
  });

  it("AI search persists query_id so pages work on any instance", async () => {
    if (!dbUp) return;
    const s = await call("/search", { method: "POST", body: JSON.stringify({ query: "fintech companies in Brazil", limit: 2 }) });
    expect(s.status).toBe(200);
    const id = s.body.query_id as string;
    expect(id).toMatch(/^qry_/);
    const [row] = await repo.rawQuery(sql`SELECT id FROM api_queries WHERE id = ${id}`);
    expect(row).toBeTruthy();
    const page = await call(`/search/${id}/results?limit=2`);
    expect(page.status).toBe(200);
    expect(page.body.product).toBe(s.body.product);
  });

  it("extracts and resolves entities, charging 1 credit per entity", async () => {
    if (!dbUp) return;
    const [c] = await repo.rawQuery<{ id: string; name: string; domain: string }>(sql`SELECT id, name, domain FROM companies WHERE deleted_at IS NULL ORDER BY rank LIMIT 1 OFFSET 5`);
    const r = await call("/entities/extract", { method: "POST", body: JSON.stringify({ text: `Yesterday ${c!.name} announced a partnership. See ${c!.domain}.`, types: ["company"] }) });
    expect(r.status).toBe(200);
    const ents = r.body.entities as { id: string; method: string }[];
    expect(ents.some((e) => e.id === c!.id && e.method === "domain")).toBe(true);
    expect(r.headers.get("x-credits-charged")).toBe(String(ents.length));
  });

  it("replays POST with the same Idempotency-Key without charging; 422 on a different body", async () => {
    if (!dbUp) return;
    const idem = `test-${Date.now()}`;
    const body = JSON.stringify({ query: "seed stage robotics", limit: 1 });
    const a = await call("/search", { method: "POST", body, headers: { "Idempotency-Key": idem } });
    const b = await call("/search", { method: "POST", body, headers: { "Idempotency-Key": idem } });
    expect(b.status).toBe(a.status);
    expect(b.body.query_id).toBe(a.body.query_id);
    expect(b.headers.get("idempotent-replayed")).toBe("true");
    expect(b.headers.get("x-credits-charged")).toBe("0");
    const c = await call("/search", { method: "POST", body: JSON.stringify({ query: "something else", limit: 1 }), headers: { "Idempotency-Key": idem } });
    expect(c.status).toBe(422);
  });

  it("webhooks: https only, no private targets, scope required, secret shown once", async () => {
    if (!dbUp) return;
    const http = await call("/webhooks", { method: "POST", body: JSON.stringify({ url: "http://hooks.example.com/x", events: ["signal.talent"] }) });
    expect(http.status).toBe(400);
    const priv = await call("/webhooks", { method: "POST", body: JSON.stringify({ url: "https://127.0.0.1/x", events: ["signal.talent"] }) });
    expect(priv.status).toBe(400);
    const noScope = await call("/webhooks", { key: readOnlyKey, method: "POST", body: JSON.stringify({ url: "https://hooks.example.com/a", events: ["signal.talent"] }) });
    expect(noScope.status).toBe(403);
    const ok = await call("/webhooks", { method: "POST", body: JSON.stringify({ url: "https://hooks.example.com/a", events: ["signal.talent", "search.new_results"] }) });
    expect(ok.status).toBe(201);
    expect(String(ok.body.secret)).toMatch(/^whsec_/);
    const list = await call("/webhooks");
    const listed = (list.body.items as { id: string; secret?: string }[]).find((w) => w.id === ok.body.id);
    expect(listed).toBeTruthy();
    expect(listed!.secret).toBeUndefined();
    const del = await call(`/webhooks/${String(ok.body.id)}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    expect((await call(`/webhooks/${String(ok.body.id)}`, { method: "DELETE" })).status).toBe(404);
  });

  it("R3 routes answer 501 and are not charged", async () => {
    if (!dbUp) return;
    for (const p of ["/investor-interest", "/network/members", "/companies/com_x/investor-interest-signals"]) {
      const r = await call(p);
      expect(r.status).toBe(501);
      expect(r.body.available_in).toBe("R3");
      expect(r.headers.get("x-credits-charged")).toBeNull();
    }
  });
});

