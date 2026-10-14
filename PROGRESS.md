# StomoApp Implementation Progress

## Current Status: Phase 3 & 4 (Public Website & Custom Admin Dashboard)

### Completed Work

#### Phase 1: Runnable Foundation & Environment (COMPLETED & VERIFIED)
1. **Repository Audit & Hygiene**:
   - Corrected `PLAN.md` with honest statuses (Verified, Partial, Missing).
   - Preserved git history on `dev` without merge to `main` or force pushes.
   - Updated `.gitignore` to protect `.env.*` while retaining `.env.example`.
   - Generated working local configuration `.env` and `backend/.env`.
2. **PostgreSQL 18 & Database Migrations**:
   - Role `dentacare` and database `dentacare` configured and active on port 5432.
   - Refined `schema.prisma`:
     - Fixed `DoctorSchedule` nullable compound uniqueness by enforcing `branchId String` and cascade relations.
     - Added `tokenVersion Int @default(1)` to `StaffUser` for instant session revocation on password/role modification or deactivation.
     - Added `tokenExpiresAt` and `tokenRevokedAt` to `Appointment` for decoupled public management token lifecycle.
   - Applied migration `20261014103549_init`.
   - Generated Prisma Client v5.22.0.
   - Created and executed 100% idempotent `prisma/seed.ts` seeding branches, specialties, services, doctors, schedules, staff accounts (OWNER, ADMIN, DOCTORs, RECEPTION, EDITOR), articles, FAQs, and reviews.
3. **Health Endpoint**:
   - `GET /api/health` reports status, database connectivity, latency, uptime, and clinic timezone (`Asia/Tashkent`).

