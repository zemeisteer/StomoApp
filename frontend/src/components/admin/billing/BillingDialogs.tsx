'use client';

import React, { useEffect, useState } from 'react';
import { AlertCircle, Check, Copy, ExternalLink, Loader2, Send } from 'lucide-react';
import { ModalDialog } from '../../ModalDialog';
import { api } from '../../../lib/api';
import { formatUzs } from '../../../lib/clinicFormat';

type Lang = 'uz' | 'ru';
const t = (lang: Lang) => (uz: string, ru: string) => (lang === 'ru' ? ru : uz);

const inputCls =
  'h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/10';

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
    </p>
  );
}

const errText = (e: any, fallback: string) => (Array.isArray(e?.message) ? e.message.join(', ') : e?.message || fallback);

/** Take money at the desk against an invoice. */
export function TakePaymentDialog({
  invoice,
  lang,
  onClose,
  onDone,
}: {
  invoice: { id: string; debtAmount: number; notes?: string | null } | null;
  lang: Lang;
  onClose: () => void;
  onDone: () => void;
}) {
  const L = t(lang);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (invoice) {
      setAmount(String(invoice.debtAmount));
      setMethod('CASH');
      setNote('');
      setError(null);
    }
  }, [invoice]);

  const value = Number(amount);
  const valid = invoice && value > 0 && value <= invoice.debtAmount;

  const submit = async () => {
    if (!invoice || !valid) return;
    setBusy(true);
    setError(null);
    try {
      await api.recordPayment({ invoiceId: invoice.id, amount: value, method, note: note.trim() || undefined });
      onDone();
      onClose();
    } catch (e: any) {
      setError(errText(e, L("To'lovni saqlab bo'lmadi", 'Не удалось провести оплату')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalDialog
      isOpen={Boolean(invoice)}
      onClose={onClose}
      title={L("To'lov qabul qilish", 'Принять оплату')}
      description={invoice ? `${invoice.notes ? `${invoice.notes} · ` : ''}${L('Qarz', 'Долг')}: ${formatUzs(invoice.debtAmount, lang)}` : undefined}
      size="sm"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-canvas p-1">
          {[
            ['CASH', L('Naqd', 'Наличные')],
            ['CARD', L('Karta', 'Карта')],
            ['TRANSFER', L("O'tkazma", 'Перевод')],
          ].map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={`h-9 rounded-lg text-[13px] font-semibold ${method === m ? 'bg-white text-ink shadow-soft' : 'text-ink-muted'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-ink">{L("Summa (so'm)", 'Сумма (сум)')}</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={inputCls} autoFocus />
          {invoice && value > invoice.debtAmount && (
            <span className="mt-1 block text-xs text-rose-600">{L('Qarzdan ko‘p bo‘lishi mumkin emas', 'Не больше суммы долга')}</span>
          )}
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-ink">{L('Izoh (ixtiyoriy)', 'Комментарий (необязательно)')}</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} maxLength={200} />
        </label>
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-lg px-3 text-sm font-medium text-ink-muted hover:bg-canvas">
            {L('Bekor', 'Отмена')}
          </button>
          <button type="submit" disabled={!valid || busy} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {L('Qabul qilish', 'Принять')}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}

/** Payme / Click checkout links for the remaining balance. */
export function OnlinePayDialog({ invoiceId, lang, clinicName, onClose }: { invoiceId: string | null; lang: Lang; clinicName: string; onClose: () => void }) {
  const L = t(lang);
  const [data, setData] = useState<{ amountUzs: number; payme: string | null; click: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!invoiceId) return;
    setData(null);
    setError(null);
    setCopied(null);
    api
      .getInvoicePaymentLinks(invoiceId)
      .then(setData)
      .catch((e) => setError(errText(e, L("Havolani olib bo'lmadi", 'Не удалось получить ссылку'))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  const providers = data ? ([['Payme', data.payme], ['Click', data.click]] as const).filter(([, url]) => url) : [];

  return (
    <ModalDialog isOpen={Boolean(invoiceId)} onClose={onClose} title={L("Onlayn to'lov havolasi", 'Ссылка на онлайн-оплату')} size="md">
      <div className="space-y-4">
        {!data && !error && (
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> {L('Yuklanmoqda…', 'Загрузка…')}
          </p>
        )}
        <ErrorNote error={error} />
        {data && (
          <p className="text-sm text-ink-muted">
            {L("To'lov summasi", 'Сумма к оплате')}: <span className="font-semibold text-ink">{formatUzs(data.amountUzs, lang)}</span>
          </p>
        )}
        {data && providers.length === 0 && (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            {data.amountUzs === 0
              ? L("Hisob to'liq to'langan.", 'Счёт полностью оплачен.')
              : L(
                  "Payme yoki Click ulanmagan. Serverdagi .env.production faylida PAYME_* / CLICK_* kalitlarini kiriting.",
                  'Payme или Click не подключены. Укажите ключи PAYME_* / CLICK_* в .env.production на сервере.',
                )}
          </p>
        )}
        {providers.map(([name, url]) => (
          <div key={name} className="rounded-xl border border-line p-3">
            <p className="mb-2 text-sm font-semibold text-ink">{name}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input readOnly value={url!} onFocus={(e) => e.target.select()} className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 font-mono text-xs text-ink" />
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard?.writeText(url!).catch(() => {});
                  setCopied(name);
                }}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-semibold text-ink hover:bg-canvas"
              >
                {copied === name ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied === name ? L('Nusxalandi', 'Скопировано') : L('Nusxalash', 'Копировать')}
              </button>
              <a
                href={`https://t.me/share/url?url=${encodeURIComponent(url!)}&text=${encodeURIComponent(L(`${clinicName}: to'lov havolasi`, `${clinicName}: ссылка на оплату`))}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-3 text-[13px] font-semibold text-white hover:bg-sky-700"
              >
                <Send className="h-4 w-4" /> Telegram
              </a>
              <a href={url!} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center rounded-lg px-2 text-ink-muted hover:text-ink" aria-label={L('Ochish', 'Открыть')}>
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </ModalDialog>
  );
}

/** Return money for a desk payment (owner / administrator). */
export function RefundDialog({
  payment,
  lang,
  onClose,
  onDone,
}: {
  payment: { id: string; amount: number; method: string } | null;
  lang: Lang;
  onClose: () => void;
  onDone: () => void;
}) {
  const L = t(lang);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (payment) {
      setAmount(String(payment.amount));
      setReason('');
      setError(null);
    }
  }, [payment]);

  const submit = async () => {
    if (!payment) return;
    setBusy(true);
    setError(null);
    try {
      await api.refundPayment(payment.id, { amount: Number(amount), reason: reason.trim() });
      onDone();
      onClose();
    } catch (e: any) {
      setError(errText(e, L("Qaytarib bo'lmadi", 'Не удалось оформить возврат')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalDialog isOpen={Boolean(payment)} onClose={onClose} title={L("Pulni qaytarish", 'Возврат средств')} size="sm">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-4"
      >
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-ink">{L("Summa (so'm)", 'Сумма (сум)')}</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-ink">{L('Sabab', 'Причина')}</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} maxLength={300} required />
        </label>
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-lg px-3 text-sm font-medium text-ink-muted hover:bg-canvas">
            {L('Bekor', 'Отмена')}
          </button>
          <button
            type="submit"
            disabled={busy || reason.trim().length < 3 || !(Number(amount) > 0)}
            className="h-9 rounded-lg bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {L('Qaytarish', 'Вернуть')}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
