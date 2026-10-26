'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  TrendingUp,
  Users,
  CheckCircle2,
  XCircle,
  Calendar,
  DollarSign,
  Filter,
  RefreshCw,
  HelpCircle,
  AlertCircle,
  Stethoscope,
  Building2,
  Award,
  Clock,
  ArrowUpRight,
  ShieldAlert,
  BarChart2,
  Activity,
  Layers,
} from 'lucide-react';
import { AdminLayout } from '../../../components/AdminLayout';
import { CustomSelect, SelectOption } from '../../../components/CustomSelect';
import { CustomDatePicker } from '../../../components/CustomDatePicker';
import { api } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';
import {
  getClinicTodayDateString,
  getClinicDayBoundaries,
  getClinicWeekBoundaries,
  getClinicMonthBoundaries,
} from '../../../lib/dateFormat';

export default function AdminAnalyticsPage() {
  const { language } = useI18n();
  const isUz = language === 'uz';

  const [data, setData] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Filters with default current clinic month
  const [activePreset, setActivePreset] = useState<'today' | 'week' | 'month' | 'custom'>('month');
  const [startDate, setStartDate] = useState<string>(() => {
    const todayStr = getClinicTodayDateString();
    return getClinicMonthBoundaries(todayStr).dateFrom.slice(0, 10);
  });
  const [endDate, setEndDate] = useState<string>(() => {
    const todayStr = getClinicTodayDateString();
    return getClinicMonthBoundaries(todayStr).dateTo.slice(0, 10);
  });
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');

  // Dropdown options fixtures
  const [doctors, setDoctors] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);

  // Race condition protection
  const loadSeqRef = useRef<number>(0);

  useEffect(() => {
    async function loadFixtures() {
      try {
        const [docsRes, branchRes, servRes] = await Promise.all([
          api.getDoctors(),
          api.getBranches(),
          api.getServices(),
        ]);
        setDoctors(docsRes || []);
        setBranches(branchRes || []);
        setServices(servRes || []);
      } catch (e) {
        console.error('Failed to load filter options', e);
      }
    }
    loadFixtures();
  }, []);

  const loadAnalytics = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    try {
      setIsLoading(true);
      setFetchError(null);

      if (startDate && endDate && startDate > endDate) {
        setFetchError(
          isUz
            ? 'Boshlanish sanasi tugash sanasidan kech bo\'lishi mumkin emas'
            : 'Дата начала не может быть позже даты окончания'
        );
        setIsLoading(false);
        return;
      }

      const res = await api.getAnalyticsOverview({
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        branchId: selectedBranchId || undefined,
        doctorId: selectedDoctorId || undefined,
        serviceId: selectedServiceId || undefined,
      });

      if (seq === loadSeqRef.current) {
        setData(res);
      }
    } catch (e: any) {
      if (seq === loadSeqRef.current) {
        console.error('Failed to load analytics', e);
        setFetchError(
          e?.message ||
            (isUz
              ? 'Statistika ma\'lumotlarini yuklashda xatolik yuz berdi'
              : 'Произошла ошибка при загрузке аналитики')
        );
      }
    } finally {
      if (seq === loadSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, [startDate, endDate, selectedBranchId, selectedDoctorId, selectedServiceId, isUz]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const applyPreset = (preset: 'today' | 'week' | 'month' | 'clear') => {
    const todayStr = getClinicTodayDateString();
    if (preset === 'today') {
      setActivePreset('today');
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'week') {
      setActivePreset('week');
      const bounds = getClinicWeekBoundaries(todayStr);
      setStartDate(bounds.dateFrom.slice(0, 10));
      setEndDate(bounds.dateTo.slice(0, 10));
    } else if (preset === 'month') {
      setActivePreset('month');
      const bounds = getClinicMonthBoundaries(todayStr);
      setStartDate(bounds.dateFrom.slice(0, 10));
      setEndDate(bounds.dateTo.slice(0, 10));
    } else {
      setActivePreset('custom');
      setStartDate('');
      setEndDate('');
    }
  };

  const summary = data?.summary || {
    totalAppointments: 0,
    completed: 0,
    cancelled: 0,
    noShow: 0,
    completionRate: 0,
    cancellationRate: 0,
    noShowRate: 0,
    uniquePatientsCount: 0,
    newPatients: 0,
    returningPatients: 0,
  };

  const statusMap = data?.statusBreakdown || {};
  const popularServices: Array<{ name: string; count: number; percentage: number }> =
    data?.popularServices || [];
  const doctorUtilization: Array<{
    doctorId: string;
    doctorName: string;
    appointmentsCount: number;
    totalHoursBooked: number;
    utilizationRate: number;
  }> = data?.doctorUtilization || [];
  const leads = data?.leads || {
    totalLeads: 0,
    converted: 0,
    conversionRate: 0,
    byStatus: {},
  };
  const revenue = data?.revenue || {
    totalIncomeMinor: 0,
    totalRefundsMinor: 0,
    netRevenueMinor: 0,
    hasRecordedPayments: false,
    byMethod: {},
  };

  const doctorOptions: SelectOption[] = [
    { value: '', label: isUz ? 'Barcha shifokorlar' : 'Все врачи' },
    ...doctors.map((d) => ({
      value: d.id,
      label: `Dr. ${isUz ? d.firstNameUz : d.firstNameRu} ${isUz ? d.lastNameUz : d.lastNameRu}`,
    })),
  ];

  const branchOptions: SelectOption[] = [
    { value: '', label: isUz ? 'Barcha filiallar' : 'Все филиалы' },
    ...branches.map((b) => ({
      value: b.id,
      label: isUz ? b.nameUz : b.nameRu,
    })),
  ];

  const serviceOptions: SelectOption[] = [
    { value: '', label: isUz ? 'Barcha xizmatlar' : 'Все услуги' },
    ...services.map((s) => ({
      value: s.id,
      label: isUz ? s.nameUz : s.nameRu,
    })),
  ];

  return (
    <AdminLayout allowedRoles={['OWNER', 'ADMIN']}>
      <div className="space-y-6">
        {/* Executive Header (Image 4 Style) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-[#d8e5e2] shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#167b78] bg-[#e0f2ed] px-2.5 py-0.5 rounded-md">
                {isUz ? 'Klinika egasi & Boshqaruv' : 'Руководство клиники'}
              </span>
              <span className="text-xs text-[#52696e]">
                {startDate && endDate ? `${startDate} — ${endDate}` : (isUz ? 'Barcha davr' : 'За все время')}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-[#152f34] mt-1">
              {isUz ? 'Statistika va hisobotlar — Ijroiya tahlillari' : 'Статистика и отчеты — Исполнительная аналитика'}
            </h1>
          </div>

          <button
            onClick={loadAnalytics}
            disabled={isLoading}
            className="ui-button ui-button--secondary text-xs self-start sm:self-center"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#167b78]' : ''}`} />
            <span>{isUz ? 'Yangilash' : 'Обновить'}</span>
          </button>
        </div>

        {/* Date & Filter Toolbar */}
        <div className="ui-card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#d8e5e2] pb-3">
            <div className="flex items-center gap-2 text-xs font-bold text-[#152f34]">
              <Filter className="w-4 h-4 text-[#167b78]" />
              <span>{isUz ? 'Filtrlash parametrlari:' : 'Параметры фильтрации:'}</span>
            </div>

            {/* Presets */}
            <div className="flex items-center gap-1 bg-[#f3f8f7] p-1 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => applyPreset('today')}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${
                  activePreset === 'today'
                    ? 'bg-[#167b78] text-white shadow-xs'
                    : 'text-[#52696e] hover:bg-white'
                }`}
              >
                {isUz ? 'Bugun' : 'Сегодня'}
              </button>
              <button
                type="button"
                onClick={() => applyPreset('week')}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${
                  activePreset === 'week'
                    ? 'bg-[#167b78] text-white shadow-xs'
                    : 'text-[#52696e] hover:bg-white'
                }`}
              >
                {isUz ? 'Shu hafta' : 'Эта неделя'}
              </button>
              <button
                type="button"
                onClick={() => applyPreset('month')}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${
                  activePreset === 'month'
                    ? 'bg-[#167b78] text-white shadow-xs'
                    : 'text-[#52696e] hover:bg-white'
                }`}
              >
                {isUz ? 'Shu oy' : 'Этот месяц'}
              </button>
              {(startDate || endDate || selectedDoctorId || selectedBranchId || selectedServiceId) && (
                <button
                  type="button"
                  onClick={() => {
                    applyPreset('clear');
                    setSelectedDoctorId('');
                    setSelectedBranchId('');
                    setSelectedServiceId('');
                  }}
                  className="px-2.5 py-1 rounded-lg font-bold text-rose-600 hover:bg-rose-50"
                >
                  {isUz ? 'Tozalash' : 'Сброс'}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="text-[11px] font-bold text-[#52696e] block mb-1">
                {isUz ? 'Boshlanish sanasi' : 'Дата начала'}
              </label>
              <CustomDatePicker
                id="analytics-start-date"
                value={startDate}
                onChange={(val) => {
                  setStartDate(val);
                  setActivePreset('custom');
                }}
                locale={isUz ? 'uz' : 'ru'}
                placeholder={isUz ? 'Boshlanish sanasi' : 'Дата начала'}
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-[#52696e] block mb-1">
                {isUz ? 'Tugash sanasi' : 'Дата окончания'}
              </label>
              <CustomDatePicker
                id="analytics-end-date"
                value={endDate}
                onChange={(val) => {
                  setEndDate(val);
                  setActivePreset('custom');
                }}
                locale={isUz ? 'uz' : 'ru'}
                placeholder={isUz ? 'Tugash sanasi' : 'Дата окончания'}
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-[#52696e] block mb-1">
                {isUz ? 'Shifokor' : 'Врач'}
              </label>
              <CustomSelect
                options={doctorOptions}
                value={selectedDoctorId}
                onChange={(val) => setSelectedDoctorId(val)}
                placeholder={isUz ? 'Barcha shifokorlar' : 'Все врачи'}
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-[#52696e] block mb-1">
                {isUz ? 'Filial' : 'Филиал'}
              </label>
              <CustomSelect
                options={branchOptions}
                value={selectedBranchId}
                onChange={(val) => setSelectedBranchId(val)}
                placeholder={isUz ? 'Barcha filiallar' : 'Все филиалы'}
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-[#52696e] block mb-1">
                {isUz ? 'Xizmat' : 'Услуга'}
              </label>
              <CustomSelect
                options={serviceOptions}
                value={selectedServiceId}
                onChange={(val) => setSelectedServiceId(val)}
                placeholder={isUz ? 'Barcha xizmatlar' : 'Все услуги'}
              />
            </div>
          </div>
        </div>

        {fetchError && (
          <div className="p-4 bg-rose-50 border border-rose-300 rounded-2xl text-xs text-rose-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{fetchError}</span>
            </div>
            <button onClick={loadAnalytics} className="font-bold underline">
              {isUz ? 'Qayta urinish' : 'Повторить'}
            </button>
          </div>
        )}

        {/* 4 Main Executive KPIs (Image 4 Style) */}
        <div className="metric-grid">
          {/* Card 1: Monthly Revenue (from actual payment ledger) */}
          <div className="ui-card relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[#52696e] uppercase tracking-wider">
                {isUz ? 'Kassa Tushumi (Sof)' : 'Чистый доход кассы'}
              </span>
              <div className="w-8 h-8 rounded-xl bg-[#e0f2ed] text-[#167b78] flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-[#152f34]">
              {revenue.hasRecordedPayments
                ? `${revenue.netRevenueMinor.toLocaleString(isUz ? 'uz-UZ' : 'ru-RU')} ${isUz ? "so'm" : "сум"}`
                : `0 ${isUz ? "so'm" : "сум"}`}
            </p>
            <span className="text-[11px] text-[#52696e] mt-1 block">
              {revenue.hasRecordedPayments
                ? (isUz
                    ? `Kassa: +${revenue.totalIncomeMinor.toLocaleString('uz-UZ')} (Qaytarilgan: ${revenue.totalRefundsMinor.toLocaleString('uz-UZ')})`
                    : `Касса: +${revenue.totalIncomeMinor.toLocaleString('ru-RU')} (Возвраты: ${revenue.totalRefundsMinor.toLocaleString('ru-RU')})`)
                : (isUz ? "Tasdiqlangan to'lovlar kitobidan" : 'Из книги подтвержденных платежей')}
            </span>
          </div>

          {/* Card 2: Patient Flow (Appointments) */}
          <div className="ui-card relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[#52696e] uppercase tracking-wider">
                {isUz ? 'Jami qabullar (Bemorlar oqimi)' : 'Всего приемов (Поток пациентов)'}
              </span>
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-[#152f34]">
              {summary.totalAppointments}{' '}
              <span className="text-sm font-normal text-[#52696e]">
                {isUz ? 'jami qabullar' : 'всего приемов'}
              </span>
            </p>
            <span className="text-[11px] text-blue-700 font-semibold mt-1 block">
              {summary.uniquePatientsCount} {isUz ? 'nafar alohida bemor' : 'уникальных пациентов'}
              {summary.totalServiceUsage ? ` • ${summary.totalServiceUsage} ${isUz ? 'ta xizmat ko‘rsatildi' : 'оказано услуг'}` : ''}
            </span>
          </div>

          {/* Card 3: Completion Rate */}
          <div className="ui-card relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[#52696e] uppercase tracking-wider">
                {isUz ? 'Yakunlangan qabullar ulushi' : 'Доля завершенных приемов'}
              </span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-black text-emerald-700">{summary.completionRate}%</p>
              <span className="text-xs text-[#52696e]">
                ({summary.completed} {isUz ? 'ta yakunlangan' : 'завершено'})
              </span>
            </div>
            <span className="text-[11px] text-[#52696e] mt-1 block">
              {isUz ? 'Bekor qilingan:' : 'Отменено:'} {summary.cancelled} ({summary.cancellationRate}%)
            </span>
          </div>

          {/* Card 4: Lead to Booking Conversion */}
          <div className="ui-card relative overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[#52696e] uppercase tracking-wider">
                {isUz ? 'Murojaatlar konversiyasi' : 'Конверсия обращений'}
              </span>
              <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-black text-purple-700">{leads.conversionRate}%</p>
              <span className="text-xs text-[#52696e]">({leads.converted}/{leads.totalLeads})</span>
            </div>
            <span className="text-[11px] text-[#52696e] mt-1 block">
              {isUz ? 'Sayt va telefon orqali yozilganlar' : 'Записи через сайт и телефон'}
            </span>
          </div>
        </div>

        {/* Main Analytics Grid: Financial Visual + Doctor Workload (Image 4) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left 7 Cols: Financial & Status Visual */}
          <div className="lg:col-span-7 space-y-6">
            {/* Financial Overview (Image 4 Dark Teal Style Card) */}
            <div className="p-6 rounded-2xl bg-[#12353b] text-white shadow-card space-y-4">
              <div className="flex items-center justify-between border-b border-[#245158] pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#167b78] flex items-center justify-center text-white">
                    <DollarSign className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">
                      {isUz ? 'Moliyaviy tushumlar va kassa holati' : 'Финансовые поступления и статус кассы'}
                    </h2>
                    <span className="text-xs text-[#b2c9ca]">
                      {isUz ? "Rasmiy tasdiqlangan to'lovlar yozuvlari" : 'Официально подтвержденные записи платежей'}
                    </span>
                  </div>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full bg-[#245158] text-[#86efac] font-bold">
                  {isUz ? 'Kassa kitobi' : 'Кассовая книга'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="p-3 bg-[#18424a] rounded-xl border border-[#23535d]">
                  <span className="text-xs text-[#b2c9ca] block">
                    {isUz ? 'Jami tushum' : 'Общий доход'}
                  </span>
                  <strong className="text-lg font-black text-white mt-1 block">
                    {revenue.hasRecordedPayments
                      ? `${revenue.totalIncomeMinor.toLocaleString(isUz ? 'uz-UZ' : 'ru-RU')} ${isUz ? "so'm" : "сум"}`
                      : `0 ${isUz ? "so'm" : "сум"}`}
                  </strong>
                </div>

                <div className="p-3 bg-[#18424a] rounded-xl border border-[#23535d]">
                  <span className="text-xs text-[#b2c9ca] block">
                    {isUz ? 'Qaytarilgan mablag‘lar' : 'Возвраты'}
                  </span>
                  <strong className="text-lg font-black text-rose-300 mt-1 block">
                    {revenue.hasRecordedPayments
                      ? `-${revenue.totalRefundsMinor.toLocaleString(isUz ? 'uz-UZ' : 'ru-RU')} ${isUz ? "so'm" : "сум"}`
                      : `0 ${isUz ? "so'm" : "сум"}`}
                  </strong>
                </div>

                <div className="p-3 bg-[#18424a] rounded-xl border border-[#23535d]">
                  <span className="text-xs text-[#b2c9ca] block">
                    {isUz ? 'Sof kassa tushumi' : 'Чистая выручка'}
                  </span>
                  <strong className="text-lg font-black text-[#86efac] mt-1 block">
                    {revenue.hasRecordedPayments
                      ? `${revenue.netRevenueMinor.toLocaleString(isUz ? 'uz-UZ' : 'ru-RU')} ${isUz ? "so'm" : "сум"}`
                      : `0 ${isUz ? "so'm" : "сум"}`}
                  </strong>
                </div>
              </div>

              <p className="text-[11px] text-[#b2c9ca]/80 pt-1">
                {isUz
                  ? "* Eslatma: Ushbu ko'rsatkich faqat kassaga rasmiy kiritilgan haqiqiy to'lovlar asosida shakllantirilgan bo'lib, taxminiy xizmat narxlaridan alohida yuritiladi."
                  : '* Примечание: Данный показатель формируется только на основе фактически внесенных платежей в кассу и ведется отдельно от предварительных цен услуг.'}
              </p>
            </div>

            {/* Status Breakdown Bar Chart */}
            <div className="ui-card space-y-4">
              <div className="flex items-center justify-between border-b border-[#d8e5e2] pb-3">
                <h2 className="text-sm font-bold text-[#152f34]">
                  {isUz ? 'Qabullar holati taqsimoti' : 'Распределение статусов приемов'}
                </h2>
                <span className="text-xs text-[#52696e] font-semibold">
                  {isUz ? 'Jami:' : 'Всего:'} {summary.totalAppointments} {isUz ? 'ta' : ''}
                </span>
              </div>

              <div className="space-y-3 pt-1">
                {[
                  {
                    label: isUz ? 'Tasdiqlangan' : 'Подтверждён',
                    count: statusMap.CONFIRMED || 0,
                    color: 'bg-[#167b78]',
                  },
                  {
                    label: isUz ? 'Yakunlangan' : 'Завершён',
                    count: statusMap.COMPLETED || 0,
                    color: 'bg-emerald-600',
                  },
                  {
                    label: isUz ? 'Kutilmoqda' : 'В ожидании',
                    count: statusMap.PENDING || 0,
                    color: 'bg-amber-500',
                  },
                  {
                    label: isUz ? 'Klinikada qabulda' : 'В клинике',
                    count: statusMap.CHECKED_IN || 0,
                    color: 'bg-blue-600',
                  },
                  {
                    label: isUz ? 'Bekor qilingan' : 'Отменён',
                    count: statusMap.CANCELLED || 0,
                    color: 'bg-rose-500',
                  },
                  {
                    label: isUz ? 'Kelmadi' : 'Не явился',
                    count: statusMap.NO_SHOW || 0,
                    color: 'bg-slate-400',
                  },
                ].map((item, idx) => {
                  const total = summary.totalAppointments || 1;
                  const pct = Math.round((item.count / total) * 100);

                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-[#152f34]">{item.label}</span>
                        <span className="font-bold text-[#152f34]">
                          {item.count} {isUz ? 'ta' : ''} ({pct}%)
                        </span>
                      </div>
                      <div className="w-full h-2.5 bg-[#f3f8f7] rounded-full overflow-hidden border border-[#d8e5e2]">
                        <div
                          className={`h-full ${item.color} rounded-full transition-all duration-500`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Retention & Patient Loyalty Card (Placed in Left Column to fill empty space) */}
            <div className="ui-card space-y-3">
              <div className="flex items-center justify-between border-b border-[#d8e5e2] pb-2">
                <h2 className="text-sm font-bold text-[#152f34]">
                  {isUz ? 'Bemorlar sadoqati va tahlili' : 'Лояльность и аналитика пациентов'}
                </h2>
                <span className="text-xs text-[#167b78] font-bold bg-[#e0f2ed] px-2.5 py-0.5 rounded-md">
                  {isUz ? 'Mijozlar bazasi' : 'База клиентов'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-[#f3f8f7] rounded-xl border border-[#d8e5e2]">
                  <span className="text-[11px] text-[#52696e] block">{isUz ? 'Yangi bemorlar:' : 'Новые пациенты:'}</span>
                  <strong className="text-base font-black text-[#152f34] mt-0.5 block">
                    {summary.newPatients} {isUz ? 'ta' : ''}
                  </strong>
                </div>
                <div className="p-3 bg-[#eaf5f2] rounded-xl border border-[#b8ded5]">
                  <span className="text-[11px] text-[#167b78] block">{isUz ? 'Qayta murojaat:' : 'Повторные:'}</span>
                  <strong className="text-base font-black text-[#167b78] mt-0.5 block">
                    {summary.returningPatients} {isUz ? 'ta' : ''}
                  </strong>
                </div>
                <div className="p-3 bg-[#f3f8f7] rounded-xl border border-[#d8e5e2]">
                  <span className="text-[11px] text-[#52696e] block">{isUz ? 'Jami bemorlar:' : 'Всего пациентов:'}</span>
                  <strong className="text-base font-black text-[#152f34] mt-0.5 block">
                    {summary.uniquePatientsCount} {isUz ? 'nafar' : 'чел.'}
                  </strong>
                </div>
              </div>

              <p className="text-[11px] text-[#52696e] italic pt-1">
                {isUz
                  ? "* Qayta murojaat qilganlar — klinikada ilgari kamida bitta yakunlangan qabulga ega bo'lgan bemorlar."
                  : '* Повторные пациенты — пациенты, имеющие как минимум один завершенный прием в клинике ранее.'}
              </p>
            </div>

            {/* Popular Services & Service-Specific Revenue Card */}
            <div className="ui-card space-y-4">
              <div className="flex items-center justify-between border-b border-[#d8e5e2] pb-3">
                <div>
                  <h2 className="text-sm font-bold text-[#152f34]">
                    {isUz ? 'Xizmatlar tahlili va ko‘rsatkichlari' : 'Аналитика услуг и показатели'}
                  </h2>
                  <span className="text-[11px] text-[#52696e]">
                    {isUz
                      ? `Jami ${data?.totalServiceUsage ?? 0} ta muolaja bajarildi (${summary.servicesPerCompletedAppointment ?? summary.servicesPerAppointment ?? 0} xizmat/qabul)`
                      : `Всего выполнено ${data?.totalServiceUsage ?? 0} процедур (${summary.servicesPerCompletedAppointment ?? summary.servicesPerAppointment ?? 0} услуг/прием)`}
                  </span>
                </div>
                <Layers className="w-4 h-4 text-[#167b78]" />
              </div>

              {popularServices.length === 0 ? (
                <p className="text-xs text-[#52696e] text-center p-6 bg-[#f3f8f7] rounded-xl border border-dashed border-[#d8e5e2]">
                  {isUz ? "Xizmatlar bo'yicha ma'lumot yo'q" : 'Нет данных по услугам'}
                </p>
              ) : (
                <div className="space-y-3">
                  {popularServices.map((srv: any, idx) => (
                    <div key={idx} className="space-y-1.5 p-3 bg-[#f8fbfb] rounded-xl border border-[#e2eeee]">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-5 h-5 rounded-md bg-[#e0f2ed] text-[#167b78] font-bold text-[11px] flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-[#152f34] truncate">{srv.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] text-[#52696e]">
                            {srv.performedCount ?? srv.count} {isUz ? 'bajarilgan' : 'выполнено'}
                            {srv.bookedCount !== undefined && srv.bookedCount !== (srv.performedCount ?? srv.count) && (
                              <span className="text-[10px] text-[#718e95] ml-1">
                                ({srv.bookedCount} {isUz ? 'buyurtma' : 'заказ'})
                              </span>
                            )}
                          </span>
                          {srv.revenueMinor !== undefined && (
                            <span
                              className={`font-bold text-xs px-2 py-0.5 rounded-md ${
                                srv.revenueMinor < 0
                                  ? 'text-rose-700 bg-rose-50 border border-rose-200'
                                  : 'text-[#167b78] bg-[#e0f2ed]'
                              }`}
                            >
                              {srv.revenueMinor.toLocaleString(isUz ? 'uz-UZ' : 'ru-RU')} {isUz ? "so'm" : "сум"}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="w-full h-2 bg-white rounded-full overflow-hidden border border-[#d8e5e2]">
                        <div
                          className="h-full bg-[#167b78] rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(srv.percentage, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right 5 Cols: Doctor Performance & Workload (Compact & Scrollable) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Doctor Utilization & Workload Card */}
            <div className="ui-card space-y-4">
              <div className="flex items-center justify-between border-b border-[#d8e5e2] pb-3">
                <div>
                  <h2 className="text-sm font-bold text-[#152f34]">
                    {isUz ? 'Shifokorlar bandligi va yuklamasi' : 'Занятость и нагрузка врачей'}
                  </h2>
                  <span className="text-[11px] text-[#52696e]">
                    {isUz ? 'Ish soatlari va muolaja vaqti nisbati' : 'Соотношение рабочих часов и времени процедур'}
                  </span>
                </div>
                <Stethoscope className="w-4 h-4 text-[#167b78]" />
              </div>

              {doctorUtilization.length === 0 ? (
                <p className="text-xs text-[#52696e] text-center p-6 bg-[#f3f8f7] rounded-xl border border-dashed border-[#d8e5e2]">
                  {isUz ? "Shifokorlar bandligi ma'lumoti yo'q" : 'Нет данных о занятости врачей'}
                </p>
              ) : (
                <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                  {doctorUtilization.map((doc, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-[#f3f8f7] hover:bg-[#eaf5f2]/50 rounded-xl border border-[#d8e5e2] space-y-1.5 text-xs transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-[#e0f2ed] text-[#167b78] font-bold flex items-center justify-center text-xs shrink-0">
                            {doc.doctorName.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <span className="font-bold text-[#152f34] block truncate">{doc.doctorName}</span>
                            <span className="text-[10px] text-[#52696e]">
                              {doc.appointmentsCount} {isUz ? 'ta qabul' : 'приемов'}
                            </span>
                          </div>
                        </div>

                        <span className="font-black text-xs text-[#167b78] bg-[#e0f2ed] px-2.5 py-0.5 rounded-lg shrink-0">
                          {doc.utilizationRate}%
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="w-full h-1.5 bg-white rounded-full overflow-hidden border border-[#d8e5e2]">
                        <div
                          className="h-full bg-[#167b78] rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(doc.utilizationRate, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
