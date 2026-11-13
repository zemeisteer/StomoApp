'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, AlertCircle, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { api } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';
import { doctorName, formatUzs } from '../../../lib/clinicFormat';

export default function PublicPlanPage() {
  const { token } = useParams<{ token: string }>();
  const { language } = useI18n();
  const lang: 'uz' | 'ru' = language === 'ru' ? 'ru' : 'uz';
  const isRu = lang === 'ru';
  const L = (uz: string, ru: string) => (isRu ? ru : uz);

  const [plan, setPlan] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<'ACCEPTED' | 'DECLINED' | null>(null);

  useEffect(() => {
    api
      .getPublicTreatmentPlan(token)
      .then(setPlan)
      .catch((e) => setError(e?.message || L('Havola yaroqsiz', 'Ссылка недействительна')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const phases = useMemo(() => {
    const map = new Map<number, any[]>();
    for (const item of plan?.items || []) map.set(item.phase, [...(map.get(item.phase) || []), item]);
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [plan]);

  const submit = async (action: 'accept' | 'decline') => {
    setBusy(true);
    setError(null);
    try {
      if (action === 'accept') {
        await api.acceptPublicTreatmentPlan(token, fullName.trim());
        setDone('ACCEPTED');
      } else {
        await api.declinePublicTreatmentPlan(token);
        setDone('DECLINED');
      }
    } catch (e: any) {
      setError(e?.message || L('Xatolik yuz berdi', 'Произошла ошибка'));
    } finally {
      setBusy(false);
    }
  };

  const clinicName = plan?.clinic ? (isRu ? plan.clinic.nameRu || plan.clinic.name : plan.clinic.name) : '';

  return (
    <div className="bg-canvas px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-2xl">
        {!plan && !error && (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> {L('Yuklanmoqda…', 'Загрузка…')}
          </div>
        )}

        {error && !plan && (
          <div className="rounded-2xl border border-line bg-white p-8 text-center shadow-card">
            <AlertCircle className="mx-auto h-10 w-10 text-ink-subtle" />
            <h1 className="mt-3 text-lg font-semibold text-ink">{L('Havola ishlamayapti', 'Ссылка не работает')}</h1>
            <p className="mt-1 text-sm text-ink-muted">{error}</p>
          </div>
        )}

        {done && (
          <div className="rounded-2xl border border-line bg-white p-8 text-center shadow-card">
            {done === 'ACCEPTED' ? (
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            ) : (
              <XCircle className="mx-auto h-12 w-12 text-ink-subtle" />
            )}
            <h1 className="mt-3 text-xl font-semibold text-ink">
              {done === 'ACCEPTED' ? L('Rahmat! Rozilingiz qabul qilindi', 'Спасибо! Ваше согласие принято') : L('Javobingiz qabul qilindi', 'Ваш ответ принят')}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              {done === 'ACCEPTED'
                ? L('Klinika siz bilan bog‘lanib, qabul vaqtini kelishadi.', 'Клиника свяжется с вами, чтобы согласовать время визита.')
                : L('Savollaringiz bo‘lsa, klinikaga qo‘ng‘iroq qiling.', 'Если есть вопросы, позвоните в клинику.')}
            </p>
          </div>
        )}

        {plan && !done && (
          <div className="space-y-5">
            <div className="text-center">
              <p className="text-sm font-medium text-brand-700">{clinicName}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                {L(`${plan.patientFirstName}, davolash rejangiz`, `${plan.patientFirstName}, ваш план лечения`)}
              </h1>
              <p className="mt-2 text-sm text-ink-muted">
                {plan.title}
                {plan.doctor ? ` · ${L('Shifokor', 'Врач')}: ${doctorName(plan.doctor, lang)}` : ''}
              </p>
            </div>

            <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
              {phases.map(([phase, items]) => (
                <div key={phase} className="border-b border-line last:border-b-0">
                  <p className="bg-canvas px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                    {L(`${phase}-bosqich`, `Этап ${phase}`)}
                  </p>
                  <ul className="divide-y divide-line">
                    {items.map((i: any) => (
                      <li key={i.id} className="flex items-start justify-between gap-4 px-5 py-3 text-sm">
                        <span className="min-w-0">
                          <span className="font-medium text-ink">{isRu ? i.treatmentNameRu || i.treatmentNameUz : i.treatmentNameUz}</span>
                          <span className="block text-xs text-ink-muted">
                            {i.toothNumber ? `${L('Tish', 'Зуб')} ${i.toothNumber} · ` : ''}
                            {i.quantity} × {formatUzs(i.unitPriceUzs, lang)}
                          </span>
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums text-ink">{formatUzs(i.costUzs, lang)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <dl className="space-y-1.5 bg-canvas/60 px-5 py-4 text-sm">
                <div className="flex justify-between text-ink-muted">
                  <dt>{L('Jami', 'Итого')}</dt>
                  <dd className="tabular-nums">{formatUzs(plan.totals.subtotalUzs, lang)}</dd>
                </div>
                {plan.totals.discountUzs > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <dt>{L('Chegirma', 'Скидка')}</dt>
                    <dd className="tabular-nums">− {formatUzs(plan.totals.discountUzs, lang)}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-line pt-2 text-base font-semibold text-ink">
                  <dt>{L("To'lov uchun", 'К оплате')}</dt>
                  <dd className="tabular-nums">{formatUzs(plan.totals.totalUzs, lang)}</dd>
                </div>
              </dl>
            </section>

            {plan.notes && <p className="rounded-2xl border border-line bg-white p-4 text-sm text-ink-muted whitespace-pre-wrap">{plan.notes}</p>}

            <section className="space-y-4 rounded-2xl border border-line bg-white p-5 shadow-card">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-medium text-ink">{L('To‘liq ismingiz', 'Ваше полное имя')}</span>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  className="h-11 w-full rounded-xl border border-line px-3 text-sm focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/10"
                />
              </label>
              <label className="flex items-start gap-3 text-sm text-ink">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-600" />
                <span>
                  {L(
                    'Davolash rejasi va narxlar bilan tanishdim, rejaga roziman. Narx klinikada aniq tekshiruvdan keyin o‘zgarishi mumkinligini tushunaman.',
                    'Я ознакомлен(а) с планом лечения и ценами и согласен(на) с ним. Понимаю, что цена может уточниться после осмотра в клинике.',
                  )}
                </span>
              </label>
              {error && (
                <p role="alert" className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
                </p>
              )}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => submit('decline')}
                  className="h-11 rounded-xl px-4 text-sm font-semibold text-ink-muted hover:bg-canvas disabled:opacity-50"
                >
                  {L('Rad etish', 'Отказаться')}
                </button>
                <button
                  type="button"
                  disabled={busy || !agree || fullName.trim().length < 2}
                  onClick={() => submit('accept')}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  <ShieldCheck className="h-4 w-4" /> {L('Rejaga roziman', 'Согласен(на) с планом')}
                </button>
              </div>
              <p className="text-center text-xs text-ink-subtle">
                {L('Havola amal qiladi', 'Ссылка действует до')}: {new Date(plan.expiresAt).toLocaleDateString(isRu ? 'ru-RU' : 'uz-UZ')}
              </p>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
