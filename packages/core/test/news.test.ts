import { describe, expect, it } from "vitest";
import labelled from "./fixtures/news-labelled.json";
import {
  candidateMentions,
  classifyNews,
  DUPLICATE_DISTANCE,
  extractFigures,
  hamming,
  linkCompanies,
  macroF1,
  scoreNews,
  simhash64,
  summarizeNews,
} from "../src/signals/news";

describe("news classification", () => {
  it("macro-F1 ≥ 0.8 on the labelled set (plan 15 Phase 4 target)", () => {
    const pairs = labelled.items.map((x) => ({ truth: x.category, pred: classifyNews(x.title, x.body).category }));
    const m = macroF1(pairs);
    const wrong = labelled.items.filter((_, i) => pairs[i]!.pred !== pairs[i]!.truth).map((x, i) => `${x.category}→${pairs.filter((p) => p.pred !== p.truth)[i]?.pred}: ${x.title}`);
    expect(wrong.length, wrong.join("\n")).toBeLessThanOrEqual(Math.ceil(labelled.items.length * 0.15));
    expect(m.macroF1).toBeGreaterThanOrEqual(0.8);
  });
});

describe("figures", () => {
  it("parses EN/ES/PT money, scales and currencies", () => {
    expect(extractFigures("Quillo raises $12M Series A").amounts[0]).toMatchObject({ usd: 12_000_000, kind: "funding" });
    expect(extractFigures("levanta US$ 2,5 millones en ronda semilla").amounts[0]).toMatchObject({ usd: 2_500_000, kind: "funding" });
    expect(extractFigures("capta R$ 30 milhões em rodada").amounts[0]?.usd).toBe(5_700_000);
    expect(extractFigures("hits $10M in annual recurring revenue").amounts[0]?.kind).toBe("revenue");
    expect(extractFigures("revenue of $1,250,000 last year").amounts[0]?.usd).toBe(1_250_000);
  });
  it("parses counts and percents", () => {
    const f = extractFigures("passes 2 million users and 50,000 merchants, up 40%");
    expect(f.counts.map((c) => c.value)).toEqual([2_000_000, 50_000]);
    expect(f.percents).toEqual([40]);
  });
});

describe("simhash dedupe", () => {
  const a = "Quillo raises $12M Series A to automate freight invoicing. The round was led by Condor Ventures with participation from existing backers. Quillo will use the capital to hire engineers in Lima and expand to Chile next year.";
  it("near-duplicates (syndicated copy) are within the threshold; different stories are not", () => {
    const syndicated = a.replace("Condor Ventures", "Condor Ventures (CV)").replace("next year", "in 2027");
    const other = "Farmly expands to Colombia and Peru. The agtech company launched in two new markets this week with a team of local agronomists and partners.";
    expect(hamming(simhash64(a), simhash64(a))).toBe(0);
    expect(hamming(simhash64(a), simhash64(syndicated))).toBeLessThanOrEqual(DUPLICATE_DISTANCE);
    expect(hamming(simhash64(a), simhash64(other))).toBeGreaterThan(DUPLICATE_DISTANCE * 2);
  });
});

describe("entity linking", () => {
  const cands = [
    { id: "com_1", name: "Quillo", aliases: [] },
    { id: "com_2", name: "Condor", aliases: [] },
    { id: "com_3", name: "Lima Labs", aliases: [] },
  ];
  it("keeps title mentions and repeated body mentions only", () => {
    const links = linkCompanies("Quillo raises $12M", "The round was led by Condor Ventures. Quillo will hire in Lima.", cands);
    expect(links.map((l) => l.companyId)).toEqual(["com_1"]);
  });
  it("extracts capitalised n-grams", () => {
    expect(candidateMentions("Andes Telecom acquires payments startup Tika")).toEqual(expect.arrayContaining(["Andes", "Andes Telecom", "Tika"]));
  });
});

describe("summary and score", () => {
  it("summaries are derived from facts", () => {
    const f = extractFigures("Quillo raises $12M Series A");
    expect(summarizeNews("Quillo", "funding", f, "Quillo raises $12M Series A")).toBe("Quillo raised $12.0M (Series A).");
  });
  it("big funding from a top publisher is major; other news is not", () => {
    const big = scoreNews({ category: "funding", figures: extractFigures("raises $120M Series C"), publisher: "Global Venture Daily", novelty: 1 });
    const minor = scoreNews({ category: "other", figures: extractFigures(""), publisher: "Unknown Blog", novelty: 0.5 });
    expect(big.isMajor).toBe(true);
    expect(minor.score).toBeLessThan(2);
    expect(big.score).toBeLessThanOrEqual(5);
  });
});
