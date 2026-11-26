"use server";
/**
 * Server actions for the app. Every action resolves the OrgContext from the session first, so
 * org-scoped data always goes through packages/core/repo with ctx (plan 8 tenancy).
 */
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { emptyFilter, groupSchema, PRODUCTS, validateFilter, type Group, type Product } from "@founders/core/filters";
import type { SortSpec } from "@founders/core/filters/compile";
import { nlToQuery, type NlResult } from "@founders/core/nl";
import { CREDIT_PRICES } from "@founders/core/pricing";
import * as repo from "@founders/core/repo";
import { APP_GRID_PAGE_SIZE } from "@founders/core/limits";
import { getCtx, ORG_COOKIE } from "@/lib/session";

export type GridResult = {
  rows: repo.Row[];
  total: number;
  totalCapped: boolean;
  statuses: Record<string, { id: string; label: string; color: string }>;
  /** CRM badges (plan 7.3: "In CRM / Not synced / In but not enriched"); absent = not synced. */
  crm: Record<string, repo.CrmBadge>;
};

function asProduct(p: string): Product {
  if (!(PRODUCTS as readonly string[]).includes(p)) throw new Error("Unknown product");
  return p as Product;
}

export async function runGrid(product: string, filter: Group, sort: SortSpec | null, q: string, offset = 0): Promise<GridResult> {
  const ctx = await getCtx();
  const p = asProduct(product);
  const v = validateFilter(p, filter);
  const res = await repo.searchEntities(p, { filter: v.ok ? v.filter : emptyFilter(), sort, q, offset, limit: APP_GRID_PAGE_SIZE, orgId: ctx.orgId });
  const ids = res.rows.map((r) => String(r.id));
  const [statuses, crm] = await Promise.all([repo.getEntityStatuses(ctx, ids), p === "companies" || p === "people" ? repo.getCrmBadges(ctx, ids) : {}]);
  return { ...res, statuses, crm };
}

export async function nlSearch(text: string, product?: string): Promise<NlResult> {
  await getCtx();
  return nlToQuery(text, product ? asProduct(product) : undefined);
}

export async function saveSearch(input: { name: string; product: string; filter: Group; nlQuery?: string; cadence: "OFF" | "REALTIME" | "DAILY" | "WEEKLY"; visibility: "PRIVATE" | "TEAM"; sort?: SortSpec | null }) {
  const ctx = await getCtx();
  const s = await repo.createSavedSearch(ctx, { name: input.name, product: asProduct(input.product), filter: groupSchema.parse(input.filter), nlQuery: input.nlQuery, alertCadence: input.cadence, visibility: input.visibility, sort: input.sort });
  await repo.audit(ctx, "search.create", s.id);
  revalidatePath("/", "layout");
  return { id: s.id };
}

export async function deleteSearch(id: string) {
  const ctx = await getCtx();
  await repo.deleteSavedSearch(ctx, id);
  revalidatePath("/searches");
}

export async function refreshSearch(id: string) {
  const ctx = await getCtx();
  const r = await repo.refreshSavedSearch(ctx, id);
  if (r.added > 0) {
    const s = await repo.getSavedSearch(ctx, id);
    await repo.notify(ctx, "search.new_results", { searchId: id, name: s.name, count: r.added });
  }
  revalidatePath("/searches");
  return r;
}

export async function markSearchRead(id: string) {
  const ctx = await getCtx();
  await repo.markSearchRead(ctx, id);
  revalidatePath("/", "layout");
}

export async function getMyLists(entityType?: repo.EntityType) {
  const ctx = await getCtx();
  return repo.getLists(ctx, entityType);
}

export async function createList(name: string, entityType: repo.EntityType, ids: string[] = []) {
  const ctx = await getCtx();
  const l = await repo.createList(ctx, { name, entityType });
  if (ids.length) await repo.addToList(ctx, l.id, ids);
  revalidatePath("/", "layout");
  return { id: l.id, name: l.name };
}

export async function addToList(listId: string, ids: string[]) {
  const ctx = await getCtx();
  const n = await repo.addToList(ctx, listId, ids);
  revalidatePath("/lists");
  return n;
}

export async function removeFromList(listId: string, ids: string[]) {
  const ctx = await getCtx();
  const n = await repo.removeFromList(ctx, listId, ids);
  revalidatePath(`/lists/${listId}`);
  return n;
}

export async function deleteList(listId: string) {
  const ctx = await getCtx();
  await repo.deleteList(ctx, listId);
  revalidatePath("/", "layout");
}

export async function setStatus(entityType: repo.EntityType, ids: string[], statusId: string | null) {
  const ctx = await getCtx();
  await repo.setEntityStatus(ctx, entityType, ids, statusId);
}

export async function toggleLike(entityType: repo.EntityType, id: string) {
  const ctx = await getCtx();
  return repo.toggleLike(ctx, entityType, id);
}

export async function toggleHide(entityType: repo.EntityType, id: string) {
  const ctx = await getCtx();
  return repo.toggleHide(ctx, entityType, id);
}

export async function addNote(entityType: repo.EntityType, id: string, body: string) {
  const ctx = await getCtx();
  if (!body.trim()) return;
  await repo.addNote(ctx, entityType, id, body.trim());
  revalidatePath(entityType === "COMPANY" ? `/companies/${id}` : entityType === "PERSON" ? `/people/${id}` : `/investors/${id}`);
}

