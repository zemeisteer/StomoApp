/**
 * DentaCare Appointment Time Contract & Overlap Helpers
 * 
 * THE TIME STORAGE CONTRACT:
 * 1. startTime (DateTime, UTC):
 *    The exact moment clinical treatment starts.
 * 2. endTime (DateTime, UTC):
 *    The exact moment clinical treatment ends (startTime + durationMinutes).
 *    Does NOT include post-treatment buffer minutes.
 * 3. durationMinutes (Integer, >= 1):
 *    Clinical treatment duration in minutes.
 * 4. bufferMinutes (Integer, >= 0, default 5):
 *    Non-clinical clean-up, disinfection, and turnaround time immediately
 *    following the treatment. The doctor and operatory remain occupied
 *    for [startTime, endTime + bufferMinutes).
 * 5. occupiedEnd (DateTime, UTC):
 *    The moment the doctor and operatory become free for another booking:
 *    - Standard: endTime + bufferMinutes
 *    - Overrun active: overrunEstimatedEndTime + bufferMinutes
 * 
 * DOCUMENTED CONSERVATIVE POLICY FOR HISTORICAL RECORDS:
 * 1. Missing or Invalid Durations:
 *    - Arithmetic alone does not prove historical provenance.
 *    - Never silently invent 30 minutes for authoritative scheduling, conflict, or classification decisions.
 *    - If durationMinutes is missing (<= 0 or NaN) and timestamps are valid (endMs > startMs), the record
 *      is classified as AMBIGUOUS. For occupied end calculations, we treat [startTime, endTime] as the minimum
 *      treatment window and conservatively add bufferMinutes (if defined > 0) to prevent double-booking during
 *      an uncertain clinical period.
 *    - If timestamps are invalid (startMs >= endMs or NaN), the record is classified as AMBIGUOUS and fails closed.
 * 
 * 2. Sub-Minute Timestamp Precision:
 *    - Timestamps with fractional seconds/milliseconds are evaluated with a tolerance of 1,000ms (1 second).
 *    - If exact duration in milliseconds deviates from whole minutes by more than 1,000ms, it is classified
 *      as AMBIGUOUS to prevent masking corrupted or sub-minute drifted records.
 * 
 * 3. Zero-Buffer Invariant:
 *    - A record with bufferMinutes === 0 is ONLY classified as ZERO_BUFFER if (endMs - startMs) matches
 *      durationMinutes within the 1-second tolerance. If it differs, it is classified as AMBIGUOUS.
 * 
 * 4. Stored vs Canonical Occupied End Invariant:
 *    - If canonical duration + buffer extends beyond stored endTime (e.g. manual truncation or corrupted endTime),
 *      getAppointmentOccupiedEnd protects the doctor/operatory with Math.max(endTime, startTime + (duration + buffer)).
 *    - Candidate queries (buildConflictCandidateWhere) expand the lookback to cover the maximum possible canonical
 *      appointment span (12 hours = 720 minutes) so records with truncated stored endTime never disappear from
 *      the database candidate selection before in-memory verification.
 */

export interface AppointmentTimeLike {
  id?: string;
  startTime: Date | string;
  endTime: Date | string;
  durationMinutes?: number | null;
  bufferMinutes?: number | null;
  overrunActive?: boolean | null;
  overrunEstimatedEndTime?: Date | string | null;
  status?: string | null;
  expiresAt?: Date | string | null;
}

export type RecordContractClassification = 'TREATMENT_END' | 'LEGACY_OCCUPIED_END' | 'ZERO_BUFFER' | 'AMBIGUOUS';

export const SUB_MINUTE_TOLERANCE_MS = 1000; // 1 second tolerance for millisecond/sub-minute drift

/**
 * Classifies an appointment record's timestamp contract.
 */
