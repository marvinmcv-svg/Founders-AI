/**
 * News signals job (plan 9.5), < 24h freshness.
 *   ingest → news_raw (bronze, SimHash) → dedupe → link → classify → figures → summary → score →
 *   news_items + news_signals (one per linked company) → pending revenue disclosures → outbox → eval
 * Options: --articles=N (synthetic, default 200), --seed=N, --llm (classify with Claude when available), --noIngest
 */
import { llmAvailable, structuredCall } from "@founders/core/llm";
import { newId } from "@founders/core/ids";
import { Rng } from "@founders/core/random";
import {
  candidateMentions,
  classifyNews,
  DUPLICATE_DISTANCE,
  extractFigures,
  hamming,
  linkCompanies,
  macroF1,
  NEWS_CATEGORIES,
  normalizeText,
  NEWS_CLASSIFY_SCHEMA,
  NEWS_CLASSIFY_SYSTEM,
  NEWS_MODEL_VERSION,
  scoreNews,
  simhash64,
  summarizeNews,
  type LinkCandidate,
  type NewsCategory,
} from "@founders/core/signals/news";
import { pg, type Json } from "../db";
import { emit } from "../outbox";
import { SyntheticNewsSource, type NewsSource } from "../providers/news";
import type { JobContext, JobDef } from "../runner";

type RawRow = { id: string; url: string; publisher: string; title: string; body: string; published_at: Date; simhash: string; label: { category: NewsCategory; companyIds: string[]; duplicateOfUrl: string | null } | null };

async function ingest(ctx: JobContext, source: NewsSource, limit: number, today: Date) {
  const sql = pg();
  const arts = await source.fetch({ limit, today });
  const rows = arts.map((a) => ({
    id: newId("newsRaw"),
    source: source.name,
    url: a.url,
    publisher: a.publisher,
    title: a.title,
    body: a.body,
    published_at: a.publishedAt.toISOString(),
    simhash: simhash64(`${a.title}. ${a.body}`),
    label: a.label as unknown as Json,
  }));
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 1000) {
    const r = await sql`INSERT INTO news_raw (id, source, url, publisher, title, body, published_at, simhash, label)
      SELECT x.id, x.source, x.url, x.publisher, x.title, x.body, x.published_at, x.simhash, x.label
      FROM jsonb_to_recordset(${sql.json(rows.slice(i, i + 1000))}) AS x(id text, source text, url text, publisher text, title text, body text, published_at timestamptz, simhash text, label jsonb)
      ON CONFLICT (url) DO NOTHING RETURNING id`;
    inserted += r.length;
  }
  ctx.count("articles_ingested", inserted);
  ctx.log(`ingested ${inserted} articles from ${source.name}`);
}

async function dedupe(ctx: JobContext): Promise<RawRow[]> {
  const sql = pg();
  const fresh = await sql<RawRow[]>`SELECT id, url, publisher, title, body, published_at, simhash, label FROM news_raw WHERE status = 'NEW' ORDER BY published_at ASC, id ASC LIMIT 5000`;
  const pool = await sql<{ id: string; simhash: string; title: string; published_at: Date }[]>`SELECT id, simhash, title, published_at FROM news_raw
    WHERE status IN ('LINKED', 'UNLINKED') AND published_at > now() - interval '14 days'`;
  const seen = pool.map((p) => ({ id: p.id, simhash: p.simhash, title: normalizeText(p.title), at: p.published_at.getTime() }));
  const unique: RawRow[] = [];
  const dups: { id: string; dup: string }[] = [];
  for (const r of fresh) {
    const title = normalizeText(r.title);
    const at = r.published_at.getTime();
    // Same story: near-identical text (SimHash) or the same headline within 72 hours (syndication).
    const hit = seen.find((s) => hamming(s.simhash, r.simhash) <= DUPLICATE_DISTANCE || (s.title === title && Math.abs(s.at - at) <= 72 * 3_600_000));
    if (hit) dups.push({ id: r.id, dup: hit.id });
    else {
      unique.push(r);
      seen.push({ id: r.id, simhash: r.simhash, title, at });
    }
  }
  if (dups.length)
    await sql`UPDATE news_raw n SET status = 'DUPLICATE', duplicate_of = x.dup FROM jsonb_to_recordset(${sql.json(dups)}) AS x(id text, dup text) WHERE n.id = x.id`;
  ctx.count("articles_duplicate", dups.length);
  return unique;
}

