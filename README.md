# DentaCare — Dental Clinic Management Application (StomoApp)

A full-stack, enterprise-grade dental clinic web application built with a modern animated public portal, an interactive 3D hero visualization, an online booking system, and a comprehensive role-based administrative dashboard.

---

## 🌟 Key Features

### 🌐 Public Website (`frontend/`)
- **Interactive 3D Tooth Hero**: Believable anatomical molar featuring 4 occlusal cusps, central developmental groove, cervical margin, and dual bifurcated tapered roots. Implemented using Three.js / React Three Fiber with realistic ivory enamel translucency (`MeshPhysicalMaterial`), studio lighting, interactive drag rotation preserving native vertical touch scrolling, reduced-motion pause, and SVG fallback poster.
- **Multilingual Support**: Full bilingual support for **Uzbek** (`uz`, default) and **Russian** (`ru`) covering all pages, navigation, booking steps, status messages, and error states.
- **Multi-Step Booking Wizard**: 5-step patient reservation flow (Branch → Service → Doctor → Real-time Available Slot → Patient Information & Consent → Confirmed Request).
- **Self-Service Booking Portal**: Dedicated tracking and management page (`/booking/status/:token`) allowing patients to review appointment status, reschedule to another slot, or cancel reservations without an account.
- **Public Clinic Modules**: Services catalog, specialist directory, transparent pricing, patient reviews with display-name consent, health articles, categorized FAQ accordion, and clinic contact information with callback lead submission.

### 🛡️ Administrative Portal (`frontend/src/app/admin`)
- **Role-Based Access Control**: Strict permissions for `OWNER`, `ADMIN`, `DOCTOR`, and `EDITOR`.
- **Operational Dashboard**: Real-time KPI summaries, today's schedule, and pending callback requests.
- **Interactive Appointment Calendar**: Filterable calendar view by doctor, branch, service, and status with immediate workflow transitions (`CONFIRMED`, `CHECKED_IN`, `COMPLETED`, `CANCELLED`, `NO_SHOW`).
- **Patient Directory & Duplicate Management**: Patient search, historical visit tracking, automated duplicate detection tool with one-click record merging, and formula-injection-safe CSV export (RFC 4180 compliant).
- **Callback Lead Management**: Follow-up workflow tracking, notes, and direct booking conversion linking.
- **Doctor & Schedule Management**: Working days/hours configuration, branch assignments, leaves, vacations, and blocked periods.
- **Review Moderation**: Moderation queue to approve, reject, or archive patient feedback.
- **CMS Content Editor**: Manage clinic articles, FAQs, and public policy pages.
- **Security Audit Logs**: Tamper-evident logging of administrative actions with automatic PII sanitization.
- **Real Analytics Engine**: Database-level aggregations tracking booking volume, status funnels, doctor workload/utilization, retention (new vs. returning), lead-to-booking conversions, and payment ledger (recorded payments minus refunds).

### ⚙️ Backend Core (`backend/`)
- **Timezone-Aware Scheduling**: Exact `Asia/Tashkent` timezone calculations with UTC database persistence.
- **Concurrency & Double-Booking Protection**: PostgreSQL advisory transaction locking (`pg_advisory_xact_lock`) ensuring zero overlapping appointments under concurrent traffic.
- **Security & Session Hardening**:
  - SHA-256 digest hashing for refresh tokens (preventing bcrypt 72-byte truncation on JWTs).
  - Refresh token rotation with automatic replay revocation.
  - Strict cookie path scoping (`/api/auth/refresh`) and `CsrfGuard`.
  - Instant token version invalidation (`tokenVersion`) on role change, deactivation, or password reset.
  - Doctor scoping: unlinked doctor profiles fail closed; treating doctors only view their authorized patients.
- **Decoupled Notification Pipeline**: PostgreSQL durable job queue with automatic retries and development console sinks for Email, SMS, and staff Telegram alerts (sanitized of patient PII).
- **Automated Expiry Worker**: Scheduled background cron task auto-cancelling abandoned reservations after the clinic expiration horizon.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | Next.js 14 (App Router), TypeScript, TailwindCSS, Three.js, Lucide React |
| **Backend** | NestJS 10, TypeScript, Prisma ORM 5, PostgreSQL 18, `@nestjs/schedule` |
| **Testing** | Jest, Supertest, PostgreSQL live integration test suite |
| **Security** | Passport JWT, bcrypt, SHA-256 token digests, CSRF protection, Advisory Locks |

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js**: v18.x or v20.x or v22.x
- **PostgreSQL**: v14+ (Local installation or Docker)
- **Git**

