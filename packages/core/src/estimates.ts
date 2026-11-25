/**
 * Revenue & valuation estimate — v0 heuristic (plan 9.6). Labelled "Modeled (v0)" in the UI.
 * revenue_p50 = headcount × revenue-per-employee(sector, stage, region); P10/P90 = ×0.5 / ×1.8.
 * Confidence LOW unless a verified disclosure exists, then P50 = disclosure and confidence MEDIUM.
 */

export const MODEL_VERSION = "v0-heuristic";

/** Annual revenue per employee (USD). Hand-curated priors; ML model replaces these in R2. */
const RPE_BY_SECTOR: Record<string, number> = {
  "Financial Services": 160_000,
  "Software & Internet": 150_000,
  "Artificial Intelligence": 170_000,
  "Health & Life Sciences": 120_000,
  "Commerce & Consumer": 180_000,
  "Climate & Energy": 140_000,
  "Agriculture & Food Systems": 110_000,
  "Mobility & Logistics": 130_000,
  "Real Estate & Construction": 125_000,
  "Education & Work": 90_000,
  "Industrials & Hardware": 135_000,
  "Media & Entertainment": 115_000,
};

const STAGE_FACTOR: Record<string, number> = {
  "Pre-seed / Seed": 0.25,
  Early: 0.55,
  Growth: 0.9,
  Late: 1.15,
  "Exit / Public": 1.3,
};

const REGION_FACTOR: Record<string, number> = {
  "Latin America": 0.55,
  "North America": 1.0,
  Europe: 0.85,
};

/** Forward revenue multiple by sector for the valuation fallback. */
const SECTOR_MULTIPLE: Record<string, number> = {
  "Financial Services": 8,
  "Software & Internet": 10,
  "Artificial Intelligence": 18,
  "Health & Life Sciences": 7,
  "Commerce & Consumer": 3,
  "Climate & Energy": 6,
  "Agriculture & Food Systems": 4,
  "Mobility & Logistics": 3,
  "Real Estate & Construction": 4,
  "Education & Work": 5,
  "Industrials & Hardware": 5,
  "Media & Entertainment": 4,
};

const STAGE_DRIFT: Record<string, number> = {
  "Pre-seed / Seed": 1.1,
  Early: 1.15,
  Growth: 1.2,
  Late: 1.1,
  "Exit / Public": 1.0,
};

export type EstimateInput = {
  employeeCount: number | null;
  sector: string | null;
  growthStage: string;
  region: string | null;
  lastPostMoneyUsd: number | null;
  monthsSinceLastRound: number | null;
  disclosureUsd?: number | null;
};

export type Estimate = {
  revenueP10: number;
  revenueP50: number;
  revenueP90: number;
  valuationP10: number;
  valuationP50: number;
  valuationP90: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  drivers: { label: string; impact: number }[];
  modelVersion: string;
};

export function estimateV0(input: EstimateInput): Estimate {
  const heads = Math.max(1, input.employeeCount ?? 5);
  const rpe = RPE_BY_SECTOR[input.sector ?? ""] ?? 120_000;
  const stage = STAGE_FACTOR[input.growthStage] ?? 0.5;
  const region = REGION_FACTOR[input.region ?? ""] ?? 0.8;
  const modeled = heads * rpe * stage * region;
  const disclosure = typeof input.disclosureUsd === "number" && input.disclosureUsd > 0 ? input.disclosureUsd : null;
  const p50 = disclosure ?? modeled;
  const spreadLo = disclosure ? 0.8 : 0.5;
  const spreadHi = disclosure ? 1.25 : 1.8;

  const multiple = SECTOR_MULTIPLE[input.sector ?? ""] ?? 5;
  let valuation: number;
  const drivers: { label: string; impact: number }[] = [];
  if (input.lastPostMoneyUsd && input.lastPostMoneyUsd > 0) {
    const years = Math.max(0, (input.monthsSinceLastRound ?? 0) / 12);
    const drift = Math.pow(STAGE_DRIFT[input.growthStage] ?? 1.1, years);
    valuation = Math.max(input.lastPostMoneyUsd * drift, p50 * multiple * 0.5);
    drivers.push(
      { label: "Last priced round", impact: 0.55 },
      { label: "Time since round", impact: Math.round((drift - 1) * 100) / 100 },
      { label: "Est. revenue", impact: 0.25 },
    );
  } else {
    valuation = p50 * multiple;
    drivers.push({ label: "Est. revenue", impact: 0.7 }, { label: "Sector multiple", impact: 0.2 });
  }
  drivers.push({ label: "HQ region", impact: Math.round((region - 0.8) * 100) / 100 });

  return {
    revenueP10: Math.round(p50 * spreadLo),
    revenueP50: Math.round(p50),
    revenueP90: Math.round(p50 * spreadHi),
    valuationP10: Math.round(valuation * 0.6),
    valuationP50: Math.round(valuation),
    valuationP90: Math.round(valuation * 1.6),
    confidence: disclosure ? "MEDIUM" : "LOW",
    drivers,
    modelVersion: MODEL_VERSION,
  };
}
