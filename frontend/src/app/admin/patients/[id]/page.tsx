'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Phone,
  Mail,
  Send,
  CalendarClock,
  CalendarCheck2,
  Wallet,
  ClipboardList,
  Loader2,
  AlertCircle,
  StickyNote,
  Cake,
} from 'lucide-react';
import { AdminLayout } from '../../../../components/AdminLayout';
import { InteractiveOdontogram } from '../../../../components/InteractiveOdontogram';
import { TreatmentPlansPanel } from '../../../../components/admin/patient/TreatmentPlansPanel';
import { StatusBadge } from '../../../../components/ui/StatusBadge';
import { OnlinePayDialog, RefundDialog, TakePaymentDialog } from '../../../../components/admin/billing/BillingDialogs';
import { api } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { useI18n } from '../../../../lib/i18n';
import { useBrand } from '../../../../lib/brand';
import { formatClinicDate, formatClinicTime } from '../../../../lib/dateFormat';
import { APPOINTMENT_STATUS, PAYMENT_METHOD, doctorName, formatUzs } from '../../../../lib/clinicFormat';

type Tab = 'overview' | 'chart' | 'plans' | 'visits' | 'payments';

export default function PatientCardPage() {
  const params = useParams<{ id: string }>();
  const patientId = params.id;
  const { user } = useAuth();
  const { language } = useI18n();
  const brand = useBrand();
  const lang: 'uz' | 'ru' = language === 'ru' ? 'ru' : 'uz';
  const isRu = lang === 'ru';
  const L = (uz: string, ru: string) => (isRu ? ru : uz);

  const [card, setCard] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');

  const load = useCallback(async () => {
    try {
      setError(null);
      setCard(await api.getPatientCard(patientId));
    } catch (e: any) {
      setError(e?.message || L("Bemor kartasini yuklab bo'lmadi", 'Не удалось загрузить карту пациента'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  // Deep link to a tab, e.g. /admin/patients/:id?tab=plans
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab') as Tab | null;
    if (t && ['overview', 'chart', 'plans', 'visits', 'payments'].includes(t)) setTab(t);
  }, []);

  const canEdit = Boolean(user && ['OWNER', 'ADMIN', 'DOCTOR'].includes(user.role));
  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'overview', label: L('Umumiy', 'Обзор') },
    { key: 'chart', label: L('Tish formulasi', 'Зубная формула') },
    { key: 'plans', label: L('Davolash rejalari', 'Планы лечения') },
    { key: 'visits', label: L('Qabullar', 'Визиты') },
    ...(card?.finance ? [{ key: 'payments' as Tab, label: L("To'lovlar", 'Оплаты') }] : []),
  ];

  return (
    <AdminLayout allowedRoles={['OWNER', 'ADMIN', 'DOCTOR', 'RECEPTION']}>
      <div className="mx-auto max-w-6xl space-y-6">
        <Link href="/admin/patients" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink print:hidden">
          <ArrowLeft className="h-4 w-4" /> {L('Bemorlar', 'Пациенты')}
        </Link>

        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {!card && !error && (
          <div className="flex items-center gap-2 p-8 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> {L('Yuklanmoqda…', 'Загрузка…')}
          </div>
        )}

        {card && (
          <>
            {/* Header */}
            <section className="rounded-2xl border border-line bg-white p-5 shadow-card sm:p-6 print:hidden">
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4 min-w-0">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-xl font-bold text-brand-700">
                    {card.patient.fullName.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <h1 className="truncate text-xl font-semibold tracking-tight text-ink sm:text-2xl">{card.patient.fullName}</h1>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
                      <a href={`tel:${card.patient.phone}`} className="inline-flex items-center gap-1.5 hover:text-ink">
                        <Phone className="h-3.5 w-3.5" /> {card.patient.phone}
                      </a>
                      {card.patient.email && (
                        <span className="inline-flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5" /> {card.patient.email}
                        </span>
                      )}
                      <span className={`inline-flex items-center gap-1.5 ${card.patient.telegramLinked ? 'text-sky-700' : 'text-ink-subtle'}`}>
                        <Send className="h-3.5 w-3.5" /> {card.patient.telegramLinked ? L('Telegram ulangan', 'Telegram подключён') : L('Telegram yo‘q', 'Без Telegram')}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:min-w-[460px]">
                  <Stat label={L('Tashriflar', 'Визиты')} value={String(card.stats.completedVisits)} />
                  <Stat
                    label={L('Oxirgi tashrif', 'Последний визит')}
                    value={card.stats.lastVisitAt ? formatClinicDate(card.stats.lastVisitAt, lang) : '—'}
                  />
                  <Stat label={L('Faol rejalar', 'Активные планы')} value={String(card.stats.activePlans)} />
                  {card.finance ? (
                    <Stat label={L('Qarz', 'Долг')} value={formatUzs(card.finance.debtUzs, lang)} tone={card.finance.debtUzs > 0 ? 'danger' : 'default'} />
                  ) : (
                    <Stat label={L('Topilmalar', 'Находки')} value={String(card.stats.teethWithFindings)} />
                  )}
                </div>
              </div>

              <nav className="-mb-px mt-6 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    role="tab"
                    aria-selected={tab === t.key}
                    onClick={() => setTab(t.key)}
                    className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                      tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-muted hover:text-ink'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </nav>
            </section>

            {tab === 'overview' && (
              <Overview
                card={card}
                lang={lang}
                onOpenPlans={() => setTab('plans')}
                canEditProfile={Boolean(user && ['OWNER', 'ADMIN'].includes(user.role))}
                onSaved={load}
              />
            )}

            {tab === 'chart' && (
              <section className="rounded-2xl border border-line bg-white p-4 shadow-card sm:p-6">
                <InteractiveOdontogram language={lang} patientId={card.patient.id} patientName={card.patient.fullName} />
              </section>
            )}

            {tab === 'plans' && (
              <TreatmentPlansPanel
                patientId={card.patient.id}
                patientName={card.patient.fullName}
                lang={lang}
                canEdit={canEdit}
                clinicName={brand.clinicName(lang)}
                onChanged={load}
              />
            )}

            {tab === 'visits' && <Visits appointments={card.appointments} lang={lang} />}

            {tab === 'payments' && card.finance && (
              <Payments
                finance={card.finance}
                lang={lang}
                clinicName={brand.clinicName(lang)}
                canCollect={Boolean(user && ['OWNER', 'ADMIN', 'RECEPTION'].includes(user.role))}
                canRefund={Boolean(user && ['OWNER', 'ADMIN'].includes(user.role))}
                onChanged={load}
              />
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}

function Stat({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'danger' }) {
  return (
    <div className="rounded-xl border border-line bg-canvas/60 px-3 py-2.5">
      <p className="text-[11px] font-medium text-ink-subtle">{label}</p>
      <p className={`mt-0.5 truncate text-[15px] font-semibold tabular-nums ${tone === 'danger' ? 'text-rose-600' : 'text-ink'}`}>{value}</p>
    </div>
  );
}

function Card({ title, icon: Icon, children, action }: { title: string; icon: any; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Icon className="h-4 w-4 text-brand-600" /> {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Overview({
  card,
  lang,
  onOpenPlans,
  canEditProfile,
  onSaved,
}: {
  card: any;
  lang: 'uz' | 'ru';
  onOpenPlans: () => void;
  canEditProfile: boolean;
  onSaved: () => void;
}) {
  const isRu = lang === 'ru';
  const L = (uz: string, ru: string) => (isRu ? ru : uz);
  const next = card.stats.nextAppointment;
  const recent = card.appointments.slice(0, 5);

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Card title={L('Keyingi qabul', 'Следующий визит')} icon={CalendarClock}>
          {next ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand-50 p-4">
              <div>
                <p className="text-base font-semibold text-brand-900">
                  {formatClinicDate(next.startTime, lang)} · {formatClinicTime(next.startTime)}
                </p>
                <p className="text-sm text-brand-800">
                  {[next.serviceName, doctorName(next.doctor, lang), isRu ? next.branch?.nameRu : next.branch?.nameUz].filter(Boolean).join(' · ')}
                </p>
              </div>
              <StatusBadge map={APPOINTMENT_STATUS} value={next.status} lang={lang} />
            </div>
          ) : (
            <p className="text-sm text-ink-muted">{L('Rejalashtirilgan qabul yo‘q.', 'Запланированных визитов нет.')}</p>
          )}
        </Card>

        <Card title={L("So'nggi qabullar", 'Последние визиты')} icon={CalendarCheck2}>
          {recent.length === 0 ? (
            <p className="text-sm text-ink-muted">{L('Qabullar yo‘q.', 'Визитов нет.')}</p>
          ) : (
            <ul className="divide-y divide-line">
              {recent.map((a: any) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium text-ink">{formatClinicDate(a.startTime, lang)}</span>
                    <span className="ml-2 text-ink-muted">{[a.serviceName, doctorName(a.doctor, lang)].filter(Boolean).join(' · ')}</span>
                  </span>
                  <StatusBadge map={APPOINTMENT_STATUS} value={a.status} lang={lang} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="space-y-5">
        <Card
          title={L('Davolash', 'Лечение')}
          icon={ClipboardList}
          action={
            <button type="button" onClick={onOpenPlans} className="text-xs font-semibold text-brand-700 hover:underline">
              {L('Rejalar', 'Планы')}
            </button>
          }
        >
          <dl className="space-y-2 text-sm">
            <Row k={L('Faol rejalar', 'Активные планы')} v={card.stats.activePlans} />
            <Row k={L('Rozilik kutilmoqda', 'Ожидают согласия')} v={card.stats.pendingPlans} />
            <Row k={L('Muammoli tishlar', 'Зубы с находками')} v={card.stats.teethWithFindings} />
            <Row k={L('Kelmagan qabullar', 'Неявки')} v={card.stats.noShows} />
          </dl>
        </Card>

        {card.finance && (
          <Card title={L('Moliyaviy holat', 'Финансы')} icon={Wallet}>
            <dl className="space-y-2 text-sm">
              <Row k={L('Hisoblangan', 'Начислено')} v={formatUzs(card.finance.billedUzs, lang)} />
              <Row k={L("To'langan", 'Оплачено')} v={formatUzs(card.finance.paidUzs, lang)} />
              <Row k={L('Qarz', 'Долг')} v={formatUzs(card.finance.debtUzs, lang)} danger={card.finance.debtUzs > 0} />
            </dl>
          </Card>
        )}

        <ProfileCard patient={card.patient} lang={lang} canEdit={canEditProfile} onSaved={onSaved} />

        {card.patient.notes && (
          <Card title={L('Izohlar', 'Заметки')} icon={StickyNote}>
            <p className="whitespace-pre-wrap text-sm text-ink-muted">{card.patient.notes}</p>
          </Card>
        )}
      </div>
    </div>
  );
}

function Row({ k, v, danger }: { k: string; v: React.ReactNode; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-muted">{k}</dt>
      <dd className={`font-semibold tabular-nums ${danger ? 'text-rose-600' : 'text-ink'}`}>{v}</dd>
    </div>
  );
}

function Visits({ appointments, lang }: { appointments: any[]; lang: 'uz' | 'ru' }) {
  const isRu = lang === 'ru';
  const L = (uz: string, ru: string) => (isRu ? ru : uz);
  if (appointments.length === 0) {
    return <p className="rounded-2xl border border-line bg-white p-6 text-sm text-ink-muted">{L('Qabullar yo‘q.', 'Визитов нет.')}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white shadow-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-canvas text-left text-[11px] uppercase tracking-wider text-ink-subtle">
          <tr>
            <th className="px-4 py-3 font-semibold">{L('Sana', 'Дата')}</th>
            <th className="px-4 py-3 font-semibold">{L('Xizmat', 'Услуга')}</th>
            <th className="px-4 py-3 font-semibold">{L('Shifokor', 'Врач')}</th>
            <th className="px-4 py-3 font-semibold">{L('Filial', 'Филиал')}</th>
            <th className="px-4 py-3 font-semibold">{L('Holat', 'Статус')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {appointments.map((a) => (
            <tr key={a.id}>
              <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">
                {formatClinicDate(a.startTime, lang)} <span className="text-ink-muted">{formatClinicTime(a.startTime)}</span>
              </td>
              <td className="px-4 py-3 text-ink-muted">{a.serviceName || '—'}</td>
              <td className="px-4 py-3 text-ink-muted">{doctorName(a.doctor, lang) || '—'}</td>
              <td className="px-4 py-3 text-ink-muted">{(isRu ? a.branch?.nameRu : a.branch?.nameUz) || '—'}</td>
              <td className="px-4 py-3">
                <StatusBadge map={APPOINTMENT_STATUS} value={a.status} lang={lang} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Payments({
  finance,
  lang,
  clinicName,
  canCollect,
  canRefund,
  onChanged,
}: {
  finance: any;
  lang: 'uz' | 'ru';
  clinicName: string;
  canCollect: boolean;
  canRefund: boolean;
  onChanged: () => void;
}) {
  const isRu = lang === 'ru';
  const L = (uz: string, ru: string) => (isRu ? ru : uz);
  const [paying, setPaying] = useState<any>(null);
  const [online, setOnline] = useState<string | null>(null);
  const [refund, setRefund] = useState<any>(null);
  const methodName = (m: string) => (m === 'PAYME' ? 'Payme' : m === 'CLICK' ? 'Click' : isRu ? PAYMENT_METHOD[m]?.ru : PAYMENT_METHOD[m]?.uz);
  return (
    <div className="space-y-4">
      <TakePaymentDialog invoice={paying} lang={lang} onClose={() => setPaying(null)} onDone={onChanged} />
      <OnlinePayDialog invoiceId={online} lang={lang} clinicName={clinicName} onClose={() => setOnline(null)} />
      <RefundDialog payment={refund} lang={lang} onClose={() => setRefund(null)} onDone={onChanged} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={L('Hisoblangan', 'Начислено')} value={formatUzs(finance.billedUzs, lang)} />
        <Stat label={L("To'langan", 'Оплачено')} value={formatUzs(finance.paidUzs, lang)} />
        <Stat label={L('Qarz', 'Долг')} value={formatUzs(finance.debtUzs, lang)} tone={finance.debtUzs > 0 ? 'danger' : 'default'} />
      </div>
      {finance.invoices.length === 0 ? (
        <p className="rounded-2xl border border-line bg-white p-6 text-sm text-ink-muted">{L('Hisob-fakturalar yo‘q.', 'Счетов нет.')}</p>
      ) : (
        <div className="space-y-3">
          {finance.invoices.map((inv: any) => (
            <div key={inv.id} className="rounded-2xl border border-line bg-white p-4 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-ink">{inv.notes || L('Hisob-faktura', 'Счёт')}</p>
                  <p className="text-xs text-ink-muted">{formatClinicDate(inv.createdAt, lang)}</p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold tabular-nums text-ink">{formatUzs(inv.effectiveTotal, lang)}</p>
                  <p className={`text-xs tabular-nums ${inv.debtAmount > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {inv.debtAmount > 0 ? `${L('Qarz', 'Долг')}: ${formatUzs(inv.debtAmount, lang)}` : L("To'langan", 'Оплачен')}
                  </p>
                </div>
              </div>
              {canCollect && inv.debtAmount > 0 && (
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setOnline(inv.id)}
                    className="h-8 rounded-lg border border-line px-3 text-xs font-semibold text-ink hover:bg-canvas"
                  >
                    {L('Payme / Click havola', 'Ссылка Payme / Click')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaying(inv)}
                    className="h-8 rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white hover:bg-brand-700"
                  >
                    {L("To'lov qabul qilish", 'Принять оплату')}
                  </button>
                </div>
              )}
              {inv.payments.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-ink-muted">
                  {inv.payments.map((p: any) => (
                    <li key={p.id} className="flex justify-between gap-2">
                      <span>
                        {formatClinicDate(p.recordedAt, lang)} · {methodName(p.method)}
                        {p.isRefund ? ` · ${L('qaytarildi', 'возврат')}` : ''}
                      </span>
                      <span className="flex items-center gap-2">
                        {canRefund && !p.isRefund && !['PAYME', 'CLICK'].includes(p.method) && (
                          <button type="button" onClick={() => setRefund(p)} className="font-semibold text-ink-subtle hover:text-rose-600">
                            {L('Qaytarish', 'Возврат')}
                          </button>
                        )}
                        <span className={`tabular-nums ${p.isRefund ? 'text-rose-600' : 'text-ink'}`}>
                          {p.isRefund ? '−' : ''}
                          {formatUzs(p.amount, lang)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileCard({ patient, lang, canEdit, onSaved }: { patient: any; lang: 'uz' | 'ru'; canEdit: boolean; onSaved: () => void }) {
  const L = (uz: string, ru: string) => (lang === 'ru' ? ru : uz);
  const initialBirth = patient.birthDate ? String(patient.birthDate).slice(0, 10) : '';
  const [birthDate, setBirthDate] = useState(initialBirth);
  const [optOut, setOptOut] = useState(Boolean(patient.marketingOptOut));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const dirty = birthDate !== initialBirth || optOut !== Boolean(patient.marketingOptOut);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await api.updatePatientProfile(patient.id, { birthDate: birthDate || null, marketingOptOut: optOut });
      setMsg(L('Saqlandi', 'Сохранено'));
      onSaved();
    } catch (e: any) {
      setMsg(e?.message || L('Xatolik yuz berdi', 'Произошла ошибка'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={L("Qo'shimcha ma'lumot", 'Дополнительно')} icon={Cake}>
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="mb-1 block text-xs text-ink-muted">{L("Tug'ilgan sana", 'Дата рождения')}</span>
          <input
            type="date"
            value={birthDate}
            max={new Date().toISOString().slice(0, 10)}
            disabled={!canEdit}
            onChange={(e) => setBirthDate(e.target.value)}
            className="h-9 w-full rounded-lg border border-line bg-white px-2.5 text-sm text-ink disabled:bg-canvas"
          />
        </label>
        <label className="flex items-start gap-2 text-ink">
          <input type="checkbox" checked={optOut} disabled={!canEdit} onChange={(e) => setOptOut(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-600" />
          <span>
            {L('Eslatma va tabriklar yuborilmasin', 'Не отправлять напоминания и поздравления')}
            <span className="block text-xs text-ink-subtle">{L('Qabul eslatmalari bunga kirmaydi', 'Напоминания о записи не затрагиваются')}</span>
          </span>
        </label>
        {canEdit && dirty && (
          <button type="button" disabled={busy} onClick={save} className="h-8 rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {L('Saqlash', 'Сохранить')}
          </button>
        )}
        {msg && <p className="text-xs text-ink-muted">{msg}</p>}
      </div>
    </Card>
  );
}
