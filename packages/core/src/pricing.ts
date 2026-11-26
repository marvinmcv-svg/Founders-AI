/** Credit price table (plan Section 11). Config, not law — change freely. */
export const CREDIT_PRICES = {
  "entity.by_id": 1,
  "entity.enrich": 1,
  "person.email": 5,
  "estimates.record": 2,
  "feed.per_100": 1,
  "saved_results.per_100": 1,
  "ai_search.query": 5,
  "extract.entity": 1,
  "export.per_100": 1,
  /** Agent: a turn on the rules engine; Claude turns cost per 10k tokens (input + output). */
  "agent.turn": 1,
  "agent.per_10k_tokens": 1,
  free: 0,
} as const;

export type PricedOperation = keyof typeof CREDIT_PRICES;

/** Credits for a page of `n` records at `per100` credits per 100 (rounded up; empty page is free). */
export function pageCost(n: number, per100: number = CREDIT_PRICES["feed.per_100"]): number {
  if (n <= 0) return 0;
  return Math.ceil(n / 100) * per100;
}

/**
 * Credit packs sold through Stripe (plan 14.1). Sizes are config; prices live on the Stripe price
 * named by each pack's env var (H13: "contact sales" until the account and prices exist).
 */
export const CREDIT_PACKS = [
  { id: "pack_10k", credits: 10_000, priceEnv: "STRIPE_PRICE_CREDITS_10K" },
  { id: "pack_50k", credits: 50_000, priceEnv: "STRIPE_PRICE_CREDITS_50K" },
  { id: "pack_250k", credits: 250_000, priceEnv: "STRIPE_PRICE_CREDITS_250K" },
] as const;
export type CreditPackId = (typeof CREDIT_PACKS)[number]["id"];

/** Annual per-user platform seat (plan 14.1: required for API access). */
export const SEAT_PRICE_ENV = "STRIPE_PRICE_SEAT_ANNUAL";
/** Stripe billing meter for credits used past zero when overage is on. */
export const CREDIT_OVERAGE_METER = "founders_credit_overage";
