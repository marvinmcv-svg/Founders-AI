/**
 * Billing (plan 14.1): platform seats (Stripe subscription, annual, per user), credit packs
 * (one-off Stripe payments that add credits), and metered overage (credits used past zero, sent
 * to a Stripe billing meter). Stripe is the system of record for money; we mirror what we need.
 *
 * Every state change arrives as a signed webhook event and is applied once (stripe_events.id).
 * Period reset (plan 14.2 "monthly reset/rollover rules configurable"): on each paid renewal
 * invoice the balance becomes `period_credits + carry`, carry = unused × rollover_pct% (≤ cap).
 */
import { sql } from "drizzle-orm";
import { billingConfig, getStripe } from "../billing/config";
import { SimulatedStripe, signStripePayload, verifyStripeSignature, type StripeObject } from "../billing/stripe";
import { newId } from "../ids";
import { DEFAULT_OVERAGE_LIMIT } from "../limits";
import { CREDIT_PACKS, type CreditPackId } from "../pricing";
import { recordAudit } from "./audit";
import { grantCredits } from "./credits";
import { rawQuery as q } from "./entities";
import { ForbiddenError, NotFoundError, notify, type OrgContext } from "./workspace";

export type BillingAccount = {
  org_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string;
  billing_email: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  period_credits: number;
  rollover_pct: number;
  rollover_cap: number;
  overage_enabled: boolean;
  last_reset_at: string | null;
};

export class BillingUnavailableError extends Error {
  constructor() {
    super("Online billing is not set up yet. Contact sales to change seats or buy credits.");
    this.name = "BillingUnavailableError";
  }
}

function assertBillingAdmin(ctx: OrgContext) {
  if (ctx.role !== "admin" && ctx.role !== "owner") throw new ForbiddenError("Only workspace admins can manage billing");
}

export async function getBillingAccount(orgId: string): Promise<BillingAccount> {
  await q(sql`INSERT INTO billing_accounts (org_id) VALUES (${orgId}) ON CONFLICT (org_id) DO NOTHING`);
  const [a] = await q<BillingAccount>(sql`SELECT * FROM billing_accounts WHERE org_id = ${orgId}`);
  return a!;
}

/* ------------------------------------------------------------------ */
/* Seats                                                               */
/* ------------------------------------------------------------------ */

export async function seatUsage(orgId: string) {
  const [r] = await q<{ seats: number; members: number; pending: number }>(sql`SELECT o.seats,
      (SELECT count(*)::int FROM member m WHERE m.organization_id = o.id) AS members,
      (SELECT count(*)::int FROM invitation i WHERE i.organization_id = o.id AND i.status = 'pending' AND i.expires_at > now()) AS pending
    FROM organization o WHERE o.id = ${orgId}`);
  if (!r) throw new NotFoundError("Workspace not found");
  return { ...r, available: Math.max(0, r.seats - r.members - r.pending) };
}

export class SeatLimitError extends Error {
  constructor(seats: number) {
    super(`All ${seats} seats are in use (members + pending invites). Add seats in Settings → Billing or remove a member first.`);
    this.name = "SeatLimitError";
  }
}

/** Invites and SCIM provisioning call this before adding someone. */
export async function assertSeatAvailable(orgId: string, extra = 1) {
  const u = await seatUsage(orgId);
  if (u.available < extra) throw new SeatLimitError(u.seats);
}

/* ------------------------------------------------------------------ */
/* Summary (Settings → Billing)                                        */
/* ------------------------------------------------------------------ */

