'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, AlertCircle } from 'lucide-react';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useI18n } from '../../../lib/i18n';

const MIN_LENGTH = 12;

/** Staff with a temporary password (or anyone who wants a new one) choose their own password here. */
export default function ChangePasswordPage() {
  const { user, isLoading, checkAuth, logout } = useAuth();
  const { language } = useI18n();
  const isRu = language === 'ru';
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) router.replace('/admin/login');
  }, [isLoading, user, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < MIN_LENGTH) {
      setError(isRu ? `Новый пароль: не меньше ${MIN_LENGTH} символов` : `Yangi parol kamida ${MIN_LENGTH} belgidan iborat bo'lsin`);
      return;
    }
    if (next !== repeat) {
      setError(isRu ? 'Пароли не совпадают' : 'Parollar bir xil emas');
      return;
    }
    try {
      setBusy(true);
      await api.changePassword(current, next);
      await checkAuth();
      router.replace('/admin');
    } catch (err: any) {
      setError(err?.message || (isRu ? 'Не удалось сменить пароль' : "Parolni o'zgartirib bo'lmadi"));
    } finally {
      setBusy(false);
    }
  };

  const input =
    'w-full h-11 pl-10 pr-4 rounded-xl bg-white border border-line text-sm text-ink focus:outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10';

  return (
    <main className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-white p-6 shadow-soft">
        <h1 className="text-lg font-semibold text-ink">{isRu ? 'Смена пароля' : "Parolni o'zgartirish"}</h1>
        {user?.mustChangePassword && (
          <p className="text-sm text-ink-muted">
            {isRu
              ? 'Вам выдан временный пароль. Придумайте свой, чтобы продолжить.'
              : "Sizga vaqtinchalik parol berilgan. Davom etish uchun o'z parolingizni tanlang."}
          </p>
        )}
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
        {[
          { id: 'current', label: isRu ? 'Текущий пароль' : 'Joriy parol', value: current, set: setCurrent, auto: 'current-password' },
          { id: 'next', label: isRu ? 'Новый пароль' : 'Yangi parol', value: next, set: setNext, auto: 'new-password' },
          { id: 'repeat', label: isRu ? 'Повторите новый пароль' : 'Yangi parolni takrorlang', value: repeat, set: setRepeat, auto: 'new-password' },
        ].map((f) => (
          <label key={f.id} className="block">
            <span className="mb-1 block text-xs font-semibold text-ink">{f.label}</span>
            <span className="relative block">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
              <input
                type="password"
                required
                autoComplete={f.auto}
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                className={input}
              />
            </span>
          </label>
        ))}
        <button
          type="submit"
          disabled={busy}
          className="h-11 w-full rounded-xl bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {busy ? '…' : isRu ? 'Сохранить' : 'Saqlash'}
        </button>
        <button type="button" onClick={() => logout()} className="w-full text-center text-xs text-ink-muted hover:text-ink">
          {isRu ? 'Выйти' : 'Chiqish'}
        </button>
      </form>
    </main>
  );
}