export function classifyAppointmentRecord(appt: AppointmentTimeLike): {
  classification: RecordContractClassification;
  diffMinutes: number;
  durationMinutes: number | null;
  bufferMinutes: number;
  isAmbiguous: boolean;
  reason?: string;
} {
  const startMs = new Date(appt.startTime).getTime();
  const endMs = new Date(appt.endTime).getTime();

  // 1. Missing or invalid timestamps
  if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) {
    return {
      classification: 'AMBIGUOUS',
      diffMinutes: 0,
      durationMinutes: appt.durationMinutes ?? null,
      bufferMinutes: Math.max(0, appt.bufferMinutes ?? 0),
      isAmbiguous: true,
      reason: 'Boshlanish yoki tugash vaqti noto‘g‘ri yoki bo‘sh (end <= start)',
    };
  }

  // 2. Missing or invalid durationMinutes - do not silently invent 30 minutes!
  if (!appt.durationMinutes || isNaN(appt.durationMinutes) || appt.durationMinutes <= 0) {
    const diffMin = Math.round((endMs - startMs) / 60000);
    return {
      classification: 'AMBIGUOUS',
      diffMinutes: diffMin,
      durationMinutes: null,
      bufferMinutes: Math.max(0, appt.bufferMinutes ?? 0),
      isAmbiguous: true,
      reason: 'Muolaja davomiyligi (durationMinutes) ko‘rsatilmagan yoki 0 dan kichik',
    };
  }

  const durationMinutes = appt.durationMinutes;
  const bufferMinutes = Math.max(0, appt.bufferMinutes ?? 0);
  const diffExactMs = endMs - startMs;
  const diffMinutes = Math.round(diffExactMs / 60000);

  const expectedTreatmentMs = durationMinutes * 60000;
  const expectedOccupiedMs = (durationMinutes + bufferMinutes) * 60000;

  const matchesTreatmentEnd = Math.abs(diffExactMs - expectedTreatmentMs) <= SUB_MINUTE_TOLERANCE_MS;
  const matchesOccupiedEnd = Math.abs(diffExactMs - expectedOccupiedMs) <= SUB_MINUTE_TOLERANCE_MS;

  // 3. Zero-buffer rows: MUST strictly match durationMinutes to be unambiguous
  if (bufferMinutes === 0) {
    if (matchesTreatmentEnd) {
      return {
        classification: 'ZERO_BUFFER',
        diffMinutes,
        durationMinutes,
        bufferMinutes: 0,
        isAmbiguous: false,
      };
    } else {
      return {
        classification: 'AMBIGUOUS',
        diffMinutes,
        durationMinutes,
        bufferMinutes: 0,
        isAmbiguous: true,
        reason: `Bufer 0 bo‘lgan qabulda saqlangan vaqt oralig‘i (${diffMinutes} daqiqa) davomiylikka (${durationMinutes} daqiqa) mos kelmadi`,
      };
    }
  }

  // 4. Treatment-end (modern unified contract)
  if (matchesTreatmentEnd) {
    return {
      classification: 'TREATMENT_END',
      diffMinutes,
      durationMinutes,
      bufferMinutes,
      isAmbiguous: false,
    };
  }

  // 5. Legacy occupied-end contract
  if (matchesOccupiedEnd) {
    return {
      classification: 'LEGACY_OCCUPIED_END',
      diffMinutes,
      durationMinutes,
      bufferMinutes,
      isAmbiguous: false,
    };
  }

  // 6. Inconsistent / ambiguous interval
  return {
    classification: 'AMBIGUOUS',
    diffMinutes,
    durationMinutes,
    bufferMinutes,
    isAmbiguous: true,
    reason: `Vaqt oralig‘i (${diffMinutes}m) davomiylikka (${durationMinutes}m) ham, buferli tugashga (${durationMinutes + bufferMinutes}m) ham mos kelmadi`,
  };
}

/**
 * Returns the exact scheduled treatment end time (excluding buffer).
 */
