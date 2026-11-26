/**
 * Phase 10 billing (plan 14.1/14.2): Stripe client encoding + webhook signatures (pure), then against
 * the DB with the simulator: seat checkout → seats/plan from the subscription, credit pack → credits
 * once (re-delivery is a no-op), overage past zero → metered report (retried with the same
 * identifier), period reset with rollover, payment failure, seat limit, admin-only, tenancy.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
config({ path: "../../.env" });
process.env.BILLING_SIMULATOR = "1";
delete process.env.STRIPE_SECRET_KEY;
import { getSql } from "@founders/db";
import { formEncode, HttpStripe, signStripePayload, SimulatedStripe, verifyStripeSignature, billingConfig, getStripe, setStripeForTests } from "../src/billing";
import * as repo from "../src/repo";

const ORG = "org_billtest0000000000000001";
const OTHER = "org_demo000000000000000000002";
const OWNER: repo.OrgContext = { orgId: ORG, userId: "usr_demo000000000000000000001", role: "owner" };
const MEMBER: repo.OrgContext = { ...OWNER, role: "member" };
let dbUp = false;

beforeAll(async () => {
  try {
    await getSql()`SELECT 1 FROM billing_accounts LIMIT 1`;
    dbUp = true;
  } catch {
    return;
  }
  await cleanup();
  await getSql()`INSERT INTO organization (id, name, slug, seats) VALUES (${ORG}, 'Billing test', 'billing-test', 2)`;
  await getSql()`INSERT INTO member (id, organization_id, user_id, role) VALUES ('mem_billtest01', ${ORG}, ${OWNER.userId}, 'owner')`;
});

async function cleanup() {
  const s = getSql();
  await s`DELETE FROM member WHERE organization_id = ${ORG}`;
  await s`DELETE FROM invitation WHERE organization_id = ${ORG}`;
  for (const t of ["billing_accounts", "credit_balances", "credit_ledger", "usage_reports", "usage_events", "notifications"]) await s.unsafe(`DELETE FROM ${t} WHERE org_id = $1`, [ORG]);
  await s`DELETE FROM stripe_events WHERE org_id = ${ORG} OR payload::text LIKE ${`%${ORG}%`}`;
  await s.begin(async (tx) => {
    await tx`SELECT set_config('founders.audit_maintenance', 'on', true)`;
    await tx`DELETE FROM audit_log WHERE org_id = ${ORG}`;
  });
  await s`DELETE FROM organization WHERE id = ${ORG}`;
}

afterAll(async () => {
  setStripeForTests(undefined);
  if (dbUp) await cleanup();
  await getSql().end({ timeout: 1 });
});

describe("stripe client (pure)", () => {
  it("form-encodes nested objects and arrays the Stripe way", () => {
    const body = formEncode({ mode: "payment", line_items: [{ price: "price_1", quantity: 2 }], metadata: { org_id: "org_x" }, skip: undefined });
    expect(decodeURIComponent(body)).toBe("mode=payment&line_items[0][price]=price_1&line_items[0][quantity]=2&metadata[org_id]=org_x");
  });

  it("sends auth, idempotency key and version headers; maps API errors", async () => {
    const calls: { url: string; headers: Record<string, string>; body?: string }[] = [];
    const s = new HttpStripe("sk_test_x", {
      apiVersion: "2026-01-01",
      fetch: async (url, init) => {
        calls.push({ url, headers: init.headers, body: init.body });
        return url.includes("meter_events")
          ? { status: 400, text: async () => JSON.stringify({ error: { message: "No such meter", code: "resource_missing" } }) }
          : { status: 200, text: async () => JSON.stringify({ id: "cs_1", url: "https://checkout.stripe.com/c/1" }) };
      },
    });
    const r = await s.createCheckoutSession({ mode: "subscription", customerId: "cus_1", priceId: "price_seat", quantity: 3, successUrl: "https://a/s", cancelUrl: "https://a/c", metadata: { org_id: "org_1" } });
    expect(r).toEqual({ id: "cs_1", url: "https://checkout.stripe.com/c/1" });
    expect(calls[0]!.url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(calls[0]!.headers.authorization).toBe("Bearer sk_test_x");
    expect(calls[0]!.headers["stripe-version"]).toBe("2026-01-01");
    expect(calls[0]!.headers["idempotency-key"]).toBeTruthy();
    expect(decodeURIComponent(calls[0]!.body!)).toContain("subscription_data[metadata][org_id]=org_1");
    await expect(s.sendMeterEvent({ eventName: "m", customerId: "cus_1", value: 5, identifier: "id1" })).rejects.toMatchObject({ status: 400, code: "resource_missing" });
    expect(calls[1]!.headers["idempotency-key"]).toBe("id1");
  });

  it("verifies webhook signatures: good, tampered, stale, multiple v1", () => {
    const body = JSON.stringify({ id: "evt_1" });
    const header = signStripePayload(body, "whsec_test", 1_000_000);
    expect(() => verifyStripeSignature(body, header, "whsec_test", 1_000_100)).not.toThrow();
    expect(() => verifyStripeSignature(body + " ", header, "whsec_test", 1_000_100)).toThrow(/does not match/);
    expect(() => verifyStripeSignature(body, header, "whsec_other", 1_000_100)).toThrow(/does not match/);
    expect(() => verifyStripeSignature(body, header, "whsec_test", 1_000_000 + 301)).toThrow(/tolerance/);
    expect(() => verifyStripeSignature(body, null, "whsec_test")).toThrow(/Missing/);
    const rotated = `${header},v1=${"0".repeat(64)}`;
    expect(() => verifyStripeSignature(body, rotated, "whsec_test", 1_000_000)).not.toThrow();
  });

  it("simulated sessions are sealed (tampering is refused)", async () => {
    const sim = new SimulatedStripe("whsec_sim_x", "http://localhost:3001");
    const s = await sim.createCheckoutSession({ mode: "payment", customerId: "cus_sim", priceId: "p", quantity: 1, successUrl: "s", cancelUrl: "c", metadata: { org_id: "org_a" } });
    const token = decodeURIComponent(new URL(s.url).searchParams.get("s")!);
    expect(sim.open(token).metadata).toEqual({ org_id: "org_a" });
    const [body, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...sim.open(token), metadata: { org_id: "org_b" } })).toString("base64url");
    expect(() => sim.open(`${forged}.${mac}`)).toThrow();
    expect(body).toBeTruthy();
  });

  it("mode follows the environment (contact sales without a key)", () => {
    expect(billingConfig({}).mode).toBe("contact_sales");
    expect(billingConfig({ BILLING_SIMULATOR: "1" }).mode).toBe("simulated");
    expect(billingConfig({ STRIPE_SECRET_KEY: "sk", BILLING_SIMULATOR: "1" }).mode).toBe("live");
    expect(billingConfig({ STRIPE_SECRET_KEY: "sk" }).packs.every((p) => p.priceId === null)).toBe(true);
  });
});

describe("billing (DB, simulator)", () => {
  const sim = () => getStripe() as SimulatedStripe;
  const tokenOf = (url: string) => decodeURIComponent(new URL(url).searchParams.get("s")!);

  it("only admins manage billing", async () => {
    if (!dbUp) return;
    await expect(repo.buyCreditPack(MEMBER, "pack_10k")).rejects.toBeInstanceOf(repo.ForbiddenError);
    await expect(repo.changeSeats(MEMBER, 5)).rejects.toBeInstanceOf(repo.ForbiddenError);
    await expect(repo.setOverage(MEMBER, true)).rejects.toBeInstanceOf(repo.ForbiddenError);
  });

  it("seat checkout → subscription sets seats and plan; period starts", async () => {
    if (!dbUp) return;
    expect(sim().kind).toBe("simulated");
    const { url } = await repo.changeSeats(OWNER, 4, "billing@example.com");
    expect(url).toContain("/settings/billing/simulate?s=");
    await expect(repo.completeSimulatedCheckout({ ...OWNER, orgId: OTHER }, tokenOf(url!))).rejects.toBeInstanceOf(repo.ForbiddenError);
    expect((await repo.completeSimulatedCheckout(OWNER, tokenOf(url!))).kind).toBe("seats");
    const [o] = await getSql()`SELECT seats, plan FROM organization WHERE id = ${ORG}`;
    expect(o).toMatchObject({ seats: 4, plan: "platform" });
    const acc = await repo.getBillingAccount(ORG);
    expect(acc.subscription_status).toBe("active");
    expect(acc.stripe_customer_id).toMatch(/^cus_sim_/);
    expect(acc.current_period_end).toBeTruthy();
    expect(acc.last_reset_at).toBeTruthy();
    // Seat change on an existing subscription updates in place.
    expect(await repo.changeSeats(OWNER, 6)).toEqual({ updated: true });
    expect((await getSql()`SELECT seats FROM organization WHERE id = ${ORG}`)[0]!.seats).toBe(6);
    await expect(repo.changeSeats(OWNER, 0)).rejects.toThrow(/between/);
  });

  it("credit pack adds credits once, even if Stripe re-delivers the event", async () => {
    if (!dbUp) return;
    const before = await repo.getBalance(ORG);
    const { url } = await repo.buyCreditPack(OWNER, "pack_10k");
    await repo.completeSimulatedCheckout(OWNER, tokenOf(url));
    expect(await repo.getBalance(ORG)).toBe(before + 10_000);
    const [ev] = await getSql()`SELECT payload FROM stripe_events WHERE org_id = ${ORG} AND type = 'checkout.session.completed' ORDER BY received_at DESC LIMIT 1`;
    const body = JSON.stringify(ev!.payload);
    const r = await repo.processStripeWebhook(body, signStripePayload(body, billingConfig().webhookSecret!));
    expect(r.status).toBe("duplicate");
    expect(await repo.getBalance(ORG)).toBe(before + 10_000);
    await expect(repo.processStripeWebhook(body, signStripePayload(body, "whsec_wrong"))).rejects.toThrow(/does not match/);
  });

  it("overage: charges go past zero only when enabled, and the part below zero is metered once", async () => {
    if (!dbUp) return;
    const bal = await repo.getBalance(ORG);
    const charge = (credits: number) => repo.charge({ orgId: ORG, actorType: "user", actorId: OWNER.userId, surface: "API", operation: "test", credits, matched: true });
    await charge(bal); // to zero
    await expect(charge(5)).rejects.toBeInstanceOf(repo.InsufficientCreditsError);
    await repo.setOverage(OWNER, true, 100);
    await repo.assertCredits(ORG, 100);
    await expect(repo.assertCredits(ORG, 101)).rejects.toBeInstanceOf(repo.InsufficientCreditsError);
    expect((await charge(30)).remaining).toBe(-30);
    expect((await charge(20)).remaining).toBe(-50);
    await expect(charge(60)).rejects.toBeInstanceOf(repo.InsufficientCreditsError);
    const reports = await repo.reportOverageUsage(ORG);
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({ credits: 50, status: "SENT" });
    expect(sim().meterEvents.filter((e) => e.identifier === reports[0]!.identifier)).toHaveLength(1);
    expect(await repo.reportOverageUsage(ORG)).toHaveLength(0); // nothing new
  });

  it("a failed meter send is retried with the same identifier and rows", async () => {
    if (!dbUp) return;
    const real = sim();
    let fail = true;
    const flaky = Object.assign(Object.create(Object.getPrototypeOf(real)) as SimulatedStripe, real, {
      sendMeterEvent: async (e: Parameters<SimulatedStripe["sendMeterEvent"]>[0]) => {
        if (fail) throw new Error("stripe down");
        return real.sendMeterEvent(e);
      },
    });
    setStripeForTests(flaky);
    try {
      await repo.charge({ orgId: ORG, actorType: "user", actorId: OWNER.userId, surface: "API", operation: "test", credits: 7, matched: true });
      const [first] = await repo.reportOverageUsage(ORG);
      expect(first).toMatchObject({ status: "FAILED", credits: 7 });
      fail = false;
      const [retry] = await repo.reportOverageUsage(ORG);
      expect(retry).toMatchObject({ status: "SENT", credits: 7, identifier: first!.identifier });
    } finally {
      setStripeForTests(undefined);
    }
  });

  it("renewal resets the balance with the rollover rule; negative balance is not carried", async () => {
    if (!dbUp) return;
    await getSql()`UPDATE billing_accounts SET period_credits = 1000, rollover_pct = 50, rollover_cap = 300 WHERE org_id = ${ORG}`;
    expect(await repo.resetCreditPeriod(ORG, "period_reset")).toMatchObject({ balance: 1000, carried: 0 }); // was −57
    expect(await repo.resetCreditPeriod(ORG, "period_reset")).toMatchObject({ balance: 1300, carried: 300, expired: 700 });
    await getSql()`UPDATE billing_accounts SET rollover_cap = 0 WHERE org_id = ${ORG}`;
    expect(await repo.resetCreditPeriod(ORG, "period_reset")).toMatchObject({ balance: 1650, carried: 650 });
  });

  it("payment failure marks past_due and notifies admins; cancellation turns overage off", async () => {
    if (!dbUp) return;
    const acc = await repo.getBillingAccount(ORG);
    const send = async (ev: Record<string, unknown>) => {
      const body = JSON.stringify(ev);
      return repo.processStripeWebhook(body, signStripePayload(body, billingConfig().webhookSecret!));
    };
    await send({ id: `evt_t_${Date.now()}a`, type: "invoice.payment_failed", data: { object: { id: "in_t1", customer: acc.stripe_customer_id } } });
    expect((await repo.getBillingAccount(ORG)).subscription_status).toBe("past_due");
    const [n] = await getSql()`SELECT kind FROM notifications WHERE org_id = ${ORG} AND kind = 'billing.payment_failed'`;
    expect(n).toBeTruthy();
    await send({ id: `evt_t_${Date.now()}b`, type: "customer.subscription.deleted", data: { object: { id: acc.stripe_subscription_id, customer: acc.stripe_customer_id, status: "canceled", items: { data: [] } } } });
    expect((await repo.getBillingAccount(ORG)).subscription_status).toBe("canceled");
    const [b] = await getSql()`SELECT overage_limit FROM credit_balances WHERE org_id = ${ORG}`;
    expect(b!.overage_limit).toBe(0);
    await expect(repo.setOverage(OWNER, true)).rejects.toThrow(/active subscription/);
    // Unknown customers are recorded but change nothing.
    expect((await send({ id: `evt_t_${Date.now()}c`, type: "invoice.paid", data: { object: { id: "in_x", customer: "cus_nobody" } } })).status).toBe("ignored");
  });

  it("seat limit counts members and pending invites", async () => {
    if (!dbUp) return;
    await getSql()`UPDATE organization SET seats = 2 WHERE id = ${ORG}`;
    await repo.assertSeatAvailable(ORG);
    await getSql()`INSERT INTO invitation (id, organization_id, email, role, status, expires_at, inviter_id) VALUES ('inv_billtest1', ${ORG}, 'x@example.com', 'member', 'pending', now() + interval '1 day', ${OWNER.userId})`;
    await expect(repo.assertSeatAvailable(ORG)).rejects.toBeInstanceOf(repo.SeatLimitError);
    expect(await repo.seatUsage(ORG)).toMatchObject({ seats: 2, members: 1, pending: 1, available: 0 });
  });

  it("every billing change is in the audit log and the chain verifies", async () => {
    if (!dbUp) return;
    const rows = await repo.listAudit(OWNER, { action: "billing." });
    const actions = new Set(rows.map((r) => r.action));
    for (const a of ["billing.checkout.seats", "billing.created", "billing.period.reset", "billing.credits.purchased", "billing.overage.enable", "billing.payment_failed"]) expect(actions).toContain(a);
    expect(await repo.verifyAuditChain(ORG)).toMatchObject({ ok: true, legacy: 0 });
  });
});
