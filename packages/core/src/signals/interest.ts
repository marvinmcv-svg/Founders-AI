/**
 * Interest signals (plan 9.4) — pure scoring and forecasting. Only **public** evidence is a source:
 *   SOCIAL_FOLLOW  an investor's partner publicly follows / engages the founders or company (X, GitHub)
 *   PUBLIC_CONTENT the investor's own public content mentions the company (blog, podcast, newsletter)
 *   EVENT          co-attendance at a public event or demo day
 *   FILING         SEC Form D / registry changes (late but anchoring)
 * Aggregated customer telemetry (source 5) is never used here (flag `interest_telemetry`, H8).
 */

export const INTEREST_SOURCES = ["SOCIAL_FOLLOW", "PUBLIC_CONTENT", "EVENT", "FILING"] as const;
export type InterestSource = (typeof INTEREST_SOURCES)[number];
export const INVESTOR_TYPES_INTEREST = ["VC", "PE", "CVC", "ANGEL", "STRATEGIC"] as const;

/** How much each kind of evidence says about intent (filing = strongest, a follow = weakest). */
export const SOURCE_WEIGHT: Record<InterestSource, number> = { SOCIAL_FOLLOW: 0.35, PUBLIC_CONTENT: 0.6, EVENT: 0.5, FILING: 1.0 };

export type Evidence = { source: InterestSource; date: string };

/**
 * Score 1–10 for one investor × target: evidence weight (diminishing), recency (45-day half-life),
 * and investor fit (stage / sector match, 0–1).
 */
export function interestScore(evidence: Evidence[], fit: number, now: Date = new Date()): number {
  if (!evidence.length) return 1;
  let s = 0;
  for (const e of evidence) {
    const ageDays = Math.max(0, (now.getTime() - new Date(e.date).getTime()) / 86_400_000);
    s += SOURCE_WEIGHT[e.source] * Math.pow(0.5, ageDays / 45);
  }
  const raw = (1 - Math.exp(-1.4 * s)) * (0.55 + 0.45 * Math.max(0, Math.min(1, fit)));
  return Math.max(1, Math.min(10, Math.round(1 + 9 * raw)));
}

export type FirmEngagement = { investorId: string | null; investorName: string; investorType: string; score: number; lastDate: string; leads: number };

/**
 * "Round forming" forecast (plan 7.10): probability of a raise within 90 days from the number and
 * strength of engaged firms, months since the last round, and headcount growth. Logistic with
 * hand-set coefficients until labelled outcomes exist (H15); reported as a band, not a promise.
 */
export function raiseForecast(firms: FirmEngagement[], monthsSinceLastRound: number | null, headcountGrowth3m: number | null): { probability: number; likelyLead: FirmEngagement | null; momentum: number } {
  const strong = firms.filter((f) => f.score >= 6).length;
  const momentum = firms.reduce((a, f) => a + f.score, 0);
  const since = monthsSinceLastRound ?? 24;
  const timing = since >= 12 && since <= 30 ? 0.8 : since < 6 ? -1.2 : 0;
  const z = -3.1 + 0.32 * strong + 0.035 * momentum + timing + 1.5 * Math.max(-0.2, Math.min(0.6, headcountGrowth3m ?? 0));
  const probability = Math.round(100 / (1 + Math.exp(-z))) / 100;
  const likelyLead = [...firms].sort((a, b) => b.leads * 2 + b.score - (a.leads * 2 + a.score))[0] ?? null;
  return { probability, likelyLead, momentum };
}
