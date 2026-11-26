# BLOCKED-HUMAN

Items from plan Section 0C. Each is stubbed behind an interface so work can continue.

| # | Status | Needed for | Task | Current stub |
|---|---|---|---|---|
| H1 | PARTIAL | Everything | Final brand name, domain, logo, colour tweaks, legal entity name | Using **Founders AI**, the existing Founders "F." mark and lime-on-black palette from academy.foundersscz.com. Domain defaults to `foundersscz.com` (`BRAND_DOMAIN`). Legal entity placeholder `Founders SCZ` (`BRAND_LEGAL_ENTITY`) — confirm. |
| H2 | PARTIAL | R1 | Cloud accounts (Vercel, Railway/Fly, managed Postgres, OpenSearch, Redis), DNS | Vercel (2 projects, gru1) + Supabase Postgres (sa-east-1) live. Still needed: custom domain + DNS, Redis, OpenSearch, Railway/Fly for workers. |
| H3 | BLOCKED-HUMAN | R1 | Anthropic, Resend, Cal.com, PostHog, Sentry, Turnstile keys | NL search falls back to a deterministic parser when `ANTHROPIC_API_KEY` is unset; demo form leads go to the `leads` table (mock CRM sink); demo-pill count hidden; Turnstile skipped when no secret. |
| H4 | PARTIAL | R1 | Copy for every key in `/content/copy/en.json` | Engineering wrote **first-draft original copy** (EN + ES) so the demo is presentable. Every key still needs copy-team review — see `content/copy/README.md`. |
| H5 | BLOCKED-HUMAN | R1/R2 | Data provider contracts with redistribution rights | Synthetic seed dataset only. Provider adapters are interfaces in `packages/core/src/providers.ts`. |
| H6 | BLOCKED-HUMAN | R1 | Privacy policy, terms, DPA, LIA reviewed by a lawyer | Legal pages render a clearly marked draft notice. |
| H7 | BLOCKED-HUMAN | R2 | Comparison/alternatives page facts verified | Not built (R2). |
| H8 | BLOCKED-HUMAN | R2 | Interest-signal source approval | Not built (R3, flag off). |
| H9 | BLOCKED-HUMAN | R3 | OAuth apps + marketplace reviews for CRMs, Slack, Zapier | Not built (R3). |
| H10 | BLOCKED-HUMAN | R3 | Google OAuth verification + CASA | Not built (R3). |
| H11 | BLOCKED-HUMAN | R3 | Chrome Web Store account + LinkedIn legal check | Not built (R3). |
| H12 | BLOCKED-HUMAN | R3 | Snowflake / AWS / GCP accounts | Not built (R3). |
| H13 | BLOCKED-HUMAN | R1 | Stripe account, prices | Credits ledger works locally; Stripe checkout not wired. |
| H14 | BLOCKED-HUMAN | Launch | Pen test vendor, SOC 2 auditor | — |
| H15 | BLOCKED-HUMAN | R2 Phase 4 | Human-labelled evaluation samples: 200 talent signals, ~200 news items, plus review of the revenue-anchor queue | Precision/F1 reported on synthetic labels and an engineering-labelled set (`docs/progress/phase-4.md`). `/admin` queue holds extracted anchors as `pending`. |
| H3 (R2) | BLOCKED-HUMAN | R2 Phase 4 | Working `ANTHROPIC_API_KEY` (the configured key returns 401), hosted embedding model, Resend | LLM steps use deterministic fallbacks (circuit breaker, D-025); competitors use the local hashed TF-IDF embedder; alert/digest email is stored, not sent. |
| H2 (R2) | BLOCKED-HUMAN | R2 Phase 4 | Worker host (Railway/Fly) + Redis for weekly/monthly jobs and the Python ML service | Daily jobs run from Vercel cron (D-023); competitors, traction and ML estimates run from the CLI. |

| H3 (R2 agent) | BLOCKED-HUMAN | R2 Phase 6 | Working `ANTHROPIC_API_KEY` for the agent's Claude engine and the LLM-graded eval | Agent answers come from the deterministic rules engine (D-037); the Claude loop is covered by tests with a scripted client. |
| H15 (R2 agent) | BLOCKED-HUMAN | R2 Phase 6 | Human spot-check of agent answers on the 50-prompt eval set | Deterministic graders (sourced, cited, tools, entities, confirmation, no-leak) pass 50/50. |
| H16 | BLOCKED-HUMAN | R2 Phase 7 | Manual MCP client matrix on the production URL: Claude Desktop/claude.ai, Claude Code, ChatGPT connector, Cursor, Windsurf, OpenCode | Protocol paths those clients use are covered by e2e (OAuth discovery, DCR, PKCE, consent, Streamable HTTP) and MCP Inspector. |
| H17 | BLOCKED-HUMAN | R2 Phase 9 | Legal review + sourcing of competitor comparison / alternatives pages (plan 6.17, 15 Phase 9 "legally reviewed") | Template, schema and `/comparisons` index ship; pages are JSON in `content/comparisons/` and the build refuses any file without `reviewed`, `reviewedBy`, `asOf` and sources. None published yet. |
| H18 | BLOCKED-HUMAN | R2 Phase 9 | ATS account (Ashby job board name) for `/careers` open roles | Set `ASHBY_JOB_BOARD` on `founders-ai`; until then Careers shows values and a "write to us" CTA, never invented roles. |
| H3 (R2 newsletter) | BLOCKED-HUMAN | R2 Phase 9 | Email provider for the weekly letter (Resend) + newsletter template sign-off | Signups are stored as `NEWSLETTER` leads (`/api/leads`) until sending is connected. |
