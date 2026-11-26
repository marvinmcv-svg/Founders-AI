/**
 * Minimal Stripe client (plan 0A billing: seat subscriptions + credit packs + metered overage).
 *
 * Own code over Stripe's REST API (form-encoded, `Idempotency-Key`), no SDK: we use six endpoints.
 * The host is fixed (api.stripe.com), never user-supplied, so it does not go through the egress proxy.
 *
 * Without `STRIPE_SECRET_KEY` (H13) the app runs in "contact sales" mode. With `BILLING_SIMULATOR=1`
 * (local / demo only) a `SimulatedStripe` client stands in: checkout links open an in-app page that
 * emits the same webhook events Stripe would, signed and verified like real ones.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type CheckoutInput = {
  mode: "subscription" | "payment";
  customerId: string;
  priceId: string;
  quantity: number;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  idempotencyKey?: string;
};

export type StripeObject = Record<string, unknown> & { id: string };

export interface StripeClient {
  readonly kind: "live" | "simulated";
  createCustomer(input: { email?: string | null; name: string; orgId: string }): Promise<StripeObject>;
  createCheckoutSession(input: CheckoutInput): Promise<{ id: string; url: string }>;
  createPortalSession(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  updateSubscriptionItemQuantity(itemId: string, quantity: number, idempotencyKey?: string): Promise<StripeObject>;
  retrieveSubscription(id: string): Promise<StripeObject>;
  /** Billing meter event (`/v1/billing/meter_events`). `identifier` makes retries safe. */
  sendMeterEvent(input: { eventName: string; customerId: string; value: number; identifier: string; timestamp?: number }): Promise<void>;
}

export class StripeApiError extends Error {
  constructor(
    public status: number,
    public code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "StripeApiError";
  }
}

/** Stripe's bracket form encoding: `a[b][0][c]=v`. */
export function formEncode(obj: Record<string, unknown>, prefix = ""): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === "object") parts.push(formEncode(item as Record<string, unknown>, `${key}[${i}]`));
        else parts.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof v === "object") {
      const inner = formEncode(v as Record<string, unknown>, key);
      if (inner) parts.push(inner);
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.filter(Boolean).join("&");
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ status: number; text(): Promise<string> }>;

export class HttpStripe implements StripeClient {
  readonly kind = "live" as const;
  constructor(
    private secretKey: string,
    private opts: { apiVersion?: string; fetch?: FetchLike; base?: string } = {},
  ) {}

