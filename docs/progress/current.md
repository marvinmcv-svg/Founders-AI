# Current status

**Release:** R1 — *Credible demo* — **built, awaiting human review** (plan 0B: do not start R2 until a human accepts R1).

**Done in R1** (evidence in `docs/progress/r1-acceptance.md`)
- Phase 0: monorepo, docker-compose, `.env.example`, plan split, AGENTS.md, decisions/blocked logs, `recon/sections.md`.
- Phase 1: global chrome (announcement bar, header + 3 mega-menus, mobile sheet, footer with "Ask AI" links, demo pill, cookie consent), Home, Platform, Companies, People, Investors, Transactions, Pricing (+FAQ JSON-LD), Contact (demo form → leads), Partners (+form), Privacy policy, Privacy rights (DSAR form), Terms, DPA, 404/500, coming-soon pages for R2/R3 links, sitemap/robots.
- Phase 3a/3b (Postgres-only): auth + multi-workspace orgs + invites, onboarding, ⌘K, EntityGrid for Companies / People / Investors / Funding Rounds (+ Talent Signals), filter builder (AST, every operator, nested AND/OR), NL → filters, profiles (company: Overview, Business, Financials, Team, News, Competitors; person; investor), lists (+ CSV/paste import with match preview), saved searches with new-since-last-read, digest builder, statuses, likes, hides, notes, CSV export with credit cost.
- Phase 2 (partial): Postgres schema + migrations, partitioned metrics, `platform_stats`, deterministic seed (plan 9.0 sizes), taxonomy, rank v1, highlights v1, revenue/valuation **v0 heuristic**, competitors v0.
- Phase 5a: REST API (55 operations incl. some R2 ones), API keys (hashed, approval flow, trial credits), credit ledger + `X-Credits-*` headers, rate limit, redistribution filter, OpenAPI + llms.txt, docs page.

**Not done / next** (see `blocked.md` for human items)
- Phase 2: SEC Form D public pipeline, entity resolution, OpenSearch + outbox indexer, BullMQ workers, 10M-row load test.
- Phase 3b: switch grid to OpenSearch; Stripe seat + credit packs (H13); scheduled digest delivery (needs Resend + a worker).
- TS SDK (`packages/sdk`), Fumadocs site with "Try it" console, Storybook, Lighthouse run, axe in CI, Turnstile (H3).

**Read next:** plan 15 (R2 phases 4, 5b, 6, 7, 9) once R1 is accepted.