export async function getBillingSummary(ctx: OrgContext) {
  const cfg = billingConfig();
  const [account, seats, [bal], packs] = await Promise.all([
    getBillingAccount(ctx.orgId),
    seatUsage(ctx.orgId),
    q<{ balance: number; overage_limit: number }>(sql`SELECT balance, overage_limit FROM credit_balances WHERE org_id = ${ctx.orgId}`),
    q<{ reason: string; delta: number; at: string }>(sql`SELECT reason, delta, at FROM credit_ledger WHERE org_id = ${ctx.orgId} AND (reason LIKE 'pack:%' OR reason LIKE 'period_%' OR reason LIKE 'admin%')
      ORDER BY at DESC LIMIT 10`),
  ]);
  const [overage] = await q<{ credits: number; unreported: number }>(sql`SELECT COALESCE(sum(overage), 0)::int AS credits,
      COALESCE(sum(overage) FILTER (WHERE reported_at IS NULL), 0)::int AS unreported
    FROM credit_ledger WHERE org_id = ${ctx.orgId} AND overage > 0 AND at >= COALESCE(${account.current_period_start}::timestamptz, date_trunc('month', now()))`);
  return {
    mode: cfg.mode,
    account,
    seats,
    balance: bal?.balance ?? 0,
    overageLimit: bal?.overage_limit ?? 0,
    overageThisPeriod: overage ?? { credits: 0, unreported: 0 },
    packs: cfg.packs.map((p) => ({ id: p.id, credits: p.credits, available: Boolean(p.priceId) })),
    seatCheckoutAvailable: Boolean(cfg.seatPriceId) && cfg.mode !== "contact_sales",
    history: packs,
  };
}

/* ------------------------------------------------------------------ */
/* Checkout & portal                                                   */
/* ------------------------------------------------------------------ */

async function ensureCustomer(ctx: OrgContext, email?: string | null): Promise<string> {
  const stripe = getStripe();
  if (!stripe) throw new BillingUnavailableError();
  const a = await getBillingAccount(ctx.orgId);
  if (a.stripe_customer_id) return a.stripe_customer_id;
  const [o] = await q<{ name: string }>(sql`SELECT name FROM organization WHERE id = ${ctx.orgId}`);
  const c = await stripe.createCustomer({ email, name: o?.name ?? ctx.orgId, orgId: ctx.orgId });
  await q(sql`UPDATE billing_accounts SET stripe_customer_id = ${c.id}, billing_email = COALESCE(billing_email, ${email ?? null}), updated_at = now() WHERE org_id = ${ctx.orgId}`);
  return c.id;
}

const settingsUrl = (cfg: ReturnType<typeof billingConfig>, q2 = "") => `${cfg.appUrl.replace(/\/$/, "")}/settings/billing${q2}`;

/**
 * Seats: first purchase opens Stripe Checkout for the annual seat price; later changes update the
 * subscription item's quantity (Stripe prorates). Seats never drop below current members.
 */
export async function changeSeats(ctx: OrgContext, seats: number, email?: string | null): Promise<{ url?: string; updated?: boolean }> {
  assertBillingAdmin(ctx);
  const cfg = billingConfig();
  const stripe = getStripe();
  if (!stripe || !cfg.seatPriceId) throw new BillingUnavailableError();
  const n = Math.floor(seats);
  const u = await seatUsage(ctx.orgId);
  if (!Number.isFinite(n) || n < 1 || n > 10_000) throw new Error("Seats must be between 1 and 10,000");
  if (n < u.members) throw new Error(`You have ${u.members} members; remove members before going below that`);
  const customerId = await ensureCustomer(ctx, email);
  const a = await getBillingAccount(ctx.orgId);
  if (a.stripe_subscription_id && ["active", "trialing", "past_due"].includes(a.subscription_status)) {
    const sub = await stripe.retrieveSubscription(a.stripe_subscription_id);
    const item = subscriptionItems(sub).find((i) => i.priceId === cfg.seatPriceId);
    if (!item) throw new Error("The subscription has no seat item; contact support");
    await stripe.updateSubscriptionItemQuantity(item.id, n, `seats-${ctx.orgId}-${a.stripe_subscription_id}-${n}-${Date.now() >> 16}`);
    await recordAudit({ orgId: ctx.orgId, actor: ctx.userId, action: "billing.seats.change", target: String(n), metadata: { from: u.seats } });
    // Seats are applied when Stripe confirms (customer.subscription.updated); simulated mode confirms now.
    if (stripe instanceof SimulatedStripe) await simulateEvents([subscriptionEvent(ctx.orgId, customerId, a.stripe_subscription_id, cfg.seatPriceId, n, "active", "customer.subscription.updated")]);
    return { updated: true };
  }
  const s = await stripe.createCheckoutSession({
    mode: "subscription",
    customerId,
    priceId: cfg.seatPriceId,
    quantity: n,
    successUrl: settingsUrl(cfg, "?checkout=success"),
    cancelUrl: settingsUrl(cfg, "?checkout=cancel"),
    metadata: { org_id: ctx.orgId, kind: "seats", by: ctx.userId },
  });
  await recordAudit({ orgId: ctx.orgId, actor: ctx.userId, action: "billing.checkout.seats", target: s.id, metadata: { seats: n } });
  return { url: s.url };
}

