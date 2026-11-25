## 20. v1 → v2 AUDIT CHANGELOG

What the audit found in v1 and how v2 fixes it (severity: 🔴 would break or derail the build · 🟠 serious risk · 🟡 quality gap).

| # | Sev | v1 flaw | v2 fix |
|---|---|---|---|
| 1 | 🔴 | No scope cut: "build all 9 surfaces" with no MVP, unrealistic for one coding agent | Section 0B: three releases with explicit in/out lists and human gates |
| 2 | 🔴 | Stack had a dozen "X or Y" choices the agent would have to decide mid-build | Section 0A locks every choice; v1 table marked superseded |
| 3 | 🔴 | Phase 2 acceptance required 1M+ companies — impossible without paid data contracts the agent can't sign | Synthetic seed dataset (9.0) + provider adapter interfaces; real-volume targets deferred to H5 |
| 4 | 🔴 | No list of human-only work (contracts, OAuth app reviews, legal, keys) — agent would stall or fake it | Section 0C + `BLOCKED-HUMAN` workflow |
| 5 | 🔴 | Section 6 still contained near-verbatim headlines from the reference; an agent would ship them | Rule 8 + copy keys + `[TODO-COPY]` build gate + copy-similarity check |
| 6 | 🔴 | Licensed data was planned to be resold via API/bulk without redistribution rights | Rule 10 + per-field provenance + automatic filtering |
| 7 | 🔴 | Data model: single-org users despite a workspace switcher; polymorphic tables without `entity_type`; missing schools, taxonomy, notifications, FX tables | Section 8 rewritten parts: memberships, entity_type, new tables |
| 8 | 🔴 | Tenancy relied on Postgres RLS, which Drizzle's privileged connection bypasses | Mandatory `OrgContext` repo layer + RLS as backup + cross-tenant tests |
| 9 | 🟠 | Recon plan would have committed the reference's scripts/assets into our repo | Rule 9: raw recon stays outside git |
| 10 | 🟠 | REA tool names presented as certain; no fallback | Verify with `rea --help`, Playwright fallback, throttling |
| 11 | 🟠 | Pixel-diff "≤2% deviation vs reference" contradicts using our own brand/copy | Structural parity via section IDs |
| 12 | 🟠 | Marketing mocks and app UI would be built twice | Mocks reuse real `packages/ui` components with fixtures |
| 13 | 🟠 | Revenue ML model had no labels on day one (cold start) | v0 heuristic in R1; ML in R2 at ≥ 2,000 disclosures; leakage-safe backtests |
| 14 | 🟠 | Interest-signal telemetry could expose which deals customers are evaluating | OFF by default; aggregate, delayed, never named-firm from telemetry; legal gate H8 |
| 15 | 🟠 | LinkedIn on-page enrichment conflicts with LinkedIn's terms | Feature flag OFF + legal gate H11 |
| 16 | 🟠 | Gmail/Calendar restricted scopes need Google verification + CASA (weeks, paid) — not mentioned | Flagged in 13.2 and H10 |
| 17 | 🟠 | Missing SSRF protection (webhooks, agent web_fetch, imports), CSV injection, upload limits | Section 14 additions + egress proxy |
| 18 | 🟠 | No cookie consent / bot protection on a marketing site that targets the EU | Consent banner + Turnstile |
| 19 | 🟠 | Credit costs undefined ("per page" of up to 5,000 rows?) | Price table in config |
| 20 | 🟠 | Pagination "page or cursor" undecided; no API versioning policy | Cursor pagination; versioning + Sunset headers |
| 21 | 🟠 | MCP free-call rules contradicted each other (free tools vs 100/day) | Clarified metering rules |
| 22 | 🟡 | Endpoint count fudged to hit "73" | Clean 74-row table; marketing count generated from OpenAPI |
| 23 | 🟡 | No onboarding, empty/loading/error states, responsive policy, credits UX | Section 7.1b |
| 24 | 🟡 | No local dev setup, env template, conventions, definition of done | 0A local dev + conventions; AGENTS.md DoD |
| 25 | 🟡 | "Parallel" phases impossible for a single agent; no release gates | Sequential order + gate procedure |
| 26 | 🟡 | No agent cost limits or eval harness | Section 10 guardrails + CI evals |
| 27 | 🟡 | ClickHouse/Temporal/Sanity etc. added ops burden in R1 | Deferred or dropped |
| 28 | 🟡 | Rank undefined | Deterministic rank v1 formula |
| 29 | 🟡 | Multi-currency rounds ignored | FX table, USD cents + original currency |
| 30 | 🟡 | 1,100-line plan loaded whole into a limited-context agent | Split into /docs/plan + AGENTS.md + current.md |
| 31 | 🟡 | Performance targets only for marketing pages | App targets added (grid fps, filter/profile P95) |
| 32 | 🟡 | Kick-off prompt had no stop points | Explicit STOPs after Phase 0 and Release 1 |

**Known remaining risks (not fixable in a document):** data coverage and quality depend on contracts (H5); interest and revenue signals' accuracy can only be proven with real data over months; legal review (H6, H8, H11) can remove or reshape features; LLM and data-licensing costs need a budget owner.

---

*End of master plan v2.*
