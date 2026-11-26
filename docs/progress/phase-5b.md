# Phase 5b — API complete (R2)

Started 2026-11-26 after Phase 4 was deployed ("push this to Vercel and move on to the next phase").
Plan sections: 11 (all), 15 (Phase 5b + shared Phase 5 acceptance), 14 (SSRF), 0B.

## Tasks
| # | Task | Main files | Status |
|---|---|---|---|
| 5b.0 | Migration 0004: `webhooks`, `webhook_deliveries`, `api_queries`, `idempotency_keys` (RLS on) | `packages/db/drizzle/0004_phase5b_api.sql` | done |
| 5b.1 | Signals feeds: `GET /news-signals` (#39), `GET /revenue-signals` (#38) | `apps/api/src/routes.ts` | done |
| 5b.2 | AI search query ids persisted (#40/41 work across serverless instances) | `core/src/repo/api.ts` | done |
| 5b.3 | Entity extraction `POST /entities/extract` (#42) | `core/src/extract.ts`, `core/src/repo/extract.ts` | done |
| 5b.4 | Webhooks #71–74: HTTPS + SSRF-checked targets (on save and every delivery), HMAC-SHA256 `X-Signature`, 10 s timeout, 6 retries with backoff, auto-disable after 24 h; events `search.new_results`, `signal.talent`, `list.news` produced from the outbox | `core/src/repo/webhooks.ts`, `core/src/repo/alerts.ts`, `pipelines/src/jobs/webhooks.ts` | done |
| 5b.5 | Idempotency-Key on every POST (24 h replay, 422 on mismatch, replays not charged) | `apps/api/src/kit.ts` | done |
| 5b.6 | Saved-search results as six explicit routes (#49–54) | `apps/api/src/routes.ts` | done |
| 5b.7 | R3 routes registered, answering 501 (interest #14/28/36/37/53, network #64–67) — D-031 | `apps/api/src/routes.ts` | done |
| 5b.8 | Python SDK (stdlib), typed errors, retries, pagination, webhook verifier | `packages/sdk-python` | done |
| 5b.9 | Contract tests: route table = Section 11, OpenAPI parity, auth/rate limit/credits/misses/idempotency/webhooks/extraction/501 | `apps/api/test/contract.test.ts` | done |

## Acceptance evidence (2026-11-26, local Postgres 16, seed scale 1)

| Plan 15 Phase 5 criterion | Result |
|---|---|
| Every route in the Section 11 table | 74/74 registered (+2 documented investor-list extensions); 65 live, 9 answer 501 until R3 (D-031). Test: `route table`. |
| OpenAPI | Every registered route documented with `x-credits`; R3 routes carry `x-release` + a 501 response. Test: `documents every route`. |
| Contract tests for every endpoint against OpenAPI | Route-table and OpenAPI parity for all 76; behavioural tests for auth, credits, misses, rate limit, feeds, AI search, extraction, idempotency, webhooks, 501s (11 tests). Per-endpoint response-schema validation is still open (responses are not yet typed in OpenAPI). |
| 15 rps limit enforced | 20 concurrent requests on one key → 429 + `Retry-After`. |
| Misses not charged | 404 has no `X-Credits-Charged`; R3 501s are not charged. |
| `X-Credits-*` headers correct | Hit = `X-Credits-Charged: 1`; extraction charges exactly the entity count; idempotent replay = `0`. |
| Webhooks | Signature verified by core tests **and** the Python SDK with the same vector; retry/backoff/disable tested with an injected clock. |
| Python SDK | 6 stub-server tests + 1 live end-to-end test against `apps/api` (passed locally). |
| Docs build with samples in 3 languages | **Open** — the Fumadocs console is an R1 carry-over; `llms.txt` and `openapi.json` are generated and served. |

## Still open (carried to the next session)
- Docs site (`apps/docs`, Fumadocs) with console and cURL/Python/JS samples — R1 carry-over, now unblocked by the complete OpenAPI.
- TypeScript SDK (R1 carry-over).
- Typed response schemas in OpenAPI (needed for full per-endpoint response contract tests).
- Webhook management UI in Settings (API-only today).
- Rate limiting is per instance until Redis exists (D-017, H2).
