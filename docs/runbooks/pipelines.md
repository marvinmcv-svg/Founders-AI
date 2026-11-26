# Pipelines

Daily cron `/api/cron/daily` (Vercel, 11:17 UTC) runs: talent → news → highlights → alerts → webhooks → digests → agent-schedules → interest → crm-sync → network → billing-usage → privacy-sla. Weekly (competitors) and monthly (traction, ML) run from the CLI / worker host (H2).

- See runs: `/admin?tab=pipelines` (status, counts, error).
- Re-run one job: `pnpm pipelines <job>` with production `DATABASE_URL`, or `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/<job>`.
- Jobs are idempotent per day (outbox, dedupe keys); re-running is safe.
- A job failing > 24 h makes the status page show "Data pipelines degraded".
