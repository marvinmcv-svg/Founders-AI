## 0A. LOCKED TECHNICAL DECISIONS

v1 left many "X or Y" choices. A coding agent must not choose mid-build. These are final unless a human changes them in `/docs/decisions.md`.

| Concern | Decision | Notes |
|---|---|---|
| Package manager / monorepo | pnpm + Turborepo | Node 22 LTS |
| Web framework | Next.js 15 (App Router), React 19, TypeScript `strict` + `noUncheckedIndexedAccess` | `apps/www`, `apps/app`, `apps/docs` |
| API server | **Hono** on Node, mounted at `app.{{domain}}/api/v1` via Next.js rewrite | Same Zod schemas generate OpenAPI (`@hono/zod-openapi`) |
| UI | Tailwind CSS v4 + shadcn/ui (Radix) in `packages/ui` | Storybook 8 |
| Motion | `motion` (Framer Motion) | |
| Charts | **Recharts** (simple) + **visx** only for the confidence-band and driver charts | |
| Tables | TanStack Table v8 + TanStack Virtual | |
| URL state | nuqs | |
| Auth | **Better Auth** with `organization`, `twoFactor`, `apiKey` and SSO plugins | Multi-org membership (a user can belong to several workspaces) |
| Database | **PostgreSQL 16** (managed: Neon or Supabase — pick by region/price; code must be provider-agnostic) + `pgvector` | ORM: **Drizzle**; migrations via drizzle-kit |
| Time series (R1–R2) | **Postgres partitioned tables** (`company_metrics_daily`, monthly partitions) | Move to ClickHouse only when > 1B rows (R3+) |
| Usage/analytics events | Postgres `usage_events` (partitioned) in R1; ClickHouse in R3 | |
| Search | **OpenSearch 2.x** | Local: docker. Prod: managed provider chosen by human (H2); code uses the standard client only |
| Queue / jobs | **BullMQ + Redis 7**; cron via BullMQ repeatable jobs | Temporal is not used |
| ML service | Python 3.12, FastAPI, LightGBM, scikit-learn, SHAP, `uv` for deps | `apps/ml` |
| LLM | Anthropic Claude through Vercel AI SDK; provider wrapped in `packages/agent/llm.ts` so it can be swapped | Embeddings: one model, dimension set in config (`EMBEDDING_DIM`) |
| CMS | **MDX in repo** (`/content`) via Contentlayer-style loader (use `velite`) | No external CMS in R1 |
| API docs | **Fumadocs** + OpenAPI | `llms.txt` generated at build |
| MCP | `@modelcontextprotocol/sdk` TypeScript, Streamable HTTP, OAuth 2.1 (Better Auth as authorization server) | `apps/mcp` |
| Extension | WXT + React (MV3) | R3 |
| Email | Resend + React Email | |
| Billing | Stripe (seat subscriptions + credit packs) | |
| Booking | Cal.com (embed + API for counts) | |
| Bot protection | Cloudflare Turnstile on all public forms | |
| Cookie consent | Our own consent banner + Google Consent Mode v2; analytics load only after consent in EU/UK | |
| Analytics | PostHog (product + marketing), consent-gated | |
| Errors / tracing | Sentry + OpenTelemetry | |
| Hosting | Vercel (www, app, docs); **Docker images** for api, mcp, workers, ml, deployable to Railway or Fly.io (human picks, H2) | One environment each: `local`, `staging`, `production` |
| Testing | Vitest, Playwright, Schemathesis, k6, axe | |
| Lint/format | ESLint (flat) + Prettier; Ruff for Python | |

### Local development (must work with one command)
`pnpm dev:up` → `docker compose` starts Postgres+pgvector, Redis, OpenSearch, Mailpit, MinIO (S3); then `pnpm db:migrate && pnpm db:seed && pnpm dev`. `.env.example` lists every variable with a comment. `pnpm db:seed` loads the **synthetic seed dataset** (Section 9.0) so every screen works without any paid data provider.

### Engineering conventions
Conventional commits; one feature per branch/PR; PRs < 600 changed lines where possible; every PR updates tests and `/docs/progress`. No `any`, no `@ts-ignore` without a linked issue. All money stored as integer USD cents + original currency + FX date. All timestamps UTC `timestamptz`; display in user timezone. Soft-delete (`deleted_at`) for user-created objects; hard-delete only via DSAR workflow.