### 2. Environment Setup

Copy example environment files:
```bash
# In the repository root
cp .env.example .env
cp backend/.env.example backend/.env
```

Verify your database connection string in `backend/.env` and `.env`:
```env
DATABASE_URL="postgresql://dentacare:dentacare_dev_password@localhost:5432/dentacare?schema=public"
JWT_SECRET="super-secret-jwt-key-replace-in-production-min-32-chars-long"
JWT_REFRESH_SECRET="super-secret-refresh-key-replace-in-production-min-32-chars-long"
PORT=4000
FRONTEND_URL="http://localhost:3000"
```

### 3. Database Migration & Idempotent Seed
```bash
# Run migrations
npm run db:migrate

# Seed demo data (branches, services, doctors, schedules, staff, CMS, reviews)
npm run db:seed
```

### 4. Running the Application

You can run both backend and frontend concurrently from the root:
```bash
npm run dev
```

Or start each service individually:
```bash
# Backend (Port 4000)
npm run dev:backend

# Frontend (Port 3000)
npm run dev:frontend
```

---

## 🔗 Application URLs

| Service | URL | Description |
|---|---|---|
| **Public Portal** | [http://localhost:3000](http://localhost:3000) | Animated dental clinic website with 3D tooth |
| **Appointment Booking** | [http://localhost:3000/booking](http://localhost:3000/booking) | Online booking wizard |
| **Admin Dashboard** | [http://localhost:3000/admin](http://localhost:3000/admin) | Management panel (Login required) |
| **Backend API** | [http://localhost:4000/api](http://localhost:4000/api) | NestJS REST API |
| **Health Check** | [http://localhost:4000/api/health](http://localhost:4000/api/health) | Database latency & status check |
| **Swagger Docs** | [http://localhost:4000/api/docs](http://localhost:4000/api/docs) | Interactive OpenAPI documentation |

---

## 👥 Demo Staff Credentials

The database seed provides predefined accounts for all roles:

| Role | Email | Password | Scope & Permissions |
|---|---|---|---|
| **OWNER** | `owner@dentacare.uz` | `Owner@2026!` | Full administrative access, settings, audits, financials |
| **ADMIN** | `admin@dentacare.uz` | `Admin@2026!` | Operational management, bookings, leads, doctors, patients |
| **DOCTOR** | `doc.karimov@dentacare.uz` | `Doctor@2026!` | Personal schedule, today's visits, authorized patient history |
| **DOCTOR** | `doc.rahimova@dentacare.uz` | `Doctor@2026!` | Personal schedule, today's visits, authorized patient history |
| **EDITOR** | `editor@dentacare.uz` | `Editor@2026!` | CMS articles, FAQs, reviews moderation |

---

## 🧪 Testing & Verification

### Running the End-to-End Regression Suite
The backend features an automated 10-point regression and integration test suite running against real PostgreSQL:
```bash
npm run test:e2e
```

**Verified Test Cases:**
1. Health endpoint returns `ok` and PostgreSQL connection status.
2. Token refresh rotation, SHA-256 digest hashing, and replay revocation.
3. Doctor without a linked doctor profile fails closed with 403 Forbidden.
4. Cross-doctor data isolation (Doctor A cannot read Doctor B's bookings or unauthorized patients).
5. Concurrency safety: simultaneous overlapping bookings fail one with 409 Conflict.
6. Concurrent idempotent submissions create exactly one booking; changed payload is rejected with 400.
7. Safe identity resolution: shared family phone numbers do not silently merge different patients.
8. Public reviews moderation: pending reviews do not appear publicly until approved.
9. Rescheduling validates booking horizon and preserves required service buffers.
10. Database analytics correctly aggregate visits, conversion, and workload.

### Building for Production
```bash
npm run build
```
This runs both `npm run build:backend` (`nest build`) and `npm run build:frontend` (`next build`), validating TypeScript types and compiling optimized production bundles.

---

## 📡 External Services Configuration (Production)

The application works out-of-the-box in development mode without external credentials (falling back to console sinks and local file storage). For production deployment, set:

- **SMS Gateway (PlayMobile / Eskiz)**:
  `SMS_API_URL`, `SMS_API_KEY`, `SMS_SENDER_NAME`
- **Telegram Staff Bot**:
  `TELEGRAM_BOT_TOKEN`, `TELEGRAM_STAFF_CHAT_ID`
- **SMTP Email Provider**:
  `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`
- **S3 / MinIO Object Storage**:
  `STORAGE_DRIVER=s3`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
