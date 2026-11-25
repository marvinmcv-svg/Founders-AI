## 14. BILLING, CREDITS, SEATS, ADMIN, SECURITY & COMPLIANCE

### 14.1 Commercial model (mirrors target; prices are "contact sales")
- **Platform seat** (annual, per user) — required for API access.
- **API** — credit packs metered per billing period (Stripe metered billing on `credit_ledger`).
- **Bulk data** — custom contract per project.
- **MCP** — 100 free calls/day/user, overage from API credits if admin enables.
- Trials: 200 API credits after key approval. Demo-led sales for platform.

### 14.2 Credit engine (`packages/core/credits`)
Single `charge(orgId, actor, surface, operation, units, matched)` used by app exports, email reveals, API, MCP and agent. Atomic decrement in Postgres (`UPDATE … SET balance = balance - $n WHERE balance >= $n RETURNING`) → ledger row → `usage_events` row. Misses free. Pre-flight check returns 402 with clear message when empty. Monthly reset/rollover rules configurable.

### 14.3 Roles & permissions
Org roles Admin / Member / Viewer; object visibility Private / Team; API key scopes (read:data, write:lists, write:searches, read:network, admin); row-level security on every org-scoped table (Postgres RLS by `org_id`).

### 14.4 Security
SOC 2-ready controls from day 1: SSO/SAML + SCIM (enterprise), MFA, encrypted secrets (KMS) for CRM/OAuth tokens, audit log, least-privilege IAM, dependency scanning, secret scanning, WAF + bot protection on public endpoints, Turnstile + per-IP rate limits on marketing forms, CSP headers, signed webhooks, penetration test before launch.
- **SSRF:** one egress proxy for every server-side fetch of a user-supplied URL (webhooks, agent `web_fetch`, CSV-imported domains, crawler).
- **CSV injection:** exported cells starting with `= + - @ \t \r` are prefixed with `'`.
- **Upload safety:** CSV imports ≤ 20 MB, parsed in a worker, row limit 100k.
- **Secrets:** per-environment, never in client bundles; `NEXT_PUBLIC_` audit in CI.
- **Cross-tenant tests** (Section 8 tenancy note) block merges.

### 14.5 Privacy & compliance (people data!)
- Lawful basis assessment (legitimate interest) + **LIA** documented; GDPR Art. 14 notices; CCPA/CPRA "do not sell/share" handling.
- Public **Privacy Rights** page + DSAR form → `dsar_requests` → workflow to export/delete/suppress a person (suppression list blocks re-ingestion).
- Data retention policies; source provenance per field; no special-category data; email reveal gated & logged.
- Interest-signal telemetry: disclosed in ToS, aggregated, k-anonymity, opt-out at org level.
- DPA for customers; subprocessors list page.
- **Cookie consent** banner on all marketing pages (EU/UK opt-in; US opt-out link "Your privacy choices"); analytics and booking-widget cookies load only after consent.
