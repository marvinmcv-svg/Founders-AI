/**
 * Zapier app against the real API in-process (DB-backed; skipped without a seeded DB): auth test,
 * REST-hook subscribe/unsubscribe (tagged `zapier`), trigger perform on a signed webhook payload,
 * dynamic dropdowns, and the three actions.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getSql } from "@founders/db";
import * as repo from "@founders/core/repo";
import { app as api } from "@founders/api";
import zapier, { addApiKey, type Bundle, type Z, type ZRequest } from "../src/index";

const OWNER: repo.OrgContext = { orgId: "org_demo000000000000000000001", userId: "usr_demo000000000000000000001", role: "owner" };
let dbUp = false;
let key = "";
let keyId = "";
const created: string[] = [];

class ZError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** Minimal stand-in for Zapier's `z`: runs beforeRequest middleware and calls the Hono app. */
const zFor = (b: () => Bundle): Z => ({
  errors: { Error: ZError },
  async request(req: ZRequest) {
    const r = addApiKey(req, b());
    const u = new URL(r.url);
    for (const [k, v] of Object.entries(r.params ?? {})) u.searchParams.set(k, v);
    const res = await api.request(u.pathname + u.search, {
      method: r.method ?? "GET",
      headers: { ...(r.headers ?? {}), ...(r.body ? { "Content-Type": "application/json" } : {}) },
      ...(r.body ? { body: JSON.stringify(r.body) } : {}),
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    return { status: res.status, json, throwForStatus: () => { if (res.status >= 400) throw new ZError(String(json.detail ?? res.status), "HttpError", res.status); } };
  },
});
const z = zFor(() => bundle());
const bundle = (over: Partial<Bundle> = {}): Bundle => ({ authData: { api_key: key, base_url: "http://local/api/v1" }, inputData: {}, ...over });

beforeAll(async () => {
  try {
    const [r] = await getSql()`SELECT count(*)::int AS n FROM companies`;
    dbUp = Number(r?.n) > 0;
  } catch {
    dbUp = false;
  }
  if (!dbUp) return;
  const k = await repo.createApiKey(OWNER, "zapier-test", ["read:data", "write:lists", "write:searches", "write:webhooks"]);
  key = k.secret;
  keyId = k.id;
  await repo.grantCredits(OWNER.orgId, 100, "test_topup");
});
afterAll(async () => {
  if (dbUp) {
    await repo.rawQuery(sql`DELETE FROM api_keys WHERE id = ${keyId}`);
    for (const id of created) await repo.rawQuery(sql`DELETE FROM webhooks WHERE id = ${id}`);
  }
  await getSql().end({ timeout: 1 });
});

describe("zapier app definition", () => {
  it("declares the plan 13.4 triggers and actions", () => {
    expect(Object.keys(zapier.triggers).filter((k) => !k.endsWith("_list"))).toEqual(["new_search_result", "new_talent_signal"]);
    expect(Object.keys(zapier.creates)).toEqual(["enrich_company", "enrich_person", "add_to_list"]);
    expect(zapier.triggers.new_search_result.operation.type).toBe("hook");
  });

  it("auth test, REST hooks, trigger perform and sample", async () => {
    if (!dbUp) return;
    expect((await zapier.authentication.test(z, bundle())).organization).toBeTruthy();
    const bad: Bundle = { ...bundle(), authData: { api_key: "fai_bad", base_url: "http://local/api/v1" } };
    await expect(zapier.authentication.test(zFor(() => bad), bad)).rejects.toThrow(/rejected/);

    const searches = await zapier.triggers.saved_search_list.operation.perform(z, bundle());
    expect(searches.length).toBeGreaterThan(0);
    const companySearch = (await repo.getSavedSearches(OWNER)).find((s) => s.product === "companies");
    const searchId = String(companySearch?.id);

    const sub = await zapier.triggers.new_search_result.operation.performSubscribe(z, bundle({ targetUrl: "https://hooks.zapier.com/hooks/standard/1/abc/", inputData: { search_id: searchId } }));
    created.push(String(sub.id));
    const [row] = await getSql()`SELECT source, events FROM webhooks WHERE id = ${String(sub.id)}`;
    expect(row).toMatchObject({ source: "zapier", events: ["search.new_results"] });

    const payload = { id: "evt_1", type: "search.new_results", data: { search_id: searchId, name: "x", product: "companies", new_ids: ["com_a", "com_b"] } };
    const runs = await zapier.triggers.new_search_result.operation.perform(z, bundle({ cleanedRequest: payload, inputData: { search_id: searchId } }));
    expect(runs.map((r) => r.id)).toEqual(["com_a", "com_b"]);
    expect(await zapier.triggers.new_search_result.operation.perform(z, bundle({ cleanedRequest: payload, inputData: { search_id: "srh_other" } }))).toEqual([]);
    const sample = await zapier.triggers.new_search_result.operation.performList(z, bundle({ inputData: { search_id: searchId } }));
    expect(sample.length).toBeGreaterThan(0);

    await zapier.triggers.new_search_result.operation.performUnsubscribe(z, bundle({ subscribeData: { id: String(sub.id) } }));
    expect(await getSql()`SELECT 1 FROM webhooks WHERE id = ${String(sub.id)}`).toHaveLength(0);

    const talent = await zapier.triggers.new_talent_signal.operation.performList(z, bundle());
    expect(talent.length).toBeGreaterThan(0);
  });

  it("actions: enrich company / person and add to list", async () => {
    if (!dbUp) return;
    const [c] = await getSql()`SELECT id, domain FROM companies ORDER BY rank LIMIT 1`;
    const co = await zapier.creates.enrich_company.operation.perform(z, bundle({ inputData: { domain: String(c?.domain) } }));
    expect(co).toMatchObject({ matched: true, id: c?.id });
    const miss = await zapier.creates.enrich_company.operation.perform(z, bundle({ inputData: { domain: "no-such-company-zz.example" } }));
    expect(miss.matched).toBe(false);
    await expect(zapier.creates.enrich_company.operation.perform(z, bundle())).rejects.toThrow(/domain or a name/);

    const [p] = await getSql()`SELECT id, linkedin_url FROM people WHERE linkedin_url IS NOT NULL LIMIT 1`;
    const pe = await zapier.creates.enrich_person.operation.perform(z, bundle({ inputData: { linkedin_url: String(p?.linkedin_url) } }));
    expect(pe).toMatchObject({ matched: true, id: p?.id });

    const lists = await zapier.triggers.list_list.operation.perform(z, bundle());
    const companyList = (await repo.getLists(OWNER, "COMPANY")).find((l) => !l.system);
    expect(lists.some((l) => l.id === companyList?.id)).toBe(true);
    const add = await zapier.creates.add_to_list.operation.perform(z, bundle({ inputData: { list_id: String(companyList?.id), entity_id: String(c?.id) } }));
    expect(add.list_id).toBe(companyList?.id);
  });
});
