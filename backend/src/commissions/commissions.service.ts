import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../auth/auth.service';
import { UpdateCommissionDto } from './dto/commission.dto';
import { fromZonedTime } from 'date-fns-tz';
import { Prisma } from '@prisma/client';

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
        a.doctor_id,
        COALESCE(SUM(CASE WHEN p.is_refund = true THEN -p.amount ELSE p.amount END), 0)::bigint AS total_collected
      FROM payments p
      LEFT JOIN invoices inv ON inv.id = p.invoice_id
      JOIN appointments a ON a.id = COALESCE(p.appointment_id, inv.appointment_id)
      WHERE ${whereSql}
      GROUP BY a.doctor_id
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
      const totalEarned = isConfigured
        ? Math.max(0, Math.round(totalCollected * (percentage! / 100))) + (fixedBonus || 0)
        : 0;

      return {
        doctorId: doc.id,
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

    const conditions: Prisma.Sql[] = [Prisma.sql`a.doctor_id = ${doctorId}`];
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
        a.id AS appointment_id,
        a.start_time,
        p_patient.full_name AS patient_name,
        a.service_name,
        a.status,
        COALESCE(SUM(CASE WHEN p.is_refund = true THEN -p.amount ELSE p.amount END), 0)::bigint AS collected
      FROM payments p
      LEFT JOIN invoices inv ON inv.id = p.invoice_id
      JOIN appointments a ON a.id = COALESCE(p.appointment_id, inv.appointment_id)
      JOIN patients p_patient ON p_patient.id = a.patient_id
      WHERE ${whereSql}
      GROUP BY a.id, a.start_time, p_patient.full_name, a.service_name, a.status
      ORDER BY a.start_time DESC
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

    const totalEarned = isConfigured
      ? Math.max(0, Math.round(totalCollected * (percentage! / 100))) + (fixedBonus || 0)
      : 0;

    return {
      doctorId: doc.id,
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
          notes: dto.notes || null,
        },
        update: {
          percentage: dto.percentage,
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
          notes: dto.notes,
        },
      });

      return commission;
    });
  }
}
