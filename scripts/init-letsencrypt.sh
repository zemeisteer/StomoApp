#!/usr/bin/env bash
# ------------------------------------------------------------------------------
# One-time Let's Encrypt bootstrap for the production nginx gateway.
#
# nginx cannot start without a certificate, and Let's Encrypt cannot issue one
# until nginx answers the HTTP-01 challenge. This script breaks that loop:
#   1. creates a temporary self-signed certificate,
#   2. starts the stack so nginx serves /.well-known/acme-challenge/,
#   3. replaces the temporary certificate with a real one and reloads nginx.
# Renewal afterwards is automatic (certbot service + periodic nginx reload).
#
# Usage (from the repository root, on the production server):
#   ./scripts/init-letsencrypt.sh             # real certificate
#   STAGING=1 ./scripts/init-letsencrypt.sh   # Let's Encrypt staging (rate-limit safe test)
#   FORCE=1 ./scripts/init-letsencrypt.sh     # replace an existing certificate
#
# Reads DOMAIN, EXTRA_DOMAINS and LETSENCRYPT_EMAIL from $ENV_FILE
# (default: .env.production). Running it means you accept the Let's Encrypt
# Subscriber Agreement: https://letsencrypt.org/repository/
# ------------------------------------------------------------------------------
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env.production}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found. Copy .env.production.example to $ENV_FILE and fill it in." >&2
  exit 1
fi

# Read only the variables we need, without executing the env file.
read_env() {
  grep -E "^$1=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}
DOMAIN="$(read_env DOMAIN)"
EXTRA_DOMAINS="$(read_env EXTRA_DOMAINS)"
EMAIL="$(read_env LETSENCRYPT_EMAIL)"

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "ERROR: DOMAIN and LETSENCRYPT_EMAIL must be set in $ENV_FILE." >&2
  exit 1
fi

compose() {
  docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml "$@"
}

LIVE="/etc/letsencrypt/live/$DOMAIN"

if [[ "${FORCE:-0}" != "1" ]] && compose run --rm --no-deps --entrypoint "test -s $LIVE/fullchain.pem -a ! -e $LIVE/.dummy" certbot >/dev/null 2>&1; then
  echo "A real certificate for $DOMAIN already exists. Set FORCE=1 to replace it."
  exit 0
fi

echo "==> Creating temporary self-signed certificate for $DOMAIN"
compose run --rm --no-deps --entrypoint "sh -c '\
  mkdir -p $LIVE && \
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout $LIVE/privkey.pem -out $LIVE/fullchain.pem -subj /CN=localhost && \
  touch $LIVE/.dummy'" certbot

echo "==> Starting the stack (nginx needs backend and frontend to resolve)"
compose up -d --build nginx certbot

echo "==> Removing temporary certificate"
compose run --rm --no-deps --entrypoint "rm -rf $LIVE /etc/letsencrypt/archive/$DOMAIN /etc/letsencrypt/renewal/$DOMAIN.conf" certbot

DOMAIN_ARGS=(-d "$DOMAIN")
for d in $EXTRA_DOMAINS; do
  DOMAIN_ARGS+=(-d "$d")
done

STAGING_ARG=()
if [[ "${STAGING:-0}" == "1" ]]; then
  STAGING_ARG=(--staging)
  echo "==> Using Let's Encrypt STAGING (certificate will not be trusted by browsers)"
fi

echo "==> Requesting certificate for: $DOMAIN $EXTRA_DOMAINS"
if ! compose run --rm --no-deps --entrypoint certbot certbot certonly \
    --webroot -w /var/www/certbot \
    "${DOMAIN_ARGS[@]}" "${STAGING_ARG[@]}" \
    --email "$EMAIL" --agree-tos --no-eff-email \
    --rsa-key-size 4096 --non-interactive; then
  echo "ERROR: certificate request failed. Check that DNS A/AAAA records for every domain" >&2
  echo "point to this server and that port 80 is reachable from the internet." >&2
  echo "nginx keeps running on its loaded config; fix the cause and re-run this script." >&2
  exit 1
fi

echo "==> Reloading nginx"
compose exec nginx nginx -s reload

echo "Done: https://$DOMAIN"
