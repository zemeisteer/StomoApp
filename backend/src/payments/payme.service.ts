import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PaymentsConfig } from './payments.config';
import { applyInvoicePayment, invoiceBalance, lockInvoice, refreshInvoiceStatus } from '../billing/invoice-ledger';

/**
 * Payme (Paycom) Merchant API, JSON-RPC 2.0.
 * Payme calls one endpoint; every response is HTTP 200 with either `result` or `error`.
 * Amounts arrive in tiyin; the account field configured in the Payme cabinet is `invoice_id`.
 */

const TX_TIMEOUT_MS = 12 * 60 * 60 * 1000; // Payme: unperformed transactions expire after 12 hours

export const PaymeError = {
  INVALID_AMOUNT: -31001,
  TX_NOT_FOUND: -31003,
  CANNOT_CANCEL: -31007,
  CANNOT_PERFORM: -31008,
  INVOICE_NOT_FOUND: -31050,
  INVOICE_NOT_PAYABLE: -31051,
  INVOICE_BUSY: -31052,
  METHOD_NOT_FOUND: -32601,
  INVALID_REQUEST: -32600,
  PARSE_ERROR: -32700,
  UNAUTHORIZED: -32504,
} as const;

const MESSAGES: Record<number, { uz: string; ru: string; en: string }> = {
  [PaymeError.INVALID_AMOUNT]: { uz: "Noto'g'ri summa", ru: 'Неверная сумма', en: 'Invalid amount' },
  [PaymeError.TX_NOT_FOUND]: { uz: 'Tranzaksiya topilmadi', ru: 'Транзакция не найдена', en: 'Transaction not found' },
  [PaymeError.CANNOT_CANCEL]: { uz: "Bekor qilib bo'lmaydi", ru: 'Невозможно отменить', en: 'Cannot cancel' },
  [PaymeError.CANNOT_PERFORM]: { uz: "Amalni bajarib bo'lmaydi", ru: 'Невозможно выполнить операцию', en: 'Cannot perform operation' },
  [PaymeError.INVOICE_NOT_FOUND]: { uz: 'Hisob topilmadi', ru: 'Счёт не найден', en: 'Invoice not found' },
  [PaymeError.INVOICE_NOT_PAYABLE]: { uz: "Hisob to'langan yoki yopilgan", ru: 'Счёт оплачен или закрыт', en: 'Invoice already paid or closed' },
  [PaymeError.INVOICE_BUSY]: { uz: "Hisob bo'yicha boshqa to'lov kutilmoqda", ru: 'По счёту ожидается другая оплата', en: 'Another payment is pending' },
  [PaymeError.METHOD_NOT_FOUND]: { uz: 'Metod topilmadi', ru: 'Метод не найден', en: 'Method not found' },
  [PaymeError.INVALID_REQUEST]: { uz: "Noto'g'ri so'rov", ru: 'Неверный запрос', en: 'Invalid request' },
  [PaymeError.PARSE_ERROR]: { uz: "JSON xato", ru: 'Ошибка разбора JSON', en: 'Parse error' },
  [PaymeError.UNAUTHORIZED]: { uz: "Ruxsat yo'q", ru: 'Недостаточно привилегий', en: 'Insufficient privileges' },
};

class PaymeRpcError extends Error {
  constructor(public readonly code: number, public readonly data?: string) {
    super(String(code));
  }
}

const n = (v: bigint | null | undefined) => (v === null || v === undefined ? 0 : Number(v));

@Injectable()
export class PaymeService {
  private readonly logger = new Logger(PaymeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: PaymentsConfig,
  ) {}

  /** Basic auth "Paycom:<key>", compared in constant time. */
  isAuthorized(header: string | undefined): boolean {
    const { enabled, key } = this.config.payme;
    if (!enabled || !header?.startsWith('Basic ')) return false;
    let decoded = '';
    try {
      decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    } catch {
      return false;
    }
    const expected = Buffer.from(`Paycom:${key}`);
    const given = Buffer.from(decoded);
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  }

  errorResponse(id: unknown, code: number, data?: string) {
    return { jsonrpc: '2.0', id: id ?? null, error: { code, message: MESSAGES[code] || MESSAGES[PaymeError.INVALID_REQUEST], data } };
  }

  async handle(body: any, authHeader: string | undefined) {
    const id = body?.id ?? null;
    if (!this.isAuthorized(authHeader)) return this.errorResponse(id, PaymeError.UNAUTHORIZED);
    if (!body || typeof body !== 'object' || typeof body.method !== 'string') return this.errorResponse(id, PaymeError.INVALID_REQUEST);
    const params = body.params || {};
    try {
      let result: unknown;
      switch (body.method) {
        case 'CheckPerformTransaction':
          result = await this.checkPerform(params);
          break;
        case 'CreateTransaction':
          result = await this.create(params);
          break;
        case 'PerformTransaction':
          result = await this.perform(params);
          break;
        case 'CancelTransaction':
          result = await this.cancel(params);
          break;
        case 'CheckTransaction':
          result = await this.check(params);
          break;
        case 'GetStatement':
          result = await this.statement(params);
          break;
        default:
          return this.errorResponse(id, PaymeError.METHOD_NOT_FOUND, body.method);
      }
      return { jsonrpc: '2.0', id, result };
    } catch (e) {
      if (e instanceof PaymeRpcError) return this.errorResponse(id, e.code, e.data);
      this.logger.error(`Payme ${body.method} failed: ${(e as Error).message}`);
      return this.errorResponse(id, PaymeError.CANNOT_PERFORM);
    }
  }

