/**
 * Runs the 50-prompt agent eval in CI (plan 10.1: "runs in CI on agent changes") on the rules
 * engine, which needs no API key. Every prompt must pass every grader; zero unsourced numbers.
 */
import { afterAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
config({ path: "../../.env", quiet: true });
process.env.ANTHROPIC_API_KEY = "";
import { getSql } from "@founders/db";
import { PROMPTS } from "../src/prompts";
import { runEvals, summarize, uncitedLines } from "../src/run";

let dbUp = false;
try {
  const [r] = await getSql()`SELECT count(*)::int AS n FROM companies`;
  dbUp = Number(r?.n) > 0;
} catch {
  dbUp = false;
}

afterAll(async () => {
  await getSql().end({ timeout: 1 });
});

describe("agent eval set", () => {
  it("has 50 prompts covering all nine use cases of plan 10.6 plus safety", () => {
    expect(PROMPTS).toHaveLength(50);
    expect(new Set(PROMPTS.map((p) => p.id)).size).toBe(50);
    const cases = new Set(PROMPTS.map((p) => p.useCase));
    for (const c of ["sourcing", "diligence", "market-maps", "monitoring", "outreach", "crm-enrichment", "competitive-intel", "talent", "reporting", "safety"]) expect(cases.has(c as never)).toBe(true);
  });

  it("flags figure lines without a source chip", () => {
    expect(uncitedLines("- Raised $12M in 2024")).toHaveLength(1);
    expect(uncitedLines("- Raised $12M [[com_abc123456]]")).toHaveLength(0);
    expect(uncitedLines("## Revenue in the last 30 days")).toHaveLength(0);
  });

  it.runIf(dbUp)("every prompt passes every grader (rules engine)", async () => {
    const grades = await runEvals({ engine: "rules" });
    const failed = grades.filter((g) => !g.pass).map((g) => `${g.id}: ${Object.entries(g.checks).filter(([, v]) => !v).map(([k]) => k).join(",")}`);
    expect(failed).toEqual([]);
    const s = summarize(grades);
    expect(s.total).toBe(50);
    expect(s.unsourcedAnswers).toBe(0);
  });
});
