/**
 * SCIM 2.0 provisioning (plan 14.4; RFC 7643 / 7644), Users only, one service per workspace,
 * authenticated by a workspace SCIM token (shown once, stored as SHA-256).
 *
 * Mapping: SCIM User ↔ Better Auth user (by e-mail = userName) + membership in this workspace.
 * active=false or DELETE removes the membership (and the user's sessions if they belong to no other
 * workspace); the user record itself stays, because it may belong to other workspaces. Roles: the
 * first `roles[].value` in admin | member | viewer, else member. Seats are enforced.
 *
 * Groups are not supported (ServiceProviderConfig says so); IdPs then provision users only.
 */
import { sql } from "drizzle-orm";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { newId } from "../ids";
import { recordAudit } from "./audit";
import { assertSeatAvailable, SeatLimitError } from "./billing";
import { rawQuery as q } from "./entities";
import { ForbiddenError, NotFoundError, type OrgContext } from "./workspace";

const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const LIST_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
const ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";
const PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const ROLES = ["admin", "member", "viewer"] as const;

const sha = (v: string) => createHash("sha256").update(v).digest("hex");

/* ------------------------------------------------------------------ */
/* Tokens (Settings → Security)                                        */
/* ------------------------------------------------------------------ */

function assertAdmin(ctx: OrgContext) {
  if (ctx.role !== "admin" && ctx.role !== "owner") throw new ForbiddenError("Only workspace admins can manage SCIM");
}

export async function createScimToken(ctx: OrgContext, name: string) {
  assertAdmin(ctx);
  const secret = `scim_${randomBytes(24).toString("base64url")}`;
  const id = newId("scimToken");
  await q(sql`INSERT INTO scim_tokens (id, org_id, name, prefix, hash, created_by) VALUES (${id}, ${ctx.orgId}, ${name.trim().slice(0, 80) || "Identity provider"}, ${secret.slice(0, 10)}, ${sha(secret)}, ${ctx.userId})`);
  await recordAudit({ orgId: ctx.orgId, actor: ctx.userId, action: "scim.token.create", target: id });
  return { id, secret };
}

export function listScimTokens(ctx: OrgContext) {
  assertAdmin(ctx);
  return q<{ id: string; name: string; prefix: string; created_at: string; last_used_at: string | null; revoked_at: string | null }>(
    sql`SELECT id, name, prefix, created_at, last_used_at, revoked_at FROM scim_tokens WHERE org_id = ${ctx.orgId} ORDER BY created_at DESC`,
  );
}

export async function revokeScimToken(ctx: OrgContext, id: string) {
  assertAdmin(ctx);
  const r = await q(sql`UPDATE scim_tokens SET revoked_at = now() WHERE id = ${id} AND org_id = ${ctx.orgId} AND revoked_at IS NULL RETURNING id`);
  if (!r.length) throw new NotFoundError("Token not found");
  await recordAudit({ orgId: ctx.orgId, actor: ctx.userId, action: "scim.token.revoke", target: id });
}

export async function scimUsersSummary(ctx: OrgContext) {
  const [r] = await q<{ active: number; inactive: number }>(sql`SELECT count(*) FILTER (WHERE active)::int AS active, count(*) FILTER (WHERE NOT active)::int AS inactive FROM scim_users WHERE org_id = ${ctx.orgId}`);
  return r ?? { active: 0, inactive: 0 };
}

/* ------------------------------------------------------------------ */
/* Protocol                                                            */
/* ------------------------------------------------------------------ */

export type ScimRequest = { method: string; path: string; query: URLSearchParams; body: unknown; authorization: string | null; baseUrl: string };
export type ScimResponse = { status: number; body?: unknown; headers?: Record<string, string> };

class ScimError extends Error {
  constructor(
    public status: number,
    message: string,
    public scimType?: string,
  ) {
    super(message);
  }
}

const err = (e: ScimError): ScimResponse => ({ status: e.status, body: { schemas: [ERROR_SCHEMA], status: String(e.status), detail: e.message, ...(e.scimType ? { scimType: e.scimType } : {}) } });

async function authenticate(authorization: string | null): Promise<{ orgId: string; tokenId: string }> {
  const token = authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token?.startsWith("scim_")) throw new ScimError(401, "Missing or invalid bearer token");
  const [t] = await q<{ id: string; org_id: string }>(sql`SELECT id, org_id FROM scim_tokens WHERE hash = ${sha(token)} AND revoked_at IS NULL`);
  if (!t) throw new ScimError(401, "Missing or invalid bearer token");
  void q(sql`UPDATE scim_tokens SET last_used_at = now() WHERE id = ${t.id}`);
  return { orgId: t.org_id, tokenId: t.id };
}

