'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Banknote, CreditCard, Landmark, Loader2, Lock, RotateCcw, Smartphone, Unlock, Wallet } from 'lucide-react';
import { AdminLayout } from '../../../components/AdminLayout';
import { ModalDialog } from '../../../components/ModalDialog';
import { RefundDialog } from '../../../components/admin/billing/BillingDialogs';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useI18n } from '../../../lib/i18n';
import { formatClinicTime, getClinicTodayDateString } from '../../../lib/dateFormat';
import { PAYMENT_METHOD, formatUzs } from '../../../lib/clinicFormat';

const METHOD_ICON: Record<string, any> = { CASH: Banknote, CARD: CreditCard, TRANSFER: Landmark, PAYME: Smartphone, CLICK: Smartphone, OTHER: Wallet };
const methodLabel = (m: string, lang: string) =>
  m === 'PAYME' ? 'Payme' : m === 'CLICK' ? 'Click' : lang === 'ru' ? PAYMENT_METHOD[m]?.ru || m : PAYMENT_METHOD[m]?.uz || m;

export default function CashierPage() {
  const { user } = useAuth();
  const { language } = useI18n();
  const lang: 'uz' | 'ru' = language === 'ru' ? 'ru' : 'uz';
  const L = (uz: string, ru: string) => (lang === 'ru' ? ru : uz);
  const canRefund = Boolean(user && ['OWNER', 'ADMIN'].includes(user.role));

  const [date, setDate] = useState(getClinicTodayDateString());
  const [summary, setSummary] = useState<any>(null);
  const [debts, setDebts] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [shiftModal, setShiftModal] = useState<'open' | 'close' | null>(null);
  const [cashInput, setCashInput] = useState('');
  const [shiftNote, setShiftNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [refund, setRefund] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [s, d, sh] = await Promise.all([api.getCashierSummary(date), api.getDebts(1, 8), api.getCashShifts(5)]);
      setSummary(s);
      setDebts(d?.items || []);
      setShifts(sh || []);
    } catch (e: any) {
      setError(e?.message || L("Ma'lumotlarni yuklab bo'lmadi", 'Не удалось загрузить данные'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const shift = summary?.openShift;
  const countedDiff = shift && cashInput !== '' ? Number(cashInput) - shift.expectedCashUzs : null;

  const submitShift = async () => {
    setBusy(true);
    setError(null);
    try {
      if (shiftModal === 'open') await api.openCashShift(Number(cashInput) || 0);
      else if (shift) await api.closeCashShift(shift.id, Number(cashInput) || 0, shiftNote.trim() || undefined);
      setShiftModal(null);
      await load();
    } catch (e: any) {
      setError(e?.message || L('Xatolik yuz berdi', 'Произошла ошибка'));
    } finally {
      setBusy(false);
    }
  };

  const methods = ['CASH', 'CARD', 'TRANSFER', 'PAYME', 'CLICK'];

  return (
    <AdminLayout allowedRoles={['OWNER', 'ADMIN', 'RECEPTION']}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{L('Kassa', 'Касса')}</h1>
            <p className="text-sm text-ink-muted">{L("Kunlik tushum, smena va qarzdorlar", 'Выручка за день, смена и должники')}</p>
          </div>
          <input
            type="date"
            value={date}
            max={getClinicTodayDateString()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="h-10 rounded-xl border border-line bg-white px-3 text-sm text-ink"
            aria-label={L('Sana', 'Дата')}
          />
        </div>

        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {!summary ? (
          <div className="flex items-center gap-2 p-8 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> {L('Yuklanmoqda…', 'Загрузка…')}
          </div>
        ) : (
          <>
            {/* Shift + totals */}
            <div className="grid gap-4 lg:grid-cols-3">
              <section className={`rounded-2xl border p-5 shadow-card ${shift ? 'border-brand-200 bg-brand-50/60' : 'border-line bg-white'}`}>
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                    {shift ? <Unlock className="h-4 w-4 text-brand-600" /> : <Lock className="h-4 w-4 text-ink-subtle" />}
                    {shift ? L('Smena ochiq', 'Смена открыта') : L('Smena yopiq', 'Смена закрыта')}
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      setCashInput(shift ? String(shift.expectedCashUzs) : '');
                      setShiftNote('');
                      setShiftModal(shift ? 'close' : 'open');
                    }}
                    className={`h-8 rounded-lg px-3 text-xs font-semibold ${shift ? 'bg-white text-ink ring-1 ring-line hover:bg-canvas' : 'bg-brand-600 text-white hover:bg-brand-700'}`}
                  >
                    {shift ? L('Smenani yopish', 'Закрыть смену') : L('Smenani ochish', 'Открыть смену')}
                  </button>
                </div>
                {shift ? (
                  <dl className="mt-4 space-y-1.5 text-sm">
                    <Row k={L('Ochgan', 'Открыл')} v={`${shift.openedBy || '—'} · ${formatClinicTime(shift.openedAt)}`} />
                    <Row k={L('Boshlang‘ich naqd', 'Размен')} v={formatUzs(shift.openingCash, lang)} />
                    <Row k={L('Naqd tushum', 'Наличные за смену')} v={formatUzs(shift.cashInUzs, lang)} />
                    <div className="flex justify-between border-t border-brand-200 pt-2 font-semibold text-ink">
                      <dt>{L('Kassada bo‘lishi kerak', 'Должно быть в кассе')}</dt>
                      <dd className="tabular-nums">{formatUzs(shift.expectedCashUzs, lang)}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-3 text-sm text-ink-muted">
                    {L('Naqd pul qabul qilishdan oldin smenani oching — yopishda kassadagi pul hisob bilan solishtiriladi.', 'Откройте смену перед приёмом наличных — при закрытии остаток сверяется с учётом.')}
                  </p>
                )}
              </section>

              <section className="rounded-2xl border border-line bg-white p-5 shadow-card lg:col-span-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold text-ink">{L('Kunlik tushum', 'Выручка за день')}</h2>
                  <p className="text-2xl font-semibold tabular-nums text-ink">{formatUzs(summary.totals.netUzs, lang)}</p>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {methods.map((m) => {
                    const Icon = METHOD_ICON[m];
                    return (
                      <div key={m} className="rounded-xl border border-line bg-canvas/60 p-3">
                        <p className="flex items-center gap-1.5 text-[11px] font-medium text-ink-subtle">
                          <Icon className="h-3.5 w-3.5" /> {methodLabel(m, lang)}
                        </p>
                        <p className="mt-1 text-sm font-semibold tabular-nums text-ink">{formatUzs(summary.totals.byMethod[m] || 0, lang)}</p>
                      </div>
                    );
                  })}
                </div>
                {summary.totals.refundsUzs > 0 && (
                  <p className="mt-3 text-xs text-rose-600">
                    {L('Qaytarilgan', 'Возвраты')}: {formatUzs(summary.totals.refundsUzs, lang)}
                  </p>
                )}
              </section>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {/* Payments of the day */}
              <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-card lg:col-span-2">
                <h2 className="border-b border-line px-5 py-3 text-sm font-semibold text-ink">
                  {L("To'lovlar", 'Платежи')} <span className="font-normal text-ink-subtle">({summary.totals.count})</span>
                </h2>
                {summary.payments.length === 0 ? (
                  <p className="p-5 text-sm text-ink-muted">{L("Bu kunda to'lov yo'q.", 'За этот день платежей нет.')}</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {summary.payments.map((p: any) => {
                      const Icon = METHOD_ICON[p.method] || Wallet;
                      const desk = !['PAYME', 'CLICK'].includes(p.method);
                      return (
                        <li key={p.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${p.isRefund ? 'bg-rose-50 text-rose-600' : 'bg-canvas text-ink-muted'}`}>
                            {p.isRefund ? <RotateCcw className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            {p.patient ? (
                              <Link href={`/admin/patients/${p.patient.id}?tab=payments`} className="font-medium text-ink hover:text-brand-700">
                                {p.patient.fullName}
                              </Link>
                            ) : (
                              <span className="font-medium text-ink">—</span>
                            )}
                            <span className="block truncate text-xs text-ink-muted">
                              {formatClinicTime(p.recordedAt)} · {methodLabel(p.method, lang)}
                              {p.recordedBy ? ` · ${p.recordedBy}` : ''}
                              {p.note ? ` · ${p.note}` : ''}
                            </span>
                          </span>
                          <span className={`shrink-0 font-semibold tabular-nums ${p.isRefund ? 'text-rose-600' : 'text-ink'}`}>
                            {p.isRefund ? '−' : ''}
                            {formatUzs(p.amount, lang)}
                          </span>
                          {canRefund && desk && !p.isRefund && (
                            <button
                              type="button"
                              onClick={() => setRefund(p)}
                              className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-ink-subtle hover:bg-rose-50 hover:text-rose-600"
                            >
                              {L('Qaytarish', 'Возврат')}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <div className="space-y-4">
                {/* Debtors */}
                <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
                  <h2 className="border-b border-line px-5 py-3 text-sm font-semibold text-ink">{L('Qarzdorlar', 'Должники')}</h2>
                  {debts.length === 0 ? (
                    <p className="p-5 text-sm text-ink-muted">{L("Qarzdor bemor yo'q.", 'Должников нет.')}</p>
                  ) : (
                    <ul className="divide-y divide-line">
                      {debts.map((d) => (
                        <li key={d.id}>
                          <Link href={`/admin/patients/${d.id}?tab=payments`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm hover:bg-canvas">
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-ink">{d.fullName}</span>
                              <span className="text-xs text-ink-muted">{d.phone}</span>
                            </span>
                            <span className="shrink-0 font-semibold tabular-nums text-rose-600">{formatUzs(Number(d.totalDebt), lang)}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* Recent shifts */}
                <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
                  <h2 className="border-b border-line px-5 py-3 text-sm font-semibold text-ink">{L("So'nggi smenalar", 'Последние смены')}</h2>
                  <ul className="divide-y divide-line">
                    {shifts.filter((s) => s.closedAt).length === 0 && <li className="p-5 text-sm text-ink-muted">{L("Yopilgan smena yo'q.", 'Закрытых смен нет.')}</li>}
                    {shifts
                      .filter((s) => s.closedAt)
                      .map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                          <span className="min-w-0">
                            <span className="block font-medium text-ink">{new Date(s.closedAt).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uz-UZ')}</span>
                            <span className="text-xs text-ink-muted">{s.closedBy || '—'}</span>
                          </span>
                          <span
                            className={`shrink-0 text-xs font-semibold tabular-nums ${
                              s.differenceUzs === 0 ? 'text-emerald-700' : s.differenceUzs < 0 ? 'text-rose-600' : 'text-amber-700'
                            }`}
                          >
                            {s.differenceUzs === 0 ? L('Mos', 'Сошлось') : `${s.differenceUzs > 0 ? '+' : ''}${formatUzs(s.differenceUzs, lang)}`}
                          </span>
                        </li>
                      ))}
                  </ul>
                </section>
              </div>
            </div>
          </>
        )}
      </div>

      <ModalDialog
        isOpen={shiftModal !== null}
        onClose={() => setShiftModal(null)}
        title={shiftModal === 'open' ? L('Smenani ochish', 'Открыть смену') : L('Smenani yopish', 'Закрыть смену')}
        size="sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitShift();
          }}
          className="space-y-4"
        >
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink">
              {shiftModal === 'open' ? L("Kassadagi boshlang'ich naqd pul", 'Размен в кассе на начало') : L('Kassada sanalgan naqd pul', 'Пересчитанные наличные в кассе')}
            </span>
            <input
              value={cashInput}
              onChange={(e) => setCashInput(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              autoFocus
              className="h-10 w-full rounded-xl border border-line px-3 text-sm focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/10"
            />
          </label>
          {shiftModal === 'close' && shift && (
            <>
              <p className="text-sm text-ink-muted">
                {L('Hisob bo‘yicha', 'По учёту')}: <span className="font-semibold text-ink">{formatUzs(shift.expectedCashUzs, lang)}</span>
                {countedDiff !== null && countedDiff !== 0 && (
                  <span className={`ml-2 font-semibold ${countedDiff < 0 ? 'text-rose-600' : 'text-amber-700'}`}>
                    ({countedDiff > 0 ? '+' : ''}
                    {formatUzs(countedDiff, lang)})
                  </span>
                )}
              </p>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-ink">{L('Izoh', 'Комментарий')}</span>
                <input value={shiftNote} onChange={(e) => setShiftNote(e.target.value)} maxLength={300} className="h-10 w-full rounded-xl border border-line px-3 text-sm" />
              </label>
            </>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShiftModal(null)} className="h-9 rounded-lg px-3 text-sm font-medium text-ink-muted hover:bg-canvas">
              {L('Bekor', 'Отмена')}
            </button>
            <button type="submit" disabled={busy || cashInput === ''} className="h-9 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {shiftModal === 'open' ? L('Ochish', 'Открыть') : L('Yopish', 'Закрыть')}
            </button>
          </div>
        </form>
      </ModalDialog>

      <RefundDialog payment={refund} lang={lang} onClose={() => setRefund(null)} onDone={load} />
    </AdminLayout>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-muted">{k}</dt>
      <dd className="tabular-nums text-ink">{v}</dd>
    </div>
  );
}
