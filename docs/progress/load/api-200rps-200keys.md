## API load test — 2026-11-26T20:28:35.537Z

Target: `http://localhost:4000/api/v1` · 200 keys × 1 rps/key = **200 rps** for 30 s (open loop, read-heavy mix).

| Metric | Value |
|---|---|
| Requests | 5999 |
| Achieved rate | 200 rps |
| Success (2xx) | 100.00 % |
| 5xx / network errors | 0 / 0 |
| Latency p50 / p95 / p99 / max | 4.1 / 9.9 / 14.0 / 37.9 ms |
| Status codes | 200: 5999 |

| Endpoint | Requests | 2xx | p95 ms |
|---|---|---|---|
| POST /companies/resolve | 568 | 568 | 9.7 |
| GET /organization/credits | 295 | 295 | 2.4 |
| GET /people/:id | 1214 | 1214 | 5.0 |
| GET /companies/:id/traction | 584 | 584 | 6.7 |
| GET /companies/:id | 2422 | 2422 | 6.7 |
| GET /news-signals | 916 | 916 | 13.2 |

**Rate limiter** (one key at 30 rps for 5 s, limit 15 rps): 88 accepted (≈ 17.6 rps), 61 answered 429 with Retry-After.

**Verdict: PASS** (criteria: ≥ 99 % 2xx, no 5xx, p95 ≤ 500 ms, ≥ 95 % of the target rate achieved, limiter caps a key near 15 rps).