type ScimUserRow = { id: string; user_id: string; external_id: string | null; user_name: string; display_name: string | null; active: boolean; role: string; created_at: Date | string; updated_at: Date | string; name: string; email: string };

const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());

function toResource(r: ScimUserRow, baseUrl: string) {
  const [given, ...rest] = (r.display_name ?? r.name ?? "").split(" ");
  return {
    schemas: [USER_SCHEMA],
    id: r.id,
    externalId: r.external_id ?? undefined,
    userName: r.user_name,
    displayName: r.display_name ?? r.name,
    name: { formatted: r.display_name ?? r.name, givenName: given || undefined, familyName: rest.join(" ") || undefined },
    emails: [{ value: r.email, primary: true, type: "work" }],
    active: r.active,
    roles: [{ value: r.role, primary: true }],
    meta: { resourceType: "User", created: iso(r.created_at), lastModified: iso(r.updated_at), location: `${baseUrl}/Users/${r.id}`, version: `W/"${Date.parse(iso(r.updated_at))}"` },
  };
}

async function loadUser(orgId: string, id: string): Promise<ScimUserRow> {
  const [r] = await q<ScimUserRow>(sql`SELECT s.*, u.name, u.email FROM scim_users s JOIN "user" u ON u.id = s.user_id WHERE s.org_id = ${orgId} AND s.id = ${id}`);
  if (!r) throw new ScimError(404, `User ${id} not found`);
  return r;
}

type Incoming = { userName?: string; externalId?: string; displayName?: string; name?: { formatted?: string; givenName?: string; familyName?: string }; emails?: { value?: string; primary?: boolean }[]; active?: boolean; roles?: { value?: string }[] };

