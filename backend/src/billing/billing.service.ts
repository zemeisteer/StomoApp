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
      where.patient = {
        appointments: { some: { doctorId: user.doctorId } },
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

    return await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.create({
        data: {
          patientId: dto.patientId,
          appointmentId: dto.appointmentId || null,
          totalAmount: dto.totalAmount,
          discount: dto.discount || 0,
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
        details: { patientId: dto.patientId, totalAmount: dto.totalAmount, discount: dto.discount },
      });

      return invoice;
    });
  }

  async recordPayment(dto: RecordPaymentDto, user: JwtPayload) {
    let targetPatientId = dto.patientId;
    let targetAppointmentId = dto.appointmentId;

    if (dto.invoiceId) {
      const invoice = await this.prisma.invoice.findUnique({
        where: { id: dto.invoiceId },
        select: { id: true, patientId: true, appointmentId: true },
      });
      if (!invoice) throw new NotFoundException('Hisob-faktura topilmadi');
      targetPatientId = targetPatientId || invoice.patientId;
      targetAppointmentId = targetAppointmentId || invoice.appointmentId || undefined;
    }

    if (!targetPatientId && !targetAppointmentId) {
      throw new BadRequestException('Bemor yoki qabul ko\'rsatilishi shart');
    }

    return await this.prisma.$transaction(async (tx) => {
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
        const inv = await tx.invoice.findUnique({
          where: { id: dto.invoiceId },
          include: { payments: true },
        });
        if (inv) {
          const totalPaid = inv.payments.reduce((acc, p) => acc + (p.isRefund ? -p.amount : p.amount), 0);
          const effectiveTotal = Math.max(0, inv.totalAmount - (inv.discount || 0));
          const newStatus = totalPaid >= effectiveTotal ? 'PAID' : totalPaid > 0 ? 'PARTIALLY_PAID' : 'PENDING';
          await tx.invoice.update({
            where: { id: inv.id },
            data: { status: newStatus },
          });
        }
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

