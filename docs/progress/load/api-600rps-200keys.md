## API load test — 2026-11-26T20:29:07.175Z

Target: `http://localhost:4000/api/v1` · 200 keys × 3 rps/key = **600 rps** for 20 s (open loop, read-heavy mix).

| Metric | Value |
|---|---|
| Requests | 11998 |
| Achieved rate | 600 rps |
| Success (2xx) | 100.00 % |
| 5xx / network errors | 0 / 0 |
| Latency p50 / p95 / p99 / max | 10.1 / 193 / 257 / 274 ms |
| Status codes | 200: 11998 |

| Endpoint | Requests | 2xx | p95 ms |
|---|---|---|---|
| GET /companies/:id | 4882 | 4882 | 217 |
| GET /people/:id | 2332 | 2332 | 182 |
| GET /companies/:id/traction | 1188 | 1188 | 212 |
| GET /news-signals | 1758 | 1758 | 187 |
| GET /organization/credits | 589 | 589 | 81.4 |
| POST /companies/resolve | 1249 | 1249 | 134 |

**Rate limiter** (one key at 30 rps for 5 s, limit 15 rps): 88 accepted (≈ 17.6 rps), 61 answered 429 with Retry-After.

**Verdict: PASS** (criteria: ≥ 99 % 2xx, no 5xx, p95 ≤ 500 ms, ≥ 95 % of the target rate achieved, limiter caps a key near 15 rps).
