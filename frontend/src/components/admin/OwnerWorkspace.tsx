'use client';

import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  AlertTriangle,
  Wallet,
  Users,
  Package,
  Plus,
  CreditCard,
  CheckCircle2,
  Filter,
  Percent,
  Printer,
} from 'lucide-react';
import { PaymentReceiptModal, PaymentReceiptData } from './PaymentReceiptModal';
import { api } from '../../lib/api';
import { formatClinicTime } from '../../lib/dateFormat';

export interface OwnerWorkspaceProps {
  doctors: any[];
  isUz: boolean;
  doctorCommissionRates: Record<string, number>;
  handleUpdateDoctorCommissionRate: (doctorId: string, rate: number) => void;
  setStatusFeedback: (msg: string | null) => void;
}

export function OwnerWorkspace({
  doctors,
  isUz,
  doctorCommissionRates,
  handleUpdateDoctorCommissionRate,
  setStatusFeedback,
}: OwnerWorkspaceProps) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [debts, setDebts] = useState<any[]>([]);
  const [inventory, setInventory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Date filter state
  const [ownerDateFilter, setOwnerDateFilter] = useState<'today' | 'week' | 'month' | 'custom'>('today');
  const [ownerCustomStart, setOwnerCustomStart] = useState<string>('');
  const [ownerCustomEnd, setOwnerCustomEnd] = useState<string>('');

  // Debt payment modal state
  const [debtModalOpen, setDebtModalOpen] = useState(false);
  const [debtPatientId, setDebtPatientId] = useState<string>('');
  const [debtAmount, setDebtAmount] = useState<number>(0);
  const [debtMethod, setDebtMethod] = useState<'CASH' | 'CARD' | 'TRANSFER' | 'OTHER'>('CASH');
  const [debtNotes, setDebtNotes] = useState<string>('');
  const [debtSuccessMsg, setDebtSuccessMsg] = useState<string | null>(null);
  const [debtErrorMsg, setDebtErrorMsg] = useState<string | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentReceiptData | null>(null);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);

  const handleOpenReceipt = (receipt: PaymentReceiptData) => {
    setSelectedReceipt(receipt);
    setReceiptModalOpen(true);
  };

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [invRes, debtRes, invItemsRes] = await Promise.all([
        api.getInvoices().catch(() => []),
        api.getDebts().catch(() => []),
        api.getInventoryItems().catch(() => []),
      ]);
      setInvoices(invRes || []);
      setDebts(Array.isArray(debtRes) ? debtRes : debtRes?.items || []);
      setInventory(invItemsRes || []);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalRevenue = invoices.reduce((acc, inv) => acc + (inv.paidAmount || 0), 0);
  const totalDebt = debts.reduce((acc, d) => acc + (d.totalDebt || 0), 0);
  const lowStockCount = inventory.filter((i) => i.quantity <= i.minThreshold).length;

  const handleOpenDebtModal = (patientId?: string) => {
    const targetId = patientId || (debts.length > 0 ? debts[0].id : '');
    const patient = debts.find((d) => d.id === targetId);
    setDebtPatientId(targetId);
    setDebtAmount(patient ? patient.totalDebt : 0);
    setDebtMethod('CASH');
    setDebtNotes('');
    setDebtSuccessMsg(null);
    setDebtErrorMsg(null);
    setDebtModalOpen(true);
  };

  const handleRepayDebtSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDebtErrorMsg(null);
    setDebtSuccessMsg(null);
    if (!debtPatientId) {
      setDebtErrorMsg(isUz ? 'Bemor tanlanmagan' : 'Пациент не выбран');
      return;
    }
    if (debtAmount <= 0) {
      setDebtErrorMsg(isUz ? "To'lov summasi 0 dan katta bo'lishi kerak" : 'Сумма оплаты должна быть больше 0');
      return;
    }

    try {
      await api.recordPayment({
        patientId: debtPatientId,
        amount: debtAmount,
        method: debtMethod,
        note: debtNotes || (isUz ? "Qarz to'lovi" : "Погашение задолженности"),
      });

      setDebtSuccessMsg(
        isUz ? "To'lov muvaffaqiyatli qabul qilindi va serverda saqlandi!" : "Оплата успешно принята и сохранена на сервере!"
      );
      setStatusFeedback(
        isUz ? "Bemor qarzi muvaffaqiyatli so'ndirildi" : "Задолженность пациента успешно погашена"
      );
      await loadData();
      setTimeout(() => {
        setDebtModalOpen(false);
      }, 1500);
    } catch (err: any) {
      setDebtErrorMsg(err?.message || (isUz ? "To'lovda xatolik yuz berdi" : "Ошибка при оплате"));
    }
  };

  const handleRestockInventory = async (itemId: string, qty: number = 10) => {
    try {
      await api.recordStockMovement(itemId, {
        changeType: 'RESTOCK',
        quantityDelta: qty,
        reason: isUz ? "Zaxira to'ldirildi" : 'Пополнение склада',
      });
      await loadData();
      setStatusFeedback(
        isUz ? `Zaxira +${qty} birlikka to'ldirildi` : `Склад пополнен на +${qty} ед.`
      );
    } catch (err: any) {
      console.error('Restock failed:', err);
    }
  };

  const handleDeductInventory = async (itemId: string, qty: number = 1) => {
    try {
      await api.recordStockMovement(itemId, {
        changeType: 'USAGE',
        quantityDelta: -qty,
        reason: isUz ? 'Klinik sarf' : 'Клинический расход',
      });
      await loadData();
      setStatusFeedback(
        isUz ? `Zaxiradan -${qty} birlik sarflandi` : `Списано -${qty} ед. со склада`
      );
    } catch (err: any) {
      console.error('Deduct failed:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Owner CRM Date Filter Bar */}
      <div className="bg-white p-3.5 rounded-2xl border border-line flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-brand-600" />
          <span className="text-xs font-bold text-ink">
            {isUz ? 'Davr bo\'yicha tahlil:' : 'Период анализа:'}
          </span>
          <div className="flex items-center bg-canvas p-1 rounded-xl border border-line text-xs">
            {(['today', 'week', 'month', 'custom'] as const).map((filterKey) => (
              <button
                key={filterKey}
                type="button"
                onClick={() => setOwnerDateFilter(filterKey)}
                className={`px-3 py-1 rounded-lg font-bold text-xs transition-all ${
                  ownerDateFilter === filterKey
                    ? 'bg-brand-600 text-white shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {filterKey === 'today'
                  ? (isUz ? 'Bugun' : 'Сегодня')
                  : filterKey === 'week'
                  ? (isUz ? 'Bu hafta' : 'Эта неделя')
                  : filterKey === 'month'
                  ? (isUz ? 'Bu oy' : 'Этот месяц')
                  : (isUz ? 'Boshqa davr' : 'Период')}
              </button>
            ))}
          </div>
        </div>

        {ownerDateFilter === 'custom' && (
          <div className="flex items-center gap-2 text-xs">
            <input
              type="date"
              value={ownerCustomStart}
              onChange={(e) => setOwnerCustomStart(e.target.value)}
              className="px-2.5 py-1 bg-canvas border border-line rounded-lg text-ink text-xs"
            />
            <span>—</span>
            <input
              type="date"
              value={ownerCustomEnd}
              onChange={(e) => setOwnerCustomEnd(e.target.value)}
              className="px-2.5 py-1 bg-canvas border border-line rounded-lg text-ink text-xs"
            />
          </div>
        )}
      </div>

      {/* Owner KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Gross Clinic Revenue */}
        <div className="ui-card flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-ink-muted block">{isUz ? 'Jami tushum (Klinika daromadi)' : 'Общая выручка клиники'}</span>
            <p className="text-2xl font-black text-ink mt-0.5">
              {totalRevenue.toLocaleString()} <span className="text-xs font-bold text-ink-muted">so&apos;m</span>
            </p>
            <span className="text-[11px] text-emerald-700 font-medium">{isUz ? "Muolajalar va to'lovlar" : 'Оплаченные процедуры'}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 2: Total Debt (Qarzlar) */}
        <div className="ui-card flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-ink-muted block">{isUz ? 'Bemorlar qarzdorligi (Qarzlar)' : 'Задолженность пациентов'}</span>
            <p className="text-2xl font-black text-rose-600 mt-0.5">
              {totalDebt.toLocaleString()} <span className="text-xs font-bold text-ink-muted">so&apos;m</span>
            </p>
            <button
              type="button"
              onClick={() => handleOpenDebtModal()}
              className="text-[11px] text-brand-600 hover:underline font-bold flex items-center gap-1"
            >
              <Wallet className="w-3 h-3" />
              <span>{isUz ? "Qarzni to'lash" : 'Погасить долг'}</span>
            </button>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 3: Debtors Count */}
        <div className="ui-card flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-ink-muted block">{isUz ? 'Qarzdor bemorlar soni' : 'Пациентов с долгом'}</span>
            <p className="text-2xl font-black text-ink mt-0.5">
              {debts.length} <span className="text-xs font-bold text-ink-muted">{isUz ? 'nafar' : 'чел.'}</span>
            </p>
            <span className="text-[11px] text-teal-700 font-medium">{isUz ? 'Dinamic hisoblangan' : 'Динамический расчет'}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* KPI 4: Consumables Health */}
        <div className="ui-card flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-ink-muted block">{isUz ? 'Sarf materiallari zaxirasi' : 'Состояние склада расходников'}</span>
            <p className={`text-2xl font-black mt-0.5 ${lowStockCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
              {lowStockCount > 0 ? `${lowStockCount} ${isUz ? 'ta kam qoldi' : 'в дефиците'}` : (isUz ? 'Normada' : 'В норме')}
            </p>
            <span className="text-[11px] text-ink-muted font-medium">
              {lowStockCount > 0 ? (isUz ? "Zaxirani to'ldirish zarur" : 'Требуется пополнение') : (isUz ? "Barcha mahsulotlar yetarli" : 'Все позиции в достатке')}
            </span>
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${lowStockCount > 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
            <Package className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Owner CRM Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Cols: Doctor Commission & Payouts + Consumables Inventory */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card 1: Doctor Commission & Payout Calculator */}
          <div className="ui-card space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h2 className="text-base font-bold text-ink flex items-center gap-2">
                  <Percent className="w-4 h-4 text-brand-600" />
                  <span>{isUz ? 'Shifokorlar komissiyasi va oylik daromadi' : 'Калькулятор комиссии и выплат врачам'}</span>
                </h2>
                <p className="text-xs text-ink-muted">
                  {isUz
                    ? 'Bajarilgan muolajalar summasidan materiallar harajati (10%) chegirilib, shifokor ulushi (30%-50%) hisoblanadi'
                    : 'Расчет выплат врачам (30%-50%) от стоимости завершенных процедур за вычетом материалов (10%)'}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {doctors.map((doc) => {
                const docId = doc.id;
                const currentRate = doctorCommissionRates[docId];
                const docName = isUz
                  ? `Dr. ${doc.firstNameUz} ${doc.lastNameUz}`
                  : `Др. ${doc.firstNameRu || doc.firstNameUz} ${doc.lastNameRu || doc.lastNameUz}`;

                return (
                  <div
                    key={docId}
                    className="p-3.5 bg-canvas hover:bg-brand-50 rounded-2xl border border-line space-y-3 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-brand-600 text-white font-bold flex items-center justify-center text-sm shadow-xs">
                          {doc.firstNameUz?.charAt(0) || 'D'}
                        </div>
                        <div>
                          <h3 className="font-bold text-sm text-ink">{docName}</h3>
                          <p className="text-xs text-ink-muted">
                            {isUz ? (doc.specializationUz || 'Stomatolog-terapevt') : (doc.specializationRu || 'Стоматолог-терапевт')}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-line">
                        <span className="text-xs text-ink-muted font-semibold">{isUz ? 'Ulush:' : 'Ставка:'}</span>
                        <select
                          value={currentRate !== undefined && currentRate !== null ? currentRate : ''}
                          onChange={(e) => {
                            if (e.target.value) {
                              handleUpdateDoctorCommissionRate(docId, Number(e.target.value));
                            }
                          }}
                          className={`text-xs font-bold bg-transparent focus:outline-none cursor-pointer ${
                            currentRate !== undefined && currentRate !== null ? 'text-brand-600' : 'text-amber-600'
                          }`}
                        >
                          {(currentRate === undefined || currentRate === null) && (
                            <option value="" disabled>
                              {isUz ? 'Sozlanmagan' : 'Не настроено'}
                            </option>
                          )}
                          <option value={30}>30%</option>
                          <option value={35}>35%</option>
                          <option value={40}>40%</option>
                          <option value={45}>45%</option>
                          <option value={50}>50%</option>
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card 2: Consumables Inventory Tracker */}
          <div className="ui-card space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h2 className="text-base font-bold text-ink flex items-center gap-2">
                  <Package className="w-4 h-4 text-brand-600" />
                  <span>{isUz ? 'Sarf materiallari va qoldiq monitoringi' : 'Склад расходных материалов и мониторинг'}</span>
                </h2>
                <p className="text-xs text-ink-muted">
                  {isUz
                    ? 'Minimal me\'yordan past bo\'lgan materiallar avtomatik qizil ogohlantirish beradi'
                    : 'Позиции ниже минимального порога автоматически подсвечиваются предупреждением'}
                </p>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-brand-100 text-brand-600">
                {inventory.length} {isUz ? 'ta tovar' : 'позиций'}
              </span>
            </div>

            {inventory.length === 0 ? (
              <div className="p-8 text-center text-ink-muted bg-canvas rounded-2xl border border-dashed border-line">
                <p className="text-xs font-semibold">
                  {isUz ? 'Omborda mahsulotlar mavjud emas' : 'На складе нет товаров'}
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {inventory.map((item) => {
                  const isLow = item.quantity <= item.minThreshold;
                  const pct = Math.min(100, Math.round((item.quantity / (item.minThreshold * 2.5)) * 100));

                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isLow
                          ? 'bg-rose-50/70 border-rose-300'
                          : 'bg-white border-line hover:bg-canvas'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-xs sm:text-sm text-ink truncate">
                            {item.name}
                          </h3>
                          {isLow ? (
                            <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white font-bold text-[10px] animate-pulse">
                              {isUz ? 'Kam qoldi!' : 'Мало!'}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                              {isUz ? 'Yetarli' : 'Норма'}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-ink-muted mt-0.5">
                          {isUz ? 'Kategoriya:' : 'Категория:'} <span className="font-semibold">{item.category}</span> • {isUz ? 'Minimal chegara:' : 'Мин. порог:'}{' '}
                          <strong>{item.minThreshold} {item.unit}</strong>
                        </p>

                        <div className="w-full h-1.5 bg-black/5 rounded-full overflow-hidden mt-2 max-w-xs">
                          <div
                            className={`h-full rounded-full ${isLow ? 'bg-rose-600' : 'bg-brand-600'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                        <div className="text-right">
                          <span className="text-xs font-black text-ink">
                            {item.quantity} {item.unit}
                          </span>
                          <span className="text-[10px] text-ink-muted block">
                            {item.unitCost.toLocaleString()} so&apos;m/{item.unit}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleDeductInventory(item.id, 1)}
                            className="px-2.5 py-1.5 bg-canvas hover:bg-line text-ink rounded-xl text-xs font-bold border border-line-strong transition-colors cursor-pointer"
                            title={isUz ? "1 ta sarflash" : 'Списать 1'}
                          >
                            -1
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRestockInventory(item.id, 10)}
                            className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-2xs flex items-center gap-1 transition-colors cursor-pointer"
                            title={isUz ? "10 ta qo'shish" : 'Добавить 10'}
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>+10</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right 5 Cols: Debt Registry & Recent Payments */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card 3: Debt Registry ("Qarz Daftari") */}
          <div className="ui-card space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h2 className="text-base font-bold text-ink flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-rose-600" />
                  <span>{isUz ? 'Qarz daftari ("Qarzlar")' : 'Книга задолженностей'}</span>
                </h2>
                <p className="text-xs text-ink-muted">
                  {isUz ? 'Klinikadan qarzi bor bemorlar ro\'yxati va to\'lov qabul qilish' : 'Список пациентов с долгом и прием оплат'}
                </p>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                {debts.length} {isUz ? 'bemor' : 'пац.'}
              </span>
            </div>

            {debts.length === 0 ? (
              <div className="p-8 text-center text-ink-muted space-y-2 bg-canvas rounded-xl border border-dashed border-line">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-600" />
                <p className="text-xs font-semibold">
                  {isUz ? 'Klinikada muddati o\'tgan qarzlar yo\'q!' : 'У клиники нет задолженностей!'}
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                {debts.map((patient) => (
                  <div
                    key={patient.id}
                    className="p-3 bg-white hover:bg-rose-50/40 rounded-2xl border border-rose-200 flex items-center justify-between gap-3 shadow-2xs transition-all"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-xs text-ink truncate">{patient.fullName}</p>
                      <p className="text-[11px] font-mono text-ink-muted">{patient.phone}</p>
                      <p className="text-xs font-black text-rose-600 mt-0.5">
                        {isUz ? 'Qarz:' : 'Долг:'} {patient.totalDebt.toLocaleString()} so&apos;m
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenDebtModal(patient.id)}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1 shrink-0 transition-colors cursor-pointer"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>{isUz ? "To'lash" : 'Погасить'}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Card 4: Recent Payments Stream */}
          <div className="ui-card space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h2 className="text-base font-bold text-ink flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{isUz ? 'So\'nggi to\'lovlar va kassa' : 'Недавние платежи и касса'}</span>
                </h2>
                <p className="text-xs text-ink-muted">
                  {isUz ? 'Naqd, Karta va o\'tkazma orqali tushumlar' : 'Поступления через Наличные, Карты и Переводы'}
                </p>
              </div>
            </div>

            {invoices.flatMap((inv) => (inv.payments || []).map((p: any) => ({ ...p, patientName: inv.patientName }))).length === 0 ? (
              <div className="p-6 text-center text-ink-muted bg-canvas rounded-xl border border-dashed border-line">
                <p className="text-xs font-semibold">
                  {isUz ? 'Hozircha to\'lovlar mavjud emas' : 'Платежей пока нет'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {invoices
                  .flatMap((inv) => (inv.payments || []).map((p: any) => ({ ...p, patientName: inv.patientName })))
                  .slice(0, 6)
                  .map((pay: any) => (
                    <div
                      key={pay.id}
                      className="p-2.5 bg-canvas rounded-xl border border-line flex items-center justify-between text-xs"
                    >
                      <div>
                        <p className="font-bold text-ink">{pay.patientName}</p>
                        <span className="text-[10px] text-ink-muted">
                          {formatClinicTime(pay.createdAt || pay.recordedAt)} • {pay.method}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <div className="text-right">
                          <span className="font-bold text-xs text-emerald-700 block">
                            +{pay.amount.toLocaleString()} so&apos;m
                          </span>
                          <span className="text-[10px] text-ink-muted">{pay.note || (isUz ? 'Qabul' : 'Прием')}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenReceipt({
                            patientName: pay.patientName || (isUz ? 'Bemor' : 'Пациент'),
                            amount: pay.amount,
                            method: pay.method || 'CASH',
                            date: pay.createdAt || pay.recordedAt || new Date(),
                            invoiceId: pay.invoiceId,
                            note: pay.note,
                          })}
                          className="p-1.5 text-ink-subtle hover:text-brand-600 hover:bg-brand-100 rounded-lg transition-colors cursor-pointer"
                          title={isUz ? 'Kvitansiyani chop etish' : 'Печать квитанции'}
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Payment Receipt Modal */}
      <PaymentReceiptModal
        isOpen={receiptModalOpen}
        onClose={() => setReceiptModalOpen(false)}
        data={selectedReceipt}
        isUz={isUz}
      />

      {/* Repay Debt Modal */}
      {debtModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-line space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-base font-extrabold text-ink flex items-center gap-2">
                <Wallet className="w-5 h-5 text-rose-600" />
                <span>{isUz ? "Qarzni to'lash (Kassa)" : 'Погашение долга (Касса)'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setDebtModalOpen(false)}
                className="text-ink-subtle hover:text-ink-muted text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {debtSuccessMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold">
                {debtSuccessMsg}
              </div>
            )}
            {debtErrorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-bold">
                {debtErrorMsg}
              </div>
            )}

            <form onSubmit={handleRepayDebtSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-ink block mb-1">
                  {isUz ? 'Qarzdor bemor:' : 'Пациент с долгом:'}
                </label>
                <select
                  value={debtPatientId}
                  onChange={(e) => {
                    const patId = e.target.value;
                    setDebtPatientId(patId);
                    const selected = debts.find((d) => d.id === patId);
                    if (selected) setDebtAmount(selected.totalDebt);
                  }}
                  className="w-full px-3 py-2 text-xs bg-canvas border border-line rounded-xl text-ink font-medium focus:outline-none focus:border-brand-600"
                >
                  <option value="">{isUz ? '— Bemorni tanlang —' : '— Выберите пациента —'}</option>
                  {debts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.fullName} ({p.phone}) — {isUz ? 'Qarz:' : 'Долг:'} {p.totalDebt.toLocaleString()} so&apos;m
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-ink block mb-1">
                  {isUz ? "To'lov summasi (so'm):" : 'Сумма оплаты (сум):'}
                </label>
                <input
                  type="number"
                  min="1"
                  value={debtAmount}
                  onChange={(e) => setDebtAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-black bg-canvas border border-line rounded-xl text-ink focus:outline-none focus:border-brand-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-ink block mb-1">
                  {isUz ? "To'lov usuli:" : 'Способ оплаты:'}
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {(['CASH', 'CARD', 'TRANSFER', 'OTHER'] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setDebtMethod(method)}
                      className={`p-2 rounded-xl border font-bold text-center transition-all ${
                        debtMethod === method
                          ? 'bg-brand-600 text-white border-brand-700'
                          : 'bg-canvas text-ink-muted border-line hover:bg-canvas'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-ink block mb-1">
                  {isUz ? 'Izoh (kvitansiya raqami yoki eslatma):' : 'Примечание:'}
                </label>
                <input
                  type="text"
                  placeholder={isUz ? "Masalan: Qarz to'lovi" : 'Например: Погашение долга'}
                  value={debtNotes}
                  onChange={(e) => setDebtNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-canvas border border-line rounded-xl text-ink focus:outline-none focus:border-brand-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                <button
                  type="button"
                  onClick={() => setDebtModalOpen(false)}
                  className="px-4 py-2 bg-canvas text-ink hover:bg-line rounded-xl text-xs font-bold"
                >
                  {isUz ? 'Bekor qilish' : 'Отмена'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-sm"
                >
                  {isUz ? "To'lovni tasdiqlash" : 'Подтвердить оплату'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

