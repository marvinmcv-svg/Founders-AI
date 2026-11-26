# Founders AI

Private-markets intelligence platform — marketing site, product app and public API — built from Santa Cruz, Bolivia for VC, PE, M&A and GTM teams. Release 1 ("credible demo") of [`docs/plan/MASTER_PLAN_v2.md`](docs/plan/MASTER_PLAN_v2.md).

| Surface | Path | Dev URL |
|---|---|---|
| Marketing site | `apps/www` | http://localhost:3000 |
| Product app (+ API at `/api/v1`, docs at `/developers`) | `apps/app` | http://localhost:3001 |
| Standalone API server (Docker/Railway) | `apps/api` | http://localhost:4000/api/v1 |

## Live demo (Vercel, protected)
| | URL |
|---|---|
| Marketing site | https://founders-ai-marvinmcv-svgs-projects.vercel.app |
| Product app | https://founders-ai-app-marvinmcv-svgs-projects.vercel.app (demo login pre-filled) |
| API docs | https://founders-ai-app-marvinmcv-svgs-projects.vercel.app/developers |

Both projects use Vercel Authentication: you see them when logged into Vercel; share with others via a Vercel share link or by turning protection off. Data is synthetic (`SEED_SCALE=0.2`) in Supabase `founders-ai` (sa-east-1).

## Quick start
```bash
pnpm install
cp .env.example .env
pnpm dev:up        # docker compose (Postgres+pgvector, Redis, OpenSearch, Mailpit, MinIO) → migrate → seed
pnpm dev           # www :3000, app :3001
```
No Docker? Point `DATABASE_URL` at any Postgres 16 with `pgvector` and `pg_trgm`, then `pnpm db:migrate && pnpm db:seed` (`SEED_SCALE=0.1` for a 10-second seed).

**Demo login (local only):** `demo@foundersscz.com` / `founders-demo` · **API key:** `fai_demo_local_only_9f3c2b7a1e5d4c8b`

Set `ANTHROPIC_API_KEY` to use Claude for plain-English search; without it a deterministic parser is used.

## Commands
`pnpm verify` (lint, typecheck, unit tests, copy check, build) · `pnpm test:e2e` (needs `pnpm dev` running) · `pnpm db:reset` · `pnpm --filter @founders/seed fixtures` (refresh marketing mock fixtures)

## Layout
```
apps/www        marketing site (Next.js 15)          packages/core   domain: taxonomy, filter AST + SQL compiler, NL search, credits, org-scoped repos
apps/app        product app + API mount + docs        packages/db     Drizzle schema + migrations
apps/api        Hono REST API (OpenAPI from Zod)      packages/seed   deterministic synthetic dataset + demo workspace
packages/ui     design system (Founders brand)        packages/mocks  marketing product mocks (real UI + fixtures)
content/        copy (en.json), legal drafts          docs/           plan, decisions, progress, blocked items
```
Start with [`AGENTS.md`](AGENTS.md), [`docs/progress/current.md`](docs/progress/current.md) and [`docs/decisions.md`](docs/decisions.md).

All company, people and investor records are **synthetic** until data-provider contracts are signed (see `docs/progress/blocked.md`).
