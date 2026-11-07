#!/usr/bin/env bash
# ------------------------------------------------------------------------------
# Pre-deploy checks for the production server. Read-only: changes nothing.
#
#   ./scripts/preflight.sh            # uses .env.production
#   ENV_FILE=other.env ./scripts/preflight.sh
#   PREFLIGHT_SKIP_DNS=1 ./scripts/preflight.sh   # e.g. in CI
#
# Exit code 0 = no blocking problems (warnings may still be printed).
# ------------------------------------------------------------------------------
set -uo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="${ENV_FILE:-.env.production}"
FAIL=0
ok()   { echo "  [ OK ] $*"; }
warn() { echo "  [WARN] $*"; }
bad()  { echo "  [FAIL] $*"; FAIL=1; }

val() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | tail -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"; }

echo "== Environment file ($ENV_FILE)"
if [[ ! -f "$ENV_FILE" ]]; then
  bad "$ENV_FILE not found (create it with ./scripts/generate-env.sh <domain> <email>)"
  exit 1
fi
perm=$(stat -c '%a' "$ENV_FILE" 2>/dev/null || echo "?")
[[ "$perm" == "600" || "$perm" == "400" ]] && ok "permissions $perm" || warn "permissions $perm (recommend: chmod 600 $ENV_FILE)"

