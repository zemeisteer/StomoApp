import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentStatus, LeadStatus, PaymentMethod, Prisma } from '@prisma/client';
import { fromZonedTime } from 'date-fns-tz';

export interface AnalyticsFilterParams {
  startDate?: string;
  endDate?: string;
  branchId?: string;
  doctorId?: string;
  serviceId?: string;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Log first-party anonymous analytics event (strictly zero PII)
   * Strips query parameters, hashes, and normalizes public tokens in URLs
   */
  async recordEvent(eventType: string, sessionId?: string, page?: string, referrer?: string, metadata?: Record<string, any>) {
    let sanitizedPage = page ? page.split('?')[0].split('#')[0] : null;
    if (sanitizedPage) {
      sanitizedPage = sanitizedPage.replace(/\/booking\/status\/[^\/?#]+/g, '/booking/status/[token]');
    }

    let sanitizedReferrer = referrer ? referrer.split('?')[0].split('#')[0] : null;
    if (sanitizedReferrer) {
      sanitizedReferrer = sanitizedReferrer.replace(/\/booking\/status\/[^\/?#]+/g, '/booking/status/[token]');
    }

    return this.prisma.analyticsEvent.create({
      data: {
        eventType,
        sessionId: sessionId || null,
        page: sanitizedPage,
        referrer: sanitizedReferrer,
        metadata: (metadata || {}) as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Comprehensive operational analytics with database aggregation,
   * exact Asia/Tashkent date boundaries, true new/returning patient classification,
   * doctor utilization with working-hours denominator, and payment ledger.
   */
  async getDashboardAnalytics(filters: AnalyticsFilterParams) {
    const { startDate, endDate, branchId, doctorId, serviceId } = filters;
    const timezone = 'Asia/Tashkent';

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

    const popularServices = popularServicesRaw.map(s => ({
      name: s.serviceName,
      count: s._count,
      percentage: totalAppointments > 0 ? Math.round((s._count / totalAppointments) * 100) : 0,
    }));

    // 3. Appointments per doctor & Real Utilization
    const doctorStatsRaw = await this.prisma.appointment.groupBy({
      by: ['doctorId'],
      where: appointmentWhere,
      _count: true,
      _sum: {
        durationMinutes: true,
      },
    });

    const doctorsList = await this.prisma.doctor.findMany({
      where: { id: { in: doctorStatsRaw.map(d => d.doctorId) } },
      select: { id: true, firstNameUz: true, lastNameUz: true },
    });

    const doctorMap = new Map(doctorsList.map(d => [d.id, `${d.firstNameUz} ${d.lastNameUz}`]));

    const daysDiff = Math.max(1, Math.min(60, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))));

    const doctorUtilization = await Promise.all(
      doctorStatsRaw.map(async (d) => {
        const docName = doctorMap.get(d.doctorId) || 'Noma\'lum';
        const bookedMinutes = d._sum.durationMinutes || 0;

        // Fetch doctor's weekly working schedules
        const schedules = await this.prisma.doctorSchedule.findMany({
          where: { doctorId: d.doctorId, isActive: true },
        });

        let totalAvailableMinutes = 0;
        for (const sched of schedules) {
          const [sh, sm] = sched.startTime.split(':').map(Number);
          const [eh, em] = sched.endTime.split(':').map(Number);
          let dailyMinutes = (eh * 60 + em) - (sh * 60 + sm);
          if (sched.breakStart && sched.breakEnd) {
            const [bsh, bsm] = sched.breakStart.split(':').map(Number);
            const [beh, bem] = sched.breakEnd.split(':').map(Number);
            dailyMinutes -= ((beh * 60 + bem) - (bsh * 60 + bsm));
          }
          const occurrences = Math.ceil(daysDiff / 7);
          totalAvailableMinutes += Math.max(0, dailyMinutes) * occurrences;
        }

        const utilizationRate = totalAvailableMinutes > 0
          ? Math.min(100, Math.round((bookedMinutes / totalAvailableMinutes) * 100))
          : 0;

        return {
          doctorId: d.doctorId,
          doctorName: docName,
          appointmentsCount: d._count,
          totalMinutesBooked: bookedMinutes,
          totalHoursBooked: Math.round((bookedMinutes / 60) * 10) / 10,
          totalAvailableMinutes,
          utilizationRate,
        };
      })
    );

    // 4. New vs Returning Patients
    // Count each distinct patient once. Returning = had a confirmed/completed appointment prior to start date.
    const patientAppointments = await this.prisma.appointment.findMany({
      where: appointmentWhere,
      select: {
        patientId: true,
      },
    });

    const uniquePatientIds = Array.from(new Set(patientAppointments.map(p => p.patientId)));
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
        timezone: 'Asia/Tashkent',
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