export async function buyCreditPack(ctx: OrgContext, packId: CreditPackId, email?: string | null): Promise<{ url: string }> {
  assertBillingAdmin(ctx);
  const cfg = billingConfig();
  const stripe = getStripe();
  const pack = cfg.packs.find((p) => p.id === packId);
  if (!pack) throw new NotFoundError("Unknown credit pack");
  if (!stripe || !pack.priceId) throw new BillingUnavailableError();
  const customerId = await ensureCustomer(ctx, email);
  const s = await stripe.createCheckoutSession({
    mode: "payment",
    customerId,
    priceId: pack.priceId,
    quantity: 1,
    successUrl: settingsUrl(cfg, "?checkout=success"),
    cancelUrl: settingsUrl(cfg, "?checkout=cancel"),
    metadata: { org_id: ctx.orgId, kind: "credit_pack", pack: pack.id, credits: String(pack.credits), by: ctx.userId },
  });
  await recordAudit({ orgId: ctx.orgId, actor: ctx.userId, action: "billing.checkout.credits", target: s.id, metadata: { pack: pack.id } });
  return { url: s.url };
}

export async function openBillingPortal(ctx: OrgContext): Promise<{ url: string }> {
  assertBillingAdmin(ctx);
  const stripe = getStripe();
  if (!stripe) throw new BillingUnavailableError();
  const a = await getBillingAccount(ctx.orgId);
  if (!a.stripe_customer_id) throw new Error("No billing account yet: buy seats or credits first");
  return stripe.createPortalSession({ customerId: a.stripe_customer_id, returnUrl: settingsUrl(billingConfig()) });
}

/**
 * Overage (plan 14.1): when on, charges may take the balance down to −limit; the part below zero
 * is billed on the Stripe meter. Needs a live subscription (a payment method on file).
 */
export async function setOverage(ctx: OrgContext, enabled: boolean, limit = DEFAULT_OVERAGE_LIMIT) {
  assertBillingAdmin(ctx);
  const a = await getBillingAccount(ctx.orgId);
  if (enabled && !["active", "trialing"].includes(a.subscription_status)) throw new Error("Overage needs an active subscription (a payment method on file)");
  const cap = enabled ? Math.max(0, Math.min(Math.floor(limit), 1_000_000)) : 0;
  await q(sql`UPDATE billing_accounts SET overage_enabled = ${enabled}, updated_at = now() WHERE org_id = ${ctx.orgId}`);
  await q(sql`INSERT INTO credit_balances (org_id, balance, overage_limit) VALUES (${ctx.orgId}, 0, ${cap})
    ON CONFLICT (org_id) DO UPDATE SET overage_limit = ${cap}`);
  await recordAudit({ orgId: ctx.orgId, actor: ctx.userId, action: enabled ? "billing.overage.enable" : "billing.overage.disable", metadata: { limit: cap } });
}

/* ------------------------------------------------------------------ */
/* Webhooks                                                            */
/* ------------------------------------------------------------------ */

export type StripeEvent = { id: string; type: string; created?: number; data: { object: StripeObject } };

function subscriptionItems(sub: Record<string, unknown>): { id: string; priceId: string | null; quantity: number; periodStart: number | null; periodEnd: number | null }[] {
  const items = ((sub.items as { data?: unknown[] } | undefined)?.data ?? []) as Record<string, unknown>[];
  return items.map((i) => ({
    id: String(i.id),
    priceId: ((i.price as { id?: string } | undefined)?.id ?? null) as string | null,
    quantity: Number(i.quantity ?? 1),
    // Newer API versions moved the period onto the item; older ones keep it on the subscription.
    periodStart: (i.current_period_start as number | undefined) ?? (sub.current_period_start as number | undefined) ?? null,
    periodEnd: (i.current_period_end as number | undefined) ?? (sub.current_period_end as number | undefined) ?? null,
  }));
}

