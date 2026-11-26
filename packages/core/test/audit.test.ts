/**
 * Audit log v2 (plan 14.4): append-only, hash-chained per org, admin-only reads, CSV export with the
 * injection guard, concurrent appends keep a gap-free sequence, tampering is detected.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
config({ path: "../../.env" });
import { getSql } from "@founders/db";
import * as repo from "../src/repo";

const ORG = "org_audittest000000000000001";
const ADMIN: repo.OrgContext = { orgId: ORG, userId: "usr_demo000000000000000000001", role: "admin" };
let dbUp = false;

async function wipe() {
  await getSql().begin(async (tx) => {
    await tx`SELECT set_config('founders.audit_maintenance', 'on', true)`;
    await tx`DELETE FROM audit_log WHERE org_id = ${ORG}`;
  });
}

beforeAll(async () => {
  try {
    await getSql()`SELECT seq FROM audit_log LIMIT 1`;
    dbUp = true;
    await wipe();
  } catch {
    dbUp = false;
  }
});
afterAll(async () => {
  if (dbUp) await wipe();
  await getSql().end({ timeout: 1 });
});

describe("audit log", () => {
  it("is hash-chained, gap-free under concurrency, and verifies", async () => {
    if (!dbUp) return;
    await repo.audit(ADMIN, "member.invite", "a@example.com", { role: "member", token: "must-not-be-stored" }, { ip: "203.0.113.7", userAgent: "vitest" });
    await Promise.all(Array.from({ length: 12 }, (_, i) => repo.recordAudit({ orgId: ORG, actor: "system", actorType: "system", action: "job.run", target: String(i) })));
    const rows = await repo.listAudit(ADMIN);
    expect(rows).toHaveLength(13);
    expect(rows.map((r) => r.seq).sort((a, b) => a! - b!)).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
    const invite = rows.find((r) => r.action === "member.invite")!;
    expect(invite.metadata).toEqual({ role: "member" }); // secrets scrubbed
    expect(invite.ip).toBe("203.0.113.7");
    expect(await repo.verifyAuditChain(ORG)).toEqual({ ok: true, rows: 13, legacy: 0 });
  });

  it("refuses updates and deletes outside the maintenance path", async () => {
    if (!dbUp) return;
    await expect(getSql()`UPDATE audit_log SET action = 'x' WHERE org_id = ${ORG}`).rejects.toThrow(/append-only/);
    await expect(getSql()`DELETE FROM audit_log WHERE org_id = ${ORG}`).rejects.toThrow(/append-only/);
  });

  it("detects an edited or removed row", async () => {
    if (!dbUp) return;
    await getSql().begin(async (tx) => {
      await tx`SELECT set_config('founders.audit_maintenance', 'on', true)`;
      await tx`UPDATE audit_log SET target = 'b@example.com' WHERE org_id = ${ORG} AND seq = 1`;
    });
    expect(await repo.verifyAuditChain(ORG)).toMatchObject({ ok: false, brokenAt: 1, reason: expect.stringMatching(/hash mismatch/) });
    await getSql().begin(async (tx) => {
      await tx`SELECT set_config('founders.audit_maintenance', 'on', true)`;
      await tx`DELETE FROM audit_log WHERE org_id = ${ORG} AND seq = 1`;
    });
    expect(await repo.verifyAuditChain(ORG)).toMatchObject({ ok: false, brokenAt: 1, reason: "missing row 1" });
  });

  it("is admin-only, filterable, and exports CSV with the injection guard", async () => {
    if (!dbUp) return;
    await expect(repo.listAudit({ ...ADMIN, role: "member" })).rejects.toBeInstanceOf(repo.ForbiddenError);
    await expect(repo.auditCsv({ ...ADMIN, role: "viewer" })).rejects.toBeInstanceOf(repo.ForbiddenError);
    await repo.recordAudit({ orgId: ORG, actor: "system", actorType: "system", action: "export.companies", target: "=HYPERLINK(\"http://x\")" });
    expect((await repo.listAudit(ADMIN, { action: "export." })).map((r) => r.action)).toEqual(["export.companies"]);
    const csv = await repo.auditCsv(ADMIN, { action: "export." });
    expect(csv.split("\n")[0]).toBe("at,seq,actor,actor_name,actor_type,action,target,ip,metadata");
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    // Another workspace's admin sees none of it.
    expect((await repo.listAudit({ ...ADMIN, orgId: "org_demo000000000000000000002" })).some((r) => r.target === "=HYPERLINK(\"http://x\")")).toBe(false);
  });
});
