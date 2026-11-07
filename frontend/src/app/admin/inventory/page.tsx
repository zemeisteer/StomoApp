'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, AlertTriangle, History, Loader2, Minus, Package, Plus, Search } from 'lucide-react';
import { AdminLayout } from '../../../components/AdminLayout';
import { ModalDialog } from '../../../components/ModalDialog';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useI18n } from '../../../lib/i18n';
import { formatClinicDate } from '../../../lib/dateFormat';
import { formatUzs } from '../../../lib/clinicFormat';

const CATEGORIES: Record<string, { uz: string; ru: string }> = {
  anesthetic: { uz: 'Anestetik', ru: 'Анестетики' },
  composite: { uz: 'Plomba materiali', ru: 'Пломбировочные' },
  implant: { uz: 'Implant', ru: 'Импланты' },
  endo: { uz: 'Endodontiya', ru: 'Эндодонтия' },
  consumable: { uz: 'Sarf materiali', ru: 'Расходники' },
  other: { uz: 'Boshqa', ru: 'Другое' },
};
const MOVE_LABEL: Record<string, { uz: string; ru: string }> = {
  RESTOCK: { uz: 'Kirim', ru: 'Приход' },
  USAGE: { uz: 'Sarf', ru: 'Расход' },
  ADJUSTMENT: { uz: 'Tuzatish', ru: 'Корректировка' },
  RETURN: { uz: 'Qaytarish', ru: 'Возврат' },
};

const field = 'h-10 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/10';

