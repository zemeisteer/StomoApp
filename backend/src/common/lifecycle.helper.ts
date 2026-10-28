import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AppointmentStatus, Prisma, StaffRole } from '@prisma/client';

export interface AuthenticatedActor {
  sub: string;
  email: string;
  role: StaffRole;
  doctorId?: string | null;
  tokenVersion?: number;
  id?: string;
}

/**
 * Resolves the authenticated actor's user ID from the JWT payload.
 * Fails closed if the identity cannot be established.
 */
export function resolveActorId(actor?: AuthenticatedActor | any): string {
  const userId = actor?.sub || actor?.id;
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    throw new UnauthorizedException('Foydalanuvchi identifikatori (sub) aniqlanmadi');
  }
  return userId.trim();
}

export interface BlockerAppointmentSummary {
  id: string;
  patientName: string;
  patientPhone: string;
  startTime: string;
  endTime?: string;
  status: AppointmentStatus;
  branchName?: string;
  doctorName?: string;
  serviceName?: string;
  actualStartTime?: string;
}

export interface EntityLifecycleBlockers {
  canProceed: boolean;
  actionType: 'DELETE' | 'ARCHIVE' | 'DEACTIVATE' | 'BLOCK';
  hasClinicalHistory: boolean;
  activeTreatments: BlockerAppointmentSummary[];
  futureAppointments: BlockerAppointmentSummary[];
  activeTreatmentCount: number;
  futureAppointmentCount: number;
  historicalAppointmentCount: number;
  totalAppointmentCount: number;
  resolutionGuidance: string;
}

export interface CheckLifecycleOptions {
  doctorId?: string;
  branchId?: string;
  serviceId?: string;
  removedBranchIds?: string[];
  removedServiceIds?: string[];
  defaultSafeAction?: 'DELETE' | 'ARCHIVE' | 'DEACTIVATE';
}

/**
 * Shared lifecycle policy helper used by every doctor and branch mutation path.
 * 
 * Invariants:
 * 1. Active treatments (in chair, checked in, actualStartTime active, active overruns,
 *    or reserved intervals that started but have not concluded) strictly BLOCK deletion/deactivation.
 * 2. Future active reservations (startTime > now, PENDING/CONFIRMED, unexpired) strictly BLOCK deletion/deactivation.
 * 3. Terminal appointments (COMPLETED, CANCELLED, NO_SHOW) and expired pending NEVER block;
 *    they count towards historical records.
 * 4. Bounded blocker candidate queries avoid loading unbounded historical records into Node.js memory.
 * 5. Historical records are counted at the database level.
 */
