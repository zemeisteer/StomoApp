'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  CalendarCheck2,
  CircleDollarSign,
  Clock,
  Loader2,
  Receipt,
  UserPlus,
  UserX,
  Wallet,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { doctorName, formatUzs } from '../../lib/clinicFormat';
import { getClinicTodayDateString } from '../../lib/dateFormat';

type Lang = 'uz' | 'ru';
type Preset = 'today' | 'week' | 'month' | 'lastMonth' | 'year' | 'custom';

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function rangeFor(preset: Preset, today: string): { from: string; to: string } {
  const [y, m] = today.split('-').map(Number);
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'week':
      return { from: addDays(today, -6), to: today };
    case 'month':
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case 'lastMonth': {
      const first = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
      const last = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
      return { from: first, to: last };
    }
    case 'year':
      return { from: `${y}-01-01`, to: today };
    default:
      return { from: today, to: today };
  }
}

/** Compact so'm for axis labels: 1.2 mln, 350 ming. */
function shortUzs(v: number, lang: Lang) {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)} ${lang === 'ru' ? 'млн' : 'mln'}`;
  if (Math.abs(v) >= 1000) return `${Math.round(v / 1000)} ${lang === 'ru' ? 'тыс' : 'ming'}`;
  return String(v);
}

export function ClinicDashboard({ lang }: { lang: Lang }) {
  const L = (uz: string, ru: string) => (lang === 'ru' ? ru : uz);
  const today = getClinicTodayDateString();
  const [preset, setPreset] = useState<Preset>('month');
  const [custom, setCustom] = useState({ from: addDays(today, -29), to: today });
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  // A branch-bound admin always sees their own branch (the server enforces this as well)
  const lockedBranch = user?.role !== 'OWNER' ? user?.branchId || '' : '';
  const [branchId, setBranchId] = useState('');
  const [branchList, setBranchList] = useState<any[]>([]);

  useEffect(() => {
    api
      .getBranches()
      .then((rows: any[]) => setBranchList((rows || []).filter((b) => b.isActive !== false)))
      .catch(() => {});
  }, []);

  const range = preset === 'custom' ? custom : rangeFor(preset, today);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.getDashboardSummary(range.from, range.to, branchId || undefined));
    } catch (e: any) {
      setError(e?.message || L("Ma'lumotlarni yuklab bo'lmadi", 'Не удалось загрузить данные'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, branchId]);

  useEffect(() => {
    load();
  }, [load]);

  const presets: Array<[Preset, string]> = [
    ['today', L('Bugun', 'Сегодня')],
    ['week', L('7 kun', '7 дней')],
    ['month', L('Shu oy', 'Этот месяц')],
    ['lastMonth', L("O'tgan oy", 'Прошлый месяц')],
    ['year', L('Shu yil', 'Этот год')],
    ['custom', L('Boshqa davr', 'Период')],
  ];

  return (
    <div className="space-y-5">
      {/* Period filter: one row above everything it controls */}
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-3 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label={L('Davr', 'Период')}>
          {presets.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={preset === key}
              onClick={() => setPreset(key)}
              className={`h-8 rounded-lg px-3 text-[13px] font-medium transition-colors ${
                preset === key ? 'bg-brand-600 text-white' : 'text-ink-muted hover:bg-canvas hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {preset === 'custom' ? (
          <div className="flex items-center gap-2 text-sm">
            <input type="date" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} className="h-8 rounded-lg border border-line px-2" aria-label={L('Boshlanish', 'С')} />
            <span className="text-ink-subtle">—</span>
            <input type="date" value={custom.to} min={custom.from} max={today} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} className="h-8 rounded-lg border border-line px-2" aria-label={L('Tugash', 'По')} />
          </div>
        ) : (
          <p className="px-1 text-xs text-ink-subtle tabular-nums">
            {range.from === range.to ? range.from : `${range.from} — ${range.to}`}
            {loading && <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin" />}
          </p>
        )}
      </div>

      {branchList.length > 1 && !lockedBranch && (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={L('Filial', 'Филиал')}>
          {[{ id: '', nameUz: 'Barcha filiallar', nameRu: 'Все филиалы' }, ...branchList].map((b) => (
            <button
              key={b.id || 'all'}
              type="button"
              role="tab"
              aria-selected={branchId === b.id}
              onClick={() => setBranchId(b.id)}
              className={`h-8 rounded-full px-3.5 text-[13px] font-medium transition-colors ${
                branchId === b.id ? 'bg-ink text-white' : 'border border-line bg-white text-ink-muted hover:text-ink'
              }`}
            >
              {lang === 'ru' && b.nameRu ? b.nameRu : b.nameUz}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      )}

      {!data ? (
        <div className="flex items-center gap-2 p-8 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> {L('Yuklanmoqda…', 'Загрузка…')}
        </div>
      ) : (
        <div className={`space-y-5 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {/* Headline numbers */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi icon={Wallet} label={L('Tushum (kassa)', 'Выручка (касса)')} value={formatUzs(data.money.collectedUzs, lang)} hint={data.money.refundsUzs ? `${L('qaytarilgan', 'возвраты')}: ${formatUzs(data.money.refundsUzs, lang)}` : undefined} emphasis />
            <Kpi icon={Receipt} label={L('Hisob chiqarildi', 'Выставлено счетов')} value={formatUzs(data.money.billedUzs, lang)} />
            <Kpi icon={CircleDollarSign} label={L('Bemorlar qarzi (jami)', 'Долг пациентов (всего)')} value={formatUzs(data.money.outstandingUzs, lang)} tone={data.money.outstandingUzs > 0 ? 'warning' : undefined} href="/admin/cashier" />
            <Kpi icon={Wallet} label={L("O'rtacha chek", 'Средний чек')} value={formatUzs(data.money.averageCheckUzs, lang)} />
            <Kpi icon={CalendarCheck2} label={L('Yakunlangan tashriflar', 'Завершённые визиты')} value={String(data.visits.completed)} hint={`${L('jami yozuvlar', 'всего записей')}: ${data.visits.total}`} />
            <Kpi icon={UserPlus} label={L('Yangi bemorlar', 'Новые пациенты')} value={String(data.patients.new)} hint={`${L('xizmat ko‘rsatildi', 'обслужено')}: ${data.patients.served} · ${L('bazada', 'в базе')}: ${data.patients.total}`} href="/admin/patients" />
            <Kpi icon={UserX} label={L('Kelmaganlar', 'Неявки')} value={`${data.visits.noShow}`} hint={`${data.visits.noShowRate}% ${L('yakunlanganlardan', 'от завершённых')}`} tone={data.visits.noShowRate >= 15 ? 'warning' : undefined} />
            <Kpi icon={Clock} label={L('Tasdiq kutmoqda', 'Ждут подтверждения')} value={String(data.visits.pendingApprovalsNow)} tone={data.visits.pendingApprovalsNow > 0 ? 'warning' : undefined} href="/admin/calendar" />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <section className="rounded-2xl border border-line bg-white p-5 shadow-card lg:col-span-2">
              <h2 className="text-sm font-semibold text-ink">{L('Kunlik tushum', 'Выручка по дням')}</h2>
              <p className="text-xs text-ink-subtle">{L("Kassaga tushgan pul, qaytarishlar ayrilgan", 'Поступления в кассу за вычетом возвратов')}</p>
              <RevenueBars series={data.series} lang={lang} />
            </section>

            <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
              <h2 className="mb-3 text-sm font-semibold text-ink">{L("To'lov usullari", 'Способы оплаты')}</h2>
              <MethodBreakdown byMethod={data.money.byMethod} total={data.money.collectedUzs} lang={lang} />
            </section>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ink">{L('Ommabop xizmatlar', 'Популярные услуги')}</h2>
                <Link href="/admin/services" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
                  {L('Xizmatlar', 'Услуги')} <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <RankList
                empty={L('Bu davrda yakunlangan xizmat yo‘q', 'За период нет выполненных услуг')}
                rows={data.topServices.map((s: any) => ({
                  key: s.nameUz,
                  label: lang === 'ru' ? s.nameRu || s.nameUz : s.nameUz,
                  value: s.count,
                  sub: formatUzs(s.valueUzs, lang),
                  display: `${s.count}×`,
                }))}
              />
            </section>
            <section className="rounded-2xl border border-line bg-white p-5 shadow-card">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ink">{L('Shifokorlar', 'Врачи')}</h2>
                <Link href="/admin/payroll" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
                  {L('Maosh', 'Зарплата')} <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <RankList
                empty={L("Bu davrda ma'lumot yo‘q", 'За период нет данных')}
                rows={data.topDoctors.map((d: any) => ({
                  key: d.id,
                  label: doctorName(d, lang),
                  value: d.collectedUzs,
                  sub: `${d.visits} ${L('tashrif', 'визитов')}`,
                  display: formatUzs(d.collectedUzs, lang),
                }))}
              />
            </section>
          </div>
          {!branchId && data.branches?.length > 1 && (
            <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
              <h2 className="px-5 pt-4 text-sm font-semibold text-ink">{L('Filiallar bo‘yicha', 'По филиалам')}</h2>
              <div className="overflow-x-auto">
                <table className="mt-2 w-full min-w-[520px] text-sm">
                  <thead className="text-left text-[11px] uppercase tracking-wider text-ink-subtle">
                    <tr>
                      <th className="px-5 py-2 font-semibold">{L('Filial', 'Филиал')}</th>
                      <th className="px-5 py-2 text-right font-semibold">{L('Tushum', 'Выручка')}</th>
                      <th className="px-5 py-2 text-right font-semibold">{L('Yakunlangan qabul', 'Завершённые приёмы')}</th>
                      <th className="px-5 py-2 text-right font-semibold">{L('Yangi bemorlar', 'Новые пациенты')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.branches.map((b: any) => (
                      <tr key={b.id} className="cursor-pointer hover:bg-canvas" onClick={() => setBranchId(b.id)}>
                        <td className="px-5 py-3 font-medium text-ink">{lang === 'ru' && b.nameRu ? b.nameRu : b.nameUz}</td>
                        <td className="px-5 py-3 text-right tabular-nums">{formatUzs(b.collectedUzs, lang)}</td>
                        <td className="px-5 py-3 text-right tabular-nums">{b.completed}</td>
                        <td className="px-5 py-3 text-right tabular-nums">{b.newPatients}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  emphasis,
  href,
}: {
  icon: any;
  label: string;
  value: string;
  hint?: string;
  tone?: 'warning';
  emphasis?: boolean;
  href?: string;
}) {
  const body = (
    <div
      className={`h-full rounded-2xl border p-4 shadow-card transition-colors ${
        emphasis ? 'border-brand-200 bg-brand-50/70' : 'border-line bg-white'
      } ${href ? 'hover:border-line-strong' : ''}`}
    >
      <p className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
        <Icon className={`h-3.5 w-3.5 ${tone === 'warning' ? 'text-amber-600' : 'text-brand-600'}`} /> {label}
      </p>
      <p className={`mt-1.5 truncate text-xl font-semibold tabular-nums tracking-tight ${tone === 'warning' ? 'text-amber-700' : 'text-ink'}`}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-ink-subtle">{hint}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 rounded-2xl">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Single-series bar chart: one brand hue, thin bars, recessive grid, per-bar hover tooltip. */
function RevenueBars({ series, lang }: { series: Array<{ date: string; revenue: number; visits: number }>; lang: Lang }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...series.map((d) => d.revenue), 0);
  const niceMax = useMemo(() => {
    if (max <= 0) return 1;
    const pow = 10 ** Math.floor(Math.log10(max));
    return Math.ceil(max / pow) * pow;
  }, [max]);
  const W = 640;
  const H = 200;
  const padL = 64;
  const padB = 22;
  const plotW = W - padL - 4;
  const plotH = H - padB - 8;
  const n = series.length;
  const slot = plotW / Math.max(n, 1);
  const barW = Math.max(2, Math.min(28, slot - 2));
  const ticks = [0, 0.5, 1].map((f) => Math.round(niceMax * f));
  const labelEvery = Math.ceil(n / 8);
  const fmtDay = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;

  if (max <= 0) {
    return <p className="flex h-40 items-center justify-center text-sm text-ink-subtle">{lang === 'ru' ? 'За период поступлений нет' : "Bu davrda tushum yo'q"}</p>;
  }

  return (
    <div className="relative mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={lang === 'ru' ? 'Выручка по дням' : 'Kunlik tushum'}>
        {ticks.map((t) => {
          const y = 8 + plotH - (t / niceMax) * plotH;
          return (
            <g key={t}>
              <line x1={padL} x2={W} y1={y} y2={y} stroke="rgb(var(--line))" strokeWidth={1} />
              <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="10" fill="rgb(var(--ink-subtle))">
                {shortUzs(t, lang)}
              </text>
            </g>
          );
        })}
        {series.map((d, i) => {
          const h = (Math.max(0, d.revenue) / niceMax) * plotH;
          const x = padL + i * slot + (slot - barW) / 2;
          const y = 8 + plotH - h;
          const r = Math.min(4, barW / 2, h);
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {/* Hit target taller and wider than the mark */}
              <rect x={padL + i * slot} y={8} width={slot} height={plotH} fill="transparent" />
              {h > 0 && (
                // Rounded data-end, square baseline
                <path
                  d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${y + h} Z`}
                  fill={`rgb(var(--brand-${hover === i ? '700' : '600'}))`}
                />
              )}
              {(i % labelEvery === 0 || i === n - 1) && (
                <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="rgb(var(--ink-subtle))">
                  {fmtDay(d.date)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs shadow-popover"
          style={{ left: `${((padL + hover * slot + slot / 2) / W) * 100}%`, top: 0 }}
        >
          <p className="font-medium text-ink">{fmtDay(series[hover].date)}</p>
          <p className="tabular-nums text-ink">{formatUzs(series[hover].revenue, lang)}</p>
          <p className="text-ink-muted">
            {series[hover].visits} {lang === 'ru' ? 'визитов' : 'tashrif'}
          </p>
        </div>
      )}
      {/* Table view for screen readers */}
      <table className="sr-only">
        <caption>{lang === 'ru' ? 'Выручка по дням' : 'Kunlik tushum'}</caption>
        <tbody>
          {series.map((d) => (
            <tr key={d.date}>
              <th scope="row">{d.date}</th>
              <td>{d.revenue}</td>
              <td>{d.visits}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const METHOD_NAMES: Record<string, [string, string]> = {
  CASH: ['Naqd', 'Наличные'],
  CARD: ['Karta', 'Карта'],
  TRANSFER: ["O'tkazma", 'Перевод'],
  PAYME: ['Payme', 'Payme'],
  CLICK: ['Click', 'Click'],
  OTHER: ['Boshqa', 'Другое'],
};

/** Shares as labeled horizontal bars in one hue (magnitude, not identity). */
function MethodBreakdown({ byMethod, total, lang }: { byMethod: Record<string, number>; total: number; lang: Lang }) {
  const rows = Object.entries(byMethod)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  if (!rows.length || total <= 0) return <p className="text-sm text-ink-subtle">{lang === 'ru' ? 'Нет оплат' : "To'lov yo'q"}</p>;
  return (
    <ul className="space-y-3">
      {rows.map(([m, v]) => {
        const pct = Math.round((v / total) * 100);
        return (
          <li key={m}>
            <div className="flex justify-between text-sm">
              <span className="text-ink">{(METHOD_NAMES[m] || [m, m])[lang === 'ru' ? 1 : 0]}</span>
              <span className="tabular-nums text-ink-muted">
                {formatUzs(v, lang)} · {pct}%
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-canvas">
              <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.max(2, pct)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function RankList({ rows, empty }: { rows: Array<{ key: string; label: string; value: number; sub: string; display: string }>; empty: string }) {
  if (!rows.length) return <p className="text-sm text-ink-subtle">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-ink">{r.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-ink">{r.display}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
            </div>
            <span className="shrink-0 text-[11px] text-ink-subtle">{r.sub}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
