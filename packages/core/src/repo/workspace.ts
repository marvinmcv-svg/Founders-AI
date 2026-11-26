/**
 * Org-scoped repository (plan 8 tenancy note). Every function takes an OrgContext and adds
 * `org_id = ctx.orgId`. Cross-org access must be impossible through these functions — see
 * repo/workspace.test.ts.
 */
import { sql } from "drizzle-orm";
import { newId } from "../ids";
import { emptyFilter, groupSchema, type Group, type Product } from "../filters/ast";
import type { SortSpec } from "../filters/compile";
import { validateFilter } from "../filters/validate";
import { getRowsByIds, rawQuery as q, searchEntities, type Row } from "./entities";

export type Role = "owner" | "admin" | "member" | "viewer";
export type OrgContext = { orgId: string; userId: string; role: Role };

export class ForbiddenError extends Error {
  constructor(message = "Not allowed") {
    super(message);
    this.name = "ForbiddenError";
  }
}
export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export function canWrite(ctx: OrgContext) {
  return ctx.role !== "viewer";
}
function assertWrite(ctx: OrgContext) {
  if (!canWrite(ctx)) throw new ForbiddenError("Viewers cannot change workspace data");
}

/* ------------------------------------------------------------------ */
/* Memberships                                                         */
/* ------------------------------------------------------------------ */

export function getMemberships(userId: string) {
  return q<{ org_id: string; name: string; slug: string; role: Role; logo: string | null; plan: string; thesis: unknown }>(
    sql`SELECT o.id AS org_id, o.name, o.slug, m.role, o.logo, o.plan, o.thesis FROM member m JOIN organization o ON o.id = m.organization_id
        WHERE m.user_id = ${userId} ORDER BY o.created_at ASC`,
  );
}

export async function getOrg(ctx: OrgContext) {
  const [o] = await q(sql`SELECT * FROM organization WHERE id = ${ctx.orgId}`);
  return o ?? null;
}

export async function updateThesis(ctx: OrgContext, thesis: Record<string, unknown>) {
  assertWrite(ctx);
  await q(sql`UPDATE organization SET thesis = ${JSON.stringify(thesis)}::jsonb WHERE id = ${ctx.orgId}`);
}

export function getMembers(ctx: OrgContext) {
  return q(sql`SELECT u.id, u.name, u.email, m.role, m.created_at FROM member m JOIN "user" u ON u.id = m.user_id
    WHERE m.organization_id = ${ctx.orgId} ORDER BY m.created_at`);
}

/* ------------------------------------------------------------------ */
/* Lists                                                               */
/* ------------------------------------------------------------------ */

export type EntityType = "COMPANY" | "PERSON" | "INVESTOR";
export const ENTITY_PRODUCT: Record<EntityType, Product> = { COMPANY: "companies", PERSON: "people", INVESTOR: "investors" };

const visible = (ctx: OrgContext) => sql`(l.visibility = 'TEAM' OR l.owner_id = ${ctx.userId})`;

export function getLists(ctx: OrgContext, entityType?: EntityType) {
  return q<{ id: string; name: string; entity_type: EntityType; visibility: string; system: string | null; owner_id: string; owner_name: string; created_at: string; item_count: number }>(
    sql`SELECT l.id, l.name, l.entity_type, l.visibility, l.system, l.owner_id, u.name AS owner_name, l.created_at,
          (SELECT count(*)::int FROM list_items li WHERE li.list_id = l.id) AS item_count
        FROM lists l LEFT JOIN "user" u ON u.id = l.owner_id
        WHERE l.org_id = ${ctx.orgId} AND l.deleted_at IS NULL AND ${visible(ctx)}
          ${entityType ? sql`AND l.entity_type = ${entityType}` : sql``}
        ORDER BY l.system NULLS LAST, l.created_at DESC`,
  );
}

export async function getList(ctx: OrgContext, listId: string) {
  const [l] = await q<{ id: string; name: string; entity_type: EntityType; visibility: string; owner_id: string; system: string | null; created_at: string }>(
    sql`SELECT l.* FROM lists l WHERE l.id = ${listId} AND l.org_id = ${ctx.orgId} AND l.deleted_at IS NULL AND ${visible(ctx)}`,
  );
  if (!l) throw new NotFoundError("List not found");
  return l;
}

