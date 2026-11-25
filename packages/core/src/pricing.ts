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
  free: 0,
} as const;

export type PricedOperation = keyof typeof CREDIT_PRICES;

/** Credits for a page of `n` records at `per100` credits per 100 (rounded up; empty page is free). */
export function pageCost(n: number, per100: number = CREDIT_PRICES["feed.per_100"]): number {
  if (n <= 0) return 0;
  return Math.ceil(n / 100) * per100;
}
