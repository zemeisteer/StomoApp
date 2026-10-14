# StomoApp Implementation Progress & Verification Report

## Overall Status: COMPLETED & VERIFIED (Phases 1 — 9)

Branch: `dev` (Preserved uncommitted local changes, no merge to `main`, no force-push, no automated push/deployment).

---

### Detailed Phase Status

#### Phase 1: Frontend / Backend Contract Alignment (COMPLETED & VERIFIED)
- **Doctor Schedules & Exceptions**: Added route aliases supporting both singular and plural forms in `backend/src/scheduling/scheduling.controller.ts`:
  - `['doctor/:doctorId', 'schedules/:doctorId']`
  - `['schedule', 'schedules']`
  - `['exception', 'exceptions']`
  - `['exception/:id', 'exceptions/:id']`
- **Admin Rescheduling**: Enabled both `PUT` and `POST` on `/api/admin/appointments/:id/reschedule` in `appointments.controller.ts`.
- **Callback & Lead Contracts**:
  - Added `preferredBranch` and `preferredTime` to Prisma schema (`Lead` model) via migration `20261014121753_hardening_lead_notification`.
  - Added `internalNotes` and `notes` mapping in `CreatePublicLeadDto` and `UpdateLeadDto`.
  - Aligned frontend lead status values with Prisma `LeadStatus` (`NEW`, `CONTACTED`, `BOOKED`, `CLOSED`).
- **Doctor Patient Access Scoping**:
  - `findAll` in `patients.controller.ts` allows `StaffRole.DOCTOR` while enforcing strict treating doctor scoping (`appointments: { some: { doctorId } }`). Doctors cannot see all clinic patients, and unlinked doctors fail closed (403).
- **API Client Hardening**:
  - Replaced `any` types with explicit TypeScript interfaces in `frontend/src/lib/api.ts`.
  - Configured shared 401 token refresh promise to prevent refresh storms and replay detection race conditions.
  - Attached anti-CSRF headers (`X-Requested-With`, `X-CSRF-Token`) on all mutating requests.

#### Phase 2: Appointment Consistency & Concurrency Hardening (COMPLETED & VERIFIED)
- **Atomic Status Transitions**:
  - `changeStatus` locks appointment rows with PostgreSQL `SELECT ... FOR UPDATE` inside `$transaction`.
  - Transition validity validated strictly against `ALLOWED_TRANSITIONS`.
  - Status history and audit log writes share the same database transaction.
  - External notifications (reminders cancellation) dispatched strictly after transaction commit.
- **Race-Free Pending Expiry**:
  - `expirePending` background worker scans candidates, locks rows with `FOR UPDATE`, re-verifies `PENDING` state, transitions to `CANCELLED`, revokes management tokens, and cancels pending reminders.
- **Rescheduling & Advisory Locks**:
  - Protected by transactional advisory lock `pg_advisory_xact_lock`.
  - Re-checks doctor working hours, schedule exceptions, overlaps, and booking window inside transaction.
  - Preserves duration and buffer (`durationMinutes + bufferMinutes`).
  - If rescheduling fails, the original appointment remains completely intact and unaffected.
- **Deadlock & Serialization Retries**:
  - Wrapped `createBooking` in a bounded retry loop (up to 3 attempts with jitter) to gracefully handle PostgreSQL `P2034` serializable conflicts and return consistent results for concurrent identical requests.

#### Phase 3: Custom Admin Panel Features (COMPLETED & VERIFIED)
- **Interactive CMS Manager (`/admin/cms`)**:
  - Admin listing of articles including drafts, published, and archived states.
  - Full article creation, editing, publishing, and unpublishing.
  - Image cover uploads via multipart media endpoint.
  - FAQ manager: Create, edit, reorder, activate/deactivate FAQs.
  - Homepage sections editor and clinic legal policy editor.
- **Staff Management (`/admin/staff`)**:
  - Full staff user list for `OWNER`.
  - Add staff modal with secure role assignment (`ADMIN`, `DOCTOR`, `RECEPTION`, `EDITOR`).
  - Doctor account linkage (`doctorId`) and status toggling (`isActive`).
  - **Last active OWNER protection**: Prevents demoting or deactivating the sole active owner (400 Bad Request).
- **Clinic Settings & Branches (`/admin/settings`)**:
  - General settings: clinic identity, contacts, social links, working hours, timezone (`Asia/Tashkent`), and booking rules (buffer, notice hours, horizon).
  - Branches manager: add and edit clinic branch locations and working hours.
- **Enhanced Calendar (`/admin/calendar`)**:
  - Day, week, and month view navigation with `<` / `Today` / `>` controls.
  - Filters for Doctor (locked for `DOCTOR` role), Branch, Service, and Status.
  - "Yangi qabul" modal to book appointments directly from the admin interface.
  - Reschedule modal with valid date/time picker calling `api.adminRescheduleAppointment`.
  - Modal displays strictly valid status transitions based on current appointment state, including `NO_SHOW` when `CONFIRMED`.
- **Doctors & Services Management**:
  - `/admin/doctors`: Add/edit doctors, set weekly schedules (`api.setDoctorSchedule`), and log leaves/blocked time.
  - `/admin/services`: Add/edit services with validated prices, duration, and categories.
- **Patients & Duplicates**:
  - `/admin/patients`: Treating doctor scoping, formula-safe RFC 4180 CSV export (restricted to `OWNER`), and duplicate detection by phone without automatic merging.

#### Phase 4: Public Detail Pages (COMPLETED & VERIFIED)
- **Doctor Detail (`/doctors/[slug]`)**:
  - Full doctor profile: photo, specialty badges, verified experience, languages, education, bio, affiliated branches, and direct booking CTA.
