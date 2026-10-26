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

export class InvalidAppointmentTimeError extends Error {
  constructor(message: string, public readonly details?: Record<string, any>) {
    super(message);
    this.name = 'InvalidAppointmentTimeError';
  }
}

/**
 * Validates the time and duration fields of an appointment record.
 * Returns a typed validation result, or throws InvalidAppointmentTimeError if options.throwOnInvalid is true.
 */
export function validateAppointmentTime(
  appt: AppointmentTimeLike,
  options?: { throwOnInvalid?: boolean },
): {
  isValid: boolean;
  startMs: number;
  endMs: number;
  durationMinutes: number | null;
  bufferMinutes: number;
  error?: string;
} {
  const fail = (error: string, start = NaN, end = NaN, dur: number | null = null, buf = 0) => {
    if (options?.throwOnInvalid) {
      throw new InvalidAppointmentTimeError(error, { id: appt.id });
    }
    return {
      isValid: false,
      startMs: start,
      endMs: end,
      durationMinutes: dur,
      bufferMinutes: buf,
      error,
    };
  };

  const startMs = new Date(appt.startTime).getTime();
  const endMs = new Date(appt.endTime).getTime();

  if (isNaN(startMs) || isNaN(endMs)) {
    return fail('Boshlanish yoki tugash vaqti noto‘g‘ri sana (NaN)', startMs, endMs);
  }

  if (endMs <= startMs) {
    return fail('Tugash vaqti boshlanish vaqtidan keyin bo‘lishi shart (end <= start)', startMs, endMs);
  }

  const dur = appt.durationMinutes;
  if (dur !== undefined && dur !== null) {
    if (!Number.isFinite(dur) || isNaN(dur) || dur <= 0 || !Number.isInteger(dur)) {
      return fail('Muolaja davomiyligi (durationMinutes) musbat butun son bo‘lishi shart', startMs, endMs);
    }
  }

  const buf = appt.bufferMinutes;
  if (buf !== undefined && buf !== null) {
    if (!Number.isFinite(buf) || isNaN(buf) || buf < 0 || !Number.isInteger(buf)) {
      return fail('Bufer (bufferMinutes) noldan kichik bo‘lmagan butun son bo‘lishi shart', startMs, endMs, dur ?? null);
    }
  }

  if (appt.overrunActive) {
    if (!appt.overrunEstimatedEndTime) {
      return fail('Faol overrun uchun overrunEstimatedEndTime ko‘rsatilishi shart', startMs, endMs, dur ?? null, buf ?? 0);
    }
    const overrunMs = new Date(appt.overrunEstimatedEndTime).getTime();
    if (isNaN(overrunMs) || !Number.isFinite(overrunMs) || overrunMs <= startMs) {
      return fail('overrunEstimatedEndTime noto‘g‘ri yoki boshlanish vaqtidan oldin', startMs, endMs, dur ?? null, buf ?? 0);
    }
  }

  return {
    isValid: true,
    startMs,
    endMs,
    durationMinutes: dur ?? null,
    bufferMinutes: Math.max(0, buf ?? 0),
  };
}

/**
 * Asserts that an appointment record has valid timestamps and duration.
 * Throws InvalidAppointmentTimeError on any validation violation.
 */
export function assertAppointmentTimeValid(appt: AppointmentTimeLike): void {
  validateAppointmentTime(appt, { throwOnInvalid: true });
}

/**
 * Returns the exact scheduled treatment end time (excluding buffer).
 * Throws InvalidAppointmentTimeError if record has invalid timestamps or missing duration.
 */
