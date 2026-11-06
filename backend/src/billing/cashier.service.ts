import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { JwtPayload } from '../auth/auth.service';
import { lockInvoice, refreshInvoiceStatus } from './invoice-ledger';

const METHODS = Object.values(PaymentMethod);

@Injectable()
export class CashierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async timezone() {
    const s = await this.prisma.clinicSettings.findFirst({ select: { timezone: true } });
    return s?.timezone || 'Asia/Tashkent';
  }

  /** Net cash received in [from, to): cash payments minus cash refunds. */
  private async netCash(from: Date, to: Date) {
    const rows = await this.prisma.payment.groupBy({
      by: ['isRefund'],
      where: { method: PaymentMethod.CASH, recordedAt: { gte: from, lt: to } },
      _sum: { amount: true },
    });
    const inSum = rows.find((r) => !r.isRefund)?._sum.amount || 0;
    const outSum = rows.find((r) => r.isRefund)?._sum.amount || 0;
    return inSum - outSum;
  }

  private async staffNames(ids: Array<string | null | undefined>) {
    const unique = Array.from(new Set(ids.filter(Boolean) as string[]));
    if (!unique.length) return new Map<string, string>();
    const staff = await this.prisma.staffUser.findMany({ where: { id: { in: unique } }, select: { id: true, fullName: true, email: true } });
    return new Map(staff.map((s) => [s.id, s.fullName || s.email]));
  }

  /** Day report for the cash desk, in clinic-local time. */
  async summary(date?: string) {
    const tz = await this.timezone();
    const day = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : formatInTimeZone(new Date(), tz, 'yyyy-MM-dd');
    const from = fromZonedTime(`${day} 00:00:00`, tz);
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);

    const payments = await this.prisma.payment.findMany({
      where: { recordedAt: { gte: from, lt: to } },
      include: {
        patient: { select: { id: true, fullName: true, phone: true } },
        invoice: { select: { id: true, notes: true } },
      },
      orderBy: { recordedAt: 'desc' },
    });

    const byMethod = Object.fromEntries(METHODS.map((m) => [m, 0])) as Record<string, number>;
    let income = 0;
    let refunds = 0;
    for (const p of payments) {
      byMethod[p.method] += p.isRefund ? -p.amount : p.amount;
      if (p.isRefund) refunds += p.amount;
      else income += p.amount;
    }
    const names = await this.staffNames(payments.map((p) => p.recordedById));
    const openShift = await this.currentShift();

    return {
      date: day,
      timezone: tz,
      totals: { incomeUzs: income, refundsUzs: refunds, netUzs: income - refunds, byMethod, count: payments.length },
      openShift,
      payments: payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        method: p.method,
        isRefund: p.isRefund,
        refundOfId: p.refundOfId,
        note: p.note,
        recordedAt: p.recordedAt,
        recordedBy: p.recordedById ? names.get(p.recordedById) || null : null,
        patient: p.patient,
        invoice: p.invoice,
      })),
    };
  }

  async currentShift() {
    const shift = await this.prisma.cashShift.findFirst({ where: { closedAt: null }, orderBy: { openedAt: 'desc' } });
    if (!shift) return null;
    const cashIn = await this.netCash(shift.openedAt, new Date(Date.now() + 1000));
    const names = await this.staffNames([shift.openedById]);
    return { ...shift, openedBy: names.get(shift.openedById) || null, cashInUzs: cashIn, expectedCashUzs: shift.openingCash + cashIn };
  }

  async listShifts(limit = 20) {
    const shifts = await this.prisma.cashShift.findMany({ orderBy: { openedAt: 'desc' }, take: Math.min(100, Math.max(1, limit)) });
    const names = await this.staffNames(shifts.flatMap((s) => [s.openedById, s.closedById]));
    return shifts.map((s) => ({
      ...s,
      openedBy: names.get(s.openedById) || null,
      closedBy: s.closedById ? names.get(s.closedById) || null : null,
      differenceUzs: s.countedCash != null && s.expectedCash != null ? s.countedCash - s.expectedCash : null,
    }));
  }

  async openShift(openingCash: number, user: JwtPayload) {
    try {
      const shift = await this.prisma.cashShift.create({ data: { openedById: user.sub, openingCash } });
      await this.audit.log({ userId: user.sub, action: 'cashier.shift_opened', entity: 'CashShift', entityId: shift.id, details: { openingCash } });
      return this.currentShift();
    } catch (e) {
      // Partial unique index allows a single open shift
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Kassa smenasi allaqachon ochiq');
      }
      throw e;
    }
  }

  async closeShift(id: string, countedCash: number, note: string | undefined, user: JwtPayload) {
    const shift = await this.prisma.cashShift.findUnique({ where: { id } });
    if (!shift) throw new NotFoundException('Smena topilmadi');
    if (shift.closedAt) throw new BadRequestException('Smena allaqachon yopilgan');
    const closedAt = new Date();
    const expected = shift.openingCash + (await this.netCash(shift.openedAt, closedAt));
    const res = await this.prisma.cashShift.updateMany({
      where: { id, closedAt: null },
      data: { closedAt, closedById: user.sub, countedCash, expectedCash: expected, note: note?.trim() || null },
    });
    if (res.count !== 1) throw new BadRequestException('Smena allaqachon yopilgan');
    await this.audit.log({
      userId: user.sub,
      action: 'cashier.shift_closed',
      entity: 'CashShift',
      entityId: id,
      details: { expectedCash: expected, countedCash, difference: countedCash - expected },
    });
    return { ...(await this.prisma.cashShift.findUnique({ where: { id } })), differenceUzs: countedCash - expected };
  }

  /** Refund (part of) a desk payment. Online payments are refunded through the provider. */
  async refund(paymentId: string, amount: number | undefined, reason: string, user: JwtPayload) {
    return this.prisma.$transaction(async (tx) => {
      const original = await tx.payment.findUnique({ where: { id: paymentId } });
      if (!original || original.isRefund) throw new NotFoundException("To'lov topilmadi");
      if (original.method === PaymentMethod.PAYME || original.method === PaymentMethod.CLICK) {
        throw new BadRequestException(`${original.method} to'lovi provayder kabineti orqali qaytariladi`);
      }
      if (original.invoiceId) await lockInvoice(tx, original.invoiceId);

      const already = await tx.payment.aggregate({ where: { refundOfId: original.id, isRefund: true }, _sum: { amount: true } });
      const refundable = original.amount - (already._sum.amount || 0);
      const value = amount ?? refundable;
      if (value <= 0 || value > refundable) {
        throw new BadRequestException(`Qaytarish summasi 1 dan ${refundable} gacha bo'lishi kerak`);
      }

      const refund = await tx.payment.create({
        data: {
          amount: value,
          method: original.method,
          isRefund: true,
          refundOfId: original.id,
          invoiceId: original.invoiceId,
          patientId: original.patientId,
          appointmentId: original.appointmentId,
          recordedById: user.sub,
          note: reason.trim(),
          currency: original.currency,
        },
      });
      if (original.invoiceId) await refreshInvoiceStatus(tx, original.invoiceId);
      await this.audit.logTransactional({
        tx,
        userId: user.sub,
        action: 'billing.payment_refunded',
        entity: 'Payment',
        entityId: original.id,
        details: { amount: value, method: original.method, reason: reason.trim() },
      });
      return refund;
    });
  }
}
