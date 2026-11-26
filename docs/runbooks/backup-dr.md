# Backups & disaster recovery

**Targets**: RPO ≤ 24 h from our own dumps (≤ minutes with Supabase PITR once enabled on the plan), RTO ≤ 4 h for the data tier, ≤ 1 h for the app tier (stateless, redeploy on Vercel).

## Backups
- **Supabase**: daily automatic backups (project settings → Database → Backups). Turn on **PITR** for production (paid add-on; owner decision, H2).
- **Our own logical dump** (provider-independent): `DATABASE_URL=… pnpm backup <dir>` → `founders-<UTC>.dump` (pg_dump custom format) + `.sha256`; set `BACKUP_GPG_RECIPIENT` to encrypt and `BACKUP_S3_URI` to ship off-site (H12 bucket). Run daily from the worker host (H2); keep 14 days locally, 90 days in the bucket.
- Use the **session pooler (5432) or direct connection** for pg_dump, not the transaction pooler (6543).

## Restore drill (monthly, and after every schema change of note)
```bash
SOURCE_URL=<prod read replica or the DB the dump came from> ADMIN_URL=<target server>/postgres pnpm backup:drill <dump> docs/progress/dr-drill-<date>.md
```
It restores into a scratch database, compares row counts of the key tables, checks the audit chain still links, that the suppression/audit triggers and RLS came back, and records the timings. Last drill: [`docs/progress/dr-drill-2026-11-26.md`](../progress/dr-drill-2026-11-26.md) (local seed: PASS, 2 s).

## Restore for real
1. Declare SEV1; post on the status page; stop writers (remove `CRON_SECRET`, put the app in maintenance by promoting a maintenance deployment if needed).
2. Pick the restore point: Supabase PITR (preferred) or the latest verified dump.
3. Restore into a **new** database/project; run the drill's verification queries; point `DATABASE_URL` (Vercel env, both projects) at it; redeploy.
4. Re-run migrations to make sure the schema is current (`pnpm db:migrate` with `SET ROLE founders_app`, see current.md); replay Stripe webhooks for the gap (Stripe dashboard → Webhooks → resend events since the restore point; they are idempotent by event id).
5. Re-run the daily pipelines once (`/api/cron/daily`).

## Region outage (sa-east-1)
Supabase and Vercel functions are in São Paulo (gru1). If the region is down for > 1 h: restore the latest dump into a Supabase project in another region (us-east-1), move the Vercel function region, update `DATABASE_URL`. Expect data loss back to the last dump unless PITR/read replica exists.
