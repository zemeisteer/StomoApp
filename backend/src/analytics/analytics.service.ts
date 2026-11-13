import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentStatus, DayOfWeek, ExceptionType, LeadStatus, PaymentMethod, Prisma } from '@prisma/client';
import { fromZonedTime, toZonedTime, formatInTimeZone } from 'date-fns-tz';

export interface AnalyticsFilterParams {
  startDate?: string;
  endDate?: string;
  branchId?: string;
  doctorId?: string;
  serviceId?: string;
}

interface TimeInterval {
  start: number; // minutes from 00:00 (0 to 1440)
  end: number;
}

function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function subtractInterval(base: TimeInterval, toSubtract: TimeInterval): TimeInterval[] {
  if (toSubtract.end <= base.start || toSubtract.start >= base.end) {
    return [base];
  }
  const result: TimeInterval[] = [];
  if (toSubtract.start > base.start) {
    result.push({ start: base.start, end: Math.min(base.end, toSubtract.start) });
  }
  if (toSubtract.end < base.end) {
    result.push({ start: Math.max(base.start, toSubtract.end), end: base.end });
  }
  return result;
}

function mergeIntervals(intervals: TimeInterval[]): TimeInterval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: TimeInterval[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

export function allocateIntegerAmounts(totalAmount: number, weights: number[]): number[] {
  if (totalAmount === 0 || weights.length === 0) {
    return weights.map(() => 0);
  }
  const sign = totalAmount < 0 ? -1 : 1;
  const absTotal = Math.abs(totalAmount);
  const totalWeight = weights.reduce((acc, w) => acc + Math.max(0, w), 0);
  if (totalWeight === 0) {
    const base = Math.floor(absTotal / weights.length);
    const rem = absTotal - base * weights.length;
    return weights.map((_, i) => sign * (base + (i < rem ? 1 : 0)));
  }

  const unrounded = weights.map((w) => (Math.max(0, w) / totalWeight) * absTotal);
  const floors = unrounded.map((u) => Math.floor(u));
  const remainder = absTotal - floors.reduce((acc, f) => acc + f, 0);

  const fractionalParts = unrounded.map((u, i) => ({
    fraction: u - floors[i],
    index: i,
  }));
  fractionalParts.sort((a, b) => b.fraction - a.fraction);

  const result = [...floors];
  for (let i = 0; i < remainder; i++) {
    result[fractionalParts[i].index] += 1;
  }
  return result.map((r) => r * sign);
}

const DOW_ENUM_MAP: Record<number, DayOfWeek> = {
  0: DayOfWeek.SUNDAY,
  1: DayOfWeek.MONDAY,
  2: DayOfWeek.TUESDAY,
  3: DayOfWeek.WEDNESDAY,
  4: DayOfWeek.THURSDAY,
  5: DayOfWeek.FRIDAY,
  6: DayOfWeek.SATURDAY,
};

const ALLOWED_EVENT_TYPES = new Set([
  'booking_started',
  'booking_step_changed',
  'booking_submitted',
  'booking_cancelled',
  'page_view',
  'service_viewed',
  'doctor_viewed',
  'cta_clicked',
]);

const ALLOWED_METADATA_KEYS = new Set([
  'branchId',
  'doctorId',
  'serviceId',
  'step',
  'locale',
  'source',
  'deviceType',
]);

const ELIGIBLE_UTILIZATION_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.PENDING,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.COMPLETED,
];

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Log first-party anonymous analytics event with strict allowlisting and zero patient PII.
   * Strips query parameters, hashes, and normalizes public tokens in URLs.
   */
  async recordEvent(
    eventType: string,
    sessionId?: string,
    page?: string,
    referrer?: string,
    metadata?: Record<string, any>,
  ) {
    if (!ALLOWED_EVENT_TYPES.has(eventType)) {
      eventType = 'page_view';
    }

    let sanitizedPage = page ? page.split('?')[0].split('#')[0] : null;
    if (sanitizedPage) {
      sanitizedPage = sanitizedPage.replace(/\/booking\/status\/[^\/?#]+/g, '/booking/status/[token]');
    }

    let sanitizedReferrer = referrer ? referrer.split('?')[0].split('#')[0] : null;
    if (sanitizedReferrer) {
      sanitizedReferrer = sanitizedReferrer.replace(/\/booking\/status\/[^\/?#]+/g, '/booking/status/[token]');
    }

    // Sanitize metadata against allowlist (strictly exclude names, phones, emails, notes)
    const sanitizedMetadata: Record<string, any> = {};
    if (metadata && typeof metadata === 'object') {
      for (const [key, val] of Object.entries(metadata)) {
        if (ALLOWED_METADATA_KEYS.has(key)) {
          sanitizedMetadata[key] = typeof val === 'string' ? val.slice(0, 100) : val;
        }
      }
    }

    return this.prisma.analyticsEvent.create({
      data: {
        eventType,
        sessionId: sessionId || null,
        page: sanitizedPage,
        referrer: sanitizedReferrer,
        metadata: sanitizedMetadata as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Comprehensive operational analytics with database aggregation,
   * configurable timezone boundaries, exact interval-based doctor utilization,
   * true new/returning patient classification, and payment ledger.
   */
  async getDashboardAnalytics(filters: AnalyticsFilterParams) {
    const { startDate, endDate, branchId, doctorId, serviceId } = filters;

    // Read clinic timezone dynamically from settings
    const clinicSettings = await this.prisma.clinicSettings.findFirst();
    const timezone = clinicSettings?.timezone || 'Asia/Tashkent';

    // Parse start and end dates with exact clinic timezone boundaries
    // Default to current calendar month in the clinic timezone
    const nowInTz = toZonedTime(new Date(), timezone);
    const curYear = nowInTz.getFullYear();
    const curMonth = nowInTz.getMonth();
    const startOfMonthStr = `${curYear}-${String(curMonth + 1).padStart(2, '0')}-01`;
    const lastDayOfMonth = new Date(Date.UTC(curYear, curMonth + 1, 0)).getUTCDate();
    const endOfMonthStr = `${curYear}-${String(curMonth + 1).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;

    let start: Date;
    if (startDate) {
      const datePart = startDate.split('T')[0];
      start = fromZonedTime(`${datePart} 00:00:00`, timezone);
    } else {
      start = fromZonedTime(`${startOfMonthStr} 00:00:00`, timezone);
    }

    let end: Date;
    if (endDate) {
      const datePart = endDate.split('T')[0];
      end = fromZonedTime(`${datePart} 23:59:59.999`, timezone);
    } else {
      end = fromZonedTime(`${endOfMonthStr} 23:59:59.999`, timezone);
    }

    if (start.getTime() > end.getTime()) {
      throw new BadRequestException('Boshlanish sanasi tugash sanasidan oldin bo\'lishi shart');
    }

    const rangeDays = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    if (rangeDays > 365) {
      throw new BadRequestException('Tahlil davri 365 kundan oshmasligi kerak');
    }

    const appointmentWhere: Prisma.AppointmentWhereInput = {
      startTime: {
        gte: start,
        lte: end,
      },
    };

    if (branchId) appointmentWhere.branchId = branchId;
    if (doctorId) appointmentWhere.doctorId = doctorId;
    if (serviceId) {
      appointmentWhere.OR = [
        { serviceId: serviceId },
        { serviceItems: { some: { serviceId: serviceId } } },
      ];
    }

    // 1. Status breakdown
    const statusCounts = await this.prisma.appointment.groupBy({
      by: ['status'],
      where: appointmentWhere,
      _count: true,
    });

    const statusMap: Record<string, number> = {
      [AppointmentStatus.PENDING]: 0,
      [AppointmentStatus.CONFIRMED]: 0,
      [AppointmentStatus.CHECKED_IN]: 0,
      [AppointmentStatus.COMPLETED]: 0,
      [AppointmentStatus.CANCELLED]: 0,
      [AppointmentStatus.NO_SHOW]: 0,
    };

    let totalAppointments = 0;
    for (const item of statusCounts) {
      statusMap[item.status] = item._count;
      totalAppointments += item._count;
    }

    const completed = statusMap[AppointmentStatus.COMPLETED];
    const cancelled = statusMap[AppointmentStatus.CANCELLED];
    const noShow = statusMap[AppointmentStatus.NO_SHOW];

    const completionRate = totalAppointments > 0 ? (completed / totalAppointments) * 100 : 0;
    const cancellationRate = totalAppointments > 0 ? (cancelled / totalAppointments) * 100 : 0;
    const noShowRate = totalAppointments > 0 ? (noShow / totalAppointments) * 100 : 0;

    // 2. Multi-Service Appointments, Service Usage, and Service-Specific Revenue
    // Query all appointments matching filter to count:
    // a) Distinct appointment counts vs individual service usages
    // b) Service items from multi-service appointments without double-counting appointments
    // c) Single-service legacy appointments lacking appointmentServiceItem rows
    // d) Service-specific revenue using exact deterministic per-payment integer allocation
    const serviceAppointments = await this.prisma.appointment.findMany({
      where: appointmentWhere,
      select: {
        id: true,
        status: true,
        arrivedAt: true,
        actualStartTime: true,
        actualEndTime: true,
        serviceId: true,
        serviceName: true,
        servicePriceFrom: true,
        serviceItems: {
          select: {
            id: true,
            serviceId: true,
            serviceNameUz: true,
            serviceNameRu: true,
            priceFrom: true,
            durationMinutes: true,
            isLegacyBundle: true,
            sortOrder: true,
          },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        },
        payments: {
          select: {
            id: true,
            amount: true,
            isRefund: true,
            recordedAt: true,
          },
          orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
        },
      },
      orderBy: [{ startTime: 'asc' }, { id: 'asc' }],
    });

    const serviceStatsMap = new Map<
      string,
      {
        serviceId?: string;
        nameUz: string;
        nameRu?: string | null;
        bookedCount: number;
        performedCount: number;
        distinctAppointmentIds: Set<string>;
        quotedValueMinor: number;
        grossPaymentsMinor: number;
        refundsMinor: number;
        netRevenueMinor: number;
        revenueMinor: number;
      }
    >();

    let totalServiceBooked = 0;
    let totalServicePerformed = 0;
    let legacyBundlesCount = 0;
    let legacyGrossMinor = 0;
    let legacyRefundsMinor = 0;
    let totalQuotedMinor = 0;
    let arrivedAppointmentsCount = 0;
    let inTreatmentAppointmentsCount = 0;

    for (const appt of serviceAppointments) {
      if (appt.status === AppointmentStatus.CHECKED_IN) {
        arrivedAppointmentsCount++;
        if (appt.actualStartTime && !appt.actualEndTime) {
          inTreatmentAppointmentsCount++;
        }
      } else if (appt.arrivedAt) {
        arrivedAppointmentsCount++;
      }

      // Treatment performed is strictly counted upon completion, arrival alone does not equal treatment performed
      const isPerformed = appt.status === AppointmentStatus.COMPLETED;

      if (appt.serviceItems && appt.serviceItems.length > 0) {
        const allItems = appt.serviceItems;
        const legacyItems = allItems.filter((i) => i.isLegacyBundle);
        legacyBundlesCount += legacyItems.length;

        // Weights include all items (including legacy bundle items) so legacy amounts are not
        // silently misallocated entirely to catalog services
        const weights = allItems.map((i) => Math.max(0, i.priceFrom || 0));

        // Deterministic per-payment integer allocation (identical policy as filtered cash totals)
        const itemGrossAcc = new Array(allItems.length).fill(0);
        const itemRefundAcc = new Array(allItems.length).fill(0);

        for (const p of appt.payments) {
          const allocated = allocateIntegerAmounts(p.amount, weights);
          for (let idx = 0; idx < allItems.length; idx++) {
            if (p.isRefund) {
              itemRefundAcc[idx] += allocated[idx] || 0;
            } else {
              itemGrossAcc[idx] += allocated[idx] || 0;
            }
          }
        }

        for (let idx = 0; idx < allItems.length; idx++) {
          const item = allItems[idx];
          if (item.isLegacyBundle) {
            legacyGrossMinor += itemGrossAcc[idx];
            legacyRefundsMinor += itemRefundAcc[idx];
            continue;
          }

          const key = item.serviceId || item.serviceNameUz;
          const current = serviceStatsMap.get(key) || {
            serviceId: item.serviceId || undefined,
            nameUz: item.serviceNameUz,
            nameRu: item.serviceNameRu,
            bookedCount: 0,
            performedCount: 0,
            distinctAppointmentIds: new Set<string>(),
            quotedValueMinor: 0,
            grossPaymentsMinor: 0,
            refundsMinor: 0,
            netRevenueMinor: 0,
            revenueMinor: 0,
          };

          const itemQuoted = item.priceFrom || 0;
          const itemGross = itemGrossAcc[idx];
          const itemRefund = itemRefundAcc[idx];
          const itemNet = itemGross - itemRefund;

          current.bookedCount += 1;
          if (isPerformed) current.performedCount += 1;
          current.distinctAppointmentIds.add(appt.id);
          totalServiceBooked += 1;
          if (isPerformed) totalServicePerformed += 1;

          current.quotedValueMinor += itemQuoted;
          current.grossPaymentsMinor += itemGross;
          current.refundsMinor += itemRefund;
          current.netRevenueMinor += itemNet;
          current.revenueMinor = current.netRevenueMinor;
          totalQuotedMinor += itemQuoted;

          serviceStatsMap.set(key, current);
        }
      } else {
        // Legacy single-service appointment without separate service items
        const key = appt.serviceId || appt.serviceName;
        const current = serviceStatsMap.get(key) || {
          serviceId: appt.serviceId,
          nameUz: appt.serviceName,
          bookedCount: 0,
          performedCount: 0,
          distinctAppointmentIds: new Set<string>(),
          quotedValueMinor: 0,
          grossPaymentsMinor: 0,
          refundsMinor: 0,
          netRevenueMinor: 0,
          revenueMinor: 0,
        };

        let singleGross = 0;
        let singleRefund = 0;
        for (const p of appt.payments) {
          if (p.isRefund) singleRefund += p.amount;
          else singleGross += p.amount;
        }

        const quoted = appt.servicePriceFrom || 0;
        const net = singleGross - singleRefund;

        current.bookedCount += 1;
        if (isPerformed) current.performedCount += 1;
        current.distinctAppointmentIds.add(appt.id);
        totalServiceBooked += 1;
        if (isPerformed) totalServicePerformed += 1;

        current.quotedValueMinor += quoted;
        current.grossPaymentsMinor += singleGross;
        current.refundsMinor += singleRefund;
        current.netRevenueMinor += net;
        current.revenueMinor = current.netRevenueMinor;
        totalQuotedMinor += quoted;

        serviceStatsMap.set(key, current);
      }
    }

    const popularServices = Array.from(serviceStatsMap.values())
      .sort((a, b) =>
        b.performedCount !== a.performedCount
          ? b.performedCount - a.performedCount
          : b.bookedCount - a.bookedCount,
      )
      .slice(0, 10)
      .map((s) => ({
        serviceId: s.serviceId,
        name: s.nameUz,
        nameUz: s.nameUz,
        nameRu: s.nameRu,
        count: s.performedCount,
        usageCount: s.performedCount,
        performedCount: s.performedCount,
        bookedCount: s.bookedCount,
        appointmentsCount: s.distinctAppointmentIds.size,
        quotedValueMinor: s.quotedValueMinor,
        grossPaymentsMinor: s.grossPaymentsMinor,
        refundsMinor: s.refundsMinor,
        netRevenueMinor: s.netRevenueMinor,
        revenueMinor: s.netRevenueMinor,
        percentage:
          totalServicePerformed > 0
            ? Math.round((s.performedCount / totalServicePerformed) * 100)
            : 0,
      }));

    // 3. Exact Interval-Based Doctor Utilization Calculation
    // Query active doctors matching filter (include zero-appointment doctors!)
    const doctorFilter: Prisma.DoctorWhereInput = {
      isActive: true,
      isArchived: false,
    };
    if (doctorId) doctorFilter.id = doctorId;

    const doctors = await this.prisma.doctor.findMany({
      where: doctorFilter,
      select: {
        id: true,
        firstNameUz: true,
        lastNameUz: true,
        schedules: {
          where: {
            isActive: true,
            ...(branchId ? { branchId } : {}),
          },
        },
        exceptions: {
          where: {
            date: {
              gte: new Date(formatInTimeZone(start, timezone, 'yyyy-MM-dd') + 'T00:00:00.000Z'),
              lte: new Date(formatInTimeZone(end, timezone, 'yyyy-MM-dd') + 'T23:59:59.999Z'),
            },
          },
          select: {
            id: true,
            type: true,
            date: true,
            startTime: true,
            endTime: true,
            branchId: true,
          },
        },
      },
    });

    // Enumerate clinic-local dates within the requested range using clinic timezone
    const calendarDates: { dateString: string; dayOfWeek: DayOfWeek }[] = [];
    const startDateStr = formatInTimeZone(start, timezone, 'yyyy-MM-dd');
    const endDateStr = formatInTimeZone(end, timezone, 'yyyy-MM-dd');

    const [sYear, sMonth, sDay] = startDateStr.split('-').map(Number);
    const [eYear, eMonth, eDay] = endDateStr.split('-').map(Number);

    const cursor = new Date(Date.UTC(sYear, sMonth - 1, sDay, 12, 0, 0));
    const targetEnd = new Date(Date.UTC(eYear, eMonth - 1, eDay, 12, 0, 0));

    while (cursor <= targetEnd) {
      const y = cursor.getUTCFullYear();
      const m = String(cursor.getUTCMonth() + 1).padStart(2, '0');
      const d = String(cursor.getUTCDate()).padStart(2, '0');
      const dateString = `${y}-${m}-${d}`;
      const dowEnum = DOW_ENUM_MAP[cursor.getUTCDay()];
      calendarDates.push({ dateString, dayOfWeek: dowEnum });

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    // Query booked minutes for eligible appointment statuses only (strictly exclude cancelled and no-show!)
    const eligibleAppointments = await this.prisma.appointment.findMany({
      where: {
        ...appointmentWhere,
        status: { in: ELIGIBLE_UTILIZATION_STATUSES },
      },
      select: {
        id: true,
        doctorId: true,
        durationMinutes: true,
        bufferMinutes: true,
      },
    });

    const bookedMinutesMap = new Map<string, { minutes: number; bufferMinutes: number; count: number }>();
    for (const appt of eligibleAppointments) {
      const current = bookedMinutesMap.get(appt.doctorId) || { minutes: 0, bufferMinutes: 0, count: 0 };
      current.minutes += appt.durationMinutes;
      current.bufferMinutes += (appt.bufferMinutes ?? 5);
      current.count += 1;
      bookedMinutesMap.set(appt.doctorId, current);
    }

    const doctorUtilization = doctors.map((doc) => {
      let totalAvailableMinutes = 0;

      for (const { dateString, dayOfWeek } of calendarDates) {
        // Find matching weekly schedules for this weekday and branch
        const daySchedules = doc.schedules.filter((s) => s.dayOfWeek === dayOfWeek);

        // Base intervals from working hours minus break
        let dayIntervals: TimeInterval[] = [];
        for (const sched of daySchedules) {
          const schedStart = parseTimeToMinutes(sched.startTime);
          const schedEnd = parseTimeToMinutes(sched.endTime);
          let currentList: TimeInterval[] = [{ start: schedStart, end: schedEnd }];

          if (sched.breakStart && sched.breakEnd) {
            const breakStart = parseTimeToMinutes(sched.breakStart);
            const breakEnd = parseTimeToMinutes(sched.breakEnd);
            const afterBreak: TimeInterval[] = [];
            for (const item of currentList) {
              afterBreak.push(...subtractInterval(item, { start: breakStart, end: breakEnd }));
            }
            currentList = afterBreak;
          }
          dayIntervals.push(...currentList);
        }

        // Apply exceptions for this doctor on this specific calendar date using clinic timezone
        const dayExceptions = doc.exceptions.filter(
          (ex) => formatInTimeZone(ex.date, timezone, 'yyyy-MM-dd') === dateString,
        );

        let isWholeDayOff = false;
        for (const ex of dayExceptions) {
          // If exception is branch-specific and doesn't match selected branch, skip it
          if (branchId && ex.branchId && ex.branchId !== branchId) {
            continue;
          }
          if (
            ex.type === ExceptionType.HOLIDAY ||
            ((ex.type === ExceptionType.LEAVE || ex.type === ExceptionType.BLOCKED) && (!ex.startTime || !ex.endTime))
          ) {
            isWholeDayOff = true;
            break;
          }
        }

        if (isWholeDayOff) {
          // Zero available minutes on holidays and full-day leave
          continue;
        }

        // Deterministic Exception Precedence:
        // 1. Add OVERTIME intervals (branch-scoped: only count overtime belonging to selected branch)
        for (const ex of dayExceptions) {
          if (ex.type === ExceptionType.OVERTIME && ex.startTime && ex.endTime) {
            if (branchId && ex.branchId && ex.branchId !== branchId) {
              continue;
            }
            const otStart = parseTimeToMinutes(ex.startTime);
            const otEnd = parseTimeToMinutes(ex.endTime);
            if (otEnd > otStart) {
              dayIntervals.push({ start: otStart, end: otEnd });
            }
          }
        }

        // 2. Merge additions
        dayIntervals = mergeIntervals(dayIntervals);

        // 3. Subtract BLOCKED intervals (respecting branch scope)
        for (const ex of dayExceptions) {
          if (ex.type === ExceptionType.BLOCKED && ex.startTime && ex.endTime) {
            if (branchId && ex.branchId && ex.branchId !== branchId) {
              continue;
            }
            const blStart = parseTimeToMinutes(ex.startTime);
            const blEnd = parseTimeToMinutes(ex.endTime);
            const remaining: TimeInterval[] = [];
            for (const item of dayIntervals) {
              remaining.push(...subtractInterval(item, { start: blStart, end: blEnd }));
            }
            dayIntervals = remaining;
          }
        }

        // 4. Subtract partial LEAVE intervals (respecting branch scope)
        for (const ex of dayExceptions) {
          if (ex.type === ExceptionType.LEAVE && ex.startTime && ex.endTime) {
            if (branchId && ex.branchId && ex.branchId !== branchId) {
              continue;
            }
            const lvStart = parseTimeToMinutes(ex.startTime);
            const lvEnd = parseTimeToMinutes(ex.endTime);
            const remaining: TimeInterval[] = [];
            for (const item of dayIntervals) {
              remaining.push(...subtractInterval(item, { start: lvStart, end: lvEnd }));
            }
            dayIntervals = remaining;
          }
        }

        // 5. Final merge
        const merged = mergeIntervals(dayIntervals);
        for (const m of merged) {
          totalAvailableMinutes += Math.max(0, m.end - m.start);
        }
      }

      const bookedData = bookedMinutesMap.get(doc.id) || { minutes: 0, bufferMinutes: 0, count: 0 };
      const bookedMinutes = bookedData.minutes;
      const bufferMinutes = bookedData.bufferMinutes;
      const occupiedMinutes = bookedMinutes + bufferMinutes;

      // Mathematical utilization percentage based on treatment duration vs total working capacity
      const utilizationRate =
        totalAvailableMinutes > 0
          ? Number(((bookedMinutes / totalAvailableMinutes) * 100).toFixed(1))
          : 0;

      return {
        doctorId: doc.id,
        doctorName: `${doc.firstNameUz} ${doc.lastNameUz}`,
        appointmentsCount: bookedData.count,
        totalMinutesBooked: bookedMinutes,
        totalBufferMinutes: bufferMinutes,
        totalOccupiedMinutes: occupiedMinutes,
        totalHoursBooked: Math.round((bookedMinutes / 60) * 10) / 10,
        totalAvailableMinutes,
        utilizationRate,
      };
    });

    // 4. New vs Returning Patients
    // Count each distinct patient once. Returning = had a confirmed/completed appointment prior to start date.
    const patientAppointments = await this.prisma.appointment.findMany({
      where: appointmentWhere,
      select: {
        patientId: true,
      },
    });

    const uniquePatientIds = Array.from(new Set(patientAppointments.map((p) => p.patientId)));
    let newPatients = 0;
    let returningPatients = 0;

    for (const patientId of uniquePatientIds) {
      const priorAppointment = await this.prisma.appointment.findFirst({
        where: {
          patientId,
          startTime: { lt: start },
          status: { in: [AppointmentStatus.CONFIRMED, AppointmentStatus.CHECKED_IN, AppointmentStatus.COMPLETED] },
        },
        select: { id: true },
      });

      if (priorAppointment) {
        returningPatients++;
      } else {
        newPatients++;
      }
    }

    // 5. Leads conversion (Clinic-wide acquisition funnel)
    const leadWhere: Prisma.LeadWhereInput = {
      createdAt: { gte: start, lte: end },
    };

    const leadCounts = await this.prisma.lead.groupBy({
      by: ['status'],
      where: leadWhere,
      _count: true,
    });

    const leadStatusMap: Record<string, number> = {
      [LeadStatus.NEW]: 0,
      [LeadStatus.CONTACTED]: 0,
      [LeadStatus.BOOKED]: 0,
      [LeadStatus.CLOSED]: 0,
    };

    let totalLeads = 0;
    for (const l of leadCounts) {
      leadStatusMap[l.status] = l._count;
      totalLeads += l._count;
    }

    const leadsConverted = leadStatusMap[LeadStatus.BOOKED];
    const leadConversionRate = totalLeads > 0 ? (leadsConverted / totalLeads) * 100 : 0;

    // 6. Actual Revenue & Refunds (Recorded payment ledger, respects doctor/service/branch filters)
    const paymentWhere: Prisma.PaymentWhereInput = {
      recordedAt: { gte: start, lte: end },
    };

    if (branchId || doctorId || serviceId) {
      paymentWhere.appointment = {};
      if (branchId) paymentWhere.appointment.branchId = branchId;
      if (doctorId) paymentWhere.appointment.doctorId = doctorId;
      if (serviceId) {
        paymentWhere.appointment.OR = [
          { serviceId: serviceId },
          { serviceItems: { some: { serviceId: serviceId } } },
        ];
      }
    }

    const payments = await this.prisma.payment.findMany({
      where: paymentWhere,
      select: {
        id: true,
        amount: true,
        isRefund: true,
        method: true,
        recordedAt: true,
        appointment: {
          select: {
            id: true,
            serviceId: true,
            servicePriceFrom: true,
            serviceItems: {
              select: {
                id: true,
                serviceId: true,
                priceFrom: true,
                isLegacyBundle: true,
                sortOrder: true,
              },
              orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
            },
          },
        },
      },
      orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
    });

    let totalIncome = 0;
    let totalRefunds = 0;
    const paymentMethods: Record<string, number> = {
      [PaymentMethod.CASH]: 0,
      [PaymentMethod.CARD]: 0,
      [PaymentMethod.TRANSFER]: 0,
      [PaymentMethod.OTHER]: 0,
    };

    for (const p of payments) {
      let effectiveAmount = p.amount;

      // When serviceId filter is active, apportion payment proportionately to this service using exact integer allocation
      if (serviceId && p.appointment) {
        const appt = p.appointment;
        if (appt.serviceItems && appt.serviceItems.length > 0) {
          const allItems = appt.serviceItems;
          const weights = allItems.map((i) => Math.max(0, i.priceFrom || 0));
          const allocated = allocateIntegerAmounts(p.amount, weights);
          const matchingIndices = allItems
            .map((item, idx) => (item.serviceId === serviceId ? idx : -1))
            .filter((idx) => idx !== -1);
          effectiveAmount = matchingIndices.reduce((sum, idx) => sum + (allocated[idx] || 0), 0);
        }
      }

      if (p.isRefund) {
        totalRefunds += effectiveAmount;
      } else {
        totalIncome += effectiveAmount;
        paymentMethods[p.method] = (paymentMethods[p.method] || 0) + effectiveAmount;
      }
    }

    const netRevenue = totalIncome - totalRefunds;

    return {
      period: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        timezone,
      },
      dateBases: {
        servicesTable: {
          field: 'appointment.startTime',
          labelUz: 'Qabul rejalashtirilgan vaqti (startTime)',
          labelRu: 'Время приема (startTime)',
        },
        cashTotals: {
          field: 'payment.recordedAt',
          labelUz: 'Kassa tushumi vaqti (recordedAt)',
          labelRu: 'Время проводки платежа (recordedAt)',
        },
        note: 'Xizmatlar statistikasi qabul vaqtiga (startTime), kassa tushumi esa to\'lov amalga oshirilgan vaqtga (recordedAt) asoslanadi',
      },
      summary: {
        totalAppointments,
        totalServiceBooked,
        totalServicePerformed,
        totalServiceUsage: totalServicePerformed,
        servicesPerAppointment:
          totalAppointments > 0 ? Number((totalServiceBooked / totalAppointments).toFixed(2)) : 0,
        servicesPerCompletedAppointment:
          completed > 0 ? Number((totalServicePerformed / completed).toFixed(2)) : 0,
        denominators: {
          servicesPerAppointment: 'totalServiceBooked / totalAppointments (barcha buyurtmalar bo‘yicha o‘rtacha xizmatlar)',
          servicesPerCompletedAppointment: 'totalServicePerformed / completed (yakunlangan qabullar bo‘yicha o‘rtacha bajarilgan xizmatlar)',
        },
        arrived: arrivedAppointmentsCount,
        inTreatment: inTreatmentAppointmentsCount,
        completed,
        cancelled,
        noShow,
        completionRate: Math.round(completionRate * 10) / 10,
        cancellationRate: Math.round(cancellationRate * 10) / 10,
        noShowRate: Math.round(noShowRate * 10) / 10,
        uniquePatientsCount: uniquePatientIds.length,
        newPatients,
        returningPatients,
      },
      statusBreakdown: statusMap,
      popularServices,
      totalServiceUsage: totalServicePerformed,
      totalServiceBooked,
      legacyBundlesCount,
      unresolvedRecords: {
        unresolvedCount: legacyBundlesCount,
        legacyGrossMinor,
        legacyRefundsMinor,
        legacyNetMinor: legacyGrossMinor - legacyRefundsMinor,
        note: 'Tarixiy ko\'p xizmatli noaniq qabullar katalog xizmatlari statistikasidan chiqarilgan va to\'lovlari ajratilgan',
      },
      doctorUtilization,
      leads: {
        totalLeads,
        byStatus: leadStatusMap,
        converted: leadsConverted,
        conversionRate: Math.round(leadConversionRate * 10) / 10,
        filtersNote: 'Lidlar klinikaga kelib tushgan umumiy qayta aloqa murojaatlarini ifodalaydi',
      },
      revenue: {
        totalQuotedMinor,
        totalIncomeMinor: totalIncome,
        totalRefundsMinor: totalRefunds,
        netRevenueMinor: netRevenue,
        currency: 'UZS',
        byMethod: paymentMethods,
        hasRecordedPayments: payments.length > 0,
      },
    };
  }
}