const tsOrNull = (s: number | null | undefined) => (s ? new Date(s * 1000).toISOString() : null);

async function orgForEvent(obj: Record<string, unknown>): Promise<string | null> {
  const meta = (obj.metadata ?? {}) as Record<string, string>;
  const fromMeta = meta.org_id ?? (obj.client_reference_id as string | undefined);
  if (fromMeta && /^org_[A-Za-z0-9]+$/.test(fromMeta)) {
    const [o] = await q<{ id: string }>(sql`SELECT id FROM organization WHERE id = ${fromMeta}`);
    if (o) return o.id;
  }
  const customer = typeof obj.customer === "string" ? obj.customer : (obj.customer as { id?: string } | undefined)?.id;
  if (customer) {
    const [a] = await q<{ org_id: string }>(sql`SELECT org_id FROM billing_accounts WHERE stripe_customer_id = ${customer}`);
    if (a) return a.org_id;
  }
  return null;
}

async function notifyAdmins(orgId: string, kind: string, payload: Record<string, unknown>) {
  const admins = await q<{ user_id: string }>(sql`SELECT user_id FROM member WHERE organization_id = ${orgId} AND role IN ('owner', 'admin')`);
  for (const a of admins) await notify({ orgId, userId: a.user_id, role: "admin" }, kind, payload, a.user_id);
}

async function applySubscription(orgId: string, sub: Record<string, unknown>) {
  const cfg = billingConfig();
  const status = String(sub.status ?? "none");
  const items = subscriptionItems(sub);
  const seat = items.find((i) => i.priceId === cfg.seatPriceId) ?? items[0];
  const customer = typeof sub.customer === "string" ? sub.customer : null;
  await getBillingAccount(orgId);
  await q(sql`UPDATE billing_accounts SET stripe_subscription_id = ${sub.id as string}, subscription_status = ${status},
      stripe_customer_id = COALESCE(stripe_customer_id, ${customer}),
      current_period_start = COALESCE(${tsOrNull(seat?.periodStart)}::timestamptz, current_period_start),
      current_period_end = COALESCE(${tsOrNull(seat?.periodEnd)}::timestamptz, current_period_end),
      cancel_at_period_end = ${Boolean(sub.cancel_at_period_end)}, updated_at = now()
    WHERE org_id = ${orgId}`);
  if (["active", "trialing", "past_due"].includes(status) && seat) {
    await q(sql`UPDATE organization SET seats = ${seat.quantity}, plan = 'platform' WHERE id = ${orgId}`);
  } else if (["canceled", "unpaid", "incomplete_expired"].includes(status)) {
    await q(sql`UPDATE organization SET plan = 'inactive' WHERE id = ${orgId}`);
    // No payment method → no overage.
    await q(sql`UPDATE billing_accounts SET overage_enabled = false WHERE org_id = ${orgId}`);
    await q(sql`UPDATE credit_balances SET overage_limit = 0 WHERE org_id = ${orgId}`);
  }
}

/** New period: balance = period_credits + carry (overage already billed, so a negative balance is not carried). */
export async function resetCreditPeriod(orgId: string, reason: string) {
  const a = await getBillingAccount(orgId);
  const [b] = await q<{ balance: number }>(sql`SELECT balance FROM credit_balances WHERE org_id = ${orgId}`);
  const unused = Math.max(0, b?.balance ?? 0);
  let carry = Math.floor((unused * Math.max(0, Math.min(100, a.rollover_pct))) / 100);
  if (a.rollover_cap > 0) carry = Math.min(carry, a.rollover_cap);
  const next = a.period_credits + carry;
  const delta = next - (b?.balance ?? 0);
  await q(sql`INSERT INTO credit_balances (org_id, balance) VALUES (${orgId}, ${next})
    ON CONFLICT (org_id) DO UPDATE SET balance = ${next}, period_start = now()`);
  if (delta !== 0) await q(sql`INSERT INTO credit_ledger (id, org_id, delta, reason) VALUES (${newId("ledger")}, ${orgId}, ${delta}, ${reason})`);
  await q(sql`UPDATE billing_accounts SET last_reset_at = now() WHERE org_id = ${orgId}`);
  return { balance: next, carried: carry, expired: unused - carry };
}