export function getAppointmentTreatmentEnd(appt: AppointmentTimeLike): Date {
  const startMs = new Date(appt.startTime).getTime();
  const endMs = new Date(appt.endTime).getTime();

  if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) {
    return new Date(endMs || startMs || Date.now());
  }

  if (!appt.durationMinutes || isNaN(appt.durationMinutes) || appt.durationMinutes <= 0) {
    // Conservative policy: if durationMinutes is missing, treat stored endTime as treatment end
    return new Date(endMs);
  }

  const durationMinutes = appt.durationMinutes;
  const bufferMinutes = Math.max(0, appt.bufferMinutes ?? 0);
  const diffExactMs = endMs - startMs;
  const expectedTreatmentMs = durationMinutes * 60000;
  const expectedOccupiedMs = (durationMinutes + bufferMinutes) * 60000;

  if (bufferMinutes === 0) {
    return new Date(endMs);
  }

  if (Math.abs(diffExactMs - expectedTreatmentMs) <= SUB_MINUTE_TOLERANCE_MS) {
    // Current contract: endTime is treatment end
    return new Date(endMs);
  }

  if (Math.abs(diffExactMs - expectedOccupiedMs) <= SUB_MINUTE_TOLERANCE_MS) {
    // Legacy record: endTime had buffer added; treatment ended at start + duration
    return new Date(startMs + durationMinutes * 60000);
  }

  // Ambiguous record: treatment end is defined by canonical durationMinutes
  return new Date(startMs + durationMinutes * 60000);
}

/**
 * Returns the exact scheduled occupied end time (including buffer).
 */
export function getAppointmentOccupiedEnd(appt: AppointmentTimeLike): Date {
  const startMs = new Date(appt.startTime).getTime();
  const endMs = new Date(appt.endTime).getTime();

  if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) {
    return new Date(endMs || startMs || Date.now());
  }

  const bufferMinutes = Math.max(0, appt.bufferMinutes ?? 0);

  if (!appt.durationMinutes || isNaN(appt.durationMinutes) || appt.durationMinutes <= 0) {
    // Conservative policy for missing duration:
    // Occupied end extends through stored endTime plus buffer to fail safe against double booking
    return new Date(endMs + bufferMinutes * 60000);
  }

  const durationMinutes = appt.durationMinutes;
  const diffExactMs = endMs - startMs;
  const expectedTreatmentMs = durationMinutes * 60000;
  const expectedOccupiedMs = (durationMinutes + bufferMinutes) * 60000;

  if (bufferMinutes === 0) {
    // If stored diff is less than canonical duration, protect slot with canonical duration
    return new Date(Math.max(endMs, startMs + durationMinutes * 60000));
  }

  if (Math.abs(diffExactMs - expectedTreatmentMs) <= SUB_MINUTE_TOLERANCE_MS) {
    // Current contract: occupied end is treatment end + buffer
    return new Date(endMs + bufferMinutes * 60000);
  }

  if (Math.abs(diffExactMs - expectedOccupiedMs) <= SUB_MINUTE_TOLERANCE_MS) {
    // Legacy record: endTime is ALREADY occupied end (start + duration + buffer)
    return new Date(endMs);
  }

  // Ambiguous record: protect slot with whichever is later (stored endTime + buffer vs canonical duration + buffer)
  return new Date(Math.max(endMs + bufferMinutes * 60000, startMs + (durationMinutes + bufferMinutes) * 60000));
}

/**
 * Returns effective clinical treatment end time taking active overrun into account.
 */
export function getAppointmentEffectiveTreatmentEnd(appt: AppointmentTimeLike): Date {
  if (appt.overrunActive && appt.overrunEstimatedEndTime) {
    return new Date(appt.overrunEstimatedEndTime);
  }
  return getAppointmentTreatmentEnd(appt);
}

/**
 * Returns effective occupied end time taking active overrun and buffer into account.
 */
export function getAppointmentEffectiveOccupiedEnd(appt: AppointmentTimeLike): Date {
  const bufferMinutes = Math.max(0, appt.bufferMinutes ?? 5);
  if (appt.overrunActive && appt.overrunEstimatedEndTime) {
    return new Date(new Date(appt.overrunEstimatedEndTime).getTime() + bufferMinutes * 60000);
  }
  return getAppointmentOccupiedEnd(appt);
}

