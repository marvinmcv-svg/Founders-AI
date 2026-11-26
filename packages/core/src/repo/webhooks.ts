/**
 * Customer webhooks (plan 11 #71–74 + "Security (v2)").
 *
 * - Targets: HTTPS only; validated when saved AND re-checked on every delivery through the egress
 *   guard (DNS resolved, private/loopback/link-local/metadata ranges refused, connection pinned).
 * - Signature: `X-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, t + "." + body)>`.
 * - Delivery: 10 s timeout, up to 6 retries with exponential backoff, endpoint auto-disabled after
 *   24 h of unbroken failures.
 * - Secrets are shown once at creation and stored AES-GCM encrypted (they are needed to sign).
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { WEBHOOK_EVENTS, type WebhookEvent } from "@founders/db/schema";
import { decryptSecret, encryptSecret } from "../crypto";
import { EgressBlockedError, egressFetch, validateEgressUrl } from "../egress";
import { newId } from "../ids";
import { WEBHOOK_MAX_PER_ORG } from "../limits";
import { rawQuery as q } from "./entities";
import { ForbiddenError, NotFoundError, type OrgContext } from "./workspace";

export { WEBHOOK_EVENTS, type WebhookEvent };

/** Minutes to wait before retry n (1-based). Six retries after the first attempt. */
export const WEBHOOK_BACKOFF_MIN = [1, 5, 30, 120, 360, 720] as const;
export const WEBHOOK_TIMEOUT_MS = 10_000;
export const WEBHOOK_DISABLE_AFTER_MS = 24 * 3600 * 1000;

export type WebhookPoster = (url: string, body: string, headers: Record<string, string>) => Promise<{ status: number }>;

const egressPoster: WebhookPoster = (url, body, headers) =>
  egressFetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body }, { timeoutMs: WEBHOOK_TIMEOUT_MS, maxBytes: 64 * 1024 });

/* ---------------- signing ---------------- */

