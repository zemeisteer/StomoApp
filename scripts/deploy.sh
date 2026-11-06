#!/usr/bin/env bash
# ------------------------------------------------------------------------------
# Routine production update (after the first deploy with init-letsencrypt.sh):
#   1. preflight checks
#   2. fresh database backup before touching anything
#   3. build and restart; migrations run automatically when the backend starts
#   4. wait until every service is healthy, then print status
#
#   ./scripts/deploy.sh                 # deploy the current checkout
#   ./scripts/deploy.sh --pull          # git pull --ff-only first
# ------------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env.production}"
compose() { docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml "$@"; }

if [[ "${1:-}" == "--pull" ]]; then
  echo "==> git pull"
  git pull --ff-only
fi

echo "==> Preflight"
./scripts/preflight.sh

if compose ps --status running --services 2>/dev/null | grep -qx postgres; then
  echo "==> Pre-deploy database backup"
  compose exec -T backup bash /opt/backup/backup-database.sh
fi

echo "==> Build & restart (migrations apply on backend start)"
compose up -d --build --wait --wait-timeout 600

echo "==> Status"
compose ps
echo
echo "Deployed $(git rev-parse --short HEAD) at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
