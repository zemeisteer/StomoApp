import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StaffRole, PaymentMethod, Prisma } from '@prisma/client';
import { JwtPayload } from '../auth/auth.service';
import { CreateInvoiceDto } from './dto/invoice.dto';
import { DESK_PAYMENT_METHODS, RecordPaymentDto } from './dto/payment.dto';
import { refreshInvoiceStatus } from './invoice-ledger';

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async listInvoices(params: { patientId?: string; appointmentId?: string }, user: JwtPayload) {
    const where: any = {};
    if (params.patientId) where.patientId = params.patientId;
    if (params.appointmentId) where.appointmentId = params.appointmentId;

    if (user.role === StaffRole.DOCTOR) {
      if (!user.doctorId) throw new ForbiddenException('Shifokor profili biriktirilmagan');
      where.appointment = {
        doctorId: user.doctorId,
      };
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: {
        patient: { select: { id: true, fullName: true, phone: true } },
        appointment: { select: { id: true, startTime: true, serviceName: true } },
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return invoices.map((inv) => {
      const paidAmount = inv.payments.reduce((acc, p) => acc + (p.isRefund ? -p.amount : p.amount), 0);
      const effectiveTotal = Math.max(0, inv.totalAmount - (inv.discount || 0));
      const cancelled = inv.status === 'CANCELLED';
      // A cancelled invoice is never owed (same rule as every debt query)
      const debtAmount = cancelled ? 0 : Math.max(0, effectiveTotal - paidAmount);
      return {
        id: inv.id,
        patientId: inv.patientId,
        patientName: inv.patient.fullName,
        patientPhone: inv.patient.phone,
        appointmentId: inv.appointmentId,
        appointmentDate: inv.appointment?.startTime,
        serviceName: inv.appointment?.serviceName,
        totalAmount: inv.totalAmount,
        discount: inv.discount,
        effectiveTotal,
        paidAmount,
        debtAmount,
        status: cancelled ? 'CANCELLED' : debtAmount === 0 ? 'PAID' : paidAmount > 0 ? 'PARTIALLY_PAID' : 'PENDING',
        notes: inv.notes,
        createdAt: inv.createdAt,
        payments: inv.payments,
      };
    });
  }

  async createInvoice(dto: CreateInvoiceDto, user: JwtPayload) {
    const patient = await this.prisma.patient.findUnique({ where: { id: dto.patientId } });
    if (!patient) throw new NotFoundException('Bemor topilmadi');

    const discount = dto.discount || 0;
    if (discount < 0) {
      throw new BadRequestException('Chegirma manfiy bo\'lishi mumkin emas');
    }
    if (discount > dto.totalAmount) {
      throw new BadRequestException('Chegirma umumiy summadan katta bo\'lishi mumkin emas');
    }

    if (dto.appointmentId) {
      const appt = await this.prisma.appointment.findUnique({
        where: { id: dto.appointmentId },
        select: { id: true, patientId: true, doctorId: true },
      });
      if (!appt) throw new NotFoundException('Qabul topilmadi');
      if (appt.patientId !== dto.patientId) {
        throw new BadRequestException('Tanlangan qabul ko\'rsatilgan bemorga tegishli emas');
      }
      if (user.role === StaffRole.DOCTOR && appt.doctorId !== user.doctorId) {
        throw new ForbiddenException('Boshqa shifokor qabuli uchun hisob-faktura yaratish taqiqlangan');
      }
    } else if (user.role === StaffRole.DOCTOR) {
      // Without a visit (e.g. a tooth finished on the chart) a doctor bills only their own patient
      if (!user.doctorId) throw new ForbiddenException('Shifokor profili biriktirilmagan');
      const treated = await this.prisma.appointment.findFirst({
        where: { patientId: dto.patientId, doctorId: user.doctorId },
        select: { id: true },
      });
      if (!treated) {
        throw new ForbiddenException('Faqat o\'zingiz qabul qilgan bemorga hisob-faktura yaratishingiz mumkin');
      }
    }

    return await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          patientId: dto.patientId,
          appointmentId: dto.appointmentId || null,
          totalAmount: dto.totalAmount,
          discount,
          status: 'PENDING',
          notes: dto.notes || null,
        },
      });

      await this.auditService.logTransactional({
        tx,
        userId: user.sub,
        action: 'billing.invoice_created',
        entity: 'Invoice',
        entityId: invoice.id,
        details: { patientId: dto.patientId, totalAmount: dto.totalAmount, discount },
      });

      return invoice;
    });
  }

  async recordPayment(dto: RecordPaymentDto, user: JwtPayload) {
    if (dto.amount <= 0) {
      throw new BadRequestException('To\'lov summasi musbat bo\'lishi kerak');
    }
    // Payme / Click money is recorded only by the provider callbacks, never by hand at the desk
    if (dto.method && !DESK_PAYMENT_METHODS.includes(dto.method)) {
      throw new BadRequestException('Payme va Click to\'lovlari faqat provayder orqali qayd etiladi');
    }

    return await this.prisma.$transaction(async (tx) => {
      let targetPatientId = dto.patientId;
      let targetAppointmentId = dto.appointmentId;

      if (dto.invoiceId) {
        // Pessimistic row-level lock on invoice to prevent concurrent overpayments
        const rows = await tx.$queryRaw<Array<{
          id: string;
          patient_id: string;
          appointment_id: string | null;
          total_amount: number;
          discount: number;
          status: string;
        }>>`
          SELECT id, patient_id, appointment_id, total_amount, discount, status
          FROM "invoices"
          WHERE id = ${dto.invoiceId}
          FOR UPDATE;
        `;
        if (!rows || rows.length === 0) {
          throw new NotFoundException('Hisob-faktura topilmadi');
        }

        const invoice = rows[0];

        if (invoice.status === 'CANCELLED') {
          throw new BadRequestException('Bekor qilingan hisob-fakturaga to\'lov qabul qilinmaydi');
        }

        // Validate patientId match if provided
        if (dto.patientId && dto.patientId !== invoice.patient_id) {
          throw new BadRequestException('To\'lov bemori hisob-faktura bemoriga mos kelmaydi');
        }

        // Validate appointmentId match if provided and invoice is linked
        if (dto.appointmentId && invoice.appointment_id && dto.appointmentId !== invoice.appointment_id) {
          throw new BadRequestException('To\'lov qabuli hisob-faktura qabuliga mos kelmaydi');
        }

        targetPatientId = targetPatientId || invoice.patient_id;
        targetAppointmentId = targetAppointmentId || invoice.appointment_id || undefined;

        // Calculate remaining debt within the locked transaction
        const payments = await tx.payment.findMany({
          where: { invoiceId: invoice.id },
          select: { amount: true, isRefund: true },
        });
        const currentPaid = payments.reduce((acc, p) => acc + (p.isRefund ? -p.amount : p.amount), 0);
        const effectiveTotal = Math.max(0, invoice.total_amount - (invoice.discount || 0));
        const remainingDebt = Math.max(0, effectiveTotal - currentPaid);

        if (dto.amount > remainingDebt) {
          throw new BadRequestException(
            `To'lov summasi (${dto.amount}) qolgan qarzdan (${remainingDebt}) oshib ketishi mumkin emas`,
          );
        }
      }

      if (!targetPatientId && !targetAppointmentId) {
        throw new BadRequestException('Bemor yoki qabul ko\'rsatilishi shart');
      }

      // If appointmentId given without invoiceId, verify appointment exists and matches patientId
      if (targetAppointmentId && !dto.invoiceId) {
        const appt = await tx.appointment.findUnique({
          where: { id: targetAppointmentId },
          select: { id: true, patientId: true },
        });
        if (!appt) throw new NotFoundException('Qabul topilmadi');
        if (targetPatientId && appt.patientId !== targetPatientId) {
          throw new BadRequestException('Qabul ko\'rsatilgan bemorga tegishli emas');
        }
        targetPatientId = targetPatientId || appt.patientId;
      }

      const payment = await tx.payment.create({
        data: {
          amount: dto.amount,
          method: dto.method || PaymentMethod.CASH,
          invoiceId: dto.invoiceId || null,
          patientId: targetPatientId || null,
          appointmentId: targetAppointmentId || null,
          note: dto.note || null,
          recordedById: user.sub,
          currency: 'UZS',
        },
      });

      // Update invoice status if linked to invoice
      // Shared ledger rule (never touches a CANCELLED invoice)
      if (dto.invoiceId) await refreshInvoiceStatus(tx, dto.invoiceId);

      await this.auditService.logTransactional({
        tx,
        userId: user.sub,
        action: 'billing.payment_recorded',
        entity: 'Payment',
        entityId: payment.id,
        details: { amount: dto.amount, method: payment.method, patientId: targetPatientId, invoiceId: dto.invoiceId },
      });

      return payment;
    });
  }

  async getPatientDebts(user: JwtPayload, query?: { page?: number; limit?: number }) {
    const hasPage = query?.page !== undefined && !Number.isNaN(query.page);
    const hasLimit = query?.limit !== undefined && !Number.isNaN(query.limit);
    const isPaginated = hasPage || hasLimit;
    const page = Math.max(1, query?.page ? Number(query.page) : 1);
    const limit = Math.max(1, Math.min(100, query?.limit ? Number(query.limit) : 20));
    const offset = (page - 1) * limit;

    let invoiceJoinSql = Prisma.empty;
    let paymentJoinSql = Prisma.empty;
    let doctorWhereSql = Prisma.empty;

    if (user.role === StaffRole.DOCTOR) {
      if (!user.doctorId) throw new ForbiddenException('Shifokor profili biriktirilmagan');
      invoiceJoinSql = Prisma.sql`JOIN appointments a_inv ON a_inv.id = i.appointment_id AND a_inv.doctor_id = ${user.doctorId}`;
      paymentJoinSql = Prisma.sql`JOIN invoices i_pay ON i_pay.id = p.invoice_id JOIN appointments a_pay ON a_pay.id = i_pay.appointment_id AND a_pay.doctor_id = ${user.doctorId}`;
      doctorWhereSql = Prisma.sql`AND EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id = p.id AND a.doctor_id = ${user.doctorId})`;
    }

    // Database-level dynamic aggregation: computes net billed vs net paid directly in PostgreSQL
    const rows = await this.prisma.$queryRaw<Array<{
      id: string;
      fullName: string;
      phone: string;
      totalBilled: number;
      totalPaid: number;
      totalDebt: number;
    }>>`
      WITH patient_payments AS (
        SELECT p.patient_id, SUM(CASE WHEN p.is_refund THEN -p.amount ELSE p.amount END) as total_paid
        FROM payments p
        ${paymentJoinSql}
        WHERE p.patient_id IS NOT NULL
        GROUP BY p.patient_id
      ),
      patient_invoices AS (
        SELECT i.patient_id, SUM(GREATEST(0, i.total_amount - COALESCE(i.discount, 0))) as total_billed
        FROM invoices i
        ${invoiceJoinSql}
        GROUP BY i.patient_id
      )
      SELECT
        p.id,
        p.full_name as "fullName",
        p.phone,
        COALESCE(pi.total_billed, 0)::int as "totalBilled",
        COALESCE(pp.total_paid, 0)::int as "totalPaid",
        (COALESCE(pi.total_billed, 0) - COALESCE(pp.total_paid, 0))::int as "totalDebt"
      FROM patients p
      LEFT JOIN patient_invoices pi ON pi.patient_id = p.id
      LEFT JOIN patient_payments pp ON pp.patient_id = p.id
      WHERE (COALESCE(pi.total_billed, 0) - COALESCE(pp.total_paid, 0)) > 0
      ${doctorWhereSql}
      ORDER BY "totalDebt" DESC
      ${isPaginated ? Prisma.sql`LIMIT ${limit} OFFSET ${offset}` : Prisma.empty};
    `;

    const countRows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      WITH patient_payments AS (
        SELECT p.patient_id, SUM(CASE WHEN p.is_refund THEN -p.amount ELSE p.amount END) as total_paid
        FROM payments p
        ${paymentJoinSql}
        WHERE p.patient_id IS NOT NULL
        GROUP BY p.patient_id
      ),
      patient_invoices AS (
        SELECT i.patient_id, SUM(GREATEST(0, i.total_amount - COALESCE(discount, 0))) as total_billed
        FROM invoices i
        ${invoiceJoinSql}
        GROUP BY i.patient_id
      )
      SELECT COUNT(*)::bigint as count
      FROM patients p
      LEFT JOIN patient_invoices pi ON pi.patient_id = p.id
      LEFT JOIN patient_payments pp ON pp.patient_id = p.id
      WHERE (COALESCE(pi.total_billed, 0) - COALESCE(pp.total_paid, 0)) > 0
      ${doctorWhereSql};
    `;

    const total = Number(countRows[0]?.count || 0);

    // Unified response contract across all paths (both paginated and full list)
    return {
      items: rows,
      total,
      page: isPaginated ? page : 1,
      limit: isPaginated ? limit : (total || 20),
      totalPages: isPaginated ? Math.ceil(total / limit) : 1,
    };
  }
}