async function candidates(rows: RawRow[]): Promise<Map<string, LinkCandidate[]>> {
  const sql = pg();
  const byArticle = new Map<string, string[]>();
  const all = new Set<string>();
  for (const r of rows) {
    const m = candidateMentions(`${r.title}. ${r.body}`).filter((x) => x.length >= 3);
    byArticle.set(r.id, m);
    m.forEach((x) => all.add(x));
  }
  const found = await sql<(LinkCandidate & { rank: number | null })[]>`SELECT DISTINCT ON (name) id, name, aliases, rank FROM companies
    WHERE deleted_at IS NULL AND (name = ANY(${[...all]}) OR aliases && ${[...all]}::text[]) ORDER BY name, rank ASC NULLS LAST`;
  const byName = new Map<string, LinkCandidate>();
  for (const c of found) {
    byName.set(c.name, c);
    for (const a of c.aliases) byName.set(a, c);
  }
  const out = new Map<string, LinkCandidate[]>();
  for (const [id, m] of byArticle) out.set(id, [...new Map(m.flatMap((x) => (byName.get(x) ? [[byName.get(x)!.id, byName.get(x)!]] : []))).values()]);
  return out;
}

async function classify(r: RawRow, useLlm: boolean, budget: { left: number }): Promise<{ category: NewsCategory; by: string }> {
  if (useLlm && budget.left > 0 && llmAvailable()) {
    budget.left--;
    const res = await structuredCall<{ category: NewsCategory }>({
      system: NEWS_CLASSIFY_SYSTEM,
      user: `<article untrusted="true">\n<title>${r.title}</title>\n<body>${r.body.slice(0, 2000)}</body>\n</article>`,
      schema: NEWS_CLASSIFY_SCHEMA as unknown as Record<string, unknown>,
      maxTokens: 50,
    });
    if (res && (NEWS_CATEGORIES as readonly string[]).includes(res.category)) return { category: res.category, by: "news-v1-llm" };
  }
  return { category: classifyNews(r.title, r.body).category, by: NEWS_MODEL_VERSION };
}

type Pred = { raw: RawRow; category: NewsCategory | null; linked: string[]; duplicate: boolean };

