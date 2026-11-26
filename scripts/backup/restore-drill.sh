#!/usr/bin/env bash
# Restore drill (runbook: docs/runbooks/backup-dr.md). Restores a dump into a scratch database,
# verifies it against the source and reports the time taken (our measured RTO for the data tier).
#   SOURCE_URL=postgres://…/founders ADMIN_URL=postgres://…/postgres scripts/backup/restore-drill.sh path/to/founders-*.dump [report.md]
set -euo pipefail
DUMP="${1:?dump file}"
REPORT="${2:-}"
: "${SOURCE_URL:?SOURCE_URL (the database the dump came from) is required}"
: "${ADMIN_URL:?ADMIN_URL (a maintenance database on the target server) is required}"
SCRATCH="founders_drill_$(date -u +%Y%m%d%H%M%S)"
TARGET_URL="${ADMIN_URL%/*}/$SCRATCH"
[[ -f "$DUMP.sha256" ]] && { [[ "$(sha256sum "$DUMP" | awk '{print $1}')" == "$(cat "$DUMP.sha256")" ]] || { echo "checksum mismatch"; exit 1; }; }
START=$(date +%s)
psql "$ADMIN_URL" -qc "CREATE DATABASE $SCRATCH"
trap '[[ "${KEEP:-0}" == 1 ]] || psql "$ADMIN_URL" -qc "DROP DATABASE IF EXISTS $SCRATCH WITH (FORCE)"' EXIT
# Extensions first (pgvector, pg_trgm), then the archive.
psql "$TARGET_URL" -qc "CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pg_trgm;" >/dev/null
pg_restore --dbname="$TARGET_URL" --no-owner --no-privileges --jobs=4 --exit-on-error "$DUMP" 2> /tmp/restore-drill.err || { cat /tmp/restore-drill.err; exit 1; }
RESTORED=$(date +%s)
TABLES="companies people investors funding_rounds person_emails talent_signals news_signals organization member \"user\" api_keys credit_ledger audit_log dsar_requests suppression_list billing_accounts"
FAIL=0
ROWS=""
for t in $TABLES; do
  a=$(psql "$SOURCE_URL" -Atc "SELECT count(*) FROM $t")
  b=$(psql "$TARGET_URL" -Atc "SELECT count(*) FROM $t")
  mark="ok"; [[ "$a" == "$b" ]] || { mark="DIFF"; FAIL=1; }
  ROWS+="| $t | $a | $b | $mark |"$'\n'
done
# The restored audit chain must still verify (hashes recomputed from the restored rows).
CHAIN=$(psql "$TARGET_URL" -Atc "SELECT count(*) FROM audit_log WHERE seq IS NOT NULL AND (prev_hash IS DISTINCT FROM (SELECT hash FROM audit_log p WHERE p.org_id = audit_log.org_id AND p.seq = audit_log.seq - 1))")
[[ "$CHAIN" == "0" ]] || FAIL=1
# Triggers and RLS came back with the schema.
TRIG=$(psql "$TARGET_URL" -Atc "SELECT count(*) FROM pg_trigger WHERE tgname LIKE '%suppression_guard' OR tgname = 'audit_log_no_update'")
RLS=$(psql "$TARGET_URL" -Atc "SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND NOT rowsecurity")
[[ "$RLS" == "0" ]] || FAIL=1
DONE=$(date +%s)
OUT="## Restore drill — $(date -u +%Y-%m-%dT%H:%MZ)

Dump: \`$(basename "$DUMP")\` ($(du -h "$DUMP" | cut -f1)) → scratch database \`$SCRATCH\`.

| Step | Seconds |
|---|---|
| Restore (pg_restore, 4 jobs) | $((RESTORED - START)) |
| Verification | $((DONE - RESTORED)) |
| **Total (data-tier RTO)** | **$((DONE - START))** |

| Table | Source rows | Restored rows | |
|---|---|---|---|
$ROWS
Audit chain links broken after restore: **$CHAIN** · guard triggers restored: **$TRIG** (expect 8) · tables without RLS: **$RLS**.

**Result: $([[ $FAIL == 0 ]] && echo PASS || echo FAIL)**
"
echo "$OUT"
[[ -n "$REPORT" ]] && echo "$OUT" > "$REPORT"
exit $FAIL