export function signWebhook(secret: string, body: string, t: number = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

/** Reference verifier (also documented for customers). Rejects signatures older than `toleranceSec`. */
export function verifyWebhookSignature(secret: string, body: string, header: string, toleranceSec = 300, now: number = Date.now() / 1000): boolean {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!parts.v1 || !Number.isFinite(t) || Math.abs(now - t) > toleranceSec) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${body}`).digest("hex"));
  const given = Buffer.from(parts.v1);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/* ---------------- management (org-scoped) ---------------- */

type HookRow = { id: string; org_id: string; url: string; events: string[]; secret: string; secret_prefix: string; status: string; disabled_reason: string | null; failing_since: string | null; created_at: string };

const publicHook = (r: HookRow) => ({
  id: r.id,
  url: r.url,
  events: r.events,
  status: r.status,
  disabled_reason: r.disabled_reason,
  secret_prefix: r.secret_prefix,
  created_at: r.created_at,
});

function assertAdmin(ctx: OrgContext) {
  if (ctx.role !== "owner" && ctx.role !== "admin") throw new ForbiddenError("Only workspace admins (or admin-scoped keys) can manage webhooks");
}

export async function listWebhooks(ctx: OrgContext) {
  const rows = await q<HookRow>(sql`SELECT * FROM webhooks WHERE org_id = ${ctx.orgId} ORDER BY created_at DESC`);
  return rows.map(publicHook);
}

export async function createWebhook(ctx: OrgContext, input: { url: string; events: WebhookEvent[] }) {
  assertAdmin(ctx);
  const u = validateEgressUrl(input.url);
  if (u.protocol !== "https:") throw new EgressBlockedError("Webhook URLs must use https");
  const events = [...new Set(input.events)];
  if (!events.length || events.some((e) => !(WEBHOOK_EVENTS as readonly string[]).includes(e))) throw new EgressBlockedError(`events must be a non-empty subset of ${WEBHOOK_EVENTS.join(", ")}`);
  const [{ n } = { n: 0 }] = await q<{ n: number }>(sql`SELECT count(*)::int AS n FROM webhooks WHERE org_id = ${ctx.orgId}`);
  if (n >= WEBHOOK_MAX_PER_ORG) throw new ForbiddenError(`A workspace can have at most ${WEBHOOK_MAX_PER_ORG} webhooks`);
  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  const id = newId("webhook");
  const [row] = await q<HookRow>(sql`INSERT INTO webhooks (id, org_id, url, events, secret, secret_prefix, created_by)
    VALUES (${id}, ${ctx.orgId}, ${u.toString()}, ${sql`ARRAY[${sql.join(events.map((e) => sql`${e}`), sql`, `)}]::text[]`}, ${encryptSecret(secret)}, ${secret.slice(0, 10)}, ${ctx.userId})
    RETURNING *`);
  return { ...publicHook(row!), secret };
}

export async function deleteWebhook(ctx: OrgContext, id: string) {
  assertAdmin(ctx);
  const r = await q(sql`DELETE FROM webhooks WHERE id = ${id} AND org_id = ${ctx.orgId} RETURNING id`);
  if (!r.length) throw new NotFoundError("Webhook not found");
  await q(sql`DELETE FROM webhook_deliveries WHERE webhook_id = ${id}`);
}

async function hookOr404(ctx: OrgContext, id: string) {
  const [r] = await q<HookRow>(sql`SELECT * FROM webhooks WHERE id = ${id} AND org_id = ${ctx.orgId}`);
  if (!r) throw new NotFoundError("Webhook not found");
  return r;
}

export async function getWebhookDeliveries(ctx: OrgContext, id: string, limit = 20) {
  await hookOr404(ctx, id);
  return q(sql`SELECT id, event, status, attempts, last_status_code, last_error, created_at, delivered_at, next_attempt_at
    FROM webhook_deliveries WHERE webhook_id = ${id} AND org_id = ${ctx.orgId} ORDER BY created_at DESC LIMIT ${limit}`);
}

/** POST /webhooks/{id}/test — sends a signed `webhook.test` event synchronously (no retry). */
export async function testWebhook(ctx: OrgContext, id: string, post: WebhookPoster = egressPoster) {
  assertAdmin(ctx);
  const h = await hookOr404(ctx, id);
  const body = envelope("webhook.test", newId("webhookDelivery"), { message: "Test event", webhook_id: h.id });
  try {
    const res = await post(h.url, body, { "X-Signature": signWebhook(decryptSecret(h.secret), body), "X-Webhook-Event": "webhook.test" });
    return { delivered: res.status >= 200 && res.status < 300, status_code: res.status };
  } catch (e) {
    return { delivered: false, status_code: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ---------------- events + delivery (platform worker) ---------------- */

function envelope(event: string, id: string, data: unknown, createdAt: string = new Date().toISOString()) {
  return JSON.stringify({ id, type: event, created_at: createdAt, data });
}

/** Queue `event` for every ACTIVE webhook of `orgId` subscribed to it. Returns deliveries queued. */
export async function enqueueWebhookEvent(orgId: string, event: WebhookEvent, data: Record<string, unknown>): Promise<number> {
  const r = await q(sql`INSERT INTO webhook_deliveries (id, webhook_id, org_id, event, payload)
    SELECT 'whd_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 24), w.id, w.org_id, ${event}, ${JSON.stringify(data)}::jsonb
    FROM webhooks w WHERE w.org_id = ${orgId} AND w.status = 'ACTIVE' AND ${event} = ANY(w.events) RETURNING id`);
  return r.length;
}

/** Orgs with at least one ACTIVE webhook for `event` (so producers only build payloads when needed). */
export async function orgsSubscribedTo(event: WebhookEvent): Promise<string[]> {
  const r = await q<{ org_id: string }>(sql`SELECT DISTINCT org_id FROM webhooks WHERE status = 'ACTIVE' AND ${event} = ANY(events)`);
  return r.map((x) => x.org_id);
}

type DueRow = { id: string; webhook_id: string; event: string; payload: unknown; attempts: number; created_at: string; url: string; secret: string; failing_since: string | null };

/**
 * Deliver every due PENDING delivery. A 2xx marks it DELIVERED and resets the endpoint's failure
 * streak; anything else schedules the next retry (or FAILED after 6 retries). An endpoint failing
 * for 24 h is DISABLED and its pending deliveries are dropped.
 */
export async function deliverDueWebhooks(opts: { post?: WebhookPoster; now?: Date; batch?: number } = {}) {
  const post = opts.post ?? egressPoster;
  const now = opts.now ?? new Date();
  const due = await q<DueRow>(sql`SELECT d.id, d.webhook_id, d.event, d.payload, d.attempts, d.created_at, w.url, w.secret, w.failing_since
    FROM webhook_deliveries d JOIN webhooks w ON w.id = d.webhook_id
    WHERE d.status = 'PENDING' AND w.status = 'ACTIVE' AND d.next_attempt_at <= ${now.toISOString()}
    ORDER BY d.next_attempt_at LIMIT ${opts.batch ?? 500}`);
  const counts = { due: due.length, delivered: 0, retrying: 0, failed: 0, disabled: 0 };
  const disabled = new Set<string>();
  for (const d of due) {
    if (disabled.has(d.webhook_id)) continue;
    const body = envelope(d.event, d.id, d.payload, new Date(d.created_at).toISOString());
    let status: number | null = null;
    let error: string | null = null;
    try {
      const sig = signWebhook(decryptSecret(d.secret), body, Math.floor(now.getTime() / 1000));
      status = (await post(d.url, body, { "X-Signature": sig, "X-Webhook-Event": d.event, "X-Webhook-Id": d.id })).status;
      if (status < 200 || status >= 300) error = `HTTP ${status}`;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const attempts = d.attempts + 1;
    if (!error) {
      counts.delivered++;
      await q(sql`UPDATE webhook_deliveries SET status = 'DELIVERED', attempts = ${attempts}, last_status_code = ${status}, last_error = NULL, delivered_at = ${now.toISOString()} WHERE id = ${d.id}`);
      await q(sql`UPDATE webhooks SET failing_since = NULL WHERE id = ${d.webhook_id}`);
      continue;
    }
    const retry = WEBHOOK_BACKOFF_MIN[attempts - 1];
    if (retry === undefined) counts.failed++;
    else counts.retrying++;
    await q(sql`UPDATE webhook_deliveries SET attempts = ${attempts}, last_status_code = ${status}, last_error = ${error.slice(0, 500)},
      status = ${retry === undefined ? "FAILED" : "PENDING"},
      next_attempt_at = ${new Date(now.getTime() + (retry ?? 0) * 60_000).toISOString()} WHERE id = ${d.id}`);
    const since = d.failing_since ? new Date(d.failing_since) : now;
    if (!d.failing_since) await q(sql`UPDATE webhooks SET failing_since = ${now.toISOString()} WHERE id = ${d.webhook_id} AND failing_since IS NULL`);
    if (now.getTime() - since.getTime() >= WEBHOOK_DISABLE_AFTER_MS) {
      disabled.add(d.webhook_id);
      counts.disabled++;
      await q(sql`UPDATE webhooks SET status = 'DISABLED', disabled_reason = ${`Failing for 24 h (last error: ${error.slice(0, 200)})`} WHERE id = ${d.webhook_id}`);
      await q(sql`UPDATE webhook_deliveries SET status = 'FAILED', last_error = 'Endpoint disabled' WHERE webhook_id = ${d.webhook_id} AND status = 'PENDING'`);
    }
  }
  return counts;
}
