/**
 * Live public numbers (plan 1.2): read from the platform_stats view, floor-rounded ("52K+").
 * If the DB is unreachable, numbers are omitted rather than invented.
 */
import { floorPlus } from "@founders/core/format";
import { API_BULK_MAX, API_ENDPOINT_COUNT, CRM_INTEGRATION_COUNT, API_MAX_PAGE_SIZE, API_RATE_LIMIT_RPS, API_TRIAL_CREDITS, AGENT_CURATED_SKILL_COUNT, MCP_FREE_CALLS_PER_DAY, MCP_TOOL_COUNT, MCP_WRITE_TOOL_COUNT } from "@founders/core/limits";
import type { Vars } from "./copy";

export async function getStatVars(): Promise<Vars> {
  const limits = {
    "limits.trialCredits": API_TRIAL_CREDITS,
    "limits.pageSize": API_MAX_PAGE_SIZE.toLocaleString("en-US"),
    "limits.rps": API_RATE_LIMIT_RPS,
    "limits.bulk": API_BULK_MAX,
    "limits.endpoints": API_ENDPOINT_COUNT,
    "limits.mcpTools": MCP_TOOL_COUNT,
    "limits.mcpWriteTools": MCP_WRITE_TOOL_COUNT,
    "limits.mcpReadTools": MCP_TOOL_COUNT - MCP_WRITE_TOOL_COUNT,
    "limits.mcpFree": MCP_FREE_CALLS_PER_DAY,
    "limits.skills": AGENT_CURATED_SKILL_COUNT,
    "limits.crms": CRM_INTEGRATION_COUNT,
  };
  try {
    const { getPlatformStats } = await import("@founders/core/repo");
    // Never let a slow or unreachable DB stall a build or a render: cap at 5s, then fall back to words.
    const s = await Promise.race([getPlatformStats(), new Promise<null>((r) => setTimeout(() => r(null), 5000))]);
    if (!s) {
      console.warn("[stats] platform_stats unavailable (null or >5s); using word fallbacks");
      return { ...limits, ...fallbackVars() };
    }
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
      "stats.talent_signals": floorPlus(s.talent_signals),
      "stats.news_signals": floorPlus(s.news_signals),
      "stats.news_sources": floorPlus(s.news_sources),
      "stats.revenue_disclosures": floorPlus(s.revenue_disclosures),
    };
  } catch (e) {
    console.warn("[stats] platform_stats read failed:", e instanceof Error ? e.message : String(e));
    return { ...limits, ...fallbackVars() };
  }
}

/**
 * No DB (or slow DB at build time): words, not numbers — and always understated, never overstated
 * (plan 1.2: never publish a number we can't prove). Pages revalidate every 10 minutes at runtime.
 */
function fallbackVars(): Vars {
  return {
    "stats.companies": "thousands of",
    "stats.people": "tens of thousands of",
    "stats.investors": "hundreds of",
    "stats.transactions": "thousands of",
    "stats.rounds_30d": "dozens of",
    "stats.talent_signals_7d": "Hundreds of",
    "stats.latam_companies": "Many",
    "stats.countries": "many",
    "stats.talent_signals": "thousands of",
    "stats.news_signals": "hundreds of",
    "stats.news_sources": "dozens of",
    "stats.revenue_disclosures": "hundreds of",
  };
}

/** True for formatter output like "52K+", "1.2M+" or "640" (not the word fallbacks). */
export function isNumericStat(v: string | number | undefined): boolean {
  return /^[\d.,]+[KMB]?\+?$/.test(String(v ?? "").trim());
}
