/**
 * CRM sync engine against the seeded DB (skipped without one): sandbox connect → match preview →
 * pull → push (create + update) → badges and CRM filters → scheduled enrich → disconnect.
 * Writes happen in the tenancy-test workspace; the demo workspace must never see them.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
config({ path: "../../.env" });
import { getSql } from "@founders/db";
import * as repo from "../src/repo";
import { searchEntities } from "../src/repo/entities";

const B: repo.OrgContext = { orgId: "org_demo000000000000000000002", userId: "usr_demo000000000000000000002", role: "owner" };
const A: repo.OrgContext = { orgId: "org_demo000000000000000000001", userId: "usr_demo000000000000000000001", role: "owner" };
let dbUp = false;

beforeAll(async () => {
  try {
    await getSql()`SELECT 1 FROM crm_connections LIMIT 1`;
    dbUp = true;
    await repo.disconnectCrm(B, "HUBSPOT").catch(() => undefined);
  } catch {
    dbUp = false;
  }
});
afterAll(async () => {
  if (dbUp) await repo.disconnectCrm(B, "HUBSPOT").catch(() => undefined);
  await getSql().end({ timeout: 1 });
});

describe("crm sync", () => {
  it("only admins connect; viewers cannot push", async () => {
    if (!dbUp) return;
    await expect(repo.connectCrm({ ...B, role: "member" }, "HUBSPOT", { mode: "SANDBOX" })).rejects.toBeInstanceOf(repo.ForbiddenError);
    await expect(repo.connectCrm(B, "SALESFORCE", { mode: "TOKEN", token: "x".repeat(20) })).rejects.toThrow(/OAuth/);
  });

  it("connects a sandbox, previews matches, pulls and stores matched records", async () => {
    if (!dbUp) return;
    const res = await repo.connectCrm(B, "HUBSPOT", { mode: "SANDBOX" });
    expect(res.seeded?.companies).toBeGreaterThan(50);

    const preview = await repo.previewCrmPull(B, "HUBSPOT");
    const pc = preview.COMPANY as NonNullable<typeof preview.COMPANY>;
    expect(pc.total).toBe(res.seeded?.companies);
    expect(pc.matched).toBeGreaterThan(50);
    expect(pc.unmatched).toBe(12); // the seeded prospects we do not track
    expect(pc.byMethod.DOMAIN).toBe(pc.matched);
    expect((preview.PERSON as NonNullable<typeof preview.PERSON>).matched).toBeGreaterThan(0);
    // Preview writes nothing.
    expect((await getSql()`SELECT count(*)::int AS n FROM crm_records WHERE org_id = ${B.orgId}`)[0]?.n).toBe(0);

    const pull = await repo.runCrmPull(B, "HUBSPOT");
    expect(pull.status).toBe("SUCCEEDED");
    expect(pull.counts.matched).toBe(pc.matched + (preview.PERSON?.matched ?? 0));
    expect(pull.counts.deals).toBeGreaterThan(0);
    const conns = await repo.listCrmConnections(B);
    const hs = conns.find((c) => c.provider === "HUBSPOT");
    expect(hs?.connected).toBe(true);
    expect(hs?.matched).toBe(pull.counts.matched);
    expect(conns.filter((c) => c.connected)).toHaveLength(1);
    // The pinned "My CRM" system list mirrors the CRM's matched companies.
    const [my] = await getSql()`SELECT count(*)::int AS n FROM list_items li JOIN lists l ON l.id = li.list_id WHERE l.org_id = ${B.orgId} AND l.system = 'MY_CRM'`;
    expect(my?.n).toBe(pc.matched);
  });

  it("pushes: updates existing CRM records and creates new ones; badges and filters follow", async () => {
    if (!dbUp) return;
    const inCrm = await getSql()`SELECT entity_id FROM crm_records WHERE org_id = ${B.orgId} AND object = 'COMPANY' AND entity_id IS NOT NULL LIMIT 2`;
    const notInCrm = await getSql()`SELECT id FROM companies WHERE id NOT IN (SELECT entity_id FROM crm_records WHERE org_id = ${B.orgId} AND entity_id IS NOT NULL) ORDER BY rank LIMIT 3`;
    const ids = [...inCrm.map((r) => r.entity_id as string), ...notInCrm.map((r) => r.id as string)];

    const before = await repo.getCrmBadges(B, ids);
    expect(before[ids[0] as string]?.status).toBe("NOT_ENRICHED");
    expect(before[ids[4] as string]).toBeUndefined();

    const push = await repo.pushToCrm(B, "HUBSPOT", "COMPANY", ids);
    expect(push.status).toBe("SUCCEEDED");
    expect(push.counts).toMatchObject({ created: 3, updated: 2, errors: 0 });

    const after = await repo.getCrmBadges(B, ids);
    expect(ids.every((id) => after[id]?.status === "IN_CRM")).toBe(true);
    expect(after[ids[0] as string]?.owner).toBeTruthy(); // pulled owner survives the push

    // Pull again: the new records come back from the CRM and stay enriched.
    await repo.runCrmPull(B, "HUBSPOT");
    const again = await repo.getCrmBadges(B, ids);
    expect(ids.every((id) => again[id]?.status === "IN_CRM")).toBe(true);

    const f = (value: string[]) => ({ kind: "group" as const, op: "AND" as const, children: [{ kind: "condition" as const, field: "crm_status", operator: "any_of" as const, value }] });
    const inB = await searchEntities("companies", { filter: f(["IN_CRM"]), orgId: B.orgId, limit: 5 });
    expect(inB.total).toBeGreaterThan(50);
    const inA = await searchEntities("companies", { filter: f(["IN_CRM"]), orgId: A.orgId, limit: 5 });
    expect(inA.total).toBe(0); // tenancy
    const owner = await searchEntities("companies", { filter: { kind: "group", op: "AND", children: [{ kind: "condition", field: "crm_open_deals", operator: "gte", value: 1 }] }, orgId: B.orgId, limit: 5 });
    expect(owner.total).toBeGreaterThan(0);
  });

  it("logs activity, runs the scheduled enrichment, and cleans up on disconnect", async () => {
    if (!dbUp) return;
    const log = await repo.getCrmLog(B);
    expect(log.map((l) => l.direction)).toEqual(expect.arrayContaining(["PULL", "PUSH"]));
    expect(await repo.getCrmLog(A)).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: log[0]?.id })]));

    await repo.updateCrmConfig(B, "HUBSPOT", { schedule: "DAILY", pushConfig: { owner: "Ana Rojas", fieldMap: { COMPANY: { rank: "my_rank", bogus: "x" } } } });
    const conn = (await repo.listCrmConnections(B)).find((c) => c.provider === "HUBSPOT");
    expect(conn?.schedule).toBe("DAILY");
    expect(conn?.pushConfig).toMatchObject({ owner: "Ana Rojas", fieldMap: { COMPANY: { rank: "my_rank" } } });
    expect(JSON.stringify(conn?.pushConfig)).not.toContain("bogus");

    await getSql()`UPDATE crm_connections SET last_pull_at = now() - interval '2 days' WHERE org_id = ${B.orgId}`;
    const sched = await repo.runScheduledCrmSyncs();
    expect(sched.ran).toBeGreaterThanOrEqual(1);
    const enrich = (await repo.getCrmLog(B)).find((l) => l.direction === "ENRICH");
    expect(enrich?.status).toMatch(/SUCCEEDED|PARTIAL/);

    await repo.disconnectCrm(B, "HUBSPOT");
    expect((await getSql()`SELECT count(*)::int AS n FROM crm_records WHERE org_id = ${B.orgId}`)[0]?.n).toBe(0);
    expect((await getSql()`SELECT count(*)::int AS n FROM crm_sandbox_objects WHERE org_id = ${B.orgId}`)[0]?.n).toBe(0);
  });
});
