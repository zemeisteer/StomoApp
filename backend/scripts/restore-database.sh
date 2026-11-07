#!/usr/bin/env bash
# ==============================================================================
# DentaCare Dental Clinic: PostgreSQL Disaster Recovery Restore Utility
# ==============================================================================
set -euo pipefail

if [[ -z "${1:-}" ]]; then
  echo "Usage: $0 <path_to_backup_file.dump>"
  exit 1
fi

BACKUP_FILE="$1"

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "[FATAL] Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[FATAL] DATABASE_URL environment variable is not defined."
  exit 1
fi

echo "================================================================="
echo "   DENTACARE: DATABASE RESTORE UTILITY"
echo "================================================================="
echo "Target Backup: ${BACKUP_FILE}"
echo "Target DB    : ${DATABASE_URL}"

# Safety confirmation
read -r -p "WARNING: This will restore database tables from archive. Proceed? (y/N): " confirm
if [[ "${confirm}" != [yY] && "${confirm}" != [yY][eE][sS] ]]; then
  echo "Operation aborted by user."
  exit 0
fi

# Strip Prisma schema query parameter if present
CLEAN_DB_URL="${DATABASE_URL%%\?*}"

echo "Restoring database with pg_restore..."
pg_restore --clean --if-exists --no-owner --no-privileges -d "${CLEAN_DB_URL}" "${BACKUP_FILE}"

echo "[SUCCESS] Database restored cleanly from ${BACKUP_FILE}."
