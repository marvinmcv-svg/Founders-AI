/**
 * Live public numbers (plan 1.2): read from the platform_stats view, floor-rounded ("52K+").
 * If the DB is unreachable, numbers are omitted rather than invented.
 */
import { floorPlus } from "@founders/core/format";
import { API_BULK_MAX, API_MAX_PAGE_SIZE, API_RATE_LIMIT_RPS, API_TRIAL_CREDITS } from "@founders/core/limits";
import type { Vars } from "./copy";

export async function getStatVars(): Promise<Vars> {
  const limits = {
    "limits.trialCredits": API_TRIAL_CREDITS,
    "limits.pageSize": API_MAX_PAGE_SIZE.toLocaleString("en-US"),
    "limits.rps": API_RATE_LIMIT_RPS,
    "limits.bulk": API_BULK_MAX,
  };
  try {
    const { getPlatformStats } = await import("@founders/core/repo");
    // Never let a slow or unreachable DB stall a build or a render: cap at 5s, then fall back to words.
    const s = await Promise.race([getPlatformStats(), new Promise<null>((r) => setTimeout(() => r(null), 5000))]);
    if (!s) return { ...limits, ...fallbackVars() };
    return {
      ...limits,
      "stats.companies": floorPlus(s.companies),
      "stats.people": floorPlus(s.people),
      "stats.investors": floorPlus(s.investors),
      "stats.transactions": floorPlus(s.transactions),
      "stats.rounds_30d": floorPlus(s.rounds_30d),
      "stats.talent_signals_7d": floorPlus(s.talent_signals_7d),
      "stats.latam_companies": floorPlus(s.latam_companies),
      "stats.countries": s.countries,
    };
  } catch {
    return { ...limits, ...fallbackVars() };
  }
}

/** No DB: show words, not numbers. */
function fallbackVars(): Vars {
  return {
    "stats.companies": "thousands of",
    "stats.people": "hundreds of thousands of",
    "stats.investors": "thousands of",
    "stats.transactions": "tens of thousands of",
    "stats.rounds_30d": "hundreds of",
    "stats.talent_signals_7d": "Thousands of",
    "stats.latam_companies": "Most",
    "stats.countries": "many",
  };
}
