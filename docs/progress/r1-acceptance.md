# R1 acceptance evidence (2026-11-25)

Environment: local Postgres 16 + pgvector, `SEED_SCALE=1`, Node 22, Next.js 15.5 dev + production builds.

## Commands
| Check | Result |
|---|---|
| `pnpm turbo run typecheck lint` | all packages pass |
| `pnpm --filter @founders/core test` | **42 / 42** passed — every filter operator compiles, nested groups, sort whitelist, validation, URL round-trip, NL rules parser, pricing, CSV-injection guard, v0 estimates, **cross-org tenancy suite** |
| `pnpm test:e2e` (Playwright, dev servers) | **15 / 15** passed — structural parity on 9 marketing pages, demo-form validation + lead capture, coming-soon routing, nested filter → shareable URL → save search, NL search → editable chips, add-to-list from grid, export cost shown, profile tabs |
| `pnpm copy:check` | 133 static key uses, 0 missing, 0 `TODO-COPY` |
| `pnpm build` (www, app) | both succeed; marketing first-load JS 102–124 kB |
| Seed (`pnpm db:seed`) | 50,000 companies · 250,000 people · 3,000 investors · 44,109 rounds · 2,000 acquisitions · 300 IPOs · 30,000 talent signals · 20,000 news · 1.8M metric points · 600k estimates · 2,533 disclosures — **63 s** |
| Filter latency (Postgres, 50k companies, 90 mixed queries) | **p50 8 ms · p95 83 ms** (target < 500 ms) |

## API spot checks (`fai_demo_local_only_…` key)
- No key → 401 problem+json. Invalid id → 404, **not charged** (`X-Credits-*` unchanged).
- `GET /companies/{id}` → `X-Credits-Charged: 1`, balance decremented.
- 25 concurrent calls → first ~15 succeed, rest **429** with `Retry-After`.
- Other workspace's list id → 404 (tenancy).
- `POST /search {"query":"seed fintech in Bolivia"}` → companies, 3 filters, 157 results.
- `/api/v1/openapi.json` → 50 paths / 56 operations; `/api/v1/llms.txt` lists every endpoint with credit cost.

## Screens
`docs/progress/screens/` — marketing home, companies grid, company financials tab.

## Not yet measured
Lighthouse mobile scores, axe, 10M-company load test, OpenSearch sync lag (OpenSearch not wired — D-007).
