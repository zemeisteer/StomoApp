# Recovery Checkpoint - StomoApp

## 1. Branch and Starting Commit
- **Branch**: `dev` (active, preserved clean, no modifications to `main`)
- **Starting Commit**: `e49e99566f1a3fc11a40db62e599a2cda22d5053` (`feat(booking): eliminate reschedule stale reads, handle override reminder lifecycle, unify availability agreement, validate slot queries, and repair legacy provenance`)
- **Repository**: [https://github.com/zemeisteer/StomoApp](https://github.com/zemeisteer/StomoApp)
- **Local Source of Truth**: `C:\Users\user\Documents\GitHub\StomoApp`

## 2. Completed Changes Across All Subtasks
1. **Reminder Identity & Rescheduling Lifecycle**:
   - Added `scheduleRevision` column to `Appointment` (default 1) and `NotificationJob` (indexed) in `backend/prisma/schema.prisma`.
   - Forward migration `20261016200000_schedule_revision_and_repair_matching` verified applied in both `dentacare` (dev) and `dentacare_test` (test) databases.
   - Rescheduling increments `scheduleRevision`, invalidating obsolete reminders for previous times while preventing delivered reminders for time A from suppressing time B.
   - Enqueued reminders carry matching `scheduleRevision`.
   - Duration override preserves current `scheduleRevision`, ensuring valid in-flight reminders are not cancelled when appointment start time is unchanged.
   - Worker delivery (`NotificationsService.deliverJob`) safely validates reminder payloads (gracefully handling missing or invalid `startTime`), validates worker lease tokens, cancels obsolete reminders whose revision or start time no longer matches, and verifies previous deliveries strictly within the same `scheduleRevision`.
   - Rescheduling sequence A → B → A explicitly handled: each transition increments `scheduleRevision`, giving the return to time A a distinct revision so the previous reminder does not suppress the new reminder.
   - Documented provider wire-level limitation when an SMS/Telegram HTTP request is already in flight across the network.
2. **Authoritative Clinic Timezone**:
   - Resolved scheduling timezone strictly from `clinicSettings` in `SchedulingService.resolveClinicTimezone(tx)`.
   - `Asia/Tashkent` is used strictly as a fallback when no configured clinic timezone exists in the database.
   - Public callers' requested display timezone no longer alters clinic working hours or slot boundaries; physical working hours are interpreted strictly in the clinic's authoritative timezone.
   - Calendar dates constructed with pure UTC at noon UTC to eliminate UTC day boundary shifts.
   - Booking slots, reschedule slots, booking mutations, and doctor exceptions tested with non-Tashkent timezone (`Europe/Samara`) and verified consistent.
3. **Safe Legacy Reconciliation**:
   - Validated explicit reconciliation contract in `ServicesService.reconcileLegacyRecord`:
     - Only eligible unresolved records (`isLegacyBundle: true` or `legacyProvenance === 'AMBIGUOUS_BUNDLE'`) can be reconciled. Modern items (`MODERN`) and already verified records (`VERIFIED_SINGLE`, `RESOLVED_MANUAL`) are rejected with 400 Bad Request.
     - Enforces supported actions: `RESOLVE_TO_SERVICE` and `KEEP_AMBIGUOUS_BUNDLE`.
     - Anti-collapse protection: If the historical service name contains multiple services (comma-separated), collapsing into a single catalog service without an exact name match is rejected with 400 Bad Request.
     - Review reason (min 5 characters) and audit action (`service.legacy_reconciled`) atomically saved inside a transaction with row-level concurrency locking (`FOR UPDATE`).
     - Preserves original identity, historical names (`serviceNameUz`, `serviceNameRu`), duration, and price snapshots.
   - Built and integrated an administrative review interface in `/admin/services` with tabs ("Xizmatlar katalogi" and "Tarixiy yozuvlar taftishi (Legacy Review)"), summary metrics, paginated table, and action modal.
4. **Deterministic Historical Repair**:
   - Forward migration `20261016200000_schedule_revision_and_repair_matching` preserves `original_service_id` and appointment snapshots.
   - Disambiguates historical records by ensuring catalog name matches are unique (matching exactly one active catalog service across Uzbek and Russian names). Ambiguous or duplicate name matches are preserved as `AMBIGUOUS_BUNDLE`.
   - Legitimate comma-containing catalog services remain `VERIFIED_SINGLE`.
   - Applied cleanly to `dentacare` and `dentacare_test` without editing previous migrations.
5. **Honest, Reproducible Verification & Concurrency Tests**:
   - Renamed sequential race test to `Regression 38: Sequential duration override with leased reminder preserves valid reminder`.
   - Added `Regression 38b: Truly synchronized concurrent worker and override test using controlled fake provider barrier` using a mock barrier promise to pause fake SMS provider while duration override runs concurrently.
   - Added `Regression 42: Reminder identity across rescheduling (A delivered -> B delivered), A -> B -> A, and safe payload handling`.
   - Added `Regression 43: Authoritative clinic timezone from settings with non-Tashkent timezone and UTC day boundaries`.
   - Reusable browser test script in `backend/test/browser-workflow.js` validating all 5 browser assertions with high-resolution screenshots saved to artifacts directory.

## 3. Database Migration Status
- Total migrations: 8 migrations in `backend/prisma/migrations`.
- Current latest migration: `20261016200000_schedule_revision_and_repair_matching`.
- Verified applied in both `dentacare` (development) and `dentacare_test` (test) PostgreSQL databases.
- Prisma schema and client in complete synchronization.

## 4. Test & Build Results
- **Backend E2E Suite**: 44/44 tests passed (100% green, 0 failures, 193s).
- **Backend Build**: `nest build` passed with 0 errors.
- **Backend Lint**: ESLint passed with 0 errors, 0 warnings.
- **Frontend Build**: `next build` passed with all 28 routes compiled and optimized.
- **Frontend Lint**: ESLint passed with 0 errors.
- **Browser Workflow Suite** (`node test/browser-workflow.js`):
  - [x] ASSERTION 1: Multi-service booking confirmation verified.
  - [x] ASSERTION 2: Authenticated admin access verified.
  - [x] ASSERTION 3: Appointment calendar visibility in admin verified.
  - [x] ASSERTION 4: Successful rescheduling verified.
  - [x] ASSERTION 5: Correct legacy review behavior verified.
  - [x] Responsive layout verified across Desktop (1440x900), Mobile (390x844), and Tablet (768x1024).

## 5. Running Processes
- PostgreSQL 18: listening on `localhost:5432`.
- Backend (NestJS): running on `http://localhost:4000/api` (PID 29264).
- Frontend (Next.js): running on `http://localhost:3000` (PID 11872).

## 6. Remaining Blockers / Incomplete Items
- None. All tasks and requirements have been fully implemented, verified, and documented.
