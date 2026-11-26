/**
 * Alerts (plan 7.5, 7.11): real-time saved-search alerts from the outbox, delivery to in-app / email /
 * Slack, Slack integration management, and the digest scheduler.
 *
 * Tenancy: the processor runs platform-wide, but every saved search is evaluated with an OrgContext
 * built from that search's own org and owner, so org-scoped filters (lists) only see that org's data.
 */
import { brand } from "@founders/config";
import { sql } from "drizzle-orm";
import { decryptSecret, encryptSecret, maskUrl } from "../crypto";
import { EgressBlockedError, egressFetch, validateEgressUrl } from "../egress";
import { groupSchema, type Group, type Product } from "../filters/ast";
import { PRODUCT_META } from "../filters/fields";
import { newId } from "../ids";
import { sendDigest } from "./digest";
import { getRowsByIds, rawQuery as q, searchEntities } from "./entities";
import { ForbiddenError, type OrgContext } from "./workspace";
import { enqueueWebhookEvent, orgsSubscribedTo } from "./webhooks";

export const SLACK_HOSTS = ["hooks.slack.com"];

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
const titleOf = (r: Record<string, unknown>) => String(r.name ?? r.full_name ?? r.person_name ?? r.company_name ?? r.target_name ?? r.id);
const subOf = (r: Record<string, unknown>) => String(r.summary ?? r.tagline ?? r.headline ?? r.type ?? "");

function assertAdmin(ctx: OrgContext) {
  if (ctx.role !== "owner" && ctx.role !== "admin") throw new ForbiddenError("Only workspace admins can manage integrations");
}

/* ------------------------------------------------------------------ */
/* Slack integration                                                   */
/* ------------------------------------------------------------------ */

export async function getIntegrations(ctx: OrgContext) {
  const rows = await q<{ id: string; provider: string; secret: string; label: string | null; status: string; created_at: string }>(
    sql`SELECT id, provider, secret, label, status, created_at FROM org_integrations WHERE org_id = ${ctx.orgId}`,
  );
  return rows.map((r) => {
    let target = "…";
    try {
      target = maskUrl(decryptSecret(r.secret));
    } catch {
      target = "(unreadable — re-connect)";
    }
    return { id: r.id, provider: r.provider, label: r.label, status: r.status, created_at: r.created_at, target };
  });
}

/** Stores a Slack incoming-webhook URL (encrypted). The OAuth Slack app replaces this in R3 (H9). */
export async function setSlackWebhook(ctx: OrgContext, url: string, label?: string) {
  assertAdmin(ctx);
  validateEgressUrl(url, { allowHosts: SLACK_HOSTS });
  if (!/^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+$/.test(url)) throw new EgressBlockedError("Expected a Slack incoming webhook URL (https://hooks.slack.com/services/…)");
  await q(sql`INSERT INTO org_integrations (id, org_id, provider, label, secret, created_by)
    VALUES (${newId("integration")}, ${ctx.orgId}, 'SLACK', ${label ?? null}, ${encryptSecret(url)}, ${ctx.userId})
    ON CONFLICT (org_id, provider) DO UPDATE SET secret = EXCLUDED.secret, label = EXCLUDED.label, status = 'ACTIVE', created_by = EXCLUDED.created_by`);
}

export async function removeIntegration(ctx: OrgContext, provider: "SLACK") {
  assertAdmin(ctx);
  await q(sql`DELETE FROM org_integrations WHERE org_id = ${ctx.orgId} AND provider = ${provider}`);
}

async function slackUrl(orgId: string): Promise<string | null> {
  const [r] = await q<{ secret: string }>(sql`SELECT secret FROM org_integrations WHERE org_id = ${orgId} AND provider = 'SLACK' AND status = 'ACTIVE'`);
  return r ? decryptSecret(r.secret) : null;
}

export type Poster = (url: string, body: string) => Promise<{ status: number }>;
/** Default poster: the SSRF-safe egress module, Slack hosts only. Tests inject their own. */
const egressPoster: Poster = (url, body) => egressFetch(url, { method: "POST", headers: { "content-type": "application/json" }, body }, { allowHosts: SLACK_HOSTS, timeoutMs: 5000 });

export function slackMessage(searchName: string, product: Product, count: number, items: { title: string; sub: string }[], link: string) {
  return {
    text: `${count} new ${PRODUCT_META[product].label.toLowerCase()} in "${searchName}"`,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `*${esc(searchName)}* · <${link}|+${count} new ${esc(PRODUCT_META[product].label.toLowerCase())}>` } },
      ...items.slice(0, 5).map((i) => ({ type: "section", text: { type: "mrkdwn", text: `*${esc(i.title)}*${i.sub ? `\n${esc(i.sub.slice(0, 200))}` : ""}` } })),
      { type: "context", elements: [{ type: "mrkdwn", text: `${esc(brand.name)} real-time alert` }] },
    ],
  };
}

