# Recovery Checkpoint - StomoApp
## Public Redesign, Booking Contract Truth & Scheduling Verification Completed

### 1. Repository & Branch Information
- **Branch**: `dev` (Strictly local changes; no push, no merge, no deployment, no database reset).
- **Reviewed Baseline**: `010a311b3b3a1ceeac6b5a4c9a050af1499ae070`
- **Repository**: `zemeisteer/StomoApp`
- **Local Path**: `c:\Users\user\Documents\GitHub\StomoApp`
- **Language / Locale Support**: Bilingual Uzbek (`uz`) & Russian (`ru`) verified across public booking and admin management.
- **Active Preview URL**: `http://localhost:3000` (Next.js server proxying `/api/*` to NestJS at `http://localhost:4000/api`)
- **Test Database**: `postgresql://dentacare:****@localhost:5432/dentacare_test?schema=public`

---

### 2. Summary of Implemented Concrete Fixes

1. **Public Booking Response Contract**:
   - Backend `serializeAppointmentResponse` and controllers `createBooking` & `rescheduleByToken` explicitly return persisted truth: `servicePriceFrom`, `price`, `priceFrom`, `durationMinutes`, `bufferMinutes`, `branchId`, `doctorId`, `serviceId`, localized names (`doctorNameUz/Ru`, `branchNameUz/Ru`), and `serviceItems`.
   - Frontend `frontend/src/lib/api.ts` exports explicit `BookingResponse` interface.
   - `frontend/src/app/booking/page.tsx` strictly uses confirmation truth from server response without falling back to pre-submission quotes.
   - Preserves legitimate zeros (`price === 0` / "Bepul").
   - Verified via regression test changing price right before submission: confirmation screen strictly displays 185,000 UZS from saved DB record.

2. **Explicit Pending-Expiry Settings**:
   - Removed silent clamp `txPendingExpiryMinutes > 30 ? txPendingExpiryMinutes : 1440` in `AppointmentsService.createBooking`.
   - Directly honors configured 15, 30, and 60 min boundaries (within safe 1..10080 bounds).
   - Staff-created appointments via admin endpoint are created with `CONFIRMED`, `expiresAt: null`, and status history `toStatus: 'CONFIRMED'`.

3. **Overtime Branch Support End-to-End**:
   - Added `OVERTIME: "Qo'shimcha ish vaqti (Overtime)"` and branch selector in `frontend/src/app/admin/doctors/page.tsx`.
   - Public doctor exception projections in `backend/src/public/public.service.ts` include `branchId`.
   - `backend/src/scheduling/scheduling.service.ts` and `appointments.service.ts` validate active branches and active schedules (`isActive: true, branch: { isActive: true }`).
   - Accurately noted that migration `20261023130000_explicit_overtime_branch` added column `branch_id TEXT` and foreign key constraint without creating an index.

4. **Custom Date Picker WAI-ARIA & Hydration Fix**:
   - WAI-ARIA grid keyboard navigation (Arrows, Home, End, PageUp, PageDown, Enter, Space).
   - Escape dismissal and focus restoration to trigger.
   - Clear button separated from trigger button as sibling (resolving invalid HTML `<button>` inside `<button>` hydration defect).
   - Accessible labels, localized month controls, timezone prop defaulting to `Asia/Tashkent`.

5. **Real Tests Hardening**:
   - Masked DB credentials in stdout.
   - Run-specific probe branch verification through frontend proxy before any mutation; fail-closed on mismatch.
   - Asserted `bufferMinutes === 0` in zero-buffer scenario with explicit zero-buffer fixture.
   - Strict exact monetary equality comparisons (`=== 18500000`).
   - Clean teardown in `finally`.
   - Updated `backend/test/browser-workflow.js` to match the 7-step redesigned booking flow, passing all 7 workflows with exit code 0.

6. **Tooth Framing & Hydration**:
   - `Tooth3D.tsx` safe margin `1.28` across initial load and `ResizeObserver` so tooth model never clips at any pitch/yaw rotation (crown to root) or on narrow viewports.
   - Removed `suppressHydrationWarning` from `<main>` in `frontend/src/app/ClientLayout.tsx`.
   - Verified 0 browser console hydration warnings on `/` and `/booking`.

---

### 3. Verification & Build Commands

- `node backend/test/run-browser-tests.js` -> **PASS (Exit code: 0, 7/7 workflows passed)**
- `node backend/scripts/verify-booking-integration.js` -> **PASS (Exit code: 0, 100% of 6 scenarios passed)**
- `node backend/scripts/verify-ui-and-capture.js` -> **PASS (Exit code: 0, 8/8 scenarios passed)**
- `npm run build` in `frontend/` -> **PASS (Exit code: 0, 28/28 routes compiled)**
- `npm run build` in `backend/` -> **PASS (Exit code: 0)**
