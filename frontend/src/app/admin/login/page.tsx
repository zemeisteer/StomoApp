'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Lock, Mail, AlertCircle, ArrowLeft, Eye, EyeOff, CalendarCheck2, Users, BellRing } from 'lucide-react';
import { useAuth } from '../../../lib/auth';
import { useI18n } from '../../../lib/i18n';
import { useBrand } from '../../../lib/brand';

const SHOW_DEMO_CREDENTIALS = process.env.NODE_ENV !== 'production';

export default function AdminLoginPage() {
  const { login } = useAuth();
  const { t, language, setLanguage } = useI18n();
  const brand = useBrand();
  const router = useRouter();
  const isRu = language === 'ru';
  const clinicName = brand.clinicName(language);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setErrorMessage(isRu ? 'Введите электронную почту и пароль' : 'Iltimos, elektron pochta va parolni kiriting');
      return;
    }

    try {
      setIsLoading(true);
      setErrorMessage(null);
      // Passwords are sent exactly as typed: leading/trailing spaces can be part of a password.
      await login(email.trim(), password);
      router.push('/admin');
    } catch (err: any) {
      setErrorMessage(err?.message || (isRu ? 'Неверный логин или пароль' : "Login yoki parol noto'g'ri"));
    } finally {
      setIsLoading(false);
    }
  };

  const fillDemoCreds = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
  };

  const features = [
    { icon: CalendarCheck2, text: isRu ? 'Расписание врачей и онлайн-записи' : 'Shifokorlar jadvali va onlayn yozilishlar' },
    { icon: Users, text: isRu ? 'Карты пациентов и история лечения' : 'Bemor kartalari va davolash tarixi' },
    { icon: BellRing, text: isRu ? 'Напоминания по SMS и Telegram' : 'SMS va Telegram eslatmalari' },
  ];

  const inputClass =
    'w-full h-11 pl-10 pr-4 rounded-xl bg-white border border-line text-sm text-ink placeholder:text-ink-subtle focus:outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10 transition';

  return (
    <div className="min-h-screen grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] bg-white">
      {/* Brand panel */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-brand-950 p-12 text-white">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-90"
          style={{
            background:
              'radial-gradient(60% 50% at 15% 10%, rgb(var(--brand-600) / 0.55), transparent 70%), radial-gradient(50% 45% at 90% 90%, rgb(var(--secondary-600) / 0.35), transparent 70%)',
          }}
        />
        <div className="relative flex items-center gap-3">
          {brand.logo && !logoError ? (
            <span className="inline-flex rounded-xl bg-white px-3 py-2 shadow-soft">
              <Image
                src={brand.logo}
                alt={clinicName}
                width={150}
                height={36}
                unoptimized
                onError={() => setLogoError(true)}
                className="h-8 w-auto max-w-[150px] object-contain"
              />
            </span>
          ) : (
            <span className="text-xl font-bold tracking-tight">{clinicName}</span>
          )}
        </div>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-bold leading-tight tracking-tight">
            {isRu ? 'Вся клиника — в одной панели' : 'Butun klinika — bitta panelda'}
          </h2>
          <ul className="mt-8 space-y-4">
            {features.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-white/80">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/50">
          © {new Date().getFullYear()} {clinicName}
        </p>
      </aside>

      {/* Form */}
      <main className="flex flex-col px-6 py-8 sm:px-12">
        <div className="flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
            <ArrowLeft className="h-4 w-4" />
            <span>{isRu ? 'На сайт' : 'Saytga qaytish'}</span>
          </Link>
          <div className="flex items-center h-8 p-0.5 rounded-lg border border-line bg-canvas">
            {(['uz', 'ru'] as const).map((lng) => (
              <button
                key={lng}
                type="button"
                onClick={() => setLanguage(lng)}
                aria-pressed={language === lng}
                className={`h-full px-2.5 text-[11px] font-bold rounded-md ${
                  language === lng ? 'bg-white text-ink shadow-soft' : 'text-ink-subtle hover:text-ink'
                }`}
              >
                {lng.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm space-y-7">
            <div>
              <p className="lg:hidden mb-6 text-lg font-bold text-ink">{clinicName}</p>
              <h1 className="text-2xl font-bold tracking-tight text-ink">
                {isRu ? 'Вход в панель' : 'Panelga kirish'}
              </h1>
              <p className="mt-1.5 text-sm text-ink-muted">
                {isRu ? 'Только для сотрудников клиники' : 'Faqat klinika xodimlari uchun'}
              </p>
            </div>

            {errorMessage && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label htmlFor="login-email" className="mb-1.5 block text-[13px] font-medium text-ink">
                  {isRu ? 'Электронная почта' : 'Elektron pochta'}
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@klinika.uz"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="login-password" className="mb-1.5 block text-[13px] font-medium text-ink">
                  {isRu ? 'Пароль' : 'Parol'}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={`${inputClass} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-subtle hover:text-ink"
                    aria-label={showPassword ? (isRu ? 'Скрыть пароль' : 'Parolni yashirish') : isRu ? 'Показать пароль' : "Parolni ko'rsatish"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="h-11 w-full rounded-xl bg-brand-600 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-brand-700 disabled:opacity-60"
              >
                {isLoading ? t.common.loading : isRu ? 'Войти' : 'Kirish'}
              </button>
            </form>

            {/* Demo quick-fill: development builds only. NODE_ENV is inlined at build time,
                so production bundles contain neither these buttons nor the seed passwords. */}
            {SHOW_DEMO_CREDENTIALS && (
              <div className="space-y-2 border-t border-line pt-5">
                <p className="text-center text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                  Dev: test hisoblari
                </p>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => fillDemoCreds('admin@dentacare.local', 'DentacareAdmin2026!')}
                    className="rounded-lg border border-line p-2 text-left text-ink-muted hover:bg-canvas"
                  >
                    <strong className="block text-brand-700">OWNER</strong>
                    admin@dentacare.local
                  </button>
                  <button
                    type="button"
                    onClick={() => fillDemoCreds('dr.rahimov@dentacare.local', 'Doctor2026!')}
                    className="rounded-lg border border-line p-2 text-left text-ink-muted hover:bg-canvas"
                  >
                    <strong className="block text-brand-700">DOCTOR</strong>
                    dr.rahimov@dentacare.local
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
