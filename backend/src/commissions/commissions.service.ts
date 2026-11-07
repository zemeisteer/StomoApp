import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../auth/auth.service';
import { UpdateCommissionDto, UpdateStaffPayDto } from './dto/commission.dto';
import { fromZonedTime } from 'date-fns-tz';
import { PayType, Prisma } from '@prisma/client';

/** Pay for one period: share of collected money, fixed salary, or both, plus any bonus. */
export function computeEarned(
  payType: PayType,
  percentage: number,
  monthlySalary: number,
  fixedBonus: number,
  collected: number,
): number {
  const share = Math.max(0, Math.round(collected * (percentage / 100)));
  const salary = monthlySalary || 0;
  const base = payType === PayType.SALARY ? salary : payType === PayType.MIXED ? salary + share : share;
  return base + (fixedBonus || 0);
}

@Injectable()
export class CommissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Helper to parse date boundaries in clinic timezone.
   * If YYYY-MM-DD format is passed, start of day / end of day in clinic timezone is used.
   */
  private parseDateBoundaries(
    timezone: string,
    from?: string,
    to?: string,
  ): { fromDate: Date | null; toDate: Date | null } {
    let fromDate: Date | null = null;
    let toDate: Date | null = null;

    if (from) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(from.trim())) {
        fromDate = fromZonedTime(`${from.trim()} 00:00:00.000`, timezone);
      } else {
        const parsed = new Date(from);
        if (!isNaN(parsed.getTime())) fromDate = parsed;
      }
    }

    if (to) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(to.trim())) {
        toDate = fromZonedTime(`${to.trim()} 23:59:59.999`, timezone);
      } else {
        const parsed = new Date(to);
        if (!isNaN(parsed.getTime())) toDate = parsed;
      }
    }

    return { fromDate, toDate };
  }

  async listAllCommissions(from?: string, to?: string) {
    const clinicSettings = await this.prisma.clinicSettings.findFirst();
    const timezone = clinicSettings?.timezone || 'Asia/Tashkent';
    const { fromDate, toDate } = this.parseDateBoundaries(timezone, from, to);

    // Build date filter conditions for database aggregation
    const conditions: Prisma.Sql[] = [Prisma.sql`1=1`];
    if (fromDate) {
      conditions.push(Prisma.sql`p.recorded_at >= ${fromDate}`);
    }
    if (toDate) {
      conditions.push(Prisma.sql`p.recorded_at <= ${toDate}`);
    }
    const whereSql = Prisma.join(conditions, ' AND ');

    // Aggregate payments per doctor at database level.
    // Handles:
    // 1. Direct appointment payments: p.appointment_id
    // 2. Invoice payments without appointment_id on payment row: p.invoice_id -> inv.appointment_id
    // 3. Deducts refunds: (CASE WHEN p.is_refund = true THEN -p.amount ELSE p.amount END)
    // 4. Zero double-counting: Each payment row is evaluated exactly once
    const paymentSums = await this.prisma.$queryRaw<Array<{ doctor_id: string; total_collected: bigint }>>`
      SELECT
        COALESCE(a.doctor_id, tp.doctor_id) AS doctor_id,
        COALESCE(SUM(CASE WHEN p.is_refund = true THEN -p.amount ELSE p.amount END), 0)::bigint AS total_collected
      FROM payments p
      LEFT JOIN invoices inv ON inv.id = p.invoice_id
      LEFT JOIN appointments a ON a.id = COALESCE(p.appointment_id, inv.appointment_id)
      -- Invoices billed from a treatment plan have no appointment: attribute them to the plan's doctor
      LEFT JOIN treatment_plans tp ON tp.id = inv.plan_id
      WHERE ${whereSql} AND COALESCE(a.doctor_id, tp.doctor_id) IS NOT NULL
      GROUP BY COALESCE(a.doctor_id, tp.doctor_id)
    `;

    const collectedMap = new Map<string, number>();
    for (const row of paymentSums) {
      collectedMap.set(row.doctor_id, Number(row.total_collected));
    }

    const doctors = await this.prisma.doctor.findMany({
      where: { isArchived: false },
      include: {
        commission: true,
      },
      orderBy: { lastNameUz: 'asc' },
    });

    return doctors.map((doc) => {
      const isConfigured = !!doc.commission;
      const percentage = isConfigured ? doc.commission!.percentage : null;
      const fixedBonus = isConfigured ? doc.commission!.fixedBonus : 0;
      const totalCollected = collectedMap.get(doc.id) || 0;

      // When unconfigured, do not silently default to 30%. Show unconfigured with totalEarned = 0.
      // fixedBonus is applied per requested reporting period.
      const payType = doc.commission?.payType ?? PayType.PERCENT;
      const monthlySalary = doc.commission?.monthlySalary ?? 0;
      const totalEarned = isConfigured
        ? computeEarned(payType, percentage!, monthlySalary, fixedBonus, totalCollected)
        : 0;

      return {
        doctorId: doc.id,
        payType,
        monthlySalary,
        doctorName: `${doc.lastNameUz} ${doc.firstNameUz}`,
        slug: doc.slug,
        isActive: doc.isActive,
        isConfigured,
        percentage,
        fixedBonus,
        notes: doc.commission?.notes || null,
        totalCollected,
        totalEarned,
        updatedAt: doc.commission?.updatedAt || doc.updatedAt,
      };
    });
  }

  async getDoctorEarnings(doctorId: string, from?: string, to?: string) {
    const clinicSettings = await this.prisma.clinicSettings.findFirst();
    const timezone = clinicSettings?.timezone || 'Asia/Tashkent';
    const { fromDate, toDate } = this.parseDateBoundaries(timezone, from, to);

    const doc = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
      include: { commission: true },
    });

    if (!doc) throw new NotFoundException('Shifokor topilmadi');

    const conditions: Prisma.Sql[] = [Prisma.sql`COALESCE(a.doctor_id, tp.doctor_id) = ${doctorId}`];
    if (fromDate) {
      conditions.push(Prisma.sql`p.recorded_at >= ${fromDate}`);
    }
    if (toDate) {
      conditions.push(Prisma.sql`p.recorded_at <= ${toDate}`);
    }
    const whereSql = Prisma.join(conditions, ' AND ');

    // Aggregate appointments and payments at database level
    const appointmentRows = await this.prisma.$queryRaw<Array<{
      appointment_id: string;
      start_time: Date;
      patient_name: string;
      service_name: string;
      status: string;
      collected: bigint;
    }>>`
      SELECT
        COALESCE(a.id, inv.id) AS appointment_id,
        COALESCE(a.start_time, inv.created_at) AS start_time,
        p_patient.full_name AS patient_name,
        COALESCE(a.service_name, tp.title) AS service_name,
        COALESCE(a.status::text, 'PLAN') AS status,
        COALESCE(SUM(CASE WHEN p.is_refund = true THEN -p.amount ELSE p.amount END), 0)::bigint AS collected
      FROM payments p
      LEFT JOIN invoices inv ON inv.id = p.invoice_id
      LEFT JOIN appointments a ON a.id = COALESCE(p.appointment_id, inv.appointment_id)
      LEFT JOIN treatment_plans tp ON tp.id = inv.plan_id
      JOIN patients p_patient ON p_patient.id = COALESCE(a.patient_id, inv.patient_id)
      WHERE ${whereSql}
      GROUP BY COALESCE(a.id, inv.id), COALESCE(a.start_time, inv.created_at), p_patient.full_name,
               COALESCE(a.service_name, tp.title), COALESCE(a.status::text, 'PLAN')
      ORDER BY 2 DESC
    `;

    let totalCollected = 0;
    const appointmentBreakdown = appointmentRows.map((row) => {
      const coll = Number(row.collected);
      totalCollected += coll;
      return {
        appointmentId: row.appointment_id,
        startTime: row.start_time,
        patientName: row.patient_name,
        serviceName: row.service_name,
        status: row.status,
        collected: coll,
      };
    });

    const isConfigured = !!doc.commission;
    const percentage = isConfigured ? doc.commission!.percentage : null;
    const fixedBonus = isConfigured ? doc.commission!.fixedBonus : 0;

    const payType = doc.commission?.payType ?? PayType.PERCENT;
    const monthlySalary = doc.commission?.monthlySalary ?? 0;
    const totalEarned = isConfigured
      ? computeEarned(payType, percentage!, monthlySalary, fixedBonus, totalCollected)
      : 0;

    return {
      doctorId: doc.id,
      payType,
      monthlySalary,
      doctorName: `${doc.lastNameUz} ${doc.firstNameUz}`,
      isConfigured,
      percentage,
      fixedBonus,
      notes: doc.commission?.notes || null,
      totalCollected,
      totalEarned,
      appointments: appointmentBreakdown,
    };
  }

  async updateCommission(doctorId: string, dto: UpdateCommissionDto, user: JwtPayload) {
    const doctor = await this.prisma.doctor.findUnique({ where: { id: doctorId } });
    if (!doctor) throw new NotFoundException('Shifokor topilmadi');

    return await this.prisma.$transaction(async (tx) => {
      const commission = await tx.doctorCommission.upsert({
        where: { doctorId },
        create: {
          doctorId,
          percentage: dto.percentage,
          fixedBonus: dto.fixedBonus || 0,
          payType: dto.payType ?? PayType.PERCENT,
          monthlySalary: dto.monthlySalary ?? 0,
          notes: dto.notes || null,
        },
        update: {
          percentage: dto.percentage,
          payType: dto.payType,
          monthlySalary: dto.monthlySalary,
          fixedBonus: dto.fixedBonus !== undefined ? dto.fixedBonus : undefined,
          notes: dto.notes !== undefined ? dto.notes : undefined,
        },
      });

      await this.auditService.logTransactional({
        tx,
        userId: user.sub,
        action: 'commission.updated',
        entity: 'DoctorCommission',
        entityId: commission.id,
        details: {
          doctorId,
          percentage: dto.percentage,
          fixedBonus: dto.fixedBonus,
          payType: dto.payType,
          monthlySalary: dto.monthlySalary,
          notes: dto.notes,
        },
      });

      return commission;
    });
  }

  /**
   * Pay report for every active staff account. "Collected at desk" is money the person took
   * (payments they recorded, refunds subtracted): the base for a staff percentage, and a
   * useful "who took how much" figure on its own.
   */
  async listStaffPay(from?: string, to?: string) {
    const clinicSettings = await this.prisma.clinicSettings.findFirst();
    const timezone = clinicSettings?.timezone || 'Asia/Tashkent';
    const { fromDate, toDate } = this.parseDateBoundaries(timezone, from, to);
    const conditions: Prisma.Sql[] = [Prisma.sql`p.recorded_by_id IS NOT NULL`];
    if (fromDate) conditions.push(Prisma.sql`p.recorded_at >= ${fromDate}`);
    if (toDate) conditions.push(Prisma.sql`p.recorded_at <= ${toDate}`);
    const rows = await this.prisma.$queryRaw<Array<{ staff_id: string; collected: bigint }>>`
      SELECT p.recorded_by_id AS staff_id,
             COALESCE(SUM(CASE WHEN p.is_refund = true THEN -p.amount ELSE p.amount END), 0)::bigint AS collected
      FROM payments p
      WHERE ${Prisma.join(conditions, ' AND ')}
      GROUP BY p.recorded_by_id
    `;
    const collected = new Map(rows.map((r) => [r.staff_id, Number(r.collected)]));

    const staff = await this.prisma.staffUser.findMany({
      where: { isActive: true },
      include: { compensation: true },
      orderBy: { fullName: 'asc' },
    });

    return staff.map((u) => {
      const c = u.compensation;
      const took = collected.get(u.id) || 0;
      return {
        staffUserId: u.id,
        fullName: u.fullName,
        role: u.role,
        doctorId: u.doctorId,
        isConfigured: !!c,
        payType: c?.payType ?? PayType.SALARY,
        monthlySalary: c?.monthlySalary ?? 0,
        percentage: c?.percentage ?? 0,
        fixedBonus: c?.fixedBonus ?? 0,
        notes: c?.notes ?? null,
        collectedAtDesk: took,
        totalEarned: c ? computeEarned(c.payType, c.percentage, c.monthlySalary, c.fixedBonus, took) : 0,
      };
    });
  }

  async updateStaffPay(staffUserId: string, dto: UpdateStaffPayDto, user: JwtPayload) {
    const staff = await this.prisma.staffUser.findUnique({ where: { id: staffUserId } });
    if (!staff) throw new NotFoundException('Xodim topilmadi');
    return this.prisma.$transaction(async (tx) => {
      const data = {
        payType: dto.payType,
        monthlySalary: dto.monthlySalary ?? 0,
        percentage: dto.percentage ?? 0,
        fixedBonus: dto.fixedBonus ?? 0,
        notes: dto.notes ?? null,
      };
      const row = await tx.staffCompensation.upsert({
        where: { staffUserId },
        create: { staffUserId, ...data },
        update: data,
      });
      await this.auditService.logTransactional({
        tx,
        userId: user.sub,
        action: 'staff.pay_updated',
        entity: 'StaffCompensation',
        entityId: row.id,
        details: { staffUserId, ...data },
      });
      return row;
    });
  }
}
