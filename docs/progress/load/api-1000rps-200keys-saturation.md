## API load test — 2026-11-26T20:30:02.547Z

Target: `http://localhost:4000/api/v1` · 200 keys × 5 rps/key = **1000 rps** for 20 s (open loop, read-heavy mix).

| Metric | Value |
|---|---|
| Requests | 19964 |
| Achieved rate | 456 rps |
| Success (2xx) | 100.00 % |
| 5xx / network errors | 0 / 0 |
| Latency p50 / p95 / p99 / max | 23870 / 29737 / 29883 / 29945 ms |
| Status codes | 200: 19964 |

| Endpoint | Requests | 2xx | p95 ms |
|---|---|---|---|
| GET /people/:id | 3987 | 3987 | 27013 |
| GET /organization/credits | 1039 | 1039 | 9603 |
| POST /companies/resolve | 1950 | 1950 | 22985 |
| GET /companies/:id/traction | 2017 | 2017 | 29803 |
| GET /news-signals | 3001 | 3001 | 27002 |
| GET /companies/:id | 7970 | 7970 | 29835 |

**Rate limiter** (one key at 30 rps for 5 s, limit 15 rps): 88 accepted (≈ 17.6 rps), 61 answered 429 with Retry-After.

**Verdict: FAIL** (criteria: ≥ 99 % 2xx, no 5xx, p95 ≤ 500 ms, ≥ 95 % of the target rate achieved, limiter caps a key near 15 rps).
