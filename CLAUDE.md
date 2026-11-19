# CLAUDE.md

Guide for working in this repository (StomoApp / DentaCare dental clinic).

## Layout

| Folder | What | Stack |
|---|---|---|
| `backend/` | REST API, single source of truth | NestJS 10, Prisma 5, PostgreSQL 16 |
| `frontend/` | Public site + staff admin panel (`/admin`) + patient cabinet (`/kabinet`) | Next.js 14 App Router, Tailwind |
| `bot/` | Telegram bot, talks to the API with `SERVICE_TOKEN` | Python 3.12, aiogram 3 |
| `nginx/`, `docker-compose.prod.yml`, `scripts/` | Self-hosted production (VPS) | Docker, nginx, certbot |

Do not change the stack: no Next.js major upgrade, no replacing the JWT auth, no Nest 11 migration
without the owner asking.

## Commands

Backend (`cd backend`):

```bash
npm ci
npx prisma generate
npm run lint
npm run build
npx jest                                   # unit tests (src/**/*.spec.ts)
npx prisma migrate deploy && npx prisma db seed   # test DB, NODE_ENV=test or development
npx jest --config ./test/jest-e2e.json --runInBand   # e2e against dentacare_test
npx ts-node scripts/verify-all-priorities.ts        # 60 invariant checks (CI runs it)
```

The e2e suite refuses any database whose name does not end in `_test`. Environment used by CI is
in `.github/workflows/ci.yml` (`NODE_ENV=test`, `DATABASE_URL=.../dentacare_test`, JWT secrets,
`SERVICE_TOKEN`).

Frontend (`cd frontend`):

```bash
npm ci
npx tsc --noEmit
npm run lint
npm test          # node:test for src/lib/safeUrl.ts
npm run build
```

Bot: `ENVIRONMENT=test SERVICE_TOKEN=<32+ chars> pytest bot/test_bot_suite.py`

## Architecture notes

- Every route is guarded explicitly: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(...)`, or
  `@Public()` for intentionally public routes (`/public/*`, booking, leads, reviews, health, auth,
  portal login, payment callbacks). The acting user always comes from the JWT (`@CurrentUser()`).
- Doctors see only their own patients/visits; branch-bound staff only their branch
  (`common/branch-scope.ts`). A record outside the caller's scope answers **404**, not 403.
- Staff created by the owner (or after an owner password reset) have `mustChangePassword`; the
  JWT guard allows only routes marked `@AllowPendingPasswordChange()` until they change it.
- Login limits: `auth/login-rate-limiter.ts` (IP+email 5, IP 20, email 10 per 15 min). Public form
  limits: `common/form-limits.ts`. Both are in-memory; several instances need Redis.
- Money is whole so'm in 32-bit integer columns; every client amount is capped (`common/money.ts`).
  Invoice and payment rows are locked (`FOR UPDATE`, invoice first) in `billing/invoice-ledger.ts`.
- Secrets fail closed at start-up (`auth/jwt-secret.ts`). Dev shortcuts need
  `NODE_ENV=development` (`common/runtime-env.ts`); an unset NODE_ENV behaves like production.
- Links/images from database values go through `frontend/src/lib/safeUrl.ts`.

## Demo deploy (Vercel + Neon)

- Site: Vercel project `stomoapp`, Root Directory `frontend`, env `NEXT_PUBLIC_API_URL=https://stomoapp-api.vercel.app`.
- API: Vercel project `stomoapp-api`, Root Directory `backend` (NestJS). Build runs
  `backend/scripts/vercel-build.sh`: `prisma generate`, `prisma migrate deploy` against
  `DATABASE_URL_UNPOOLED` (direct Neon URL), optional demo seed (`DEMO_SEED=true`, needs
  `OWNER_PASSWORD`), then `nest build`.
- `DATABASE_URL` is the pooled Neon URL (`pgbouncer=true`). Remove `channel_binding=require` from
  Neon URLs: Prisma 5 does not support it. Migrations always use the direct (unpooled) URL.
- `UPLOAD_DIR=/tmp/uploads` (only `/tmp` is writable on Vercel; uploads do not persist there).
- Required API env: `JWT_SECRET`, `JWT_REFRESH_SECRET` (different, 32+ chars), `SERVICE_TOKEN`
  (32+ chars), `STORAGE_DRIVER`, `FRONTEND_URL`. The API refuses to start without them.
- Both Vercel projects deploy production from `main`; pushes to `dev` only make previews.
  Migrations reach the production database only when production is redeployed.

## Branch rule

Work on `dev` only. Never commit, merge or push to `main` unless the owner explicitly says so.

## Never do

- Never put demo passwords in production builds (CI greps `.next` for them) or show demo logins
  outside `NODE_ENV=development`.
- Never commit secrets or any `.env*` file other than `.env.example` / `.env.production.example`
  (those hold `CHANGE_ME` placeholders only). Never commit the private project blueprint.
- Never run `prisma migrate reset`, `prisma db push --force-reset` or `npm run db:reset` against a
  production database (Neon). Schema changes are normal migrations in `backend/prisma/migrations`.
- Never add `*` to CORS origins, image `remotePatterns`, or a server-side fetch of a user-supplied URL.
- Never render user or database HTML with `dangerouslySetInnerHTML` (exceptions: the brand CSS built
  from validated `#RRGGBB` colors, and JSON-LD from our own data).
- Never show invented contact details (phones, addresses, branches): only what the admin entered.
