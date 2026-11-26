#!/usr/bin/env bash
# Logical backup of the Founders AI database (runbook: docs/runbooks/backup-dr.md).
#   DATABASE_URL=postgres://… scripts/backup/backup.sh [out-dir]
# Optional: BACKUP_GPG_RECIPIENT (encrypt), BACKUP_S3_URI=s3://bucket/prefix (upload with the aws CLI),
#           BACKUP_KEEP=14 (local files kept).
# Supabase also keeps daily backups + PITR; this dump is the provider-independent copy (restorable anywhere).
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is required}"
OUT="${1:-./backups}"
KEEP="${BACKUP_KEEP:-14}"
mkdir -p "$OUT"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$OUT/founders-$STAMP.dump"
START=$(date +%s)
# Custom format: compressed, restorable table by table, parallel restore.
pg_dump "$DATABASE_URL" --format=custom --compress=6 --no-owner --no-privileges --file="$FILE"
sha256sum "$FILE" | awk '{print $1}' > "$FILE.sha256"
pg_restore --list "$FILE" > /dev/null # the archive's table of contents must be readable
if [[ -n "${BACKUP_GPG_RECIPIENT:-}" ]]; then
  gpg --batch --yes --recipient "$BACKUP_GPG_RECIPIENT" --output "$FILE.gpg" --encrypt "$FILE"
  rm "$FILE"
  FILE="$FILE.gpg"
fi
if [[ -n "${BACKUP_S3_URI:-}" ]]; then
  aws s3 cp "$FILE" "$BACKUP_S3_URI/$(basename "$FILE")" --only-show-errors
  aws s3 cp "$OUT/founders-$STAMP.dump.sha256" "$BACKUP_S3_URI/founders-$STAMP.dump.sha256" --only-show-errors
fi
ls -1t "$OUT"/founders-*.dump* 2>/dev/null | grep -v sha256 | tail -n +$((KEEP + 1)) | while read -r old; do rm -f "$old" "$old.sha256"; done
echo "backup $FILE ($(du -h "$FILE" | cut -f1)) in $(( $(date +%s) - START ))s"
