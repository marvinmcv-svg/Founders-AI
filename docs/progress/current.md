# Current status

**Release:** R2 — *Signals & AI* — **in progress.** R1 accepted by the owner on 2026-11-26 (D-022).

**Done in R2**
- **Phase 4 — Signals & intelligence:** complete except the human-only items below. Plan and evidence in `docs/progress/phase-4.md`.
  - `packages/pipelines`: job runner logged in `pipeline_runs`, outbox, CLI (`pnpm pipelines list|daily|weekly|monthly|<job>`), cron route `/api/cron/[job]`.
  - Talent signals (detector, score, grounded summaries), news signals (dedupe, linking, classification, figures, score), highlights v2, competitors v1 (embeddings + pgvector), revenue & valuation ML (`apps/ml`, LightGBM quantile, anchors, SHAP drivers), traction & reviews ingest.
  - App: Acquisitions, IPOs and News grids; Traction Metrics and Reviews tabs; real-time / in-app / Slack alerts; per-search alert channels; Slack integration in Settings; `/admin` (anchor review queue, pipeline runs, model registry + rollback).

- **Phase 4 deployed to the cloud demo (2026-11-26):** migration 0003 applied to Supabase (as `founders_app`, RLS on), `CRON_SECRET` set on `founders-ai-app`, daily pipeline run once from Vercel (talent 199 signals, news 175, highlights, alerts, digests: all SUCCEEDED).
- **Phase 5b — API complete:** done except the docs site/console (carry-over). Plan and evidence in `docs/progress/phase-5b.md`. 74/74 Section 11 routes (9 answer 501 until R3, D-031), webhooks, extraction, persisted AI search, Idempotency-Key, Python SDK, contract tests.

**Next:** Phase 6 (Agents & Skills), then 7 (MCP), 9 (remaining marketing pages). Read plan 10, 12, 15 (6, 7) and 06.

**Open R1 carry-overs** (not blocking R2 work): SEC Form D public pipeline, entity resolution, OpenSearch + indexer (outbox is ready), BullMQ workers (H2: Redis), 10M-row load test, Stripe (H13), TS SDK, Fumadocs console, Storybook, Lighthouse/axe, Turnstile (H3).

**Cloud demo, still to do** (needs the owner or a host that can reach Postgres, D-020):
1. Set `PLATFORM_ADMIN_EMAILS` on `founders-ai-app` (owner's choice of admin emails) to open `/admin`.
2. Run `competitors`, `traction` and the `apps/ml` estimates once against the cloud DB (weekly/monthly jobs; they do not fit the serverless cron).
3. Migrations are applied by hand through the Supabase connector, as `founders_app` (`SET LOCAL ROLE founders_app; … RESET ROLE;`) so the app role owns new tables.
