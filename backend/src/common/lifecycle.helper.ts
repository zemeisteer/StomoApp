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

import {
  getAppointmentEffectiveOccupiedEnd,
  getAppointmentTreatmentEnd,
  ENFORCED_MAX_BUFFER_MS,
  MAX_CANONICAL_LOOKBACK_MS,
  MAX_SUPPORTED_DURATION_MINUTES,
} from '../appointments/appointment-time.helper';

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
  futureAppointmentsTruncated?: boolean;
  futureAppointmentsDisplayLimit?: number;
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
 * Builds Prisma where-clause conditions for matching appointments that reference
 * any of the specified service IDs, checking both primary serviceId and secondary
 * AppointmentServiceItem entries (including originalServiceId for legacy provenance).
 */
function buildServiceCondition(serviceIds: string[]): Prisma.AppointmentWhereInput {
  if (serviceIds.length === 0) return {};
  return {
    OR: [
      { serviceId: { in: serviceIds } },
      {
        serviceItems: {
          some: {
            OR: [
              { serviceId: { in: serviceIds } },
              { originalServiceId: { in: serviceIds } },
            ],
          },
        },
      },
    ],
  };
}

/**
 * Shared lifecycle policy helper used by every doctor and branch mutation path.
 * 
 * Invariants:
 * 1. Exact counts / existence checks are strictly separated from bounded display lists.
 *    A display limit must never alter lifecycle decisions or reported counts.
 * 2. Active treatments (in chair, checked in, actualStartTime active, active overruns,
 *    or reserved intervals that started whose effective occupied interval including buffer is still active)
 *    strictly BLOCK deletion/deactivation.
 * 3. Future active reservations (startTime > now, PENDING/CONFIRMED, unexpired) strictly BLOCK deletion/deactivation.
 * 4. Multi-service appointments protect every relevant service item (both primary serviceId
 *    and secondary serviceItems entries) counted once per appointment.
 * 5. Terminal appointments (COMPLETED, CANCELLED, NO_SHOW) and expired pending NEVER block;
 *    they count towards historical records.
 */
