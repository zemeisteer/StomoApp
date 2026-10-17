# Recovery Checkpoint - StomoApp

## 1. Branch and Starting Commit
- **Branch**: `dev` (active, strictly preserved locally, no modifications to `main`, no automated push/deployment)
- **Reviewed Commit**: `fdb9ac8d20ee47d1ff788399d0734d78256747a0`
- **Repository**: [https://github.com/zemeisteer/StomoApp](https://github.com/zemeisteer/StomoApp)
- **Local Source of Truth**: `C:\Users\user\Documents\GitHub\StomoApp`

---

## 2. Completed Reliability Findings & Architectural Hardening

### 1. Read-Only Maintenance Context & Safe CLI Runner
- **Dedicated Maintenance Context**:
  - `backend/scripts/repair-reminders.ts` boots a isolated `MaintenanceModule` importing only `ConfigModule` and `PrismaModule`.
  - Avoids bootstrapping `AppModule` or `ScheduleModule.forRoot()`, guaranteeing that no background `@Cron` schedulers (such as `NotificationsService.processPendingNotifications` or `AppointmentsService.expirePendingAppointments`), queue consumers, or outbound provider deliveries are started during maintenance or dry-run.
- **Strict Argument Validation**:
  - Rejects unknown CLI flags (`Unknown option`).
  - Enforces positive bounds on limits: validates `1 <= batchSize <= 500` and `maxJobs >= 1`.
  - Disallows empty database URLs.
- **Credential Sanitization**:
  - Masked database connection URLs in logs via `sanitizeDatabaseUrl` replacing sensitive passwords with `****`.
- **Zero-Write Dry-Run**:
  - Verified across simulated scheduler intervals that dry-run mode causes 0 database writes and 0 external provider calls.

### 2. Concurrency-Safe Legacy Reminder Repair
- **Consistent Lock Ordering & Revalidation**:
  - Re-evaluates each legacy notification job inside short, atomic transactions.
  - Consistent lock order: locks `appointments` row `FOR UPDATE` first, then locks `notification_jobs` row `FOR UPDATE`.
  - Re-checks appointment status, start time, schedule generation, and job lease ownership inside the transaction before mutating.
- **Active Lease Preservation**:
  - Detects active worker leases (`PROCESSING` with `lockedAt` < 5 minutes) and skips them without disrupting active processing workers.
- **Concurrent Reschedule & Race Handling**:
  - Detects concurrent appointment rescheduling during repair and marks obsolete jobs as cancelled rather than attaching them to new schedule revisions.
  - Safely retries serialization conflicts with jittered backoff only after complete rollback.
  - Deterministically tested for concurrent worker lease claiming, concurrent reschedule during repair, and multi-repair processes operating on identical records.

### 3. Preserved Delivery History & Ambiguous Generation Handling
- **Preserve Delivery Outcomes & Evidence**:
  - Delivered records (`SENT` or `SIMULATED`) with missing or malformed payloads are quarantined with `scheduleRevision: 0` while strictly preserving their original status and delivery evidence (never overwritten with `CANCELLED`).
  - Existing diagnostic errors (`lastError`, e.g. provider timeouts) are preserved and never wiped.
  - Distinguishes missing `appointmentId` from non-existent `appointmentId` in quarantine error records.
- **Pre-Migration A → B → A Reschedule Disambiguation**:
  - Timestamp equality alone is rejected as proof of schedule-generation identity.
  - If `appointment.scheduleRevision > 1` and `job.createdAt < appointment.updatedAt`, the historical job is classified as ambiguous (`scheduleRevision: 0`).
  - Conservative recovery path immediately generates a canonical, verified reminder for the current generation (revision `N`), avoiding false suppression of upcoming patient reminders.

### 4. Bounded Repair Operation & Accurate Reporting
- **Bounded Upcoming Appointments Audit**:
  - Paginated cursor-based scanning (`maxUpcomingAudit` option, default bounded to `Math.min(maxJobs, 5000)`).
  - Eliminates unbounded queries loading entire future appointment tables into memory.
- **Honest & Non-Double-Counting Metrics**:
  - Tracks `plannedUpgrades` in dry-run mode so predicted upgrades satisfy appointment reminder checks without double-counting `newlyCreated`.
  - Live mode only increments `newlyCreated` if a new reminder was truly created by recovery (distinguishing existing jobs returned).

### 5. Closed Browser-Test Isolation Gap
- **Explicit Test Database Enforcement**:
  - Replaced weak substring checks (`includes('test')`) with strict target database enforcement (`TEST_DB_NAME` or `dentacare_test`).
  - Explicitly rejects protected databases (`dentacare`, `postgres`, `master`, `production`, or names containing `prod`).
- **Frontend Rewritten Route Verification**:
  - Verifies the actual API route used by the frontend (`fetch('${BASE_URL}/api/health')` through Next.js rewrites) against the test database before any browser mutations are allowed. Fails closed on mismatch.
- **Proper Signal Handling & Scoped Teardown**:
  - In `run-browser-tests.js`, child process termination by signal exits with failure (`code ?? 1`), preventing false positives.
  - Teardown strictly limits cleanup to identifiers prefixed with the current run's unique key (`runKey`), ensuring zero disruption of surrounding data.

---

## 3. Verified Results & Exact Commands

### 1. Backend E2E Regression & Concurrency Suite
```bash
cd backend
npm run test:e2e
```
**Observed Result**:
```
PASS test/app.e2e-spec.ts (106.066 s)
  DentaCare Backend Regression & Integration Suite (e2e)
    ... (Regressions 1-47 passed)
    √ Hardening: Robust Legacy Reminder Upgrade handles malformed timestamps, nulls, orphans, and historical A-B-A (381 ms)
    √ Hardening: Atomic Reminder Recovery preserves invariants across concurrent recoveries, leases, and rollback (133 ms)
    √ Hardening: Progressive Legacy Review permits subsequent review of AMBIGUOUS_BUNDLE and rejects stale versions with 409 (152 ms)
    √ Hardening: Reminder Repair CLI validation and genuinely read-only dry-run with zero writes across scheduler interval (138 ms)
    √ Hardening: Concurrency safety during legacy reminder repair - active leases, concurrent reschedule, and multi-repair (354 ms)
    √ Hardening: Delivery history preservation and ambiguous pre-migration A-B-A schedule handling (271 ms)
    √ Hardening: Bounded repair operation and accurate dry-run reporting without double-counting (231 ms)

Test Suites: 1 passed, 1 total
Tests:       55 passed, 55 total
Snapshots:   0 total
Time:        106.778 s
```

### 2. Isolated Browser Test Suite & Route Verification
```bash
cd backend
node test/run-browser-tests.js
```
**Observed Result**:
```
================================================================
   DENTACARE: TEST ENVIRONMENT HARNESS & BROWSER RUNNER
================================================================
Test Database URL : postgresql://dentacare:****@localhost:5432/dentacare_test?schema=public
Connected Test DB : "dentacare_test"
Admin user verified in test database.
Checking backend API server at http://localhost:4000/api/health ...
Verified: Backend and test runner share test database "dentacare_test".
Checking frontend application at http://localhost:3000 ...
Frontend server is responsive.
Verifying frontend rewritten API route at http://localhost:3000/api/health ...
Verified: Frontend rewritten API route connects to test database "dentacare_test".

Executing browser workflow test suite...
--- STARTING ISOLATED BROWSER WORKFLOW VERIFICATION ---
[DB Check] Direct Prisma connected to database: "dentacare_test"
[Backend Check] API reported connected database: "dentacare_test"
[Frontend Route Check] Frontend rewritten API reported connected database: "dentacare_test"
[Setup] Creating isolated run fixtures in test database...
[Setup] Isolated fixtures created: Branch "Filial Test t8270095", Doctor "Test t8270095"
[1/7] Desktop Homepage (1440x900)...
[2/7] Navigating to Booking page http://localhost:3000/booking ...
Step 1: Selecting isolated branch "Filial Test t8270095"...
Step 2: Selecting isolated test services "Xizmat A t8270095" and "Xizmat B t8270095"...
Step 3: Selecting isolated doctor "Test t8270095"...
Step 4: Picking an available working time slot...
Step 5: Filling patient details with safe masked phone input...
Submitting booking mutation...
Captured exact appointment ID: cmvc6fxp5001984spnb6tlayc
>>> ASSERTION 1 PASSED: Multi-service booking confirmed and verified in database with 2 items and normalized phone.
[3/7] Logging in via actual admin login form at http://localhost:3000/admin/login ...
>>> ASSERTION 2 PASSED: Authenticated admin access verified via actual login form.
[4/7] Navigating to Admin Calendar and locating exact created appointment...
Locating appointment card for patient "Browser Patient t8270095"...
>>> ASSERTION 3 PASSED: Exact appointment located and details verified in admin calendar.
[5/7] Executing Rescheduling workflow in modal...
Selected new reschedule time: 08:30
>>> ASSERTION 4 PASSED: Rescheduling succeeded with matching time in UI and database.
[6/7] Creating isolated legacy fixture and navigating to Legacy Review...
Switching to Legacy Review tab...
Waiting for legacy fixture item "Noaniq Paket t8270095"...
>>> ASSERTION 5 PASSED: Legacy review action completed and verified with audit log.
[7/7] Verifying Mobile (390x844) and Tablet (768x1024) layouts...
====================================================
ALL WORKFLOWS AND HONEST ASSERTIONS SUCCESSFULLY PASSED!
====================================================
--- PERFORMING ROBUST RUN TEARDOWN ---
--- TEARDOWN FINISHED ---
Browser test runner exited with code 0, signal: null
```

---

## 4. Files Changed
1. `backend/scripts/repair-reminders.ts`: Dedicated maintenance context, strict CLI argument bounds, database credential masking, read-only dry run.
2. `backend/src/notifications/notifications.service.ts`: Transactional revalidation, row locking (`appointments` then `notification_jobs`), active lease preservation, delivery history & lastError preservation, ambiguous pre-migration A-B-A schedule recovery, bounded upcoming audit, accurate dry-run reporting.
3. `backend/test/app.e2e-spec.ts`: Added 4 deterministic regression tests covering CLI validation & zero-write dry-run, concurrency safety (worker lease, reschedule, multi-repair), history preservation & A-B-A handling, and bounded audit without double-counting (55 of 55 passing).
4. `backend/test/browser-workflow.js`: Frontend rewritten route check before mutations, explicit test database validation, strict run-scoped teardown.
5. `backend/test/run-browser-tests.js`: Frontend rewritten route verification (`${BASE_URL}/api/health`), strict test database enforcement, signal termination handling.

---

## 5. Remaining Issues
None. All 5 source-review findings have been resolved, implemented, and verified with 100% passing tests and live browser execution against the dedicated test database.

---

## 6. Exact Next Action
User review of local changes on branch `dev`.