export async function testSlack(ctx: OrgContext, post: Poster = egressPoster) {
  assertAdmin(ctx);
  const url = await slackUrl(ctx.orgId);
  if (!url) throw new Error("Slack is not connected");
  const res = await post(url, JSON.stringify({ text: `${brand.name}: Slack alerts are connected for this workspace.` }));
  if (res.status >= 300) throw new Error(`Slack answered ${res.status}`);
}

/** Posts a plain message to the org's Slack (scheduled agent skills). Returns false when not connected. */
export async function postSlackText(orgId: string, text: string, post: Poster = egressPoster): Promise<boolean> {
  const url = await slackUrl(orgId);
  if (!url) return false;
  const res = await post(url, JSON.stringify({ text: text.slice(0, 3500) }));
  return res.status < 300;
}

/* ------------------------------------------------------------------ */
/* Real-time processing                                                */
/* ------------------------------------------------------------------ */

type SearchRow = { id: string; org_id: string; owner_id: string; name: string; product: Product; filter_ast: Group; sort: null; visibility: string; channels: string[] | null };

async function deliver(s: SearchRow, newIds: string[], post: Poster): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  const rows = await getRowsByIds(s.product, newIds.slice(0, 5));
  const items = rows.map((r) => ({ title: titleOf(r), sub: subOf(r) }));
  const channels = s.channels ?? ["in_app", "email"];
  const link = `${brand.urls.app}/searches/${s.id}`;
  // Recipients: the owner, plus teammates who follow a team search (have opened it).
  const readers = s.visibility === "TEAM"
    ? (await q<{ reader_id: string }>(sql`SELECT r.reader_id FROM search_reads r JOIN member m ON m.user_id = r.reader_id AND m.organization_id = ${s.org_id} WHERE r.search_id = ${s.id}`)).map((r) => r.reader_id)
    : [];
  const recipients = [...new Set([s.owner_id, ...readers])];
  const record = (channel: string, status: string, userId: string | null, error: string | null = null) =>
    q(sql`INSERT INTO alert_deliveries (id, org_id, search_id, user_id, channel, status, item_count, error)
      VALUES (${newId("delivery")}, ${s.org_id}, ${s.id}, ${userId}, ${channel}, ${status}, ${newIds.length}, ${error})`);

  if (channels.includes("in_app")) {
    for (const u of recipients) {
      await q(sql`INSERT INTO notifications (id, org_id, user_id, kind, payload) VALUES (${newId("notification")}, ${s.org_id}, ${u}, 'search.new_results',
        ${JSON.stringify({ searchId: s.id, name: s.name, count: newIds.length, realtime: true, sample: items.slice(0, 3).map((i) => i.title) })}::jsonb)`);
      await record("in_app", "SENT", u);
      bump("in_app");
    }
  }
  if (channels.includes("email")) {
    const key = process.env.RESEND_API_KEY;
    for (const u of recipients) {
      if (!key) {
        await record("email", "STORED", u, "RESEND_API_KEY not set (H3)");
        bump("email_stored");
        continue;
      }
      const [usr] = await q<{ email: string }>(sql`SELECT email FROM "user" WHERE id = ${u}`);
      if (!usr) continue;
      const html = `<p><b>${esc(s.name)}</b>: ${newIds.length} new result(s).</p><ul>${items.map((i) => `<li>${esc(i.title)} — ${esc(i.sub)}</li>`).join("")}</ul><p><a href="${link}">Open search</a></p>`;
      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: `${brand.name} <alerts@${brand.domain}>`, to: usr.email, subject: `${newIds.length} new in "${s.name}"`, html }),
        });
        await record("email", r.ok ? "SENT" : "FAILED", u, r.ok ? null : `Resend ${r.status}`);
        bump(r.ok ? "email" : "email_failed");
      } catch (e) {
        await record("email", "FAILED", u, e instanceof Error ? e.message : String(e));
        bump("email_failed");
      }
    }
  }
  if (channels.includes("slack")) {
    const url = await slackUrl(s.org_id);
    if (!url) {
      await record("slack", "SKIPPED", null, "Slack not connected");
      bump("slack_skipped");
    } else {
      try {
        const res = await post(url, JSON.stringify(slackMessage(s.name, s.product, newIds.length, items, link)));
        await record("slack", res.status < 300 ? "SENT" : "FAILED", null, res.status < 300 ? null : `Slack ${res.status}`);
        bump(res.status < 300 ? "slack" : "slack_failed");
      } catch (e) {
        await record("slack", "FAILED", null, e instanceof Error ? e.message : String(e));
        bump("slack_failed");
      }
    }
  }
  return counts;
}

