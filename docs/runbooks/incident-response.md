# Incident response

1. **Acknowledge** the page / report. Open an incident channel; name an **incident lead** (decides) and a **comms lead** (status page, customers).
2. **Assess severity** (README table). When in doubt, pick the higher one.
3. **Post on the status page** (`/admin?tab=status` → Post an incident: title, impact, components, first update). Customer-visible SEV1/2: within 15 minutes. Update at least every 30 minutes (SEV1) / hourly (SEV2), even if nothing changed.
4. **Stabilise first**: roll back the last deploy (Vercel → Deployments → previous → Promote), turn off a feature flag (`/admin?tab=flags`), revoke a key, pause a cron (remove `CRON_SECRET` temporarily). Fix forward later.
5. **Preserve evidence**: don't delete logs or rows; the audit log is append-only. Note times in UTC.
6. **Resolve**: confirm `/api/health` is green and the symptom is gone; post "resolved" with a one-line cause.
7. **Postmortem** within 5 business days for SEV1/2 (blameless): timeline, impact (who, how long, data affected), root cause, what went well, action items with owners. Store in `docs/postmortems/YYYY-MM-DD-title.md`.

**Data incidents** (wrong-workspace data, personal data exposed): SEV1, also inform Legal the same day; GDPR breach notification to the supervisory authority within 72 h if personal data of EU residents is at risk (H6 — confirm process with counsel).
