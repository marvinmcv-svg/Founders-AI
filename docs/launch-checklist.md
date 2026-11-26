# Launch checklist

Plan 15 Phase 10: "Launch checklist signed off by Eng, Legal, Security, Marketing." Status as of 2026-11-26. ✅ done with evidence · ⏳ open, engineering can do it · ⛔ blocked on a human-only item (plan 0C, `docs/progress/blocked.md`).

## Engineering
| Item | Status | Evidence |
|---|---|---|
| `pnpm verify` green (lint, typecheck, unit + DB tests, copy checks, build) | ✅ | `docs/progress/phase-10.md` |
| E2E suites green (www, app, MCP, extension, Phase 10) | ✅ | `e2e/tests/*` |
| Cross-tenant tests on repo functions, API, MCP, SCIM | ✅ | `packages/core/test/tenancy.test.ts`, `scim-security.test.ts`, API contract tests |
| Load test: API 15 rps × 200 keys | ✅ | `docs/progress/load/api-15rps-200keys.md` (p95 12 ms); headroom 600 rps on one process |
| Rate limiter shared across instances (Redis) | ⛔ H2 | In-memory per instance today (`docs/runbooks/api-performance.md`) |
| Backups + monthly restore drill | ✅ / ⛔ | Drill script + local PASS (`docs/progress/dr-drill-2026-11-26.md`); daily off-site dump needs worker host + bucket (H2, H12); Supabase PITR is an owner decision |
| Health endpoint + status page + incident posting | ✅ | `/api/health`, `/status`, `/admin?tab=status` |
| On-call runbooks | ✅ | `docs/runbooks/` |
| Uptime monitor on `/api/health`, paging | ⛔ H3 | Needs Sentry/uptime/pager accounts |
| Error tracking (Sentry) | ⛔ H3 | `SENTRY_DSN` |
| Custom domain + DNS (`app.`, `api.`, `mcp.`, `status.`) | ⛔ H2 | Vercel default domains today |
| Cloud: migrations 0007–0009 applied as `founders_app` | ⏳ | `docs/progress/current.md` |

## Security
| Item | Status | Evidence |
|---|---|---|
| RBAC + RLS on every table; app role owns tables | ✅ | Migrations 0001–0009, D-019 |
| SSO (OIDC/SAML) + SCIM + MFA; Require SSO / 2FA policies | ✅ | Phase 10 part 3, D-069, D-070 |
| Audit log, append-only, hash-chained, exportable | ✅ | D-067, Settings → Audit log |
| Secrets encrypted at rest (CRM, bulk, webhooks); keys hashed | ✅ | `core/crypto.ts`, D-052 |
| Egress proxy for user-supplied URLs (incl. IdP discovery) | ✅ | `core/egress.ts`, D-024, D-069 |
| CSP, HSTS, frame, referrer, permissions headers | ✅ | `packages/config/src/security-headers.ts` |
| Dependency audit, secret scan, NEXT_PUBLIC_ audit | ✅ | `pnpm security:audit`, `docs/security/dependency-audit.md` |
| WAF / bot protection on public endpoints; Turnstile on forms | ⛔ H3 | Vercel Firewall rules + Turnstile keys |
| Penetration test before launch | ⛔ H14 | Vendor to be chosen |
| SOC 2 readiness (controls owner, evidence collection) | ⛔ H14 | Optional at launch |

## Legal & privacy
| Item | Status | Evidence |
|---|---|---|
| Privacy policy, terms, DPA, LIA reviewed by counsel | ⛔ H6 | Draft pages carry a "draft" notice |
| Subprocessors list page | ⏳ | Needs the final vendor list (Vercel, Supabase, Stripe, Resend, Anthropic…) — after H6 |
| DSAR workflow (verify → access/delete/opt-out) with 30-day SLA | ✅ | Phase 10 part 2, `docs/runbooks/privacy-dsar.md` |
| Suppression list blocks re-ingestion | ✅ | D-068, `packages/core/test/privacy.test.ts` |
| Cookie consent (opt-in EU/UK, opt-out US) | ✅ | Phase 9 |
| Data provider contracts with redistribution rights | ⛔ H5 | Synthetic data only |
| Interest-signal sources approved | ⛔ H8 | Flag off |
| Comparison pages legally reviewed | ⛔ H17 | None published |

## Commercial & marketing
| Item | Status | Evidence |
|---|---|---|
| Stripe account, seat + credit-pack prices, meter, webhook | ⛔ H13 | Simulator + contact-sales modes work (`docs/runbooks/billing-stripe.md`) |
| Copy reviewed (EN/ES) | ⛔ H4 | First drafts in `content/copy` |
| Brand, legal entity, domain final | ⛔ H1 | Placeholders |
| Transactional e-mail (DSAR verification, digests) | ⛔ H3 | Resend key |

## Sign-off
Each owner signs when every item in their area is ✅ or explicitly accepted as a launch risk.

| Area | Name | Date | Decision / accepted risks |
|---|---|---|---|
| Engineering | | | |
| Security | | | |
| Legal | | | |
| Marketing | | | |