/**
 * Consume pending outbox events: match new/updated entities against every REALTIME saved search of
 * the same product, record first-seen snapshots and deliver alerts. Idempotent per event batch.
 */
export async function processRealtimeAlerts(opts: { batch?: number; post?: Poster } = {}) {
  const post = opts.post ?? egressPoster;
  const events = await q<{ id: number; product: string; entity_id: string }>(
    sql`SELECT id, product, entity_id FROM outbox_events WHERE alerts_processed_at IS NULL ORDER BY id LIMIT ${opts.batch ?? 20000}`,
  );
  const totals: Record<string, number> = { events: events.length, searches_matched: 0, new_results: 0 };
  if (!events.length) return totals;
  const byProduct = new Map<string, string[]>();
  for (const e of events) byProduct.set(e.product, [...(byProduct.get(e.product) ?? []), e.entity_id]);
  const searches = await q<SearchRow>(sql`SELECT id, org_id, owner_id, name, product, filter_ast, sort, visibility, channels FROM saved_searches
    WHERE deleted_at IS NULL AND alert_cadence = 'REALTIME' AND product IN (${sql.join([...byProduct.keys()].map((p) => sql`${p}`), sql`, `)})`);
  for (const s of searches) {
    const ids = [...new Set(byProduct.get(s.product) ?? [])];
    const parsed = groupSchema.safeParse(s.filter_ast);
    if (!parsed.success || !ids.length) continue;
    const matched: string[] = [];
    for (let i = 0; i < ids.length; i += 2000) {
      const res = await searchEntities(s.product, { filter: parsed.data, ids: ids.slice(i, i + 2000), idsOnly: true, limit: 5000, orgId: s.org_id });
      matched.push(...res.rows.map((r) => String(r.id)));
    }
    if (!matched.length) continue;
    const inserted = await q<{ entity_id: string }>(sql`INSERT INTO search_result_snapshots (search_id, entity_id)
      SELECT ${s.id}, unnest(${sql`ARRAY[${sql.join(matched.map((x) => sql`${x}`), sql`, `)}]::text[]`}) ON CONFLICT DO NOTHING RETURNING entity_id`);
    if (!inserted.length) continue;
    totals.searches_matched = (totals.searches_matched ?? 0) + 1;
    totals.new_results = (totals.new_results ?? 0) + inserted.length;
    const c = await deliver(s, inserted.map((r) => r.entity_id), post);
    for (const [k, v] of Object.entries(c)) totals[`delivered_${k}`] = (totals[`delivered_${k}`] ?? 0) + v;
    totals.webhooks_queued = (totals.webhooks_queued ?? 0) + (await enqueueWebhookEvent(s.org_id, "search.new_results", { search_id: s.id, name: s.name, product: s.product, new_ids: inserted.map((r) => r.entity_id).slice(0, 1000), count: inserted.length }));
  }
  totals.webhooks_queued = (totals.webhooks_queued ?? 0) + (await queueSignalWebhooks(byProduct));
  const maxId = events[events.length - 1]!.id;
  await q(sql`UPDATE outbox_events SET alerts_processed_at = now() WHERE alerts_processed_at IS NULL AND id <= ${maxId}`);
  return totals;
}

/**
 * Webhook producers for the same outbox batch (plan 11 #72): `signal.talent` (new talent signals, to
 * every subscribed org) and `list.news` (news signals about companies on that org's lists).
 * `signal.interest` and `crm.sync` are accepted on subscription but only emitted from R3 (D-031).
 */
