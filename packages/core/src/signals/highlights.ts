/**
 * Highlights v2 (plan 7.4): computed flags, recomputed daily from data — not assigned at seed time.
 * v1 → v2 changes: growth flags are relative to the company's growth stage (percentile) as well as
 * absolute; people/investor flags are derived from experience, exits and rounds; a highlight
 * history drives `new_highlights` (added in the last 30 days).
 *
 * Every rule is a pure function so it can be unit-tested and explained in the UI.
 */

export const HIGHLIGHTS_VERSION = "v2";

/** Thresholds live here (config), not inside the rules. */
export const HIGHLIGHT_THRESHOLDS = {
  company: {
    surgeGrowth3m: 0.25,
    strongGrowth3m: 0.1,
    strongGrowthStagePct: 0.85,
    minHeadcount: 10,
    webGrowth3m: 0.3,
    minWebVisits: 1000,
    socialGrowth3m: 0.2,
    recentlyFundedDays: 180,
    noRecentFundingDays: 730,
  },
  person: { connectorPct: 0.95, influencerPct: 0.95, stealthDays: 365 },
  investor: { leadMin: 10, activeDeals12m: 3, followOn: 0.35, unicornUsd: 1_000_000_000 },
  newWindowDays: 30,
} as const;

/* ------------------------------------------------------------------ */
/* Percentiles                                                         */
/* ------------------------------------------------------------------ */

/** Percentile rank in [0,1] for each value within its group (ties share the lower rank). */
export function percentileRanks<T>(items: T[], group: (x: T) => string, value: (x: T) => number | null): Map<T, number> {
  const byGroup = new Map<string, T[]>();
  for (const it of items) {
    if (value(it) === null) continue;
    const g = group(it);
    byGroup.set(g, [...(byGroup.get(g) ?? []), it]);
  }
  const out = new Map<T, number>();
  for (const xs of byGroup.values()) {
    const sorted = [...xs].sort((a, b) => (value(a) as number) - (value(b) as number));
    const n = sorted.length;
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && value(sorted[j + 1] as T) === value(sorted[i] as T)) j++;
      for (let k = i; k <= j; k++) out.set(sorted[k] as T, n === 1 ? 1 : i / (n - 1));
      i = j + 1;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Companies                                                           */
/* ------------------------------------------------------------------ */

export type CompanyHighlightInput = {
  employeeCount: number | null;
  headcountGrowth3m: number | null;
  /** Percentile of headcount growth within the company's growth stage (0–1). */
  headcountGrowthStagePct: number | null;
  webVisits: number | null;
  webVisitsGrowth3m: number | null;
  socialGrowth3m: number | null;
  hasTier1Investor: boolean;
  hasAccelerator: boolean;
  daysSinceLastRound: number | null;
  bootstrapped: boolean;
};

export function companyHighlights(c: CompanyHighlightInput): string[] {
  const t = HIGHLIGHT_THRESHOLDS.company;
  const out: string[] = [];
  const heads = c.employeeCount ?? 0;
  const g = c.headcountGrowth3m ?? 0;
  const pct = c.headcountGrowthStagePct ?? 0;
  if (heads >= t.minHeadcount && g >= t.surgeGrowth3m) out.push("headcount_surge");
  else if (heads >= t.minHeadcount && g >= t.strongGrowth3m && pct >= t.strongGrowthStagePct) out.push("strong_headcount_growth");
  if ((c.webVisits ?? 0) >= t.minWebVisits && (c.webVisitsGrowth3m ?? 0) >= t.webGrowth3m) out.push("strong_web_traffic_growth");
  if ((c.socialGrowth3m ?? 0) >= t.socialGrowth3m) out.push("strong_social_growth");
  if (c.hasTier1Investor) out.push("top_tier_investors");
  if (c.hasAccelerator) out.push("accelerator_backed");
  if (c.daysSinceLastRound !== null && c.daysSinceLastRound <= t.recentlyFundedDays) out.push("recently_funded");
  if (!c.bootstrapped && (c.daysSinceLastRound === null || c.daysSinceLastRound > t.noRecentFundingDays)) out.push("no_recent_funding");
  return out;
}

/* ------------------------------------------------------------------ */
/* People                                                              */
/* ------------------------------------------------------------------ */

export type PersonHighlightInput = {
  founderRoles: number;
  /** Founder or early (first 2 years) at a company later acquired. */
  foundedAcquired: boolean;
  foundedIpo: boolean;
  majorEmployer: boolean;
  topUniversity: boolean;
  connectionsPct: number | null;
  followersPct: number | null;
  recentStealthSignal: boolean;
  repeatCofounder: boolean;
};

/** Highlights v2 derives these from data; any other highlight on a person is provider-sourced and kept as is. */
export const COMPUTED_PERSON_HIGHLIGHTS = [
  "Serial Founder",
  "Prior Exit",
  "Prior IPO",
  "Major Tech Experience",
  "Top University",
  "Hyper Connector",
  "Influencer",
  "Stealth",
  "Repeat Co-founders",
] as const;

export function personHighlights(p: PersonHighlightInput): string[] {
  const t = HIGHLIGHT_THRESHOLDS.person;
  const out: string[] = [];
  if (p.founderRoles >= 2) out.push("Serial Founder");
  if (p.foundedAcquired) out.push("Prior Exit");
  if (p.foundedIpo) out.push("Prior IPO");
  if (p.majorEmployer) out.push("Major Tech Experience");
  if (p.topUniversity) out.push("Top University");
  if ((p.connectionsPct ?? 0) >= t.connectorPct) out.push("Hyper Connector");
  if ((p.followersPct ?? 0) >= t.influencerPct) out.push("Influencer");
  if (p.recentStealthSignal) out.push("Stealth");
  if (p.repeatCofounder) out.push("Repeat Co-founders");
  return out;
}

/* ------------------------------------------------------------------ */
/* Investors                                                           */
/* ------------------------------------------------------------------ */

export type InvestorHighlightInput = {
  curatedTier1: boolean;
  leadsCount: number;
  deals12m: number;
  followOnRate: number | null;
  maxPortfolioValuationUsd: number | null;
};

export function investorHighlights(i: InvestorHighlightInput): string[] {
  const t = HIGHLIGHT_THRESHOLDS.investor;
  const out: string[] = [];
  if (i.curatedTier1) out.push("Tier-1"); // curated list (editorial), not computed
  if (i.leadsCount >= t.leadMin) out.push("Lead investor");
  if (i.deals12m >= t.activeDeals12m) out.push("Active");
  if ((i.maxPortfolioValuationUsd ?? 0) >= t.unicornUsd) out.push("Unicorn backer");
  if ((i.followOnRate ?? 0) > t.followOn) out.push("High follow-on rate");
  return out;
}

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

/** Merge computed highlights with ones this version does not compute (kept from the provider). */
export function mergeHighlights(previous: string[], computed: string[], computedUniverse: readonly string[]): string[] {
  const keep = previous.filter((h) => !computedUniverse.includes(h));
  return [...new Set([...computed, ...keep])].sort();
}

export function diffHighlights(previous: string[], next: string[]): { added: string[]; removed: string[] } {
  const p = new Set(previous);
  const n = new Set(next);
  return { added: [...n].filter((h) => !p.has(h)), removed: [...p].filter((h) => !n.has(h)) };
}
