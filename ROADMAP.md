# StomoApp (DentaCare) Roadmap

_Last updated: 2026-11-06_

> The earlier version of this document described a planned Python FastAPI /
> SQLAlchemy / Celery service layer. That plan was dropped: the FastAPI backend
> was removed in commit `515cf05`, and everything now runs through a single
> NestJS API. This file reflects the architecture that actually exists.

## Architecture

| Layer | Technology | Notes |
|---|---|---|
| API | NestJS 10 + Prisma 5 | Single source of truth; all clients (web, admin, bot) go through it |
| Database | PostgreSQL 16 | Migrations in `backend/prisma/migrations` |
| Cache / locks | Redis 7 | Throttling, coordination |
| Web | Next.js 14 (App Router) | Public site + admin panel (OWNER, ADMIN, DOCTOR, RECEPTION) |
| Telegram bot | aiogram v3 (Python 3.12) | Long polling; calls `/api/bot/*` with `SERVICE_TOKEN` |
| Notifications | Transactional outbox (`notification_jobs`) | SMS (Eskiz/PlayMobile), email, Telegram; bot claims its own jobs once |
| Gateway | nginx 1.25 + Let's Encrypt (certbot) | HTTPS, HSTS, rate limits; see `scripts/init-letsencrypt.sh` |
| CI | GitHub Actions | Backend (lint, build, migrate, seed, e2e, priority checks), frontend, bot, gateway |

## Reminder & notification flow

| Message | Channel | Sent by | Dedup |
|---|---|---|---|
| Booking confirmation, 2h reminder | SMS / email | Backend outbox worker | `deduplication_key`, `scheduleRevision` |
| New booking alert | Staff Telegram group (no patient details) | Backend outbox | per appointment |
| 24h reminder | Patient Telegram chat | Bot (claims via `/bot/reminders/claim`) | per appointment + revision |
| Daily overview 08:00 | Staff Telegram group (no patient names) | Bot | per clinic day |
| Personal daily schedule 08:00 | Doctor's Telegram chat (`StaffUser.telegramUserId`) | Bot | per doctor per day |
| Patient cancellation alert | Staff Telegram group (no patient name) | Bot | n/a |

## Done

Phases 0–8 and the 2026-11-06 production pass are summarised in
[PROGRESS.md](PROGRESS.md).

## Next

### Blocking for launch
1. **First production deploy.** DNS for `DOMAIN`, `.env.production`,
   `STAGING=1 ./scripts/init-letsencrypt.sh`, then a real certificate; smoke test
   login over HTTPS, booking, SMS, bot and reminders against real providers.
2. **First release.** Merge `dev` into `main` once the deploy is verified.

### After launch
- Doctor self-service Telegram linking (today the OWNER enters the ID that the
  doctor gets from `/myid`).
- Bot replies in Russian for Russian-speaking patients (bot is Uzbek-only).
- Bot address/hours should come from clinic settings / branches via the API
  instead of bot env vars, so admin edits apply everywhere.
- Offsite, scheduled database backups (scripts exist in `backend/scripts`, but
  nothing runs them on a schedule yet).
- Monitoring and alerting (uptime, error rate, failed `notification_jobs`).
