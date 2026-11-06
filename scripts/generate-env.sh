#!/usr/bin/env bash
# ------------------------------------------------------------------------------
# Creates .env.production from .env.production.example with fresh random
# secrets (Postgres, Redis, JWT, refresh JWT, service token).
#
# Usage (repository root, on the server):
#   ./scripts/generate-env.sh dentacare.uz admin@dentacare.uz
#
# Afterwards edit .env.production and fill in the provider values that cannot
# be generated: SMS_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID,
# TELEGRAM_BOT_USERNAME (and EXTRA_DOMAINS if you don't use www).
# Then run ./scripts/preflight.sh.
# ------------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="${ENV_FILE:-.env.production}"
DOMAIN="${1:-}"
EMAIL="${2:-}"

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "Usage: $0 <domain> <letsencrypt-email>" >&2
  exit 1
fi
if [[ -e "$OUT" ]]; then
  echo "ERROR: $OUT already exists; refusing to overwrite secrets. Move it away first." >&2
  exit 1
fi
command -v openssl >/dev/null || { echo "ERROR: openssl is required" >&2; exit 1; }

secret() { openssl rand -hex 32; }   # URL-safe (passwords are embedded in DB/Redis URLs)

# Build with awk so secrets never appear in the process list as sed arguments
umask 077
awk -v domain="$DOMAIN" -v email="$EMAIL" \
    -v pg="$(secret)" -v redis="$(secret)" -v jwt="$(secret)" -v jwtr="$(secret)" -v svc="$(secret)" '
  /^POSTGRES_PASSWORD=/   { print "POSTGRES_PASSWORD=" pg; next }
  /^REDIS_PASSWORD=/      { print "REDIS_PASSWORD=" redis; next }
  /^JWT_SECRET=/          { print "JWT_SECRET=" jwt; next }
  /^JWT_REFRESH_SECRET=/  { print "JWT_REFRESH_SECRET=" jwtr; next }
  /^SERVICE_TOKEN=/       { print "SERVICE_TOKEN=" svc; next }
  /^DOMAIN=/              { print "DOMAIN=" domain; next }
  /^EXTRA_DOMAINS=/       { print "EXTRA_DOMAINS=www." domain; next }
  /^LETSENCRYPT_EMAIL=/   { print "LETSENCRYPT_EMAIL=" email; next }
  /^APP_URL=/             { print "APP_URL=https://" domain; next }
  /^FRONTEND_URL=/        { print "FRONTEND_URL=https://" domain; next }
  { print }
' .env.production.example > "$OUT"

echo "Created $OUT (mode 600) for $DOMAIN with fresh secrets."
echo "Now fill in: SMS_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_BOT_USERNAME"
echo "(remove EXTRA_DOMAINS if www.$DOMAIN has no DNS record), then run ./scripts/preflight.sh"
