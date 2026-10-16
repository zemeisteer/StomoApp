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
- **Fail-Closed Security**: Test runner validates database name with strict URL parsing, never prints connection credentials in errors, and confirms connected database via `SELECT current_database()` before mutations.
- **Run-Specific Fixtures**: Unique timestamp-based phone prefixes (`+99800${runId}`). Scoped cleanup targeting generated IDs only.
- **19/19 Integration Tests Passing (`npm run test:e2e`)**:
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
  - Regression 15: Media upload validates magic bytes (JPEG/PNG/WebP), rejects SVG, spoofed MIME, oversized files (413/400), and serves with secure headers (`nosniff`, `default-src 'none'`).
  - Regression 16: Idempotency fingerprint binds all fields (service, doctor, branch, start time, name, phone, email, note, consent, scope), rejects altered payload with 409 Conflict, and parallel identical requests yield one booking.
  - Regression 17: Update endpoints enforce runtime validation classes (`PartialType`), validating numeric bounds, URL schemes, and rejecting invalid or unexpected fields.
  - Regression 18: Concurrency-safe owner protection with `pg_advisory_xact_lock` and serializable isolation prevents simultaneous demotions of last active owners.
  - Regression 19: Doctor utilization accurately computes availability, breaks, holidays, partial-day leave, overtime, and includes zero-appointment doctors without silent clamping.
- **Production Builds & Linting**:
  - Backend: `npm run build` passed with code 0 (`nest build`).
  - Backend Lint: `npm run lint` passed with code 0 (`eslint`).
  - Frontend: `npm run build` passed with code 0 (`next build`, 28/28 routes prerendered).
  - Frontend Lint: `npm run lint` passed with code 0 (`next lint`).

#### Phase 10: Historical Data, Transactional Consistency, Outbox & Browser Verification (COMPLETED & VERIFIED)
- **Historical Buffer & Revision Forward Migration**:
  - Migration `backend/prisma/migrations/20261015121500_backfill_historical_buffers_and_revisions` safely applied to development (`dentacare`) and test (`dentacare_test`) databases.
  - Derives `buffer_minutes = ROUND(EXTRACT(EPOCH FROM (end_time - start_time)) / 60)::integer - duration_minutes` where reliable (0..120 mins).
  - Backfills `notification_jobs.appointment_revision` from `Appointment.revision`.
  - Preserves duration and buffer snapshot on reschedule even if clinic settings change.
- **Consistent & Transactional Scheduling**:
  - `SchedulingService.isDoctorWorkingAt` and `isTimeSlotAvailable` accept transaction client `tx?: Prisma.TransactionClient | PrismaService`.
  - Schedule and exception mutations wrapped in transactions with `pg_advisory_xact_lock`.
  - Adding blocked/leave periods checks active bookings (`PENDING`, `CONFIRMED`, `CHECKED_IN`) and returns 409 Conflict.
  - Deterministic exception precedence (Weekly -> Breaks -> Overtime -> Blocked -> Leaves/Holidays).
  - Overtime supported on days without regular weekly schedules.
- **Legacy Idempotency Safety**:
  - Strict policy for legacy idempotency keys: unverifiable reuse without fingerprints is rejected with 409 Conflict.
  - Sorted canonical JSON serialization for request fingerprints.
  - Identical payloads produce a single booking; altered payloads return 409 Conflict.
  - Handled atomically in PostgreSQL advisory locks and P2002 unique constraint recovery.
- **Transactional Notification Outbox**:
  - Booking, confirmation, reschedule, and cancellation notification intents persisted transactionally inside the same transaction as appointment mutations.
  - Worker lease re-check (`status = PROCESSING AND lease_token = :token`) before delivery initiation prevents workers that lost their lease from sending messages.
  - Bounded 5s timeouts on external channels.
  - Stale reminder cancellation policy matching appointment revision.
- **Analytics Calculations**:
  - Removed early `continue` on empty `daySchedules` in `analytics.service.ts` to count overtime-only days.
  - Enforced deterministic exception precedence and UTC date enumeration.
  - Added `totalBufferMinutes` and `totalOccupiedMinutes` metrics.
- **Hardened Regression Suite (21/21 passed, 0 failed)**:
  - Regression 6: True concurrent `Promise.all` submissions, identical returns 201, changed returns 409.
  - Regression 18: Two active owners, concurrent demotions, exactly 1 owner strictly remains.
  - Regression 19: Isolated fixture doctor with exact date-level available minute calculations.
  - Regression 20: Buffer preservation on reschedule.
  - Regression 21: Transactional outbox notification intent persistence and reminder lifecycle.
