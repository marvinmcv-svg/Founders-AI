/**
 * Traffic, social, app-store and review-site data (plan 7.7 Traction Metrics & Reviews tabs).
 * Real sources need licences (Similarweb-type panels, G2/Trustpilot APIs, app-store data) — H5;
 * each implements one of these interfaces.
 *
 * The synthetic adapters are deterministic per company (seeded by company id) and consistent with the
 * company's existing headcount / web / LinkedIn series, so re-running the job yields the same values.
 */
import { Rng } from "@founders/core/random";
import type { ReviewsDetail, ReviewSource, TractionSnapshot } from "@founders/db/schema";

export type CompanyBasics = {
  id: string;
  name: string;
  customerFocus: string | null;
  businessModels: string[];
  hqCountry: string | null;
  hqRegion: string | null;
  /** month (YYYY-MM-01) → value */
  webVisits: Map<string, number>;
  linkedinFollowers: Map<string, number>;
  reviews: Record<string, { rating: number; count: number }> | null;
};

export type MetricPoint = { metric: string; month: string; value: number };

export interface TrafficProvider {
  readonly name: string;
  traffic(c: CompanyBasics): { points: MetricPoint[]; snapshot: TractionSnapshot | null };
}

export interface ReviewsProvider {
  readonly name: string;
  reviews(c: CompanyBasics, months: string[]): ReviewsDetail | null;
}

function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

const NEIGHBOURS: Record<string, string[]> = {
  "Latin America": ["Brazil", "Mexico", "Argentina", "Colombia", "Chile", "Peru", "Bolivia", "United States"],
  "North America": ["United States", "Canada", "Mexico", "United Kingdom"],
  Europe: ["Spain", "Germany", "United Kingdom", "Portugal", "France", "United States"],
};

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

export class SyntheticTrafficProvider implements TrafficProvider {
  readonly name = "synthetic_traffic_panel";

  traffic(c: CompanyBasics) {
    const rng = new Rng(seedOf(c.id));
    const points: MetricPoint[] = [];
    const months = [...c.webVisits.keys()].sort();
    const b2c = c.customerFocus === "B2C" || c.customerFocus === "B2B2C";
    const latestVisits = c.webVisits.get(months[months.length - 1] ?? "") ?? 0;
    // Engagement metrics only where a panel would have enough traffic to measure them.
    if (latestVisits >= 10_000) {
      let bounce = clamp(rng.normal(b2c ? 0.52 : 0.42, 0.07), 0.2, 0.85);
      let pages = clamp(rng.normal(b2c ? 3.2 : 4.1, 0.8), 1.2, 9);
      let session = clamp(rng.normal(b2c ? 170 : 240, 50), 40, 700);
      for (const m of months) {
        bounce = clamp(bounce + rng.normal(0, 0.012), 0.2, 0.85);
        pages = clamp(pages + rng.normal(0, 0.08), 1.2, 9);
        session = clamp(session + rng.normal(0, 6), 40, 700);
        points.push({ metric: "bounce_rate", month: m, value: round(bounce, 3) }, { metric: "pages_per_visit", month: m, value: round(pages) }, { metric: "avg_session_s", month: m, value: Math.round(session) });
      }
    }
    // X / Instagram follow LinkedIn's shape with a company-specific ratio.
    const xRatio = rng.logRange(0.15, 1.6);
    const igRatio = b2c ? rng.logRange(0.4, 4) : rng.logRange(0.05, 0.5);
    for (const m of months) {
      const li = c.linkedinFollowers.get(m);
      if (li === undefined) continue;
      points.push({ metric: "x_followers", month: m, value: Math.round(li * xRatio * (1 + rng.normal(0, 0.01))) });
      points.push({ metric: "instagram_followers", month: m, value: Math.round(li * igRatio * (1 + rng.normal(0, 0.015))) });
    }
    // Mobile apps: most consumer companies, few B2B ones.
    if (rng.chance(b2c ? 0.6 : 0.08)) {
      let installs = rng.logRange(2_000, 400_000);
      let rating = clamp(rng.normal(4.2, 0.35), 2.5, 4.9);
      for (const m of months) {
        const v = c.webVisits.get(m) ?? 0;
        const prev = c.webVisits.get(months[Math.max(0, months.indexOf(m) - 1)] ?? m) ?? v;
        installs *= 1 + clamp(prev ? (v - prev) / prev : 0, -0.2, 0.4) * 0.8 + rng.normal(0.01, 0.01);
        rating = clamp(rating + rng.normal(0, 0.03), 2.5, 4.9);
        points.push({ metric: "app_installs", month: m, value: Math.round(installs) }, { metric: "app_rating", month: m, value: round(rating, 2) });
      }
    }
    if (c.businessModels.includes("SaaS") && rng.chance(0.05)) {
      let users = rng.logRange(500, 60_000);
      for (const m of months) {
        users *= 1 + rng.normal(0.02, 0.03);
        points.push({ metric: "chrome_extension_users", month: m, value: Math.round(users) });
      }
    }
    if (latestVisits <= 0) return { points, snapshot: null };

    const sources = ["direct", "search", "social", "referral", "paid", "email"];
    const raw = sources.map((s) => rng.logRange(s === "direct" || s === "search" ? 8 : 1, s === "direct" || s === "search" ? 45 : 18) * (s === "social" && b2c ? 1.8 : 1));
    const total = raw.reduce((a, x) => a + x, 0);
    const home = c.hqCountry ?? "United States";
    const others = rng.pickN((NEIGHBOURS[c.hqRegion ?? ""] ?? NEIGHBOURS["North America"]!).filter((x) => x !== home), rng.int(2, 4));
    const homeShare = clamp(rng.normal(0.62, 0.12), 0.3, 0.92);
    const w = others.map(() => rng.next() + 0.2);
    const wt = w.reduce((a, x) => a + x, 0);
    const rest = 1 - homeShare;
    const countries = [{ country: home, share: round(homeShare, 3) }, ...others.map((country, i) => ({ country, share: round((rest * 0.85 * (w[i] ?? 0)) / wt, 3) }))];
    countries.push({ country: "Other", share: round(Math.max(0, 1 - countries.reduce((a, x) => a + x.share, 0)), 3) });
    return {
      points,
      snapshot: { traffic_sources: Object.fromEntries(sources.map((s, i) => [s, round((raw[i] ?? 0) / total, 3)])), countries, fetched_at: new Date().toISOString(), source: this.name },
    };
  }
}

