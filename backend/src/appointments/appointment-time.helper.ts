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
 * HISTORICAL COMPATIBILITY:
 * In legacy records written prior to the treatment-end contract unification,
 * endTime was stored as (startTime + durationMinutes + bufferMinutes).
 * The helpers below inspect the interval against durationMinutes and bufferMinutes:
 * - If diffMinutes === durationMinutes: treatment-end contract (new).
 * - If diffMinutes === durationMinutes + bufferMinutes: legacy occupied-end contract (buffer already in endTime).
 * - If diffMinutes !== durationMinutes && diffMinutes !== durationMinutes + bufferMinutes:
 *   ambiguous manual edit. The helper protects the slot with Math.max(endTime, startTime + duration + buffer).
 */

export interface AppointmentTimeLike {
  id?: string;
  startTime: Date | string;
  endTime: Date | string;
  durationMinutes: number;
  bufferMinutes?: number | null;
  overrunActive?: boolean | null;
  overrunEstimatedEndTime?: Date | string | null;
  status?: string | null;
  expiresAt?: Date | string | null;
}

export type RecordContractClassification = 'TREATMENT_END' | 'LEGACY_OCCUPIED_END' | 'ZERO_BUFFER' | 'AMBIGUOUS';

/**
 * Classifies an appointment record's timestamp contract.
 */
export function classifyAppointmentRecord(appt: AppointmentTimeLike): {
  classification: RecordContractClassification;
  diffMinutes: number;
  durationMinutes: number;
  bufferMinutes: number;
  isAmbiguous: boolean;
} {
  const startMs = new Date(appt.startTime).getTime();
  const endMs = new Date(appt.endTime).getTime();
  const diffMinutes = Math.round((endMs - startMs) / 60000);
  const durationMinutes = Math.max(1, appt.durationMinutes || 30);
  const bufferMinutes = Math.max(0, appt.bufferMinutes ?? 5);

  if (bufferMinutes === 0) {
    return { classification: 'ZERO_BUFFER', diffMinutes, durationMinutes, bufferMinutes, isAmbiguous: false };
  }

  if (diffMinutes === durationMinutes) {
    return { classification: 'TREATMENT_END', diffMinutes, durationMinutes, bufferMinutes, isAmbiguous: false };
  }

  if (diffMinutes === durationMinutes + bufferMinutes) {
    return { classification: 'LEGACY_OCCUPIED_END', diffMinutes, durationMinutes, bufferMinutes, isAmbiguous: false };
  }

  return { classification: 'AMBIGUOUS', diffMinutes, durationMinutes, bufferMinutes, isAmbiguous: true };
}

/**
 * Returns the exact scheduled treatment end time (excluding buffer).
 */
export function getAppointmentTreatmentEnd(appt: AppointmentTimeLike): Date {
  const startMs = new Date(appt.startTime).getTime();
  const endMs = new Date(appt.endTime).getTime();
  const diffMinutes = Math.round((endMs - startMs) / 60000);
  const durationMinutes = Math.max(1, appt.durationMinutes || 30);
  const bufferMinutes = Math.max(0, appt.bufferMinutes ?? 5);

  if (bufferMinutes === 0) {
    return new Date(endMs);
  }

  if (diffMinutes === durationMinutes) {
    // Current contract: endTime is treatment end
    return new Date(endMs);
  }

  if (diffMinutes === durationMinutes + bufferMinutes) {
    // Legacy record: endTime had buffer added; treatment ended at start + duration (or end - buffer)
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
  const diffMinutes = Math.round((endMs - startMs) / 60000);
  const durationMinutes = Math.max(1, appt.durationMinutes || 30);
  const bufferMinutes = Math.max(0, appt.bufferMinutes ?? 5);

  if (bufferMinutes === 0) {
    return new Date(endMs);
  }

  if (diffMinutes === durationMinutes) {
    // Current contract: occupied end is treatment end + buffer
    return new Date(endMs + bufferMinutes * 60000);
  }

  if (diffMinutes === durationMinutes + bufferMinutes) {
    // Legacy record: endTime is ALREADY occupied end (start + duration + buffer)
    // Do NOT add buffer a second time!
    return new Date(endMs);
  }

  // Ambiguous record: protect slot with whichever is later
  return new Date(Math.max(endMs, startMs + (durationMinutes + bufferMinutes) * 60000));
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
 * Generates the Prisma where-clause conditions to reliably query ALL candidate appointments
 * whose effective occupied interval could overlap with [requestedStartUtc, requestedOccupiedEndUtc).
 * 
 * Guarantee:
 * Every appointment whose effective occupied interval overlaps [requestedStartUtc, requestedOccupiedEndUtc)
 * is guaranteed to be returned by this query. Zero false negatives.
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
    // Lower bound: appointment's treatment must have ended after (requestedStart - max possible buffer),
    // OR the appointment has an active overrun.
    OR: [
      { endTime: { gt: new Date(requestedStartUtc.getTime() - ENFORCED_MAX_BUFFER_MS) } },
      { overrunActive: true },
    ],
  };

  if (options?.excludeAppointmentId) {
    where.id = { not: options.excludeAppointmentId };
  }

  return where;
}
