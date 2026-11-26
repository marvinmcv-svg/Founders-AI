/**
 * Plan 15 Phase 8 acceptance: "bulk incremental replay test". Full snapshot → change the data
 * (update, soft-delete, insert) → incremental → replaying full + incremental by stable ID reproduces
 * the current dataset exactly. Also: manifest checksums, redistribution filter, admin-only, tenancy.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { config } from "dotenv";
config({ path: "../../.env" });
import { getSql } from "@founders/db";
import { readParquet } from "@founders/integrations/bulk";
import * as repo from "../src/repo";

const B: repo.OrgContext = { orgId: "org_demo000000000000000000002", userId: "usr_demo000000000000000000002", role: "owner" };
const A: repo.OrgContext = { orgId: "org_demo000000000000000000001", userId: "usr_demo000000000000000000001", role: "owner" };
const NEW_ID = "com_bulktest00000000000000001";
let dbUp = false;
const sink = new repo.MemorySink();
let deliveryId = "";
let victims: { id: string; name: string; employee_count: number | null; provenance: unknown }[] = [];

beforeAll(async () => {
  try {
    await getSql()`SELECT 1 FROM bulk_state LIMIT 1`;
    dbUp = true;
  } catch {
    return;
  }
  repo.setBulkSinkForTests(() => sink);
  victims = (await getSql()`SELECT id, name, employee_count, provenance FROM companies WHERE deleted_at IS NULL ORDER BY id LIMIT 3`) as unknown as typeof victims;
});

afterAll(async () => {
  if (dbUp) {
    repo.setBulkSinkForTests(null);
    const [v0, v1, v2] = victims;
    if (v0) await getSql()`UPDATE companies SET name = ${v0.name}, employee_count = ${v0.employee_count} WHERE id = ${v0.id}`;
    if (v1) await getSql()`UPDATE companies SET deleted_at = NULL WHERE id = ${v1.id}`;
    if (v2) await getSql()`UPDATE companies SET provenance = ${JSON.stringify(v2.provenance)}::jsonb WHERE id = ${v2.id}`;
    await getSql()`DELETE FROM companies WHERE id = ${NEW_ID}`;
    if (deliveryId) await repo.deleteBulkDelivery(B, deliveryId).catch(() => undefined);
  }
  await getSql().end({ timeout: 1 });
});

const decode = (key: string) => readParquet(sink.files.get(key) as Uint8Array);

describe("bulk delivery", () => {
  it("is admin-only, validates sinks and is org-scoped", async () => {
    if (!dbUp) return;
    const base = { name: "x", datasets: ["companies" as const], format: "PARQUET" as const, cadence: "DAILY" as const };
    await expect(repo.createBulkDelivery({ ...B, role: "member" }, { ...base, sink: { kind: "S3", bucket: "acme-data", region: "us-east-1", accessKeyId: "a", secretAccessKey: "b" } })).rejects.toBeInstanceOf(repo.ForbiddenError);
    await expect(repo.createBulkDelivery(B, { ...base, sink: { kind: "S3", bucket: "Bad_Bucket!", region: "us-east-1", accessKeyId: "a", secretAccessKey: "b" } })).rejects.toThrow(/bucket/);
    const { id } = await repo.createBulkDelivery(B, { ...base, name: "Replay test", datasets: ["companies", "transactions"], sink: { kind: "S3", bucket: "acme-data", region: "us-east-1", accessKeyId: "AKIA", secretAccessKey: "secret" } });
    deliveryId = id;
    const [stored] = await getSql()`SELECT sink_config FROM bulk_deliveries WHERE id = ${id}`;
    expect(String(stored?.sink_config)).not.toContain("secret"); // encrypted at rest
    expect((await repo.listBulkDeliveries(A)).some((d) => d.id === id)).toBe(false);
    await expect(repo.runBulkDelivery(A, id)).rejects.toBeInstanceOf(repo.NotFoundError);
  });

  it("full snapshot → changes → incremental; replay reproduces the current data", async () => {
    if (!dbUp) return;
    const full = await repo.runBulkDelivery(B, deliveryId, { now: new Date("2026-11-25T03:00:00Z") });
    expect(full.status).toBe("SUCCEEDED");
    expect(full.manifest?.kind).toBe("FULL");
    const fullFile = full.manifest!.files.find((f) => f.dataset === "companies")!;
    expect(fullFile.key).toBe("companies/companies_full_2026-11-25.parquet");
    expect(createHash("sha256").update(sink.files.get(fullFile.key)!).digest("hex")).toBe(fullFile.sha256);
    expect(sink.files.has("manifests/manifest_2026-11-25.json")).toBe(true);

    // Change the world: update one row, soft-delete one, add one, and mark a field non-redistributable on a third.
    const [v0, v1, v2] = victims as [(typeof victims)[0], (typeof victims)[0], (typeof victims)[0]];
    await getSql()`UPDATE companies SET name = ${`${v0.name} (renamed)`}, employee_count = 4242 WHERE id = ${v0.id}`;
    await getSql()`UPDATE companies SET deleted_at = now() WHERE id = ${v1.id}`;
    await getSql()`UPDATE companies SET provenance = jsonb_build_object('tagline', jsonb_build_object('source', 'licensed', 'fetched_at', '2026-01-01', 'redistributable', false)) WHERE id = ${v2.id}`;
    await getSql()`INSERT INTO companies (id, name, domain, growth_stage) VALUES (${NEW_ID}, 'Bulk Test Co', 'bulk-test.example', 'Seed')`;

    const inc = await repo.runBulkDelivery(B, deliveryId, { now: new Date("2026-11-26T03:00:00Z") });
    expect(inc.status).toBe("SUCCEEDED");
    const incFile = inc.manifest!.files.find((f) => f.dataset === "companies")!;
    expect(incFile).toMatchObject({ kind: "INCREMENTAL", key: "companies/companies_2026-11-26.parquet", upserts: 3, deletes: 1 });
    expect(inc.manifest!.previous_run_id).toBe(full.runId);
    const txInc = inc.manifest!.files.find((f) => f.dataset === "transactions")!;
    expect(txInc.rows).toBe(0); // nothing changed there

    // Replay: apply full then incremental by id.
    const state = new Map<string, Record<string, unknown>>();
    for (const key of [fullFile.key, incFile.key]) {
      for (const r of decode(key).rows) {
        if (r.op === "delete") state.delete(String(r.id));
        else state.set(String(r.id), r);
      }
    }
    const current = await getSql()`SELECT id, name, employee_count, tagline FROM companies WHERE deleted_at IS NULL`;
    expect(state.size).toBe(current.length);
    for (const c of current) {
      const got = state.get(String(c.id));
      expect(got?.name).toBe(c.name);
      expect(got?.employee_count ?? null).toBe(c.employee_count ?? null);
    }
    expect(state.has(v1.id)).toBe(false);
    expect(state.get(NEW_ID)?.name).toBe("Bulk Test Co");
    expect(state.get(v2.id)?.tagline ?? null).toBeNull(); // non-redistributable field withheld
    expect(decode(incFile.key).columns[0]).toEqual({ name: "op", type: "string" });
  });

  it("a second run the same day gets its own files; the scheduler skips fresh deliveries", async () => {
    if (!dbUp) return;
    const again = await repo.runBulkDelivery(B, deliveryId, { now: new Date() });
    expect(again.manifest?.files[0]?.rows).toBe(0);
    expect(again.manifest?.files[0]?.key).toMatch(/_\d{4}-\d{2}-\d{2}(_\d+)?\.parquet$/);
    const sched = await repo.runDueBulkDeliveries();
    expect(sched.ran).toBe(0);
  });
});