const PRODUCT_SUFFIX = ["Platform", "Analytics", "API", "Mobile", "Cloud"];

export class SyntheticReviewsProvider implements ReviewsProvider {
  readonly name = "synthetic_reviews";

  reviews(c: CompanyBasics, months: string[]): ReviewsDetail | null {
    const rng = new Rng(seedOf(`${c.id}:reviews`));
    const b2c = c.customerFocus === "B2C" || c.customerFocus === "B2B2C";
    const out: ReviewsDetail = {};
    const now = new Date().toISOString();
    const build = (source: ReviewSource, rating: number, count: number, products: number) => {
      const hist: { month: string; rating: number; count: number }[] = [];
      let n = count;
      let r = rating;
      for (const m of [...months].reverse().slice(0, 6)) {
        hist.unshift({ month: m, rating: round(clamp(r, 1, 5), 1), count: Math.max(0, Math.round(n)) });
        n /= 1 + rng.float(0.02, 0.12);
        r += rng.normal(0, 0.05);
      }
      const names = rng.pickN(PRODUCT_SUFFIX, products).map((sfx) => `${c.name} ${sfx}`);
      const split = names.map(() => rng.next() + 0.3);
      const st = split.reduce((a, x) => a + x, 0);
      out[source] = {
        rating: round(rating, 1),
        count,
        products: names.map((name, i) => ({ name, rating: round(clamp(rating + rng.normal(0, 0.15), 1, 5), 1), count: Math.max(1, Math.round((count * (split[i] ?? 0)) / st)) })),
        history: hist,
        fetched_at: now,
      };
    };
    // G2 keeps the rating/count already on the company (provider-consistent).
    const g2 = c.reviews?.g2;
    if (g2) build("g2", g2.rating, g2.count, rng.int(1, 2));
    if (b2c && rng.chance(0.7)) build("trustpilot", clamp(rng.normal(4, 0.5), 1.8, 4.9), Math.round(rng.logRange(20, 8000)), 1);
    if (b2c && rng.chance(0.55)) {
      build("app_store", clamp(rng.normal(4.3, 0.3), 2.5, 4.9), Math.round(rng.logRange(50, 40_000)), 1);
      build("google_play", clamp(rng.normal(4.1, 0.35), 2.5, 4.9), Math.round(rng.logRange(80, 90_000)), 1);
    }
    if (c.businessModels.includes("SaaS") && rng.chance(0.05)) build("chrome_web_store", clamp(rng.normal(4.4, 0.3), 3, 5), Math.round(rng.logRange(10, 3000)), 1);
    return Object.keys(out).length ? out : null;
  }
}