export async function createList(ctx: OrgContext, input: { name: string; entityType: EntityType; visibility?: "PRIVATE" | "TEAM" }) {
  assertWrite(ctx);
  const id = newId("list");
  await q(sql`INSERT INTO lists (id, org_id, owner_id, name, entity_type, visibility)
    VALUES (${id}, ${ctx.orgId}, ${ctx.userId}, ${input.name.slice(0, 120)}, ${input.entityType}, ${input.visibility ?? "TEAM"})`);
  return getList(ctx, id);
}

export async function updateList(ctx: OrgContext, listId: string, input: { name?: string; visibility?: "PRIVATE" | "TEAM" }) {
  assertWrite(ctx);
  await getList(ctx, listId);
  await q(sql`UPDATE lists SET name = COALESCE(${input.name ?? null}, name), visibility = COALESCE(${input.visibility ?? null}, visibility)
    WHERE id = ${listId} AND org_id = ${ctx.orgId}`);
  return getList(ctx, listId);
}

export async function deleteList(ctx: OrgContext, listId: string) {
  assertWrite(ctx);
  const l = await getList(ctx, listId);
  if (l.system) throw new ForbiddenError("System lists cannot be deleted");
  await q(sql`UPDATE lists SET deleted_at = now() WHERE id = ${listId} AND org_id = ${ctx.orgId}`);
}

export async function addToList(ctx: OrgContext, listId: string, entityIds: string[]) {
  assertWrite(ctx);
  const l = await getList(ctx, listId);
  const ids = [...new Set(entityIds)].slice(0, 5000);
  if (!ids.length) return 0;
  const table = l.entity_type === "COMPANY" ? "companies" : l.entity_type === "PERSON" ? "people" : "investors";
  const valid = await q<{ id: string }>(sql`SELECT id FROM ${sql.raw(table)} WHERE id IN (${sql.join(ids.map((x) => sql`${x}`), sql`, `)})`);
  for (const { id } of valid) {
    await q(sql`INSERT INTO list_items (list_id, entity_type, entity_id, added_by) VALUES (${listId}, ${l.entity_type}, ${id}, ${ctx.userId})
      ON CONFLICT DO NOTHING`);
  }
  return valid.length;
}

export async function removeFromList(ctx: OrgContext, listId: string, entityIds: string[]) {
  assertWrite(ctx);
  await getList(ctx, listId);
  if (!entityIds.length) return 0;
  const res = await q(sql`DELETE FROM list_items WHERE list_id = ${listId} AND entity_id IN (${sql.join(entityIds.map((x) => sql`${x}`), sql`, `)}) RETURNING entity_id`);
  return res.length;
}

export async function getListItems(ctx: OrgContext, listId: string, opts: { limit?: number; offset?: number } = {}) {
  const l = await getList(ctx, listId);
  const items = await q<{ entity_id: string; status: string | null; note: string | null; added_at: string }>(
    sql`SELECT entity_id, status, note, created_at AS added_at FROM list_items WHERE list_id = ${listId} ORDER BY created_at DESC
        LIMIT ${opts.limit ?? 500} OFFSET ${opts.offset ?? 0}`,
  );
  const [{ n } = { n: 0 }] = await q<{ n: number }>(sql`SELECT count(*)::int AS n FROM list_items WHERE list_id = ${listId}`);
  const rows = await getRowsByIds(ENTITY_PRODUCT[l.entity_type], items.map((i) => i.entity_id));
  const meta = new Map(items.map((i) => [i.entity_id, i]));
  return { list: l, total: n, rows: rows.map((r): Row => ({ ...r, _list: meta.get(String(r.id)) })) };
}

export function getListsContaining(ctx: OrgContext, entityId: string) {
  return q<{ id: string; name: string }>(sql`SELECT l.id, l.name FROM list_items li JOIN lists l ON l.id = li.list_id
    WHERE li.entity_id = ${entityId} AND l.org_id = ${ctx.orgId} AND l.deleted_at IS NULL AND ${visible(ctx)}`);
}

/* ------------------------------------------------------------------ */
/* Saved searches                                                      */
/* ------------------------------------------------------------------ */

export type SavedSearch = {
  id: string;
  name: string;
  product: Product;
  filter_ast: Group;
  nl_query: string | null;
  sort: SortSpec | null;
  visibility: string;
  alert_cadence: string;
  channels?: string[] | null;
  owner_id: string;
  owner_name?: string;
  created_at: string;
  new_results?: number;
  total_results?: number;
};

const visibleSearch = (ctx: OrgContext) => sql`(s.visibility = 'TEAM' OR s.owner_id = ${ctx.userId})`;

