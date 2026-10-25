# Recovery Checkpoint - StomoApp
## All 5 Priorities Implemented & Rigorously Verified

### 1. Repository & Branch Information
- **Branch**: `dev` (Strictly local changes; no push, no merge, no deployment, no database reset).
- **Reviewed Baseline**: `4ca9fdd70c7768f8f4c863302932975a475a2ba0`
- **Repository**: `zemeisteer/StomoApp`
- **Local Path**: `c:\Users\user\Documents\GitHub\StomoApp`
- **Language / Locale Support**: Bilingual Uzbek (`uz`) & Russian (`ru`) verified across public booking and admin management.
- **Active Preview URL**: `http://localhost:3000` (Next.js server proxying `/api/*` to NestJS at `http://localhost:4000/api`)
- **Test Database**: `postgresql://dentacare:****@localhost:5432/dentacare_test?schema=public`

---

### 2. Comprehensive Implementation Across All 5 Priorities

#### Priority 1 — Safe Scheduling Correctness & Synchronization
- **Unified Advisory Locks**: Unified all doctor-scoped operations (`AppointmentsService`, `setDoctorSchedule`, `setBatchSchedules`, `copyDoctorSchedules`, `addException`, `deleteException`) to a single lock key namespace `doc_${doctorId}` via `SchedulingService.getDoctorLockKey`.
- **Deadlock Prevention**: In multi-doctor operations (`setBatchSchedules`, `copyDoctorSchedules`), doctor advisory locks are acquired strictly in sorted ascending order (`[...doctorIds].sort()`).
- **Authoritative In-Transaction Validation**: Moved all branch activity, doctor activity, cross-branch schedule overlaps, and appointment conflict validation inside the database transaction after acquiring doctor locks.
- **Complete Interval Conflict Detection with Buffer**: Checks `[apptStart, apptEnd + bufferMinutes]` against shift boundaries, break windows (`breakStart`, `breakEnd`), and cross-branch shifts using the clinic timezone (`Asia/Tashkent`).
- **Unbounded Querying**: Removed arbitrary 50-appointment cutoff limit; queries all upcoming appointments for target weekdays without truncation.
- **Preview API & Atomic Rollback**: Added `@Post('schedule/batch/preview')` and `@Post('schedule/copy/preview')` (and `schedules/*` aliases) returning structured summary and conflict items (`canApply`, `conflicts: [{ doctorId, doctorName, patientName, patientPhone, time, reason }]`). Mutating operations roll back atomically if any target doctor has a conflict.
- **Bulk Scheduling Admin UI**: Multi-doctor selection chips, quick "Barchasi" / "Tozalash" buttons, clear bilingual Uzbek/Russian explanations for Merge vs Replace, and interactive "Ko'rib chiqish (Preview)" modal before applying changes.
- **Verification**: `backend/scripts/verify-phase1-scheduling.js` -> **PASS (7/7 tests 100%)**.