  private async call(method: "GET" | "POST", path: string, body?: Record<string, unknown>, idempotencyKey?: string): Promise<StripeObject> {
    const headers: Record<string, string> = { authorization: `Bearer ${this.secretKey}` };
    if (this.opts.apiVersion) headers["stripe-version"] = this.opts.apiVersion;
    if (method === "POST") {
      headers["content-type"] = "application/x-www-form-urlencoded";
      headers["idempotency-key"] = idempotencyKey ?? randomBytes(16).toString("hex");
    }
    const f: FetchLike = this.opts.fetch ?? ((url, init) => fetch(url, init));
    const res = await f(`${this.opts.base ?? "https://api.stripe.com"}${path}`, { method, headers, body: body ? formEncode(body) : undefined });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      /* non-JSON error page */
    }
    if (res.status >= 400) {
      const err = (json.error ?? {}) as { message?: string; code?: string };
      throw new StripeApiError(res.status, err.code, err.message ?? `Stripe ${res.status}`);
    }
    return json as StripeObject;
  }

  createCustomer(input: { email?: string | null; name: string; orgId: string }) {
    return this.call("POST", "/v1/customers", { email: input.email ?? undefined, name: input.name, metadata: { org_id: input.orgId } }, `customer-${input.orgId}`);
  }

  async createCheckoutSession(input: CheckoutInput) {
    const body: Record<string, unknown> = {
      mode: input.mode,
      customer: input.customerId,
      line_items: [{ price: input.priceId, quantity: input.quantity }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.metadata.org_id,
      metadata: input.metadata,
      allow_promotion_codes: "true",
    };
    if (input.mode === "subscription") body.subscription_data = { metadata: input.metadata };
    else body.payment_intent_data = { metadata: input.metadata };
    const s = await this.call("POST", "/v1/checkout/sessions", body, input.idempotencyKey);
    return { id: s.id, url: String(s.url) };
  }

  async createPortalSession(input: { customerId: string; returnUrl: string }) {
    const s = await this.call("POST", "/v1/billing_portal/sessions", { customer: input.customerId, return_url: input.returnUrl });
    return { url: String(s.url) };
  }

  updateSubscriptionItemQuantity(itemId: string, quantity: number, idempotencyKey?: string) {
    return this.call("POST", `/v1/subscription_items/${encodeURIComponent(itemId)}`, { quantity, proration_behavior: "create_prorations" }, idempotencyKey);
  }

  retrieveSubscription(id: string) {
    return this.call("GET", `/v1/subscriptions/${encodeURIComponent(id)}`);
  }

  async sendMeterEvent(input: { eventName: string; customerId: string; value: number; identifier: string; timestamp?: number }) {
    await this.call(
      "POST",
      "/v1/billing/meter_events",
      { event_name: input.eventName, identifier: input.identifier, timestamp: input.timestamp ?? Math.floor(Date.now() / 1000), payload: { stripe_customer_id: input.customerId, value: input.value } },
      input.identifier,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Webhook signatures                                                  */
/* ------------------------------------------------------------------ */

export const WEBHOOK_TOLERANCE_S = 300;

export function signStripePayload(payload: string, secret: string, t = Math.floor(Date.now() / 1000)): string {
  const v1 = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

/** Verify `Stripe-Signature` (t=…,v1=…[,v1=…]) over the raw body. Throws on mismatch or stale timestamp. */
export function verifyStripeSignature(payload: string, header: string | null, secret: string, now = Math.floor(Date.now() / 1000)): void {
  if (!header) throw new Error("Missing Stripe-Signature header");
  const parts = header.split(",").map((p) => p.trim().split("=") as [string, string]);
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!Number.isFinite(t) || !sigs.length) throw new Error("Malformed Stripe-Signature header");
  if (Math.abs(now - t) > WEBHOOK_TOLERANCE_S) throw new Error("Stripe-Signature timestamp outside tolerance");
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex"));
  const ok = sigs.some((s) => {
    const b = Buffer.from(s);
    return b.length === expected.length && timingSafeEqual(b, expected);
  });
  if (!ok) throw new Error("Stripe-Signature does not match");
}

/* ------------------------------------------------------------------ */
/* Simulator (local / demo, BILLING_SIMULATOR=1, never with a live key) */
/* ------------------------------------------------------------------ */

/**
 * Stateless: a simulated checkout session id carries its own parameters, signed with the
 * simulator secret, so any server instance can complete it.
 */
export class SimulatedStripe implements StripeClient {
  readonly kind = "simulated" as const;
  constructor(
    private secret: string,
    private appUrl: string,
    private seatPriceId: string | null = null,
  ) {}

  private seal(data: Record<string, unknown>): string {
    const body = Buffer.from(JSON.stringify(data)).toString("base64url");
    const mac = createHmac("sha256", this.secret).update(body).digest("base64url").slice(0, 22);
    return `${body}.${mac}`;
  }

  open(token: string): Record<string, unknown> {
    const [body, mac] = token.split(".");
    if (!body || !mac) throw new Error("Bad simulated session");
    const want = createHmac("sha256", this.secret).update(body).digest("base64url").slice(0, 22);
    if (want.length !== mac.length || !timingSafeEqual(Buffer.from(want), Buffer.from(mac))) throw new Error("Bad simulated session");
    return JSON.parse(Buffer.from(body, "base64url").toString()) as Record<string, unknown>;
  }

  async createCustomer(input: { email?: string | null; name: string; orgId: string }) {
    return { id: `cus_sim_${input.orgId.replace(/^org_/, "").slice(0, 20)}`, email: input.email ?? null, name: input.name };
  }

  async createCheckoutSession(input: CheckoutInput) {
    const token = this.seal({ ...input, idempotencyKey: undefined, nonce: randomBytes(6).toString("hex") });
    return { id: `cs_sim_${token.slice(-12)}`, url: `${this.appUrl.replace(/\/$/, "")}/settings/billing/simulate?s=${encodeURIComponent(token)}` };
  }

  async createPortalSession(input: { customerId: string; returnUrl: string }) {
    return { url: `${input.returnUrl}${input.returnUrl.includes("?") ? "&" : "?"}portal=simulated` };
  }

  async updateSubscriptionItemQuantity(itemId: string, quantity: number) {
    return { id: itemId, object: "subscription_item", quantity };
  }

  async retrieveSubscription(id: string) {
    return { id, object: "subscription", status: "active", items: { data: [{ id: `si_sim_${id.slice(-10)}`, price: { id: this.seatPriceId }, quantity: 1 }] } };
  }

  readonly meterEvents: { eventName: string; customerId: string; value: number; identifier: string }[] = [];
  async sendMeterEvent(input: { eventName: string; customerId: string; value: number; identifier: string }) {
    if (this.meterEvents.some((e) => e.identifier === input.identifier)) return; // Stripe dedupes by identifier
    this.meterEvents.push(input);
  }
}