export function getSavedSearches(ctx: OrgContext, readerId = ctx.userId) {
  return q<SavedSearch>(sql`SELECT s.*, u.name AS owner_name,
      (SELECT count(*)::int FROM search_result_snapshots x WHERE x.search_id = s.id) AS total_results,
      (SELECT count(*)::int FROM search_result_snapshots x WHERE x.search_id = s.id AND x.first_seen_at >
         COALESCE((SELECT r.last_read_at FROM search_reads r WHERE r.search_id = s.id AND r.reader_id = ${readerId}), s.created_at)) AS new_results
    FROM saved_searches s LEFT JOIN "user" u ON u.id = s.owner_id
    WHERE s.org_id = ${ctx.orgId} AND s.deleted_at IS NULL AND ${visibleSearch(ctx)}
    ORDER BY s.created_at DESC`);
}

export async function getSavedSearch(ctx: OrgContext, searchId: string) {
  const [s] = await q<SavedSearch>(sql`SELECT s.* FROM saved_searches s WHERE s.id = ${searchId} AND s.org_id = ${ctx.orgId}
    AND s.deleted_at IS NULL AND ${visibleSearch(ctx)}`);
  if (!s) throw new NotFoundError("Saved search not found");
  return s;
}

export type SavedSearchInput = {
  name: string;
  product: Product;
  filter: Group;
  nlQuery?: string | null;
  sort?: SortSpec | null;
  visibility?: "PRIVATE" | "TEAM";
  alertCadence?: "OFF" | "REALTIME" | "DAILY" | "WEEKLY";
  channels?: AlertChannel[];
};

export const ALERT_CHANNELS = ["in_app", "email", "slack", "crm"] as const;
export type AlertChannel = (typeof ALERT_CHANNELS)[number];

export async function createSavedSearch(ctx: OrgContext, input: SavedSearchInput) {
  assertWrite(ctx);
  const v = validateFilter(input.product, input.filter);
  if (!v.ok) throw new Error(`Invalid filter: ${v.issues.map((i) => i.message).join("; ")}`);
  const id = newId("search");
  await q(sql`INSERT INTO saved_searches (id, org_id, owner_id, name, product, filter_ast, nl_query, sort, visibility, alert_cadence, channels)
    VALUES (${id}, ${ctx.orgId}, ${ctx.userId}, ${input.name.slice(0, 120)}, ${input.product}, ${JSON.stringify(v.filter)}::jsonb,
      ${input.nlQuery ?? null}, ${input.sort ? JSON.stringify(input.sort) : null}::jsonb, ${input.visibility ?? "TEAM"},
      ${input.alertCadence ?? "DAILY"}, ${JSON.stringify(["in_app", "email"])}::jsonb)`);
  await refreshSavedSearch(ctx, id);
  await markSearchRead(ctx, id);
  return getSavedSearch(ctx, id);
}

export async function updateSavedSearch(ctx: OrgContext, searchId: string, input: Partial<SavedSearchInput>) {
  assertWrite(ctx);
  const s = await getSavedSearch(ctx, searchId);
  let filterJson: string | null = null;
  if (input.filter) {
    const v = validateFilter(s.product, input.filter);
    if (!v.ok) throw new Error(`Invalid filter: ${v.issues.map((i) => i.message).join("; ")}`);
    filterJson = JSON.stringify(v.filter);
  }
  await q(sql`UPDATE saved_searches SET
      name = COALESCE(${input.name ?? null}, name),
      filter_ast = COALESCE(${filterJson}::jsonb, filter_ast),
      visibility = COALESCE(${input.visibility ?? null}, visibility),
      alert_cadence = COALESCE(${input.alertCadence ?? null}, alert_cadence),
      channels = COALESCE(${input.channels ? JSON.stringify(input.channels.filter((c) => (ALERT_CHANNELS as readonly string[]).includes(c))) : null}::jsonb, channels)
    WHERE id = ${searchId} AND org_id = ${ctx.orgId}`);
  if (filterJson) await refreshSavedSearch(ctx, searchId);
  return getSavedSearch(ctx, searchId);
}

export async function deleteSavedSearch(ctx: OrgContext, searchId: string) {
  assertWrite(ctx);
  await getSavedSearch(ctx, searchId);
  await q(sql`UPDATE saved_searches SET deleted_at = now() WHERE id = ${searchId} AND org_id = ${ctx.orgId}`);
}

