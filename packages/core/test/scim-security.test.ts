/**
 * Plan 14.4 enterprise identity: SCIM 2.0 provisioning (Okta / Entra request shapes) and the
 * workspace "require SSO" / "require 2FA" policies.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
config({ path: "../../.env" });
import { getSql } from "@founders/db";
import * as repo from "../src/repo";

const ORG = "org_scimtest0000000000000001";
const OTHER = "org_scimtest0000000000000002";
const OWNER = "usr_demo000000000000000000001";
const ADMIN: repo.OrgContext = { orgId: ORG, userId: OWNER, role: "owner" };
const BASE = "http://localhost:3001/scim/v2";
let dbUp = false;
let token = "";
let otherToken = "";

const call = (method: string, path: string, body?: unknown, tok = token, query = "") =>
  repo.handleScim({ method, path, query: new URLSearchParams(query), body, authorization: tok ? `Bearer ${tok}` : null, baseUrl: BASE });

async function cleanup() {
  const s = getSql();
  const users = (await s`SELECT user_id FROM scim_users WHERE org_id IN (${ORG}, ${OTHER})`).map((r) => r.user_id as string);
  await s`DELETE FROM scim_users WHERE org_id IN (${ORG}, ${OTHER})`;
  await s`DELETE FROM scim_tokens WHERE org_id IN (${ORG}, ${OTHER})`;
  await s`DELETE FROM member WHERE organization_id IN (${ORG}, ${OTHER})`;
  await s`DELETE FROM "user" WHERE (id = ANY(${users}) AND email LIKE '%@scim.example') OR email LIKE '%@scim.example'`;
  await s`DELETE FROM sso_provider WHERE organization_id IN (${ORG}, ${OTHER})`;
  await s.begin(async (tx) => {
    await tx`SELECT set_config('founders.audit_maintenance', 'on', true)`;
    await tx`DELETE FROM audit_log WHERE org_id IN (${ORG}, ${OTHER})`;
  });
  await s`DELETE FROM organization WHERE id IN (${ORG}, ${OTHER})`;
}

beforeAll(async () => {
  try {
    await getSql()`SELECT 1 FROM scim_users LIMIT 1`;
    dbUp = true;
  } catch {
    return;
  }
  await cleanup();
  const s = getSql();
  await s`INSERT INTO organization (id, name, slug, seats) VALUES (${ORG}, 'SCIM Test', 'scim-test', 3), (${OTHER}, 'SCIM Other', 'scim-other', 5)`;
  await s`INSERT INTO member (id, organization_id, user_id, role) VALUES ('mem_scimtest1', ${ORG}, ${OWNER}, 'owner')`;
  token = (await repo.createScimToken(ADMIN, "Okta")).secret;
  otherToken = (await repo.createScimToken({ orgId: OTHER, userId: OWNER, role: "owner" }, "Entra")).secret;
});
afterAll(async () => {
  if (dbUp) await cleanup();
  await getSql().end({ timeout: 1 });
});

describe("SCIM 2.0", () => {
  let aliceId = "";

  it("authenticates with the workspace token only", async () => {
    if (!dbUp) return;
    expect((await call("GET", "/Users", undefined, "")).status).toBe(401);
    expect((await call("GET", "/Users", undefined, "scim_wrong")).status).toBe(401);
    await expect(repo.createScimToken({ ...ADMIN, role: "member" }, "x")).rejects.toBeInstanceOf(repo.ForbiddenError);
    const cfg = await call("GET", "/ServiceProviderConfig");
    expect(cfg.body).toMatchObject({ patch: { supported: true }, bulk: { supported: false } });
    expect((await call("GET", "/Groups")).status).toBe(501);
  });

  it("creates a user (Okta shape) → user + membership with role; duplicates are 409", async () => {
    if (!dbUp) return;
    const r = await call("POST", "/Users", {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
      userName: "Alice@scim.example",
      name: { givenName: "Alice", familyName: "Quispe" },
      emails: [{ primary: true, value: "alice@scim.example", type: "work" }],
      externalId: "00u1",
      active: true,
      roles: [{ value: "viewer" }],
    });
    expect(r.status).toBe(201);
    const body = r.body as { id: string; userName: string; active: boolean; roles: { value: string }[]; displayName: string };
    aliceId = body.id;
    expect(body).toMatchObject({ userName: "alice@scim.example", active: true, displayName: "Alice Quispe", roles: [{ value: "viewer" }] });
    const [m] = await getSql()`SELECT m.role FROM member m JOIN "user" u ON u.id = m.user_id WHERE m.organization_id = ${ORG} AND u.email = 'alice@scim.example'`;
    expect(m!.role).toBe("viewer");
    expect((await call("POST", "/Users", { userName: "alice@scim.example" })).status).toBe(409);
    expect((await call("POST", "/Users", { userName: "not-an-email" })).status).toBe(400);
  });

  it("filters by userName / externalId and pages", async () => {
    if (!dbUp) return;
    const r = await call("GET", "/Users", undefined, token, 'filter=userName eq "alice@scim.example"');
    expect(r.body).toMatchObject({ totalResults: 1, Resources: [{ id: aliceId }] });
    expect((await call("GET", "/Users", undefined, token, 'filter=externalId eq "00u1"')).body).toMatchObject({ totalResults: 1 });
    expect((await call("GET", "/Users", undefined, token, 'filter=userName eq "nobody@scim.example"')).body).toMatchObject({ totalResults: 0, Resources: [] });
    expect((await call("GET", "/Users", undefined, token, "filter=title co \"x\"")).status).toBe(400);
  });

  it("PATCH active=false removes the membership; active=true restores it (Entra shape)", async () => {
    if (!dbUp) return;
    const off = await call("PATCH", `/Users/${aliceId}`, { schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"], Operations: [{ op: "Replace", path: "active", value: "False" }] });
    expect((off.body as { active: boolean }).active).toBe(false);
    const members = async () => (await getSql()`SELECT 1 FROM member m JOIN "user" u ON u.id = m.user_id WHERE m.organization_id = ${ORG} AND u.email = 'alice@scim.example'`).length;
    expect(await members()).toBe(0);
    await call("PATCH", `/Users/${aliceId}`, { schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"], Operations: [{ op: "replace", value: { active: true, name: { familyName: "Mamani" } } }] });
    expect(await members()).toBe(1);
    expect(((await call("GET", `/Users/${aliceId}`)).body as { displayName: string }).displayName).toBe("Alice Mamani");
    const put = await call("PUT", `/Users/${aliceId}`, { userName: "alice@scim.example", displayName: "Alice Mamani", active: true, roles: [{ value: "admin" }] });
    expect((put.body as { roles: { value: string }[] }).roles[0]!.value).toBe("admin");
  });

  it("enforces seats, isolates workspaces, and deletes", async () => {
    if (!dbUp) return;
    expect((await call("POST", "/Users", { userName: "bob@scim.example" })).status).toBe(201); // 3 of 3 seats
    const full = await call("POST", "/Users", { userName: "carol@scim.example" });
    expect(full.status).toBe(409);
    expect((full.body as { detail: string }).detail).toMatch(/seats/);
    expect((await call("GET", `/Users/${aliceId}`, undefined, otherToken)).status).toBe(404);
    expect((await call("DELETE", `/Users/${aliceId}`, undefined, otherToken)).status).toBe(404);
    expect((await call("DELETE", `/Users/${aliceId}`)).status).toBe(204);
    expect((await call("GET", `/Users/${aliceId}`)).status).toBe(404);
    const log = await repo.listAudit(ADMIN, { action: "scim." });
    expect(log.map((r) => r.action)).toEqual(expect.arrayContaining(["scim.token.create", "scim.user.create", "scim.user.update", "scim.user.delete"]));
    expect(log.filter((r) => r.action.startsWith("scim.user")).every((r) => r.actor_type === "scim")).toBe(true);
  });

  it("a revoked token stops working", async () => {
    if (!dbUp) return;
    const [t] = await repo.listScimTokens(ADMIN);
    await repo.revokeScimToken(ADMIN, t!.id);
    expect((await call("GET", "/Users")).status).toBe(401);
  });
});

describe("security policies", () => {
  it("require SSO needs a verified provider and an SSO session; then password sessions are refused", async () => {
    if (!dbUp) return;
    const pw = { loginMethod: "password", twoFactorEnabled: false };
    await expect(repo.setSecurityPolicy(ADMIN, { requireSso: true }, pw)).rejects.toThrow(/verify its domain/);
    await getSql()`INSERT INTO sso_provider (id, issuer, provider_id, organization_id, domain, domain_verified, oidc_config) VALUES ('sso_scimtest1', 'https://idp.scim.example', 'scim-test-okta', ${ORG}, 'scim.example', true, '{}')`;
    await expect(repo.setSecurityPolicy(ADMIN, { requireSso: true }, pw)).rejects.toThrow(/through SSO yourself/);
    await repo.setSecurityPolicy(ADMIN, { requireSso: true }, { loginMethod: "sso", twoFactorEnabled: false });
    expect(await repo.checkAccessPolicy(ORG, pw)).toEqual({ ok: false, reason: "sso_required" });
    expect(await repo.checkAccessPolicy(ORG, { loginMethod: "sso", twoFactorEnabled: false })).toEqual({ ok: true });
    expect((await repo.listSsoProviders(ADMIN))[0]).toMatchObject({ protocol: "OIDC", domain_verified: true });
    await repo.setSecurityPolicy(ADMIN, { requireSso: false }, pw);
  });

  it("require 2FA: password sessions need 2FA on; SSO sessions satisfy it", async () => {
    if (!dbUp) return;
    await expect(repo.setSecurityPolicy(ADMIN, { require2fa: true }, { loginMethod: "password", twoFactorEnabled: false })).rejects.toThrow(/your own account/);
    await repo.setSecurityPolicy(ADMIN, { require2fa: true }, { loginMethod: "password+2fa", twoFactorEnabled: true });
    expect(await repo.checkAccessPolicy(ORG, { loginMethod: "password", twoFactorEnabled: false })).toEqual({ ok: false, reason: "2fa_required" });
    expect(await repo.checkAccessPolicy(ORG, { loginMethod: "password+2fa", twoFactorEnabled: true })).toEqual({ ok: true });
    expect(await repo.checkAccessPolicy(ORG, { loginMethod: "sso", twoFactorEnabled: false })).toEqual({ ok: true });
    await expect(repo.setSecurityPolicy({ ...ADMIN, role: "member" }, { require2fa: false }, { loginMethod: "sso", twoFactorEnabled: true })).rejects.toBeInstanceOf(repo.ForbiddenError);
  });
});
