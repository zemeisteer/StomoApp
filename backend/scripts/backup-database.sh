#!/usr/bin/env bash
# ==============================================================================
# DentaCare Dental Clinic: Automated PostgreSQL Production Backup
# ==============================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/dentacare}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
DATE_TAG="$(date +'%Y%m%d_%H%M%S')"
BACKUP_FILE="${BACKUP_DIR}/dentacare_${DATE_TAG}.dump"

echo "================================================================="
echo "   DENTACARE: PRODUCTION DATABASE BACKUP UTILITY"
echo "================================================================="
echo "Timestamp    : ${DATE_TAG}"
echo "Target Dir   : ${BACKUP_DIR}"
echo "Retention    : ${RETENTION_DAYS} days"

mkdir -p "${BACKUP_DIR}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[FATAL] DATABASE_URL environment variable is not defined."
  exit 1
fi

# Strip Prisma schema query parameter if present (e.g. ?schema=public) as native pg_dump rejects it
CLEAN_DB_URL="${DATABASE_URL%%\?*}"

echo "Creating compressed binary dump with pg_dump..."
pg_dump --format=custom --compress=9 --no-owner --no-privileges "${CLEAN_DB_URL}" > "${BACKUP_FILE}"

# Validate dump file exists and is non-empty
if [[ ! -s "${BACKUP_FILE}" ]]; then
  echo "[FATAL] Backup file is empty or was not created: ${BACKUP_FILE}"
  rm -f "${BACKUP_FILE}"
  exit 1
fi

# Verify dump archive structure with pg_restore list
echo "Verifying archive integrity with pg_restore..."
pg_restore --list "${BACKUP_FILE}" > /dev/null

BACKUP_SIZE="$(du -h "${BACKUP_FILE}" | cut -f1)"
echo "[SUCCESS] Verified backup created: ${BACKUP_FILE} (${BACKUP_SIZE})"

# Cleanup backups older than retention window
echo "Applying retention policy (${RETENTION_DAYS} days)..."
find "${BACKUP_DIR}" -type f -name "dentacare_*.dump" -mtime +"${RETENTION_DAYS}" -delete

echo "Backup routine finished successfully."
