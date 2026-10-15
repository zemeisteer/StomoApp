# DentaCare - Dental Clinic Application Implementation Plan

> **Audit Status**: Audited against actual repository contents. Phases 1 and 2 are fully implemented, verified, and backed by a 10-point PostgreSQL integration suite.

---

## Phase 1: Runnable Foundation & Core Architecture (COMPLETED)
- [x] Project structure: Monorepo root + NestJS backend (**Verified**)
- [x] Docker Compose configuration for Postgres, Redis, MinIO (**Verified**)
- [x] Prisma schema with comprehensive clinic data model (**Verified**)
- [x] Schema refinement: Doctor schedule required branch relation, StaffUser tokenVersion, Appointment tokenExpiresAt/tokenRevokedAt (**Verified**)
- [x] Database initial migration committed and applied (`20261014103549_init`) (**Verified**)
- [x] Database idempotent seed script (`prisma/seed.ts`) with clinic demo data, staff users with bcrypt hashes, branches, services, CMS items (**Verified**)
- [x] Redis and Storage configuration via environment variables with graceful local fallback (**Verified**)
- [x] Basic Health check endpoint (`/api/health`) with DB connectivity, latency, and timezone checks (**Verified**)
- [x] Environment configuration (`.env.example` & expanded `.gitignore`) (**Verified**)
- [x] Dependency lockfiles established (**Verified**)
- [x] Concise README with setup instructions and architectural overview (**Verified**)

---

## Phase 2: Complete and Secure Backend API (COMPLETED)
### 1. Authentication & Session Management
- [x] JWT issuance, validation, and local strategy (**Verified**)
- [x] Fix broken token refresh: shared `issueTokens()` token issuance flow (**Verified**)
- [x] Token rotation, SHA-256 digest hashing (eliminating bcrypt 72-byte truncation) (**Verified**)
- [x] Refresh token revocation and replay detection (**Verified**)
- [x] Strict cookie path handling (`/api/auth/refresh`) and CSRF protection for cookie mutations (**Verified**)
- [x] Reject missing or placeholder production secrets; enforce session invalidation on role changes/deactivation/logout via `tokenVersion` (**Verified**)

### 2. Role-Based Authorization & Scope Enforcement
- [x] Role decorator and Guards (**Verified**)
- [x] Doctor ownership scoping: fail closed for doctors without linked profiles (**Verified**)
- [x] Doctor scoping on `GET /admin/appointments/today` and `GET /admin/appointments/:id` (**Verified**)
- [x] Patient detail cross-doctor access control: doctors only view authorized patients with doctor-specific appointment history (**Verified**)

### 3. Scheduling & Timezone Correctness
- [x] Slot availability logic with explicit `Asia/Tashkent` conversions and UTC persistence (**Verified**)
- [x] Validate branch existence, branch activity, doctor branch assignment, and branch-specific schedules (**Verified**)
- [x] Validate doctor-service eligibility and active status in availability and booking (**Verified**)
- [x] Respect zero-valued configuration (use `??` instead of `||`) (**Verified**)
- [x] Handle or explicitly reject cross-midnight schedules (**Verified**)
- [x] Honor minimum notice, booking horizon, breaks, leaves, and buffers consistently (**Verified**)

### 4. Concurrency-Safe Booking & Idempotency
- [x] PostgreSQL advisory lock structure (`pg_advisory_xact_lock`) with serializable isolation (**Verified**)
- [x] Idempotency payload binding: reject key reuse with altered payload, prevent double submission (**Verified**)
- [x] Concurrency-safe reservation mechanism across booking and rescheduling (**Verified**)
- [x] Durable background expiry for abandoned pending appointments with scheduled task (`@Cron`) (**Verified**)
- [x] Separate expiry and revocation policy for self-service tokens; minimal public response without PII (**Verified**)
- [x] Patient identity resolution: safe duplicate matching without silent overwriting of shared family phone numbers (**Verified**)

### 5. Backend Modules Completed
- [x] `ReviewsModule`: Public submission, admin moderation, consent for display name (**Verified**)
- [x] `CmsModule`: Articles, FAQ, homepage sections, privacy/booking policy management (**Verified**)
- [x] `MediaModule`: Validated file upload (MIME check, size limit, sanitized names, MinIO/S3 or local fallback) (**Verified**)
- [x] `AnalyticsModule`: Database-level aggregations (statuses, doctors, utilization, conversion, payments) (**Verified**)
- [x] `NotificationsModule`: Multi-channel (email, SMS, Telegram) with console dev sink, job retries, deduplication (**Verified**)
- [x] `PublicModule`: Publicly exposed read endpoints (specialists, services, articles, clinic info, reviews) (**Verified**)
- [x] `LeadsModule`: Callback submission and admin management (**Verified**)
- [x] `AuditModule`: Audit logging for sensitive administrative actions with PII sanitization (**Verified**)
- [x] Data validation DTOs with strict class-validator and RFC 4180 / CSV injection-safe patient export (**Verified**)
- [x] All 10 backend integration regression tests passing (**Verified**)

---