function parseUser(body: unknown) {
  const b = (body ?? {}) as Incoming;
  const email = (b.emails?.find((e) => e.primary)?.value ?? b.emails?.[0]?.value ?? b.userName ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ScimError(400, "userName (or a primary e-mail) must be an e-mail address", "invalidValue");
  const display = (b.displayName ?? b.name?.formatted ?? [b.name?.givenName, b.name?.familyName].filter(Boolean).join(" ")).trim() || email.split("@")[0]!;
  const role = (b.roles ?? []).map((r) => String(r.value ?? "").toLowerCase()).find((r): r is (typeof ROLES)[number] => (ROLES as readonly string[]).includes(r)) ?? "member";
  return { userName: (b.userName ?? email).trim().toLowerCase(), email, display: display.slice(0, 160), externalId: b.externalId?.slice(0, 200) ?? null, active: b.active !== false, role };
}

async function setMembership(orgId: string, userId: string, active: boolean, role: string) {
  if (active) {
    const [m] = await q<{ id: string }>(sql`SELECT id FROM member WHERE organization_id = ${orgId} AND user_id = ${userId}`);
    if (m) await q(sql`UPDATE member SET role = CASE WHEN role = 'owner' THEN role ELSE ${role} END WHERE id = ${m.id}`);
    else {
      try {
        await assertSeatAvailable(orgId);
      } catch (e) {
        if (e instanceof SeatLimitError) throw new ScimError(409, e.message);
        throw e;
      }
      await q(sql`INSERT INTO member (id, organization_id, user_id, role) VALUES (${randomUUID().replace(/-/g, "").slice(0, 24)}, ${orgId}, ${userId}, ${role})`);
    }
  } else {
    // Never remove the last owner through SCIM.
    await q(sql`DELETE FROM member WHERE organization_id = ${orgId} AND user_id = ${userId} AND role <> 'owner'`);
    const [other] = await q(sql`SELECT 1 FROM member WHERE user_id = ${userId} LIMIT 1`);
    if (!other) await q(sql`DELETE FROM session WHERE user_id = ${userId}`);
    else await q(sql`UPDATE session SET active_organization_id = NULL WHERE user_id = ${userId} AND active_organization_id = ${orgId}`);
  }
}

async function upsertUser(orgId: string, tokenId: string, p: ReturnType<typeof parseUser>, existingId?: string): Promise<ScimUserRow> {
  let userId: string;
  const [u] = await q<{ id: string }>(sql`SELECT id FROM "user" WHERE lower(email) = ${p.email}`);
  if (u) userId = u.id;
  else {
    userId = randomUUID().replace(/-/g, "").slice(0, 24);
    // The IdP vouches for the address; the user signs in through SSO (or resets a password).
    await q(sql`INSERT INTO "user" (id, name, email, email_verified) VALUES (${userId}, ${p.display}, ${p.email}, true)`);
  }
  let id = existingId;
  if (!id) {
    const [dupe] = await q<{ id: string }>(sql`SELECT id FROM scim_users WHERE org_id = ${orgId} AND (user_name = ${p.userName} OR user_id = ${userId} OR (external_id IS NOT NULL AND external_id = ${p.externalId}))`);
    if (dupe) throw new ScimError(409, "User already exists", "uniqueness");
    id = randomUUID();
    await q(sql`INSERT INTO scim_users (id, org_id, user_id, external_id, user_name, display_name, active, role) VALUES (${id}, ${orgId}, ${userId}, ${p.externalId}, ${p.userName}, ${p.display}, ${p.active}, ${p.role})`);
  } else {
    await q(sql`UPDATE scim_users SET user_id = ${userId}, external_id = COALESCE(${p.externalId}, external_id), user_name = ${p.userName}, display_name = ${p.display},
      active = ${p.active}, role = ${p.role}, updated_at = now() WHERE id = ${id} AND org_id = ${orgId}`);
  }
  await setMembership(orgId, userId, p.active, p.role);
  await recordAudit({ orgId, actor: tokenId, actorType: "scim", action: existingId ? "scim.user.update" : "scim.user.create", target: p.email, metadata: { active: p.active, role: p.role } });
  return loadUser(orgId, id);
}

/** RFC 7644 §3.5.2 PatchOp, the subset IdPs send: replace/add of active, name, displayName, emails, roles, externalId, userName. */
function applyPatch(current: ReturnType<typeof parseUser>, body: unknown) {
  const b = (body ?? {}) as { schemas?: string[]; Operations?: { op?: string; path?: string; value?: unknown }[] };
  if (!b.schemas?.includes(PATCH_SCHEMA) || !Array.isArray(b.Operations)) throw new ScimError(400, "Expected a PatchOp", "invalidSyntax");
  const next = { ...current };
  const set = (path: string, value: unknown) => {
    const p = path.toLowerCase();
    if (p === "active") next.active = value === true || value === "true" || value === "True";
    else if (p === "displayname" || p === "name.formatted") next.display = String(value).slice(0, 160);
    else if (p === "name.givenname") next.display = `${String(value)} ${next.display.split(" ").slice(1).join(" ")}`.trim();
    else if (p === "name.familyname") next.display = `${next.display.split(" ")[0] ?? ""} ${String(value)}`.trim();
    else if (p === "externalid") next.externalId = String(value);
    else if (p === "username") next.userName = String(value).toLowerCase();
    else if (p.startsWith("emails")) {
      const v = Array.isArray(value) ? (value[0] as { value?: string })?.value : typeof value === "string" ? value : (value as { value?: string })?.value;
      if (v) next.email = v.toLowerCase();
    } else if (p.startsWith("roles")) {
      const v = Array.isArray(value) ? (value[0] as { value?: string })?.value : typeof value === "string" ? value : (value as { value?: string })?.value;
      const r = String(v ?? "").toLowerCase();
      if ((ROLES as readonly string[]).includes(r)) next.role = r as (typeof ROLES)[number];
    }
  };
  for (const op of b.Operations) {
    const kind = (op.op ?? "").toLowerCase();
    if (kind === "remove") {
      if ((op.path ?? "").toLowerCase().startsWith("roles")) next.role = "member";
      continue;
    }
    if (kind !== "replace" && kind !== "add") throw new ScimError(400, `Unsupported op ${op.op}`, "invalidSyntax");
    if (op.path) set(op.path, op.value);
    else if (op.value && typeof op.value === "object") for (const [k, v] of Object.entries(op.value as Record<string, unknown>)) {
      if (k === "name" && v && typeof v === "object") for (const [nk, nv] of Object.entries(v)) set(`name.${nk}`, nv);
      else set(k, v);
    }
  }
  return next;
}

const fromRow = (r: ScimUserRow) => ({ userName: r.user_name, email: r.email, display: r.display_name ?? r.name, externalId: r.external_id, active: r.active, role: r.role as (typeof ROLES)[number] });

/** `filter=userName eq "x"` / `externalId eq "x"` / `emails.value eq "x"` (what Okta, Entra and OneLogin send). */
function parseFilter(f: string | null): { field: "user_name" | "external_id" | "email"; value: string } | null {
  if (!f) return null;
  const m = f.match(/^\s*(userName|externalId|emails(?:\.value)?|emails\[type eq "work"\]\.value)\s+eq\s+"([^"]*)"\s*$/i);
  if (!m) throw new ScimError(400, "Only `userName eq`, `externalId eq` and `emails.value eq` filters are supported", "invalidFilter");
  const field = m[1]!.toLowerCase() === "username" ? "user_name" : m[1]!.toLowerCase() === "externalid" ? "external_id" : "email";
  return { field, value: field === "external_id" ? m[2]! : m[2]!.toLowerCase() };
}