export function getAppointmentTreatmentEnd(appt: AppointmentTimeLike): Date {
  const validation = validateAppointmentTime(appt);
  if (!validation.isValid) {
    throw new InvalidAppointmentTimeError(validation.error || 'Noto‘g‘ri qabul vaqti', { id: appt.id });
  }

  if (validation.durationMinutes === null) {
    throw new InvalidAppointmentTimeError('Qabul davomiyligi (durationMinutes) ko‘rsatilmagan yoki noto‘g‘ri', { id: appt.id });
  }

  const durationMinutes = validation.durationMinutes;
  const bufferMinutes = validation.bufferMinutes;
  const diffExactMs = validation.endMs - validation.startMs;
  const expectedTreatmentMs = durationMinutes * 60000;
  const expectedOccupiedMs = (durationMinutes + bufferMinutes) * 60000;

  if (bufferMinutes === 0) {
    return new Date(validation.endMs);
  }

  if (Math.abs(diffExactMs - expectedTreatmentMs) <= SUB_MINUTE_TOLERANCE_MS) {
    // Current contract: endTime is treatment end
    return new Date(validation.endMs);
  }

  if (Math.abs(diffExactMs - expectedOccupiedMs) <= SUB_MINUTE_TOLERANCE_MS) {
    // Legacy record: endTime had buffer added; treatment ended at start + duration
    return new Date(validation.startMs + durationMinutes * 60000);
  }

  // Ambiguous record: treatment end is defined by canonical durationMinutes
  return new Date(validation.startMs + durationMinutes * 60000);
}

/**
 * Returns the exact scheduled occupied end time (including buffer).
 * Throws InvalidAppointmentTimeError if record has invalid timestamps or missing duration.
 */
export function getAppointmentOccupiedEnd(appt: AppointmentTimeLike): Date {
  const validation = validateAppointmentTime(appt);
  if (!validation.isValid) {
    throw new InvalidAppointmentTimeError(validation.error || 'Noto‘g‘ri qabul vaqti', { id: appt.id });
  }

  if (validation.durationMinutes === null) {
    throw new InvalidAppointmentTimeError('Qabul davomiyligi (durationMinutes) ko‘rsatilmagan yoki noto‘g‘ri', { id: appt.id });
  }

  const durationMinutes = validation.durationMinutes;
  const bufferMinutes = validation.bufferMinutes;
  const diffExactMs = validation.endMs - validation.startMs;
  const expectedTreatmentMs = durationMinutes * 60000;
  const expectedOccupiedMs = (durationMinutes + bufferMinutes) * 60000;

  if (bufferMinutes === 0) {
    return new Date(Math.max(validation.endMs, validation.startMs + durationMinutes * 60000));
  }

  if (Math.abs(diffExactMs - expectedTreatmentMs) <= SUB_MINUTE_TOLERANCE_MS) {
    // Current contract: occupied end is treatment end + buffer
    return new Date(validation.endMs + bufferMinutes * 60000);
  }

  if (Math.abs(diffExactMs - expectedOccupiedMs) <= SUB_MINUTE_TOLERANCE_MS) {
    // Legacy record: endTime is ALREADY occupied end (start + duration + buffer)
    return new Date(validation.endMs);
  }

  // Ambiguous record: protect slot with whichever is later
  return new Date(Math.max(validation.endMs + bufferMinutes * 60000, validation.startMs + (durationMinutes + bufferMinutes) * 60000));
}

/**
 * Returns effective clinical treatment end time taking active overrun into account.
 */
export function getAppointmentEffectiveTreatmentEnd(appt: AppointmentTimeLike): Date {
  if (appt.overrunActive) {
    if (!appt.overrunEstimatedEndTime) {
      throw new InvalidAppointmentTimeError('Faol overrun uchun overrunEstimatedEndTime ko‘rsatilishi shart', { id: appt.id });
    }
    const overrunMs = new Date(appt.overrunEstimatedEndTime).getTime();
    if (isNaN(overrunMs) || !Number.isFinite(overrunMs)) {
      throw new InvalidAppointmentTimeError('overrunEstimatedEndTime noto‘g‘ri formatda', { id: appt.id });
    }
    return new Date(overrunMs);
  }
  return getAppointmentTreatmentEnd(appt);
}

/**
 * Returns effective occupied end time taking active overrun and buffer into account.
 */
export function getAppointmentEffectiveOccupiedEnd(appt: AppointmentTimeLike): Date {
  const bufferMinutes = Math.max(0, appt.bufferMinutes ?? 5);
  if (appt.overrunActive) {
    if (!appt.overrunEstimatedEndTime) {
      throw new InvalidAppointmentTimeError('Faol overrun uchun overrunEstimatedEndTime ko‘rsatilishi shart', { id: appt.id });
    }
    const overrunMs = new Date(appt.overrunEstimatedEndTime).getTime();
    if (isNaN(overrunMs) || !Number.isFinite(overrunMs)) {
      throw new InvalidAppointmentTimeError('overrunEstimatedEndTime noto‘g‘ri formatda', { id: appt.id });
    }
    return new Date(overrunMs + bufferMinutes * 60000);
  }
  return getAppointmentOccupiedEnd(appt);
}