#### Priority 2 — Quote Changes During Booking & Price Truth
- **Authoritative Recalculation Inside Transaction**: When a booking request is submitted, `AppointmentsService.createBooking` recalculates authoritative quote parameters (`txPriceFrom`, `txDurationMinutes`, `txBufferMinutes`) inside the doctor-specific advisory lock transaction.
- **Structured `QUOTE_CHANGED` Rejection (HTTP 409)**: If the client submits `expectedQuote` and any material parameter changed (`priceFrom`, `durationMinutes`, `bufferMinutes`), the transaction atomically rolls back without creating an appointment or patient record, returning structured error payload `{ code: 'QUOTE_CHANGED', quoteChanged: true, expectedQuote, currentQuote, materialChanges }`.
- **Interactive Quote Change Reconfirmation Modal**: Frontend booking flow catches `QUOTE_CHANGED` (status 409) and presents a dedicated bilingual (UZ/RU) modal `#quote-change-modal` showing side-by-side comparison (old vs new price and duration), while preserving 100% of the patient's inputs (name, phone, note, email, selected doctor, branch, slot).
- **Acceptance Flow with Request Identity**: When the patient accepts (`#accept-quote-update-btn`), `handleAcceptQuoteUpdate` updates the authoritative server quote state, generates a fresh idempotency key (`bk_${Date.now()}_...`) so the accepted booking has a distinct request identity, re-validates slot availability, and creates the appointment with authoritative values.
- **Required Branch Validation**: Made `branchId` required on `PublicBookingDto` with `@IsString()` and `@IsNotEmpty({ message: 'Filial tanlanishi shart' })`. Validated in both DTO class-validator and service logic (returns HTTP 400). Changing branches immediately invalidates incompatible doctor and time selections.
- **Doctor-Branch Compatibility**: Verifies that the selected doctor is actively assigned to the chosen branch (`doctor.branches.some(b => b.branchId === branchId)`), returning HTTP 400 if incompatible.
- **Idempotency Protection**: Repeated identical requests return the existing appointment without creating duplicates. Conflicting payloads reusing an idempotency key are rejected with HTTP 409 conflict.
- **Phone Format Validation**: Normalized Uzbek phone format strictly enforced (`+998XXXXXXXXX`).
- **Response Contract Truth**: Serialized appointment response includes `servicePriceFrom`, `price`, `priceFrom`, `durationMinutes`, `bufferMinutes`, `expiresAt`, `tokenExpiresAt`, and `serviceItems`.
- **Verification**: `backend/scripts/verify-phase2-quote-consistency.js` -> **PASS (7/7 tests 100%)**.

#### Priority 3 — Analytics Accuracy & Multi-Service Reporting
- **Current Calendar Month Default in Clinic Timezone**: When `startDate` and `endDate` are omitted in analytics endpoints, dates default to the exact boundaries of the current calendar month in `Asia/Tashkent` (`fromZonedTime(..., timezone)` and `toZonedTime(new Date(), timezone)`), eliminating timezone drift cutoffs.
- **Separate Service Usage from Distinct Appointment Counts**: Analytics clearly separates clinical patient visits (`totalAppointments`) from total service items performed (`totalServiceUsage` and `servicesPerAppointment`). In multi-service visits, each service item is accounted for without inflating appointment counts, while legacy appointments lacking explicit item rows are preserved without double counting.
- **Proportionate Revenue Apportionment**: When analytics is filtered by a specific service, payments on multi-service bundle appointments are apportioned proportionately by each service's price share (`Math.round(payment.amount * (servicePrice / totalBundlePrice))`) instead of attributing the entire bundle payment to each individual service.
- **Branch-Scoped Doctor Utilization & Overtime Isolation**: Doctor schedule capacity and overtime are strictly scoped by branch. Overtime exceptions belonging to Branch A only increase available minutes when filtering Branch A (`!ex.branchId || ex.branchId === branchId`). Branch B analytics excludes Branch A overtime.
- **Multi-Service Filter Support**: When filtering by `serviceId`, queries check both the legacy `serviceId` field and secondary `serviceItems: { some: { serviceId } }`, capturing all occurrences of the service.
- **Admin Analytics UI Component**: Added a dedicated `Xizmatlar tahlili va ko'rsatkichlari` card to `frontend/src/app/admin/analytics/page.tsx`, displaying service name, service usage count, distinct appointment count, proportionate revenue (`revenueMinor`), and usage progress bars. Updated KPI cards to display `totalServiceUsage` and `servicesPerAppointment`.
- **Verification**: `backend/scripts/verify-phase3-analytics.js` -> **PASS (5/5 tests 100%)**.

