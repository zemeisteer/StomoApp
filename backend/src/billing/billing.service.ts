import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StaffRole, PaymentMethod } from '@prisma/client';
import { JwtPayload } from '../auth/auth.service';
import { CreateInvoiceDto } from './dto/invoice.dto';
import { RecordPaymentDto } from './dto/payment.dto';

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
      const debtAmount = Math.max(0, effectiveTotal - paidAmount);
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
        status: debtAmount === 0 ? 'PAID' : paidAmount > 0 ? 'PARTIALLY_PAID' : 'PENDING',
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
          currency: 'UZS',
        },
      });

      // Update invoice status if linked to invoice
      if (dto.invoiceId) {
        const updatedPayments = await tx.payment.findMany({
          where: { invoiceId: dto.invoiceId },
          select: { amount: true, isRefund: true },
        });
        const totalPaid = updatedPayments.reduce((acc, p) => acc + (p.isRefund ? -p.amount : p.amount), 0);
        const inv = await tx.invoice.findUnique({
          where: { id: dto.invoiceId },
          select: { totalAmount: true, discount: true },
        });
        const effectiveTotal = Math.max(0, (inv?.totalAmount || 0) - (inv?.discount || 0));
        const newStatus = totalPaid >= effectiveTotal ? 'PAID' : totalPaid > 0 ? 'PARTIALLY_PAID' : 'PENDING';
        await tx.invoice.update({
          where: { id: dto.invoiceId },
          data: { status: newStatus },
        });
      }

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

  async getPatientDebts(user: JwtPayload) {
    const where: any = {};
    if (user.role === StaffRole.DOCTOR) {
      if (!user.doctorId) throw new ForbiddenException('Shifokor profili biriktirilmagan');
      where.appointments = { some: { doctorId: user.doctorId } };
    }

    // Dynamic debt calculation: total invoiced minus total payments
    const patients = await this.prisma.patient.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        phone: true,
        invoices: {
          select: {
            totalAmount: true,
            discount: true,
          },
        },
        payments: {
          select: {
            amount: true,
            isRefund: true,
          },
        },
      },
    });

    return patients
      .map((p) => {
        const totalBilled = p.invoices.reduce((acc, inv) => acc + Math.max(0, inv.totalAmount - (inv.discount || 0)), 0);
        const totalPaid = p.payments.reduce((acc, pay) => acc + (pay.isRefund ? -pay.amount : pay.amount), 0);
        const totalDebt = Math.max(0, totalBilled - totalPaid);
        return {
          id: p.id,
          fullName: p.fullName,
          phone: p.phone,
          totalBilled,
          totalPaid,
          totalDebt,
        };
      })
      .filter((p) => p.totalDebt > 0);
  }
}

