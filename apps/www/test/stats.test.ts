import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlatformStats } from "@founders/core/repo";
import { getStatVars, isNumericStat, resetStatsCache } from "@/lib/stats";

const STATS: PlatformStats = {
  companies: 10_412, people: 52_310, investors: 640, transactions: 9_301, funding_rounds: 7_000,
  talent_signals: 3_200, talent_signals_7d: 199, rounds_30d: 41, news_signals: 175, news_sources: 32,
  revenue_disclosures: 470, latam_companies: 1_250, countries: 38, refreshed_at: "2026-11-26T00:00:00Z",
};

afterEach(() => {
  resetStatsCache();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("getStatVars", () => {
  it("renders numbers when platform_stats has a row", async () => {
    const vars = await getStatVars(async () => STATS);
    expect(isNumericStat(vars["stats.companies"])).toBe(true);
    expect(isNumericStat(vars["stats.people"])).toBe(true);
    expect(vars["stats.countries"]).toBe(38);
  });

  it("shares one read across concurrent pages", async () => {
    const loader = vi.fn(async () => STATS);
    await Promise.all(Array.from({ length: 50 }, () => getStatVars(loader)));
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("falls back to words and logs the real database error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const vars = await getStatVars(async () => {
      throw new Error("password authentication failed");
    });
    expect(isNumericStat(vars["stats.companies"])).toBe(false);
    await Promise.resolve();
    expect(warn.mock.calls.flat().join(" ")).toContain("password authentication failed");
  });

  it("says when the view is empty", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const vars = await getStatVars(async () => null);
    expect(isNumericStat(vars["stats.people"])).toBe(false);
    await Promise.resolve();
    expect(warn.mock.calls.flat().join(" ")).toContain("empty");
  });

  it("times out instead of stalling a render", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const p = getStatVars(() => new Promise<PlatformStats | null>(() => {}));
    await vi.advanceTimersByTimeAsync(5_000);
    const vars = await p;
    expect(isNumericStat(vars["stats.companies"])).toBe(false);
    expect(warn.mock.calls.flat().join(" ")).toContain("timed out");
  });

  it("retries after the cache window", async () => {
    vi.useFakeTimers();
    const loader = vi.fn(async () => STATS);
    await getStatVars(loader);
    vi.setSystemTime(Date.now() + 61_000);
    await getStatVars(loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
