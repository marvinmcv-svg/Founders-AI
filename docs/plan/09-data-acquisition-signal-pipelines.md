## 9. DATA ACQUISITION & SIGNAL PIPELINES

> Data is the hardest part. Start with licensed providers and public sources; build proprietary signals on top. Every record stores `sources[]` with URL/provider + timestamp. Legal review before each new source.

### 9.0 Synthetic seed dataset (new in v2 — required for R1)
`pnpm db:seed` generates a deterministic fake universe (fixed random seed): 50k companies, 250k people, 3k investors, 40k rounds, 2k acquisitions, 300 IPOs, 30k talent signals, 20k news items, 12 months of metrics, revenue disclosures for 5% of companies. Names generated (no real people). Distributions plausible (power-law funding, headcount growth). This powers dev, tests, Storybook, demos, and the marketing mocks' fixtures. Real data replaces it via provider adapters (`packages/integrations/data/*`, one interface per dataset) without code changes elsewhere.

### 9.1 Sources (legitimate options)
| Dataset | Bootstrap sources |
|---|---|
| Companies | Licensed firmographics (e.g. People Data Labs company, Coresignal, Crunchbase API / Dealroom licence), OpenCorporates & national registries (Companies House UK, SEC EDGAR, EU registries), company websites (respect robots.txt), Common Crawl, Product Hunt, YC directory, GitHub orgs, app stores, G2/Trustpilot APIs where licensed |
| People | Licensed person data (PDL, Coresignal) incl. change feeds; GitHub API; X API; company team pages; **user-imported** LinkedIn connections export (CSV) — never scrape LinkedIn |
| Investors | Fund websites, SEC Form D / Form ADV, licensed data, rounds data (derived portfolio) |
| Transactions | SEC Form D, press-release wires (licensed feeds), news (GDELT + licensed news APIs), registries, stock exchanges for IPOs |
| Web traffic | Licensed panel data (e.g. Similarweb API) or Tranco/CrUX ranks as fallback |
| News | GDELT, licensed news APIs, RSS of 60k sources (respect terms), press wires, company blogs |
| Emails | Pattern generation + SMTP-safe verification provider (ZeroBounce/NeverBounce), licensed enrichment |

> **Redistribution check (v2):** for each source record `redistributable` per field (Rule 10). Public-domain sources (SEC, most registries) are redistributable; scraped website text generally is not redistributable verbatim (store derived facts, not copied text); licensed providers depend on contract (H5).

### 9.2 Pipeline architecture
`ingest (raw, S3 bronze)` → `normalize (silver)` → **entity resolution** (domain canonicalisation, LinkedIn/URL keys, fuzzy name + location, embeddings; probabilistic matching (Python `splink` in `apps/ml`); manual merge tool) → `canonical entities (gold, Postgres)` → `derived metrics (partitioned Postgres)` → `highlights / rank / signals` → `index (OpenSearch)` → `deliveries (alerts, webhooks, CRM push, bulk files)`.
Orchestration: BullMQ queues (one per stage) with idempotent jobs keyed by `source_record_id`, exponential retries, dead-letter queue, and a `pipeline_runs` table logging counts/errors per run. Website fetching: polite crawler (robots.txt, 1 req/s per host, identifying User-Agent, cache by ETag).

**Rank v1 (deterministic, explainable):** `rank_score = 0.30·z(headcount_growth_3m) + 0.25·z(web_visits_growth_3m) + 0.15·z(log total_funding) + 0.15·investor_quality + 0.10·signal_count_90d + 0.05·z(social_growth_3m)`, z-scores within growth stage; `rank` = position by score (1 = best). Weights in config; ML ranking later.

### 9.3 Talent signals
Detect from person change feeds + X/GitHub bio changes + registry officer appointments + new domain registrations linked to a person:
- NEW_COMPANY (founder/co-founder title at company < 12 months old, or "stealth" in company/title) · NEW_ROLE · PROMOTION (title seniority up, same company) · SEARCHING (left role, no current role, "exploring/next chapter") · OUT_OF_STEALTH (stealth company gets domain/name) · DEPARTURE from tracked "breakout" companies.
- **Score 1–10**: LightGBM/logistic model on founder quality (prior exits/IPOs, big-tech tenure, seniority, education, network size), company context, recency; calibrate against later fundraising outcomes.
- **Summary**: LLM 2-sentence summary ("X is co-founding a stealth company in … previously …") from structured facts only (no hallucination: pass facts, require citations).
- Status: STEALTH / HR (searching) / LIVE.