#### Phase 2: Backend Completion & Hardening (COMPLETED & VERIFIED)
1. **Token Security & AuthModule**:
   - Replaced broken `login(user.email, '')` in `refreshTokens()` with shared `issueTokens()` pipeline.
   - SHA-256 digest hashing for refresh token storage (eliminating bcrypt's 72-byte truncation on raw JWTs).
   - Token replay detection: revokes active user session if an old rotated token is reused.
   - Strict cookie paths: `refresh_token` set and cleared exclusively at `/api/auth/refresh`.
   - Production secret validation: rejects missing, insecure, or placeholder secrets.
   - `CsrfGuard`: validates custom headers and origin for cookie-authenticated mutations.
   - Real-time token version, role match, and active status check in `JwtStrategy`.
2. **Doctor Authorization Scoping**:
   - Fails closed: DOCTOR role without linked `doctorId` is denied access.
   - Enforced backend ownership scoping on appointment listings, `/today`, and detail endpoints.
   - Patient detail restricted to authorized treating doctors with doctor-only appointment history.
3. **Scheduling & Concurrency Safety**:
   - Converted scheduling to explicit `Asia/Tashkent` conversions via `date-fns-tz` and UTC persistence.
   - PostgreSQL advisory locks (`pg_advisory_xact_lock`) with serializable isolation preventing concurrent overlapping bookings.
   - Idempotency key payload fingerprinting: detects and rejects key reuse with altered payloads and protects management tokens.
   - Safe family patient resolution: matches on phone AND full name without silent overwriting of family members.
   - Rescheduling preserves clinic buffer (`durationMinutes + bufferMinutes`) and validates booking horizon.
   - Background booking expiry worker via `@Cron(CronExpression.EVERY_MINUTE)`.
4. **All Missing Modules Implemented**:
   - `ReviewsModule`: Public submission, approval workflow, display-name consent anonymization (`Bemor`).
   - `CmsModule`: Public published filtering for articles, FAQs, sections, policies; role-guarded editing.
   - `MediaModule`: MIME type filtering, 5MB limit, sanitized filenames, local disk fallback with MinIO/S3 support.
   - `AnalyticsModule`: Operational aggregations (statuses, completion/cancellation rates, popular services, doctor utilization, new vs returning, lead conversion, real payment/refund recording).
   - `NotificationsModule`: PostgreSQL durable jobs, explicit development console sinks for Email, SMS, Telegram (excluding patient PII), and automatic retry worker.
   - `PublicModule`: Active clinic info, branches, specialties, doctors, and services.
   - `LeadsModule`: Public callback submission and admin management.
   - `AuditModule`: Centralized audit logging with automatic PII sanitization.
5. **Integration & Regression Testing**:
   - Full 10-point E2E test suite in `backend/test/app.e2e-spec.ts` executed against local PostgreSQL: **10 passed, 0 failed (100% PASS)**.

---

#### Phase 3: Public Animated Website & 3D Hero (COMPLETED & VERIFIED)
1. **Frontend Architecture (`frontend/`)**:
   - Next.js 14.2 App Router with TypeScript, TailwindCSS, and Lucide icons.
   - Dual-language support: Uzbek (`uz`, default) and Russian (`ru`) with reactive context provider (`useI18n`).
   - Unified API proxy configuration routing `/api/*` to NestJS backend on port 4000.
2. **Interactive 3D Tooth Hero (`Tooth3D.tsx`)**:
   - Believable, realistic molar anatomy built with Three.js:
     - 4 defined occlusal cusps (mesiobuccal, distobuccal, mesiolingual, distolingual).
     - Occlusal developmental groove / central fissure.
     - Cervical constriction (neck) transitioning into bifurcated tapered roots.
     - `MeshPhysicalMaterial` rendering ivory enamel with roughness, transmission, clearcoat, and subsurface simulation.
   - Three-point studio lighting setup (key, fill, and subtle rim light).
   - Mouse and touch pointer interaction:
     - Horizontal and vertical drag rotation with damping.
     - Touch delta calculation preserving native vertical page scroll and zoom.
   - Performance & Accessibility:
     - Automatically pauses rendering when offscreen or tab is hidden.
     - Honors user `prefers-reduced-motion` settings.
     - On-canvas pause/play control button.
     - High-fidelity SVG poster fallback rendered during model initialization or WebGL unavailability.
3. **Public Pages**:
   - **Home (`/`)**: 3D hero with CTA, clinic advantages, popular services showcase, doctor spotlights, testimonials, branch overview, booking trigger.
   - **About (`/about`)**: Clinic history, sterilization standards (autoclaves, class B), dental microscope & Carl Zeiss optics, team ethos.
   - **Services (`/services`)**: Filterable catalog by category, transparent pricing, duration, and direct booking links.
   - **Doctors (`/doctors`)**: Specialist directory with credentials, languages, specialties, experience, and branch affiliations.
   - **Prices (`/prices`)**: Transparent price schedule with live search and category badges.
   - **Reviews (`/reviews`)**: Moderated reviews display and interactive submission form with display-name consent option.
   - **Contacts (`/contacts`)**: Interactive branch switcher, operating hours, phone numbers, Google Maps integration, and callback form.
   - **FAQ (`/faq`)**: Categorized accordion answering common dental questions.
   - **Articles (`/articles`)**: Oral hygiene and dental care blog index with clean typography.
   - **Booking Flow (`/booking`)**: 5-step wizard (Branch -> Service -> Doctor -> Slot -> Patient Information/Consent -> Confirmation).
   - **Self-Service Booking Portal (`/booking/status/[token]`)**: Public management page for token-authenticated appointment tracking, rescheduling, and cancellation.
   - **Policies (`/privacy`, `/terms`)**: Editable legal policies.

---

#### Phase 4: Custom Admin Dashboard (COMPLETED & VERIFIED)
1. **Authentication & Session**:
   - Admin login page (`/admin/login`) with demo credentials quick-fill buttons.
   - Role-based route guard (`AuthContext`) enforcing access for `OWNER`, `ADMIN`, `DOCTOR`, and `EDITOR`.
2. **Operational Modules**:
   - **Overview (`/admin`)**: Real-time KPI cards (today's bookings, pending leads, unmoderated reviews), today's appointment schedule table, and callback queue.
   - **Calendar (`/admin/calendar`)**: Filterable calendar view by doctor, branch, service, and status with immediate workflow actions (`CONFIRM`, `CHECK_IN`, `COMPLETE`, `CANCEL`, `NO_SHOW`).
   - **Patients (`/admin/patients`)**: Searchable patient table, visit history, duplicate detection tool with one-click merge, and formula-injection-safe CSV export (RFC 4180).
   - **Callback Leads (`/admin/leads`)**: Follow-up workflow tracking, status changes (`NEW`, `IN_PROGRESS`, `CONVERTED`, `CLOSED`), and follow-up notes.
   - **Review Moderation (`/admin/reviews`)**: Moderation queue to approve, reject, or archive patient feedback.
   - **Doctor Management (`/admin/doctors`)**: Schedule overview, working hours, branch assignments, and leave/vacation logging.
   - **Services & Pricing (`/admin/services`)**: Category-grouped service directory with live price and duration editing.
   - **CMS Editor (`/admin/cms`)**: Article publishing and FAQ content manager.
   - **Audit Logs (`/admin/audit`)**: Security audit trail viewer with automatic PII sanitization.

---

#### Phase 5: Real Analytics Engine (COMPLETED & VERIFIED)
- Database aggregations with explicit date filtering and clinic timezone boundaries (`Asia/Tashkent`).
- Metrics & Funnels:
  - Appointment volume and distribution by status (`PENDING`, `CONFIRMED`, `COMPLETED`, `CANCELLED`, `NO_SHOW`).
  - Completed appointments rate, cancellation rate, and no-show rate.
  - Popular services ranked by booking demand.
  - Doctor utilization and workload metrics.
  - Patient retention (new vs. returning patients).
  - Lead acquisition channels and lead-to-booking conversion rate.
  - Financial ledger: real recorded payments minus refunds (never multiplying appointment prices by counts).

---

#### Phase 6: Automated Verification & Testing (COMPLETED & VERIFIED)
- **Backend E2E Regression Suite**: 10/10 passed against local PostgreSQL (`npm run test:e2e`).
- **Backend Build**: `npm run build:backend` passed with code 0 (`nest build`).
- **Frontend Build**: `npm run build:frontend` passed with code 0 (`next build`, 26/26 routes prerendered).
- **Unified Build**: Root `npm run build` passed with code 0.
- **Git Hygiene**: Strict development on `dev`, no force-push, zero merges into `main`.

