import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PaymentMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PaymentsConfig } from './payments.config';
import { applyInvoicePayment, invoiceBalance, lockInvoice } from '../billing/invoice-ledger';

/**
 * CLICK Shop API (Prepare / Complete). Requests are form-encoded and signed with
 * md5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id [+ merchant_prepare_id] + amount + action + sign_time).
 * merchant_trans_id is our invoice id; amounts are in so'm.
 */

export const ClickError = {
  SUCCESS: 0,
  SIGN_FAILED: -1,
  INVALID_AMOUNT: -2,
  ACTION_NOT_FOUND: -3,
  ALREADY_PAID: -4,
  ORDER_NOT_FOUND: -5,
  TX_NOT_FOUND: -6,
  UPDATE_FAILED: -7,
  BAD_REQUEST: -8,
  TX_CANCELLED: -9,
} as const;

const NOTES: Record<number, string> = {
  0: 'Success',
  [-1]: 'SIGN CHECK FAILED!',
  [-2]: 'Incorrect parameter amount',
  [-3]: 'Action not found',
  [-4]: 'Already paid',
  [-5]: 'Order does not exist',
  [-6]: 'Transaction does not exist',
  [-7]: 'Failed to update order',
  [-8]: 'Error in request from click',
  [-9]: 'Transaction cancelled',
};

const md5 = (s: string) => crypto.createHash('md5').update(s).digest('hex');

@Injectable()
export class ClickService {
  private readonly logger = new Logger(ClickService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: PaymentsConfig,
  ) {}

  private reply(body: any, error: number, extra: Record<string, unknown> = {}) {
    return {
      click_trans_id: body?.click_trans_id !== undefined ? Number(body.click_trans_id) : null,
      merchant_trans_id: body?.merchant_trans_id ?? null,
      ...extra,
      error,
      error_note: NOTES[error] ?? 'Error',
    };
  }

  private validSign(body: any, withPrepareId: boolean) {
    const { secretKey, serviceId } = this.config.click;
    if (String(body.service_id) !== serviceId) return false;
    const raw =
      `${body.click_trans_id}${body.service_id}${secretKey}${body.merchant_trans_id}` +
      `${withPrepareId ? body.merchant_prepare_id : ''}${body.amount}${body.action}${body.sign_time}`;
    const expected = Buffer.from(md5(raw));
    const given = Buffer.from(String(body.sign_string || '').toLowerCase());
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  }

  private requireFields(body: any, fields: string[]) {
    return fields.every((f) => body?.[f] !== undefined && body?.[f] !== null && String(body[f]) !== '');
  }