/**
 * Authoritative half-open interval overlap check between an appointment and a candidate slot.
 * Returns true if [appt.startTime, appt.effectiveOccupiedEnd) overlaps with [slotStart, slotEnd).
 * 
 * Half-open behavior:
 * - Appt [10:00, 10:35), Candidate [10:32, 11:07) -> OVERLAPS (10:00 < 11:07 && 10:35 > 10:32) => TRUE
 * - Appt [10:00, 10:35), Candidate [10:35, 11:10) -> NO OVERLAP (10:35 is NOT > 10:35) => FALSE
 */
export function isAppointmentOverlapping(
  appt: AppointmentTimeLike,
  slotStart: Date | string,
  slotEnd: Date | string,
  options?: { nowUtc?: Date; includeExpiredPending?: boolean },
): boolean {
  const now = options?.nowUtc || new Date();

  // Expired pending appointments do not hold the slot
  if (!options?.includeExpiredPending) {
    if (appt.status === 'PENDING' && appt.expiresAt && new Date(appt.expiresAt) <= now) {
      return false;
    }
  }

  const startA = new Date(appt.startTime).getTime();
  const endA = getAppointmentEffectiveOccupiedEnd(appt).getTime();
  const startB = new Date(slotStart).getTime();
  const endB = new Date(slotEnd).getTime();

  return startA < endB && endA > startB;
}

/**
 * Enforced domain limit for buffer duration (2 hours = 120 minutes).
 * Used to safely construct indexed database candidate queries.
 */
export const ENFORCED_MAX_BUFFER_MINUTES = 120;
export const ENFORCED_MAX_BUFFER_MS = ENFORCED_MAX_BUFFER_MINUTES * 60 * 1000;

/**
 * Maximum supported span for a single appointment's canonical duration + buffer (12 hours).
 * Used in candidate queries so ambiguous records with short/truncated stored endTime cannot escape candidate query.
 */
export const MAX_CANONICAL_APPOINTMENT_SPAN_MINUTES = 720;
export const MAX_CANONICAL_APPOINTMENT_SPAN_MS = MAX_CANONICAL_APPOINTMENT_SPAN_MINUTES * 60 * 1000;

/**
 * Generates the Prisma where-clause conditions to reliably query ALL candidate appointments
 * whose effective occupied interval could overlap with [requestedStartUtc, requestedOccupiedEndUtc).
 * 
 * Guarantee:
 * Every appointment whose effective occupied interval overlaps [requestedStartUtc, requestedOccupiedEndUtc)
 * is guaranteed to be returned by this query. Zero false negatives across all supported record classes
 * (TREATMENT_END, LEGACY_OCCUPIED_END, ZERO_BUFFER, and AMBIGUOUS).
 */
export function buildConflictCandidateWhere(
  doctorId: string,
  requestedStartUtc: Date,
  requestedOccupiedEndUtc: Date,
  options?: {
    excludeAppointmentId?: string;
    statuses?: string[];
  },
) {
  const statuses = options?.statuses || ['PENDING', 'CONFIRMED', 'CHECKED_IN'];
  const where: any = {
    doctorId,
    status: { in: statuses },
    // Upper bound: appointment must start before requested slot ends
    startTime: { lt: requestedOccupiedEndUtc },
    // Lower bound:
    // 1. Stored endTime > (requestedStart - max possible buffer) (covers normal and legacy records)
    // 2. OR startTime > (requestedStart - MAX_CANONICAL_APPOINTMENT_SPAN_MS) (covers ambiguous records with truncated endTime)
    // 3. OR active overrun
    OR: [
      { endTime: { gt: new Date(requestedStartUtc.getTime() - ENFORCED_MAX_BUFFER_MS) } },
      { startTime: { gt: new Date(requestedStartUtc.getTime() - MAX_CANONICAL_APPOINTMENT_SPAN_MS) } },
      { overrunActive: true },
    ],
  };

  if (options?.excludeAppointmentId) {
    where.id = { not: options.excludeAppointmentId };
  }

  return where;
}