async function applyEvent(ev: StripeEvent): Promise<string | null> {
  const obj = ev.data.object;
  const orgId = await orgForEvent(obj);
  if (!orgId) return null;
  switch (ev.type) {
    case "checkout.session.completed": {
      const meta = (obj.metadata ?? {}) as Record<string, string>;
      if (typeof obj.customer === "string") {
        await getBillingAccount(orgId);
        await q(sql`UPDATE billing_accounts SET stripe_customer_id = COALESCE(stripe_customer_id, ${obj.customer}) WHERE org_id = ${orgId}`);
      }
      if (meta.kind === "credit_pack" && obj.payment_status === "paid") {
        const pack = CREDIT_PACKS.find((p) => p.id === meta.pack);
        if (!pack) throw new Error(`Unknown pack ${meta.pack}`);
        await grantCredits(orgId, pack.credits, `pack:${pack.id}`);
        await recordAudit({ orgId, actor: "stripe", actorType: "stripe", action: "billing.credits.purchased", target: pack.id, metadata: { credits: pack.credits, event: ev.id } });
      }
      if (meta.kind === "seats" && typeof obj.subscription === "string") {
        await q(sql`UPDATE billing_accounts SET stripe_subscription_id = ${obj.subscription} WHERE org_id = ${orgId}`);
      }
      return orgId;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const before = await getBillingAccount(orgId);
      const [o] = await q<{ seats: number }>(sql`SELECT seats FROM organization WHERE id = ${orgId}`);
      await applySubscription(orgId, ev.type === "customer.subscription.deleted" ? { ...obj, status: "canceled" } : obj);
      const after = await getBillingAccount(orgId);
      const [o2] = await q<{ seats: number }>(sql`SELECT seats FROM organization WHERE id = ${orgId}`);
      await recordAudit({ orgId, actor: "stripe", actorType: "stripe", action: `billing.${ev.type.split(".").pop()}`, target: obj.id,
        metadata: { status: after.subscription_status, from_status: before.subscription_status, seats: o2?.seats, from_seats: o?.seats, event: ev.id } });
      return orgId;
    }
    case "invoice.paid": {
      const reason = String(obj.billing_reason ?? "");
      if (reason === "subscription_cycle" || reason === "subscription_create") {
        const r = await resetCreditPeriod(orgId, reason === "subscription_create" ? "period_start" : "period_reset");
        await recordAudit({ orgId, actor: "stripe", actorType: "stripe", action: "billing.period.reset", target: obj.id, metadata: { ...r, event: ev.id } });
      }
      await q(sql`UPDATE billing_accounts SET subscription_status = CASE WHEN subscription_status = 'past_due' THEN 'active' ELSE subscription_status END WHERE org_id = ${orgId}`);
      return orgId;
    }
    case "invoice.payment_failed": {
      await q(sql`UPDATE billing_accounts SET subscription_status = 'past_due', updated_at = now() WHERE org_id = ${orgId}`);
      await notifyAdmins(orgId, "billing.payment_failed", { invoice: obj.id, hosted_invoice_url: obj.hosted_invoice_url ?? null });
      await recordAudit({ orgId, actor: "stripe", actorType: "stripe", action: "billing.payment_failed", target: obj.id, metadata: { event: ev.id } });
      return orgId;
    }
    default:
      return orgId;
  }
}

