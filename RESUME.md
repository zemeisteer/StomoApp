# Recovery Checkpoint - StomoApp
## Public Redesign & Correctness Verification Completed

### 1. Repository & Branch Information
- **Branch**: `dev` (Strictly local changes; no push, no merge, no deployment, no database reset).
- **Reviewed Baseline**: `528c36a8a7e9905e7268cf9f8dac37a098777ad1`
- **Repository**: `zemeisteer/StomoApp`
- **Local Path**: `c:\Users\user\Documents\GitHub\StomoApp`
- **Language / Locale Support**: Bilingual Uzbek (`uz`) & Russian (`ru`) verified across public booking and admin management.
- **Active Preview URL**: `http://localhost:3000` (Next.js server proxying `/api/*` to NestJS at `http://localhost:4000/api`)
- **Test Database**: `postgresql://dentacare:dentacare_dev_password@localhost:5432/dentacare_test?schema=public`

---

### 2. Categorized Verification Status

#### A. Tested Through Actual Application Behavior
1. **Branch Switch Selection Invalidation**: Verified in live browser (`verify-booking-integration.js`). Switching from Branch A to Branch B in Step 5 clears old slot selection, displays switch banner, prevents invalid submission, and loads Branch B availability.
2. **Stale Request Invalidation**: Delayed Branch A availability response discarded when resolving after user switches to Branch B.
3. **Real 409 Conflict & Contact Preservation**: Concurrent conflicting booking inserted into `dentacare_test`; UI catches 409, displays conflict banner, returns to Step 4, and preserves 100% of patient contact fields.
4. **Doctor-Specific Duration & Price Truth**: Booking confirmed with doctor override values (45m, 150,000 UZS) on Step 7 and in database record.
5. **Branch-Prefilled URL Flow**: Booking via URL prefilled with branch ID keeps branch selection intact throughout all steps.
6. **Zero Price & Zero Buffer Handling**: Legitimate zero prices (0 UZS / "Bepul") and non-null buffers verified in Step 6 summary, Step 7 confirmation, and saved database record.
7. **Explicit Overtime Scheduling Policy**: Sunday overtime in Branch A strictly produces slots for Branch A and 0 for Branch B; adjacent shifts across branches are not merged.
8. **UI & Responsive Verification**: Tested on viewports 1440px, 768px, 390px, and 360px without overflow; mobile drawer focus trap and Escape key; RU language switch with Cyrillic assertions; API 500 error & retry; reduced motion evaluation.

#### B. Implemented in Codebase
1. **Additive DB Migration**: Added `branch_id` to `schedule_exceptions` with index and foreign key.
2. **Scheduling Module**: `AddExceptionDto` supports `branchId`; multi-branch assignment validation; `mergeIntervals` enforces branch identity.
3. **Centralized Booking Invalidation**: Single `invalidateSlotSelection` function resets slot, calculation, and idempotency key while preserving contact fields.
4. **Saved Appointment Truth**: Confirmation step renders returned saved appointment properties using nullish coalescing.
5. **CMS Integration**: `ClinicSection.tsx` connected to backend CMS data with neutral highlights fallback.

#### C. Source-Reviewed
1. **Prisma Schema**: Zero destructive changes.
2. **NestJS Architecture**: Public appointment creation, scheduling slot calculation, and DTO validators.

---

### 3. 3D Tooth Model Status
- **Current State**: Interactive procedural Canvas render in `Tooth3D.tsx` with mouse/touch drag, lazy loading via intersection observer, animation pause when off-screen, and reduced-motion fallback.
- **Realistic Asset**: Third-party realistic GLTF model remains pending licensing and optimization; existing procedural model maintained as honest functional asset.

---

### 4. Verification & Build Commands
- `node backend/scripts/verify-booking-integration.js` -> **PASS (Exit code: 0)**
- `node backend/scripts/verify-ui-and-capture.js` -> **PASS (Exit code: 0)**
- `npm run build` in `frontend/` -> **PASS (Exit code: 0, 28/28 routes compiled)**
- `npm run build` in `backend/` -> **PASS (Exit code: 0)**
