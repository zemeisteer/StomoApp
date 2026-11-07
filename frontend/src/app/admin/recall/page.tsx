'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, BellRing, Cake, Check, Loader2, Phone, Send } from 'lucide-react';
import { AdminLayout } from '../../../components/AdminLayout';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useI18n } from '../../../lib/i18n';
import { formatClinicDate } from '../../../lib/dateFormat';

type Tab = 'recall' | 'birthdays';

export default function RecallPage() {
  const { user } = useAuth();
  const { language } = useI18n();
  const lang: 'uz' | 'ru' = language === 'ru' ? 'ru' : 'uz';
  const L = (uz: string, ru: string) => (lang === 'ru' ? ru : uz);
  const isOwner = user?.role === 'OWNER';

  const [tab, setTab] = useState<Tab>('recall');
  const [settings, setSettings] = useState<{ recallEnabled: boolean; recallMonths: number; birthdayEnabled: boolean } | null>(null);
  const [recall, setRecall] = useState<any[] | null>(null);
  const [birthdays, setBirthdays] = useState<any[] | null>(null);
  const [filter, setFilter] = useState<'todo' | 'all'>('todo');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [s, r, b] = await Promise.all([api.getEngagementSettings(), api.getRecallList(), api.getUpcomingBirthdays()]);
      setSettings(s);
      setRecall(r.items);
      setBirthdays(b);
    } catch (e: any) {
      setError(e?.message || L("Ma'lumotlarni yuklab bo'lmadi", 'Не удалось загрузить данные'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const act = async (key: string, fn: () => Promise<any>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e: any) {
      setError(e?.message || L('Xatolik yuz berdi', 'Произошла ошибка'));
    } finally {
      setBusy(null);
    }
  };

  const saveSettings = (patch: Partial<NonNullable<typeof settings>>) =>
    act('settings', async () => {
      setSettings((s) => (s ? { ...s, ...patch } : s));
      await api.updateEngagementSettings(patch);
    });

  const visible = (recall || []).filter((r) => filter === 'all' || (!r.contactedAt && !r.optedOut));
  const todoCount = (recall || []).filter((r) => !r.contactedAt && !r.optedOut).length;

  return (
    <AdminLayout allowedRoles={['OWNER', 'ADMIN', 'RECEPTION']}>
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{L('Qayta chaqirish', 'Повторные визиты')}</h1>
          <p className="text-sm text-ink-muted">
            {L('Uzoq kelmagan bemorlarni ko‘rikka chaqirish va tug‘ilgan kun tabriklari', 'Приглашение давно не приходивших пациентов на осмотр и поздравления с днём рождения')}
          </p>
        </div>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}

        {settings && (
          <section className="grid gap-3 rounded-2xl border border-line bg-white p-5 shadow-card sm:grid-cols-2">
            <Toggle
              label={L('Avtomatik ko‘rik eslatmasi', 'Автонапоминание об осмотре')}
              hint={L(
                `Muddat har bir xizmatda belgilanadi (Xizmatlar → Qayta ko‘rikka chaqirish). Belgilanmagan xizmatlar uchun: ${settings.recallMonths} oy. Har kuni 10:00 da, qabulga yozilmaganlarga bir marta`,
                `Интервал задаётся в каждой услуге (Услуги → Повторный осмотр). Для остальных: ${settings.recallMonths} мес. Каждый день в 10:00, только тем, кто не записан`,
              )}
              checked={settings.recallEnabled}
              disabled={!isOwner || busy === 'settings'}
              onChange={(v) => saveSettings({ recallEnabled: v })}
              extra={
                <label className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
                  {L('Standart muddat (oy)', 'Интервал по умолчанию (мес.)')}
                  <select
                    value={settings.recallMonths}
                    disabled={!isOwner}
                    onChange={(e) => saveSettings({ recallMonths: Number(e.target.value) })}
                    className="h-8 rounded-lg border border-line bg-white px-2 text-sm text-ink"
                  >
                    {[3, 4, 6, 9, 12].map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
              }
            />
            <Toggle
              label={L('Tug‘ilgan kun tabrigi', 'Поздравление с днём рождения')}
              hint={L('Tug‘ilgan sanasi kiritilgan bemorlarga ertalab avtomatik yuboriladi', 'Автоматически утром пациентам с указанной датой рождения')}
              checked={settings.birthdayEnabled}
              disabled={!isOwner || busy === 'settings'}
              onChange={(v) => saveSettings({ birthdayEnabled: v })}
            />
            {!isOwner && <p className="text-xs text-ink-subtle sm:col-span-2">{L('Sozlamalarni faqat rahbar o‘zgartiradi.', 'Настройки меняет только владелец.')}</p>}
            <p className="text-xs text-ink-subtle sm:col-span-2">
              {L(
                'Telegram ulangan bemorlarga Telegram orqali, qolganlariga SMS orqali. Voz kechgan bemorlarga hech narsa yuborilmaydi.',
                'Подключившим Telegram — в Telegram, остальным — SMS. Отказавшимся ничего не отправляется.',
              )}
            </p>
          </section>
        )}

        <nav className="flex gap-1 border-b border-line" role="tablist">
          {(
            [
              ['recall', L('Ko‘rikka chaqirish', 'На осмотр'), todoCount],
              ['birthdays', L('Tug‘ilgan kunlar (7 kun)', 'Дни рождения (7 дней)'), birthdays?.length || 0],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium ${
                tab === key ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              {label}
              <span className="rounded-full bg-canvas px-1.5 text-[11px] font-semibold text-ink-muted">{count}</span>
            </button>
          ))}
        </nav>

        {tab === 'recall' && (
          <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
            <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
              <p className="text-sm text-ink-muted">{L('Oxirgi tashrifi eski va qabulga yozilmaganlar', 'Давно не были и не записаны')}</p>
              <select value={filter} onChange={(e) => setFilter(e.target.value as any)} className="h-8 rounded-lg border border-line bg-white px-2 text-xs">
                <option value="todo">{L('Bog‘lanish kerak', 'Нужно связаться')}</option>
                <option value="all">{L('Hammasi', 'Все')}</option>
              </select>
            </div>
            {!recall ? (
              <p className="flex items-center gap-2 p-5 text-sm text-ink-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> {L('Yuklanmoqda…', 'Загрузка…')}
              </p>
            ) : visible.length === 0 ? (
              <p className="p-5 text-sm text-ink-muted">{L('Hozircha hech kim yo‘q.', 'Пока никого нет.')}</p>
            ) : (
              <ul className="divide-y divide-line">
                {visible.map((r) => (
                  <li key={r.patientId} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <Link href={`/admin/patients/${r.patientId}`} className="font-medium text-ink hover:text-brand-700">
                        {r.fullName}
                      </Link>
                      <p className="text-xs text-ink-muted">
                        {L('Oxirgi tashrif', 'Последний визит')}: {formatClinicDate(r.lastVisitAt, lang)} ·{' '}
                        {r.daysSinceVisit >= 60 ? `${r.monthsSinceVisit} ${L('oy oldin', 'мес. назад')}` : `${r.daysSinceVisit} ${L('kun oldin', 'дн. назад')}`}
                        {r.telegramLinked ? ' · Telegram' : ''}
                      </p>
                      <p className="text-xs text-ink-subtle">
                        {r.lastServices ? `${r.lastServices} · ` : ''}
                        {L('chaqirish muddati', 'интервал')}:{' '}
                        {r.intervalDays % 30 === 0 ? `${r.intervalDays / 30} ${L('oy', 'мес.')}` : `${r.intervalDays} ${L('kun', 'дн.')}`}
                      </p>
                      {r.optedOut && <p className="text-xs font-medium text-amber-700">{L('Eslatmalardan voz kechgan', 'Отказался от напоминаний')}</p>}
                      {r.contactedAt && (
                        <p className="text-xs text-emerald-700">
                          {L('Bog‘lanildi', 'Связались')}: {formatClinicDate(r.contactedAt, lang)}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a href={`tel:${r.phone}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-semibold text-ink hover:bg-canvas">
                        <Phone className="h-3.5 w-3.5" /> {r.phone}
                      </a>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => act(`c-${r.patientId}`, () => api.markRecallContacted(r.patientId))}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-semibold text-ink-muted hover:bg-canvas disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" /> {L("Qo'ng'iroq qilindi", 'Позвонили')}
                      </button>
                      {!r.optedOut && (
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => act(`s-${r.patientId}`, () => api.sendRecall(r.patientId))}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                        >
                          {busy === `s-${r.patientId}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          {L('Eslatma yuborish', 'Отправить напоминание')}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === 'birthdays' && (
          <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
            {!birthdays ? null : birthdays.length === 0 ? (
              <p className="p-5 text-sm text-ink-muted">
                {L(
                  'Yaqin 7 kunda tug‘ilgan kun yo‘q. Bemor kartasida tug‘ilgan sanani kiriting.',
                  'Ближайшие 7 дней дней рождения нет. Укажите дату рождения в карте пациента.',
                )}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {birthdays.map((b) => (
                  <li key={b.patientId} className="flex items-center gap-3 px-5 py-3">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${b.inDays === 0 ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-600'}`}>
                      <Cake className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link href={`/admin/patients/${b.patientId}`} className="font-medium text-ink hover:text-brand-700">
                        {b.fullName}
                      </Link>
                      <p className="text-xs text-ink-muted">
                        {b.inDays === 0 ? L('Bugun', 'Сегодня') : L(`${b.inDays} kundan keyin`, `через ${b.inDays} дн.`)} · {b.turnsAge} {L('yosh', 'лет')}
                        {b.optedOut ? ` · ${L('tabriklar o‘chiq', 'поздравления отключены')}` : ''}
                      </p>
                    </div>
                    <a href={`tel:${b.phone}`} className="text-xs font-semibold text-brand-700 hover:underline">
                      {b.phone}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </AdminLayout>
  );
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
  extra,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <BellRing className="h-4 w-4 text-brand-600" /> {label}
          </p>
          <p className="mt-1 text-xs text-ink-muted">{hint}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-brand-600' : 'bg-line-strong'}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>
      {extra}
    </div>
  );
}
