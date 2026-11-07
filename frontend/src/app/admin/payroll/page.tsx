'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ChevronDown, ChevronRight, Download, Loader2 } from 'lucide-react';
import { AdminLayout } from '../../../components/AdminLayout';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useI18n } from '../../../lib/i18n';
import { formatClinicDate, getClinicTodayDateString } from '../../../lib/dateFormat';
import { formatUzs } from '../../../lib/clinicFormat';

function monthBounds(month: string) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

export default function PayrollPage() {
  const { user } = useAuth();
  const { language } = useI18n();
  const lang: 'uz' | 'ru' = language === 'ru' ? 'ru' : 'uz';
  const L = (uz: string, ru: string) => (lang === 'ru' ? ru : uz);

  const [month, setMonth] = useState(getClinicTodayDateString().slice(0, 7));
  const [rows, setRows] = useState<any[] | null>(null);
  const [staff, setStaff] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, any[] | null>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const { from, to } = useMemo(() => monthBounds(month), [month]);

  const load = useCallback(async () => {
    try {
      setError(null);
      setRows(null);
      setOpen({});
      const [docs, people] = await Promise.all([api.getCommissionsReport(from, to), api.getStaffPay(from, to).catch(() => [])]);
      // Doctor accounts are paid through their doctor profile, so list only the other staff here.
      setStaff((people || []).filter((p: any) => !p.doctorId && p.role !== 'DOCTOR'));
      setRows(docs);
    } catch (e: any) {
      setError(e?.message || L("Ma'lumotlarni yuklab bo'lmadi", 'Не удалось загрузить данные'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const toggle = async (doctorId: string) => {
    if (doctorId in open) {
      const next = { ...open };
      delete next[doctorId];
      setOpen(next);
      return;
    }
    setOpen((o) => ({ ...o, [doctorId]: null }));
    try {
      const r = await api.getDoctorEarningsReport(doctorId, from, to);
      setOpen((o) => ({ ...o, [doctorId]: r.appointments || [] }));
    } catch (e: any) {
      setError(e?.message || L('Xatolik yuz berdi', 'Произошла ошибка'));
    }
  };

  const saveRate = async (row: any, percentage: number, fixedBonus: number) => {
    if (percentage === row.percentage && fixedBonus === row.fixedBonus) return;
    setSaving(row.doctorId);
    try {
      await api.updateDoctorCommission(row.doctorId, {
        percentage,
        fixedBonus,
        payType: row.payType,
        monthlySalary: row.monthlySalary,
      });
      await load();
    } catch (e: any) {
      setError(e?.message || L('Xatolik yuz berdi', 'Произошла ошибка'));
    } finally {
      setSaving(null);
    }
  };

  const saveStaffBonus = async (p: any, fixedBonus: number) => {
    if (fixedBonus === p.fixedBonus) return;
    setSaving(p.staffUserId);
    try {
      await api.updateStaffPay(p.staffUserId, {
        payType: p.payType,
        monthlySalary: p.monthlySalary,
        percentage: p.percentage,
        fixedBonus,
      });
      await load();
    } catch (e: any) {
      setError(e?.message || L('Xatolik yuz berdi', 'Произошла ошибка'));
    } finally {
      setSaving(null);
    }
  };

  const terms = (r: { payType?: string; percentage?: number | null; monthlySalary?: number; isConfigured?: boolean }) => {
    if (!r.isConfigured) return L('Belgilanmagan', 'Не задано');
    const pct = `${r.percentage ?? 0}%`;
    const sal = `${L('oylik', 'оклад')} ${formatUzs(r.monthlySalary || 0, lang)}`;
    return r.payType === 'SALARY' ? sal : r.payType === 'MIXED' ? `${sal} + ${pct}` : pct;
  };

  const totals = (rows || []).reduce((s, r) => ({ collected: s.collected + r.totalCollected, earned: s.earned + r.totalEarned }), { collected: 0, earned: 0 });
  const staffEarned = staff.reduce((s, p) => s + (p.totalEarned || 0), 0);

  const exportCsv = () => {
    if (!rows) return;
    const head = [L('Xodim', 'Сотрудник'), L('Lavozim', 'Должность'), L('Tushum', 'Выручка'), L('Shart', 'Условия'), L('Bonus', 'Бонус'), L("To'lanadi", 'К выплате')];
    const lines = [
      ...rows.map((r) => [r.doctorName, L('Shifokor', 'Врач'), r.totalCollected, terms(r), r.fixedBonus || 0, r.totalEarned]),
      ...staff.map((p) => [p.fullName, p.role, p.collectedAtDesk, terms(p), p.fixedBonus || 0, p.totalEarned]),
    ];
    const csv = [head, ...lines].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `maosh_${month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <AdminLayout allowedRoles={['OWNER']}>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{L('Xodimlar maoshi', 'Зарплата сотрудников')}</h1>
            <p className="max-w-2xl text-sm text-ink-muted">
              {L('Oylik va foiz xodimni qo‘shishda belgilanadi: shifokorlar — ', 'Оклад и процент задаются при добавлении сотрудника: врачи — ')}
              <Link href="/admin/doctors" className="font-medium text-brand-700 hover:underline">{L('Shifokorlar', 'Врачи')}</Link>
              {L(', boshqa xodimlar — ', ', остальные — ')}
              <Link href="/admin/staff" className="font-medium text-brand-700 hover:underline">{L('Xodimlar', 'Сотрудники')}</Link>
              {L('. Bu yerda faqat oylik hisobot va bonus.', '. Здесь только отчёт за месяц и бонус.')}
            </p>
          </div>
          <div className="flex gap-2">
            <input type="month" value={month} max={getClinicTodayDateString().slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} className="h-10 rounded-xl border border-line bg-white px-3 text-sm text-ink" aria-label={L('Oy', 'Месяц')} />
            <button type="button" onClick={exportCsv} disabled={!rows} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm font-semibold text-ink hover:bg-canvas disabled:opacity-50">
              <Download className="h-4 w-4" /> CSV
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-white p-4 shadow-card">
            <p className="text-xs text-ink-subtle">{L('Shifokorlar bo‘yicha tushum', 'Выручка по врачам')}</p>
            <p className="text-xl font-semibold tabular-nums text-ink">{formatUzs(totals.collected, lang)}</p>
          </div>
          <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-4 shadow-card">
            <p className="text-xs text-brand-800">{L("Jami to'lanadigan maosh", 'Итого к выплате')}</p>
            <p className="text-xl font-semibold tabular-nums text-brand-900">{formatUzs(totals.earned + staffEarned, lang)}</p>
          </div>
        </div>

        <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
          {!rows ? (
            <p className="flex items-center gap-2 p-5 text-sm text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> {L('Yuklanmoqda…', 'Загрузка…')}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-canvas text-left text-[11px] uppercase tracking-wider text-ink-subtle">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">{L('Shifokor', 'Врач')}</th>
                    <th className="px-4 py-2.5 text-right font-semibold">{L('Tushum', 'Выручка')}</th>
                    <th className="px-4 py-2.5 text-right font-semibold">{L('Shart', 'Условия')}</th>
                    <th className="px-4 py-2.5 text-right font-semibold">{L('Bonus', 'Бонус')}</th>
                    <th className="px-4 py-2.5 text-right font-semibold">{L("To'lanadi", 'К выплате')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <React.Fragment key={r.doctorId}>
                      <tr>
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => toggle(r.doctorId)} className="flex items-center gap-1.5 text-left font-medium text-ink hover:text-brand-700">
                            {r.doctorId in open ? <ChevronDown className="h-4 w-4 text-ink-subtle" /> : <ChevronRight className="h-4 w-4 text-ink-subtle" />}
                            {r.doctorName}
                          </button>
                          {!r.isConfigured && <p className="ml-6 text-xs text-amber-700">{L('Maosh sharti belgilanmagan', 'Условия оплаты не заданы')}</p>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{formatUzs(r.totalCollected, lang)}</td>
                        <td className="px-4 py-3 text-right text-ink-muted whitespace-nowrap">{terms(r)}</td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            min={0}
                            step={50000}
                            defaultValue={r.fixedBonus || 0}
                            key={`b-${r.doctorId}-${r.fixedBonus}`}
                            disabled={saving === r.doctorId || !r.isConfigured}
                            onBlur={(e) => r.isConfigured && saveRate(r, r.percentage, Math.max(0, Number(e.target.value) || 0))}
                            className="h-8 w-28 rounded-md border border-line px-1.5 text-right tabular-nums disabled:bg-canvas"
                            aria-label={`${r.doctorName} ${L('bonus', 'бонус')}`}
                          />
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink whitespace-nowrap">
                          {saving === r.doctorId ? <Loader2 className="ml-auto h-4 w-4 animate-spin" /> : formatUzs(r.totalEarned, lang)}
                        </td>
                      </tr>
                      {r.doctorId in open && (
                        <tr className="bg-canvas/60">
                          <td colSpan={5} className="px-4 py-3">
                            {open[r.doctorId] === null ? (
                              <Loader2 className="h-4 w-4 animate-spin text-ink-muted" />
                            ) : open[r.doctorId]!.length === 0 ? (
                              <p className="text-xs text-ink-muted">{L("Bu oyda to'lov yo'q.", 'В этом месяце поступлений нет.')}</p>
                            ) : (
                              <ul className="space-y-1 text-xs">
                                {open[r.doctorId]!.map((a: any) => (
                                  <li key={a.appointmentId} className="flex justify-between gap-3">
                                    <span className="text-ink-muted">
                                      {formatClinicDate(a.startTime, lang)} · {a.patientName} · {a.serviceName || '—'}
                                      {a.status === 'PLAN' ? ` · ${L('davolash rejasi', 'план лечения')}` : ''}
                                    </span>
                                    <span className="tabular-nums text-ink">{formatUzs(a.collected, lang)}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        {staff.length > 0 && (
          <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-canvas text-left text-[11px] uppercase tracking-wider text-ink-subtle">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">{L('Boshqa xodimlar', 'Другие сотрудники')}</th>
                    <th className="px-4 py-2.5 text-right font-semibold">{L('Kassada qabul qilgan', 'Принял в кассе')}</th>
                    <th className="px-4 py-2.5 text-right font-semibold">{L('Shart', 'Условия')}</th>
                    <th className="px-4 py-2.5 text-right font-semibold">{L('Bonus', 'Бонус')}</th>
                    <th className="px-4 py-2.5 text-right font-semibold">{L("To'lanadi", 'К выплате')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {staff.map((p) => (
                    <tr key={p.staffUserId}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink">{p.fullName}</p>
                        <p className="text-xs text-ink-subtle">{p.role}</p>
                        {!p.isConfigured && <p className="text-xs text-amber-700">{L('Maosh sharti belgilanmagan', 'Условия оплаты не заданы')}</p>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{formatUzs(p.collectedAtDesk, lang)}</td>
                      <td className="px-4 py-3 text-right text-ink-muted whitespace-nowrap">{terms(p)}</td>
                      <td className="px-4 py-3 text-right">
                        <input
                          type="number"
                          min={0}
                          step={50000}
                          defaultValue={p.fixedBonus || 0}
                          key={`sb-${p.staffUserId}-${p.fixedBonus}`}
                          disabled={saving === p.staffUserId || !p.isConfigured}
                          onBlur={(e) => p.isConfigured && saveStaffBonus(p, Math.max(0, Number(e.target.value) || 0))}
                          className="h-8 w-28 rounded-md border border-line px-1.5 text-right tabular-nums disabled:bg-canvas"
                          aria-label={`${p.fullName} ${L('bonus', 'бонус')}`}
                        />
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink whitespace-nowrap">
                        {saving === p.staffUserId ? <Loader2 className="ml-auto h-4 w-4 animate-spin" /> : formatUzs(p.totalEarned, lang)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        <p className="text-xs text-ink-subtle">
          {L(
            "Davolash rejasidan chiqarilgan hisoblar bo'yicha to'lovlar reja shifokoriga yoziladi. Bonus har oy uchun qo'shiladi.",
            'Оплаты по счетам из плана лечения засчитываются врачу плана. Бонус добавляется за каждый месяц.',
          )}
        </p>
      </div>
    </AdminLayout>
  );
}
