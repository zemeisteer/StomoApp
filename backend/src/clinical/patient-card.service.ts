import { Injectable } from '@nestjs/common';
import { StaffRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/auth.service';
import { TreatmentPlansService } from './treatment-plans.service';

/**
 * One request for the patient card page: profile, visits, clinical summary and money.
 * Doctors only see their own appointments with the patient and no financial data.
 */
@Injectable()
export class PatientCardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly plans: TreatmentPlansService,
  ) {}

  async getCard(patientId: string, user: JwtPayload) {
    await this.plans.assertPatientAccess(patientId, user);
    const isDoctor = user.role === StaffRole.DOCTOR;

    const patient = await this.prisma.patient.findUniqueOrThrow({
      where: { id: patientId },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        notes: true,
        telegramUserId: true,
        preferredLanguage: true,
        isActive: true,
        createdAt: true,
      },
    });

    const appointments = await this.prisma.appointment.findMany({
      where: { patientId, ...(isDoctor ? { doctorId: user.doctorId! } : {}) },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        status: true,
        serviceName: true,
        note: true,
        doctor: { select: { id: true, firstNameUz: true, lastNameUz: true, firstNameRu: true, lastNameRu: true } },
        branch: { select: { id: true, nameUz: true, nameRu: true } },
      },
      orderBy: { startTime: 'desc' },
      take: 100,
    });

    const now = new Date();
    const completed = appointments.filter((a) => a.status === 'COMPLETED');
    const upcoming = appointments
      .filter((a) => a.startTime > now && ['PENDING', 'CONFIRMED'].includes(a.status))
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    const [odontogramCount, planCounts] = await Promise.all([
      this.prisma.odontogramRecord.count({ where: { patientId, condition: { not: 'HEALTHY' } } }),
      this.prisma.treatmentPlan.groupBy({ by: ['status'], where: { patientId }, _count: { _all: true } }),
    ]);
    const plansByStatus = Object.fromEntries(planCounts.map((p) => [p.status, p._count._all]));

    let finance: null | {
      billedUzs: number;
      paidUzs: number;
      debtUzs: number;
      invoices: Array<Record<string, unknown>>;
    } = null;

    if (!isDoctor) {
      const invoices = await this.prisma.invoice.findMany({
        where: { patientId, status: { not: 'CANCELLED' } },
        include: { payments: { orderBy: { recordedAt: 'desc' } } },
        orderBy: { createdAt: 'desc' },
      });
      let billed = 0;
      let paid = 0;
      let debt = 0;
      const rows = invoices.map((inv) => {
        const paidAmount = inv.payments.reduce((acc, p) => acc + (p.isRefund ? -p.amount : p.amount), 0);
        const effectiveTotal = Math.max(0, inv.totalAmount - (inv.discount || 0));
        const debtAmount = Math.max(0, effectiveTotal - paidAmount);
        billed += effectiveTotal;
        paid += paidAmount;
        debt += debtAmount;
        return {
          id: inv.id,
          createdAt: inv.createdAt,
          notes: inv.notes,
          totalAmount: inv.totalAmount,
          discount: inv.discount,
          effectiveTotal,
          paidAmount,
          debtAmount,
          status: debtAmount === 0 ? 'PAID' : paidAmount > 0 ? 'PARTIALLY_PAID' : 'PENDING',
          payments: inv.payments.map((p) => ({
            id: p.id,
            amount: p.amount,
            method: p.method,
            isRefund: p.isRefund,
            recordedAt: p.recordedAt,
            note: p.note,
          })),
        };
      });
      finance = { billedUzs: billed, paidUzs: paid, debtUzs: debt, invoices: rows };
    }

    return {
      patient: {
        ...patient,
        telegramUserId: undefined,
        telegramLinked: Boolean(patient.telegramUserId),
        // Strip internal markers (e.g. the bot's "[lang:uz]" tag) from staff-facing notes
        notes: isDoctor ? null : (patient.notes || '').replace(/\[lang:[a-z]{2}\]/gi, '').trim() || null,
      },
      stats: {
        totalAppointments: appointments.length,
        completedVisits: completed.length,
        noShows: appointments.filter((a) => a.status === 'NO_SHOW').length,
        lastVisitAt: completed[0]?.startTime ?? null,
        nextAppointment: upcoming[0] ?? null,
        teethWithFindings: odontogramCount,
        activePlans: (plansByStatus.ACCEPTED || 0) + (plansByStatus.IN_PROGRESS || 0),
        pendingPlans: (plansByStatus.DRAFT || 0) + (plansByStatus.PRESENTED || 0),
      },
      appointments,
      finance,
    };
  }
}
