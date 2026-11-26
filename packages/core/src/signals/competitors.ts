/**
 * Competitors v1 (plan 9.7): embeddings → kNN candidates (pgvector HNSW) → re-rank on taxonomy
 * overlap, customer focus, business model, stage and geography → overlap 0–10 with a reason.
 * Replaces v0 (taxonomy + business-model overlap only).
 */

export const COMPETITORS_MODEL_VERSION = "competitors-v1-hashing-tfidf";

export type CompetitorFeatures = {
  id: string;
  name: string;
  industryIds: string[];
  verticalIds: string[];
  businessModels: string[];
  customerFocus: string | null;
  growthStage: string;
  region: string | null;
  /** id → display name for vertical/industry nodes, used in reasons. */
  nodeNames?: Record<string, string>;
};

const STAGES = ["Pre-seed / Seed", "Early", "Growth", "Late", "Exit / Public"];

export const OVERLAP_WEIGHTS = { semantic: 0.4, taxonomy: 0.25, focus: 0.1, model: 0.1, stage: 0.1, region: 0.05 } as const;
export const MIN_OVERLAP = 3;

const jaccard = (a: string[], b: string[]) => {
  if (!a.length && !b.length) return 0;
  const sa = new Set(a);
  const inter = b.filter((x) => sa.has(x)).length;
  return inter / new Set([...a, ...b]).size;
};

/** Map raw cosine (hashed TF-IDF ≈ 0.05–0.9) onto 0–1. */
export const semanticSimilarity = (cos: number) => Math.max(0, Math.min(1, (cos - 0.1) / 0.6));

export function overlapScore(a: CompetitorFeatures, b: CompetitorFeatures, cos: number): { score: number; reason: string; parts: Record<string, number> } {
  const sharedVerticals = a.verticalIds.filter((v) => b.verticalIds.includes(v));
  const sharedIndustries = a.industryIds.filter((v) => b.industryIds.includes(v));
  const taxonomy = Math.max(jaccard(a.verticalIds, b.verticalIds), 0.6 * jaccard(a.industryIds, b.industryIds));
  const stageGap = Math.abs(STAGES.indexOf(a.growthStage) - STAGES.indexOf(b.growthStage));
  const parts = {
    semantic: semanticSimilarity(cos),
    taxonomy,
    focus: a.customerFocus && a.customerFocus === b.customerFocus ? 1 : 0,
    model: jaccard(a.businessModels, b.businessModels),
    stage: stageGap === 0 ? 1 : stageGap === 1 ? 0.5 : 0,
    region: a.region && a.region === b.region ? 1 : 0,
  };
  const w = OVERLAP_WEIGHTS;
  const raw = w.semantic * parts.semantic + w.taxonomy * parts.taxonomy + w.focus * parts.focus + w.model * parts.model + w.stage * parts.stage + w.region * parts.region;
  const score = Math.round(Math.min(10, raw * 10) * 10) / 10;

  const names = { ...(a.nodeNames ?? {}), ...(b.nodeNames ?? {}) };
  const why: string[] = [];
  if (sharedVerticals.length) why.push(`Same vertical: ${sharedVerticals.map((v) => names[v] ?? v).slice(0, 2).join(", ")}`);
  else if (sharedIndustries.length) why.push(`Same industry: ${sharedIndustries.map((v) => names[v] ?? v).slice(0, 1).join(", ")}`);
  if (parts.semantic >= 0.6) why.push("very similar product description");
  else if (parts.semantic >= 0.35) why.push("similar product description");
  if (parts.focus) why.push(`both ${a.customerFocus}`);
  const sharedModels = a.businessModels.filter((m) => b.businessModels.includes(m));
  if (sharedModels.length) why.push(`both ${sharedModels.slice(0, 2).join(" + ")}`);
  if (parts.stage === 1) why.push(`same stage (${a.growthStage})`);
  if (parts.region) why.push(`both in ${a.region}`);
  const reason = why.length ? why.join(" · ").replace(/^./, (c) => c.toUpperCase()) : "Related product area";
  return { score, reason, parts };
}

/** Rank candidates, keep the top `k` at or above MIN_OVERLAP. */
export function rankCompetitors(a: CompetitorFeatures, candidates: { f: CompetitorFeatures; cos: number }[], k = 10) {
  return candidates
    .filter((c) => c.f.id !== a.id)
    .map((c) => ({ id: c.f.id, ...overlapScore(a, c.f, c.cos) }))
    .filter((c) => c.score >= MIN_OVERLAP)
    .sort((x, y) => y.score - x.score)
    .slice(0, k);
}
