# MASTER BUILD PLAN v2 — Private-Markets Intelligence Platform
### Feature-for-feature rebuild of tryspecter.com (marketing site + full product + API + MCP + Agents + Chrome extension)

> **Hand-off document for the coding agent.** v2 = audited revision of v1 (changelog in Section 20).
> **First action for the agent:** split this file into `/docs/plan/00-…md` … `/docs/plan/20-…md` (one file per section, text unchanged) and create `/AGENTS.md` from Section 19. From then on load only the plan files the current phase needs — never the whole plan at once.
> Work release by release and phase by phase (Sections 0B and 15). Every phase ends with the acceptance checks listed for it. Nothing is "done" until its checks pass and the evidence is written to `/docs/progress/phase-N.md`.
> **Precedence when two parts seem to conflict:** Section 0 (rules) > Section 0A (locked decisions) > Section 0B (scope) > Section 15 (phases) > everything else. If a conflict remains, log it in `/docs/decisions.md`, pick the simpler option and continue.

- **Reference target:** https://www.tryspecter.com (researched 25 Nov 2026)
- **Reverse-engineering toolkit:** REA — Reverse Engineer Anything — https://github.com/morluto/rea (`npx rea-agents setup`)
- **Working brand name in this doc:** `{{BRAND}}` (placeholder — pick a real name before launch; see Section 0)
- **Prepared by:** Product, Engineering, UX/UI, Marketing & Copy leads (combined plan)

---

## TABLE OF CONTENTS

0. Ground rules (read first)
0A. Locked technical decisions (no "or" choices left)
0B. Release scope — what ships in R1 / R2 / R3
0C. Human-only tasks & inputs the agent cannot do
0D. Global config & placeholders
1. Product summary — what we are building
2. Phase 0 recon with REA — exact workflow
3. Tech stack & monorepo layout
4. Design system (tokens, type, components, motion)
5. Global site chrome (announcement bar, header mega-menus, footer, floating demo pill)
6. Marketing site — page-by-page, section-by-section spec (17 page types)
7. The product app — information architecture & every screen
8. Data model (Postgres schema) & search index
9. Data acquisition & signal pipelines (companies, people, investors, transactions, talent, interest, news, revenue/valuation)
10. AI layer — Agents, Skills, Personalization, AI search
11. Public REST API (74-route spec) + docs site with llms.txt
12. MCP server (29 tools) + usage metering
13. Integrations — CRM sync (6), Network tracking, Chrome extension, Slack/Email/Zapier/Webhooks, Bulk delivery (S3/GCS/Snowflake)
14. Billing, credits, seats, admin, security & compliance
15. Build phases, milestones & acceptance criteria
16. Testing & QA strategy
17. Copy & marketing deliverables
18. Final "nothing missed" master checklist
19. AGENTS.md + kick-off prompt for the coding agent
20. v1 → v2 audit changelog

---

