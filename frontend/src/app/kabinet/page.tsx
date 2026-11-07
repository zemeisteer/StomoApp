'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  ClipboardList,
  History,
  Loader2,
  LogOut,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Smartphone,
  Wallet,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useBrand } from '../../lib/brand';
import { formatClinicDate, formatClinicTime } from '../../lib/dateFormat';
import { APPOINTMENT_STATUS, ITEM_STATUS, PLAN_STATUS, doctorName, formatUzs } from '../../lib/clinicFormat';
import { StatusBadge } from '../../components/ui/StatusBadge';

type Lang = 'uz' | 'ru';

export default function CabinetPage() {
  const { language, setLanguage } = useI18n();
  const lang: Lang = language === 'ru' ? 'ru' : 'uz';
  const [state, setState] = useState<'loading' | 'login' | 'ready'>('loading');
  const [me, setMe] = useState<Awaited<ReturnType<typeof api.portalMe>> | null>(null);

  // setLanguage from the i18n provider is not memoized; keep the latest in a ref so loadMe stays stable
  const setLanguageRef = useRef(setLanguage);
  setLanguageRef.current = setLanguage;

  const loadMe = useCallback(async () => {
    try {
      const data = await api.portalMe();
      setMe(data);
      setState('ready');
      const preferred = data.profiles[0]?.language;
      if (preferred === 'uz' || preferred === 'ru') setLanguageRef.current(preferred);
    } catch {
      setState('login');
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  return (
    <div className="min-h-[70vh] bg-canvas px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-4xl">
        {state === 'loading' && (
          <div className="flex justify-center py-24 text-ink-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {state === 'login' && <LoginForm lang={lang} onDone={loadMe} />}
        {state === 'ready' && me && (
          <Dashboard
            lang={lang}
            me={me}
            onLogout={async () => {
              await api.portalLogout().catch(() => {});
              setMe(null);
              setState('login');
            }}
            onLanguage={(l) => {
              setLanguage(l);
              api.portalSetLanguage(l).catch(() => {});
            }}
          />
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Login: phone -> 6-digit code
// -----------------------------------------------------------------------------

function formatPhoneInput(raw: string) {
  const d = raw.replace(/\D/g, '').replace(/^998/, '').slice(0, 9);
  const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
  return parts.join(' ');
}

function LoginForm({ lang, onDone }: { lang: Lang; onDone: () => void }) {
  const L = (uz: string, ru: string) => (lang === 'ru' ? ru : uz);
  const brand = useBrand();
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [channel, setChannel] = useState<'SMS' | 'TELEGRAM'>('SMS');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const digits = phone.replace(/\D/g, '');
  const fullPhone = `+998${digits}`;

  const send = async () => {
    if (digits.length !== 9) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.portalRequestCode(fullPhone, lang);
      setChannel(res.channel);
      setDevCode(res.devCode || null);
      setResendIn(res.resendInSeconds);
      setStep('code');
      setCode('');
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (e: any) {
      if (e?.data?.retryAfter) {
        setResendIn(e.data.retryAfter);
        setStep('code');
      }
      setError(e?.message || L('Xatolik yuz berdi', 'Произошла ошибка'));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value = code) => {
    if (value.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      await api.portalVerifyCode(fullPhone, value);
      onDone();
    } catch (e: any) {
      setError(e?.message || L("Kod noto'g'ri", 'Неверный код'));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-3xl overflow-hidden rounded-3xl border border-line bg-white shadow-card md:grid-cols-2">
      <div className="relative hidden flex-col justify-between bg-brand-950 p-8 text-white md:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(70% 60% at 0% 0%, rgb(var(--brand-600) / 0.6), transparent 70%)' }}
        />
        <p className="relative text-lg font-bold">{brand.clinicName(lang)}</p>
        <ul className="relative space-y-4 text-sm text-white/85">
          {[
            [CalendarClock, L('Qabullaringiz va ularni boshqarish', 'Ваши визиты и управление ими')],
            [ClipboardList, L('Davolash rejasi va narxlar', 'План лечения и цены')],
            [Wallet, L("To'lovlar va onlayn to'lash", 'Оплаты и онлайн-оплата')],
          ].map(([Icon, text]: any) => (
            <li key={text} className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                <Icon className="h-[18px] w-[18px]" />
              </span>
              {text}
            </li>
          ))}
        </ul>
        <p className="relative flex items-center gap-1.5 text-xs text-white/60">
          <ShieldCheck className="h-3.5 w-3.5" /> {L("Parol kerak emas — kod telefoningizga keladi", 'Пароль не нужен — код придёт на телефон')}
        </p>
      </div>

      <div className="p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{L('Shaxsiy kabinet', 'Личный кабинет')}</h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          {step === 'phone'
            ? L('Klinikada ro‘yxatdan o‘tgan telefon raqamingizni kiriting.', 'Введите номер телефона, указанный в клинике.')
            : channel === 'TELEGRAM'
              ? L('Kod Telegram botimizga yuborildi.', 'Код отправлен в наш Telegram-бот.')
              : L(`Kod +998 ${phone} raqamiga SMS orqali yuborildi.`, `Код отправлен по SMS на +998 ${phone}.`)}
        </p>

        {error && (
          <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}

        {step === 'phone' ? (
          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-ink">{L('Telefon raqam', 'Номер телефона')}</span>
              <div className="flex h-12 items-center rounded-xl border border-line bg-white focus-within:border-brand-600 focus-within:ring-4 focus-within:ring-brand-600/10">
                <span className="pl-3.5 pr-2 text-sm font-medium text-ink-muted">+998</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="90 123 45 67"
                  autoFocus
                  className="h-full min-w-0 flex-1 rounded-r-xl bg-transparent pr-3 text-base tracking-wide text-ink outline-none"
                  aria-label={L('Telefon raqam', 'Номер телефона')}
                />
              </div>
            </label>
            <button
              type="submit"
              disabled={busy || digits.length !== 9}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />} {L('Kod olish', 'Получить код')}
            </button>
          </form>
        ) : (
          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              verify();
            }}
          >
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-ink">{L('6 xonali kod', 'Код из 6 цифр')}</span>
              <input
                ref={codeRef}
                value={code}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setCode(v);
                  if (v.length === 6) verify(v);
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="••••••"
                className="h-14 w-full rounded-xl border border-line text-center text-2xl font-semibold tracking-[0.5em] text-ink focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/10"
              />
            </label>
            {devCode && (
              <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
                {L('Test rejimi (SMS ulanmagan): kod', 'Тестовый режим (SMS не подключён): код')} <b className="font-mono">{devCode}</b>
              </p>
            )}
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {L('Kirish', 'Войти')}
            </button>
            <div className="flex items-center justify-between text-sm">
              <button type="button" onClick={() => setStep('phone')} className="text-ink-muted hover:text-ink">
                {L("Raqamni o'zgartirish", 'Изменить номер')}
              </button>
              <button type="button" disabled={resendIn > 0 || busy} onClick={send} className="font-semibold text-brand-700 disabled:font-normal disabled:text-ink-subtle">
                {resendIn > 0 ? L(`Qayta yuborish ${resendIn} s`, `Повторно через ${resendIn} с`) : L('Kodni qayta yuborish', 'Отправить ещё раз')}
              </button>
            </div>
          </form>
        )}
        <p className="mt-6 text-xs text-ink-subtle">
          {L('Raqamingiz bazada yo‘qmi? Avval ', 'Номера нет в базе? Сначала ')}
          <Link href="/booking" className="font-semibold text-brand-700 hover:underline">
            {L('qabulga yoziling', 'запишитесь на приём')}
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Dashboard
// -----------------------------------------------------------------------------

function Dashboard({
  lang,
  me,
  onLogout,
  onLanguage,
}: {
  lang: Lang;
  me: { phone: string; profiles: Array<{ id: string; fullName: string }> };
  onLogout: () => void;
  onLanguage: (l: Lang) => void;
}) {
  const L = (uz: string, ru: string) => (lang === 'ru' ? ru : uz);
  const [patientId, setPatientId] = useState(me.profiles[0]?.id);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await api.portalOverview(patientId));
    } catch (e: any) {
      if (e?.status === 401) onLogout();
      else setError(e?.message || L("Ma'lumotlarni yuklab bo'lmadi", 'Не удалось загрузить данные'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const act = async (key: string, fn: () => Promise<any>, ok?: string) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      if (ok) setNotice(ok);
      await load();
    } catch (e: any) {
      setError(e?.message || L('Xatolik yuz berdi', 'Произошла ошибка'));
    } finally {
      setBusy(null);
    }
  };

  const pay = async (invoiceId: string, provider: 'payme' | 'click') => {
    setBusy(`${provider}-${invoiceId}`);
    setError(null);
    try {
      const links = await api.portalPaymentLinks(invoiceId);
      const url = links[provider];
      if (url) window.location.href = url;
      else setError(L("Bu to'lov usuli hozircha ulanmagan", 'Этот способ оплаты пока не подключён'));
    } catch (e: any) {
      setError(e?.message || L('Xatolik yuz berdi', 'Произошла ошибка'));
    } finally {
      setBusy(null);
    }
  };

  const presented = useMemo(() => (data?.plans || []).filter((p: any) => p.status === 'PRESENTED'), [data]);
  const activePlans = useMemo(() => (data?.plans || []).filter((p: any) => p.status !== 'PRESENTED'), [data]);
  const openInvoices = useMemo(() => (data?.invoices || []).filter((i: any) => i.debtUzs > 0), [data]);
  const recentPayments = useMemo(
    () =>
      (data?.invoices || [])
        .flatMap((i: any) => i.payments)
        .sort((a: any, b: any) => +new Date(b.recordedAt) - +new Date(a.recordedAt))
        .slice(0, 6),
    [data],
  );
  const firstName = (data?.patient?.fullName || me.profiles[0]?.fullName || '').split(/\s+/)[0];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-ink-muted">{L('Shaxsiy kabinet', 'Личный кабинет')}</p>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {L(`Assalomu alaykum, ${firstName}`, `Здравствуйте, ${firstName}`)}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {me.profiles.length > 1 && (
            <select
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="h-9 rounded-lg border border-line bg-white px-2.5 text-sm text-ink"
              aria-label={L('Bemor', 'Пациент')}
            >
              {me.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </select>
          )}
          <div className="flex h-9 items-center rounded-lg border border-line bg-white p-0.5">
            {(['uz', 'ru'] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => onLanguage(l)}
                aria-pressed={lang === l}
                className={`h-full rounded-md px-2.5 text-[11px] font-bold ${lang === l ? 'bg-brand-600 text-white' : 'text-ink-subtle hover:text-ink'}`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <button type="button" onClick={onLogout} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-medium text-ink-muted hover:text-ink">
            <LogOut className="h-4 w-4" /> {L('Chiqish', 'Выйти')}
          </button>
        </div>
      </header>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}
      {notice && (
        <p className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {notice}
        </p>
      )}

      {!data ? (
        <div className="flex justify-center py-16 text-ink-muted">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <>
          {/* Summary tiles */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Tile
              icon={CalendarClock}
              label={L('Keyingi qabul', 'Следующий визит')}
              value={data.upcoming[0] ? `${formatClinicDate(data.upcoming[0].startTime, lang)}, ${formatClinicTime(data.upcoming[0].startTime)}` : '—'}
            />
            <Tile icon={ClipboardList} label={L('Davolash rejalari', 'Планы лечения')} value={String(data.plans.length)} />
            <Tile
              icon={Wallet}
              label={L("To'lanmagan", 'К оплате')}
              value={formatUzs(data.totals.debtUzs, lang)}
              tone={data.totals.debtUzs > 0 ? 'danger' : 'default'}
            />
          </div>

          {/* Plans waiting for consent */}
          {presented.map((plan: any) => (
            <section key={plan.id} className="rounded-2xl border-2 border-brand-200 bg-white p-5 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">{L('Rozilingiz kutilmoqda', 'Ждём вашего согласия')}</p>
                  <h2 className="mt-1 text-lg font-semibold text-ink">{plan.title}</h2>
                  {plan.doctor && <p className="text-sm text-ink-muted">{doctorName(plan.doctor, lang)}</p>}
                </div>
                <p className="text-xl font-semibold tabular-nums text-ink">{formatUzs(plan.totals.totalUzs, lang)}</p>
              </div>
              <PlanItems plan={plan} lang={lang} />
              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => act(`decline-${plan.id}`, () => api.portalDeclinePlan(plan.id), L('Javobingiz klinikaga yuborildi.', 'Ваш ответ отправлен в клинику.'))}
                  className="h-10 rounded-xl px-4 text-sm font-semibold text-ink-muted hover:bg-canvas"
                >
                  {L('Rad etish', 'Отказаться')}
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => act(`accept-${plan.id}`, () => api.portalAcceptPlan(plan.id), L('Rahmat! Rejaga rozilingiz qabul qilindi.', 'Спасибо! Согласие на план принято.'))}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {busy === `accept-${plan.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  {L('Rejaga roziman', 'Согласен(на) с планом')}
                </button>
              </div>
            </section>
          ))}

          <div className="grid gap-5 lg:grid-cols-5">
            <div className="space-y-5 lg:col-span-3">
              {/* Upcoming visits */}
              <Card
                icon={CalendarClock}
                title={L('Qabullarim', 'Мои визиты')}
                action={
                  <Link href="/booking" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
                    <CalendarPlus className="h-3.5 w-3.5" /> {L('Yangi qabul', 'Записаться')}
                  </Link>
                }
              >
                {data.upcoming.length === 0 ? (
                  <p className="text-sm text-ink-muted">{L('Rejalashtirilgan qabul yo‘q.', 'Запланированных визитов нет.')}</p>
                ) : (
                  <ul className="space-y-3">
                    {data.upcoming.map((a: any) => (
                      <li key={a.id} className="rounded-xl border border-line p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-ink">
                              {formatClinicDate(a.startTime, lang)} · {formatClinicTime(a.startTime)}
                            </p>
                            <p className="text-sm text-ink-muted">{[a.serviceName, doctorName(a.doctor, lang)].filter(Boolean).join(' · ')}</p>
                            {a.branch && (
                              <p className="mt-1 flex items-center gap-1 text-xs text-ink-subtle">
                                <MapPin className="h-3.5 w-3.5" /> {lang === 'ru' ? a.branch.addressRu || a.branch.nameRu : a.branch.addressUz || a.branch.nameUz}
                              </p>
                            )}
                          </div>
                          <StatusBadge map={APPOINTMENT_STATUS} value={a.status} lang={lang} />
                        </div>
                        {a.manageUrl && (
                          <Link href={a.manageUrl} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
                            {L("Ko'chirish yoki bekor qilish", 'Перенести или отменить')} <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* Plans */}
              {activePlans.length > 0 && (
                <Card icon={ClipboardList} title={L('Davolash rejalarim', 'Мои планы лечения')}>
                  <div className="space-y-4">
                    {activePlans.map((plan: any) => {
                      const pct = plan.totals.subtotalUzs > 0 ? Math.round((plan.totals.completedUzs / plan.totals.subtotalUzs) * 100) : 0;
                      return (
                        <div key={plan.id} className="rounded-xl border border-line p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-semibold text-ink">{plan.title}</p>
                            <StatusBadge map={PLAN_STATUS} value={plan.status} lang={lang} />
                          </div>
                          {['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'].includes(plan.status) && (
                            <div className="mt-3">
                              <div className="flex justify-between text-xs text-ink-muted">
                                <span>{L('Bajarildi', 'Выполнено')}</span>
                                <span>{pct}%</span>
                              </div>
                              <div className="mt-1 h-2 overflow-hidden rounded-full bg-canvas">
                                <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          )}
                          <PlanItems plan={plan} lang={lang} showStatus />
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

              {/* History */}
              <Card icon={History} title={L('Tashriflar tarixi', 'История визитов')}>
                {data.past.length === 0 ? (
                  <p className="text-sm text-ink-muted">{L('Hali tashrif yo‘q.', 'Визитов пока нет.')}</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {data.past.slice(0, 10).map((a: any) => (
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

            <div className="space-y-5 lg:col-span-2">
              <Card icon={Wallet} title={L("To'lovlar", 'Оплаты')}>
                {openInvoices.length === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" /> {L("Qarzingiz yo'q", 'Задолженности нет')}
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {openInvoices.map((inv: any) => (
                      <li key={inv.id} className="rounded-xl border border-line p-3">
                        <p className="text-sm font-medium text-ink line-clamp-2">{inv.notes || L('Hisob', 'Счёт')}</p>
                        <p className="mt-0.5 text-xs text-ink-muted">{formatClinicDate(inv.createdAt, lang)}</p>
                        <p className="mt-2 text-lg font-semibold tabular-nums text-rose-600">{formatUzs(inv.debtUzs, lang)}</p>
                        {inv.canPayOnline ? (
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            {(['payme', 'click'] as const).map((p) => (
                              <button
                                key={p}
                                type="button"
                                disabled={busy !== null}
                                onClick={() => pay(inv.id, p)}
                                className="h-9 rounded-lg border border-line text-sm font-semibold text-ink hover:border-brand-600 hover:bg-brand-50 disabled:opacity-50"
                              >
                                {busy === `${p}-${inv.id}` ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : p === 'payme' ? 'Payme' : 'Click'}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-ink-subtle">{L("To'lovni klinika kassasida amalga oshiring.", 'Оплатить можно в кассе клиники.')}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {recentPayments.length > 0 && (
                  <div className="mt-4 border-t border-line pt-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-subtle">{L("So'nggi to'lovlar", 'Последние оплаты')}</p>
                    <ul className="space-y-1.5 text-sm">
                      {recentPayments.map((p: any) => (
                        <li key={p.id} className="flex justify-between gap-2">
                          <span className="text-ink-muted">{formatClinicDate(p.recordedAt, lang)}</span>
                          <span className={`tabular-nums ${p.isRefund ? 'text-rose-600' : 'text-ink'}`}>
                            {p.isRefund ? '−' : ''}
                            {formatUzs(p.amount, lang)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>

              <Card icon={MessageCircle} title={L('Savolingiz bormi?', 'Есть вопросы?')}>
                <p className="text-sm text-ink-muted">
                  {L('Klinikaga qo‘ng‘iroq qiling yoki Telegram botimizga yozing.', 'Позвоните в клинику или напишите нашему Telegram-боту.')}
                </p>
                <Link href="/contacts" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
                  {L('Aloqa', 'Контакты')} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Tile({ icon: Icon, label, value, tone = 'default' }: { icon: any; label: string; value: string; tone?: 'default' | 'danger' }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 shadow-card">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-ink-subtle">{label}</span>
        <span className={`block truncate text-[15px] font-semibold tabular-nums ${tone === 'danger' ? 'text-rose-600' : 'text-ink'}`}>{value}</span>
      </span>
    </div>
  );
}

function Card({ icon: Icon, title, action, children }: { icon: any; title: string; action?: React.ReactNode; children: React.ReactNode }) {
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

function PlanItems({ plan, lang, showStatus = false }: { plan: any; lang: Lang; showStatus?: boolean }) {
  const L = (uz: string, ru: string) => (lang === 'ru' ? ru : uz);
  return (
    <ul className="mt-3 divide-y divide-line text-sm">
      {plan.items.map((i: any) => (
        <li key={i.id} className="flex items-start justify-between gap-3 py-2">
          <span className="min-w-0">
            <span className="text-ink">{lang === 'ru' ? i.treatmentNameRu || i.treatmentNameUz : i.treatmentNameUz}</span>
            <span className="block text-xs text-ink-subtle">
              {i.toothNumber ? `${L('Tish', 'Зуб')} ${i.toothNumber} · ` : ''}
              {i.quantity} × {formatUzs(i.unitPriceUzs, lang)}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1">
            <span className="font-medium tabular-nums text-ink">{formatUzs(i.costUzs, lang)}</span>
            {showStatus && <StatusBadge map={ITEM_STATUS} value={i.status} lang={lang} />}
          </span>
        </li>
      ))}
      {plan.totals.discountUzs > 0 && (
        <li className="flex justify-between py-2 text-emerald-700">
          <span>{L('Chegirma', 'Скидка')}</span>
          <span className="tabular-nums">− {formatUzs(plan.totals.discountUzs, lang)}</span>
        </li>
      )}
    </ul>
  );
}