/** Re-run a saved search and record newly matching entities (first_seen_at = now). */
export async function refreshSavedSearch(ctx: OrgContext, searchId: string) {
  const s = await getSavedSearch(ctx, searchId);
  const filter = groupSchema.safeParse(s.filter_ast).success ? s.filter_ast : emptyFilter();
  const res = await searchEntities(s.product, { filter, limit: 5000, idsOnly: true, orgId: ctx.orgId, sort: s.sort });
  const ids = res.rows.map((r) => String(r.id));
  let added = 0;
  for (let i = 0; i < ids.length; i += 1000) {
    const chunk = ids.slice(i, i + 1000);
    const inserted = await q(sql`INSERT INTO search_result_snapshots (search_id, entity_id)
      SELECT ${searchId}, unnest(${sql`ARRAY[${sql.join(chunk.map((x) => sql`${x}`), sql`, `)}]::text[]`})
      ON CONFLICT DO NOTHING RETURNING entity_id`);
    added += inserted.length;
  }
  await q(sql`UPDATE saved_searches SET last_run_at = now() WHERE id = ${searchId}`);
  return { added, total: res.total };
}

export async function markSearchRead(ctx: OrgContext, searchId: string, readerId = ctx.userId) {
  await getSavedSearch(ctx, searchId);
  await q(sql`INSERT INTO search_reads (search_id, reader_id, last_read_at) VALUES (${searchId}, ${readerId}, now())
    ON CONFLICT (search_id, reader_id) DO UPDATE SET last_read_at = now()`);
}

/** Results feed; `newOnly` = new since this reader last read (plan 7.5). */
export async function getSavedSearchResults(
  ctx: OrgContext,
  searchId: string,
  opts: { newOnly?: boolean; limit?: number; offset?: number; readerId?: string } = {},
): Promise<{ search: SavedSearch; rows: Row[]; total: number; newIds: string[] }> {
  const s = await getSavedSearch(ctx, searchId);
  const readerId = opts.readerId ?? ctx.userId;
  const [read] = await q<{ last_read_at: string }>(sql`SELECT last_read_at FROM search_reads WHERE search_id = ${searchId} AND reader_id = ${readerId}`);
  const since = read?.last_read_at ?? s.created_at;
  const snap = await q<{ entity_id: string; first_seen_at: string }>(sql`SELECT entity_id, first_seen_at FROM search_result_snapshots
    WHERE search_id = ${searchId} ${opts.newOnly ? sql`AND first_seen_at > ${since}` : sql``}
    ORDER BY first_seen_at DESC LIMIT ${opts.limit ?? 100} OFFSET ${opts.offset ?? 0}`);
  const [{ n } = { n: 0 }] = await q<{ n: number }>(sql`SELECT count(*)::int AS n FROM search_result_snapshots WHERE search_id = ${searchId}
    ${opts.newOnly ? sql`AND first_seen_at > ${since}` : sql``}`);
  const sinceMs = new Date(since).getTime();
  const newIds = snap.filter((x) => new Date(x.first_seen_at).getTime() > sinceMs).map((x) => x.entity_id);
  const rows = await getRowsByIds(s.product, snap.map((x) => x.entity_id));
  return { search: s, rows, total: n, newIds };
}

/* ------------------------------------------------------------------ */
/* Statuses, likes, hides, notes                                       */
/* ------------------------------------------------------------------ */

export function getStatuses(ctx: OrgContext) {
  return q<{ id: string; label: string; color: string }>(sql`SELECT id, label, color FROM org_statuses WHERE org_id = ${ctx.orgId} ORDER BY "order"`);
}

export async function setEntityStatus(ctx: OrgContext, entityType: EntityType, entityIds: string[], statusId: string | null) {
  assertWrite(ctx);
  if (statusId) {
    const [s] = await q(sql`SELECT id FROM org_statuses WHERE id = ${statusId} AND org_id = ${ctx.orgId}`);
    if (!s) throw new NotFoundError("Status not found");
  }
  for (const id of entityIds) {
    if (statusId)
      await q(sql`INSERT INTO entity_status (org_id, entity_type, entity_id, status_id, updated_by) VALUES (${ctx.orgId}, ${entityType}, ${id}, ${statusId}, ${ctx.userId})
        ON CONFLICT (org_id, entity_id) DO UPDATE SET status_id = EXCLUDED.status_id, updated_by = EXCLUDED.updated_by, updated_at = now()`);
    else await q(sql`DELETE FROM entity_status WHERE org_id = ${ctx.orgId} AND entity_id = ${id}`);
  }
}