- **Service Detail (`/services/[slug]`)**:
  - Detailed service description, preparation guidelines, duration, starting price, and list of qualified doctors.
- **Article Detail (`/articles/[slug]`)**:
  - Article cover image, publication date, author badge, formatted blog content, and clinic consultation CTA.
- **Cross-Linking**:
  - Homepage (`/`), Doctors directory (`/doctors`), Services directory (`/services`), and Articles directory (`/articles`) all connect to the respective `/[slug]` detail routes.
  - Dual language support (Uzbek / Russian) preserved across all detail views.

#### Phase 5: Corrected Analytics Engine (COMPLETED & VERIFIED)
- **Accurate Aggregations in `backend/src/analytics/analytics.service.ts`**:
  - Date boundaries converted to `Asia/Tashkent` UTC with exclusive end boundaries (`fromZonedTime`).
  - Unique patients counted once per cohort.
  - New vs. returning patient classification based on actual historical appointment count before the cohort.
  - Doctor utilization computed as booked minutes divided by scheduled working minutes (from `DoctorSchedule` minus breaks) over the date range.
  - Revenue computed from recorded successful `Payment` records minus `refundedAmount`.
  - Privacy: URL path normalization (`/booking/status/[token]`) and sanitization of patient PII and management tokens.

#### Phase 6: Fixed Notifications (COMPLETED & VERIFIED)
- **Atomic Lease Claiming in `backend/src/notifications/notifications.service.ts`**:
  - Background worker claims pending jobs with `SELECT ... FOR UPDATE SKIP LOCKED` and sets `lockedAt` lease.
  - Pre-flight check re-verifies appointment status; cancelled/expired/rescheduled appointments have stale reminders cancelled.
  - Distinguishes `SIMULATED` status for development console sinks from real provider-accepted delivery.
  - Telegram HTTP status and `response.ok` strictly checked.
  - Recipient phone numbers and emails redacted in routine server logs (`+99890***12`, `u***@dentacare.uz`).

#### Phase 7: Auth, Session & CSRF Verification (COMPLETED & VERIFIED)
- **Token Rotation & Replay Revocation**: Tested and verified. Replay of old rotated refresh token immediately revokes user session.
- **Global CSRF Guard**: Bound globally via `{ provide: APP_GUARD, useClass: CsrfGuard }`. Enforces custom header (`X-Requested-With`) or matching `Origin` for cookie mutations.
- **Frontend Safe Refresh**: Shared refresh promise across concurrent 401s, bounded to 1 retry to avoid refresh loops.

#### Phase 8: 3D Tooth Hero Preservation & Mobile Check (COMPLETED & VERIFIED)
- Realistic Three.js anatomical molar (`Tooth3D.tsx`) with 4 occlusal cusps, central fissure, cervical neck, and bifurcated roots.
- Studio 3-point lighting and translucent ivory enamel `MeshPhysicalMaterial`.
- Interactive horizontal/vertical rotation with `touch-pan-y` preserving native vertical page scroll on touchscreens.
- Automatic pause when offscreen (`IntersectionObserver`) or tab is inactive (`visibilitychange`).
- Manual pause/play toggle button and accessibility reduced-motion check.
- High-fidelity SVG poster fallback for loading or WebGL failure.

#### Phase 9: Test Isolation & Comprehensive E2E Verification (COMPLETED & VERIFIED)
- **Dedicated Test Database**: Created isolated `dentacare_test` database.
- **Fail-Closed Security**: Test runner fails closed if `DATABASE_URL` is not recognized as a dedicated test database.
- **Run-Specific Fixtures**: Unique timestamp-based phone prefixes (`+99800${runId}`). Broad phone prefix deletions (`+99890`) eliminated.
- **14/14 Integration Tests Passing (`npm run test:e2e`)**:
  - Regression 1: Health endpoint returns ok and database connection status.
  - Regression 2: Refresh succeeds with CSRF header, rotates tokens, and detects replay.
  - Regression 3: Doctor without linked profile fails closed (403).
  - Regression 4: Doctor A cannot read Doctor B appointment details.
  - Regression 5: Simultaneous overlapping bookings cannot both succeed (one 201, one 409).
  - Regression 6: True concurrent idempotent submissions create one booking, changed payload rejected.
  - Regression 7: Shared family phone does not silently merge different patients.
  - Regression 8: Public reviews require moderation before appearing publicly.
  - Regression 9: Failed rescheduling preserves original slot intact.
  - Regression 10: Cannot confirm an already cancelled appointment.
  - Regression 11: Callback requests persist preferred branch/time and internal notes.
  - Regression 12: Demoting or disabling the last active OWNER is strictly rejected.
  - Regression 13: Doctor scheduling and exception CRUD operates correctly.
  - Regression 14: Analytics overview accurately aggregates database metrics.
- **Production Builds**:
  - Backend: `npm run build:backend` passed with code 0 (`nest build`).
  - Frontend: `npm run build:frontend` passed with code 0 (`next build`, 28/28 routes prerendered).

---

### Verification Summary
| Check | Command | Result |
|---|---|---|
| Backend Type Check & Build | `npm run build:backend` | **PASS (code 0)** |
| Frontend Type Check & Build | `npm run build:frontend` | **PASS (code 0, 28/28 routes)** |
| Dedicated Test Database | `dentacare_test` (PostgreSQL 18) | **CONFIGURED & MIGRATED** |
| Backend E2E Regression Suite | `npm run test:e2e` | **PASS (14/14 passed, 0 failed)** |