async function processRows(ctx: JobContext, rows: RawRow[]): Promise<Pred[]> {
  const sql = pg();
  if (!rows.length) return [];
  const cands = await candidates(rows);
  const budget = { left: Number(ctx.options.llmLimit ?? 100) };
  const items: { [k: string]: Json }[] = [];
  const signals: { [k: string]: Json }[] = [];
  const disclosures: { [k: string]: Json }[] = [];
  const status: { id: string; status: string }[] = [];
  const preds: Pred[] = [];
  const recent = new Set(
    (await sql<{ k: string }[]>`SELECT company_id || ':' || category AS k FROM news_signals WHERE published_at > now() - interval '14 days'`).map((x) => x.k),
  );
  for (const r of rows) {
    const links = linkCompanies(r.title, r.body, cands.get(r.id) ?? []);
    if (!links.length) {
      status.push({ id: r.id, status: "UNLINKED" });
      preds.push({ raw: r, category: null, linked: [], duplicate: false });
      continue;
    }
    const cls = await classify(r, Boolean(ctx.options.llm), budget);
    const figures = extractFigures(`${r.title}. ${r.body}`);
    const itemId = newId("news");
    items.push({ id: itemId, url: r.url, publisher: r.publisher, title: r.title, published_at: r.published_at.toISOString(), body_hash: r.simhash });
    for (const l of links) {
      const novelty = recent.has(`${l.companyId}:${cls.category}`) ? 0.4 : 1;
      recent.add(`${l.companyId}:${cls.category}`);
      const { score, isMajor } = scoreNews({ category: cls.category, figures, publisher: r.publisher, novelty });
      const counterparty = links.find((x) => x.companyId !== l.companyId)?.name ?? null;
      const sigId = newId("newsSignal");
      signals.push({
        id: sigId,
        company_id: l.companyId,
        news_item_id: itemId,
        category: cls.category,
        summary: summarizeNews(l.name, cls.category, figures, r.title, counterparty),
        score,
        is_major: isMajor,
        figures: figures as unknown as Json,
        published_at: r.published_at.toISOString(),
        model_version: cls.by,
      });
      // Revenue anchors go to the human verification queue (plan 9.6), never straight into the model.
      const rev = cls.category === "revenue" ? figures.amounts.find((a) => a.kind === "revenue") : undefined;
      if (rev && l.inTitle) {
        disclosures.push({
          id: newId("disclosure"),
          company_id: l.companyId,
          amount_usd: rev.usd,
          type: /arr|recurring|recurrentes/i.test(`${r.title} ${r.body}`) ? "ARR" : "Revenue",
          period: r.published_at.toISOString().slice(0, 8) + "01",
          source_url: r.url,
          publisher: r.publisher,
          published_at: r.published_at.toISOString(),
          news_signal_id: sigId,
          evidence: `${rev.raw} — "${r.title}"`,
        });
      }
    }
    status.push({ id: r.id, status: "LINKED" });
    preds.push({ raw: r, category: cls.category, linked: links.map((l) => l.companyId), duplicate: false });
    ctx.count(`classified_by_${cls.by}`);
  }
  for (let i = 0; i < items.length; i += 1000) {
    await sql`INSERT INTO news_items (id, url, publisher, title, published_at, body_hash)
      SELECT x.id, x.url, x.publisher, x.title, x.published_at, x.body_hash FROM jsonb_to_recordset(${sql.json(items.slice(i, i + 1000))})
      AS x(id text, url text, publisher text, title text, published_at timestamptz, body_hash text)`;
  }
  for (let i = 0; i < signals.length; i += 1000) {
    await sql`INSERT INTO news_signals (id, company_id, news_item_id, category, summary, score, is_major, figures, published_at, model_version)
      SELECT x.id, x.company_id, x.news_item_id, x.category, x.summary, x.score, x.is_major, x.figures, x.published_at, x.model_version
      FROM jsonb_to_recordset(${sql.json(signals.slice(i, i + 1000))})
      AS x(id text, company_id text, news_item_id text, category text, summary text, score real, is_major boolean, figures jsonb, published_at timestamptz, model_version text)`;
  }
  if (disclosures.length)
    await sql`INSERT INTO revenue_disclosures (id, company_id, amount_usd, type, period, source_url, publisher, published_at, status, origin, news_signal_id, evidence)
      SELECT x.id, x.company_id, x.amount_usd, x.type, x.period, x.source_url, x.publisher, x.published_at, 'pending', 'news_extraction', x.news_signal_id, x.evidence
      FROM jsonb_to_recordset(${sql.json(disclosures)})
      AS x(id text, company_id text, amount_usd bigint, type text, period date, source_url text, publisher text, published_at timestamptz, news_signal_id text, evidence text)`;
  if (status.length) await sql`UPDATE news_raw n SET status = x.status FROM jsonb_to_recordset(${sql.json(status)}) AS x(id text, status text) WHERE n.id = x.id`;
  await emit("news_signals", signals.map((s) => String(s.id)));
  ctx.count("news_items_created", items.length);
  ctx.count("news_signals_created", signals.length);
  ctx.count("news_signals_major", signals.filter((s) => s.is_major).length);
  ctx.count("articles_unlinked", status.filter((s) => s.status === "UNLINKED").length);
  ctx.count("disclosures_queued", disclosures.length);
  return preds;
}

export type NewsEval = {
  classification: { n: number; macroF1: number; accuracy: number };
  linking: { precision: number; recall: number; pairs: number };
  dedupe: { precision: number; recall: number; flagged: number };
};