- **Automated Browser Verification**:
  - Local Chrome `puppeteer-core` automation executed across desktop (1440px), tablet (768px), and mobile (390px).
  - Verified connected visitor booking flow -> admin calendar appearance -> analytics dashboard.
  - 12 high-resolution screenshots saved to artifact directory:
    - `desktop_homepage.png`
    - `desktop_booking_slot.png`
    - `desktop_booking_form.png`
    - `desktop_booking_confirmation.png`
    - `desktop_admin_login.png`
    - `desktop_admin_calendar.png`
    - `desktop_admin_analytics.png`
    - `desktop_admin_cms.png`
    - `mobile_homepage.png`
    - `mobile_booking.png`
    - `mobile_admin_calendar.png`
    - `tablet_homepage.png`


---

#### Phase 11: Multi-Service Booking Architecture, Server-Authoritative Duration, Persistence, Idempotency & Localization (COMPLETED & VERIFIED)
- **Server-Authoritative Duration**:
  - Removed `customDurationMinutes` and public control over appointment duration in `appointments.controller.ts` and `scheduling.controller.ts`.
  - Backend derives authoritative duration: sum of doctor-specific durations from `DoctorService.customDurationMinutes` or fallback `Service.durationMinutes` + buffer added exactly once per appointment (`calculateAuthoritativeServiceDuration`).
  - Added bounded staff override `PATCH /admin/appointments/:id/duration` (5 to 480 minutes) with reason and audit log.
  - Reject invalid slot query parameters with `QuerySlotsDto`.
  - Authoritative duration and price metadata returned from `GET /api/scheduling/slots`.
- **Strict Multi-Service Contract (1–3 Unique Services)**:
  - Validates 1 to 3 unique active services via `resolveServiceIds`.
  - Ensures doctor provides every selected service and is assigned to the selected branch.
  - Re-evaluates eligibility inside serializable database transaction with advisory lock.
  - Consistent combinations accepted by both `/api/scheduling/slots` and `/api/booking`.
- **Persistence & Historical Forward Migration**:
  - Defined `AppointmentServiceItem` model in `schema.prisma` with service snapshots (`serviceNameUz`, `serviceNameRu`, `durationMinutes`, `priceFrom`, `sortOrder`).
  - Created forward migration `20261015150000_appointment_service_items` without resetting database. Historical appointments preserved and backfilled.
  - Unified serializer (`serializeAppointmentResponse`) for consistent response structures across booking, admin calendar, status lookup, and rescheduling.
  - Service analytics counts individual `AppointmentServiceItem` entries without double-counting appointment totals or presenting estimates as collected revenue.
- **Full Cryptographic Idempotency**:
  - Request fingerprint binds sorted `serviceIds` and all request parameters.
  - Verified across all 4 return paths: initial lookup, retry-loop lookup, locked lookup, and `P2002` race recovery.
  - Frontend generates stable UUID v4 idempotency keys, reuses on retry, and generates a new key when booking parameters change.
- **Schedule Honesty & Date Handling**:
  - Removed fake Mon/Wed/Fri fallback and cross-branch schedules in `frontend/src/app/booking/page.tsx`.
  - Pure calendar dates constructed at noon UTC (`Date.UTC(y, m - 1, d, 12, 0, 0)`) to prevent date shifting in `Asia/Tashkent`.
  - Cascading selection resets (branch -> service -> doctor -> slot) with generation counter to prevent race conditions.
  - 409 conflict handling preserves patient details and prompts for a new slot.
  - Strict phone formatting (`+998` followed by 9 digits) across booking and callback forms.
  - Full Uzbek and Russian translations for multi-service hints, limits, conflict notices, and item breakdowns.

---

### Verification Summary

#### Tests Executed Before Multi-Service Commit (Base Regressions 1–21)
| Test | Description | Result |
|---|---|---|
| Regression 1 | Health endpoint returns ok and database connection status | **PASS** |
| Regression 2 | Refresh succeeds with CSRF header, rotates tokens, and detects replay | **PASS** |
| Regression 3 | Doctor without linked profile fails closed (403) | **PASS** |
| Regression 4 | Doctor A cannot read Doctor B appointment details | **PASS** |
| Regression 5 | Simultaneous overlapping bookings cannot both succeed (one 201, one 409) | **PASS** |
| Regression 6 | True concurrent idempotent submissions create one booking, changed payload rejected | **PASS** |
| Regression 7 | Shared family phone does not silently merge different patients | **PASS** |
| Regression 8 | Public reviews require moderation before appearing publicly | **PASS** |
| Regression 9 | Failed rescheduling preserves original slot intact | **PASS** |
| Regression 10 | Cannot confirm an already cancelled appointment | **PASS** |
| Regression 11 | Callback requests persist preferred branch/time and internal notes | **PASS** |
| Regression 12 | Demoting or disabling the last active OWNER is strictly rejected | **PASS** |
| Regression 13 | Doctor scheduling and exception CRUD operates correctly | **PASS** |
| Regression 14 | Analytics overview accurately aggregates database metrics | **PASS** |
| Regression 15 | Media upload validates magic bytes (JPEG/PNG/WebP), rejects SVG, spoofed MIME | **PASS** |
| Regression 16 | Idempotency fingerprint binds all fields, rejects altered payload with 409 | **PASS** |
| Regression 17 | Update endpoints enforce runtime validation classes and reject unexpected fields | **PASS** |
| Regression 18 | Concurrency-safe owner protection prevents simultaneous demotions of last active owners | **PASS** |
| Regression 19 | Doctor utilization accurately computes availability, breaks, holidays, overtime | **PASS** |
| Regression 20 | Historical buffer preservation on reschedule | **PASS** |
| Regression 21 | Transactional outbox notification intent persistence | **PASS** |

