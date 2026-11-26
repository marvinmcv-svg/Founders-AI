# Phase 10 — Billing, admin, compliance, hardening, launch (R3)

Started 2026-11-26 (owner: "go ahead with Phase 10"). Plan sections: 15 (Phase 10), 14 (billing, credits, seats, admin, security, compliance), 7.13 (Settings), 7.14 (internal admin), 0A (Stripe, Better Auth SSO/2FA), 0C (H13, H14), 16 (load, security), 18 (business & compliance checklist).

## Tasks
| # | Task | Main files | Status |
|---|---|---|---|
| 10.0 | Migration 0009: billing (`billing_accounts`, `stripe_events`, credit period/rollover), audit log v2 (actor type, IP, metadata, hash chain), DSAR workflow columns + `dsar_events` + `suppression_list`, SSO/SCIM/2FA tables, RLS on | `packages/db/drizzle/0009_phase10.sql` | planned |
| 10.1 | Billing: own Stripe REST client (form-encoded, no SDK), seat subscription + credit-pack checkout, customer portal, signed webhook handler (idempotent by event id), metered credit usage reported as Stripe meter events, seat enforcement on invites, monthly reset / rollover rules, "contact sales" fallback while Stripe is unset (H13) | `packages/core/src/billing/*`, `packages/core/src/repo/billing.ts`, `apps/app/src/app/api/stripe/webhook` | planned |
| 10.2 | Audit log v2: one `recordAudit()` for org and platform actions, tamper-evident hash chain, Settings → Audit log (filters, CSV export), wired into members, roles, keys, billing, SSO/SCIM, DSAR, flags | `packages/core/src/repo/audit.ts` | planned |
| 10.3 | DSAR workflow: public form → queue with 30-day due date → verify → access export (JSON) / delete / suppress; suppression list blocks re-ingestion (pipelines, seed, CRM pull, network import); Settings → Data & privacy (export my data, delete account) | `packages/core/src/repo/privacy.ts` | planned |
| 10.4 | Admin console complete (plan 7.14): customer accounts & credits, API key approval queue, DSAR queue, entity editor & merge tool, taxonomy manager, signal QA, classifier QA | `apps/app/src/app/(app)/admin/*`, `packages/core/src/repo/admin.ts` | planned |
| 10.5 | SSO/SCIM/MFA: Better Auth `@better-auth/sso` (OIDC + SAML) per workspace domain, `@better-auth/scim` org-scoped tokens, `twoFactor` (TOTP + backup codes), workspace "require SSO / require 2FA" policies | `apps/app/src/lib/auth.ts` | planned |
| 10.6 | Hardening: API load test (15 rps × 200 keys), security headers/CSP, backups + restore drill script, DR runbook, status page + health endpoint, on-call runbooks, dependency audit in CI | `scripts/load/*`, `scripts/backup/*`, `docs/runbooks/*` | planned |
| 10.7 | Launch checklist with Eng / Legal / Security / Marketing sign-off lines | `docs/launch-checklist.md` | planned |
