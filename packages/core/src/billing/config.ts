/** Resolves which Stripe client (if any) the app uses. See stripe.ts for the modes. */
import { createHash } from "node:crypto";
import { CREDIT_PACKS, CREDIT_OVERAGE_METER, SEAT_PRICE_ENV, type CreditPackId } from "../pricing";
import { HttpStripe, SimulatedStripe, type StripeClient } from "./stripe";

export type BillingMode = "live" | "simulated" | "contact_sales";

export type BillingConfig = {
  mode: BillingMode;
  seatPriceId: string | null;
  packs: { id: CreditPackId; credits: number; priceId: string | null }[];
  meterEvent: string;
  webhookSecret: string | null;
  appUrl: string;
};

type Env = Record<string, string | undefined>;

function appUrl(env: Env) {
  return env.BETTER_AUTH_URL ?? (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : (env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001"));
}

/** Simulator signing secret, derived so it needs no extra env var and never equals a real one. */
function simulatorSecret(env: Env) {
  return `whsec_sim_${createHash("sha256").update(`stripe-simulator|${env.BETTER_AUTH_SECRET ?? "dev"}`).digest("hex").slice(0, 32)}`;
}

export function billingConfig(env: Env = process.env): BillingConfig {
  const live = Boolean(env.STRIPE_SECRET_KEY);
  const simulated = !live && env.BILLING_SIMULATOR === "1";
  const mode: BillingMode = live ? "live" : simulated ? "simulated" : "contact_sales";
  const price = (name: string) => env[name] ?? (simulated ? `price_sim_${name.toLowerCase()}` : null);
  return {
    mode,
    seatPriceId: price(SEAT_PRICE_ENV),
    packs: CREDIT_PACKS.map((p) => ({ id: p.id, credits: p.credits, priceId: price(p.priceEnv) })),
    meterEvent: env.STRIPE_OVERAGE_METER_EVENT ?? CREDIT_OVERAGE_METER,
    webhookSecret: live ? (env.STRIPE_WEBHOOK_SECRET ?? null) : simulated ? simulatorSecret(env) : null,
    appUrl: appUrl(env),
  };
}

let override: StripeClient | null | undefined;
let cached: { key: string; client: StripeClient | null } | null = null;

/** Tests inject a client (or null for contact-sales mode); pass `undefined` to restore. */
export function setStripeForTests(c: StripeClient | null | undefined) {
  override = c;
}

export function getStripe(env: Env = process.env): StripeClient | null {
  if (override !== undefined) return override;
  const cfg = billingConfig(env);
  const key = `${cfg.mode}|${env.STRIPE_SECRET_KEY ?? ""}`;
  if (cached?.key === key) return cached.client;
  const client =
    cfg.mode === "live"
      ? new HttpStripe(env.STRIPE_SECRET_KEY!, { apiVersion: env.STRIPE_API_VERSION })
      : cfg.mode === "simulated"
        ? new SimulatedStripe(cfg.webhookSecret!, cfg.appUrl, cfg.seatPriceId)
        : null;
  cached = { key, client };
  return client;
}
