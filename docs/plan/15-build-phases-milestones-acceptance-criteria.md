## 15. BUILD PHASES, MILESTONES & ACCEPTANCE CRITERIA

v2 changes: phases are sequential (a single coding agent cannot run tracks in parallel); each phase is tagged with its release; data acceptance uses the seed dataset (real-data volume depends on H5); pixel-diff against the reference is replaced by **structural parity** (every section ID in `recon/sections.md` exists, in order, with its required components) because our copy and brand intentionally differ.

**Phase gate procedure (every phase):** 1) write `/docs/progress/phase-N.md` plan (tasks, files, risks); 2) implement in small PRs; 3) run `pnpm verify` (lint, typecheck, unit, e2e for touched areas, build); 4) run the phase's acceptance checks and paste evidence (command output, screenshots paths, numbers); 5) list anything `BLOCKED-HUMAN`; 6) stop and ask for human review at the end of each **release**.

Order: 0 → 1 → 3a → 2 → 3b → 5a → (R1 review) → 4 → 5b → 6 → 7 → 9 → (R2 review) → 8 → 10 → (R3 review).

### Phase 0 — Recon & foundations (Section 2 + 3)
- REA recon deliverables complete; monorepo scaffolded; CI (lint, typecheck, test, preview deploys); design tokens + base components in Storybook.
- ✅ Storybook shows every component in 4.2 with light theme; `recon/*` committed.

### Phase 1 — Design system & marketing shell [R1]
- Global chrome (announcement bar, header + 3 mega-menus, mobile menu, footer incl. "Ask AI" links, floating demo pill, cookie consent), Home, Platform, Companies, People, Investors, Transactions, Pricing, Contact (+ Cal.com + CRM lead), Partners, legal pages (incl. Privacy Rights/DSAR form and opt-out), 404/500. Links to R2/R3 pages render a tasteful "coming soon" state or are hidden by a feature flag — never a 404.
- `packages/mocks`: AppWindow + all DB table mocks, SignalCard ticker, Agent typing demo, API log terminal, CodeBlock with tabs, LogoMarquee, TestimonialMarquee.
- ✅ Structural parity: every R1 page's section IDs from `recon/sections.md` present in order (automated test reads `data-section` attributes); Lighthouse mobile ≥ 90 performance, ≥ 95 accessibility/best-practices/SEO; forms validated, Turnstile on, leads reach CRM (or a mock sink if H3 pending); cookie consent works; reduced-motion respected; `[TODO-COPY]` count reported.

### Phase 3a — App shell on seed data [R1]
- Auth/orgs/invites/onboarding, shell, ⌘K, EntityGrid + filter builder on Postgres-only queries against the seed (OpenSearch comes in Phase 2), profiles, lists, saved searches.
- ✅ The Phase 3b E2E scenarios pass on seed data (Postgres-only queries).

### Phase 2 — Data platform v1 [R1]
- Postgres schema + migrations; taxonomy seed; seed dataset + public pipeline (SEC Form D, registries, company websites); licensed-provider adapter stubbed until H5; entity resolution v1; OpenSearch indices + outbox sync; partitioned metrics tables; `platform_stats`; rank v1; highlights v1; **revenue/valuation v0 heuristic** (9.6); competitors v0 (taxonomy + business-model overlap, scored 0–10).
- ✅ Seed dataset + at least one real public pipeline (SEC Form D → companies/rounds/investors) running end-to-end with provenance; OpenSearch sync lag < 5 min; filter P95 < 500 ms at seed scale **and** in a 10M-company synthetic load test; duplicate rate < 2% on a 500-record audit sample. Real-data volume targets set once H5 is resolved.