  // ---------------------------------------------------------------------------

  private invoiceIdFrom(params: any): string {
    const invoiceId = params?.account?.invoice_id;
    if (typeof invoiceId !== 'string' || !invoiceId) throw new PaymeRpcError(PaymeError.INVOICE_NOT_FOUND, 'invoice_id');
    return invoiceId;
  }

  private amountUzsFrom(params: any): number {
    const amount = Number(params?.amount);
    // Clinic invoices are whole so'm, so the tiyin amount must be a multiple of 100
    if (!Number.isFinite(amount) || amount <= 0 || amount % 100 !== 0) throw new PaymeRpcError(PaymeError.INVALID_AMOUNT);
    return amount / 100;
  }

  /** The invoice must exist, be open and the amount must equal the remaining balance. */
  private async validatePayable(tx: Prisma.TransactionClient, invoiceId: string, amountUzs: number) {
    const exists = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { id: true } });
    if (!exists) throw new PaymeRpcError(PaymeError.INVOICE_NOT_FOUND, 'invoice_id');
    const invoice = await lockInvoice(tx, invoiceId);
    if (invoice.status === 'CANCELLED') throw new PaymeRpcError(PaymeError.INVOICE_NOT_PAYABLE, 'invoice_id');
    const { debt } = await invoiceBalance(tx, invoice);
    if (debt <= 0) throw new PaymeRpcError(PaymeError.INVOICE_NOT_PAYABLE, 'invoice_id');
    if (amountUzs !== debt) throw new PaymeRpcError(PaymeError.INVALID_AMOUNT);
    return invoice;
  }

  private async checkPerform(params: any) {
    const invoiceId = this.invoiceIdFrom(params);
    const amountUzs = this.amountUzsFrom(params);
    await this.prisma.$transaction(async (tx) => {
      await this.validatePayable(tx, invoiceId, amountUzs);
    });
    return { allow: true };
  }

  private async findTx(tx: Prisma.TransactionClient, providerTransactionId: unknown) {
    if (typeof providerTransactionId !== 'string' || !providerTransactionId) throw new PaymeRpcError(PaymeError.TX_NOT_FOUND);
    return tx.onlinePayment.findUnique({
      where: { provider_providerTransactionId: { provider: 'PAYME', providerTransactionId } },
    });
  }

  /** Expiry must be committed even though the call then answers with an error. */
  private async expire(id: string): Promise<never> {
    await this.prisma.onlinePayment.updateMany({
      where: { id, state: 1 },
      data: { state: -1, reason: 4, cancelTime: BigInt(Date.now()) },
    });
    throw new PaymeRpcError(PaymeError.CANNOT_PERFORM);
  }

  private async create(params: any) {
    const expired: { id?: string } = {};
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await this.findTx(tx, params.id);
      const now = Date.now();
      if (existing) {
        if (existing.state !== 1) throw new PaymeRpcError(PaymeError.CANNOT_PERFORM);
        if (now - n(existing.createTime) > TX_TIMEOUT_MS) {
          expired.id = existing.id;
          return null;
        }
        return { create_time: n(existing.createTime), transaction: existing.id, state: existing.state };
      }

      const invoiceId = this.invoiceIdFrom(params);
      const amountUzs = this.amountUzsFrom(params);
      await this.validatePayable(tx, invoiceId, amountUzs);

      // Only one pending Payme transaction per invoice; stale ones are expired first
      const pending = await tx.onlinePayment.findFirst({ where: { provider: 'PAYME', invoiceId, state: 1 } });
      if (pending) {
        if (now - n(pending.createTime) > TX_TIMEOUT_MS) {
          await tx.onlinePayment.update({ where: { id: pending.id }, data: { state: -1, reason: 4, cancelTime: BigInt(now) } });
        } else {
          throw new PaymeRpcError(PaymeError.INVOICE_BUSY, 'invoice_id');
        }
      }

      const created = await tx.onlinePayment.create({
        data: {
          provider: 'PAYME',
          providerTransactionId: params.id,
          invoiceId,
          amountUzs,
          state: 1,
          providerTime: Number.isFinite(Number(params.time)) ? BigInt(Math.trunc(Number(params.time))) : null,
          createTime: BigInt(now),
        },
      });
      return { create_time: now, transaction: created.id, state: 1 };
    });
    if (expired.id) return this.expire(expired.id);
    return result;
  }

  private async perform(params: any) {
    const expired: { id?: string } = {};
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await this.findTx(tx, params.id);
      if (!existing) throw new PaymeRpcError(PaymeError.TX_NOT_FOUND);
      if (existing.state === 2) {
        return { transaction: existing.id, perform_time: n(existing.performTime), state: 2 };
      }
      if (existing.state !== 1) throw new PaymeRpcError(PaymeError.CANNOT_PERFORM);

      const now = Date.now();
      if (now - n(existing.createTime) > TX_TIMEOUT_MS) {
        expired.id = existing.id;
        return null;
      }

      const invoice = await lockInvoice(tx, existing.invoiceId);
      const { debt } = await invoiceBalance(tx, invoice);
      // Someone paid at the desk meanwhile: refuse rather than overpay
      if (invoice.status === 'CANCELLED' || existing.amountUzs > debt) throw new PaymeRpcError(PaymeError.CANNOT_PERFORM);

      const payment = await applyInvoicePayment(tx, invoice, {
        amount: existing.amountUzs,
        method: PaymentMethod.PAYME,
        note: `Payme ${existing.providerTransactionId}`,
      });
      await tx.onlinePayment.update({
        where: { id: existing.id },
        data: { state: 2, performTime: BigInt(now), paymentId: payment.id },
      });
      await this.audit.logTransactional({
        tx,
        userId: null,
        action: 'billing.online_payment_performed',
        entity: 'Invoice',
        entityId: invoice.id,
        details: { provider: 'PAYME', amount: existing.amountUzs, transaction: existing.id },
      });
      return { transaction: existing.id, perform_time: now, state: 2 };
    });
    if (expired.id) return this.expire(expired.id);
    return result;
  }

  private async cancel(params: any) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await this.findTx(tx, params.id);
      if (!existing) throw new PaymeRpcError(PaymeError.TX_NOT_FOUND);
      if (existing.state < 0) {
        return { transaction: existing.id, cancel_time: n(existing.cancelTime), state: existing.state };
      }
      const now = Date.now();
      const reason = Number.isInteger(Number(params.reason)) ? Number(params.reason) : null;

      if (existing.state === 1) {
        await tx.onlinePayment.update({ where: { id: existing.id }, data: { state: -1, reason, cancelTime: BigInt(now) } });
        return { transaction: existing.id, cancel_time: now, state: -1 };
      }

      // Performed: reverse the money with a refund entry on the invoice
      const invoice = await lockInvoice(tx, existing.invoiceId);
      const refund = await tx.payment.create({
        data: {
          amount: existing.amountUzs,
          method: PaymentMethod.PAYME,
          isRefund: true,
          refundOfId: existing.paymentId,
          invoiceId: invoice.id,
          patientId: invoice.patient_id,
          appointmentId: invoice.appointment_id,
          note: `Payme refund ${existing.providerTransactionId}`,
          currency: 'UZS',
        },
      });
      await refreshInvoiceStatus(tx, invoice.id);
      await tx.onlinePayment.update({
        where: { id: existing.id },
        data: { state: -2, reason, cancelTime: BigInt(now), refundPaymentId: refund.id },
      });
      await this.audit.logTransactional({
        tx,
        userId: null,
        action: 'billing.online_payment_refunded',
        entity: 'Invoice',
        entityId: invoice.id,
        details: { provider: 'PAYME', amount: existing.amountUzs, transaction: existing.id, reason },
      });
      return { transaction: existing.id, cancel_time: now, state: -2 };
    });
  }

  private async check(params: any) {
    const existing = await this.findTx(this.prisma, params.id);
    if (!existing) throw new PaymeRpcError(PaymeError.TX_NOT_FOUND);
    return {
      create_time: n(existing.createTime),
      perform_time: n(existing.performTime),
      cancel_time: n(existing.cancelTime),
      transaction: existing.id,
      state: existing.state,
      reason: existing.reason ?? null,
    };
  }

  private async statement(params: any) {
    const from = Number(params?.from);
    const to = Number(params?.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) throw new PaymeRpcError(PaymeError.INVALID_REQUEST);
    const rows = await this.prisma.onlinePayment.findMany({
      where: { provider: 'PAYME', createTime: { gte: BigInt(Math.trunc(from)), lte: BigInt(Math.trunc(to)) } },
      orderBy: { createTime: 'asc' },
    });
    return {
      transactions: rows.map((r) => ({
        id: r.providerTransactionId,
        time: n(r.providerTime) || n(r.createTime),
        amount: r.amountUzs * 100,
        account: { invoice_id: r.invoiceId },
        create_time: n(r.createTime),
        perform_time: n(r.performTime),
        cancel_time: n(r.cancelTime),
        transaction: r.id,
        state: r.state,
        reason: r.reason ?? null,
      })),
    };
  }

  checkoutUrl(invoiceId: string, amountUzs: number) {
    const { enabled, merchantId, checkoutBase } = this.config.payme;
    if (!enabled) return null;
    const params = `m=${merchantId};ac.invoice_id=${invoiceId};a=${amountUzs * 100};c=${this.config.siteUrl}/`;
    return `${checkoutBase}/${Buffer.from(params).toString('base64')}`;
  }
}
