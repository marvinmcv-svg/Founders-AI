# Pipelines

Daily cron `/api/cron/daily` (Vercel, 11:17 UTC) runs: talent → news → highlights → alerts → webhooks → digests → agent-schedules → interest → crm-sync → network → billing-usage → privacy-sla. Weekly (competitors) and monthly (traction, ML) run from the CLI / worker host (H2).

- See runs: `/admin?tab=pipelines` (status, counts, error).
- Re-run one job: `pnpm pipelines <job>` with production `DATABASE_URL`, or `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/<job>`.
- Jobs are idempotent per day (outbox, dedupe keys); re-running is safe.
- A job failing > 24 h makes the status page show "Data pipelines degraded".

## Worker host (BullMQ, D-076)

`apps/workers` runs the same jobs on BullMQ repeatable schedules (UTC), so nothing depends on the
serverless cron once a worker host exists (H2: Railway or Fly + Redis 7):

| Schedule | Queue | When | Jobs |
|---|---|---|---|
| minutely | realtime | every minute | search-index (OpenSearch lag < 5 min) |
| daily | batch | 11:17 | the daily list above + sec-formd |
| weekly | batch | Mon 03:37 | resolution → competitors |
| monthly | batch | 1st 04:07 | traction |

- Deploy: `docker build -f apps/workers/Dockerfile -t founders-workers .`; env `DATABASE_URL`, `REDIS_URL` (`rediss://` for TLS), plus whatever the jobs need (`OPENSEARCH_URL`, `SEC_USER_AGENT`, `ANTHROPIC_API_KEY`, …). Probe: `GET /health` on `PORT` (8080).
- Schedules are re-synced on every start (renamed/removed ones are deleted). List them: `pnpm --filter @founders/workers enqueue schedules`.
- Run something now: `pnpm --filter @founders/workers enqueue <job|daily|weekly|monthly> [--opt=v]` (with production `REDIS_URL`).
- Each queue runs one job at a time, so a schedule never overlaps itself; a slow daily run never delays the minutely indexer.
- Every run is in `/admin?tab=pipelines` with trigger `schedule:<id>` or `manual`. A failed job fails the BullMQ job (after the rest of the sequence ran); BullMQ keeps the last 500 failures.
- SIGTERM lets running jobs finish before exit (set the platform's stop grace period to ≥ 10 min for the daily batch).