export default function InventoryPage() {
  const { user } = useAuth();
  const { language } = useI18n();
  const lang: 'uz' | 'ru' = language === 'ru' ? 'ru' : 'uz';
  const L = (uz: string, ru: string) => (lang === 'ru' ? ru : uz);
  const canManage = Boolean(user && ['OWNER', 'ADMIN'].includes(user.role));
  const canMove = Boolean(user && ['OWNER', 'ADMIN', 'DOCTOR'].includes(user.role));

  const [items, setItems] = useState<any[] | null>(null);
  const [query, setQuery] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [move, setMove] = useState<{ item: any; type: 'RESTOCK' | 'USAGE' } | null>(null);
  const [history, setHistory] = useState<{ item: any; rows: any[] | null } | null>(null);
  const [editing, setEditing] = useState<any | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setItems(await api.getInventoryItems());
    } catch (e: any) {
      setError(e?.message || L("Ma'lumotlarni yuklab bo'lmadi", 'Не удалось загрузить данные'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const low = (i: any) => i.quantity <= i.minThreshold;
  const filtered = useMemo(
    () =>
      (items || []).filter(
        (i) => (!onlyLow || low(i)) && (!query.trim() || i.name.toLowerCase().includes(query.trim().toLowerCase())),
      ),
    [items, onlyLow, query],
  );
  const lowCount = (items || []).filter(low).length;
  const stockValue = (items || []).reduce((s, i) => s + i.quantity * (i.unitCost || 0), 0);

  const openHistory = async (item: any) => {
    setHistory({ item, rows: null });
    try {
      setHistory({ item, rows: await api.getInventoryMovements(item.id) });
    } catch (e: any) {
      setError(e?.message || L('Xatolik yuz berdi', 'Произошла ошибка'));
      setHistory(null);
    }
  };

  return (
    <AdminLayout allowedRoles={['OWNER', 'ADMIN', 'DOCTOR', 'RECEPTION']}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{L('Ombor', 'Склад')}</h1>
            <p className="text-sm text-ink-muted">{L('Materiallar qoldig‘i, kirim va sarf', 'Остатки материалов, приход и расход')}</p>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => setEditing({ name: '', category: 'consumable', unit: 'dona', quantity: 0, minThreshold: 10, unitCost: 0 })}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <Plus className="h-4 w-4" /> {L('Mahsulot qo‘shish', 'Добавить позицию')}
            </button>
          )}
        </div>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat icon={Package} label={L('Mahsulotlar', 'Позиций')} value={String(items?.length ?? '—')} />
          <Stat icon={AlertTriangle} label={L('Kam qolgan', 'Заканчиваются')} value={String(lowCount)} tone={lowCount > 0 ? 'warning' : 'default'} />
          <Stat icon={Package} label={L('Ombor qiymati', 'Стоимость склада')} value={formatUzs(stockValue, lang)} />
        </div>

        <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
          <div className="flex flex-col gap-2 border-b border-line p-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={L('Qidirish…', 'Поиск…')} className={`${field} pl-9`} />
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} className="h-4 w-4 accent-brand-600" />
              {L('Faqat kam qolganlar', 'Только заканчивающиеся')}
            </label>
          </div>

          {!items ? (
            <p className="flex items-center gap-2 p-5 text-sm text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> {L('Yuklanmoqda…', 'Загрузка…')}
            </p>
          ) : filtered.length === 0 ? (
            <p className="p-5 text-sm text-ink-muted">{L('Mahsulot topilmadi.', 'Ничего не найдено.')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-canvas text-left text-[11px] uppercase tracking-wider text-ink-subtle">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">{L('Nomi', 'Название')}</th>
                    <th className="px-4 py-2.5 font-semibold">{L('Turi', 'Категория')}</th>
                    <th className="px-4 py-2.5 text-right font-semibold">{L('Qoldiq', 'Остаток')}</th>
                    <th className="px-4 py-2.5 text-right font-semibold">{L('Min.', 'Мин.')}</th>
                    <th className="px-4 py-2.5 text-right font-semibold">{L('Narxi', 'Цена')}</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {filtered.map((i) => (
                    <tr key={i.id} className={low(i) ? 'bg-amber-50/50' : ''}>
                      <td className="px-4 py-3">
                        <button type="button" onClick={() => (canManage ? setEditing(i) : undefined)} className="text-left font-medium text-ink hover:text-brand-700">
                          {i.name}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-ink-muted">{(CATEGORIES[i.category] || { uz: i.category, ru: i.category })[lang]}</td>
                      <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">
                        <span className={`font-semibold ${low(i) ? 'text-amber-700' : 'text-ink'}`}>{i.quantity}</span> <span className="text-ink-subtle">{i.unit}</span>
                        {low(i) && <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-amber-600" aria-label={L('Kam qolgan', 'Заканчивается')} />}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink-muted">{i.minThreshold}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-ink-muted whitespace-nowrap">{i.unitCost ? formatUzs(i.unitCost, lang) : '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          {canMove && (
                            <>
                              <button type="button" onClick={() => setMove({ item: i, type: 'USAGE' })} className="inline-flex h-8 items-center gap-1 rounded-lg border border-line px-2.5 text-xs font-semibold text-ink hover:bg-canvas" title={L('Sarf', 'Расход')}>
                                <Minus className="h-3.5 w-3.5" /> {L('Sarf', 'Расход')}
                              </button>
                              <button type="button" onClick={() => setMove({ item: i, type: 'RESTOCK' })} className="inline-flex h-8 items-center gap-1 rounded-lg border border-brand-200 px-2.5 text-xs font-semibold text-brand-700 hover:bg-brand-50" title={L('Kirim', 'Приход')}>
                                <Plus className="h-3.5 w-3.5" /> {L('Kirim', 'Приход')}
                              </button>
                            </>
                          )}
                          <button type="button" onClick={() => openHistory(i)} className="rounded-lg p-2 text-ink-subtle hover:bg-canvas hover:text-ink" aria-label={L('Tarix', 'История')}>
                            <History className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <p className="text-xs text-ink-subtle">
          {L(
            'Kam qolgan mahsulotlar ro‘yxati har kuni soat 9:00 da xodimlar Telegram guruhiga yuboriladi.',
            'Список заканчивающихся позиций каждый день в 9:00 отправляется в Telegram-группу сотрудников.',
          )}
        </p>
      </div>

      <MoveDialog move={move} lang={lang} onClose={() => setMove(null)} onDone={load} />
      <ItemDialog item={editing} lang={lang} onClose={() => setEditing(null)} onDone={load} />

      <ModalDialog isOpen={Boolean(history)} onClose={() => setHistory(null)} title={history ? history.item.name : ''} description={L('Oxirgi 50 ta harakat', 'Последние 50 движений')} size="md">
        {!history?.rows ? (
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
          </p>
        ) : history.rows.length === 0 ? (
          <p className="text-sm text-ink-muted">{L('Harakat yo‘q.', 'Движений нет.')}</p>
        ) : (
          <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
            {history.rows.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-ink">{(MOVE_LABEL[m.changeType] || { uz: m.changeType, ru: m.changeType })[lang]}</span>
                  <span className="block truncate text-xs text-ink-muted">
                    {formatClinicDate(m.createdAt, lang)}
                    {m.performedBy ? ` · ${m.performedBy}` : ''}
                    {m.reason ? ` · ${m.reason}` : ''}
                  </span>
                </span>
                <span className={`shrink-0 font-semibold tabular-nums ${m.quantityDelta < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                  {m.quantityDelta > 0 ? '+' : ''}
                  {m.quantityDelta}
                </span>
              </li>
            ))}
          </ul>
        )}
      </ModalDialog>
    </AdminLayout>
  );
}

function Stat({ icon: Icon, label, value, tone = 'default' }: { icon: any; label: string; value: string; tone?: 'default' | 'warning' }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 shadow-card">
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-brand-50 text-brand-600'}`}>
        <Icon className="h-5 w-5" />
      </span>
      <span>
        <span className="block text-xs text-ink-subtle">{label}</span>
        <span className="block text-[15px] font-semibold tabular-nums text-ink">{value}</span>
      </span>
    </div>
  );
}

function MoveDialog({ move, lang, onClose, onDone }: { move: { item: any; type: 'RESTOCK' | 'USAGE' } | null; lang: 'uz' | 'ru'; onClose: () => void; onDone: () => void }) {
  const L = (uz: string, ru: string) => (lang === 'ru' ? ru : uz);
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQty('');
    setReason('');
    setError(null);
  }, [move]);

  const n = Number(qty);
  const tooMuch = move?.type === 'USAGE' && n > move.item.quantity;

  const submit = async () => {
    if (!move || !(n > 0) || tooMuch) return;
    setBusy(true);
    setError(null);
    try {
      await api.recordStockMovement(move.item.id, { changeType: move.type, quantityDelta: move.type === 'USAGE' ? -n : n, reason: reason.trim() || undefined });
      onDone();
      onClose();
    } catch (e: any) {
      setError(e?.message || L('Xatolik yuz berdi', 'Произошла ошибка'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalDialog
      isOpen={Boolean(move)}
      onClose={onClose}
      title={move ? `${move.type === 'RESTOCK' ? L('Kirim', 'Приход') : L('Sarf', 'Расход')}: ${move.item.name}` : ''}
      description={move ? `${L('Hozirgi qoldiq', 'Текущий остаток')}: ${move.item.quantity} ${move.item.unit}` : undefined}
      size="sm"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-4"
      >
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-ink">{L('Miqdor', 'Количество')}</span>
          <input value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} inputMode="numeric" autoFocus className={field} />
          {tooMuch && <span className="mt-1 block text-xs text-rose-600">{L('Qoldiqdan ko‘p', 'Больше остатка')}</span>}
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-ink">{L('Izoh', 'Комментарий')}</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className={field} placeholder={move?.type === 'RESTOCK' ? L('Yetkazib beruvchi, hujjat №', 'Поставщик, № накладной') : L('Bemor / muolaja', 'Пациент / процедура')} />
        </label>
        {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-9 rounded-lg px-3 text-sm font-medium text-ink-muted hover:bg-canvas">
            {L('Bekor', 'Отмена')}
          </button>
          <button type="submit" disabled={busy || !(n > 0) || tooMuch} className="h-9 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {L('Saqlash', 'Сохранить')}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}

function ItemDialog({ item, lang, onClose, onDone }: { item: any | null; lang: 'uz' | 'ru'; onClose: () => void; onDone: () => void }) {
  const L = (uz: string, ru: string) => (lang === 'ru' ? ru : uz);
  const [form, setForm] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isNew = item && !item.id;

  useEffect(() => {
    setForm(item ? { ...item } : null);
    setError(null);
  }, [item]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form || form.name.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        unit: form.unit.trim() || 'dona',
        minThreshold: Number(form.minThreshold) || 0,
        unitCost: Number(form.unitCost) || 0,
      };
      if (isNew) await api.createInventoryItem({ ...payload, quantity: Number(form.quantity) || 0 });
      else await api.updateInventoryItem(form.id, payload);
      onDone();
      onClose();
    } catch (e: any) {
      setError(e?.message || L('Xatolik yuz berdi', 'Произошла ошибка'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalDialog isOpen={Boolean(item)} onClose={onClose} title={isNew ? L('Yangi mahsulot', 'Новая позиция') : L('Mahsulotni tahrirlash', 'Редактировать позицию')} size="md">
      {form && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="grid gap-3 sm:grid-cols-2"
        >
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-[13px] font-medium text-ink">{L('Nomi', 'Название')}</span>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} className={field} autoFocus />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink">{L('Turi', 'Категория')}</span>
            <select value={form.category} onChange={(e) => set('category', e.target.value)} className={field}>
              {Object.entries(CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v[lang]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink">{L("O'lchov birligi", 'Единица')}</span>
            <input value={form.unit} onChange={(e) => set('unit', e.target.value)} className={field} placeholder="dona, quti, flakon" />
          </label>
          {isNew && (
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-ink">{L("Boshlang'ich qoldiq", 'Начальный остаток')}</span>
              <input value={form.quantity} onChange={(e) => set('quantity', e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={field} />
            </label>
          )}
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink">{L('Minimal qoldiq', 'Минимальный остаток')}</span>
            <input value={form.minThreshold} onChange={(e) => set('minThreshold', e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={field} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink">{L("Birlik narxi (so'm)", 'Цена за единицу (сум)')}</span>
            <input value={form.unitCost} onChange={(e) => set('unitCost', e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={field} />
          </label>
          {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 sm:col-span-2">{error}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" onClick={onClose} className="h-9 rounded-lg px-3 text-sm font-medium text-ink-muted hover:bg-canvas">
              {L('Bekor', 'Отмена')}
            </button>
            <button type="submit" disabled={busy || form.name.trim().length < 2} className="h-9 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {L('Saqlash', 'Сохранить')}
            </button>
          </div>
        </form>
      )}
    </ModalDialog>
  );
}
