# Recovery Checkpoint - StomoApp

## 1. Branch and Starting Commit
- **Branch**: `dev` (active, preserved clean, no modifications to `main`)
- **Starting Reviewed Commit**: `41c3f060946e2db37e8e854db2dac8306cac7143` (`feat(scheduling): reminder identity on reschedule, authoritative clinic timezone, safe legacy reconciliation, and forward repair`)
- **Repository**: [https://github.com/zemeisteer/StomoApp](https://github.com/zemeisteer/StomoApp)
- **Local Source of Truth**: `C:\Users\user\Documents\GitHub\StomoApp`

## 2. Completed Changes Across All Assigned Tasks

1. **Browser Test Trustworthiness & Data Isolation (`backend/test/browser-workflow.js`)**:
   - Replaced weak and false-positive assertions with strict, deterministic end-to-end checks:
     - **Assertion 1 (Multi-Service Booking)**: Selects exactly two compatible services (`Birlamchi ko'rik va maslahat` + `Dental implantatsiya`) provided by Dr. Aziz Rahimov. Submits patient booking, captures exact created appointment ID from the response/status page, and asserts exactly 2 items in `AppointmentServiceItem` in PostgreSQL.
     - **Assertion 2 (Authenticated Admin Access)**: Authenticates through the real `/admin/login` form with CSRF and session cookies; verifies dashboard redirection.
     - **Assertion 3 (Admin Calendar Visibility)**: Navigates to `/admin/calendar`, synchronizes view mode to Month view (`Oylik`), locates the exact appointment card for the test run's patient name, opens the detail modal, and validates patient, doctor, and 2 service items.
     - **Assertion 4 (Actual Reschedule Execution)**: Selects a distinct available time slot, clicks "Ko'chirishni saqlash", verifies the updated time appears in the calendar UI, and asserts both the updated `startTime` and incremented `scheduleRevision` in PostgreSQL.
     - **Assertion 5 (Legacy Review Action & Audit Verification)**: Creates an isolated historical bundle fixture (`serviceId: null, isLegacyBundle: true, legacyProvenance: 'AMBIGUOUS_BUNDLE'`), navigates to `/admin/services`, switches to "Tarixiy yozuvlar taftishi", opens the action modal for "Paket deb saqlash", inputs a verified audit reason, submits the modal, and verifies the corresponding `AuditLog` entry in PostgreSQL.
     - **Workflow 7 (Responsive Viewports)**: Captures full-page screenshots across Desktop (1440x900), Mobile (390x844), and Tablet (768x1024).
     - **Data Isolation & Clean Teardown**: Operates with unique timestamp-based identifiers (`testRunId`). Scoped cleanup in `finally` removes strictly this run's records (status history, notification jobs, service items, appointment, patient, and audit logs).

2. **Reminder Migration Compatibility (`backend/src/notifications/notifications.service.ts`)**:
   - Implemented `upgradeLegacyReminderJobs(tx)` defining a safe upgrade policy for legacy notification jobs where `scheduleRevision` is null:
     - `SENT` / `SIMULATED`: Retain null revision as historical delivery record; do not blindly attach to current appointment revision.
     - `FAILED` / `CANCELLED`: Retain null revision; mark obsolete to prevent resurrecting historical failures.
     - `PENDING` / `PROCESSING`: Upgraded to current appointment's `scheduleRevision` only if the job matches the appointment's current `startTime`. If the start time is mismatched, cancelled as obsolete.
     - Verifies eligible upcoming appointments retain an active reminder job. Tested via `Regression 44`.

3. **Reminder Recovery with Existing Deduplication Keys (`backend/src/notifications/notifications.service.ts`)**:
   - In `NotificationsService.enqueue`, implemented concurrency-safe recovery for existing deduplication keys:
     - If an existing job is in terminal `FAILED` or `CANCELLED` state but matches the current upcoming `scheduleRevision`, safely restores it to `PENDING` with reset attempts and refreshed schedule timestamp.
     - Never revives stale reminders from prior revisions or duplicates an already delivered (`SENT`/`SIMULATED`) current reminder.
     - Respects active worker leases (`PROCESSING`). Tested via `Regression 45`.

4. **Production Authentication Throttling Review (`backend/src/auth/auth.controller.ts`)**:
   - Restored intentional production rate limit on `POST /api/auth/login` to **5 attempts per minute** (`@Throttle({ default: { limit: 5, ttl: 60000 } })`).
   - Configured Express with `trust proxy: true` to honor client IP headers behind proxies and Next.js rewrites.
   - Tests configure isolated client IP headers (`X-Forwarded-For`), allowing test suites to verify rate limiting without compromising production security. Tested via `Regression 46`.

5. **Legacy Review Edge Cases & Concurrency Conflicts (`backend/src/services/services.service.ts`)**:
   - Concurrency resolution: Serializable isolation level with row-level locking (`SELECT id FROM appointment_service_items WHERE id = :id FOR UPDATE`) and controlled conflict retry with jitter. Concurrent resolutions return a controlled 409 Conflict.
   - Renamed single-service handling: Punctuation (such as commas in legitimate single-service catalog names) does not permanently block reconciliation if the item represents a single catalog procedure.
   - Anti-collapse protection: Genuine multi-procedure bundles cannot be collapsed into a partial single service without an exact match. Preserves historical snapshots (`serviceNameUz`, `serviceNameRu`, duration, price) without overwriting. Tested via `Regression 47`.

## 3. Database Migration Status
- Total applied migrations: 8 migrations in `backend/prisma/migrations`.
- Current latest migration: `20261016200000_schedule_revision_and_repair_matching`.
- Verified applied in both `dentacare` (development) and `dentacare_test` (test) PostgreSQL databases.
- Prisma schema and client in complete synchronization.

## 4. Test & Build Results
- **Backend E2E Regression Suite**: **48/48 tests passed (100% green, 0 failures, 28.87s)**.
  - Regressions 1–43: All previous regression and concurrency tests passing.
  - Regression 44: Upgrade legacy reminder identity for pre-scheduleRevision database fixtures.
  - Regression 45: Deliberate current-generation reminder recovery with existing deduplication keys.
  - Regression 46: Intentional production authentication throttling enforces 5 attempts per minute.
  - Regression 47: Safe legacy review edge cases (concurrency conflict handling, renamed single services with commas, and anti-collapse).
- **Backend Build & Lint**:
  - `npm run build` (`nest build`): Exited with code 0.
  - `npm run lint` (`eslint`): Exited with code 0 (0 errors, 0 warnings).
- **Frontend Build & Lint**:
  - `npm run build` (`next build`): Exited with code 0 (all 28 routes compiled and optimized).
  - `npm run lint` (`next lint`): Exited with code 0.
- **Browser Workflow Suite (`node test/browser-workflow.js`)**:
  - [x] ASSERTION 1: Multi-service booking confirmed and verified in database with 2 items.
  - [x] ASSERTION 2: Authenticated admin access verified via actual login form.
  - [x] ASSERTION 3: Exact appointment located and details verified in admin calendar.
  - [x] ASSERTION 4: Rescheduling succeeded with matching time in UI and database.
  - [x] ASSERTION 5: Legacy review action completed and verified with audit log.
  - [x] WORKFLOW 7: Responsive viewports verified across Desktop (1440x900), Mobile (390x844), and Tablet (768x1024).
  - Full-page screenshots saved:
    - `desktop_homepage.png`
    - `desktop_booking_confirmation.png`
    - `desktop_admin_calendar_modal.png`
    - `desktop_rescheduled.png`
    - `desktop_legacy_review.png`
    - `desktop_legacy_action.png`
    - `mobile_homepage.png`
    - `tablet_homepage.png`

## 5. Running Processes
- PostgreSQL 18: listening on `localhost:5432`.
- Backend (NestJS): running on `http://localhost:4000/api`.
- Frontend (Next.js): running on `http://localhost:3000`.

## 6. Remaining Blockers / Incomplete Items
- None. All tasks and requirements have been fully implemented, verified across backend regressions and real browser workflows, and documented.