#### Tests Executed After Multi-Service Fixes (Multi-Service Regressions 22–31)
| Test | Description | Result |
|---|---|---|
| Regression 22 | Two-service booking creates exact duration and price snapshots in `AppointmentServiceItem` and totals | **PASS** |
| Regression 23 | Doctor-specific durations are server-authoritative and override service defaults | **PASS** |
| Regression 24 | Unauthorized second service not provided by doctor is rejected with 400 | **PASS** |
| Regression 25 | Missing, inactive, duplicate, and excessive service selections are rejected | **PASS** |
| Regression 26 | Attempts to alter duration via public API are rejected; staff override supported with bounds & audit | **PASS** |
| Regression 27 | Slot availability matches booking creation duration and buffer | **PASS** |
| Regression 28 | Multi-service rescheduling preserves snapshots and validates all services | **PASS** |
| Regression 29 | Idempotency binds full canonical service selection and rejects changed secondary services | **PASS** |
| Regression 30 | Historical single-service appointments are preserved and backfilled into service items | **PASS** |
| Regression 31 | Service analytics accurately count service items without double-counting appointments or estimated prices | **PASS** |

#### Tests Executed for Consistency, Overrides, Rescheduling & Schedule Accuracy (Regressions 32–36)
| Test | Description | Result |
|---|---|---|
| Regression 32 | Concurrency: Service duration change during transaction recomputes consistent end time and items | **PASS** |
| Regression 33 | Duration override safely locks row, rejects terminal appointments, and detects overlap collisions | **PASS** |
| Regression 34 | Reminder preservation after duration override keeps valid reminder job with matched revision | **PASS** |
| Regression 35 | Appointment-aware availability uses stored appointment duration/buffer and excludes self from overlap | **PASS** |
| Regression 36 | Doctor schedule accuracy: handles different weekday hours, lunch breaks, and overtime-only dates correctly | **PASS** |

#### Overall Build & Verification Status
| Check | Command | Result |
|---|---|---|
| Forward Migration (Repair Historical Items) | Applied to `dentacare` & `dentacare_test` | **APPLIED (`20261015170000_repair_historical_service_items`)** |
| Backend Build | `npm run build` | **PASS (code 0)** |
| Backend ESLint | `npm run lint` | **PASS (code 0, 0 errors, 0 warnings)** |
| Frontend Build | `npm run build` | **PASS (code 0, 28/28 routes prerendered)** |
| Frontend ESLint | `npm run lint` | **PASS (code 0, 0 errors)** |
| Dedicated Test Database | `dentacare_test` (PostgreSQL 18) | **CONFIGURED & MIGRATED** |
| Full E2E Test Suite | `npm run test:e2e` | **PASS (36/36 passed, 0 failed in 17.7s)** |
| Live Dev Servers | Backend (:4000) & Frontend (:3000) | **HEALTHY & RESPONDING (HTTP 200)** |
| Comprehensive Browser Verification | `node test/browser-workflow.js` | **PASS (All 12 browser workflows and screenshots generated)** |

### Remaining Limitations & Honest Blockers
1. **Third-Party External Notification Gateways (Eskiz SMS & Telegram Bot)**:
   - Real-world production SMS delivery requires valid Eskiz.uz credentials (`ESKIZ_EMAIL`, `ESKIZ_PASSWORD`).
   - Real-world Telegram broadcasting requires an active `TELEGRAM_BOT_TOKEN` and configured `TELEGRAM_ADMIN_CHAT_ID`.
   - In development/testing, console sinks and simulated states are used to guarantee zero unwanted patient message dispatch while exercising the outbox queue and lease protocol.
2. **WebGL / 3D Canvas in Headless Environments**:
   - In headless environments without hardware GPU acceleration, Three.js falls back to the clean procedural SVG poster fallback as designed. In real Google Chrome with hardware acceleration, the 3D interactive molar tooth renders with full touch-pan-y orbit controls.
3. **Playwright Driver in Local Sandbox**:
   - Automated browser subagent launch encountered a 404 driver download restriction from AzureEdge in the current restricted network environment; comprehensive real browser verification was executed directly via local Google Chrome (`puppeteer-core`) across Desktop (1440px), Tablet (768px), and Mobile (390px).