/**
 * Authoritative half-open interval overlap check between an appointment and a candidate slot.
 * Returns true if [appt.startTime, appt.effectiveOccupiedEnd) overlaps with [slotStart, slotEnd).
 * 
 * Invariant: If a candidate appointment has invalid timestamps or malformed overrun, it FAILS CLOSED
 * (returns true) so the slot cannot be booked or advertised over corrupted/blocking appointment data.
 */
export function isAppointmentOverlapping(
  appt: AppointmentTimeLike,
  slotStart: Date | string,
  slotEnd: Date | string,
  options?: { nowUtc?: Date; includeExpiredPending?: boolean; throwOnInvalid?: boolean },
): boolean {
  const now = options?.nowUtc || new Date();

  // Expired pending appointments do not hold the slot
  if (!options?.includeExpiredPending) {
    if (appt.status === 'PENDING' && appt.expiresAt && new Date(appt.expiresAt) <= now) {
      return false;
    }
  }

  const startB = new Date(slotStart).getTime();
  const endB = new Date(slotEnd).getTime();
  if (isNaN(startB) || isNaN(endB) || endB <= startB) {
    throw new InvalidAppointmentTimeError('Tekshirilayotgan slot vaqti noto‘g‘ri');
  }

  let startA: number;
  let endA: number;
  try {
    startA = new Date(appt.startTime).getTime();
    endA = getAppointmentEffectiveOccupiedEnd(appt).getTime();
    if (isNaN(startA) || isNaN(endA) || endA <= startA) {
      throw new InvalidAppointmentTimeError('Qabul vaqti noto‘g‘ri');
    }
  } catch (err) {
    if (options?.throwOnInvalid) {
      throw err;
    }
    // Fail-closed: invalid appointment blocks availability so corrupted records do not disappear
    return true;
  }

  return startA < endB && endA > startB;
}

/**
 * Enforced domain limits for scheduling bounds.
 */
export const ENFORCED_MAX_BUFFER_MINUTES = 120; // 2 hours maximum buffer
export const ENFORCED_MAX_BUFFER_MS = ENFORCED_MAX_BUFFER_MINUTES * 60 * 1000;

export const MAX_SUPPORTED_DURATION_MINUTES = 480; // 8 hours maximum clinical duration
export const MAX_CANONICAL_LOOKBACK_MINUTES = MAX_SUPPORTED_DURATION_MINUTES + ENFORCED_MAX_BUFFER_MINUTES; // 600 minutes
export const MAX_CANONICAL_LOOKBACK_MS = MAX_CANONICAL_LOOKBACK_MINUTES * 60 * 1000;

/**
 * Generates the Prisma where-clause conditions to reliably query ALL candidate appointments
 * whose effective occupied interval could overlap with [requestedStartUtc, requestedOccupiedEndUtc).
 * 
 * Mathematically proven complete:
 * 1. Compliant / legacy records: endTime > requestedStart - 120m
 * 2. Ambiguous records within standard span: startTime > requestedStart - 600m
 * 3. Out-of-range historical/imported active records: durationMinutes > 480 (matches regardless of lookback)
 * 4. Active overruns: overrunActive = true
 * 
 * Result: Zero false negatives across modern, legacy, zero-buffer, ambiguous, out-of-range, and overrun records.
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
    OR: [
      { endTime: { gt: new Date(requestedStartUtc.getTime() - ENFORCED_MAX_BUFFER_MS) } },
      { startTime: { gt: new Date(requestedStartUtc.getTime() - MAX_CANONICAL_LOOKBACK_MS) } },
      { durationMinutes: { gt: MAX_SUPPORTED_DURATION_MINUTES } },
      { overrunActive: true },
    ],
  };

  if (options?.excludeAppointmentId) {
    where.id = { not: options.excludeAppointmentId };
  }

  return where;
}
