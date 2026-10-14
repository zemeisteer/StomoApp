import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentStatus, LeadStatus, PaymentMethod, Prisma } from '@prisma/client';

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
   */
  async recordEvent(eventType: string, sessionId?: string, page?: string, referrer?: string, metadata?: Record<string, any>) {
    // Strip query parameters and tokens from page/referrer
    const sanitizedPage = page ? page.split('?')[0].split('#')[0] : null;
    const sanitizedReferrer = referrer ? referrer.split('?')[0].split('#')[0] : null;

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
   * Comprehensive operational analytics with database aggregation
   */
  async getDashboardAnalytics(filters: AnalyticsFilterParams) {
    const { startDate, endDate, branchId, doctorId, serviceId } = filters;

    // Time boundaries (default to 30 days past through 30 days ahead for operational view)
    const now = new Date();
    const end = endDate ? new Date(endDate) : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const start = startDate ? new Date(startDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

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

    // 3. Appointments per doctor
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

    const doctorUtilization = doctorStatsRaw.map(d => ({
      doctorId: d.doctorId,
      doctorName: doctorMap.get(d.doctorId) || 'Noma\'lum',
      appointmentsCount: d._count,
      totalMinutesBooked: d._sum.durationMinutes || 0,
      totalHoursBooked: Math.round(((d._sum.durationMinutes || 0) / 60) * 10) / 10,
    }));

    // 4. New vs Returning Patients
    // A patient is "New" if their very first appointment was in this date range
    const patientAppointments = await this.prisma.appointment.findMany({
      where: appointmentWhere,
      select: {
        patientId: true,
        patient: {
          select: {
            createdAt: true,
          },
        },
      },
    });

    const uniquePatientIds = new Set(patientAppointments.map(p => p.patientId));
    let newPatients = 0;
    let returningPatients = 0;

    for (const p of patientAppointments) {
      if (p.patient && p.patient.createdAt >= start) {
        newPatients++;
      } else {
        returningPatients++;
      }
    }

    // 5. Leads conversion
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

    // 6. Actual Revenue & Refunds (Recorded transactions, NOT booking count * price)
    const payments = await this.prisma.payment.findMany({
      where: {
        recordedAt: { gte: start, lte: end },
      },
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
        uniquePatientsCount: uniquePatientIds.size,
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
