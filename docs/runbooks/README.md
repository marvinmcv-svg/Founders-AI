# On-call runbooks

Founders AI production: Vercel (`founders-ai` www, `founders-ai-app` app + API at `/api/v1` + MCP at `/mcp`), Supabase Postgres (`founders-ai`, sa-east-1, app role `founders_app`), Stripe (billing), Resend (e-mail, H3).

## Severity
| Sev | Meaning | Examples | Response |
|---|---|---|---|
| SEV1 | Customers can't use the product or data is at risk | app/API down, data leak, wrong-org data shown, audit chain broken | Page on-call now; incident on the status page within 15 min; updates every 30 min |
| SEV2 | A major feature is broken or badly degraded | API p95 > 2 s, pipelines failing > 24 h, Stripe webhooks failing, SSO sign-in failing for a customer | On-call within 1 h; status page if customer-visible |
| SEV3 | Minor or single-customer issue with a workaround | one CRM sync failing, a slow page | Next business day |

## Where to look
- **Health**: `GET /api/health` (200 = no component in outage) and the public page `/status`. Point the uptime monitor at `/api/health` every minute.
- **Logs**: Vercel → `founders-ai-app` → Runtime logs (search `[stripe]`, `[stats]`, `pipeline`).
- **Admin console** `/admin` (PLATFORM_ADMIN_EMAILS): Pipelines tab (job runs), Accounts, Data requests, Status (post incidents).
- **Audit log**: per workspace in Settings → Audit log (chain status shown); platform actions under org `platform`.

## Runbooks
| Situation | Runbook |
|---|---|
| Any incident: roles, comms, postmortem | [incident-response.md](incident-response.md) |
| Database loss, corruption, region outage, restore | [backup-dr.md](backup-dr.md) |
| Payments, webhooks, credits, overage metering | [billing-stripe.md](billing-stripe.md) |
| Data-subject requests, suppression | [privacy-dsar.md](privacy-dsar.md) |
| SSO / SCIM / 2FA problems, customer locked out | [identity-sso-scim.md](identity-sso-scim.md) |
| API slow, 429s, capacity | [api-performance.md](api-performance.md) |
| Pipeline job failed or data stale | [pipelines.md](pipelines.md) |
| Leaked key or secret, suspicious access | [security-incident.md](security-incident.md) |
