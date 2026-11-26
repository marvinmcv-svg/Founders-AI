/**
 * Competitors v1 job (plan 9.7) — weekly, and for changed profiles.
 *   1. embed: company text (tagline, description, taxonomy names, business models, focus) → 256-d
 *   2. kNN:   pgvector HNSW, 40 nearest per company (batched LATERAL query)
 *   3. rank:  core/signals/competitors re-rank → top 10 with overlap ≥ 3 and a reason
 * Options: --limit=N (companies to recompute, default all), --embedOnly, --skipEmbed
 */
import { COMPETITORS_MODEL_VERSION, rankCompetitors, type CompetitorFeatures } from "@founders/core/signals/competitors";
import { HashingTfidfEmbedder, tokenize, toVectorLiteral } from "@founders/core/signals/embeddings";
import { pg } from "../db";
import type { JobContext, JobDef } from "../runner";

type CoRow = {
  id: string; name: string; tagline: string | null; description: string | null; industry_ids: string[]; tech_vertical_ids: string[];
  business_models: string[]; customer_focus: string | null; growth_stage: string; hq_region: string | null;
};

const companyText = (c: CoRow, names: Map<string, string>) => {
  const tax = [...c.tech_vertical_ids, ...c.industry_ids].map((id) => names.get(id) ?? "").join(". ");
  // Taxonomy names are repeated so they outweigh boilerplate in templated descriptions.
  return [c.tagline ?? "", c.description ?? "", tax, tax, c.business_models.join(" "), c.customer_focus ? `focus ${c.customer_focus}` : ""].join(". ");
};

const features = (c: CoRow): CompetitorFeatures => ({
  id: c.id,
  name: c.name,
  industryIds: c.industry_ids,
  verticalIds: c.tech_vertical_ids,
  businessModels: c.business_models,
  customerFocus: c.customer_focus,
  growthStage: c.growth_stage,
  region: c.hq_region,
});

async function embedAll(ctx: JobContext, rows: CoRow[], names: Map<string, string>) {
  const sql = pg();
  const docs = rows.map((c) => tokenize(companyText(c, names)));
  const emb = new HashingTfidfEmbedder().fit(docs);
  const t0 = Date.now();
  for (let i = 0; i < rows.length; i += 2000) {
    const ids = rows.slice(i, i + 2000).map((r) => r.id);
    const vecs = docs.slice(i, i + 2000).map((d) => toVectorLiteral(emb.embedTokens(d)));
    await sql`UPDATE companies c SET embedding = x.v::vector FROM unnest(${ids}::text[], ${vecs}::text[]) AS x(id, v) WHERE c.id = x.id`;
  }
  ctx.count("companies_embedded", rows.length);
  ctx.log(`embedded ${rows.length} companies with ${emb.name} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

export const competitorsJob: JobDef = {
  name: "competitors",
  description: "Embed companies, find nearest neighbours (pgvector), re-rank into competitor sets with overlap 0–10",
  async run(ctx) {
    const sql = pg();
    const rows = await sql<CoRow[]>`SELECT id, name, tagline, description, industry_ids, tech_vertical_ids, business_models, customer_focus, growth_stage, hq_region
      FROM companies WHERE deleted_at IS NULL ORDER BY rank ASC NULLS LAST`;
    const names = new Map((await sql<{ id: string; name: string }[]>`SELECT id, name FROM taxonomy_nodes`).map((n) => [n.id, n.name]));
    // IDF is fitted on the whole corpus, so embeddings are always recomputed together.
    if (!ctx.options.skipEmbed) await embedAll(ctx, rows, names);
    if (ctx.options.embedOnly) return;

    const byId = new Map(rows.map((r) => [r.id, r]));
    const nodeNames = Object.fromEntries(names);
    const targets = rows.slice(0, Number(ctx.options.limit ?? rows.length));
    const t0 = Date.now();
    let written = 0;
    const BATCH = 500;
    for (let i = 0; i < targets.length; i += BATCH) {
      const ids = targets.slice(i, i + BATCH).map((r) => r.id);
      const nn = await sql.begin(async (tx) => {
        await tx`SET LOCAL hnsw.ef_search = 80`;
        return tx<{ id: string; cid: string; cos: number }[]>`SELECT a.id, n.id AS cid, 1 - n.dist AS cos FROM companies a
          CROSS JOIN LATERAL (SELECT b.id, b.embedding <=> a.embedding AS dist FROM companies b
            WHERE b.deleted_at IS NULL ORDER BY b.embedding <=> a.embedding LIMIT 40) n
          WHERE a.id = ANY(${ids})`;
      });
      const cands = new Map<string, { f: CompetitorFeatures; cos: number }[]>();
      for (const r of nn) {
        const c = byId.get(r.cid);
        if (!c) continue;
        cands.set(r.id, [...(cands.get(r.id) ?? []), { f: features(c), cos: r.cos }]);
      }
      const out: { company_id: string; competitor_id: string; overlap_score: number; reason: string }[] = [];
      for (const id of ids) {
        const a = byId.get(id);
        if (!a) continue;
        const ranked = rankCompetitors({ ...features(a), nodeNames }, (cands.get(id) ?? []).map((c) => ({ ...c, f: { ...c.f, nodeNames } })));
        for (const r of ranked) out.push({ company_id: id, competitor_id: r.id, overlap_score: r.score, reason: r.reason });
      }
      await sql.begin(async (tx) => {
        await tx`DELETE FROM company_competitors WHERE company_id = ANY(${ids})`;
        if (out.length)
          await tx`INSERT INTO company_competitors (company_id, competitor_id, overlap_score, reason, model_version, computed_at)
            SELECT x.company_id, x.competitor_id, x.overlap_score, x.reason, ${COMPETITORS_MODEL_VERSION}, now()
            FROM jsonb_to_recordset(${tx.json(out)}) AS x(company_id text, competitor_id text, overlap_score real, reason text)`;
      });
      written += out.length;
      if ((i / BATCH) % 20 === 0) ctx.log(`${Math.min(i + BATCH, targets.length)}/${targets.length} companies · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    ctx.count("companies_ranked", targets.length);
    ctx.count("competitor_rows", written);
    await sql`INSERT INTO model_versions (version, kind, active, metrics) VALUES (${COMPETITORS_MODEL_VERSION}, 'COMPETITORS', true,
      ${sql.json({ companies: targets.length, rows: written, avg_per_company: Math.round((written / Math.max(1, targets.length)) * 10) / 10, computed_at: new Date().toISOString() })})
      ON CONFLICT (version) DO UPDATE SET metrics = EXCLUDED.metrics, active = true`;
  },
};
