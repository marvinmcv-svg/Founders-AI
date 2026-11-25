import { describe, expect, it } from "vitest";
import { parseRules } from "../src/nl";
import { validateFilter } from "../src/filters";
import { pageCost } from "../src/pricing";
import { floorPlus, csvCell } from "../src/format";
import { estimateV0 } from "../src/estimates";

describe("NL → filters (rules engine)", () => {
  it("parses a LatAm seed fintech query", () => {
    const r = parseRules("seed fintech in Bolivia growing fast");
    expect(r.product).toBe("companies");
    const fields = r.filter.children.map((c) => ("field" in c ? c.field : ""));
    expect(fields).toEqual(expect.arrayContaining(["hq_country", "sector", "growth_stage", "headcount_growth_3m"]));
    expect(validateFilter("companies", r.filter).ok).toBe(true);
  });
  it("routes to the right product", () => {
    expect(parseRules("serial founders with a prior exit in Mexico").product).toBe("people");
    expect(parseRules("VCs that lead seed rounds in Latin America").product).toBe("investors");
    expect(parseRules("Series A rounds in the last 90 days").product).toBe("funding_rounds");
    expect(parseRules("stealth founders this month").product).toBe("talent_signals");
  });
  it("parses amounts", () => {
    const r = parseRules("companies that raised more than $5M");
    expect(r.filter.children).toContainEqual({ kind: "condition", field: "total_funding_usd", operator: "gte", value: 5_000_000 });
  });
  it("always produces a valid filter", () => {
    for (const q of ["", "anything at all", "agtech in Paraguay and Brazil, 11-50 employees, founded after 2020", "B2B SaaS bootstrapped"]) {
      const r = parseRules(q);
      expect(validateFilter(r.product, r.filter).ok).toBe(true);
    }
  });
});

describe("pricing, formatting, estimates", () => {
  it("charges per 100 rounded up; empty pages are free", () => {
    expect(pageCost(0)).toBe(0);
    expect(pageCost(1)).toBe(1);
    expect(pageCost(100)).toBe(1);
    expect(pageCost(101)).toBe(2);
  });
  it("floor-rounds public numbers", () => {
    expect(floorPlus(50_000)).toBe("50K+");
    expect(floorPlus(1_290_000)).toBe("1.2M+");
    expect(floorPlus(3_000)).toBe("3K+");
  });
  it("neutralises CSV injection", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
  });
  it("v0 estimate honours disclosures and bands", () => {
    const e = estimateV0({ employeeCount: 40, sector: "Financial Services", growthStage: "Early", region: "Latin America", lastPostMoneyUsd: null, monthsSinceLastRound: null });
    expect(e.revenueP10).toBeLessThan(e.revenueP50);
    expect(e.revenueP90).toBeGreaterThan(e.revenueP50);
    expect(e.confidence).toBe("LOW");
    const d = estimateV0({ employeeCount: 40, sector: "Financial Services", growthStage: "Early", region: "Latin America", lastPostMoneyUsd: null, monthsSinceLastRound: null, disclosureUsd: 3_000_000 });
    expect(d.revenueP50).toBe(3_000_000);
    expect(d.confidence).toBe("MEDIUM");
  });
});
