# Current status

**Release:** R3 — *Workflow & scale* — **in progress.** R2 accepted by the owner on 2026-11-26 (D-051); R1 accepted earlier (D-022).

**R3 in progress — all R3 phases built; waiting for owner acceptance.**
- **Phase 10 — Billing, admin, compliance, hardening: done except human-only items.** Stripe seats + credit packs + metered overage (own client; live / contact-sales / simulator modes), hash-chained append-only audit log, DSAR workflow with DB-enforced suppression, self-service export / account deletion, admin console complete (accounts & credits, key approvals, data requests, entity editor & merge, taxonomy, signal QA, status incidents), SSO (OIDC/SAML) + SCIM 2.0 + 2FA with Require SSO / 2FA policies, load test (15 rps × 200 keys: p95 12 ms), CSP/HSTS, backup + restore drill, `/api/health` + `/status`, runbooks, `pnpm security:audit`, launch checklist. Plan and evidence in `docs/progress/phase-10.md`; launch checklist `docs/launch-checklist.md`.
- **Phase 8 — Integrations: done except human-only items.** CRM ×6 (adapters, sandbox, match preview, pull/push/enrich, log, filters, badges), team network (LinkedIn export, mailbox/calendar clients + demo, warm paths, move alerts, API #64–67), bulk delivery (Parquet/CSV, full + incrementals, S3/GCS/Snowflake, replay test), Zapier app, interest signals behind the H8 flag, Chrome extension, `/integrations` page. Plan and evidence in `docs/progress/phase-8.md`.

**Done in R2** (accepted)

- **Phase 4 — Signals & intelligence:** complete except the human-only items below. Plan and evidence in `docs/progress/phase-4.md`.
  - `packages/pipelines`: job runner logged in `pipeline_runs`, outbox, CLI (`pnpm pipelines list|daily|weekly|monthly|<job>`), cron route `/api/cron/[job]`.
  - Talent signals (detector, score, grounded summaries), news signals (dedupe, linking, classification, figures, score), highlights v2, competitors v1 (embeddings + pgvector), revenue & valuation ML (`apps/ml`, LightGBM quantile, anchors, SHAP drivers), traction & reviews ingest.
  - App: Acquisitions, IPOs and News grids; Traction Metrics and Reviews tabs; real-time / in-app / Slack alerts; per-search alert channels; Slack integration in Settings; `/admin` (anchor review queue, pipeline runs, model registry + rollback).

- **Phase 4 deployed to the cloud demo (2026-11-26):** migration 0003 applied to Supabase (as `founders_app`, RLS on), `CRON_SECRET` set on `founders-ai-app`, daily pipeline run once from Vercel (talent 199 signals, news 175, highlights, alerts, digests: all SUCCEEDED).
- **Phase 5b — API complete:** done except the docs site/console (carry-over). Plan and evidence in `docs/progress/phase-5b.md`. 74/74 Section 11 routes (9 answer 501 until R3, D-031), webhooks, extraction, persisted AI search, Idempotency-Key, Python SDK, contract tests.

- **Phase 6 — Agents & Skills:** done except items blocked on H3/H15. Plan and evidence in `docs/progress/phase-6.md`. `packages/agent` (Claude Messages API loop + rules-engine fallback, tools, number guard, confirmations, credits/caps), 12 curated skills + editor/share/schedule, personalization, agent UI, `apps/agent-evals` (50/50 on the rules engine).

- **Phase 7 — MCP server:** done except the manual client matrix (H16). Plan and evidence in `docs/progress/phase-7.md`. `/mcp` (Streamable HTTP, 29 tools, 3 prompts), OAuth 2.1 (Better Auth `mcp()` + DCR + CIMD), API-key fallback, metering (100 free/day, overage), Settings → MCP + install guide.

- **Marketing home redesign (2026-11-26, D-047):** new brand-first home page (`apps/www/src/app/page.tsx`, `components/home/*`): animated hero with tilting product window, scroll-lit mission, Founders ecosystem (Program → foundersscz.com/aplicar, Academy, Community, Founders AI → app `/signup`), platform bento, live stats, Santa Cruz radar, Instagram captions. Header/hero/closing CTAs open the app. Screens: `docs/progress/screens/www-home-*.png`. Open question: production www renders stat *words*, not numbers, although `platform_stats` has data; `getStatVars` now logs the reason (`[stats]` in Vercel runtime logs).

- **Phase 9 — Remaining marketing pages & content:** done except human-only items. Plan and evidence in `docs/progress/phase-9.md`. Talent, News, Revenue & Valuation, Agents, API, MCP pages; blog (Markdown, RSS, authors), Insights, Careers, comparison template (H17), OG images, sitemap, JSON-LD, consent-gated analytics, link checker, copy-similarity check.

**Next:** owner review and acceptance of R3 (plan 0B gate; nothing after R3 starts without it). Then: sign the launch checklist (Eng, Legal, Security, Marketing), H13 Stripe setup, H14 pen test. Cloud: apply migrations 0007, 0008 and 0009 (as `founders_app`) before deploying Phases 8–10; set `PLATFORM_ADMIN_EMAILS`; keep `BILLING_SIMULATOR` unset in production.

**Open R1 carry-overs** (not blocking R2 work): SEC Form D public pipeline, entity resolution, OpenSearch + indexer (outbox is ready), BullMQ workers (H2: Redis), 10M-row load test, TS SDK, Fumadocs console, Storybook, Lighthouse/axe, Turnstile (H3).

**Cloud demo, still to do** (needs the owner or a host that can reach Postgres, D-020):
1. Set `PLATFORM_ADMIN_EMAILS` on `founders-ai-app` (owner's choice of admin emails) to open `/admin`.
2. Run `competitors`, `traction` and the `apps/ml` estimates once against the cloud DB (weekly/monthly jobs; they do not fit the serverless cron).
3. Migrations are applied by hand through the Supabase connector, as `founders_app` (`SET LOCAL ROLE founders_app; … RESET ROLE;`) so the app role owns new tables.