export async function checkEntityLifecycleBlockers(
  tx: Prisma.TransactionClient,
  options: CheckLifecycleOptions,
): Promise<EntityLifecycleBlockers> {
  const { doctorId, branchId, serviceId, removedBranchIds, removedServiceIds } = options;
  const now = new Date();

  // 1. Database-level total count
  const countWhere: Prisma.AppointmentWhereInput = {
    ...(doctorId ? { doctorId } : {}),
    ...(branchId ? { branchId } : {}),
    ...(serviceId ? { serviceId } : {}),
    ...(removedBranchIds && removedBranchIds.length > 0 ? { branchId: { in: removedBranchIds } } : {}),
    ...(removedServiceIds && removedServiceIds.length > 0 ? { serviceId: { in: removedServiceIds } } : {}),
  };
  const totalCount = await tx.appointment.count({ where: countWhere });

  // 2. Query only non-terminal, unexpired candidates that could be active or future
  const candidateWhere: Prisma.AppointmentWhereInput = {
    ...countWhere,
    status: {
      notIn: [AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
    },
    NOT: {
      status: AppointmentStatus.PENDING,
      expiresAt: { lte: now },
    },
    OR: [
      { status: AppointmentStatus.CHECKED_IN },
      { actualStartTime: { not: null } },
      { overrunActive: true },
      { endTime: { gt: now } },
      { overrunEstimatedEndTime: { gt: now } },
    ],
  };

  const candidates = await tx.appointment.findMany({
    where: candidateWhere,
    select: {
      id: true,
      status: true,
      startTime: true,
      endTime: true,
      durationMinutes: true,
      bufferMinutes: true,
      actualStartTime: true,
      overrunActive: true,
      overrunEstimatedEndTime: true,
      expiresAt: true,
      patient: { select: { fullName: true, phone: true } },
      branch: { select: { nameUz: true, nameRu: true } },
      doctor: { select: { firstNameUz: true, lastNameUz: true } },
      service: { select: { nameUz: true, nameRu: true } },
    },
    orderBy: { startTime: 'asc' },
    take: 100, // Bounded candidate list
  });

  const activeTreatments: BlockerAppointmentSummary[] = [];
  const futureAppointments: BlockerAppointmentSummary[] = [];

  for (const appt of candidates) {
    const isTerminal =
      appt.status === AppointmentStatus.COMPLETED ||
      appt.status === AppointmentStatus.CANCELLED ||
      appt.status === AppointmentStatus.NO_SHOW;
    if (isTerminal) continue;

    const isExpiredPending =
      appt.status === AppointmentStatus.PENDING &&
      appt.expiresAt &&
      new Date(appt.expiresAt) <= now;
    if (isExpiredPending) continue;

    // Occupied end calculation
    const treatmentEnd = new Date(appt.endTime);
    const occupiedEnd = new Date(
      appt.startTime.getTime() + (appt.durationMinutes + (appt.bufferMinutes || 0)) * 60 * 1000,
    );
    const effectiveOccupiedEnd =
      appt.overrunEstimatedEndTime && appt.overrunEstimatedEndTime > occupiedEnd
        ? appt.overrunEstimatedEndTime
        : occupiedEnd;

    // An appointment is ongoing / active if:
    // a) Explicitly checked in or actively in chair
    // b) Has active overrun
    // c) Reserved start time has passed, but the occupied interval is STILL ACTIVE (do not classify as historical!)
    const isOngoing =
      appt.status === AppointmentStatus.CHECKED_IN ||
      (appt.actualStartTime && !isTerminal) ||
      appt.overrunActive ||
      (appt.startTime <= now && (effectiveOccupiedEnd > now || treatmentEnd > now));

    if (isOngoing) {
      activeTreatments.push({
        id: appt.id,
        patientName: appt.patient?.fullName || 'Bemor',
        patientPhone: appt.patient?.phone || '',
        startTime: appt.startTime.toISOString(),
        endTime: appt.endTime.toISOString(),
        status: appt.status,
        branchName: appt.branch?.nameUz || '',
        doctorName: appt.doctor ? `Dr. ${appt.doctor.firstNameUz} ${appt.doctor.lastNameUz}` : '',
        serviceName: appt.service?.nameUz || '',
        actualStartTime: appt.actualStartTime ? appt.actualStartTime.toISOString() : undefined,
      });
      continue;
    }

    // Future active reservation
    const isFutureActive =
      appt.startTime > now &&
      (appt.status === AppointmentStatus.PENDING || appt.status === AppointmentStatus.CONFIRMED);

    if (isFutureActive) {
      futureAppointments.push({
        id: appt.id,
        patientName: appt.patient?.fullName || 'Bemor',
        patientPhone: appt.patient?.phone || '',
        startTime: appt.startTime.toISOString(),
        endTime: appt.endTime.toISOString(),
        status: appt.status,
        branchName: appt.branch?.nameUz || '',
        doctorName: appt.doctor ? `Dr. ${appt.doctor.firstNameUz} ${appt.doctor.lastNameUz}` : '',
        serviceName: appt.service?.nameUz || '',
      });
    }
  }

  const activeTreatmentCount = activeTreatments.length;
  const futureAppointmentCount = futureAppointments.length;
  const historicalAppointmentCount = Math.max(
    0,
    totalCount - activeTreatmentCount - futureAppointmentCount,
  );

  let canProceed = true;
  let actionType: 'DELETE' | 'ARCHIVE' | 'DEACTIVATE' | 'BLOCK' = options.defaultSafeAction || 'DELETE';
  let resolutionGuidance = '';

  if (activeTreatmentCount > 0) {
    canProceed = false;
    actionType = 'BLOCK';
    resolutionGuidance =
      `Ayni paytda muolajasi davom etayotgan ${activeTreatmentCount} ta bemor mavjud. ` +
      `Amalni bajarishdan oldin avval muolaja jarayonini yakunlang.`;
  } else if (futureAppointmentCount > 0) {
    canProceed = false;
    actionType = 'BLOCK';
    resolutionGuidance =
      `Kelgusiga rejalashtirilgan ${futureAppointmentCount} ta faol qabul mavjud. ` +
      `Bemorlarni qabulsiz qoldirmaslik uchun avval ushbu qabullarni boshqa mutaxassis/filialga ko'chiring yoki bekor qiling.`;
  } else if (historicalAppointmentCount > 0) {
    canProceed = true;
    actionType = options.defaultSafeAction === 'DEACTIVATE' ? 'DEACTIVATE' : 'ARCHIVE';
    resolutionGuidance =
      `O'tmishdagi qabullar tarixi (${historicalAppointmentCount} ta) mavjud. ` +
      `Klinik va moliyaviy yozuvlar yaxlitligini saqlash uchun yozuv nofaol/arxiv holatiga o'tkaziladi.`;
  } else {
    canProceed = true;
    actionType = 'DELETE';
    resolutionGuidance =
      `Qabullar tarixi mavjud emas. Ma'lumotlar tizimdan to'liq o'chirilishi mumkin.`;
  }

  return {
    canProceed,
    actionType,
    hasClinicalHistory: historicalAppointmentCount > 0 || activeTreatmentCount > 0 || futureAppointmentCount > 0,
    activeTreatments,
    futureAppointments,
    activeTreatmentCount,
    futureAppointmentCount,
    historicalAppointmentCount,
    totalAppointmentCount: totalCount,
    resolutionGuidance,
  };
}

/**
 * Asserts that the entity has no blocking active treatments or future appointments.
 * Throws standard 409 ConflictException with structured blocker payloads if blocked.
 */
export function assertLifecycleUnblocked(
  blockers: EntityLifecycleBlockers,
  entityTypeName: string = 'yozuv',
) {
  if (blockers.activeTreatmentCount > 0) {
    throw new ConflictException({
      statusCode: 409,
      error: 'ACTIVE_TREATMENT_IN_PROGRESS',
      message:
        `${entityTypeName}ni o'chirish/nofaol qilish taqiqlanadi: ayni paytda muolajada bo'lgan ` +
        `${blockers.activeTreatmentCount} ta bemor mavjud. Avval qabulni yakunlang.`,
      activeTreatments: blockers.activeTreatments,
    });
  }

  if (blockers.futureAppointmentCount > 0) {
    throw new ConflictException({
      statusCode: 409,
      error: 'FUTURE_APPOINTMENTS_EXIST',
      message:
        `${entityTypeName}ni o'chirish/nofaol qilish taqiqlanadi: kelgusida ` +
        `${blockers.futureAppointmentCount} ta tasdiqlangan yoki kutilayotgan qabul mavjud. ` +
        `Avval ushbu qabullarni ko'chiring yoki bekor qiling.`,
      futureAppointments: blockers.futureAppointments,
    });
  }
}
