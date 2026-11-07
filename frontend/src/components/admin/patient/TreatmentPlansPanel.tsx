'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Send,
  PenLine,
  Printer,
  Copy,
  Check,
  Trash2,
  XCircle,
  Ban,
  Loader2,
  ClipboardList,
  AlertCircle,
  CheckCircle2,
  Receipt,
} from 'lucide-react';
import { api } from '../../../lib/api';
import { ModalDialog } from '../../ModalDialog';
import { StatusBadge } from '../../ui/StatusBadge';
import { SignaturePad } from './SignaturePad';
import { ITEM_STATUS, PLAN_STATUS, doctorName, formatUzs } from '../../../lib/clinicFormat';

type Props = {
  patientId: string;
  patientName: string;
  lang: 'uz' | 'ru';
  canEdit: boolean;
  clinicName: string;
  onChanged?: () => void;
};

const EDITABLE = ['DRAFT', 'PRESENTED'];

export function TreatmentPlansPanel({ patientId, patientName, lang, canEdit, clinicName, onChanged }: Props) {
  const isRu = lang === 'ru';
  const L = (uz: string, ru: string) => (isRu ? ru : uz);

  const [plans, setPlans] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [services, setServices] = useState<any[]>([]);

  const [newPlanOpen, setNewPlanOpen] = useState(false);
  const [newPlanTitle, setNewPlanTitle] = useState('');
  const [linkInfo, setLinkInfo] = useState<{ url: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [acceptMethod, setAcceptMethod] = useState<'IN_CLINIC_SIGNATURE' | 'VERBAL'>('IN_CLINIC_SIGNATURE');
  const [acceptName, setAcceptName] = useState(patientName);
  const [signature, setSignature] = useState<string | null>(null);
  const [invoiceNote, setInvoiceNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const list = await api.getTreatmentPlans(patientId);
      setPlans(list);
      setActiveId((prev) => (prev && list.some((p) => p.id === prev) ? prev : list[0]?.id || null));
    } catch (e: any) {
      setError(e?.message || L('Rejalarni yuklab bo‘lmadi', 'Не удалось загрузить планы'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!canEdit) return;
    api
      .getAllServicesAdmin()
      .then((list) => setServices((list || []).filter((s: any) => s.isActive !== false && !s.isArchived)))
      .catch(() => {});
  }, [canEdit]);

  const active = useMemo(() => plans.find((p) => p.id === activeId) || null, [plans, activeId]);
  const editable = Boolean(active && canEdit && EDITABLE.includes(active.status));
  const workable = Boolean(active && canEdit && ['ACCEPTED', 'IN_PROGRESS'].includes(active.status));

  const replacePlan = (plan: any) => {
    setPlans((prev) => prev.map((p) => (p.id === plan.id ? plan : p)));
    onChanged?.();
  };

  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      if (res && res.id) replacePlan(res);
      return res;
    } catch (e: any) {
      setError(Array.isArray(e?.message) ? e.message.join(', ') : e?.message || L('Xatolik yuz berdi', 'Произошла ошибка'));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const createPlan = async () => {
    if (newPlanTitle.trim().length < 2) return;
    const plan = await run(() => api.createTreatmentPlan(patientId, { title: newPlanTitle.trim() }));
    if (plan) {
      setPlans((prev) => [plan, ...prev]);
      setActiveId(plan.id);
      setNewPlanOpen(false);
      setNewPlanTitle('');
    }
  };

  const present = async () => {
    if (!active) return;
    const res = await run(() => api.presentTreatmentPlan(active.id));
    if (res) {
      replacePlan(res.plan);
      setLinkInfo({ url: `${window.location.origin}${res.approvalPath}`, expiresAt: res.expiresAt });
      setCopied(false);
    }
  };

  const invoice = async (scope: 'COMPLETED' | 'ALL') => {
    if (!active) return;
    const res = await run(() => api.invoiceTreatmentPlan(active.id, scope));
    if (res?.plan) {
      replacePlan(res.plan);
      setInvoiceNote(
        L(
          `Hisob-faktura yaratildi: ${formatUzs(res.invoice.totalAmount - res.invoice.discount, lang)}. To'lovni "To'lovlar" bo'limida qabul qiling.`,
          `Счёт создан: ${formatUzs(res.invoice.totalAmount - res.invoice.discount, lang)}. Оплату примите во вкладке «Оплаты».`,
        ),
      );
    }
  };

  const accept = async () => {
    if (!active) return;
    const res = await run(() =>
      api.acceptTreatmentPlan(active.id, {
        method: acceptMethod,
        acceptedByName: acceptName.trim(),
        signature: acceptMethod === 'IN_CLINIC_SIGNATURE' ? signature || undefined : undefined,
      }),
    );
    if (res) {
      setAcceptOpen(false);
      setSignature(null);
    }
  };

  // Group items by treatment phase
  const phases = useMemo(() => {
    if (!active) return [] as Array<[number, any[]]>;
    const map = new Map<number, any[]>();
    for (const item of active.items) {
      const list = map.get(item.phase) || [];
      list.push(item);
      map.set(item.phase, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [active]);

  const progress =
    active && active.totals.subtotalUzs > 0 ? Math.round((active.totals.completedUzs / active.totals.subtotalUzs) * 100) : 0;

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-ink-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> {L('Yuklanmoqda…', 'Загрузка…')}
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)] print:block">
      {/* Plan list */}
      <aside className="space-y-2 print:hidden">
        {canEdit && (
          <button
            type="button"
            onClick={() => setNewPlanOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brand-300 bg-brand-50/60 px-3 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50"
          >
            <Plus className="h-4 w-4" />
            {L('Yangi reja', 'Новый план')}
          </button>
        )}
        {plans.length === 0 && (
          <p className="rounded-xl border border-line bg-white p-4 text-sm text-ink-muted">
            {L('Hali davolash rejasi tuzilmagan.', 'План лечения ещё не составлен.')}
          </p>
        )}
        {plans.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setActiveId(p.id);
              setLinkInfo(null);
              setInvoiceNote(null);
            }}
            className={`w-full rounded-xl border p-3 text-left transition-colors ${
              p.id === activeId ? 'border-brand-600 bg-white shadow-soft ring-2 ring-brand-600/10' : 'border-line bg-white hover:border-line-strong'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-semibold text-ink line-clamp-2">{p.title}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <StatusBadge map={PLAN_STATUS} value={p.status} lang={lang} />
              <span className="text-xs font-semibold text-ink tabular-nums">{formatUzs(p.totals.totalUzs, lang)}</span>
            </div>
          </button>
        ))}
      </aside>

      {/* Active plan */}
      {active ? (
        <section className="min-w-0 rounded-2xl border border-line bg-white shadow-card print:border-0 print:shadow-none">
          <header className="flex flex-col gap-3 border-b border-line p-5 sm:flex-row sm:items-start sm:justify-between print:hidden">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold text-ink">{active.title}</h3>
                <StatusBadge map={PLAN_STATUS} value={active.status} lang={lang} />
              </div>
              <p className="mt-1 text-xs text-ink-muted">
                {active.doctor ? `${doctorName(active.doctor, lang)} · ` : ''}
                {new Date(active.createdAt).toLocaleDateString(isRu ? 'ru-RU' : 'uz-UZ')}
                {active.acceptedAt &&
                  ` · ${L('Rozilik', 'Согласие')}: ${new Date(active.acceptedAt).toLocaleDateString(isRu ? 'ru-RU' : 'uz-UZ')} (${
                    active.acceptanceMethod === 'ONLINE'
                      ? L('onlayn', 'онлайн')
                      : active.acceptanceMethod === 'PORTAL'
                        ? L('kabinet orqali', 'в личном кабинете')
                      : active.acceptanceMethod === 'VERBAL'
                        ? L("og'zaki", 'устно')
                        : L('imzo bilan', 'с подписью')
                  })`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] font-medium text-ink hover:bg-canvas"
              >
                <Printer className="h-4 w-4" /> {L('Smeta', 'Смета')}
              </button>
              {canEdit && ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'].includes(active.status) && (
                <>
                  {active.totals.uninvoicedCompletedUzs > 0 && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => invoice('COMPLETED')}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-[13px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      <Receipt className="h-4 w-4" /> {L('Bajarilganiga hisob', 'Счёт за выполненное')} · {formatUzs(active.totals.uninvoicedCompletedUzs, lang)}
                    </button>
                  )}
                  {active.totals.uninvoicedUzs > active.totals.uninvoicedCompletedUzs && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => invoice('ALL')}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand-200 px-3 text-[13px] font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                    >
                      <Receipt className="h-4 w-4" /> {L("To'liq hisob (oldindan)", 'Счёт на весь план')}
                    </button>
                  )}
                </>
              )}
              {editable && (
                <>
                  <button
                    type="button"
                    disabled={busy || active.items.length === 0}
                    onClick={present}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand-200 px-3 text-[13px] font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" /> {L('Bemorga havola', 'Ссылка пациенту')}
                  </button>
                  <button
                    type="button"
                    disabled={busy || active.items.length === 0}
                    onClick={() => {
                      setAcceptName(patientName);
                      setAcceptOpen(true);
                    }}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-[13px] font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    <PenLine className="h-4 w-4" /> {L('Rozilik olish', 'Получить согласие')}
                  </button>
                </>
              )}
            </div>
          </header>

          {error && (
            <div role="alert" className="mx-5 mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 print:hidden">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          {invoiceNote && (
            <div className="mx-5 mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 print:hidden">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {invoiceNote}
            </div>
          )}

          {linkInfo && (
            <div className="mx-5 mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4 print:hidden">
              <p className="text-sm font-semibold text-sky-900">{L('Bemor uchun shaxsiy havola', 'Личная ссылка для пациента')}</p>
              <p className="mt-0.5 text-xs text-sky-800">
                {L(
                  'Bemor havola orqali rejani ko‘rib, onlayn rozilik beradi. Narxni o‘zgartirsangiz havola bekor bo‘ladi.',
                  'Пациент откроет план и подтвердит онлайн. При изменении цен ссылка аннулируется.',
                )}{' '}
                {L('Amal qilish muddati', 'Действует до')}: {new Date(linkInfo.expiresAt).toLocaleDateString(isRu ? 'ru-RU' : 'uz-UZ')}
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input readOnly value={linkInfo.url} className="h-9 min-w-0 flex-1 rounded-lg border border-sky-200 bg-white px-3 font-mono text-xs text-ink" onFocus={(e) => e.target.select()} />
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard?.writeText(linkInfo.url).catch(() => {});
                    setCopied(true);
                  }}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-white px-3 text-[13px] font-semibold text-sky-800 ring-1 ring-sky-200 hover:bg-sky-100"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? L('Nusxalandi', 'Скопировано') : L('Nusxalash', 'Копировать')}
                </button>
                <a
                  href={`https://t.me/share/url?url=${encodeURIComponent(linkInfo.url)}&text=${encodeURIComponent(
                    L(`${clinicName}: davolash rejangiz`, `${clinicName}: ваш план лечения`),
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-sky-600 px-3 text-[13px] font-semibold text-white hover:bg-sky-700"
                >
                  <Send className="h-4 w-4" /> Telegram
                </a>
              </div>
            </div>
          )}

          {/* Printable estimate header */}
          <div className="hidden print:block print:pb-4">
            <p className="text-xl font-bold">{clinicName}</p>
            <p className="mt-1 text-sm">
              {L('Davolash rejasi va narx smetasi', 'План лечения и смета')} — {active.title}
            </p>
            <p className="text-sm">
              {L('Bemor', 'Пациент')}: {patientName}
              {active.doctor ? ` · ${L('Shifokor', 'Врач')}: ${doctorName(active.doctor, lang)}` : ''} · {new Date().toLocaleDateString(isRu ? 'ru-RU' : 'uz-UZ')}
            </p>
          </div>

          {/* Items */}
          <div className="p-5 print:p-0">
            {active.items.length === 0 ? (
              <div className="flex flex-col items-center rounded-xl border border-dashed border-line py-10 text-center">
                <ClipboardList className="h-8 w-8 text-ink-subtle" />
                <p className="mt-2 text-sm text-ink-muted">{L('Rejaga muolaja qo‘shing', 'Добавьте процедуры в план')}</p>
              </div>
            ) : (
              <div className="space-y-5">
                {phases.map(([phase, items]) => (
                  <div key={phase}>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
                      {L(`${phase}-bosqich`, `Этап ${phase}`)}
                    </p>
                    <div className="overflow-x-auto rounded-xl border border-line">
                      <table className="w-full min-w-[620px] text-sm">
                        <thead className="bg-canvas text-left text-[11px] uppercase tracking-wider text-ink-subtle">
                          <tr>
                            <th className="px-3 py-2 font-semibold">{L('Muolaja', 'Процедура')}</th>
                            <th className="px-3 py-2 font-semibold w-16">{L('Tish', 'Зуб')}</th>
                            <th className="px-3 py-2 font-semibold w-16 text-right">{L('Soni', 'Кол.')}</th>
                            <th className="px-3 py-2 font-semibold w-32 text-right">{L('Narx', 'Цена')}</th>
                            <th className="px-3 py-2 font-semibold w-36 text-right">{L('Jami', 'Сумма')}</th>
                            <th className="px-3 py-2 font-semibold w-36 print:hidden">{L('Holat', 'Статус')}</th>
                            {editable && <th className="w-10 print:hidden" />}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {items.map((item: any) => (
                            <tr key={item.id} className={item.status === 'CANCELLED' ? 'text-ink-subtle line-through' : ''}>
                              <td className="px-3 py-2.5">
                                <span className="font-medium text-ink">{isRu ? item.treatmentNameRu || item.treatmentNameUz : item.treatmentNameUz}</span>
                                {item.notes && <span className="block text-xs text-ink-muted">{item.notes}</span>}
                                {item.invoiceId && (
                                  <span className="mt-0.5 inline-block rounded bg-emerald-50 px-1.5 text-[10px] font-semibold text-emerald-700 print:hidden">
                                    {L('Hisoblangan', 'Выставлен счёт')}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 tabular-nums text-ink-muted">{item.toothNumber ?? '—'}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums">
                                {editable ? (
                                  <input
                                    type="number"
                                    min={1}
                                    max={99}
                                    defaultValue={item.quantity}
                                    onBlur={(e) => {
                                      const v = Number(e.target.value);
                                      if (v >= 1 && v !== item.quantity) run(() => api.updateTreatmentPlanItem(item.id, { quantity: v }));
                                    }}
                                    className="h-8 w-14 rounded-md border border-line px-1.5 text-right"
                                    aria-label={L('Soni', 'Количество')}
                                  />
                                ) : (
                                  item.quantity
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                                {editable ? (
                                  <input
                                    type="number"
                                    min={0}
                                    step={1000}
                                    defaultValue={item.unitPriceUzs}
                                    onBlur={(e) => {
                                      const v = Number(e.target.value);
                                      if (v >= 0 && v !== item.unitPriceUzs) run(() => api.updateTreatmentPlanItem(item.id, { unitPriceUzs: v }));
                                    }}
                                    className="h-8 w-28 rounded-md border border-line px-1.5 text-right"
                                    aria-label={L('Narx', 'Цена')}
                                  />
                                ) : (
                                  formatUzs(item.unitPriceUzs, lang)
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-ink whitespace-nowrap">{formatUzs(item.costUzs, lang)}</td>
                              <td className="px-3 py-2.5 print:hidden">
                                {workable && item.status !== 'CANCELLED' ? (
                                  <select
                                    value={item.status}
                                    disabled={busy}
                                    onChange={(e) => run(() => api.updateTreatmentPlanItem(item.id, { status: e.target.value }))}
                                    className="h-8 rounded-md border border-line bg-white px-2 text-xs"
                                    aria-label={L('Holat', 'Статус')}
                                  >
                                    {['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((s) => (
                                      <option key={s} value={s}>
                                        {isRu ? ITEM_STATUS[s].ru : ITEM_STATUS[s].uz}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <StatusBadge map={ITEM_STATUS} value={item.status} lang={lang} />
                                )}
                              </td>
                              {editable && (
                                <td className="px-2 print:hidden">
                                  <button
                                    type="button"
                                    onClick={() => run(() => api.deleteTreatmentPlanItem(item.id))}
                                    className="rounded-md p-1.5 text-ink-subtle hover:bg-rose-50 hover:text-rose-600"
                                    aria-label={L("O'chirish", 'Удалить')}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {editable && <AddItemForm services={services} lang={lang} busy={busy} onAdd={(payload) => run(() => api.addTreatmentPlanItem(active.id, payload))} />}

            {/* Totals */}
            <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="w-full max-w-xs print:hidden">
                {['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'].includes(active.status) && (
                  <>
                    <div className="flex justify-between text-xs text-ink-muted">
                      <span>{L('Bajarildi', 'Выполнено')}</span>
                      <span className="tabular-nums">{progress}%</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-canvas">
                      <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  </>
                )}
              </div>
              <dl className="w-full space-y-1.5 text-sm sm:w-72">
                <div className="flex justify-between text-ink-muted">
                  <dt>{L('Jami', 'Итого')}</dt>
                  <dd className="tabular-nums">{formatUzs(active.totals.subtotalUzs, lang)}</dd>
                </div>
                <div className="flex items-center justify-between text-ink-muted">
                  <dt>{L('Chegirma', 'Скидка')}</dt>
                  <dd className="tabular-nums">
                    {editable ? (
                      <input
                        type="number"
                        min={0}
                        step={1000}
                        defaultValue={active.discountUzs}
                        key={`d-${active.id}-${active.discountUzs}`}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v >= 0 && v !== active.discountUzs) run(() => api.updateTreatmentPlan(active.id, { discountUzs: v }));
                        }}
                        className="h-8 w-28 rounded-md border border-line px-1.5 text-right print:border-0"
                        aria-label={L('Chegirma', 'Скидка')}
                      />
                    ) : (
                      `− ${formatUzs(active.totals.discountUzs, lang)}`
                    )}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-line pt-2 text-base font-semibold text-ink">
                  <dt>{L("To'lov uchun", 'К оплате')}</dt>
                  <dd className="tabular-nums">{formatUzs(active.totals.totalUzs, lang)}</dd>
                </div>
                {active.acceptedTotalUzs != null && active.acceptedTotalUzs !== active.totals.totalUzs && (
                  <p className="text-right text-xs text-ink-subtle">
                    {L('Rozilik berilgan summa', 'Согласованная сумма')}: {formatUzs(active.acceptedTotalUzs, lang)}
                  </p>
                )}
              </dl>
            </div>

            <div className="mt-8 hidden grid-cols-2 gap-10 text-sm print:grid">
              <div className="border-t border-black pt-1">{L('Shifokor imzosi', 'Подпись врача')}</div>
              <div className="border-t border-black pt-1">{L('Bemor imzosi', 'Подпись пациента')}</div>
            </div>

            {/* Secondary actions */}
            {canEdit && !['COMPLETED', 'CANCELLED', 'DECLINED'].includes(active.status) && (
              <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-line pt-4 print:hidden">
                {EDITABLE.includes(active.status) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const reason = window.prompt(L('Rad etish sababi (ixtiyoriy)', 'Причина отказа (необязательно)')) ?? undefined;
                      run(() => api.declineTreatmentPlan(active.id, reason || undefined));
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-ink-muted hover:bg-canvas hover:text-ink"
                  >
                    <XCircle className="h-4 w-4" /> {L('Bemor rad etdi', 'Пациент отказался')}
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(L('Rejani bekor qilasizmi?', 'Отменить план?'))) run(() => api.cancelTreatmentPlan(active.id));
                  }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                >
                  <Ban className="h-4 w-4" /> {L('Rejani bekor qilish', 'Отменить план')}
                </button>
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-line bg-white p-8 text-center text-sm text-ink-muted">
          {canEdit ? L('Chapdan reja tanlang yoki yangisini yarating.', 'Выберите план слева или создайте новый.') : L('Rejalar yo‘q.', 'Планов нет.')}
        </section>
      )}

      <ModalDialog isOpen={newPlanOpen} onClose={() => setNewPlanOpen(false)} title={L('Yangi davolash rejasi', 'Новый план лечения')} size="sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createPlan();
          }}
          className="space-y-4"
        >
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink">{L('Reja nomi', 'Название плана')}</span>
            <input
              autoFocus
              value={newPlanTitle}
              onChange={(e) => setNewPlanTitle(e.target.value)}
              placeholder={L('Masalan: Kompleks davolash va implant', 'Например: Комплексное лечение и имплант')}
              className="h-10 w-full rounded-xl border border-line px-3 text-sm focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/10"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setNewPlanOpen(false)} className="h-9 rounded-lg px-3 text-sm font-medium text-ink-muted hover:bg-canvas">
              {L('Bekor', 'Отмена')}
            </button>
            <button type="submit" disabled={busy || newPlanTitle.trim().length < 2} className="h-9 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {L('Yaratish', 'Создать')}
            </button>
          </div>
        </form>
      </ModalDialog>

      <ModalDialog
        isOpen={acceptOpen}
        onClose={() => setAcceptOpen(false)}
        title={L('Bemor roziligini qayd etish', 'Зафиксировать согласие пациента')}
        description={active ? `${active.title} — ${formatUzs(active.totals.totalUzs, lang)}` : undefined}
        size="md"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-canvas p-1">
            {(['IN_CLINIC_SIGNATURE', 'VERBAL'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setAcceptMethod(m)}
                className={`h-9 rounded-lg text-[13px] font-semibold ${acceptMethod === m ? 'bg-white text-ink shadow-soft' : 'text-ink-muted'}`}
              >
                {m === 'IN_CLINIC_SIGNATURE' ? L('Ekranda imzo', 'Подпись на экране') : L("Og'zaki rozilik", 'Устное согласие')}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink">{L('Rozilik bergan shaxs F.I.Sh.', 'ФИО давшего согласие')}</span>
            <input
              value={acceptName}
              onChange={(e) => setAcceptName(e.target.value)}
              className="h-10 w-full rounded-xl border border-line px-3 text-sm focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/10"
            />
          </label>
          {acceptMethod === 'IN_CLINIC_SIGNATURE' ? (
            <SignaturePad onChange={setSignature} label={L('Bemor imzosi', 'Подпись пациента')} clearLabel={L('Tozalash', 'Очистить')} />
          ) : (
            <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
              {L(
                "Og'zaki rozilik sizning nomingizdan audit jurnaliga yoziladi. Imkon bo'lsa, imzo yoki onlayn havoladan foydalaning.",
                'Устное согласие записывается в журнал аудита от вашего имени. По возможности используйте подпись или онлайн-ссылку.',
              )}
            </p>
          )}
          <p className="text-xs text-ink-muted">
            {L(
              "Rozilikdan so'ng narxlar qulflanadi, muolajalarni boshlash mumkin bo'ladi.",
              'После согласия цены фиксируются, можно начинать лечение.',
            )}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAcceptOpen(false)} className="h-9 rounded-lg px-3 text-sm font-medium text-ink-muted hover:bg-canvas">
              {L('Bekor', 'Отмена')}
            </button>
            <button
              type="button"
              disabled={busy || acceptName.trim().length < 2 || (acceptMethod === 'IN_CLINIC_SIGNATURE' && !signature)}
              onClick={accept}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" /> {L('Tasdiqlash', 'Подтвердить')}
            </button>
          </div>
        </div>
      </ModalDialog>
    </div>
  );
}

function AddItemForm({
  services,
  lang,
  busy,
  onAdd,
}: {
  services: any[];
  lang: 'uz' | 'ru';
  busy: boolean;
  onAdd: (payload: Record<string, unknown>) => Promise<any>;
}) {
  const isRu = lang === 'ru';
  const L = (uz: string, ru: string) => (isRu ? ru : uz);
  const [serviceId, setServiceId] = useState('');
  const [name, setName] = useState('');
  const [tooth, setTooth] = useState('');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [phase, setPhase] = useState('1');

  const pickService = (id: string) => {
    setServiceId(id);
    const s = services.find((x) => x.id === id);
    if (s) {
      setName(isRu ? s.nameRu || s.nameUz : s.nameUz);
      setPrice(String(Math.round((s.priceFrom ?? 0) / 100)));
    }
  };

  const toothNum = tooth ? Number(tooth) : undefined;
  const toothValid = toothNum === undefined || (toothNum >= 11 && toothNum <= 85 && toothNum % 10 >= 1 && toothNum % 10 <= 8);
  const canSubmit = !busy && (serviceId || name.trim().length >= 2) && price !== '' && Number(price) >= 0 && toothValid;

  const submit = async () => {
    if (!canSubmit) return;
    const res = await onAdd({
      serviceId: serviceId || undefined,
      // Catalog items take both language names from the service; free-text items use what was typed
      treatmentNameUz: serviceId ? undefined : name.trim(),
      treatmentNameRu: !serviceId && isRu ? name.trim() : undefined,
      toothNumber: toothNum,
      quantity: Number(qty) || 1,
      unitPriceUzs: Number(price),
      phase: Number(phase) || 1,
    });
    if (res) {
      setServiceId('');
      setName('');
      setTooth('');
      setQty('1');
      setPrice('');
    }
  };

  const field = 'h-9 rounded-lg border border-line bg-white px-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/10';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="mt-5 rounded-xl border border-line bg-canvas/60 p-3 print:hidden"
    >
      <p className="mb-2 text-[12px] font-semibold text-ink">{L("Muolaja qo'shish", 'Добавить процедуру')}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
        <select value={serviceId} onChange={(e) => pickService(e.target.value)} className={`${field} col-span-2 sm:col-span-5`} aria-label={L('Xizmat', 'Услуга')}>
          <option value="">{L('Katalogdan tanlang…', 'Выбрать из каталога…')}</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {isRu ? s.nameRu || s.nameUz : s.nameUz}
            </option>
          ))}
        </select>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={L('yoki nomini yozing', 'или введите название')} className={`${field} col-span-2 sm:col-span-7`} />
        <input
          value={tooth}
          onChange={(e) => setTooth(e.target.value.replace(/\D/g, '').slice(0, 2))}
          placeholder={L('Tish', 'Зуб')}
          inputMode="numeric"
          className={`${field} sm:col-span-2 ${toothValid ? '' : 'border-rose-400'}`}
          aria-label={L('Tish raqami (FDI)', 'Номер зуба (FDI)')}
        />
        <input value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, '').slice(0, 2))} inputMode="numeric" placeholder={L('Soni', 'Кол.')} className={`${field} sm:col-span-2`} aria-label={L('Soni', 'Количество')} />
        <input value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder={L('Narx', 'Цена')} className={`${field} sm:col-span-3`} aria-label={L("Narx (so'm)", 'Цена (сум)')} />
        <select value={phase} onChange={(e) => setPhase(e.target.value)} className={`${field} sm:col-span-2`} aria-label={L('Bosqich', 'Этап')}>
          {[1, 2, 3, 4, 5].map((p) => (
            <option key={p} value={p}>
              {L(`${p}-bosqich`, `Этап ${p}`)}
            </option>
          ))}
        </select>
        <button type="submit" disabled={!canSubmit} className="col-span-2 sm:col-span-3 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-ink px-3 text-[13px] font-semibold text-white hover:bg-ink/90 disabled:opacity-40">
          <Plus className="h-4 w-4" /> {L("Qo'shish", 'Добавить')}
        </button>
      </div>
    </form>
  );
}