function discovery(path: string, baseUrl: string): ScimResponse | null {
  if (path === "/ServiceProviderConfig")
    return {
      status: 200,
      body: {
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
        patch: { supported: true },
        bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
        filter: { supported: true, maxResults: 200 },
        changePassword: { supported: false },
        sort: { supported: false },
        etag: { supported: false },
        authenticationSchemes: [{ type: "oauthbearertoken", name: "Bearer token", description: "Workspace SCIM token from Settings → Security", primary: true }],
        meta: { resourceType: "ServiceProviderConfig", location: `${baseUrl}/ServiceProviderConfig` },
      },
    };
  if (path === "/ResourceTypes")
    return { status: 200, body: { schemas: [LIST_SCHEMA], totalResults: 1, Resources: [{ schemas: ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"], id: "User", name: "User", endpoint: "/Users", schema: USER_SCHEMA, meta: { resourceType: "ResourceType", location: `${baseUrl}/ResourceTypes/User` } }] } };
  if (path === "/Schemas")
    return {
      status: 200,
      body: {
        schemas: [LIST_SCHEMA],
        totalResults: 1,
        Resources: [{
          id: USER_SCHEMA,
          name: "User",
          attributes: ["userName", "externalId", "displayName", "name", "emails", "active", "roles"].map((n) => ({ name: n, type: ["name", "emails", "roles"].includes(n) ? "complex" : n === "active" ? "boolean" : "string", mutability: "readWrite", returned: "default", uniqueness: n === "userName" ? "server" : "none", required: n === "userName" })),
          meta: { resourceType: "Schema", location: `${baseUrl}/Schemas/${USER_SCHEMA}` },
        }],
      },
    };
  return null;
}

export async function handleScim(req: ScimRequest): Promise<ScimResponse> {
  try {
    const path = req.path.replace(/\/+$/, "") || "/";
    const auth = await authenticate(req.authorization);
    const d = discovery(path, req.baseUrl);
    if (d) return d;
    if (path.startsWith("/Groups")) throw new ScimError(501, "Groups are not supported; assign users to the app instead");
    const m = path.match(/^\/Users(?:\/([0-9a-f-]{36}))?$/i);
    if (!m) throw new ScimError(404, "Unknown resource");
    const id = m[1];
    const method = req.method.toUpperCase();
    if (!id && method === "GET") {
      const f = parseFilter(req.query.get("filter"));
      const start = Math.max(1, Number(req.query.get("startIndex") ?? 1) || 1);
      const count = Math.min(200, Math.max(0, Number(req.query.get("count") ?? 100) || 0));
      const where = f ? (f.field === "email" ? sql`AND lower(u.email) = ${f.value}` : f.field === "user_name" ? sql`AND s.user_name = ${f.value}` : sql`AND s.external_id = ${f.value}`) : sql``;
      const [{ n } = { n: 0 }] = await q<{ n: number }>(sql`SELECT count(*)::int AS n FROM scim_users s JOIN "user" u ON u.id = s.user_id WHERE s.org_id = ${auth.orgId} ${where}`);
      const rows = await q<ScimUserRow>(sql`SELECT s.*, u.name, u.email FROM scim_users s JOIN "user" u ON u.id = s.user_id WHERE s.org_id = ${auth.orgId} ${where}
        ORDER BY s.created_at, s.id OFFSET ${start - 1} LIMIT ${count}`);
      return { status: 200, body: { schemas: [LIST_SCHEMA], totalResults: n, startIndex: start, itemsPerPage: rows.length, Resources: rows.map((r) => toResource(r, req.baseUrl)) } };
    }
    if (!id && method === "POST") return { status: 201, body: toResource(await upsertUser(auth.orgId, auth.tokenId, parseUser(req.body)), req.baseUrl) };
    if (!id) throw new ScimError(405, "Method not allowed");
    const current = await loadUser(auth.orgId, id);
    if (method === "GET") return { status: 200, body: toResource(current, req.baseUrl) };
    if (method === "PUT") return { status: 200, body: toResource(await upsertUser(auth.orgId, auth.tokenId, parseUser(req.body), id), req.baseUrl) };
    if (method === "PATCH") return { status: 200, body: toResource(await upsertUser(auth.orgId, auth.tokenId, applyPatch(fromRow(current), req.body), id), req.baseUrl) };
    if (method === "DELETE") {
      await setMembership(auth.orgId, current.user_id, false, current.role);
      await q(sql`DELETE FROM scim_users WHERE id = ${id} AND org_id = ${auth.orgId}`);
      await recordAudit({ orgId: auth.orgId, actor: auth.tokenId, actorType: "scim", action: "scim.user.delete", target: current.email });
      return { status: 204 };
    }
    throw new ScimError(405, "Method not allowed");
  } catch (e) {
    if (e instanceof ScimError) return err(e);
    throw e;
  }
}