/** Verified email reveal — costs credits only when an email is returned (plan 7.1b credits UX). */
export async function revealEmail(personId: string) {
  const ctx = await getCtx();
  const emails = await repo.getPersonEmails(personId);
  if (!emails.length) return { emails: [], charged: 0, remaining: await repo.getBalance(ctx.orgId) };
  try {
    const r = await repo.charge({ orgId: ctx.orgId, actorType: "user", actorId: ctx.userId, surface: "APP", operation: "people.email", credits: CREDIT_PRICES["person.email"], matched: true });
    await repo.audit(ctx, "email.reveal", personId);
    return { emails, charged: r.charged, remaining: r.remaining };
  } catch (e) {
    if (e instanceof repo.InsufficientCreditsError) return { error: e.message, emails: [], charged: 0, remaining: e.balance };
    throw e;
  }
}

export async function creditBalance() {
  const ctx = await getCtx();
  return repo.getBalance(ctx.orgId);
}

export async function quickSearch(term: string) {
  const ctx = await getCtx();
  const [hits, lists, searches] = await Promise.all([repo.quickSearch(term, 5), repo.getLists(ctx), repo.getSavedSearches(ctx)]);
  const t = term.toLowerCase();
  return {
    hits,
    lists: lists.filter((l) => l.name.toLowerCase().includes(t)).slice(0, 4).map((l) => ({ id: l.id, name: l.name })),
    searches: searches.filter((s) => s.name.toLowerCase().includes(t)).slice(0, 4).map((s) => ({ id: s.id, name: s.name })),
  };
}

export async function switchOrg(orgId: string) {
  const ctx = await getCtx();
  if (!ctx.orgs.some((o) => o.id === orgId)) throw new Error("Not a member of that workspace");
  (await cookies()).set(ORG_COOKIE, orgId, { httpOnly: true, sameSite: "lax", path: "/" });
  revalidatePath("/", "layout");
}

export async function markNotificationsRead() {
  const ctx = await getCtx();
  await repo.markNotificationsRead(ctx);
  revalidatePath("/", "layout");
}

export async function createApiKey(name: string) {
  const ctx = await getCtx();
  const k = await repo.createApiKey(ctx, name);
  await repo.audit(ctx, "api_key.create", k.id);
  revalidatePath("/settings");
  return k;
}

export async function setApiKeyStatus(id: string, status: "ACTIVE" | "REVOKED") {
  const ctx = await getCtx();
  await repo.setApiKeyStatus(ctx, id, status);
  await repo.audit(ctx, `api_key.${status.toLowerCase()}`, id);
  revalidatePath("/settings");
}

export async function saveThesis(thesis: Record<string, unknown>, createSearches: boolean) {
  const ctx = await getCtx();
  await repo.updateThesis(ctx, thesis);
  if (createSearches) {
    const children: Group["children"] = [];
    const sectors = Array.isArray(thesis.sectors) ? (thesis.sectors as string[]) : [];
    const stages = Array.isArray(thesis.stages) ? (thesis.stages as string[]) : [];
    const geos = Array.isArray(thesis.geographies) ? (thesis.geographies as string[]) : [];
    if (sectors.length) children.push({ kind: "condition", field: "sector", operator: "any_of", value: sectors });
    if (stages.length) children.push({ kind: "condition", field: "growth_stage", operator: "any_of", value: stages });
    if (geos.length) children.push({ kind: "condition", field: "hq_region", operator: "any_of", value: geos });
    if (children.length) {
      await repo.createSavedSearch(ctx, { name: "My thesis", product: "companies", filter: { kind: "group", op: "AND", children }, alertCadence: "DAILY" });
      await repo.createSavedSearch(ctx, {
        name: "My thesis — fast growers",
        product: "companies",
        filter: { kind: "group", op: "AND", children: [...children, { kind: "condition", field: "headcount_growth_3m", operator: "gte", value: 15 }] },
        alertCadence: "WEEKLY",
      });
    }
  }
  revalidatePath("/", "layout");
}

export async function sendDigestNow() {
  const ctx = await getCtx();
  const d = await repo.sendDigest(ctx, "DAILY");
  revalidatePath("/settings");
  return { total: d.total };
}

export async function inviteMember(email: string, role: "member" | "admin" | "viewer") {
  const ctx = await getCtx();
  if (ctx.role !== "admin" && ctx.role !== "owner") throw new Error("Only admins can invite");
  const { auth } = await import("@/lib/auth");
  const { headers } = await import("next/headers");
  const inv = await auth.api.createInvitation({ body: { email, role: role === "viewer" ? "member" : role, organizationId: ctx.orgId }, headers: await headers() });
  await repo.audit(ctx, "member.invite", email);
  return { id: inv.id, link: `/signup?invite=${inv.id}&email=${encodeURIComponent(email)}` };
}

/* ---------------- Alerts & integrations (Phase 4) ---------------- */

export async function updateSearchAlerts(id: string, cadence: "OFF" | "REALTIME" | "DAILY" | "WEEKLY", channels: repo.AlertChannel[]) {
  const ctx = await getCtx();
  await repo.updateSavedSearch(ctx, id, { alertCadence: cadence, channels });
  await repo.audit(ctx, "saved_search.alerts", id);
  revalidatePath(`/searches/${id}`);
  revalidatePath("/searches");
}

export async function connectSlack(url: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCtx();
  try {
    await repo.setSlackWebhook(ctx, url.trim());
    await repo.audit(ctx, "integration.slack.connect");
    revalidatePath("/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the webhook" };
  }
}

export async function testSlackConnection(): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCtx();
  try {
    await repo.testSlack(ctx);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Slack test failed" };
  }
}

export async function disconnectSlack() {
  const ctx = await getCtx();
  await repo.removeIntegration(ctx, "SLACK");
  await repo.audit(ctx, "integration.slack.disconnect");
  revalidatePath("/settings");
}
