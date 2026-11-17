#!/bin/sh
# Build step for the free demo API on Vercel (see DEPLOY-FREE.md).
# Migrations run here because Vercel's build machines can reach the database;
# serverless functions have no start-up hook like the Docker CMD.
set -e

npx prisma generate

if [ -n "$DATABASE_URL_UNPOOLED" ]; then
  # Migrations need a direct (non-pooled) connection.
  DATABASE_URL="$DATABASE_URL_UNPOOLED" npx prisma migrate deploy

  if [ "$DEMO_SEED" = "true" ]; then
    # Demo content (clinic, branches, services, doctors, articles). Idempotent upserts.
    # The OWNER account comes from OWNER_EMAIL / OWNER_PASSWORD.
    DATABASE_URL="$DATABASE_URL_UNPOOLED" NODE_ENV=development node -r ts-node/register prisma/seed.ts
    # The seed also creates doctor/reception logins whose passwords are in the repo: switch them off.
    DATABASE_URL="$DATABASE_URL_UNPOOLED" node scripts/disable-demo-staff.js
  fi
fi

npm run build
