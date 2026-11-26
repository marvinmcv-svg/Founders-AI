# Phase 4 — Signals & intelligence (R2)

Started 2026-11-26 after the owner approved moving on from R1 ("let's go with the next phase").
Plan sections: 15 (Phase 4), 9.3, 9.5, 9.6, 9.7, 7.3, 7.4, 7.7, 7.10, 7.11, 8.

## Tasks
| # | Task | Main files | Status |
|---|---|---|---|
| 4.0 | Foundations: migration 0003 (pipeline_runs, outbox_events, highlight_events, person_changes, news_raw, org_integrations, alert_deliveries, model_versions), `packages/pipelines` runner + CLI, SSRF egress module, AES-GCM secrets, LLM circuit breaker | `packages/db/drizzle/0003_*`, `packages/pipelines/src/{runner,outbox,cli}.ts`, `packages/core/src/{egress,crypto,llm}.ts` | done |
| 4.1 | Highlights v2 (data-derived, stage percentiles, history → `new_highlights`) | `core/src/signals/highlights.ts`, `pipelines/src/jobs/highlights.ts` | done |
| 4.2 | Talent signals pipeline: change feed → detector → score model → fact-grounded summary | `core/src/signals/talent.ts`, `pipelines/src/jobs/talent.ts`, `apps/ml/talent_score.py` | |
| 4.3 | News pipeline: SimHash dedupe → entity linking → classify → figures → summary → score; revenue figures → pending disclosures | `core/src/signals/news.ts`, `pipelines/src/jobs/news.ts` | |
| 4.4 | Competitors v1: embeddings + pgvector kNN + re-rank + reason | `core/src/signals/{embeddings,competitors}.ts`, `pipelines/src/jobs/competitors.ts` | |
| 4.5 | Revenue & valuation ML: LightGBM quantile, anchors, bands, confidence, SHAP drivers, backtest; disclosure review queue | `apps/ml/*`, `apps/app/.../admin/disclosures` | |
| 4.6 | Grids: Acquisitions, IPOs, News; profile tabs Traction Metrics & Reviews | `core/src/filters/fields.ts`, app pages | |
| 4.7 | Alerts: outbox → real-time saved-search matching → in-app bell, email, Slack; scheduled digests; cron route | `core/src/repo/alerts.ts`, `pipelines/src/jobs/alerts.ts`, `apps/app/src/app/api/cron` | |

## Risks / constraints
- **No real data (H5).** Every pipeline reads through a provider interface; the synthetic adapters generate realistic input (person change feed, news articles with near-duplicates, traffic/reviews). Swapping in a licensed provider changes only the adapter.
- **No working LLM key (H3).** The key in `.env` returns 401. Every LLM step has a deterministic fallback and the wrapper now trips a circuit breaker on auth errors.
- **No Redis/OpenSearch (H2).** Jobs run from the CLI and a token-protected cron route; the outbox table is the hand-off point for BullMQ + the indexer later.
- **Acceptance metrics need human labels.** Talent precision (200 items) and news F1 need a human-labelled sample; we report metrics on synthetic ground truth and a hand-written labelled set and list the human sample as BLOCKED-HUMAN.

## Known data-quality issue (seed)
- 22 of 30 seed schools are tier 1 and people are assigned schools uniformly, so "Top University" applies to 78% of people. The v2 rule is right; the seed distribution should be weighted on the next reseed.
