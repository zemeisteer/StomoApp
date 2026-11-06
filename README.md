# DentaCare — Dental Clinic Management Application (StomoApp)

A full-stack, enterprise-grade dental clinic web application built with a modern animated public portal, an interactive 3D hero visualization, an online booking system, and a comprehensive role-based administrative dashboard.

---

## 🌟 Key Features

### 🌐 Public Website (`frontend/`)
- **Interactive 3D Tooth Hero**: Believable anatomical molar featuring 4 occlusal cusps, central developmental groove, cervical margin, and dual bifurcated tapered roots. Implemented using Three.js / React Three Fiber with realistic ivory enamel translucency (`MeshPhysicalMaterial`), studio lighting, interactive drag rotation preserving native vertical touch scrolling, reduced-motion pause, and SVG fallback poster.
- **Multilingual Support**: Full bilingual support for **Uzbek** (`uz`, default) and **Russian** (`ru`) covering all pages, navigation, booking steps, status messages, and error states.
- **Multi-Step Booking Wizard**: 5-step patient reservation flow (Branch → Service → Doctor → Real-time Available Slot → Patient Information & Consent → Confirmed Request). Server-authoritative slot validation; zero PII saved in client browser storage.
- **Self-Service Booking Portal**: Dedicated tracking and management page (`/booking/status/:token`) allowing patients to review appointment status, reschedule to another slot, or cancel reservations without an account.
- **Public Clinic Modules**: Services catalog, specialist directory, transparent pricing, patient reviews with display-name consent, health articles, categorized FAQ accordion, and clinic contact information with callback lead submission.

### 🛡️ Administrative Portal (`frontend/src/app/admin`)
- **Role-Based Access Control**: Strict permissions for `OWNER`, `ADMIN`, `DOCTOR`, `RECEPTION`, and `EDITOR`.
- **Operational Dashboard & Modular Workspaces**:
  - **Doctor Workspace**: Patient header, interactive 3D odontogram (FDI 11–48 adult and 51–85 pediatric), tooth surface inspection, real-time treatment plan builder, and X-ray viewer with brightness/contrast filters.
  - **Owner Workspace**: Revenue intelligence, doctor commission rate management, dynamic patient debt ledger, and inventory stock monitoring.
  - **Receptionist Workspace**: Daily appointment calendar, check-in queue tabs (`ALL`, `ARRIVED`, `IN_TREATMENT`, `COMPLETED`), and quick patient walk-in registration.
- **Clinical & Financial Single Source of Truth**:
  - Odontograms, treatment plans, invoices, payments, and inventory tracked exclusively in PostgreSQL via Prisma.
  - Currency stored as whole integers (`so'm`); debts are derived dynamically from recorded payments (`effectiveTotal - totalPaid`), preventing ledger drift.
  - Doctor scoping: doctors can only access clinical records for their authorized patients.
- **Interactive Appointment Calendar**: Filterable calendar view with deep link support (`?appointmentId=`), immediate status transitions, and arrival/overrun tracking.
- **Patient Directory & Duplicate Management**: Patient search, historical visit tracking, automated duplicate detection tool with one-click record merging, and RFC 4180 CSV export.
- **Callback Lead Management**: Follow-up workflow tracking, notes, and direct booking conversion linking.
- **Doctor & Schedule Management**: Working days/hours configuration, branch assignments, leaves, vacations, and blocked periods.
- **Review Moderation**: Moderation queue to approve, reject, or archive patient feedback.
- **CMS Content Editor**: Manage clinic articles, FAQs, and public policy pages.
- **Security Audit Logs**: Tamper-evident logging of administrative actions with automatic PII sanitization.
- **Real Analytics Engine**: Database-level aggregations tracking booking volume, status funnels, doctor workload/utilization, retention, and net revenue.

### ⚙️ Backend Core (`backend/`)
- **Single Source of Truth**: NestJS 10 + Prisma ORM 5 + PostgreSQL.
- **Timezone-Aware Scheduling**: Exact `Asia/Tashkent` timezone calculations with UTC database persistence.
- **Concurrency & Double-Booking Protection**: PostgreSQL advisory transaction locking (`pg_advisory_xact_lock`) ensuring zero overlapping appointments under concurrent traffic.
- **Security & Session Hardening**:
  - SHA-256 digest hashing for refresh tokens (preventing bcrypt 72-byte truncation on JWTs).
  - Refresh token rotation with automatic replay revocation.
  - Strict cookie path scoping (`/api/auth/refresh`) and `CsrfGuard`.
  - Instant token version invalidation (`tokenVersion`) on role change, deactivation, or password reset.
  - Doctor scoping: unlinked doctor profiles fail closed; treating doctors only view their authorized patients.
  - Media magic-byte validation and re-encoding with Sharp.
- **Transactional Outbox Notification Pipeline**: PostgreSQL durable job queue with worker leases, automatic retries, and development console sinks for Email, SMS (Eskiz / PlayMobile), and staff Telegram alerts.
- **Automated Expiry Worker**: Scheduled background cron task auto-cancelling abandoned reservations after the clinic expiration horizon.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | Next.js 14 (App Router), TypeScript, TailwindCSS, Three.js, Lucide React |
| **Backend** | NestJS 10, TypeScript, Prisma ORM 5, PostgreSQL 16, `@nestjs/schedule` |
| **Testing** | Jest, Supertest, PostgreSQL live integration test suite, pytest |
| **Security** | Passport JWT, bcrypt, SHA-256 token digests, CSRF protection, Advisory Locks |
| **Deployment** | Docker, Docker Compose, GitHub Actions CI |

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js**: v20.x LTS
- **PostgreSQL**: v14+ (Local installation or Docker)
- **Redis**: v7+
- **Git**

