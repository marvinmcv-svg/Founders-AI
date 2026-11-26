## API load test — 2026-11-26T20:27:53.925Z

Target: `http://localhost:4000/api/v1` · 200 keys × 0.075 rps/key = **15.0 rps** for 60 s (open loop, read-heavy mix).

| Metric | Value |
|---|---|
| Requests | 899 |
| Achieved rate | 15.0 rps |
| Success (2xx) | 100.00 % |
| 5xx / network errors | 0 / 0 |
| Latency p50 / p95 / p99 / max | 5.7 / 11.7 / 14.6 / 30.5 ms |
| Status codes | 200: 899 |

| Endpoint | Requests | 2xx | p95 ms |
|---|---|---|---|
| POST /companies/resolve | 81 | 81 | 10.5 |
| GET /people/:id | 148 | 148 | 6.3 |
| GET /companies/:id | 362 | 362 | 7.8 |
| GET /news-signals | 153 | 153 | 14.2 |
| GET /companies/:id/traction | 102 | 102 | 8.0 |
| GET /organization/credits | 53 | 53 | 3.8 |

**Rate limiter** (one key at 30 rps for 5 s, limit 15 rps): 89 accepted (≈ 17.8 rps), 60 answered 429 with Retry-After.

**Verdict: PASS** (criteria: ≥ 99 % 2xx, no 5xx, p95 ≤ 500 ms, ≥ 95 % of the target rate achieved, limiter caps a key near 15 rps).