/** Apply a verified event once. Returns `duplicate` when Stripe re-delivers an event we already applied. */
export async function handleStripeEvent(ev: StripeEvent): Promise<{ status: "applied" | "duplicate" | "ignored"; orgId: string | null }> {
  const inserted = await q<{ id: string }>(sql`INSERT INTO stripe_events (id, type, payload) VALUES (${ev.id}, ${ev.type}, ${JSON.stringify(ev)}::jsonb)
    ON CONFLICT (id) DO NOTHING RETURNING id`);
  if (!inserted.length) {
    const [prev] = await q<{ processed_at: string | null; org_id: string | null }>(sql`SELECT processed_at, org_id FROM stripe_events WHERE id = ${ev.id}`);
    if (prev?.processed_at) return { status: "duplicate", orgId: prev.org_id };
  }
  try {
    const orgId = await applyEvent(ev);
    await q(sql`UPDATE stripe_events SET processed_at = now(), org_id = ${orgId}, error = NULL WHERE id = ${ev.id}`);
    return { status: orgId ? "applied" : "ignored", orgId };
  } catch (e) {
    await q(sql`UPDATE stripe_events SET error = ${e instanceof Error ? e.message : String(e)} WHERE id = ${ev.id}`);
    throw e; // 500 → Stripe retries
  }
}

/** Webhook entry point: verify the signature over the raw body, then apply. */
export async function processStripeWebhook(rawBody: string, signature: string | null) {
  const cfg = billingConfig();
  if (!cfg.webhookSecret) throw new BillingUnavailableError();
  verifyStripeSignature(rawBody, signature, cfg.webhookSecret);
  const ev = JSON.parse(rawBody) as StripeEvent;
  if (!ev?.id || !ev.type || !ev.data?.object) throw new Error("Not a Stripe event");
  return handleStripeEvent(ev);
}

/* ------------------------------------------------------------------ */
/* Simulator (BILLING_SIMULATOR=1): same events, signed, same handler  */
/* ------------------------------------------------------------------ */

