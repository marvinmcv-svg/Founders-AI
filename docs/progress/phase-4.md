# Phase 4 — Signals & intelligence (R2)

Started 2026-11-26 after the owner approved moving on from R1 ("let's go with the next phase").
Plan sections: 15 (Phase 4), 9.3, 9.5, 9.6, 9.7, 7.3, 7.4, 7.7, 7.10, 7.11, 8.

## Tasks
| # | Task | Main files | Status |
|---|---|---|---|
| 4.0 | Foundations: migration 0003 (pipeline_runs, outbox_events, highlight_events, person_changes, news_raw, org_integrations, alert_deliveries, model_versions), `packages/pipelines` runner + CLI, SSRF egress module, AES-GCM secrets, LLM circuit breaker | `packages/db/drizzle/0003_*`, `packages/pipelines/src/{runner,outbox,cli}.ts`, `packages/core/src/{egress,crypto,llm}.ts` | done |
| 4.1 | Highlights v2 (data-derived, stage percentiles, history → `new_highlights`) | `core/src/signals/highlights.ts`, `pipelines/src/jobs/highlights.ts` | done |
| 4.2 | Talent signals pipeline: change feed → detector → score model → fact-grounded summary | `core/src/signals/talent.ts`, `pipelines/src/jobs/talent.ts`, `apps/ml/talent_score.py` | done |
| 4.3 | News pipeline: SimHash dedupe → entity linking → classify → figures → summary → score; revenue figures → pending disclosures | `core/src/signals/news.ts`, `pipelines/src/jobs/news.ts` | done |
| 4.4 | Competitors v1: embeddings + pgvector kNN + re-rank + reason | `core/src/signals/{embeddings,competitors}.ts`, `pipelines/src/jobs/competitors.ts` | done |
| 4.5 | Revenue & valuation ML: LightGBM quantile, anchors, bands, confidence, SHAP drivers, backtest; disclosure review queue | `apps/ml/*`, `apps/app/.../admin/disclosures` | done |
| 4.6 | Grids: Acquisitions, IPOs, News; profile tabs Traction Metrics & Reviews | `core/src/filters/fields.ts`, app pages | done |
| 4.7 | Alerts: outbox → real-time saved-search matching → in-app bell, email, Slack; scheduled digests; cron route | `core/src/repo/alerts.ts`, `pipelines/src/jobs/alerts.ts`, `apps/app/src/app/api/cron` | done |

## Risks / constraints
- **No real data (H5).** Every pipeline reads through a provider interface; the synthetic adapters generate realistic input (person change feed, news articles with near-duplicates, traffic/reviews). Swapping in a licensed provider changes only the adapter.
- **No working LLM key (H3).** The key in `.env` returns 401. Every LLM step has a deterministic fallback and the wrapper now trips a circuit breaker on auth errors.
- **No Redis/OpenSearch (H2).** Jobs run from the CLI and a token-protected cron route; the outbox table is the hand-off point for BullMQ + the indexer later.
- **Acceptance metrics need human labels.** Talent precision (200 items) and news F1 need a human-labelled sample; we report metrics on synthetic ground truth and a hand-written labelled set and list the human sample as BLOCKED-HUMAN.

## Known data-quality issue (seed)
- 22 of 30 seed schools are tier 1 and people are assigned schools uniformly, so "Top University" applies to 78% of people. The v2 rule is right; the seed distribution should be weighted on the next reseed.

## Acceptance evidence (2026-11-26, local Postgres 16, seed scale 1)

| Plan 15 Phase 4 criterion | Target | Result | Notes |
|---|---|---|---|
| Talent signals precision | ≥ 85% on a 200-item human-labelled sample | **96.3%** precision, 95.1% recall on 1,293 labelled changes (per type: NEW_COMPANY 87.8%, DEPARTURE 94.2%, others 100%) | Labels come from the synthetic change feed (it injects side projects, advisory roles, consultancies, overlapping roles, cosmetic edits). **The human-labelled sample is BLOCKED-HUMAN.** |
| News classification F1 | ≥ 0.8 | **macro-F1 0.94** (accuracy 93.9%) on a 66-article hand-written EN/ES/PT set; 1.00 on the synthetic feed | The synthetic score is template-easy and not evidence; the hand-written set is engineering-labelled, not independent. Linking P/R 99.9%, dedupe P 95.2% / R 99.3% on the synthetic feed. |
| Revenue model P10–P90 coverage on backtest | 80–90% | **85.0%** (raw quantiles 65.5%, cross-conformal calibrated), n = 2,533 anchors, MAPE 26%, median APE 22% | Grouped 5-fold CV by company; features as-of the anchor month. Valuation: 85.1% coverage, median APE 62% on 5,259 priced rounds. |
| Digests delivered on schedule | yes | Scheduler sends daily at 07:00 local / weekly Monday, once per cadence per day; `/api/cron/daily` + Vercel cron at 11:17 UTC (07:17 La Paz) | Email goes out only once Resend is configured (H3); until then runs are stored and viewable in Settings. |

Other checks
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (core 115, pipelines 1), `pnpm copy:check`, `pnpm build`: all pass. `apps/ml`: `pytest` 6 passed, `ruff` clean.
- Pipeline timings (50k companies): talent 300 changes ≈ 2 s, news 300 articles ≈ 4 s, highlights ≈ 5 s (baseline 24 s), competitors ≈ 72 s + 74 s embedding, traction ≈ 94 s (2.5M points), ML estimates ≈ 3 min.
- Talent score: the trainer found no founder-quality → fundraising signal in the seed (AUC 0.515 vs priors 0.513), so the expert priors stay; it will refit automatically on real outcomes.
- Real-time alert e2e: 99 new stealth-founder signals → in-app notification, email stored (no Resend key), Slack skipped (not connected); cross-org isolation covered by `packages/core/test/alerts.test.ts`.

## Known approximations
- ML features: growth stage and department mix are current values (not as-of); documented in model metrics.
- Valuation estimates are wide (median APE 62%); bands are calibrated, point estimates are not precise.
- Competitors use a corpus-fitted hashed TF-IDF embedding until a hosted embedding model is configured (H3).
- The local DB grew from 2.0 GB to 2.7 GB (traction series, estimate versions, embeddings). At cloud seed scale 0.2 that is roughly +140 MB against Supabase's 500 MB free tier.