#### Priority 4 — Settings Boundaries & Expiration Lifecycle
- **Unified Expiration Range [5..10080]**: Configured `pendingExpiryMinutes` to a consistent range across `ClinicSettingsDto` (`@Min(5)`, `@Max(10080)`), `AppointmentsService` booking creation, and admin settings frontend.
- **Explicit Handling of Legacy Out-of-Range Settings**: When database rows contain legacy out-of-bounds values (e.g., 0 or 50000 min), `ClinicService.getSettings` sanitizes them to safe bounds (`Math.max(5, Math.min(10080, val))`) while exposing `pendingExpiryOutOfRange: true` and `rawPendingExpiryMinutes`. The settings UI displays an explicit amber warning banner allowing the administrator to review and save normalized settings without silent background mutation.
- **Preservation of Valid Zero Settings**: Strict distinction between undefined values and legitimate zeros. Preserves `bufferMinutes: 0` (continuous appointments) and `minBookingNoticeHours: 0` (immediate bookings allowed) without defaulting or resetting.
- **Plain Bilingual Explanations (UZ/RU)**:
  - **Bron qilish ufqining chegarasi (kunlarda) / Горизонт бронирования (в днях)**: `maxBookingHorizonDays` (1..365 kun). Bemorlar kalendarda necha kun oldinga bo'sh vaqtlarni ko'rib band qila olishi.
  - **Minimal oldindan bron qilish vaqti (soatda) / Минимальное время предварительной брони (в часах)**: `minBookingNoticeHours` (0..720 soat). Qabul vaqtidan kamida qancha vaqt oldin ariza topshirish mumkinligi (0 = darhol qabulga yozilish).
  - **Qabullar orasidagi tanaffus (daqiqada) / Перерыв между приемами (в минутах)**: `bufferMinutes` (0..120 daqiqa). Har bir qabuldan keyin kabinetni shamollatish, sterilizatsiya va shifokor tayyorgarligi uchun ajratiladigan vaqt (0 = uzluksiz qabul).
  - **Tasdiqlashni kutish vaqti (daqiqada) / Время ожидания подтверждения (в минутах)**: `pendingExpiryMinutes` (5..10080 daqiqa / 7 kungacha). Veb-saytdan yuborilgan ariza xodimlar tomonidan tasdiqlanishi uchun beriladigan vaqt; muddat tugasa, slot boshqa bemorlar uchun bo'shaydi.
- **Background Expiration Sweep (`expirePending`)**:
  - Automatically identifies pending appointments where `expiresAt <= NOW()`.
  - Transitions them to `CANCELLED` status with status history entry (`fromStatus: 'PENDING', toStatus: 'CANCELLED', changedBy: 'system', reason: 'Tasdiqlash muddati tugaganligi sababli tizim tomonidan avtomatik bekor qilindi'`).
  - Writes audit log record (`action: 'appointment.status_expired'`).
  - Revokes tokens and cancels scheduled reminder notifications.
  - Doctor schedule slots become immediately available for booking once `expiresAt` lapses even before the sweep executes.
- **Deterministic Race Resolution**: Concurrent confirmation at the counter vs background expiration sweep executes serializably; transition guards strictly enforce terminal status transitions.
- **Verification**: `backend/scripts/verify-phase4-settings-expiration.js` -> **PASS (6/6 tests 100%)**.

#### Priority 5 — User-Facing Design, Calendar, Reception & 3D Tooth
- **Admin Calendar & Daily Agenda (`/admin/calendar`)**:
  - Full bilingual Uzbek & Russian localization via `useI18n()`.
  - Status filter and informative badges with explanations for all 6 statuses:
    - `PENDING` (Tasdiqlash kutilmoqda / Ожидает подтверждения)
    - `CONFIRMED` (Kelishi kutilmoqda / Ожидается визит)
    - `CHECKED_IN` (Klinikaga keldi / Прибыл в клинику)
    - `COMPLETED` (Yakunlandi / Завершен)
    - `CANCELLED` (Bekor qilindi / Отменен)
    - `NO_SHOW` (Kelmadi / Не явился)
  - Search by patient name and normalized phone.
  - Filters by branch, doctor, service, and status.
  - Date navigation (`Bugun`, `Ertaga`, `Kunlik`, `Haftalik`, `Oylik`).
  - Treatment overruns clearly displayed with estimated completion times without silent rescheduling.