for key in POSTGRES_PASSWORD REDIS_PASSWORD JWT_SECRET JWT_REFRESH_SECRET SERVICE_TOKEN; do
  v="$(val "$key")"
  if [[ -z "$v" ]]; then bad "$key is empty"
  elif [[ "$v" == generate_* || "$v" == *change* || "$v" == *ChangeMe* ]]; then bad "$key still has the template placeholder"
  elif (( ${#v} < 32 )); then bad "$key is shorter than 32 characters"
  elif [[ "$key" == *PASSWORD && ! "$v" =~ ^[A-Za-z0-9_-]+$ ]]; then bad "$key has URL-unsafe characters (use: openssl rand -hex 32)"
  else ok "$key set"; fi
done
[[ "$(val JWT_SECRET)" != "$(val JWT_REFRESH_SECRET)" ]] && ok "JWT secrets differ" || bad "JWT_SECRET and JWT_REFRESH_SECRET must differ"

v="$(val TELEGRAM_BOT_TOKEN)"
[[ -z "$v" || "$v" == your_* ]] && bad "TELEGRAM_BOT_TOKEN not set (required by the bot service)" || ok "TELEGRAM_BOT_TOKEN set"
chat="$(val TELEGRAM_CHAT_ID)"
[[ -z "$chat" || "$chat" == "-1001234567890" ]] && warn "TELEGRAM_CHAT_ID looks like the template value (staff group alerts)" || ok "TELEGRAM_CHAT_ID set"
[[ -n "$(val TELEGRAM_BOT_USERNAME)" ]] && ok "TELEGRAM_BOT_USERNAME set" || warn "TELEGRAM_BOT_USERNAME empty: staff get a /start command instead of a one-click link"

# SMS: Eskiz login, or a generic gateway URL + key. Without SMS, booking/reminder SMS are only
# logged and the patient cabinet (/kabinet) works only for patients linked to the Telegram bot.
if [[ -n "$(val ESKIZ_EMAIL)" && -n "$(val ESKIZ_PASSWORD)" && "$(val SMS_PROVIDER)" != generic ]]; then
  ok "SMS via Eskiz (sender: $(val ESKIZ_FROM))"
elif [[ -n "$(val ESKIZ_EMAIL)$(val ESKIZ_PASSWORD)" && "$(val SMS_PROVIDER)" != generic ]]; then
  bad "Eskiz partly configured: set both ESKIZ_EMAIL and ESKIZ_PASSWORD"
elif [[ -n "$(val SMS_API_URL)" && -n "$(val SMS_API_KEY)" && "$(val SMS_API_KEY)" != your_* ]]; then
  if [[ "$(val SMS_API_URL)" == *eskiz* ]]; then
    bad "SMS_API_URL points to Eskiz but Eskiz needs ESKIZ_EMAIL / ESKIZ_PASSWORD instead of SMS_API_KEY"
  else ok "SMS via generic gateway"; fi
else
  warn "SMS not configured: messages are only logged; patient cabinet login works only for Telegram-linked patients"
fi

echo "== Online payments (optional)"
check_provider() { # name key...
  local name="$1"; shift
  local set=0 total=$#
  for k in "$@"; do [[ -n "$(val "$k")" ]] && set=$((set + 1)); done
  if (( set == 0 )); then warn "$name disabled (no keys)"
  elif (( set < total )); then bad "$name partly configured: set all of $* or none"
  else ok "$name configured"; fi
}
check_provider Payme PAYME_MERCHANT_ID PAYME_KEY
check_provider Click CLICK_SERVICE_ID CLICK_MERCHANT_ID CLICK_SECRET_KEY
if [[ -n "$(val PAYME_KEY)" ]]; then
  case "$(val PAYME_TEST_MODE)" in
    true|1|yes) warn "PAYME_TEST_MODE=true: payments go to the Payme sandbox, switch to false for real money" ;;
    *) ok "Payme in production mode" ;;
  esac
fi

echo "== Domain & DNS"
DOMAIN="$(val DOMAIN)"; EXTRA="$(val EXTRA_DOMAINS)"
if [[ -z "$DOMAIN" ]]; then
  bad "DOMAIN is empty"
elif [[ "$DOMAIN" == "dentacare.uz" ]]; then
  warn "DOMAIN=dentacare.uz is the template value; make sure it is really yours"
else
  ok "DOMAIN=$DOMAIN"
fi
[[ -n "$(val LETSENCRYPT_EMAIL)" ]] && ok "LETSENCRYPT_EMAIL set" || bad "LETSENCRYPT_EMAIL is empty"

if [[ -n "${PREFLIGHT_SKIP_DNS:-}" ]]; then
  warn "DNS checks skipped (PREFLIGHT_SKIP_DNS set)"
else
PUBLIC_IP="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || true)"
[[ -n "$PUBLIC_IP" ]] && ok "this server's public IP: $PUBLIC_IP" || warn "could not detect public IP (no outbound HTTPS?)"
for d in $DOMAIN $EXTRA; do
  ips="$(getent ahostsv4 "$d" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ')"
  if [[ -z "$ips" ]]; then bad "$d has no A record"
  elif [[ -n "$PUBLIC_IP" && " $ips " != *" $PUBLIC_IP "* ]]; then bad "$d resolves to $ips, not this server ($PUBLIC_IP)"
  else ok "$d -> $ips"; fi
done
fi

echo "== Host"
if command -v docker >/dev/null && docker info >/dev/null 2>&1; then ok "docker running ($(docker --version | cut -d, -f1))"; else bad "docker not installed or not running"; fi
if docker compose version >/dev/null 2>&1; then ok "docker compose $(docker compose version --short 2>/dev/null)"; else bad "docker compose plugin missing"; fi
for port in 80 443; do
  if ss -ltnH "sport = :$port" 2>/dev/null | grep -q .; then
    owner="$(docker ps --filter publish=$port --format '{{.Names}}' 2>/dev/null | head -1)"
    [[ "$owner" == dentacare-prod-nginx ]] && ok "port $port used by our nginx" || bad "port $port already in use (${owner:-another process})"
  else ok "port $port free"; fi
done
free_gb=$(df -Pk . | awk 'NR==2 {printf "%d", $4/1024/1024}')
(( free_gb >= 10 )) && ok "disk free: ${free_gb} GB" || warn "disk free: ${free_gb} GB (images + DB + backups; 10 GB+ recommended)"
mem_mb=$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo 0)
(( mem_mb >= 1900 )) && ok "memory: ${mem_mb} MB" || warn "memory: ${mem_mb} MB (2 GB+ recommended; the frontend build needs it)"

echo "== Compose file"
if docker compose --env-file "$ENV_FILE" -f docker-compose.prod.yml config --quiet 2>/tmp/preflight-compose.err; then
  ok "docker-compose.prod.yml renders with $ENV_FILE"
else
  bad "compose config failed: $(head -3 /tmp/preflight-compose.err)"
fi

echo
if (( FAIL )); then echo "Preflight FAILED: fix the [FAIL] items above."; exit 1; fi
echo "Preflight passed."
