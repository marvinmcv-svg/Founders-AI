import { describe, expect, it } from "vitest";
import { overlapScore, rankCompetitors, semanticSimilarity, type CompetitorFeatures } from "../src/signals/competitors";
import { cosine, HashingTfidfEmbedder, tokenize } from "../src/signals/embeddings";

describe("hashing TF-IDF embedder", () => {
  const docs = [
    "Payroll software for mid-market finance teams in Brazil",
    "Payroll and benefits software for finance teams in Mexico",
    "Battery technology for logistics operators in Germany",
    "Quick commerce for retailers in Colombia",
  ];
  const emb = new HashingTfidfEmbedder().fit(docs.map(tokenize));
  const v = docs.map((d) => emb.embedTokens(tokenize(d)));
  it("is 256-d and unit length", () => {
    expect(v[0]).toHaveLength(256);
    expect(Math.abs(Math.sqrt(v[0]!.reduce((a, x) => a + x * x, 0)) - 1)).toBeLessThan(1e-3);
  });
  it("puts related products closer than unrelated ones", () => {
    expect(cosine(v[0]!, v[1]!)).toBeGreaterThan(cosine(v[0]!, v[2]!) + 0.2);
    expect(cosine(v[0]!, v[1]!)).toBeGreaterThan(cosine(v[0]!, v[3]!) + 0.2);
  });
  it("drops boilerplate and keeps bigrams", () => {
    const t = tokenize("The company builds payroll software, founded in 2021");
    expect(t).not.toContain("company");
    expect(t).not.toContain("2021");
    expect(t).toContain("payroll_software");
  });
});

describe("competitor re-rank", () => {
  const base: CompetitorFeatures = { id: "a", name: "A", industryIds: ["ind_1"], verticalIds: ["tv_1"], businessModels: ["SaaS"], customerFocus: "B2B", growthStage: "Early", region: "Latin America" };
  const twin = { ...base, id: "b", name: "B" };
  const far: CompetitorFeatures = { id: "c", name: "C", industryIds: ["ind_9"], verticalIds: ["tv_9"], businessModels: ["Hardware"], customerFocus: "B2C", growthStage: "Late", region: "Europe" };
  it("scores 0–10 and explains the overlap", () => {
    const s = overlapScore({ ...base, nodeNames: { tv_1: "Payroll Software" } }, twin, 0.8);
    expect(s.score).toBeGreaterThan(9);
    expect(s.reason).toBe("Same vertical: Payroll Software · very similar product description · both B2B · both SaaS · same stage (Early) · both in Latin America");
    expect(overlapScore(base, far, 0.1).score).toBe(0);
  });
  it("filters below the minimum, excludes self, sorts desc", () => {
    const r = rankCompetitors(base, [{ f: base, cos: 1 }, { f: far, cos: 0.15 }, { f: twin, cos: 0.5 }]);
    expect(r.map((x) => x.id)).toEqual(["b"]);
  });
  it("semantic similarity is clamped", () => {
    expect(semanticSimilarity(0)).toBe(0);
    expect(semanticSimilarity(1)).toBe(1);
  });
});
