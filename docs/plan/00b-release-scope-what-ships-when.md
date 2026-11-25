## 0B. RELEASE SCOPE — WHAT SHIPS WHEN

v1 had no scope cut, so "build everything" was the only instruction. That is months of work for a team. Build in three releases. **Do not start R2 work until R1 is accepted by a human.**

| Release | Goal | Includes | Explicitly NOT included |
|---|---|---|---|
| **R1 — Credible demo** | A site you can sell from + an app that works on real-looking data | Global chrome, Home, Platform, Companies, People, Investors, Transactions, Pricing, Contact, Partners, Legal, cookie consent · App: auth/orgs/invites, onboarding, ⌘K, grids for Companies/People/Investors/Funding Rounds, filter builder (AST + NL), company/person/investor profiles (Overview, Business, Financials, Team, News, Competitors tabs), Lists, Saved Searches + email digest · Seed + one public-data pipeline (SEC Form D + registries + company websites) · Revenue estimate **v0 heuristic** · API: core read endpoints + resolve + lists/searches + keys + credits + docs | Agent, MCP, CRM sync, network, extension, bulk, interest signals, ML revenue model |
| **R2 — Signals & AI** | The differentiators | Talent signals, News signals, Acquisitions/IPOs grids, Traction & Reviews tabs, revenue/valuation **ML model**, Agents + Skills, MCP server, remaining API endpoints, webhooks, Slack alerts, Talent/News/Revenue-Valuation/Agents/API/MCP marketing pages, comparison & alternatives pages, blog/insights | Interest signals (unless legal sign-off), CRM, extension, bulk |
| **R3 — Workflow & scale** | Fit into customer stacks | CRM ×6, network tracking, Chrome extension, Zapier, bulk delivery, Integrations page, Interest signals (behind flag), ClickHouse migration, SSO/SCIM, Stripe metered billing, admin console complete | — |