export async function checkEntityLifecycleBlockers(
  tx: Prisma.TransactionClient,
  options: CheckLifecycleOptions,
): Promise<EntityLifecycleBlockers> {
  const { doctorId, branchId, serviceId, removedBranchIds, removedServiceIds } = options;
  const now = new Date();

  // 1. Build authoritative scoping filter (combining doctor, branch, and service conditions)
  const andConditions: Prisma.AppointmentWhereInput[] = [];

  if (doctorId) {
    andConditions.push({ doctorId });
  }

  if (branchId) {
    andConditions.push({ branchId });
  } else if (removedBranchIds && removedBranchIds.length > 0) {
    andConditions.push({ branchId: { in: removedBranchIds } });
  }

  const targetServiceIds: string[] = [];
  if (serviceId) {
    targetServiceIds.push(serviceId);
  }
  if (removedServiceIds && removedServiceIds.length > 0) {
    targetServiceIds.push(...removedServiceIds);
  }
  if (targetServiceIds.length > 0) {
    const uniqueServiceIds = Array.from(new Set(targetServiceIds));
    andConditions.push(buildServiceCondition(uniqueServiceIds));
  }

  const countWhere: Prisma.AppointmentWhereInput = andConditions.length > 0 ? { AND: andConditions } : {};

  // 2. Exact Database-level total count
  const totalCount = await tx.appointment.count({ where: countWhere });

  // 3. Exact Database-level future appointment count (PENDING / CONFIRMED, startTime > now, unexpired)
  const futureAppointmentCount = await tx.appointment.count({
    where: {
      ...countWhere,
      startTime: { gt: now },
      status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
      NOT: {
        status: AppointmentStatus.PENDING,
        expiresAt: { lte: now },
      },
    },
  });

  // 4. Candidate query for currently active treatments
  // Query all non-terminal, unexpired appointments with startTime <= now whose treatment or buffer could be ongoing
  const candidateActiveWhere: Prisma.AppointmentWhereInput = {
    ...countWhere,
    status: {
      notIn: [AppointmentStatus.COMPLETED, AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW],
    },
    NOT: {
      status: AppointmentStatus.PENDING,
      expiresAt: { lte: now },
    },
    startTime: { lte: now },
    OR: [
      { status: AppointmentStatus.CHECKED_IN },
      { actualStartTime: { not: null } },
      { overrunActive: true },
      { overrunEstimatedEndTime: { gt: now } },
      // Treatment ended recently but occupied interval including buffer may still be active:
      { endTime: { gt: new Date(now.getTime() - ENFORCED_MAX_BUFFER_MS) } },
      { startTime: { gt: new Date(now.getTime() - MAX_CANONICAL_LOOKBACK_MS) } },
      { durationMinutes: { gt: MAX_SUPPORTED_DURATION_MINUTES } },
    ],
  };

  const activeCandidates = await tx.appointment.findMany({
    where: candidateActiveWhere,
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
      serviceItems: { select: { serviceId: true, originalServiceId: true, serviceNameUz: true } },
    },
    orderBy: { startTime: 'asc' },
  });

  const activeTreatments: BlockerAppointmentSummary[] = [];

  for (const appt of activeCandidates) {
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

    let isOngoing = false;
    if (appt.status === AppointmentStatus.CHECKED_IN || (appt.actualStartTime && !isTerminal) || appt.overrunActive) {
      isOngoing = true;
    } else {
      try {
        const effectiveOccupiedEnd = getAppointmentEffectiveOccupiedEnd(appt);
        const treatmentEnd = getAppointmentTreatmentEnd(appt);
        if (appt.startTime <= now && (effectiveOccupiedEnd > now || treatmentEnd > now)) {
          isOngoing = true;
        }
      } catch {
        // Fail-closed policy for legacy / ambiguous records:
        // If timestamps or duration are ambiguous/invalid and started <= now, treat as ongoing blocker
        isOngoing = true;
      }
    }

    if (isOngoing) {
      let resolvedServiceName = appt.service?.nameUz || '';
      if (targetServiceIds.length > 0 && appt.serviceItems && appt.serviceItems.length > 0) {
        const matchedItem = appt.serviceItems.find(
          (item) =>
            (item.serviceId && targetServiceIds.includes(item.serviceId)) ||
            (item.originalServiceId && targetServiceIds.includes(item.originalServiceId)),
        );
        if (matchedItem && matchedItem.serviceNameUz) {
          resolvedServiceName = matchedItem.serviceNameUz;
        }
      }

      activeTreatments.push({
        id: appt.id,
        patientName: appt.patient?.fullName || 'Bemor',
        patientPhone: appt.patient?.phone || '',
        startTime: appt.startTime.toISOString(),
        endTime: appt.endTime ? appt.endTime.toISOString() : undefined,
        status: appt.status,
        branchName: appt.branch?.nameUz || '',
        doctorName: appt.doctor ? `Dr. ${appt.doctor.firstNameUz} ${appt.doctor.lastNameUz}` : '',
        serviceName: resolvedServiceName,
        actualStartTime: appt.actualStartTime ? appt.actualStartTime.toISOString() : undefined,
      });
    }
  }

  const activeTreatmentCount = activeTreatments.length;

  // 5. Bounded display preview list for future appointments (does NOT affect decision counts!)
  const DISPLAY_PREVIEW_LIMIT = 10;
  const futurePreviewCandidates = await tx.appointment.findMany({
    where: {
      ...countWhere,
      startTime: { gt: now },
      status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
      NOT: {
        status: AppointmentStatus.PENDING,
        expiresAt: { lte: now },
      },
    },
    select: {
      id: true,
      status: true,
      startTime: true,
      endTime: true,
      actualStartTime: true,
      patient: { select: { fullName: true, phone: true } },
      branch: { select: { nameUz: true, nameRu: true } },
      doctor: { select: { firstNameUz: true, lastNameUz: true } },
      service: { select: { nameUz: true, nameRu: true } },
      serviceItems: { select: { serviceId: true, originalServiceId: true, serviceNameUz: true } },
    },
    orderBy: { startTime: 'asc' },
    take: DISPLAY_PREVIEW_LIMIT,
  });

  const futureAppointments: BlockerAppointmentSummary[] = futurePreviewCandidates.map((appt) => {
    let resolvedServiceName = appt.service?.nameUz || '';
    if (targetServiceIds.length > 0 && appt.serviceItems && appt.serviceItems.length > 0) {
      const matchedItem = appt.serviceItems.find(
        (item) =>
          (item.serviceId && targetServiceIds.includes(item.serviceId)) ||
          (item.originalServiceId && targetServiceIds.includes(item.originalServiceId)),
      );
      if (matchedItem && matchedItem.serviceNameUz) {
        resolvedServiceName = matchedItem.serviceNameUz;
      }
    }

    return {
      id: appt.id,
      patientName: appt.patient?.fullName || 'Bemor',
      patientPhone: appt.patient?.phone || '',
      startTime: appt.startTime.toISOString(),
      endTime: appt.endTime ? appt.endTime.toISOString() : undefined,
      status: appt.status,
      branchName: appt.branch?.nameUz || '',
      doctorName: appt.doctor ? `Dr. ${appt.doctor.firstNameUz} ${appt.doctor.lastNameUz}` : '',
      serviceName: resolvedServiceName,
    };
  });

  // 6. Compute exact historical appointment count using exact counts
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
    futureAppointmentsTruncated: futureAppointmentCount > futureAppointments.length,
    futureAppointmentsDisplayLimit: DISPLAY_PREVIEW_LIMIT,
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