export async function evaluateNews(): Promise<NewsEval | null> {
  const sql = pg();
  const rows = await sql<{ id: string; status: string; duplicate_of: string | null; url: string; label: RawRow["label"]; linked: string[] | null; category: string | null }[]>`
    SELECT n.id, n.status, n.duplicate_of, n.url, n.label,
      (SELECT array_agg(ns.company_id) FROM news_items ni JOIN news_signals ns ON ns.news_item_id = ni.id WHERE ni.url = n.url) AS linked,
      (SELECT ns.category FROM news_items ni JOIN news_signals ns ON ns.news_item_id = ni.id WHERE ni.url = n.url LIMIT 1) AS category
    FROM news_raw n WHERE n.label IS NOT NULL AND n.status <> 'NEW'`;
  if (!rows.length) return null;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const cls = rows.filter((r) => r.category && r.label && r.label.companyIds.length).map((r) => ({ truth: r.label!.category, pred: r.category! }));
  let tp = 0, fp = 0, fn = 0;
  for (const r of rows.filter((x) => x.status !== "DUPLICATE")) {
    const truth = new Set(r.label?.companyIds ?? []);
    const pred = new Set(r.linked ?? []);
    for (const p of pred) {
      if (truth.has(p)) tp++;
      else fp++;
    }
    for (const t of truth) if (!pred.has(t)) fn++;
  }
  const flagged = rows.filter((r) => r.status === "DUPLICATE");
  // Same story = same cluster root (the original URL), whichever copy was seen first.
  const root = (r: { url: string; label: RawRow["label"] } | undefined) => (r ? (r.label?.duplicateOfUrl ?? r.url) : null);
  const trueDup = flagged.filter((r) => root(r) !== null && root(r) === root(byId.get(r.duplicate_of ?? ""))).length;
  const allDup = rows.filter((r) => r.label?.duplicateOfUrl).length;
  const m = macroF1(cls);
  return {
    classification: { n: cls.length, macroF1: m.macroF1, accuracy: m.accuracy },
    linking: { precision: tp + fp ? tp / (tp + fp) : 0, recall: tp + fn ? tp / (tp + fn) : 0, pairs: tp + fp + fn },
    dedupe: { precision: flagged.length ? trueDup / flagged.length : 0, recall: allDup ? trueDup / allDup : 0, flagged: flagged.length },
  };
}

export const newsJob: JobDef = {
  name: "news",
  description: "Ingest news, dedupe, link to companies, classify, extract figures, score; queue revenue anchors; evaluate",
  async run(ctx) {
    const today = new Date();
    if (!ctx.options.noIngest) {
      const source = new SyntheticNewsSource(new Rng(Number(ctx.options.seed ?? Date.now() % 2 ** 31)));
      await ingest(ctx, source, Number(ctx.options.articles ?? 200), today);
    }
    const unique = await dedupe(ctx);
    await processRows(ctx, unique);
    const ev = await evaluateNews();
    if (ev) {
      ctx.count("eval_classification_macro_f1_pct", Math.round(ev.classification.macroF1 * 1000) / 10);
      ctx.count("eval_linking_precision_pct", Math.round(ev.linking.precision * 1000) / 10);
      ctx.count("eval_dedupe_precision_pct", Math.round(ev.dedupe.precision * 1000) / 10);
      const sql = pg();
      await sql`INSERT INTO model_versions (version, kind, active, metrics) VALUES (${NEWS_MODEL_VERSION}, 'NEWS', true,
        ${sql.json({ ...ev, evaluated_at: today.toISOString(), ground_truth: "synthetic feed labels" } as unknown as Json)})
        ON CONFLICT (version) DO UPDATE SET metrics = EXCLUDED.metrics, active = true`;
      ctx.log(`eval (cumulative): classification macro-F1 ${(ev.classification.macroF1 * 100).toFixed(1)}% · linking P ${(ev.linking.precision * 100).toFixed(1)}% R ${(ev.linking.recall * 100).toFixed(1)}% · dedupe P ${(ev.dedupe.precision * 100).toFixed(1)}% R ${(ev.dedupe.recall * 100).toFixed(1)}%`);
    }
  },
};