- **3D Interactive Tooth (`Tooth3D.tsx`)**:
  - Removed confusing/unused pause button.
  - Full vertical inspection range $[-1.57, 1.57]$ (full 90° inspection of occlusal crown, enamel fissures, roots, and apical underside).
  - Bilingual Uzbek/Russian camera perspective pills:
    - `Old ko'rinish` / `Спереди`
    - `Toj (tepadan)` / `Коронка (сверху)`
    - `Ildiz (pastdan)` / `Корень (снизу)`
  - Safe margin `1.28` prevents model clipping across all viewport widths.
  - Dynamic client-only import (`ssr: false`) in `HeroSection.tsx` avoids Three.js SSR chunk errors.
  - Loading spinner fallback and WebGL context loss recovery.
  - Full `prefers-reduced-motion` compliance.
- **Visual Responsive Verification**:
  - Screenshots captured at 360px, 390px, 768px, and 1440px for `/`, `/booking`, `/admin/calendar`, and `/admin/settings`.
  - Zero hydration errors, clean white/mint/teal aesthetics, standardized buttons and dropdowns with viewport collision safety.

---

### 3. Test Suites & Verification Results

| Suite / Test Runner | Command | Result | Details |
|---|---|---|---|
| **Phase 1: Safe Scheduling** | `node backend/scripts/verify-phase1-scheduling.js` | **PASS (7/7)** | Doctor lock keys, in-tx conflict check, interval buffer check, >50 future appts, atomic rollback, preview API, schedule copy. |
| **Phase 2: Quote Consistency** | `node backend/scripts/verify-phase2-quote-consistency.js` | **PASS (7/7)** | Missing branch rejected, doctor-branch compatibility, 409 QUOTE_CHANGED, acceptance resubmission, idempotency replay/collision, bundle recalculation, phone validation. |
| **Phase 3: Analytics Accuracy** | `node backend/scripts/verify-phase3-analytics.js` | **PASS (5/5)** | Asia/Tashkent current month boundaries, distinct visits vs service usage, proportionate revenue apportionment, branch overtime isolation, secondary serviceItems filter. |
| **Phase 4: Settings & Expiration** | `node backend/scripts/verify-phase4-settings-expiration.js` | **PASS (6/6)** | Range 5..10080 boundaries, preservation of zeros, legacy out-of-range sanitization & alert, configured booking expiration, expirePending slot release & audit, concurrent confirmation race. |
| **Real Browser Integration** | `node backend/scripts/verify-booking-integration.js` | **PASS (6/6)** | Real Puppeteer integration: branch switch invalidation, stale request race protection, 409 conflict patient data preservation, quote reconfirmation modal, branch-prefilled URL, zero price/buffer. |
| **Admin & Workflow Runner** | `node backend/test/run-browser-tests.js` | **PASS (7/7)** | End-to-end multi-service booking, admin login, calendar lookup, rescheduling, legacy bundle review, responsive layouts. |
| **Responsive Multi-Viewport** | `node backend/scripts/capture-responsive-screenshots.js` | **PASS (16/16)** | Captured `/`, `/booking`, `/admin/calendar`, `/admin/settings` at 360px, 390px, 768px, and 1440px. |
| **Backend TypeScript Build** | `npm run build` (backend) | **PASS** | Exit code 0, clean NestJS build (`dist/`). |
| **Frontend Next.js Build** | `npm run build` (frontend) | **PASS** | Exit code 0, all 28 static/dynamic routes compiled. |

---

### 4. Git & Branch Status
- **Current Branch**: `dev`
- **Starting Baseline**: `4ca9fdd70c7768f8f4c863302932975a475a2ba0`
- **Remote Push**: None (no push, no merge to `main`, no deployment).
- **All changes remain local on `dev`, clean and ready for review.**
