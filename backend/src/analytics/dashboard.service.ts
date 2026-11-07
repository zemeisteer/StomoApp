import { BadRequestException, Injectable } from '@nestjs/common';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS = 366;

/**
 * One owner dashboard: money (collected, billed, outstanding), visits, patients,
 * a per-day series and top services / doctors for a clinic-local date range.
 * Money is whole so'm; service prices (tiyin snapshots) are converted.
 */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * With `branchId`, everything is limited to that branch: visits by their branch, money by the
   * branch of the visit it pays for. Patients stay one clinic-wide card; "patients" then means
   * people who had a visit in this branch. Without it, a per-branch comparison is added.
   */
  async summary(fromStr?: string, toStr?: string, branchId?: string) {
    const settings = await this.prisma.clinicSettings.findFirst({ select: { timezone: true } });
    const tz = settings?.timezone || 'Asia/Tashkent';
    const today = formatInTimeZone(new Date(), tz, 'yyyy-MM-dd');
    const valid = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
    const fromDay = valid(fromStr) || today;
    const toDay = valid(toStr) || fromDay;
    const from = fromZonedTime(`${fromDay} 00:00:00`, tz);
    const to = new Date(fromZonedTime(`${toDay} 00:00:00`, tz).getTime() + DAY_MS);
    const days = Math.round((to.getTime() - from.getTime()) / DAY_MS);
    if (days < 1 || days > MAX_DAYS) throw new BadRequestException("Davr 1 kundan 366 kungacha bo'lishi kerak");

    const b = branchId || undefined;
    const paymentBranch: Prisma.PaymentWhereInput = b
      ? { OR: [{ appointment: { branchId: b } }, { invoice: { appointment: { branchId: b } } }] }
      : {};
    const branchSql = b ? Prisma.sql`AND a.branch_id = ${b}` : Prisma.empty;

    const [payments, invoices, appointmentsRaw, newPatients, totalPatients, outstanding, pendingNow] = await Promise.all([
      this.prisma.payment.findMany({
        where: { recordedAt: { gte: from, lt: to }, ...paymentBranch },
        select: { amount: true, isRefund: true, method: true, recordedAt: true },
      }),
      this.prisma.invoice.findMany({
        where: { createdAt: { gte: from, lt: to }, status: { not: 'CANCELLED' }, ...(b ? { appointment: { branchId: b } } : {}) },
        select: { totalAmount: true, discount: true },
      }),
      // Completed visits count on the day they were actually finished (a visit can be closed early)
      this.prisma.appointment.findMany({
        where: { OR: [{ startTime: { gte: from, lt: to } }, { actualEndTime: { gte: from, lt: to } }], ...(b ? { branchId: b } : {}) },
        select: {
          branchId: true,
          status: true,
          startTime: true,
          actualEndTime: true,
          patientId: true,
          doctorId: true,
          serviceItems: { select: { serviceId: true, serviceNameUz: true, serviceNameRu: true, priceFrom: true } },
        },
      }),
      this.prisma.patient.count({ where: { createdAt: { gte: from, lt: to }, ...(b ? { appointments: { some: { branchId: b } } } : {}) } }),
      this.prisma.patient.count({ where: { isActive: true, ...(b ? { appointments: { some: { branchId: b } } } : {}) } }),
      this.prisma.$queryRaw<Array<{ debt: bigint | null }>>`
        SELECT COALESCE(SUM(GREATEST(0, i.total_amount - COALESCE(i.discount, 0) - COALESCE(p.paid, 0))), 0)::bigint AS debt
        FROM invoices i
        LEFT JOIN (
          SELECT invoice_id, SUM(CASE WHEN is_refund THEN -amount ELSE amount END) AS paid
          FROM payments WHERE invoice_id IS NOT NULL GROUP BY invoice_id
        ) p ON p.invoice_id = i.id
        LEFT JOIN appointments a ON a.id = i.appointment_id
        WHERE i.status <> 'CANCELLED' ${branchSql}`,
      this.prisma.appointment.count({ where: { status: 'PENDING', startTime: { gte: new Date() }, ...(b ? { branchId: b } : {}) } }),
    ]);

    // Money
    const byMethod: Record<string, number> = {};
    let income = 0;
    let refunds = 0;
    for (const p of payments) {
      const v = p.isRefund ? -p.amount : p.amount;
      byMethod[p.method] = (byMethod[p.method] || 0) + v;
      if (p.isRefund) refunds += p.amount;
      else income += p.amount;
    }
    const billed = invoices.reduce((s, i) => s + Math.max(0, i.totalAmount - (i.discount || 0)), 0);

    const visitDay = (a: { status: string; startTime: Date; actualEndTime: Date | null }) =>
      a.status === 'COMPLETED' && a.actualEndTime ? a.actualEndTime : a.startTime;
    const inRange = appointmentsRaw.filter((a) => {
      const d = visitDay(a);
      return d >= from && d < to;
    });
    const appointments = inRange;

    // Visits
    const status: Record<string, number> = { PENDING: 0, CONFIRMED: 0, CHECKED_IN: 0, COMPLETED: 0, CANCELLED: 0, NO_SHOW: 0 };
    for (const a of appointments) status[a.status] = (status[a.status] || 0) + 1;
    const completed = appointments.filter((a) => a.status === 'COMPLETED');
    const servedPatients = new Set(completed.map((a) => a.patientId)).size;
    const decided = status.COMPLETED + status.NO_SHOW;

    // Per-day series (clinic calendar)
    const series = Array.from({ length: days }, (_, i) => ({
      date: formatInTimeZone(new Date(from.getTime() + i * DAY_MS + 12 * 60 * 60 * 1000), tz, 'yyyy-MM-dd'),
      revenue: 0,
      visits: 0,
    }));
    const index = new Map(series.map((d, i) => [d.date, i]));
    for (const p of payments) {
      const i = index.get(formatInTimeZone(p.recordedAt, tz, 'yyyy-MM-dd'));
      if (i !== undefined) series[i].revenue += p.isRefund ? -p.amount : p.amount;
    }
    for (const a of completed) {
      const i = index.get(formatInTimeZone(visitDay(a), tz, 'yyyy-MM-dd'));
      if (i !== undefined) series[i].visits += 1;
    }

    // Top services among completed visits (price snapshot at booking)
    const services = new Map<string, { nameUz: string; nameRu: string | null; count: number; valueUzs: number }>();
    for (const a of completed) {
      for (const item of a.serviceItems) {
        const key = item.serviceId || item.serviceNameUz;
        const row = services.get(key) || { nameUz: item.serviceNameUz, nameRu: item.serviceNameRu, count: 0, valueUzs: 0 };
        row.count += 1;
        row.valueUzs += Math.round((item.priceFrom || 0) / 100);
        services.set(key, row);
      }
    }
    const topServices = [...services.values()].sort((a, b) => b.count - a.count || b.valueUzs - a.valueUzs).slice(0, 6);

    // Doctors: completed visits in the period + money collected for their work (same attribution as payroll)
    const collected = await this.prisma.$queryRaw<Array<{ doctor_id: string; total: bigint }>>`
      SELECT COALESCE(a.doctor_id, tp.doctor_id) AS doctor_id,
             SUM(CASE WHEN p.is_refund THEN -p.amount ELSE p.amount END)::bigint AS total
      FROM payments p
      LEFT JOIN invoices inv ON inv.id = p.invoice_id
      LEFT JOIN appointments a ON a.id = COALESCE(p.appointment_id, inv.appointment_id)
      LEFT JOIN treatment_plans tp ON tp.id = inv.plan_id
      WHERE p.recorded_at >= ${from} AND p.recorded_at < ${to} AND COALESCE(a.doctor_id, tp.doctor_id) IS NOT NULL ${branchSql}
      GROUP BY COALESCE(a.doctor_id, tp.doctor_id)`;

    // Branch comparison (all-branches view only)
    let branches: Array<{ id: string; nameUz: string; nameRu: string | null; collectedUzs: number; completed: number; newPatients: number }> = [];
    if (!b) {
      const [branchRows, branchMoney] = await Promise.all([
        this.prisma.branch.findMany({ where: { isActive: true }, select: { id: true, nameUz: true, nameRu: true }, orderBy: { createdAt: 'asc' } }),
        this.prisma.$queryRaw<Array<{ branch_id: string | null; total: bigint }>>`
          SELECT a.branch_id, SUM(CASE WHEN p.is_refund THEN -p.amount ELSE p.amount END)::bigint AS total
          FROM payments p
          LEFT JOIN invoices inv ON inv.id = p.invoice_id
          LEFT JOIN appointments a ON a.id = COALESCE(p.appointment_id, inv.appointment_id)
          WHERE p.recorded_at >= ${from} AND p.recorded_at < ${to}
          GROUP BY a.branch_id`,
      ]);
      const money = new Map(branchMoney.map((r) => [r.branch_id, Number(r.total)]));
      const firstVisit = new Map<string, string | null>();
      for (const a of [...completed].sort((x, y) => visitDay(x).getTime() - visitDay(y).getTime())) {
        if (!firstVisit.has(a.patientId)) firstVisit.set(a.patientId, a.branchId);
      }
      branches = branchRows.map((br) => ({
        ...br,
        collectedUzs: money.get(br.id) || 0,
        completed: completed.filter((a) => a.branchId === br.id).length,
        newPatients: [...firstVisit.values()].filter((id) => id === br.id).length,
      }));
    }
    const collectedMap = new Map(collected.map((r) => [r.doctor_id, Number(r.total)]));
    const visitsByDoctor = new Map<string, number>();
    for (const a of completed) visitsByDoctor.set(a.doctorId, (visitsByDoctor.get(a.doctorId) || 0) + 1);
    const doctorIds = [...new Set([...collectedMap.keys(), ...visitsByDoctor.keys()])];
    const doctors = doctorIds.length
      ? await this.prisma.doctor.findMany({
          where: { id: { in: doctorIds } },
          select: { id: true, firstNameUz: true, lastNameUz: true, firstNameRu: true, lastNameRu: true },
        })
      : [];
    const topDoctors = doctors
      .map((d) => ({ ...d, visits: visitsByDoctor.get(d.id) || 0, collectedUzs: collectedMap.get(d.id) || 0 }))
      .sort((a, b) => b.collectedUzs - a.collectedUzs || b.visits - a.visits)
      .slice(0, 6);

    return {
      period: { from: fromDay, to: toDay, days, timezone: tz },
      money: {
        collectedUzs: income - refunds,
        incomeUzs: income,
        refundsUzs: refunds,
        billedUzs: billed,
        outstandingUzs: Number(outstanding[0]?.debt || 0),
        byMethod,
        averageCheckUzs: completed.length ? Math.round((income - refunds) / completed.length) : 0,
      },
      visits: {
        total: appointments.length,
        completed: status.COMPLETED,
        upcoming: status.PENDING + status.CONFIRMED,
        inClinic: status.CHECKED_IN,
        cancelled: status.CANCELLED,
        noShow: status.NO_SHOW,
        noShowRate: decided ? Math.round((status.NO_SHOW / decided) * 1000) / 10 : 0,
        pendingApprovalsNow: pendingNow,
      },
      patients: { new: newPatients, served: servedPatients, total: totalPatients },
      series,
      topServices,
      topDoctors,
      branchId: b || null,
      branches,
    };
  }
}

