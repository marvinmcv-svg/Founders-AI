# API performance & capacity

- Rate limit: 15 requests/second per key (token bucket, `core/limits.ts`), answered with 429 + `Retry-After`. **In-memory per instance today**; with several instances the effective limit multiplies — move the bucket to Redis with the worker host (H2).
- Load test: `pnpm load:api -- --base <url>/api/v1 --keys 200 --rps-per-key 0.075 --duration 60 --out <report.md>` (plan target 15 rps across 200 keys). Results: [`docs/progress/load/`](../progress/load/). Never point it at production without warning the team; it creates and removes its own workspace and keys.
- Measured on one API process (local Postgres, 2026-11-26): 15 rps p95 12 ms, 200 rps p95 10 ms, 600 rps p95 193 ms; saturates near 650–700 rps. For "every key at its limit" (200 × 15 = 3,000 rps) plan ≥ 6 instances plus the Redis limiter and a connection pooler sized for them.

## API slow
1. `/api/health` database latency; Supabase → Reports (CPU, connections). Connection exhaustion → the app must use the transaction pooler (6543) with `prepare: false` (D-019).
2. Vercel runtime logs: slow routes; `EXPLAIN ANALYZE` the query behind them.
3. A single customer hammering: their key shows in `usage_events`; revoke or ask them to back off.
