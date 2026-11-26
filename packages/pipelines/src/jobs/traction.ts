/**
 * Traction & reviews job (plan 7.7 tabs 5–6) — monthly, like the source data.
 *   traffic provider → company_metrics_daily (engagement, social, app, extension series) + companies.traction
 *   reviews provider → companies.reviews_detail (+ reviews summary)
 *   derived          → web_rank (popularity rank by web visits, per month, across all companies)
 * Idempotent: metric points are upserted; providers are deterministic per company.
 */
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { pg, type Json } from "../db";
import { SyntheticReviewsProvider, SyntheticTrafficProvider, type CompanyBasics } from "../providers/traction";
import type { JobDef } from "../runner";

type Row = { id: string; name: string; customer_focus: string | null; business_models: string[]; hq_country: string | null; hq_region: string | null; reviews: CompanyBasics["reviews"] };

export const tractionJob: JobDef = {
  name: "traction",
  description: "Ingest traffic, social, app-store and review-site data; derive web popularity rank",
  async run(ctx) {
    const sql = pg();
    const traffic = new SyntheticTrafficProvider();
    const reviewsP = new SyntheticReviewsProvider();
    const companies = await sql<Row[]>`SELECT id, name, customer_focus, business_models, hq_country, hq_region, reviews FROM companies WHERE deleted_at IS NULL`;
    const series = await sql<{ company_id: string; metric: string; month: string; value: number }[]>`
      SELECT company_id, metric, date::text AS month, value FROM company_metrics_daily WHERE metric IN ('web_visits', 'linkedin_followers')`;
    const web = new Map<string, Map<string, number>>();
    const li = new Map<string, Map<string, number>>();
    for (const s of series) {
      const target = s.metric === "web_visits" ? web : li;
      if (!target.has(s.company_id)) target.set(s.company_id, new Map());
      target.get(s.company_id)!.set(s.month, s.value);
    }
    const months = [...new Set(series.map((s) => s.month))].sort();
    ctx.log(`${companies.length} companies, ${months.length} months`);

    const lines: string[] = [];
    const snapshots: { id: string; traction: Json; reviews_detail: Json; reviews: Json }[] = [];
    for (const c of companies) {
      const basics: CompanyBasics = {
        id: c.id, name: c.name, customerFocus: c.customer_focus, businessModels: c.business_models, hqCountry: c.hq_country, hqRegion: c.hq_region,
        webVisits: web.get(c.id) ?? new Map(), linkedinFollowers: li.get(c.id) ?? new Map(), reviews: c.reviews,
      };
      const t = traffic.traffic(basics);
      for (const p of t.points) lines.push(`${c.id}\t${p.metric}\t${p.month}\t${p.value}\n`);
      const r = reviewsP.reviews(basics, months);
      const summary = r ? Object.fromEntries(Object.entries(r).map(([k, v]) => [k, { rating: v.rating, count: v.count }])) : c.reviews;
      snapshots.push({ id: c.id, traction: t.snapshot as unknown as Json, reviews_detail: r as unknown as Json, reviews: (summary ?? null) as unknown as Json });
    }
    ctx.count("metric_points", lines.length);

    await sql.begin(async (tx) => {
      await tx`CREATE TEMP TABLE traction_in (company_id text, metric text, date date, value real) ON COMMIT DROP`;
      const w = await tx`COPY traction_in FROM STDIN`.writable();
      await pipeline(Readable.from(lines), w);
      await tx`INSERT INTO company_metrics_daily (company_id, metric, date, value) SELECT company_id, metric, date, value FROM traction_in
        ON CONFLICT (company_id, metric, date) DO UPDATE SET value = EXCLUDED.value`;
      // Popularity rank: 1 = most web visits that month.
      await tx`INSERT INTO company_metrics_daily (company_id, metric, date, value)
        SELECT company_id, 'web_rank', date, rank() OVER (PARTITION BY date ORDER BY value DESC) FROM company_metrics_daily WHERE metric = 'web_visits'
        ON CONFLICT (company_id, metric, date) DO UPDATE SET value = EXCLUDED.value`;
    });
    for (let i = 0; i < snapshots.length; i += 5000) {
      await sql`UPDATE companies c SET traction = x.traction, reviews_detail = x.reviews_detail, reviews = x.reviews
        FROM jsonb_to_recordset(${sql.json(snapshots.slice(i, i + 5000))}) AS x(id text, traction jsonb, reviews_detail jsonb, reviews jsonb) WHERE c.id = x.id`;
    }
    ctx.count("companies_with_traffic", snapshots.filter((s) => s.traction).length);
    ctx.count("companies_with_reviews", snapshots.filter((s) => s.reviews_detail).length);
  },
};