### 9.4 Interest signals (hardest; design carefully & legally)
Goal: "investor X is engaging with company/person Y", scored 1–10, weeks before a round.
Ethical evidence sources: (1) investor partners publicly following/engaging founders or company accounts on X/GitHub (API), (2) investors' public content mentioning companies (blogs, podcasts, newsletters), (3) co-attendance at public events/demo days, (4) SEC Form D filings & registry changes (late but anchoring), (5) **aggregated, anonymised, opt-in product telemetry** — e.g. many users from investor-type orgs viewing/adding a company in our app (disclosed in ToS, k-anonymity ≥ 5, never reveal a specific customer's activity), (6) web-visit spikes from known VC networks via licensed B2B intent data.
**v2 warning:** source (5) can leak which companies a customer is evaluating — the most confidential thing an investor has. Default: OFF. If enabled after H8: aggregate only across ≥ 5 distinct orgs, add a random 3–10 day delay, never attribute to a named firm (show "investor-type interest", not "{Fund} is interested"), contractual opt-in, org-level opt-out. Named-firm signals ("General Catalyst is interested in X") may only come from public sources (1)–(4).
Model: per (investor, target) pair, weighted events with time decay → strength 1–10; "Round forming" when ≥ N distinct firms > threshold within 30 days; forecast probability of raise within 90 days (classifier trained on historical rounds). **Requires legal/privacy sign-off before launch.**

### 9.5 News signals
Fetch → dedupe (SimHash) → NER + entity linking to companies → classify into 5 update types (revenue, profitability, traction, funding, deals/M&A) + other → extract figures → 1-line AI summary → score 0–5 (source authority × novelty × materiality); `is_major` if ≥ 4. One signal per company mention.

### 9.6 Revenue & valuation estimates (ML service)

**v0 heuristic (R1, needed because there are no training labels on day one):** `revenue_p50 = headcount × revenue_per_employee(vertical, stage, region)` from a hand-curated lookup table (`/apps/ml/priors/rpe.csv`, cited sources); P10/P90 = ×0.5 / ×1.8; confidence LOW unless a disclosure exists, in which case P50 = disclosure and confidence MEDIUM. Label clearly in UI as "Modeled (v0)". Valuation v0 = last post-money × stage-based drift, else revenue × sector multiple.
**v1 ML (R2):** once ≥ 2,000 companies have verified disclosures.

- **Anchors**: revenue disclosures extracted from news/filings/founder posts (LLM extraction → human verification queue → `revenue_disclosures`).
- **Model**: LightGBM **quantile regression** (α = 0.1, 0.5, 0.9) on features: headcount & dept mix, headcount growth, web traffic & growth, app metrics, funding total/last round/stage, investor quality, industry/business model, HQ country, age, pricing-page signals; monthly re-rating.
- **Anchor honouring**: at disclosure months, set P50 = disclosed value and collapse band; between anchors, interpolate in log-space blended with model output; band width grows with distance from last anchor and with feature sparsity.
- **Confidence tier**: HIGH (≥ 3 recent anchors or tight band), MEDIUM, LOW.
- **Valuation**: second model stacked on revenue estimate + funding history + investor quality + stage + HQ + age; re-anchor to priced rounds (band → point at round); **SHAP** values stored as `drivers` for the driver-breakdown UI.
- Growth fields: 3m/6m/1y/2y %.
- Backtest: MAPE and P10–P90 coverage (target ≈ 80–90%) on held-out disclosed companies; publish methodology page.
- **Leakage guard:** when backtesting, only use features available *before* each disclosure date.
- Model versions stored (`model_version`); UI and API expose it; rollback = repoint version.

### 9.7 Competitors / similar companies
Embeddings (description + website + taxonomy) → kNN candidates → re-rank (taxonomy overlap, customer focus, business model, stage, geography) → LLM explanation → overlap 0–10. Recompute weekly and on profile change.

### 9.8 Freshness SLAs
Signals: < 24h from source. Company/people deltas: daily incrementals. Estimates: monthly + on new anchor. Index lag: < 5 min from DB write.