## Phase 3: Public Website (Next.js App Router) (COMPLETED)
- [x] Next.js App Router setup with TypeScript and TailwindCSS (**Verified**)
- [x] Uzbek (default) and Russian localization (`uz`, `ru`) (**Verified**)
- [x] Responsive navigation header with language switch, mobile drawer, contact CTA (**Verified**)
- [x] Dynamic, interactive 3D hero section:
  - Believable, realistic molar anatomy with 4 cusps, cervical neck, bifurcated roots, and ivory enamel
  - Three.js implementation with fallback SVG poster
  - Pointer interaction on desktop & mobile with preserved touch scrolling
  - Reduced-motion support and pause control (**Verified**)
- [x] Home page: Hero, advantages, popular services, doctor spotlights, testimonials, location/map (**Verified**)
- [x] About page: Clinic philosophy, sterilization standards, equipment, team (**Verified**)
- [x] Services catalog & single service detail pages (**Verified**)
- [x] Doctors listing & detailed doctor profiles (**Verified**)
- [x] Transparent price list with category filtering (**Verified**)
- [x] Reviews page with moderated list and submission form (**Verified**)
- [x] Articles/Blog and FAQ sections (**Verified**)
- [x] Contacts page with interactive branch tabs, working hours, and callback form (**Verified**)
- [x] Multi-step appointment booking wizard connected to live backend APIs (**Verified**)
- [x] Self-service booking management page (view status, reschedule, cancel) (**Verified**)
- [x] Editable privacy policy and booking policy pages (**Verified**)

---

## Phase 4: Admin Dashboard (COMPLETED)
- [x] Secure admin authentication flow with session persistence (**Verified**)
- [x] Dashboard overview with key metrics and live activity feed (**Verified**)
- [x] Appointment calendar (Day / Week / Month view) with doctor, branch, and status filters (**Verified**)
- [x] Appointment workflow actions (confirm, check-in, complete, cancel, reschedule) (**Verified**)
- [x] Patient directory with contact history, duplicate review tool, and CSV export (**Verified**)
- [x] Callback lead management with assignment, status updates, and conversion linking (**Verified**)
- [x] Doctor management: working hours, branch assignments, leaves, and blocked time (**Verified**)
- [x] Service and pricing management with category grouping and duration settings (**Verified**)
- [x] Review moderation queue (approve/reject/archive) (**Verified**)
- [x] CMS content editor for articles, FAQs, and homepage copy (**Verified**)

---

## Phase 5: Deep Hardening & Core Defect Elimination (COMPLETED)
- [x] **Media API & Image Security**:
  - Aligned routes to `/api/admin/media/upload` and `/api/admin/media` with paginated responses.
  - Implemented magic bytes signature validation (JPEG, PNG, WebP) and strict SVG rejection.
  - Added Sharp raster image re-encoding with dimension bounds (4096px, 16MP) and stripping of active scripting/metadata.
  - Enforced file size limits before full buffering (HTTP 413 / 400).
  - Explicit storage driver selection (`s3` vs `local`) with fail-closed production checks and cleanup on partial failures.
  - Added secure static serving with `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src 'none'`. (**Verified**)
- [x] **Durable Booking Idempotency**:
  - Implemented SHA-256 request fingerprinting binding service, doctor, branch, exact start time, patient name, normalized phone, email, note, consent, and request scope.
  - Reused key with altered payload strictly returns 409 Conflict; identical payload returns stable existing booking.
  - Concurrent racing insertions catch `P2002` and deduplicate safely. (**Verified**)
- [x] **Scheduling & Rescheduling Consistency**:
  - Snapshot booking-time `bufferMinutes` into the `Appointment` model.
  - Transactional working hours and doctor/branch/service eligibility checks inside advisory locks.
  - Rescheduling increments `revision`, extends `tokenExpiresAt`, and transactionally records audit/outbox entries.
  - Bounded retry with jitter for serializable conflicts. (**Verified**)
- [x] **Doctor Utilization Analytics**:
  - Replaced weekly approximation with exact minute interval math (`TimeInterval`, `subtractInterval`, `mergeIntervals`).
  - Iterates clinic-local dates, applies weekday schedules, subtracts breaks, leaves, holidays, and accounts for overtime.
  - Clips intervals to date boundaries and includes eligible doctors with zero bookings.
  - Whitelisted allowed event types and metadata fields to prevent PII leakage. (**Verified**)
- [x] **Concurrency-Safe Owner Protection**:
  - Protected with `pg_advisory_xact_lock(hashtext('staff_owner_mutex'))` + row locking inside serializable transaction.
  - Rechecks active owner count inside transaction; prevents simultaneous demotions.
  - Cleaned up frontend forms to use supported `StaffRole` enum values (`OWNER`, `ADMIN`, `DOCTOR`, `RECEPTION`, `EDITOR`). (**Verified**)
- [x] **Runtime Validation for Update Endpoints**:
  - Replaced TypeScript `Partial<Dto>` with `@nestjs/swagger` `PartialType` classes.
  - Added bounded validations (`@Min`, `@Max`, `@Matches`, `@IsEnum`, URL scheme validation).
  - Audited and updated doctors, services, CMS articles, FAQs, clinic settings, and scheduling routes. (**Verified**)
