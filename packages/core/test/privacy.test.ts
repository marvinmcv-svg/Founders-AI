/**
 * Plan 14.5 privacy: DSAR lifecycle (submit → verify → match → complete) for ACCESS / DELETE /
 * OPT_OUT, the suppression list blocking re-ingestion at the DB, admin-only access, and the
 * self-service export / account deletion. Uses synthetic test people, cleaned up afterwards.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
config({ path: "../../.env" });
process.env.PLATFORM_ADMIN_EMAILS = "ops@founders.test";
delete process.env.RESEND_API_KEY;
import { getSql } from "@founders/db";
import { sha256Hex } from "../src/privacy";
import * as repo from "../src/repo";

const OPS: repo.AdminContext = { email: "ops@founders.test", userId: "usr_ops" };
const NOT_OPS: repo.AdminContext = { email: "someone@founders.test", userId: "usr_x" };
const ORG = "org_demo000000000000000000001";
const P = (n: number) => `per_privtest00000000000000${n}`;
const EMAIL = (n: number) => `privtest${n}@example.org`;
const LI = (n: number) => `https://www.linkedin.com/in/privtest-${n}/`;
const USER = "usr_privtest000000000000001";
const USER_ORG = "org_privtest000000000000001";
let dbUp = false;
const dsars: string[] = [];

async function seedPerson(n: number) {
  const s = getSql();
  await s`INSERT INTO people (id, full_name, first, last, linkedin_url, headline) VALUES (${P(n)}, ${`Priv Test${n}`}, 'Priv', ${`Test${n}`}, ${LI(n)}, 'Founder')`;
  await s`INSERT INTO person_emails (person_id, email, type, status, source) VALUES (${P(n)}, ${EMAIL(n)}, 'work', 'verified', 'test')`;
  await s`INSERT INTO person_experience (id, person_id, company_name, title, is_current, is_founder) VALUES (${`exp_privtest${n}`}, ${P(n)}, 'Acme', 'CEO', true, true)`;
}

async function cleanup() {
  const s = getSql();
  const ids = [1, 2, 3, 4, 5].map(P);
  await s`DELETE FROM suppression_list WHERE dsar_id = ANY(${dsars}) OR created_by = ${OPS.email}`;
  for (const t of ["person_emails", "person_experience", "person_changes"]) await s.unsafe(`DELETE FROM ${t} WHERE person_id = ANY($1)`, [ids]);
  await s`DELETE FROM list_items WHERE entity_id = ANY(${ids})`;
  await s`DELETE FROM people WHERE id = ANY(${ids}) OR linkedin_url LIKE '%privtest-%'`;
  await s`DELETE FROM dsar_events WHERE dsar_id = ANY(${dsars})`;
  await s`DELETE FROM dsar_requests WHERE id = ANY(${dsars}) OR email LIKE 'privtest%'`;
  await s`DELETE FROM member WHERE organization_id = ${USER_ORG}`;
  await s`DELETE FROM "user" WHERE id = ${USER}`;
  await s`DELETE FROM organization WHERE id = ${USER_ORG}`;
}

beforeAll(async () => {
  try {
    await getSql()`SELECT 1 FROM suppression_list LIMIT 1`;
    dbUp = true;
  } catch {
    return;
  }
  await cleanup();
  for (const n of [1, 2, 3, 4]) await seedPerson(n);
  const [list] = await getSql()`SELECT id FROM lists WHERE org_id = ${ORG} AND entity_type = 'PERSON' LIMIT 1`;
  if (list) await getSql()`INSERT INTO list_items (list_id, entity_type, entity_id, added_by) VALUES (${list.id}, 'PERSON', ${P(1)}, 'usr_demo000000000000000000001') ON CONFLICT DO NOTHING`;
});
afterAll(async () => {
  if (dbUp) await cleanup();
  await getSql().end({ timeout: 1 });
});

async function newDsar(type: repo.DsarType, n: number) {
  const { id, emailed } = await repo.submitDsar({ email: EMAIL(n), fullName: `Priv Test${n}`, type, linkedinUrl: LI(n) }, "https://www.example/api/dsar/verify");
  dsars.push(id);
  expect(emailed).toBe(false); // no Resend key here
  return id;
}

describe("DSAR workflow", () => {
  it("is platform-admin only", async () => {
    if (!dbUp) return;
    expect(() => repo.listDsars(NOT_OPS)).toThrow(repo.ForbiddenError);
    await expect(repo.dsarCounts(NOT_OPS)).rejects.toBeInstanceOf(repo.ForbiddenError);
  });

  it("verifies by e-mail token (and refuses a wrong one)", async () => {
    if (!dbUp) return;
    const id = await newDsar("ACCESS", 2);
    const d = await repo.getDsar(OPS, id);
    expect(d.status).toBe("RECEIVED");
    expect(d.days_left).toBeGreaterThanOrEqual(29);
    expect(d.events.map((e) => e.action)).toEqual(["received", "verification_not_sent"]);
    await getSql()`UPDATE dsar_requests SET verify_token_hash = ${sha256Hex("tok-123")} WHERE id = ${id}`;
    expect(await repo.verifyDsar(id, "wrong")).toBe(false);
    expect(await repo.verifyDsar(id, "tok-123")).toBe(true);
    expect((await repo.getDsar(OPS, id)).status).toBe("VERIFIED");
  });

  it("ACCESS: matches by e-mail/LinkedIn/name and delivers an export of everything held", async () => {
    if (!dbUp) return;
    const id = dsars[0]!;
    const matches = await repo.findDsarMatches(OPS, id);
    expect(matches[0]).toMatchObject({ id: P(2), why: ["e-mail", "LinkedIn", "name"] });
    await repo.setDsarMatches(OPS, id, [P(2)]);
    const result = await repo.completeDsar(OPS, id);
    const profiles = result.profiles as { profile: { id: string }; emails: { email: string }[]; experience: unknown[] }[];
    expect(profiles[0]!.profile.id).toBe(P(2));
    expect(profiles[0]!.emails[0]!.email).toBe(EMAIL(2));
    expect(profiles[0]!.experience).toHaveLength(1);
    const d = await repo.getDsar(OPS, id);
    expect(d.status).toBe("COMPLETED");
    expect(d.events.some((e) => e.action === "export_not_sent")).toBe(true);
    await expect(repo.completeDsar(OPS, id)).rejects.toThrow(/closed/);
  });

  it("DELETE: erases the person everywhere, suppresses them, and re-ingestion is dropped by the DB", async () => {
    if (!dbUp) return;
    const id = await newDsar("DELETE", 1);
    await expect(repo.completeDsar(OPS, id)).rejects.toThrow(/Verify/);
    await expect(repo.markDsarVerified(OPS, id, " ")).rejects.toThrow(/how identity/);
    await repo.markDsarVerified(OPS, id, "Replied from the address on file");
    await repo.setDsarMatches(OPS, id, [P(1)]);
    const result = await repo.completeDsar(OPS, id);
    expect(result.suppression_entries_added).toBe(3); // id, LinkedIn, e-mail
    const s = getSql();
    expect(await s`SELECT 1 FROM people WHERE id = ${P(1)}`).toHaveLength(0);
    expect(await s`SELECT 1 FROM person_emails WHERE person_id = ${P(1)}`).toHaveLength(0);
    expect(await s`SELECT 1 FROM list_items WHERE entity_id = ${P(1)}`).toHaveLength(0);
    // A provider refresh tries to bring them back: same id, a new id with the same LinkedIn URL, the e-mail.
    await s`INSERT INTO people (id, full_name, first, last, linkedin_url) VALUES (${P(1)}, 'Priv Test1', 'Priv', 'Test1', ${LI(1)})`;
    await s`INSERT INTO people (id, full_name, first, last, linkedin_url) VALUES (${P(5)}, 'Priv Test1', 'Priv', 'Test1', ${"HTTPS://LINKEDIN.COM/in/privtest-1?trk=x"})`;
    await s`INSERT INTO person_emails (person_id, email, type, status, source) VALUES ('per_someoneelse', ${` ${EMAIL(1).toUpperCase()} `}, 'work', 'verified', 'test')`;
    await s`INSERT INTO person_experience (id, person_id, company_name, title, is_current, is_founder) VALUES ('exp_privtest_back', ${P(1)}, 'Acme', 'CEO', true, true)`;
    expect(await s`SELECT 1 FROM people WHERE id IN (${P(1)}, ${P(5)})`).toHaveLength(0);
    expect(await s`SELECT 1 FROM person_emails WHERE lower(trim(email)) = ${EMAIL(1)}`).toHaveLength(0);
    expect(await s`SELECT 1 FROM person_experience WHERE person_id = ${P(1)}`).toHaveLength(0);
    expect(await repo.isSuppressed({ email: EMAIL(1) })).toBe(true);
    expect(await repo.isSuppressed({ linkedinUrl: "linkedin.com/in/privtest-1" })).toBe(true);
    expect(await repo.isSuppressed({ email: "nobody@example.org" })).toBe(false);
  });

  it("OPT_OUT: withdraws the profile, drops contact data, blocks new signals", async () => {
    if (!dbUp) return;
    const id = await newDsar("OPT_OUT", 3);
    await repo.markDsarVerified(OPS, id, "Verified by phone");
    await repo.setDsarMatches(OPS, id, [P(3)]);
    await repo.completeDsar(OPS, id);
    const s = getSql();
    const [p] = await s`SELECT deleted_at FROM people WHERE id = ${P(3)}`;
    expect(p!.deleted_at).toBeTruthy();
    expect(await s`SELECT 1 FROM person_emails WHERE person_id = ${P(3)}`).toHaveLength(0);
    await s`INSERT INTO person_changes (id, person_id, source, observed_at, before, after) VALUES ('chg_privtest3', ${P(3)}, 'test', now(), '{}', '{}')`;
    expect(await s`SELECT 1 FROM person_changes WHERE person_id = ${P(3)}`).toHaveLength(0);
  });

  it("reject needs a reason; the operator can suppress an address directly", async () => {
    if (!dbUp) return;
    const id = await newDsar("ACCESS", 4);
    await expect(repo.rejectDsar(OPS, id, "")).rejects.toThrow(/reason/);
    await repo.rejectDsar(OPS, id, "Could not verify identity");
    expect((await repo.getDsar(OPS, id)).status).toBe("REJECTED");
    expect(await repo.addSuppression(OPS, "email", EMAIL(4))).toEqual({ added: true, withdrawn: 1 });
    expect((await getSql()`SELECT deleted_at FROM people WHERE id = ${P(4)}`)[0]!.deleted_at).toBeTruthy();
    await expect(repo.addSuppression(OPS, "linkedin", "https://example.com/x")).rejects.toThrow(/valid/);
    expect((await repo.suppressionStats(OPS)).some((r) => r.reason === "ADMIN")).toBe(true);
    const platform = await getSql()`SELECT action FROM audit_log WHERE org_id = 'platform' AND target = ANY(${dsars})`;
    expect(platform.map((r) => r.action)).toEqual(expect.arrayContaining(["dsar.verify", "dsar.complete.delete", "dsar.complete.opt_out", "dsar.reject"]));
  });
});

describe("self-service privacy", () => {
  const ctx: repo.OrgContext = { orgId: USER_ORG, userId: USER, role: "owner" };
  it("exports my data and deletes my account (blocked while I'm the only admin of a team)", async () => {
    if (!dbUp) return;
    const s = getSql();
    await s`INSERT INTO "user" (id, name, email) VALUES (${USER}, 'Priv User', 'privuser@example.org')`;
    await s`INSERT INTO organization (id, name, slug) VALUES (${USER_ORG}, 'Priv Org', 'priv-org')`;
    await s`INSERT INTO member (id, organization_id, user_id, role) VALUES ('mem_privtest1', ${USER_ORG}, ${USER}, 'owner'), ('mem_privtest2', ${USER_ORG}, 'usr_demo000000000000000000002', 'member')`;
    const data = await repo.exportMyData(ctx);
    expect(data.user).toMatchObject({ email: "privuser@example.org" });
    expect(data.memberships).toHaveLength(1);
    await expect(repo.deleteMyAccount(ctx, "wrong@example.org")).rejects.toBeInstanceOf(repo.ForbiddenError);
    await expect(repo.deleteMyAccount(ctx, "privuser@example.org")).rejects.toBeInstanceOf(repo.AccountDeletionBlockedError);
    await s`UPDATE member SET role = 'admin' WHERE id = 'mem_privtest2'`;
    expect(await repo.deleteMyAccount(ctx, "PrivUser@example.org")).toEqual({ workspaces: 1 });
    expect(await s`SELECT 1 FROM "user" WHERE id = ${USER}`).toHaveLength(0);
    expect(await s`SELECT 1 FROM member WHERE user_id = ${USER}`).toHaveLength(0);
    const log = await repo.listAudit({ orgId: USER_ORG, userId: "x", role: "owner" });
    expect(log.map((r) => r.action)).toEqual(expect.arrayContaining(["privacy.export_my_data", "account.delete"]));
  });
});
