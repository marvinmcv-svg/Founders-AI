# BLOCKED-HUMAN

Items from plan Section 0C. Each is stubbed behind an interface so work can continue.

| # | Status | Needed for | Task | Current stub |
|---|---|---|---|---|
| H1 | PARTIAL | Everything | Final brand name, domain, logo, colour tweaks, legal entity name | Using **Founders AI**, the existing Founders "F." mark and lime-on-black palette from academy.foundersscz.com. Domain defaults to `foundersscz.com` (`BRAND_DOMAIN`). Legal entity placeholder `Founders SCZ` (`BRAND_LEGAL_ENTITY`) — confirm. |
| H2 | BLOCKED-HUMAN | R1 | Cloud accounts (Vercel, Railway/Fly, managed Postgres, OpenSearch, Redis), DNS | Local stack via `docker compose` / local Postgres. |
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