export async function getEntityStatuses(ctx: OrgContext, entityIds: string[]) {
  if (!entityIds.length) return {} as Record<string, { id: string; label: string; color: string }>;
  const rows = await q<{ entity_id: string; id: string; label: string; color: string }>(sql`SELECT es.entity_id, s.id, s.label, s.color
    FROM entity_status es JOIN org_statuses s ON s.id = es.status_id
    WHERE es.org_id = ${ctx.orgId} AND es.entity_id IN (${sql.join(entityIds.map((x) => sql`${x}`), sql`, `)})`);
  return Object.fromEntries(rows.map((r) => [r.entity_id, { id: r.id, label: r.label, color: r.color }]));
}

export async function toggleLike(ctx: OrgContext, entityType: EntityType, entityId: string) {
  const del = await q(sql`DELETE FROM likes WHERE org_id = ${ctx.orgId} AND user_id = ${ctx.userId} AND entity_id = ${entityId} RETURNING entity_id`);
  if (del.length) return false;
  await q(sql`INSERT INTO likes (org_id, user_id, entity_type, entity_id) VALUES (${ctx.orgId}, ${ctx.userId}, ${entityType}, ${entityId})`);
  return true;
}

export async function isLiked(ctx: OrgContext, entityId: string) {
  const r = await q(sql`SELECT 1 FROM likes WHERE org_id = ${ctx.orgId} AND user_id = ${ctx.userId} AND entity_id = ${entityId}`);
  return r.length > 0;
}

export async function toggleHide(ctx: OrgContext, entityType: EntityType, entityId: string) {
  const del = await q(sql`DELETE FROM hides WHERE org_id = ${ctx.orgId} AND user_id = ${ctx.userId} AND entity_id = ${entityId} RETURNING entity_id`);
  if (del.length) return false;
  await q(sql`INSERT INTO hides (org_id, user_id, entity_type, entity_id) VALUES (${ctx.orgId}, ${ctx.userId}, ${entityType}, ${entityId})`);
  return true;
}

export function getNotes(ctx: OrgContext, entityId: string) {
  return q<{ id: string; body: string; author_name: string; created_at: string }>(sql`SELECT n.id, n.body, u.name AS author_name, n.created_at
    FROM notes n LEFT JOIN "user" u ON u.id = n.author_id
    WHERE n.org_id = ${ctx.orgId} AND n.entity_id = ${entityId} AND n.deleted_at IS NULL ORDER BY n.created_at DESC`);
}

export async function addNote(ctx: OrgContext, entityType: EntityType, entityId: string, body: string) {
  assertWrite(ctx);
  const id = newId("note");
  await q(sql`INSERT INTO notes (id, org_id, entity_type, entity_id, author_id, body) VALUES (${id}, ${ctx.orgId}, ${entityType}, ${entityId}, ${ctx.userId}, ${body.slice(0, 5000)})`);
  return id;
}

/* ------------------------------------------------------------------ */
/* Notifications & digests                                             */
/* ------------------------------------------------------------------ */

export function getNotifications(ctx: OrgContext, limit = 30) {
  return q<{ id: string; kind: string; payload: Record<string, unknown>; read_at: string | null; created_at: string }>(
    sql`SELECT id, kind, payload, read_at, created_at FROM notifications WHERE org_id = ${ctx.orgId} AND user_id = ${ctx.userId}
        ORDER BY created_at DESC LIMIT ${limit}`,
  );
}

export async function unreadNotificationCount(ctx: OrgContext) {
  const [r] = await q<{ n: number }>(sql`SELECT count(*)::int AS n FROM notifications WHERE org_id = ${ctx.orgId} AND user_id = ${ctx.userId} AND read_at IS NULL`);
  return r?.n ?? 0;
}

export async function markNotificationsRead(ctx: OrgContext) {
  await q(sql`UPDATE notifications SET read_at = now() WHERE org_id = ${ctx.orgId} AND user_id = ${ctx.userId} AND read_at IS NULL`);
}

export async function notify(ctx: OrgContext, kind: string, payload: Record<string, unknown>, userId = ctx.userId) {
  await q(sql`INSERT INTO notifications (id, org_id, user_id, kind, payload) VALUES (${newId("notification")}, ${ctx.orgId}, ${userId}, ${kind}, ${JSON.stringify(payload)}::jsonb)`);
}

export async function audit(ctx: OrgContext, action: string, target?: string) {
  await q(sql`INSERT INTO audit_log (id, org_id, actor, action, target) VALUES (${newId("event")}, ${ctx.orgId}, ${ctx.userId}, ${action}, ${target ?? null})`);
}
