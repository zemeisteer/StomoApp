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
    let start: Date;
    if (startDate) {
      const datePart = startDate.split('T')[0];
      start = fromZonedTime(`${datePart} 00:00:00`, timezone);
    } else {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      start = thirtyDaysAgo;
    }

    let end: Date;
    if (endDate) {
      const datePart = endDate.split('T')[0];
      end = fromZonedTime(`${datePart} 23:59:59.999`, timezone);
    } else {
      const thirtyDaysAhead = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      end = thirtyDaysAhead;
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
    if (serviceId) appointmentWhere.serviceId = serviceId;

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

    // 2. Popular services
    const popularServicesRaw = await this.prisma.appointment.groupBy({
      by: ['serviceName'],
      where: appointmentWhere,
      _count: true,
      orderBy: {
        _count: {
          serviceName: 'desc',
        },
      },
      take: 7,
    });

    const popularServices = popularServicesRaw.map((s) => ({
      name: s.serviceName,
      count: s._count,
      percentage: totalAppointments > 0 ? Math.round((s._count / totalAppointments) * 100) : 0,
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
        },
      },
    });

    // Enumerate clinic-local dates within the requested range
    const calendarDates: { dateString: string; dayOfWeek: DayOfWeek }[] = [];
    const currentCursor = new Date(start.getTime());

    while (currentCursor <= end) {
      const dateString = formatInTimeZone(currentCursor, timezone, 'yyyy-MM-dd');
      const zonedDate = toZonedTime(currentCursor, timezone);
      const dowEnum = DOW_ENUM_MAP[zonedDate.getDay()];
      calendarDates.push({ dateString, dayOfWeek: dowEnum });

      // Advance by 1 clinic-local day
      currentCursor.setDate(currentCursor.getDate() + 1);
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
      },
    });

    const bookedMinutesMap = new Map<string, { minutes: number; count: number }>();
    for (const appt of eligibleAppointments) {
      const current = bookedMinutesMap.get(appt.doctorId) || { minutes: 0, count: 0 };
      current.minutes += appt.durationMinutes;
      current.count += 1;
      bookedMinutesMap.set(appt.doctorId, current);
    }

    const doctorUtilization = doctors.map((doc) => {
      let totalAvailableMinutes = 0;

      for (const { dateString, dayOfWeek } of calendarDates) {
        // Find matching weekly schedules for this weekday and branch
        const daySchedules = doc.schedules.filter((s) => s.dayOfWeek === dayOfWeek);
        if (daySchedules.length === 0) continue;

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

        // Apply exceptions for this doctor on this specific calendar date
        const dayExceptions = doc.exceptions.filter(
          (ex) => formatInTimeZone(ex.date, timezone, 'yyyy-MM-dd') === dateString,
        );

        let isWholeDayOff = false;
        for (const ex of dayExceptions) {
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

        // Apply partial-day exceptions
        for (const ex of dayExceptions) {
          if ((ex.type === ExceptionType.LEAVE || ex.type === ExceptionType.BLOCKED) && ex.startTime && ex.endTime) {
            const exStart = parseTimeToMinutes(ex.startTime);
            const exEnd = parseTimeToMinutes(ex.endTime);
            const remaining: TimeInterval[] = [];
            for (const item of dayIntervals) {
              remaining.push(...subtractInterval(item, { start: exStart, end: exEnd }));
            }
            dayIntervals = remaining;
          } else if (ex.type === ExceptionType.OVERTIME && ex.startTime && ex.endTime) {
            const otStart = parseTimeToMinutes(ex.startTime);
            const otEnd = parseTimeToMinutes(ex.endTime);
            dayIntervals.push({ start: otStart, end: otEnd });
          }
        }

        // Merge overlapping intervals so availability is never double counted
        const merged = mergeIntervals(dayIntervals);
        for (const m of merged) {
          totalAvailableMinutes += Math.max(0, m.end - m.start);
        }
      }

      const bookedData = bookedMinutesMap.get(doc.id) || { minutes: 0, count: 0 };
      const bookedMinutes = bookedData.minutes;

      // Real mathematical utilization percentage without artificial clamping
      const utilizationRate =
        totalAvailableMinutes > 0
          ? Number(((bookedMinutes / totalAvailableMinutes) * 100).toFixed(1))
          : 0;

      return {
        doctorId: doc.id,
        doctorName: `${doc.firstNameUz} ${doc.lastNameUz}`,
        appointmentsCount: bookedData.count,
        totalMinutesBooked: bookedMinutes,
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
      if (serviceId) paymentWhere.appointment.serviceId = serviceId;
    }

    const payments = await this.prisma.payment.findMany({
      where: paymentWhere,
      select: {
        amount: true,
        isRefund: true,
        method: true,
      },
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
      if (p.isRefund) {
        totalRefunds += p.amount;
      } else {
        totalIncome += p.amount;
        paymentMethods[p.method] = (paymentMethods[p.method] || 0) + p.amount;
      }
    }

    const netRevenue = totalIncome - totalRefunds;

    return {
      period: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        timezone,
      },
      summary: {
        totalAppointments,
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
      doctorUtilization,
      leads: {
        totalLeads,
        byStatus: leadStatusMap,
        converted: leadsConverted,
        conversionRate: Math.round(leadConversionRate * 10) / 10,
        filtersNote: 'Lidlar klinikaga kelib tushgan umumiy qayta aloqa murojaatlarini ifodalaydi',
      },
      revenue: {
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