### Phase 3b — Product app core on OpenSearch [R1]
- Switch grids/filters to OpenSearch; EntityGrid for **Companies, People, Investors, Funding Rounds**; filter builder (AST, nested groups, all operators); NL→filters; company profile tabs **Overview, Business, Financials, Team, News, Competitors**; person & investor profiles; Lists; Saved Searches with new-since-last-read + **email digest**; statuses, likes, notes; CSV import/export; Stripe seat subscription + credit-pack purchase (basic). (Remaining grids and tabs → Phase 4.)
- ✅ E2E (Playwright) scenarios: build nested filter, save search, receive new result, add to list, export; profile tabs render real data; shareable URLs restore state.

### Phase 4 — Signals & intelligence [R2]
- Talent signals pipeline + scoring + summaries; news pipeline (classify, score, summarise); competitor model v1 (embeddings) replacing R1 taxonomy-overlap competitors; highlights v2; revenue & valuation **ML** model (+ anchors queue, bands, confidence, drivers) replacing v0; new grids: Talent Signals, Acquisitions, IPOs; profile tabs Traction Metrics & Reviews; real-time & in-app & Slack alerts. (Interest signals are R3, Phase 8, behind H8.)
- ✅ Talent signals precision ≥ 85% on a 200-item human-labelled sample; news classification F1 ≥ 0.8; revenue model P10–P90 coverage 80–90% on backtest; digests delivered on schedule.

### Phase 5a — API core [R1]: read endpoints for companies/people/investors/rounds, resolve, lists, saved searches, account, keys, credits, docs, TS SDK.
### Phase 5b — API complete [R2]: signals, AI search, extraction, network, webhooks, Python SDK.
### Phase 5 (shared acceptance)
- Every route in the Section 11 table (5a = R1 subset, 5b = rest), OpenAPI, docs site with console, llms.txt files, key request/approval, rate limiting, credits ledger, redistribution filter, webhooks (5b).
- ✅ Contract tests for every endpoint against OpenAPI; 15 rps limit enforced; misses not charged; `X-Credits-*` headers correct; docs build with samples in 3 languages.

### Phase 6 — Agents & Skills [R2]
- Agent runtime, tools, step UI, sources, confirmations, personalization, skills editor/library/sharing, scheduled skills, artifacts, save-to-list.
- ✅ All 9 use-case prompts in 10.6 produce sourced answers with zero unsourced numbers (eval set of 50 prompts, LLM-graded + human spot-check).

### Phase 7 — MCP server [R2]
- 29 tools, OAuth, metering (100/day), write confirmations, prompts, install guide & help articles.
- ✅ Works in Claude Desktop, Claude Code, ChatGPT connector, Cursor, Windsurf, OpenCode (manual test matrix); MCP Inspector passes.

### Phase 8 — Integrations [R3]
- CRM adapters ×6 (pull/push/match preview/schedule/log), network sources (LinkedIn CSV, Gmail, Outlook, calendars), Chrome extension, Zapier app, bulk delivery to S3/GCS/Snowflake, **Interest Signals grid + pipeline behind flag (H8)**, Integrations marketing page, ClickHouse migration if volumes require.
- ✅ Round-trip sync test per CRM sandbox; extension approved on Chrome Web Store (unlisted first); bulk incremental replay test.

### Phase 9 — Remaining marketing pages & content [R2]
- Talent, Interest (page ships only if H8 approved; else hidden), News, Revenue & Valuation, Agents, API, MCP pages (all sections in Section 6); comparison & alternatives templates (10 pages, legally reviewed); blog/insights/case studies/careers; SEO (sitemap.xml, robots, JSON-LD, OG images); analytics events.
- ✅ Every section in Section 6 present (structural parity test); all mocks wired to fixtures; link checker passes; **copy similarity check**: script compares every shipped string against the reference text captured in recon (n-gram overlap); any string with ≥ 8 consecutive matching words fails the build.

### Phase 10 — Billing, admin, compliance, hardening, launch [R3; billing basics in R1]
- Stripe seats + credits, admin console, DSAR workflow, audit log, pen test, load test (API 15 rps × 200 keys), backups/DR, status page, on-call runbooks.
- ✅ Launch checklist signed off by Eng, Legal, Security, Marketing.