async function queueSignalWebhooks(byProduct: Map<string, string[]>): Promise<number> {
  let queued = 0;
  const talentIds = [...new Set(byProduct.get("talent_signals") ?? [])];
  if (talentIds.length) {
    const orgs = await orgsSubscribedTo("signal.talent");
    for (const org of orgs) {
      for (let i = 0; i < talentIds.length; i += 1000) {
        queued += await enqueueWebhookEvent(org, "signal.talent", { product: "talent_signals", signal_ids: talentIds.slice(i, i + 1000) });
      }
    }
  }
  const newsIds = [...new Set(byProduct.get("news_signals") ?? [])];
  if (newsIds.length) {
    const orgs = await orgsSubscribedTo("list.news");
    if (orgs.length) {
      const idArr = sql`ARRAY[${sql.join(newsIds.map((x) => sql`${x}`), sql`, `)}]::text[]`;
      const orgArr = sql`ARRAY[${sql.join(orgs.map((x) => sql`${x}`), sql`, `)}]::text[]`;
      const rows = await q<{ org_id: string; list_id: string; list_name: string; signal_ids: string[] }>(sql`
        SELECT l.org_id, l.id AS list_id, l.name AS list_name, array_agg(DISTINCT n.id) AS signal_ids
        FROM news_signals n JOIN list_items li ON li.entity_id = n.company_id JOIN lists l ON l.id = li.list_id AND l.deleted_at IS NULL
        WHERE n.id = ANY(${idArr}) AND l.org_id = ANY(${orgArr}) GROUP BY l.org_id, l.id, l.name`);
      for (const r of rows) queued += await enqueueWebhookEvent(r.org_id, "list.news", { list_id: r.list_id, list_name: r.list_name, signal_ids: r.signal_ids });
    }
  }
  return queued;
}

/* ------------------------------------------------------------------ */
/* Digest scheduler                                                    */
/* ------------------------------------------------------------------ */

/** Local hour and weekday for a user's IANA timezone. */
export function localTime(now: Date, timeZone: string): { hour: number; weekday: string; date: string } {
  const f = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = Object.fromEntries(f.formatToParts(now).map((p) => [p.type, p.value]));
  return { hour: Number(parts.hour), weekday: String(parts.weekday), date: `${parts.year}-${parts.month}-${parts.day}` };
}

/**
 * Daily digest at 07:00 local, weekly on Monday 07:00 local (plan 7.11). Run hourly; `anyHour` lets a
 * once-a-day cron (Vercel Hobby) send everything due today. Never sends the same cadence twice a day.
 */
export async function runScheduledDigests(opts: { now?: Date; anyHour?: boolean } = {}) {
  const now = opts.now ?? new Date();
  const users = await q<{ org_id: string; user_id: string; timezone: string; role: string; cadences: string[] }>(sql`
    SELECT s.org_id, m.user_id, u.timezone, m.role, array_agg(DISTINCT s.alert_cadence) AS cadences
    FROM saved_searches s
    JOIN member m ON m.organization_id = s.org_id AND (m.user_id = s.owner_id OR (s.visibility = 'TEAM' AND EXISTS (
      SELECT 1 FROM search_reads r WHERE r.search_id = s.id AND r.reader_id = m.user_id)))
    JOIN "user" u ON u.id = m.user_id
    WHERE s.deleted_at IS NULL AND s.alert_cadence IN ('DAILY', 'WEEKLY')
    GROUP BY s.org_id, m.user_id, u.timezone, m.role`);
  const out = { users: users.length, daily: 0, weekly: 0, skipped: 0 };
  for (const u of users) {
    const t = localTime(now, u.timezone || "UTC");
    const due: ("DAILY" | "WEEKLY")[] = [];
    if (opts.anyHour || t.hour === 7) {
      if (u.cadences.includes("DAILY")) due.push("DAILY");
      if (u.cadences.includes("WEEKLY") && t.weekday === "Mon") due.push("WEEKLY");
    }
    for (const cadence of due) {
      const [already] = await q<{ n: number }>(sql`SELECT count(*)::int AS n FROM digest_runs WHERE org_id = ${u.org_id} AND user_id = ${u.user_id}
        AND cadence = ${cadence} AND sent_at > ${now.toISOString()}::timestamptz - interval '20 hours'`);
      if (already?.n) {
        out.skipped++;
        continue;
      }
      await sendDigest({ orgId: u.org_id, userId: u.user_id, role: u.role as OrgContext["role"] }, cadence);
      out[cadence === "DAILY" ? "daily" : "weekly"]++;
    }
  }
  return out;
}

export function getAlertDeliveries(ctx: OrgContext, limit = 20) {
  return q<{ id: string; search_id: string | null; channel: string; status: string; item_count: number; error: string | null; at: string; name: string | null }>(
    sql`SELECT d.id, d.search_id, d.channel, d.status, d.item_count, d.error, d.at, s.name FROM alert_deliveries d LEFT JOIN saved_searches s ON s.id = d.search_id
      WHERE d.org_id = ${ctx.orgId} AND (d.user_id IS NULL OR d.user_id = ${ctx.userId}) ORDER BY d.at DESC LIMIT ${limit}`,
  );
}
