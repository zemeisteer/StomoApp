import { NotFoundException } from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';

/**
 * Invoice money math shared by cash desk, refunds and online providers.
 * All functions run inside a transaction; lockInvoice takes a row lock so concurrent
 * payments (cashier + Payme + Click) can never overpay one invoice.
 */

export type LockedInvoice = {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  total_amount: number;
  discount: number;
  status: string;
};

export async function lockInvoice(tx: Prisma.TransactionClient, invoiceId: string): Promise<LockedInvoice> {
  const rows = await tx.$queryRaw<LockedInvoice[]>`
    SELECT id, patient_id, appointment_id, total_amount, discount, status
    FROM "invoices" WHERE id = ${invoiceId} FOR UPDATE`;
  if (!rows.length) throw new NotFoundException('Hisob-faktura topilmadi');
  return rows[0];
}

/**
 * Row lock on a Payme/Click transaction, then a fresh read of it. Always take it AFTER lockInvoice
 * (lock order: invoice, then its online payment) and decide on `state` only from this read, so a
 * repeated or parallel provider callback can never apply or reverse the money twice.
 */
export async function lockOnlinePayment(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "online_payments" WHERE id = ${id} FOR UPDATE`;
  const row = await tx.onlinePayment.findUnique({ where: { id } });
  if (!row) throw new NotFoundException('Tranzaksiya topilmadi');
  return row;
}

export async function invoiceBalance(tx: Prisma.TransactionClient, invoice: { id: string; total_amount: number; discount: number }) {
  const payments = await tx.payment.findMany({ where: { invoiceId: invoice.id }, select: { amount: true, isRefund: true } });
  const paid = payments.reduce((acc, p) => acc + (p.isRefund ? -p.amount : p.amount), 0);
  const effectiveTotal = Math.max(0, invoice.total_amount - (invoice.discount || 0));
  return { effectiveTotal, paid, debt: Math.max(0, effectiveTotal - paid) };
}

export async function refreshInvoiceStatus(tx: Prisma.TransactionClient, invoiceId: string) {
  const inv = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, totalAmount: true, discount: true, status: true } });
  if (!inv || inv.status === 'CANCELLED') return;
  const { effectiveTotal, paid } = await invoiceBalance(tx, { id: inv.id, total_amount: inv.totalAmount, discount: inv.discount });
  const status = paid >= effectiveTotal && effectiveTotal > 0 ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : effectiveTotal === 0 ? 'PAID' : 'PENDING';
  if (status !== inv.status) await tx.invoice.update({ where: { id: invoiceId }, data: { status } });
}

/** Records money against a locked invoice and updates its status. */
export async function applyInvoicePayment(
  tx: Prisma.TransactionClient,
  invoice: LockedInvoice,
  p: { amount: number; method: PaymentMethod; note?: string | null; recordedById?: string | null },
) {
  const payment = await tx.payment.create({
    data: {
      amount: p.amount,
      method: p.method,
      invoiceId: invoice.id,
      patientId: invoice.patient_id,
      appointmentId: invoice.appointment_id,
      note: p.note || null,
      recordedById: p.recordedById || null,
      currency: 'UZS',
    },
  });
  await refreshInvoiceStatus(tx, invoice.id);
  return payment;
}
