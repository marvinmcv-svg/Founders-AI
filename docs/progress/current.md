# Current status

**Release:** R2 — *Signals & AI* — **in progress.** R1 accepted by the owner on 2026-11-26 (D-022).

**Done in R2**
- **Phase 4 — Signals & intelligence:** complete except the human-only items below. Plan and evidence in `docs/progress/phase-4.md`.
  - `packages/pipelines`: job runner logged in `pipeline_runs`, outbox, CLI (`pnpm pipelines list|daily|weekly|monthly|<job>`), cron route `/api/cron/[job]`.
  - Talent signals (detector, score, grounded summaries), news signals (dedupe, linking, classification, figures, score), highlights v2, competitors v1 (embeddings + pgvector), revenue & valuation ML (`apps/ml`, LightGBM quantile, anchors, SHAP drivers), traction & reviews ingest.
  - App: Acquisitions, IPOs and News grids; Traction Metrics and Reviews tabs; real-time / in-app / Slack alerts; per-search alert channels; Slack integration in Settings; `/admin` (anchor review queue, pipeline runs, model registry + rollback).

**Next:** Phase 5b (API complete: signals, AI search, extraction, network, webhooks, Python SDK). Then 6 (Agents & Skills), 7 (MCP), 9 (remaining marketing pages). Read plan 11, 15 (5b) and 10.

**Open R1 carry-overs** (not blocking R2 work): SEC Form D public pipeline, entity resolution, OpenSearch + indexer (outbox is ready), BullMQ workers (H2: Redis), 10M-row load test, Stripe (H13), TS SDK, Fumadocs console, Storybook, Lighthouse/axe, Turnstile (H3).

**Deploying Phase 4 to the cloud demo** (needs a human or a session with DB access):
1. Apply migration `0003_phase4_signals` to Supabase.
2. Set `CRON_SECRET` and `PLATFORM_ADMIN_EMAILS` on the `founders-ai-app` Vercel project.
3. Run the pipelines once against the cloud DB (`talent`, `news`, `highlights`, `competitors`, `traction`) and `apps/ml` estimates. These need a host that can reach Postgres (D-020).