let simSeq = 0;
const simId = (p: string) => `${p}_sim_${Date.now().toString(36)}${(simSeq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function subscriptionEvent(orgId: string, customer: string, subId: string, priceId: string, qty: number, status: string, type: string): StripeEvent {
  const now = Math.floor(Date.now() / 1000);
  return {
    id: simId("evt"),
    type,
    created: now,
    data: {
      object: {
        id: subId,
        object: "subscription",
        customer,
        status,
        metadata: { org_id: orgId },
        cancel_at_period_end: false,
        items: { data: [{ id: `si_sim_${subId.slice(-10)}`, price: { id: priceId }, quantity: qty, current_period_start: now, current_period_end: now + 365 * 86400 }] },
      },
    },
  };
}

async function simulateEvents(events: StripeEvent[]) {
  const cfg = billingConfig();
  for (const ev of events) {
    const body = JSON.stringify(ev);
    await processStripeWebhook(body, signStripePayload(body, cfg.webhookSecret!));
  }
}

/** The in-app "checkout" page calls this when the admin confirms. Only in simulator mode. */
export async function completeSimulatedCheckout(ctx: OrgContext, token: string) {
  assertBillingAdmin(ctx);
  const stripe = getStripe();
  if (!(stripe instanceof SimulatedStripe)) throw new ForbiddenError("The billing simulator is off");
  const s = stripe.open(token) as { mode: string; customerId: string; priceId: string; quantity: number; metadata: Record<string, string> };
  if (s.metadata.org_id !== ctx.orgId) throw new ForbiddenError("This checkout belongs to another workspace");
  const sessionId = simId("cs");
  const now = Math.floor(Date.now() / 1000);
  if (s.mode === "payment") {
    await simulateEvents([
      { id: simId("evt"), type: "checkout.session.completed", created: now, data: { object: { id: sessionId, object: "checkout.session", mode: "payment", payment_status: "paid", customer: s.customerId, metadata: s.metadata } } },
    ]);
    return { kind: "credit_pack" as const };
  }
  const subId = simId("sub");
  await simulateEvents([
    { id: simId("evt"), type: "checkout.session.completed", created: now, data: { object: { id: sessionId, object: "checkout.session", mode: "subscription", payment_status: "paid", customer: s.customerId, subscription: subId, metadata: s.metadata } } },
    subscriptionEvent(ctx.orgId, s.customerId, subId, s.priceId, s.quantity, "active", "customer.subscription.created"),
    { id: simId("evt"), type: "invoice.paid", created: now, data: { object: { id: simId("in"), object: "invoice", customer: s.customerId, subscription: subId, billing_reason: "subscription_create", metadata: {} } } },
  ]);
  return { kind: "seats" as const };
}

/* ------------------------------------------------------------------ */
/* Metered overage → Stripe meter (daily `billing-usage` job)          */
/* ------------------------------------------------------------------ */

export type UsageReportResult = { orgId: string; identifier: string; credits: number; status: "SENT" | "FAILED" | "SKIPPED"; error?: string };

async function sendReport(orgId: string, customerId: string | null, identifier: string, claimedAt: string, isRetry: boolean): Promise<UsageReportResult> {
  const stripe = getStripe();
  const [sum] = await q<{ credits: number; n: number }>(sql`SELECT COALESCE(sum(overage), 0)::int AS credits, count(*)::int AS n FROM credit_ledger
    WHERE org_id = ${orgId} AND overage > 0 AND reported_at = ${claimedAt}::timestamptz`);
  const credits = sum?.credits ?? 0;
  let status: UsageReportResult["status"] = "SENT";
  let error: string | undefined;
  if (!stripe || !customerId) {
    status = "SKIPPED";
    error = "No Stripe customer (contact-sales account): invoice manually";
  } else {
    try {
      await stripe.sendMeterEvent({ eventName: billingConfig().meterEvent, customerId, value: credits, identifier });
    } catch (e) {
      status = "FAILED";
      error = e instanceof Error ? e.message : String(e);
    }
  }
  if (isRetry) await q(sql`UPDATE usage_reports SET status = ${status}, error = ${error ?? null}, at = now() WHERE identifier = ${identifier}`);
  else
    await q(sql`INSERT INTO usage_reports (id, org_id, identifier, credits, ledger_rows, status, error) VALUES (${newId("usageReport")}, ${orgId}, ${identifier}, ${credits}, ${sum?.n ?? 0}, ${status}, ${error ?? null})
      ON CONFLICT (identifier) DO UPDATE SET status = EXCLUDED.status, error = EXCLUDED.error, at = now()`);
  if (status !== "SENT") await recordAudit({ orgId, actor: "system", actorType: "system", action: "billing.usage.report_failed", target: identifier, metadata: { error, credits } });
  return { orgId, identifier, credits, status, error };
}

/**
 * Claim unreported overage rows (stamp `reported_at` = claim time), then send their sum with an
 * identifier derived from the claim, so a failed send is retried with the same identifier and the
 * same rows — Stripe never counts a batch twice.
 */
export async function reportOverageUsage(onlyOrg?: string): Promise<UsageReportResult[]> {
  const out: UsageReportResult[] = [];
  const retries = await q<{ org_id: string; identifier: string }>(sql`SELECT org_id, identifier FROM usage_reports WHERE status = 'FAILED'
    ${onlyOrg ? sql`AND org_id = ${onlyOrg}` : sql``} ORDER BY at LIMIT 500`);
  for (const r of retries) {
    const a = await getBillingAccount(r.org_id);
    const claimed = new Date(Number(r.identifier.split("_").pop())).toISOString();
    out.push(await sendReport(r.org_id, a.stripe_customer_id, r.identifier, claimed, true));
  }
  const orgs = await q<{ org_id: string }>(sql`SELECT DISTINCT org_id FROM credit_ledger WHERE overage > 0 AND reported_at IS NULL ${onlyOrg ? sql`AND org_id = ${onlyOrg}` : sql``}`);
  for (const { org_id } of orgs) {
    const a = await getBillingAccount(org_id);
    const claimedAt = new Date().toISOString();
    const claimed = await q<{ id: string }>(sql`UPDATE credit_ledger SET reported_at = ${claimedAt}::timestamptz
      WHERE org_id = ${org_id} AND overage > 0 AND reported_at IS NULL RETURNING id`);
    if (!claimed.length) continue;
    out.push(await sendReport(org_id, a.stripe_customer_id, `ovg_${org_id}_${Date.parse(claimedAt)}`, claimedAt, false));
  }
  return out;
}

export function listUsageReports(ctx: OrgContext, limit = 20) {
  assertBillingAdmin(ctx);
  return q<{ identifier: string; credits: number; status: string; error: string | null; at: string }>(
    sql`SELECT identifier, credits, status, error, at FROM usage_reports WHERE org_id = ${ctx.orgId} ORDER BY at DESC LIMIT ${limit}`,
  );
}
