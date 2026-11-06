# StomoApp (DentaCare) Production Readiness & Verification Report

## Overall Status: CI green; not yet deployed (Branch: `dev`)

> **Correction (2026-11-06):** earlier revisions of this report said "100% green".
> In fact every GitHub Actions run had failed until commit `0fab9c6`: the backend
> job crashed at `prisma validate` (no `DATABASE_URL`) and the test DB was never
> seeded, so backend lint, build and e2e only ever passed locally. CI has been
> green on every push since `1c65518`. Open launch blockers are listed in
> [ROADMAP.md](ROADMAP.md#next).

- **Repository**: `https://github.com/zemeisteer/StomoApp`
- **Branch**: `dev`
- **Single Source of Truth**: **NestJS 10 + Prisma ORM 5 + PostgreSQL 16** (`localhost:5432`, dev: `dentacare`, test: `dentacare_test`)
- **Frontend**: Next.js 14 (App Router) + TailwindCSS + Three.js
- **Verification Suites (All passing in current session)**:
  - Backend Jest E2E Suite: **85 / 85 passed (100%)** (local and CI)
  - Priority Verification (`verify-all-priorities.ts`): **60 / 60 passed (100%)**
  - Backend Build (`nest build`): **0 errors**
  - Backend Lint (`npm run lint`): **0 errors**
  - Frontend Typecheck (`tsc --noEmit`): **0 errors**
  - Frontend Lint (`npm run lint`): **0 warnings, 0 errors**
  - Frontend Build (`next build`): **0 errors (all 29/29 routes generated, 0 warnings)**
  - Telegram Bot Suite (`pytest test_bot_suite.py`): **100% passed (10/10 flows), 0 warnings**

---

## 1. Phase-by-Phase Execution Summary

### Phase 0: Foundation Green
- **Frontend Unescaped Entities Fixed**: Corrected 12 unescaped apostrophes (`so'm` → `so&apos;m`) in `frontend/src/app/admin/page.tsx` that previously broke `next build`.
- **Backend Test Flakiness (Regression 21) Resolved**: Root-caused deterministic 409 collision in `test/app.e2e-spec.ts` caused by static `now+140h` slot calculation conflicting with active working schedules. Rewrote slot resolution to dynamically query `getNextWorkingSlot(35, 10, 0)` with clean `finally` teardown.
- **Background Cron Isolation**: Intercepted `@Cron` tasks in `test/app.e2e-spec.ts` via `SchedulerRegistry.prototype.addCronJob` to prevent background pollers from interfering with test runners.
- **Python Test Infrastructure**: Configured `pytest` and `pytest-asyncio` for local automated validation of Python components.

### Phase 1: Security & Correctness Hardening
- **Client Role Switcher Removed**: Authenticated user role is strictly derived from verified JWT credentials (`req.user.role`).
- **Fail-Closed Role Guard**: In `admin/page.tsx`, removed legacy `user?.role || 'ADMIN'` fallback. Added strict fail-closed guard `if (!user || !user.role)` denying unauthenticated or malformed sessions.
- **Honest Notification Copy**: In `admin/calendar/page.tsx`, replaced misleading "SMS yuborildi" toast with accurate messaging: "Bildirishnoma navbatga qo'yildi (Outbox)" reflecting actual outbox queue state.
- **Public Booking Isolation**: Removed all `clinicStore.checkSlotCollision` and `clinicStore.bookAppointment` calls from `frontend/src/app/booking/page.tsx`. Server API is now 100% authoritative for slot calculation and booking, and no patient PII is stored in client browser `localStorage`.
- **Fail-Closed API Fallback**: In `frontend/src/lib/clinicState.ts`, replaced silent error swallowing with an explicit fail-closed error.
- **Configuration Hardening**: Added fail-closed guards in `bot/config.py` to prevent silent SQLite fallback and default secrets in production environments.

### Phase 2: Clinical & Financial Data Migration to PostgreSQL
- **Prisma Schema & Forward Migration (`20261103140000_clinical_and_financial_records`)**:
  - Added models: `OdontogramRecord`, `ToothSurfaceRecord`, `TreatmentPlanItem`, `Invoice`, `InventoryItem`, `InventoryMovement`, `enum InventoryMovementType`.
  - Added relations for `Payment.invoiceId` and `Payment.patientId`, making `Payment.appointmentId` optional.
  - Successfully migrated both `dentacare_test` and `dentacare` databases.
- **NestJS Clinical Module (`backend/src/clinical/`)**:
  - `ClinicalService` & `ClinicalController`: Manages 3D odontogram tooth status (FDI 11–48 and 51–85) and treatment plan items.
  - Doctor scoping: Doctors can only inspect and modify odontograms/treatment plans for patients with whom they have an appointment; unauthorized access returns 403 Forbidden.
  - Transactional audit log recording for clinical updates.
- **NestJS Billing Module (`backend/src/billing/`)**:
  - `BillingService` & `BillingController`: Generates invoices and records payments.
  - **Dynamic Debt Calculation**: Currency stored as integer (`so'm`). Patient debts are computed dynamically (`effectiveTotal - totalPaid`) without storing static debt, eliminating reconciliation drift.
- **NestJS Inventory Module (`backend/src/inventory/`)**:
  - `InventoryService` & `InventoryController`: Atomically tracks stock adjustments and material usage with `InventoryMovement` records. Fails closed with 400 Bad Request on negative stock.
- **Interactive Odontogram Refactored (`frontend/src/components/InteractiveOdontogram.tsx`)**:
  - Decoupled from `clinicStore`. Now fetches records from `api.getOdontogram(patientId)`, saves updates via `api.saveOdontogram()`, and generates invoices via `api.createInvoice()`.

### Phase 3: Roles & Admin Modularization
- **Prisma `StaffRole.RECEPTION`**:
  - Added `RECEPTION` to Prisma enum and frontend `StaffRole` type.
  - Configured role permissions: Reception can access calendar, queue, quick registration, inventory viewing, invoices, and debt repayment.
- **Admin Monolith Modularization**:
  - Deconstructed monolithic 2862-line `admin/page.tsx` into clean, testable workspace components:
    - `DoctorWorkspace.tsx`: Header, interactive odontogram, treatment plan, and X-ray viewer with brightness/contrast controls.
    - `OwnerWorkspace.tsx`: Financial intelligence, doctor commission rate management, dynamic patient debt ledger, and inventory stock monitoring.
    - `ReceptionWorkspace.tsx`: Daily calendar, check-in queue tabs (`ALL`, `ARRIVED`, `IN_TREATMENT`, `COMPLETED`), quick patient walk-in registration, and invoice summaries.
  - Cleaned `admin/page.tsx` down to ~500 lines with zero references to browser `clinicStore`.
- **E2E Regressions 48–52 Added & Verified**:
  - Regression 48: Odontogram records & surfaces persisted transactionally; doctor scoping enforced (403 for unauthorized doctor).
  - Regression 49: Treatment plan items created, status updated, and audited transactionally.
  - Regression 50: Invoices and payments calculate debt dynamically without storing static debt; partial payments update invoice status.
  - Regression 51: Inventory movements track quantity delta atomically and fail closed on negative stock.
  - Regression 52: Role-based guard verification across `OWNER`, `ADMIN`, `DOCTOR`, `RECEPTION` (allowed and forbidden 403).

### Phase 4: Integrations & Cleanup
- **SMS Gateway Adapter**:
  - Configured in `NotificationsService` supporting both **Eskiz** (`notify.eskiz.uz`) and **PlayMobile** SMS formats.
  - Safely falls back to local `[DEV SINK: SMS]` logger in development/test without sending real SMS or failing tests.
- **Telegram Bot Validation**:
  - Verified `bot/test_bot_suite.py` with mock bot, inline/reply keyboards, staff notifier alerts, and APScheduler daily dispatch.

### Phase 5: Production Readiness & Documentation
- **Production Dockerfiles**:
  - `backend/Dockerfile`: Multi-stage Node.js 20 Alpine build, native addon compilation, Prisma client generation, production pruning, and non-root unprivileged `nestjs` user execution.
  - `frontend/Dockerfile`: Multi-stage Next.js 14 Alpine build, static optimization, and non-root `nextjs` user execution.
- **Production Docker Compose (`docker-compose.prod.yml`)**:
  - Orchestrates PostgreSQL 16, Redis 7, Backend, and Frontend.
  - Configures internal container network (`dentacare-internal`) isolating database and cache from public exposure.
  - Health checks and auto-restart policies configured.
- **GitHub Actions CI (`.github/workflows/ci.yml`)**:
  - Runs on push/PR to `main` and `dev`.
  - Fully verifies backend (lint, typecheck, prisma, migrate, jest e2e, priority checks with live postgres/redis services), frontend (typecheck, lint, build), and bot suite.

### Phase 6: Deep Architectural Hardening & Service Consolidation (Commits `ca18e0c` .. `bdde4f4`)
- **Rate Limit Isolation & Throttler Hardening (Commit `ca18e0c`)**:
  - Resolved Regression 52 429 flakiness by clearing in-memory throttler storage between test runs.
  - Preserved strict production 5 req/min protection with dedicated regression verification.
- **Ombor Poygasi & Concurrency Safety (Commit `c836f77`)**:
  - Replaced un-isolated stock reads with atomic transaction locking: `SELECT quantity FROM inventory_items WHERE id = $1 FOR UPDATE`.
  - Verified concurrent race safety using multi-worker `Promise.all` regression tests (Regression 53).
- **Billing Integrity, Doctor Scoping & Overpayment Guard (Commit `c836f77`)**:
  - Enforced strict owner matching: `dto.patientId` must match invoice `patientId`.
  - Enforced appointment association checks (`appointment.patientId === invoice.patientId`).
  - Added overpayment guard preventing payment sum from exceeding outstanding invoice balance.
  - Implemented strict doctor scoping on invoice lookups and payment recordings (Regressions 54 & 55).
- **Doctor Commission Persistence & DB-level Debt Pagination (Commit `6f567dd`)**:
  - Created Prisma model `DoctorCommission` with unique `doctorId` constraint and forward migration `20261103190000_doctor_commissions`.
  - Created OWNER-only endpoints (`GET /api/staff/commissions`, `POST /api/staff/commissions`) with transactional audit logging.
  - Replaced unbounded memory-loading in `getPatientDebts` with database-level aggregation (`skip`/`take`, totalDebt, totalPaid).
  - Deleted 1216 lines of obsolete code in `frontend/src/lib/clinicState.ts` (Regression 56 & 57).
- **Consolidation to Single NestJS API Gateway & Retirement of FastAPI (Commit `515cf05`)**:
  - Implemented NestJS `BotModule` (`/api/bot/*`) with `BotServiceGuard` and shared `SERVICE_AUTH_TOKEN`.
  - Refactored Telegram bot handlers to communicate with NestJS via asynchronous HTTP (`httpx.AsyncClient`).
  - Completely removed `backend/fastapi_app/`, `backend/models.py`, `backend/seed.py`, and `bot/database.py`, eradicating split-brain database risks.
  - Added NestJS Bot service regression tests (Regression 58).
- **Frontend Code Quality & Zero ESLint Warnings (Commit `bdde4f4`)**:
  - Resolved all 12 `react-hooks/exhaustive-deps` warnings with stable callbacks and functional state updates.
  - Converted all 10 unoptimized `<img>` elements to Next.js `<Image />` components.
  - Reached **0 warnings, 0 errors** on `npm run lint`.

### Phase 7: Production Security, Safe Telegram Gateway & Billing/Commission Integrity (Commits `e89518b`, `0e47c14`, `92bdd47`)
- **Hardcoded Secret Elimination & Timing-Safe Bot Guard (Commit `e89518b`)**:
  - Removed hardcoded fallback tokens in `BotServiceGuard` and `bot/config.py`. Enforced `SERVICE_TOKEN.length >= 32` fail-closed check.
  - Implemented constant-time string comparison via `crypto.timingSafeEqual` preventing timing-attack vectors.
  - Added `@Throttle({ default: { limit: 120, ttl: 60000 } })` rate-limiting to all bot gateway endpoints.
  - Verified token validation: Missing token -> 401, Invalid token -> 401, Valid >=32 char token -> 200 (Regression 59a).
- **Telegram Identity Spoofing Guard & Server Mapping (Commit `e89518b`)**:
  - Added migration `20261104120000_patient_telegram_user_id` (`telegram_user_id String? @unique` on `Patient`).
  - Added check `if contact.user_id != message.from_user.id: return` in `bot/handlers/start.py` to prevent contact card spoofing.
  - Eliminated ephemeral in-memory `user_patient_data` cache; all patient lookups bind directly to verified `telegram_user_id`.
  - Added ownership isolation tests proving Patient A cannot access or cancel Patient B's records (Regression 59b).
- **Safe Bot Cancellation Pipeline (Commit `e89518b`)**:
  - Replaced direct `prisma.appointment.update` with `AppointmentsService.changeStatus` enforcing advisory locks, status machine transitions (rejecting `COMPLETED`, `CHECKED_IN`, `CANCELLED`), audit logging, and reminder cancellation (Regression 59c).
- **Explicit Branch/Service Selection & Shared Family Phone Resolution (Commit `0e47c14`)**:
  - Replaced silent fallback in `getSlots` and `createBooking` with strict 400 Bad Request if `branchId` or `serviceId` is omitted (Regression 60).
  - Enforced identity resolution policy on shared family phone numbers: returns `{ ambiguous: true, candidates }` when name mismatches to prevent silent overwrites (Regression 61).
- **Doctor Debt Scoping & Unified Response (Commit `0e47c14`)**:
  - Scoped `getPatientDebts` so Doctors only see debts from treatments they conducted.
  - Unified response shape across paginated and unpaginated calls: `{ items, total, page, limit, totalPages }` (Regression 62).
- **Accurate Doctor Commission Calculation (Commit `92bdd47`)**:
  - Removed dead loops and in-memory appointment iterations.
  - Implemented database-level aggregation query grouping payments and refunds by `doctor_id`.
  - Handled payments attached via invoices where `appointmentId` was on the invoice, with zero double-counting.
  - Added clinic timezone (`Asia/Tashkent`) boundary parsing for `from` and `to` date filters.
  - Corrected UI to show "Sozlanmagan" / "Не настроено" instead of defaulting to a hidden 30% commission.
  - Verified calculation with concrete numerical tests (Regression 63).
- **Infrastructure & Test Maintenance**:
  - Configured `asyncio_default_fixture_loop_scope = function` in `bot/pytest.ini`, eliminating `PytestDeprecationWarning`.

### Phase 8: Clinical Radiography (X-Ray / OPG), Bot Patient Portal & Production Nginx Gateway
- **Clinical Radiography & OPG Interactive Viewer (`DoctorWorkspace.tsx`)**:
  - Expanded `MediaController` permissions (`@Roles`) allowing `StaffRole.DOCTOR` to upload and inspect radiography assets.
  - Implemented radiography media gallery, upload handler, and real-time interactive canvas with Zoom (50%–300%), 90° Rotation, Invert (Negative/Positive radiography view), Brightness, and Contrast controls.
  - Retained strict zero Next.js compilation warnings and errors.
- **Telegram Bot Patient Portal Flow**:
  - Added unit and flow tests in `test_bot_suite.py` covering `show_my_appointments`, `show_debt_status`, and `handle_confirm_cancel` using verified `telegram_user_id` scoping and staff cancellation alert notifications.
  - Verified 10/10 assertions in `test_bot_suite.py` (100% pass, 0 warnings).
- **Production Nginx Gateway & Docker Deployment Architecture**:
  - Created `nginx/nginx.conf` (Gzip, rate limiting, 15MB file upload limit for DICOM/OPG images) and `nginx/conf.d/dentacare.conf` (reverse proxy for frontend and backend, static media caching, security headers).
  - Updated `docker-compose.prod.yml` to route ingress through Nginx container (ports 80 & 443), isolating backend and frontend on internal network.
  - Created `.env.production.example` template with production security guidelines.

### Phase 9: CI Repair, HTTPS Gateway, Bot in Production & Notification Correctness (2026-11-06)
- **CI actually runs now** (`0fab9c6`, `b4ebfc4`): job-level test env incl. `DATABASE_URL`, test DB seeding, and a new gateway job (`docker compose config`, `nginx -t` on rendered templates, bot image build).
- **HTTPS** (`b4ebfc4`): nginx serves ACME challenges on :80 and redirects to HTTPS; TLS 1.2/1.3, HTTP/2, HSTS; certbot auto-renewal; `scripts/init-letsencrypt.sh` bootstrap. Security headers now also apply to cached assets; the declared rate-limit zones are actually used. Backend `TRUST_PROXY=1` so throttling sees real client IPs.
- **Bot in production compose** (`a48c692`): `bot/Dockerfile` (non-root), `bot` service on internal + public networks.
- **Fail-closed secrets** (`6004493`): compose refuses to start without Postgres/Redis passwords, JWT and service secrets (previously public `ChangeMe` defaults).
- **Reminders actually delivered** (`1c65518`): bot scheduler only logged before. Now 24h Telegram reminders and the daily digest are claimed exactly once through `notification_jobs` dedup keys, rendered in clinic time, with failures reported back (Regression 64).
- **Telegram reminder contacts** (`8a1d5ff`): branch address/phone instead of a hardcoded street and number.
- **Staff group policy** (`6282f37`): removed the bot's duplicate new-booking alert (it repeated the backend alert with patient name and phone); cancellation alert has no patient name and uses clinic time.
- **Doctor personal schedule** (`0e32675`): `StaffUser.telegramUserId` (private, never on public doctor endpoints), editable by OWNER in Admin > Xodimlar; `/myid` bot command; per-doctor daily schedule (Regression 65). Bot contact details configurable (website was hardcoded to localhost).
- **Bot booking works again**: it never sent `branchId`/`serviceId` (required since Regression 60), so every bot booking failed. Added branch and service steps (auto-skipped when there is one option), slot buttons by index (the `HH:mm` label broke callback parsing), clinic-local slot labels with the exact UTC instant sent back for booking, the patient's verified phone instead of a hardcoded `+998900000000`, handlers for the Back/Cancel buttons, and clinic-local times in "Qabullarim" (Regression 66).

### Phase 10: Production Images Actually Run, Backups, Bot i18n & Staff Self-Linking (2026-11-06)
A new CI job builds the production images and runs the stack; it found the images had never been able to start:
- **Backend image** (`0060b63`, `52c5fd4`, `f26e9bd`, `458159d`): never applied migrations and pruned the Prisma CLI; Prisma engines mismatched OpenSSL between stages; the entrypoint pointed at `dist/src/main.js` (build emits `dist/main.js`); production required `STORAGE_DRIVER`; uploads dir not writable. All fixed: `prisma migrate deploy` on start, OpenSSL in every stage, `.dockerignore` (images were copying host `node_modules` and `.env`).
- **Backend had no internet egress** (internal-only network) so SMS and Telegram could never be sent; now also on the public network. Healthchecks for backend/frontend/nginx with health-gated startup.
- **Owner bootstrap** without the demo seed: `scripts/create-owner.js`.
- **Backups** (`8fae6b0`): `backup` service, verified DB dump + uploads archive every 24h with retention.
- **Full-stack smoke test in CI** (`bed51a0`): images, migrations, health, owner bootstrap, backups, frontend, nginx HTTPS + redirect + HSTS, owner login with Secure cookies.
- **Staff self-service Telegram linking** (`186ecf4`): signed single-use 10-minute deep links from the admin sidebar (Regression 67).
- **Bot** (`d7d624c`, `0c760b8`): Uzbek/Russian UI with persisted language (reminders in the patient's language), clinic/branch info from the DB, `/start link_...` for staff. Treatment plan no longer invents 150 000 so'm items for patients (Regression 68).

### Phase 11: Pre-Deploy Hardening & Browser QA (2026-11-07)
- **Ops scripts** (`b00f755`): `generate-env.sh` (fresh secrets, mode 600), read-only `preflight.sh` (secrets, provider tokens, DNS → this server, Docker, ports, disk/RAM, compose), `deploy.sh [--pull]` (preflight, pre-deploy backup, rebuild, wait healthy). CI runs generate-env + preflight.
- **Database timezone** (`e97ac7a`): stored UTC timestamps were compared with `NOW()` under the server's default zone; on an Asia/Tashkent database every scheduled job became due 5 h early (2 h SMS reminder sent ~7 h before). DB default pinned to UTC by migration; Postgres started with `timezone=UTC` (Regression 70).
- **Ops alerts** (`e97ac7a`, `b115626`): failed notifications summarized every 30 min to `OPS_TELEGRAM_CHAT_ID`/`TELEGRAM_CHAT_ID`, once per window, no recipient data (Regression 69).
- **Security** (`9608636`): the admin login page shipped the demo OWNER/doctor passwords and quick-fill buttons in production builds; now development-only, CI greps the production bundle. Demo seed refuses `NODE_ENV=production`.
- **Service categories** (`3d548df`): patients saw raw enum values (OTHER, DIAGNOSTICS…); admin offered a non-existent HYGIENE category and lacked four real ones.
- **Browser QA (local)**: public site, full web booking (date → service → doctor → time → branch → details → confirmation; stored 05:30Z for 10:30 Tashkent, reminder at 03:30Z), admin login and the Telegram link dialog end to end. Note: the local dev DB contains leftover fixtures from earlier verification scripts (e.g. "Konsultatsiya conc_…"); production starts empty.

### Phase 12: White-Label Branding & Design Refresh (2026-11-07)
- **Per-clinic theme**: `ClinicSettings.primaryColor/secondaryColor/accentColor` now drive the whole UI. `src/lib/brandTheme.ts` builds 50–950 palettes as CSS variables (RGB channels, so `bg-brand-600/20` works); Tailwind `brand`, `secondary`, `accent` (and the legacy `teal` alias) read them. ~2,000 hardcoded teal hex classes were replaced by tokens; text/border/background use brand-neutral `ink`, `line`, `canvas`.
- **Accessibility**: the primary 600 shade is auto-darkened until white text reaches WCAG AA 4.5:1; status colors (success/warning/danger) never follow the brand.
- **Server-rendered branding**: the root layout fetches `/api/public/clinic` (`INTERNAL_API_URL`, `http://backend:4000` in prod compose) with 60 s ISR, injects the palette in `<style id="brand-theme">` (no flash) and sets title/description/favicon from clinic data. One `BrandProvider` replaces the three per-component clinic fetches.
- **Admin**: Settings → "Brend ranglari" with presets, color pickers, contrast check and live preview of the whole panel (reverted if not saved). Backend validates colors as `#RRGGBB` (Regression 71).
- **Design**: self-hosted Inter; light admin sidebar with grouped navigation (logos stay legible), refreshed header and mobile bottom bar; new split-screen login carrying the clinic brand (password no longer trimmed, show/hide toggle); localized service categories on the homepage.

### Phase 13: Patient Card & Treatment Plans (2026-11-07)
- **Patient card** (`/admin/patients/[id]`): one `GET /api/admin/clinical/patient-card/:id` call returns profile, visit stats, next appointment, plan counters and money (billed/paid/debt with invoices and payments). Tabs: overview, tooth chart, treatment plans, visits, payments. Doctors only see their own visits with the patient and no financial data; internal `[lang:xx]` note markers are hidden.
- **Treatment plans** (new `treatment_plans` table, items gain `plan_id`, `service_id`, `quantity`, `unit_price_uzs`, `phase`, `sort_order`): lifecycle DRAFT → PRESENTED → ACCEPTED/DECLINED → IN_PROGRESS → COMPLETED (or CANCELLED). Items are priced from the service catalog (tiyin → so'm) or typed manually, grouped into phases, with a plan-level discount.
- **Approval**: in clinic (signature on screen, PNG data URL validated, or verbal consent recorded in the audit log) or via a private 14-day link `/plan/<token>` that shows only the patient's first name and prices. Only the SHA-256 of the token is stored; links are single use, noindex/no-referrer, throttled, and revoked when prices change after presenting. Accepted plans lock prices and snapshot `acceptedTotalUzs`; item progress drives plan status.
- **Printable estimate** (browser print) with clinic header and signature lines. Regression 72 covers the whole flow.

### Phase 14: Cash Desk & Online Payments (2026-11-07)
- **Plan invoicing**: `POST /admin/clinical/plans/:id/invoice` bills accepted plan items not yet invoiced (completed work, or everything as prepayment). Items get `invoice_id` so nothing is billed twice; the plan discount is spread over invoices until used up.
- **Kassa** (`/admin/cashier`, OWNER/ADMIN/RECEPTION): day report in clinic time (net and per method), payments with who took them (`payments.recorded_by_id`), debtors, cash shifts (`cash_shifts`, one open at a time via a partial unique index) with expected vs counted cash at close. Refunds (`refund_of_id`) for desk payments only, by OWNER/ADMIN, never above the paid amount.
- **Payme** (`POST /api/payments/payme`, JSON-RPC, Basic `Paycom:<key>`): CheckPerform/Create/Perform/Cancel/CheckTransaction/GetStatement, amount must equal the remaining balance, one pending transaction per invoice, 12 h expiry (reason 4, persisted), cancel after perform creates a refund. **Click** (`/api/payments/click/prepare|complete`, md5 signature): idempotent prepare/complete, cancellation on negative `error`. Both mirror transactions in `online_payments` and lock the invoice row so desk and online payments cannot overpay. Checkout links: `GET /admin/billing/invoices/:id/payment-links`.
- Patient card **To'lovlar** tab: take payment, Payme/Click link (copy / Telegram), refund. Regression 73 covers plan invoicing, both providers, shifts and refunds.

---

## 2. Test Verification Matrix

| Suite | Scope | Target | Result |
|---|---|---|---|
| **Jest E2E Regressions** | 88 full integration tests (Regressions 1–73) | `dentacare_test` | **88 / 88 PASSED (100%)** |
| **Priority Regressions (P1–P10)** | 60 concrete invariant checks | `dentacare_test` | **60 / 60 PASSED (100%)** |
| **Backend TypeScript Build** | NestJS compiler (`nest build`) | `backend/dist` | **0 errors, PASSED** |
| **Backend ESLint** | TypeScript linting (`npm run lint`) | `backend/src`, `backend/test` | **0 errors, PASSED** |
| **Frontend TypeScript Check** | Next.js type checker | `frontend/src` | **0 errors, PASSED** |
| **Frontend ESLint** | Next.js linting (`npm run lint`) | `frontend/src` | **0 warnings, 0 errors, PASSED** |
| **Frontend Production Build** | Next.js compiler (`next build`) | 29/29 routes | **0 errors, PASSED** |
| **Telegram Bot Suite** | aiogram v3 API client & contact auth tests | Python 3.12 | **100% PASSED, 0 warnings** |
