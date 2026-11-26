/**
 * Plan 7.14 admin console: accounts & credits, key approval queue, entity editor + merge (references
 * move, duplicates collapse, aliases kept), taxonomy rename, signal/classifier QA with corrections.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
config({ path: "../../.env" });
process.env.PLATFORM_ADMIN_EMAILS = "ops@founders.test";
import { getSql } from "@founders/db";
import * as repo from "../src/repo";

const OPS: repo.AdminContext = { email: "ops@founders.test", userId: "usr_ops" };
const ORG = "org_admtest00000000000000001";
const KEEP = "com_admtest0000000000000001";
const DROP = "com_admtest0000000000000002";
const KEY = "key_admtest0000000000000001";
const LIST = "lst_admtest0000000000000001";
let dbUp = false;
let taxo: { id: string; name: string } | undefined;
let reviewed: string[] = [];

async function cleanup() {
  const s = getSql();
  await s`DELETE FROM list_items WHERE list_id = ${LIST}`;
  await s`DELETE FROM lists WHERE id = ${LIST}`;
  await s`DELETE FROM funding_rounds WHERE company_id IN (${KEEP}, ${DROP})`;
  await s`DELETE FROM companies WHERE id IN (${KEEP}, ${DROP})`;
  await s`DELETE FROM api_keys WHERE id = ${KEY}`;
  for (const t of ["credit_balances", "credit_ledger", "billing_accounts"]) await s.unsafe(`DELETE FROM ${t} WHERE org_id = $1`, [ORG]);
  await s`DELETE FROM member WHERE organization_id = ${ORG}`;
  await s`DELETE FROM organization WHERE id = ${ORG}`;
  await s.begin(async (tx) => {
    await tx`SELECT set_config('founders.audit_maintenance', 'on', true)`;
    await tx`DELETE FROM audit_log WHERE org_id = ${ORG}`;
  });
}

beforeAll(async () => {
  try {
    await getSql()`SELECT 1 FROM signal_reviews LIMIT 1`;
    dbUp = true;
  } catch {
    return;
  }
  await cleanup();
  const s = getSql();
  await s`INSERT INTO organization (id, name, slug, seats) VALUES (${ORG}, 'Admin Test Fund', 'admin-test-fund', 3)`;
  await s`INSERT INTO member (id, organization_id, user_id, role) VALUES ('mem_admtest1', ${ORG}, 'usr_demo000000000000000000001', 'owner'), ('mem_admtest2', ${ORG}, 'usr_demo000000000000000000002', 'member')`;
  await s`INSERT INTO api_keys (id, org_id, user_id, name, prefix, hash, scopes, status) VALUES (${KEY}, ${ORG}, 'usr_demo000000000000000000002', 'ETL', 'fai_admtes', 'hash_admtest_1', ARRAY['read:data'], 'PENDING')`;
  await s`INSERT INTO companies (id, name, domain, aliases, growth_stage) VALUES (${KEEP}, 'Admtest Labs', 'admtest.io', '{}', 'SEED'), (${DROP}, 'AdmTest Labs SRL', 'admtest.com.bo', '{"ATL"}', 'SEED')`;
  await s`INSERT INTO funding_rounds (id, company_id, type, announced_date) VALUES ('trx_admtest000000000000001', ${DROP}, 'SEED', '2024-01-01')`;
  await s`INSERT INTO lists (id, org_id, owner_id, name, entity_type, visibility) VALUES (${LIST}, ${ORG}, 'usr_demo000000000000000000001', 'Merge test', 'COMPANY', 'TEAM')`;
  await s`INSERT INTO list_items (list_id, entity_type, entity_id, added_by) VALUES (${LIST}, 'COMPANY', ${KEEP}, 'usr_demo000000000000000000001'), (${LIST}, 'COMPANY', ${DROP}, 'usr_demo000000000000000000001')`;
  [taxo] = (await s`SELECT id, name FROM taxonomy_nodes WHERE kind = 'SECTOR' ORDER BY id LIMIT 1`) as unknown as { id: string; name: string }[];
});

afterAll(async () => {
  if (dbUp) {
    await cleanup();
    if (taxo) await getSql()`UPDATE taxonomy_nodes SET name = ${taxo.name} WHERE id = ${taxo.id}`;
    await getSql()`DELETE FROM signal_reviews WHERE signal_id = ANY(${reviewed})`;
  }
  await getSql().end({ timeout: 1 });
});

describe("admin console", () => {
  it("refuses non-admins", async () => {
    if (!dbUp) return;
    const nope = { email: "x@founders.test", userId: "u" };
    expect(() => repo.listAccounts(nope)).toThrow(repo.ForbiddenError);
    await expect(repo.adminAdjustCredits(nope, ORG, 5, "x")).rejects.toBeInstanceOf(repo.ForbiddenError);
    await expect(repo.mergeEntities(nope, KEEP, DROP)).rejects.toBeInstanceOf(repo.ForbiddenError);
  });

  it("accounts: list, adjust credits (both audit logs), contract terms", async () => {
    if (!dbUp) return;
    expect((await repo.listAccounts(OPS, "Admin Test")).map((r) => r.id)).toEqual([ORG]);
    await expect(repo.adminAdjustCredits(OPS, ORG, 100, "")).rejects.toThrow(/note/);
    await repo.adminAdjustCredits(OPS, ORG, 500, "Pilot credits");
    await repo.adminAdjustCredits(OPS, ORG, -120, "Correction");
    expect(await repo.getBalance(ORG)).toBe(380);
    await repo.adminUpdateAccount(OPS, ORG, { seats: 1, periodCredits: 2000, rolloverPct: 150, overageLimit: 5000 });
    const acc = await repo.getAccount(OPS, ORG);
    expect(acc.org.seats).toBe(2); // never below members
    expect(acc.billing).toMatchObject({ period_credits: 2000, rollover_pct: 100, overage_enabled: true });
    expect(acc.overageLimit).toBe(5000);
    const own = await repo.listAudit({ orgId: ORG, userId: "x", role: "owner" });
    expect(own.map((r) => r.action)).toEqual(expect.arrayContaining(["credits.adjust", "account.terms.update"]));
    expect(own.every((r) => r.actor === OPS.email)).toBe(true);
  });

  it("key approval queue approves across workspaces and grants trial credits once", async () => {
    if (!dbUp) return;
    expect((await repo.listPendingApiKeys(OPS)).some((k) => k.id === KEY && k.org_name === "Admin Test Fund")).toBe(true);
    const before = await repo.getBalance(ORG);
    await repo.adminReviewApiKey(OPS, KEY, "ACTIVE");
    expect(await repo.getBalance(ORG)).toBe(before + 200);
    await expect(repo.adminReviewApiKey(OPS, KEY, "ACTIVE")).rejects.toBeInstanceOf(repo.NotFoundError);
  });

  it("entity editor writes whitelisted fields with admin provenance", async () => {
    if (!dbUp) return;
    await repo.updateEntityFields(OPS, KEEP, { tagline: "Payments for LatAm SMBs", founded_year: "2021", provenance: "x" } as Record<string, string>);
    const e = await repo.getEntityForEdit(OPS, KEEP);
    expect(e.row).toMatchObject({ tagline: "Payments for LatAm SMBs", founded_year: 2021 });
    expect((e.row.provenance as Record<string, { source: string }>).tagline!.source).toBe("admin_edit");
    await expect(repo.updateEntityFields(OPS, KEEP, { employee_count: "lots" })).rejects.toThrow(/number/);
    await expect(repo.getEntityForEdit(OPS, "lst_x")).rejects.toBeInstanceOf(repo.NotFoundError);
  });

  it("merge moves references, collapses duplicate list rows, keeps aliases, soft-deletes the duplicate", async () => {
    if (!dbUp) return;
    expect((await repo.duplicateCandidates(OPS, 500)).some((d) => d.keep_id === KEEP && d.drop_id === DROP)).toBe(true);
    await expect(repo.mergeEntities(OPS, KEEP, "per_x")).rejects.toThrow(/Both ids/);
    const moved = await repo.mergeEntities(OPS, KEEP, DROP);
    expect(moved["funding_rounds.company_id"]).toBe(1);
    const s = getSql();
    expect((await s`SELECT entity_id FROM list_items WHERE list_id = ${LIST}`).map((r) => r.entity_id)).toEqual([KEEP]);
    const [k] = await s`SELECT aliases, domain_aliases FROM companies WHERE id = ${KEEP}`;
    expect(k!.aliases).toEqual(expect.arrayContaining(["AdmTest Labs SRL", "ATL"]));
    expect(k!.domain_aliases).toContain("admtest.com.bo");
    expect((await s`SELECT deleted_at FROM companies WHERE id = ${DROP}`)[0]!.deleted_at).toBeTruthy();
    await expect(repo.mergeEntities(OPS, KEEP, DROP)).rejects.toThrow(/already deleted/);
  });

  it("taxonomy rename keeps ids and slugs", async () => {
    if (!dbUp || !taxo) return;
    await repo.renameTaxonomyNode(OPS, taxo.id, "Renamed Sector");
    const [t] = await getSql()`SELECT name, slug FROM taxonomy_nodes WHERE id = ${taxo.id}`;
    expect(t!.name).toBe("Renamed Sector");
    await expect(repo.renameTaxonomyNode(OPS, taxo.id, "x")).rejects.toThrow(/2–80/);
  });

  it("signal QA records verdicts, applies corrections, reports precision", async () => {
    if (!dbUp) return;
    const [t1, t2] = await repo.qaQueue(OPS, "TALENT", 2);
    const [n1] = await repo.qaQueue(OPS, "NEWS", 1);
    if (!t1 || !t2 || !n1) return;
    reviewed = [t1.id, t2.id, n1.id];
    const labels = await repo.qaLabels("NEWS");
    const before = (await repo.qaStats(OPS)).find((r) => r.kind === "NEWS" && r.label === n1.label) ?? { reviewed: 0, correct: 0 };
    const other = labels.find((l) => l !== n1.label)!;
    await repo.reviewSignal(OPS, "TALENT", t1.id, "CORRECT");
    await repo.reviewSignal(OPS, "TALENT", t2.id, "WRONG", null, "not a move");
    await repo.reviewSignal(OPS, "NEWS", n1.id, "WRONG", other);
    await expect(repo.reviewSignal(OPS, "NEWS", n1.id, "WRONG", "NOT_A_LABEL")).rejects.toThrow(/Unknown label/);
    expect((await getSql()`SELECT category FROM news_signals WHERE id = ${n1.id}`)[0]!.category).toBe(other);
    expect((await repo.qaQueue(OPS, "TALENT", 500)).some((s) => s.id === t1.id)).toBe(false);
    const stats = await repo.qaStats(OPS);
    expect(stats.find((r) => r.kind === "NEWS" && r.label === n1.label)).toMatchObject({ reviewed: before.reviewed + 1, correct: before.correct });
    // Restore the corrected label for other tests.
    await getSql()`UPDATE news_signals SET category = ${n1.label} WHERE id = ${n1.id}`;
  });
});