  /** Amount must be a whole so'm value equal to the remaining balance. */
  private parseAmount(body: any): number | null {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) % 100 !== 0) return null;
    return Math.round(amount);
  }

  async prepare(body: any) {
    if (!this.config.click.enabled) return this.reply(body, ClickError.BAD_REQUEST);
    const fields = ['click_trans_id', 'service_id', 'merchant_trans_id', 'amount', 'action', 'sign_time', 'sign_string'];
    if (!this.requireFields(body, fields)) return this.reply(body, ClickError.BAD_REQUEST);
    if (!this.validSign(body, false)) return this.reply(body, ClickError.SIGN_FAILED);
    if (String(body.action) !== '0') return this.reply(body, ClickError.ACTION_NOT_FOUND);

    const amount = this.parseAmount(body);
    if (amount === null) return this.reply(body, ClickError.INVALID_AMOUNT);
    const invoiceId = String(body.merchant_trans_id);
    const clickTransId = String(body.click_trans_id);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const exists = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { id: true } });
        if (!exists) return this.reply(body, ClickError.ORDER_NOT_FOUND);

        const existing = await tx.onlinePayment.findUnique({
          where: { provider_providerTransactionId: { provider: 'CLICK', providerTransactionId: clickTransId } },
        });
        if (existing) {
          if (existing.state === 2) return this.reply(body, ClickError.ALREADY_PAID);
          if (existing.state < 0) return this.reply(body, ClickError.TX_CANCELLED);
          return this.reply(body, ClickError.SUCCESS, { merchant_prepare_id: Number(existing.createTime) });
        }

        const invoice = await lockInvoice(tx, invoiceId);
        if (invoice.status === 'CANCELLED') return this.reply(body, ClickError.TX_CANCELLED);
        const { debt } = await invoiceBalance(tx, invoice);
        if (debt <= 0) return this.reply(body, ClickError.ALREADY_PAID);
        if (amount !== debt) return this.reply(body, ClickError.INVALID_AMOUNT);

        // merchant_prepare_id must be numeric for CLICK; the creation timestamp doubles as one
        const createTime = BigInt(Date.now());
        await tx.onlinePayment.create({
          data: { provider: 'CLICK', providerTransactionId: clickTransId, invoiceId, amountUzs: amount, state: 1, createTime },
        });
        return this.reply(body, ClickError.SUCCESS, { merchant_prepare_id: Number(createTime) });
      });
    } catch (e) {
      this.logger.error(`Click prepare failed: ${(e as Error).message}`);
      return this.reply(body, ClickError.UPDATE_FAILED);
    }
  }

  async complete(body: any) {
    if (!this.config.click.enabled) return this.reply(body, ClickError.BAD_REQUEST);
    const fields = ['click_trans_id', 'service_id', 'merchant_trans_id', 'merchant_prepare_id', 'amount', 'action', 'sign_time', 'sign_string'];
    if (!this.requireFields(body, fields)) return this.reply(body, ClickError.BAD_REQUEST);
    if (!this.validSign(body, true)) return this.reply(body, ClickError.SIGN_FAILED);
    if (String(body.action) !== '1') return this.reply(body, ClickError.ACTION_NOT_FOUND);

    const amount = this.parseAmount(body);
    if (amount === null) return this.reply(body, ClickError.INVALID_AMOUNT);
    const clickTransId = String(body.click_trans_id);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.onlinePayment.findUnique({
          where: { provider_providerTransactionId: { provider: 'CLICK', providerTransactionId: clickTransId } },
        });
        if (!existing || String(existing.createTime) !== String(body.merchant_prepare_id) || existing.invoiceId !== String(body.merchant_trans_id)) {
          return this.reply(body, ClickError.TX_NOT_FOUND);
        }
        if (existing.state === 2) {
          return this.reply(body, ClickError.ALREADY_PAID, { merchant_confirm_id: Number(existing.performTime) });
        }
        if (existing.state < 0) return this.reply(body, ClickError.TX_CANCELLED);

        // CLICK reports a failed/cancelled payment on its side with a negative `error`
        if (Number(body.error) < 0) {
          await tx.onlinePayment.update({ where: { id: existing.id }, data: { state: -1, reason: Number(body.error), cancelTime: BigInt(Date.now()) } });
          return this.reply(body, ClickError.TX_CANCELLED);
        }
        if (amount !== existing.amountUzs) return this.reply(body, ClickError.INVALID_AMOUNT);

        const invoice = await lockInvoice(tx, existing.invoiceId);
        const { debt } = await invoiceBalance(tx, invoice);
        if (invoice.status === 'CANCELLED') return this.reply(body, ClickError.TX_CANCELLED);
        if (debt <= 0) return this.reply(body, ClickError.ALREADY_PAID);
        if (amount > debt) return this.reply(body, ClickError.INVALID_AMOUNT);

        const payment = await applyInvoicePayment(tx, invoice, {
          amount,
          method: PaymentMethod.CLICK,
          note: `Click ${clickTransId}`,
        });
        const performTime = BigInt(Date.now());
        await tx.onlinePayment.update({ where: { id: existing.id }, data: { state: 2, performTime, paymentId: payment.id } });
        await this.audit.logTransactional({
          tx,
          userId: null,
          action: 'billing.online_payment_performed',
          entity: 'Invoice',
          entityId: invoice.id,
          details: { provider: 'CLICK', amount, transaction: existing.id },
        });
        return this.reply(body, ClickError.SUCCESS, { merchant_confirm_id: Number(performTime) });
      });
    } catch (e) {
      this.logger.error(`Click complete failed: ${(e as Error).message}`);
      return this.reply(body, ClickError.UPDATE_FAILED);
    }
  }

  payUrl(invoiceId: string, amountUzs: number) {
    const { enabled, serviceId, merchantId } = this.config.click;
    if (!enabled) return null;
    const q = new URLSearchParams({
      service_id: serviceId,
      merchant_id: merchantId,
      amount: String(amountUzs),
      transaction_param: invoiceId,
      return_url: `${this.config.siteUrl}/`,
    });
    return `https://my.click.uz/services/pay?${q.toString()}`;
  }
}
