#!/bin/sh
# ------------------------------------------------------------------------------
# Scheduled backups for the production compose stack (runs in the `backup`
# service, postgres:16-alpine image).
#
# Every BACKUP_INTERVAL_HOURS (default 24), starting right after container start:
#   1. database: verified pg_dump custom archive (backend/scripts/backup-database.sh)
#   2. uploads:  tar.gz of the backend uploads volume (X-rays, OPG images, logos)
#   3. retention: files older than RETENTION_DAYS (default 14) are pruned
#
# Output goes to /var/backups/dentacare, bind-mounted from BACKUP_HOST_DIR on the
# host (default ./backups). Copy that directory offsite from the host, e.g. a
# daily `rclone sync ./backups remote:dentacare-backups` cron entry.
# ------------------------------------------------------------------------------
set -eu

BACKUP_DIR="${BACKUP_DIR:-/var/backups/dentacare}"
INTERVAL_HOURS="${BACKUP_INTERVAL_HOURS:-24}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
UPLOADS_DIR="${UPLOADS_DIR:-/uploads}"
export BACKUP_DIR RETENTION_DAYS

mkdir -p "$BACKUP_DIR"

run_once() {
  echo "[backup] $(date -u +%Y-%m-%dT%H:%M:%SZ) starting"
  # bash script; postgres alpine ships bash
  bash /opt/backup/backup-database.sh

  if [ -d "$UPLOADS_DIR" ]; then
    tag="$(date +%Y%m%d_%H%M%S)"
    out="$BACKUP_DIR/uploads_${tag}.tar.gz"
    tar -czf "$out" -C "$UPLOADS_DIR" .
    tar -tzf "$out" > /dev/null
    echo "[backup] uploads archived: $out ($(du -h "$out" | cut -f1))"
    find "$BACKUP_DIR" -type f -name 'uploads_*.tar.gz' -mtime +"$RETENTION_DAYS" -delete
  fi
  echo "[backup] done"
}

trap 'exit 0' TERM INT
while :; do
  if ! run_once; then
    echo "[backup] FAILED; will retry next interval" >&2
  fi
  sleep "$((INTERVAL_HOURS * 3600))" &
  wait $!
done