### 2. Environment Setup

Copy example environment files:
```bash
# In the repository root
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Configure your database connection in `backend/.env`:
```env
DATABASE_URL="postgresql://dentacare:dentacare_dev_password@localhost:5432/dentacare?schema=public"
JWT_SECRET="generate-a-secure-random-base64-string-in-production"
JWT_REFRESH_SECRET="generate-a-secure-random-refresh-base64-string"
APP_PORT=4000
FRONTEND_URL="http://localhost:3000"
```

### 3. Database Migration & Idempotent Seed
```bash
# In backend/
cd backend
npx prisma migrate deploy
npm run db:seed
```

### 4. Running Locally
```bash
# Backend (Port 4000)
cd backend && npm run start:dev

# Frontend (Port 3000)
cd frontend && npm run dev
```

---

## 🐳 Production Deployment with Docker Compose

The repository includes multi-stage production Dockerfiles and an orchestration profile:

Prerequisites: DNS A/AAAA records for `DOMAIN` (and every `EXTRA_DOMAINS` entry) point to the server, and ports 80/443 are open.

```bash
# 1. Create the production environment file and fill in secrets, DOMAIN, EXTRA_DOMAINS, LETSENCRYPT_EMAIL
cp .env.production.example .env.production

# 2. First deploy only: obtain the Let's Encrypt certificate and start the stack
#    (STAGING=1 first to test without hitting Let's Encrypt rate limits)
./scripts/init-letsencrypt.sh

# 3. Later deploys
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build

# 4. Check container health
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

Services exposed:
- **Public entrypoint**: nginx on `https://DOMAIN` (port 80 only serves ACME challenges and redirects to HTTPS)
- **Frontend / Backend API**: behind nginx (`/` and `/api/`), not published directly
- **Database & Cache**: Internal container network only (`dentacare-internal`)
- **Certificates**: renewed automatically by the `certbot` service; nginx reloads every 6 hours to pick them up
- **Telegram bot**: `bot` service (long polling, no published port), talks to the backend at `http://backend:4000/api` with `SERVICE_TOKEN`

HTTPS is required in production: auth cookies are issued with the `Secure` flag, so admin login does not work over plain HTTP.

---

## 🔗 Application URLs

| Service | URL | Description |
|---|---|---|
| **Public Portal** | `http://localhost:3000` | Animated dental clinic website with 3D tooth |
| **Appointment Booking** | `http://localhost:3000/booking` | Online booking wizard |
| **Admin Dashboard** | `http://localhost:3000/admin` | Management panel (Login required) |
| **Backend API** | `http://localhost:4000/api` | NestJS REST API |
| **Health Check** | `http://localhost:4000/api/health` | Database latency & status check |
| **Swagger Docs** | `http://localhost:4000/api/docs` | Interactive OpenAPI documentation |

---

## 👥 Staff Roles & Access Model

| Role | Scope & Permissions |
|---|---|
| **OWNER** | Full administrative access, financial analytics, commission settings, audit logs, clinic settings |
| **ADMIN** | Operational management, bookings, callback leads, doctors, patients, inventory catalog |
| **DOCTOR** | Personal schedule, today's visits, authorized patient odontograms & treatment plans |
| **RECEPTION** | Daily calendar, patient queue check-in, walk-in quick registration, invoice status, debt repayments |
| **EDITOR** | CMS articles, FAQs, review moderation |

> [!NOTE]
> Demo staff credentials for development environments are provisioned during `npm run db:seed`. In production environments, initial administrative credentials must be supplied via environment variables (`OWNER_EMAIL`, `OWNER_PASSWORD`).

---

## 🧪 Testing & Verification

### Running the End-to-End Regression Suite (71/71 Tests)
The backend features an automated 71-test regression and integration suite running against isolated test PostgreSQL (`dentacare_test`):
```bash
cd backend
$env:TEST_DATABASE_URL="postgresql://dentacare:dentacare_dev_password@localhost:5432/dentacare_test?schema=public"
npx jest --config ./test/jest-e2e.json --runInBand
```

### Running the Comprehensive Priority Verification (60/60 Checks)
```bash
cd backend
$env:DATABASE_URL="postgresql://dentacare:dentacare_dev_password@localhost:5432/dentacare_test?schema=public"
npx ts-node scripts/verify-all-priorities.ts
```

### Building for Production
```bash
# Backend build
cd backend && npm run build && npm run lint

# Frontend build
cd frontend && npm run build && npm run lint
```
Both backend and frontend build with **zero TypeScript errors** and **zero ESLint errors**.

---

## 📡 External Services Configuration (Production)

For production deployment, configure the following providers in `backend/.env`:

- **SMS Gateway (Eskiz / PlayMobile)**:
  `SMS_PROVIDER=eskiz`, `SMS_API_URL`, `SMS_API_KEY`
- **Telegram Staff Bot**:
  `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- **SMTP Email Provider**:
  `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- **S3 / MinIO Object Storage**:
  `STORAGE_DRIVER=s3`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