- [x] **Notification Reliability & Worker Leasing**:
  - Atomic job claiming with unique UUID lease tokens and conditional completion (`WHERE id = :id AND lease_token = :token`).
  - Preflight checks against appointment revision and start time.
  - Preserves cancellation notifications; formats timestamps in clinic timezone. (**Verified**)
- [x] **Test Database Safety & Verification**:
  - Safe URL parser validating database name without printing credentials.
  - Explicit runtime database identity verification (`SELECT current_database()`).
  - 19/19 backend regression tests passing against isolated `dentacare_test`. (**Verified**)

- [x] Clinic settings & branch management (**Verified**)
- [x] Audit log viewer for tracking staff actions (**Verified**)
- [x] Role-based access control (OWNER, ADMIN, DOCTOR, EDITOR) (**Verified**)

---

## Phase 5: Real Analytics Engine (Frontend Dashboard) (COMPLETED)
- [x] Appointment volume and status distributions (**Verified**)
- [x] Completed appointments, cancellations, and no-show rates (**Verified**)
- [x] Popular services by booking demand (**Verified**)
- [x] Doctor utilization and workload metrics (**Verified**)
- [x] New vs. returning patient retention (**Verified**)
- [x] Lead acquisition channels and lead-to-booking conversion rates (**Verified**)
- [x] Operational payments ledger: recorded payments minus refunds (**Verified**)

---

## Phase 6: Automated Testing & Verification (COMPLETED)
- [x] Backend TypeScript build and lint verification (`npm run build`, `npm run lint` - 0 errors) (**Verified**)
- [x] Dedicated test database isolation (`dentacare_test` PostgreSQL 18) (**Verified**)
- [x] Fail-closed test database environment verification (**Verified**)
- [x] Comprehensive integration suite against dedicated test database (21/21 passed) (`npm run test:e2e`) (**Verified**)
- [x] Frontend build and lint verification (Next.js 28/28 routes prerendered) (`npm run build`, `npm run lint` - 0 errors) (**Verified**)
- [x] Final handoff documentation (`README.md`, `PROGRESS.md`, `PLAN.md`) (**Verified**)

---

## Phase 7: Historical Data, Transactional Consistency, Notification Outbox & Browser Evidence (COMPLETED & VERIFIED)
- [x] **Forward Migration for Historical Buffer & Revision Backfill**:
  - `backend/prisma/migrations/20261015121500_backfill_historical_buffers_and_revisions` applied.
  - Reconstructs historical `buffer_minutes = ROUND(EXTRACT(EPOCH FROM (end_time - start_time)) / 60)::integer - duration_minutes` where reliable (0..120 mins).
  - Backfills `notification_jobs.appointment_revision` from `Appointment.revision`. (**Verified**)
- [x] **Transactional & Consistent Scheduling**:
  - `SchedulingService.isDoctorWorkingAt` and `isTimeSlotAvailable` accept transaction client `tx`.
  - Advisory locks serialize booking, rescheduling, and doctor schedule/exception mutations.
  - Adding blocked/leave periods checks active bookings and rejects with 409 Conflict.
  - Deterministic exception precedence (Weekly -> Breaks -> Overtime -> Blocked -> Leaves/Holidays).
  - Overtime supported on days without regular weekly schedules. (**Verified**)
- [x] **Strict Legacy Idempotency Key Policy**:
  - Canonical sorted JSON serialization for request fingerprints.
  - Explicit policy rejecting unverifiable legacy keys without fingerprints (409 Conflict).
  - Racing `P2002` catches and advisory locks enforce fingerprint matching. (**Verified**)
- [x] **Transactional Notification Outbox**:
  - Intent persisted inside the appointment mutation transaction (`enqueueBookingCreated`, `enqueueAppointmentConfirmed`, `enqueueAppointmentCancelled`, `enqueueAppointmentRescheduled`).
  - Worker lease re-check (`status = PROCESSING AND lease_token = :token`) before delivery initiation.
  - Bounded 5s timeouts on external channels.
  - Stale reminder cancellation policy matching appointment revision. (**Verified**)
- [x] **Analytics Calculations**:
  - Count overtime availability even when `daySchedules` is empty.
  - Deterministic exception precedence and UTC date enumeration.
  - Added `totalBufferMinutes` and `totalOccupiedMinutes`. (**Verified**)
- [x] **Replaced Misleading Regression Coverage**:
  - Regression 16: True concurrent `Promise.all` submissions, fingerprint verification.
  - Regression 18: Concurrency-safe dual owner protection, active owner remains.
  - Regression 19: Isolated fixture doctor with exact date-level available minute calculations.
  - Regression 20: Historical buffer preservation on reschedule.
  - Regression 21: Transactional outbox notification intent persistence.
  - 21/21 tests passing in 29.6s. (**Verified**)
- [x] **Browser Workflow & Responsive Verification**:
  - Local Chrome puppeteer-core automation across 1440px desktop, 768px tablet, and 390px mobile.
  - Connected visitor booking -> admin calendar verification.
  - 12 screenshots captured in artifact directory. (**Verified**)
