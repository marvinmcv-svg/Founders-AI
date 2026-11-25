## 18. FINAL "NOTHING MISSED" MASTER CHECKLIST

**Global**
- [ ] Announcement bar (CMS-driven, dismissible)
- [ ] Header: Platform mega-menu (overview + Data 4 + Features 6 + promo banner), Agents, API, Integrations mega-menu (Connect 4 + Delivery 3 with "New" badge), Resources (Blog, Insights), Pricing, Log in, Get started
- [ ] Mobile nav sheet
- [ ] Footer: 7 link columns, socials, 5 "Ask AI" deep links, © line, 3 legal links
- [ ] Floating demo pill with real count
- [ ] Logo marquee · testimonial marquee · press row · final CTA band · Agents/MCP/API promo blocks
- [ ] SEO: titles, descriptions, OG/Twitter images, JSON-LD, sitemap.xml, robots.txt, canonical

**Marketing pages (each with all sections from Section 6)**
- [ ] Home (16 sections) · [ ] Platform (9) · [ ] Companies (11) · [ ] People (14) · [ ] Investors (9) · [ ] Transactions (17) · [ ] Talent Signals (7) · [ ] Interest Signals (7) · [ ] News (10) · [ ] Revenue & Valuation (9, incl. `#valuation-estimates`) · [ ] Agents (8) · [ ] API (9) · [ ] MCP (7) · [ ] Integrations (8, anchors #crm #network #chrome #api) · [ ] Pricing (3 plans + 7 FAQs) · [ ] Contact/demo form (7 fields + booking) · [ ] Partners (+ application form) · [ ] Careers · [ ] Blog · [ ] Insights + newsletter · [ ] Case study template · [ ] 7 "vs" comparison pages · [ ] 3 "alternatives" pages · [ ] Privacy Policy · [ ] Privacy Rights (DSAR) · [ ] Terms · [ ] Opt-out · [ ] 404/500

**Product app**
- [ ] Shell w/ Browse/Agent modes, notifications, workspace switcher
- [ ] ⌘K quick search
- [ ] Grids: Companies, People, Investors, Talent Signals, Interest Signals, Funding Rounds, Acquisitions, IPOs (+ News in context)
- [ ] Export, saved views, Clear/Save Search, Sort by Rank, Status, Add Filter, filter chips
- [ ] Nested AND/OR filter builder + taxonomy + highlights + CRM/network/list filters + NL→filters
- [ ] Saved searches w/ new-since-last-read, cadence alerts, channels
- [ ] Lists (company/people/investor), custom fields, statuses, notes, CSV import w/ match preview, system lists My CRM / My Network / Liked
- [ ] Company profile: 8 tabs (Overview, Business, Financials, Team, Traction Metrics, Reviews, News, Competitors) + actions
- [ ] Person profile (Get Email, signals, experience, education, investments, network)
- [ ] Investor profile (stats, portfolio, co-investors, interest, fit score)
- [ ] Signal detail drawers, Round-forming view, forecast card
- [ ] Digests (daily/weekly/real-time) via in-app, email, Slack, webhook
- [ ] Settings (workspace, members, integrations, API keys, MCP overage, credits, personalization, statuses, privacy, audit)
- [ ] Internal admin console

**Data & intelligence**
- [ ] Companies 250+ fields · People 60+ · Investors · Rounds/M&A/IPOs
- [ ] Entity resolution + merge tool
- [ ] Taxonomy & classifier with QA queue
- [ ] Highlights & rank
- [ ] Talent signals (6 types, status, score, summary)
- [ ] Interest signals (sources, score 1–10, round forming, forecast) — legal sign-off
- [ ] News signals (5 update types, 0–5 score, majors, summaries)
- [ ] Revenue & valuation (quantile model, anchors, bands, confidence, drivers, growth %s)
- [ ] Competitors (overlap 0–10)
- [ ] Time-series traction metrics
- [ ] Verified emails

**AI**
- [ ] Agent runtime w/ steps, sources, confirmations, artifacts, save-to-list
- [ ] Composer `@ # /`
- [ ] Personalization (instructions)
- [ ] Skills: create, share, curated library (12), scheduled runs
- [ ] Web search enrichment
- [ ] AI search endpoint & entity extraction

**Developer**
- [ ] 73 API endpoints, keys w/ approval, 200 trial credits, 15 rps, 5,000/page, 50/bulk, misses free, credit headers
- [ ] Docs site, console, OpenAPI 3.0, cURL/Python/JS samples, llms.txt, llms-full.txt, Markdown per page
- [ ] Webhooks (signed)
- [ ] MCP: 29 tools (24R/5W), OAuth, 100 free/day, overage toggle, prompts, install guides for 6 clients

**Integrations**
- [ ] CRM ×6: pull, push, match preview, field mapping, scheduled enrichment, CRM filters, activity log
- [ ] Network: LinkedIn CSV, Gmail, Outlook, calendars; team dedupe; warm paths; move alerts
- [ ] Chrome extension: any-site side panel + LinkedIn inline panel; push/list/like
- [ ] Slack app, Email, Zapier, CSV
- [ ] Bulk: S3, GCS, Snowflake; CSV/Parquet; full + daily incrementals; stable IDs; estimates

**v2 additions**
- [ ] Section 0A decisions applied; no "or" left in code choices
- [ ] `pnpm dev:up` one-command local env; `.env.example` complete
- [ ] Synthetic seed dataset + provider adapter interfaces
- [ ] Copy keys everywhere; `[TODO-COPY]` build gate; copy-similarity gate
- [ ] Onboarding, empty/loading/error states, responsive policy
- [ ] Memberships (multi-org), entity_type on polymorphic tables, taxonomy & schools tables, notifications, FX
- [ ] Field provenance + redistribution filter on API/MCP/export/bulk
- [ ] Credit price table in config; cursor pagination; API versioning policy
- [ ] SSRF egress proxy, CSV-injection guard, webhook URL validation
- [ ] Cookie consent + Turnstile
- [ ] Revenue v0 heuristic before ML; leakage-safe backtest
- [ ] Interest-signal telemetry OFF by default; no named-firm attribution from telemetry
- [ ] LinkedIn content script behind flag (legal gate)
- [ ] Agent cost guardrails + eval harness
- [ ] `BLOCKED-HUMAN` list maintained

**Business & compliance**
- [ ] Stripe seats + metered credits; contact-sales flows
- [ ] RBAC + RLS; SSO/SCIM; audit log
- [ ] DSAR + suppression list; DPA; subprocessors; LIA
- [ ] Monitoring, backups, status page, runbooks
