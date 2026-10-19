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
} from 'lucide-react';
import { AdminLayout } from '../../../components/AdminLayout';
import { CustomSelect, SelectOption } from '../../../components/CustomSelect';
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

      // Validate date range if both provided
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

  // Quick Preset Date Ranges
  const applyPreset = (preset: 'today' | 'week' | 'month' | 'clear') => {
    const todayStr = getClinicTodayDateString();
    if (preset === 'today') {
      setActivePreset('today');
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (preset === 'week') {
      setActivePreset('week');
      const bounds = getClinicWeekBoundaries(todayStr);
      const startDay = bounds.dateFrom.slice(0, 10);
      const endDay = bounds.dateTo.slice(0, 10);
      setStartDate(startDay);
      setEndDate(endDay);
    } else if (preset === 'month') {
      setActivePreset('month');
      const bounds = getClinicMonthBoundaries(todayStr);
      const startDay = bounds.dateFrom.slice(0, 10);
      const endDay = bounds.dateTo.slice(0, 10);
      setStartDate(startDay);
      setEndDate(endDay);
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
      <div className="space-y-8">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">
              {isUz ? 'Statistika va hisobotlar' : 'Статистика и отчеты'}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {isUz
                ? 'Klinika faoliyati, shifokorlar bandligi va qabullar ko\'rsatkichlari tahlili'
                : 'Анализ показателей клиники, занятости врачей и структуры приёмов'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadAnalytics}
              disabled={isLoading}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 shadow-sm text-xs font-bold flex items-center gap-2 disabled:opacity-50 transition-all"
              title={isUz ? 'Yangilash' : 'Обновить'}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-teal-700' : ''}`} />
              <span>{isUz ? 'Yangilash' : 'Обновить'}</span>
            </button>
          </div>
        </div>

        {/* Date & Dimension Filters Bar */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <Filter className="w-4 h-4 text-teal-700" />
              <span>{isUz ? 'Filtrlash parametrlari:' : 'Параметры фильтрации:'}</span>
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => applyPreset('today')}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${
                  activePreset === 'today'
                    ? 'bg-teal-700 text-white shadow-sm'
                    : 'text-slate-700 hover:bg-white'
                }`}
              >
                {isUz ? 'Bugun' : 'Сегодня'}
              </button>
              <button
                type="button"
                onClick={() => applyPreset('week')}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${
                  activePreset === 'week'
                    ? 'bg-teal-700 text-white shadow-sm'
                    : 'text-slate-700 hover:bg-white'
                }`}
              >
                {isUz ? 'Shu hafta' : 'Эта неделя'}
              </button>
              <button
                type="button"
                onClick={() => applyPreset('month')}
                className={`px-3 py-1 rounded-lg font-bold transition-all ${
                  activePreset === 'month'
                    ? 'bg-teal-700 text-white shadow-sm'
                    : 'text-slate-700 hover:bg-white'
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
                  className="px-2.5 py-1 rounded-lg font-bold text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  {isUz ? 'Tozalash' : 'Сброс'}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {/* Start Date */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">
                {isUz ? 'Dan (Sana)' : 'С (Дата)'}
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setActivePreset('custom');
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-600 outline-none"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">
                {isUz ? 'Gacha (Sana)' : 'По (Дата)'}
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setActivePreset('custom');
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-teal-600 outline-none"
              />
            </div>

            {/* Doctor Select */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">
                {isUz ? 'Shifokor' : 'Врач'}
              </label>
              <CustomSelect
                options={doctorOptions}
                value={selectedDoctorId}
                onChange={(val) => setSelectedDoctorId(val)}
                placeholder={isUz ? 'Barcha shifokorlar' : 'Все врачи'}
              />
            </div>

            {/* Branch Select */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">
                {isUz ? 'Filial' : 'Филиал'}
              </label>
              <CustomSelect
                options={branchOptions}
                value={selectedBranchId}
                onChange={(val) => setSelectedBranchId(val)}
                placeholder={isUz ? 'Barcha filiallar' : 'Все филиалы'}
              />
            </div>

            {/* Service Select */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 block mb-1">
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

        {/* Error Banner with Retry */}
        {fetchError && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-center justify-between gap-3 animate-fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{fetchError}</span>
            </div>
            <button
              onClick={loadAnalytics}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold shrink-0 text-xs"
            >
              {isUz ? 'Qayta urinish' : 'Повторить'}
            </button>
          </div>
        )}

        {/* Loading Skeleton */}
        {isLoading && !data && (
          <div className="space-y-6 animate-pulse">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-32 bg-slate-200 rounded-3xl" />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="h-64 bg-slate-200 rounded-3xl" />
              <div className="h-64 bg-slate-200 rounded-3xl" />
            </div>
          </div>
        )}

        {/* Main Content */}
        {data && (
          <div className="space-y-8">
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Total Appointments */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 relative overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {isUz ? 'Jami qabullar' : 'Всего приёмов'}
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                    <Calendar className="w-4 h-4" />
                  </div>
                </div>
                <p className="text-3xl font-black text-slate-900">{summary.totalAppointments}</p>
                <span className="text-[11px] text-slate-500 font-medium mt-1 block">
                  {isUz ? 'Tanlangan davrdagi qabullar soni' : 'Количество записей за выбранный период'}
                </span>
              </div>

              {/* Completed Appointments */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 relative overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {isUz ? 'Yakunlangan' : 'Завершено'}
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-black text-emerald-700">{summary.completionRate}%</p>
                  <span className="text-xs font-bold text-slate-500">
                    ({summary.completed} {isUz ? 'ta' : ''})
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 font-medium mt-1 block">
                  {isUz ? 'Muvaffaqiyatli o\'tkazilgan muolajalar' : 'Успешно проведённые процедуры'}
                </span>
              </div>

              {/* Cancelled & No-Show */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 relative overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {isUz ? 'Bekor qilingan' : 'Отменено'}
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center">
                    <XCircle className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-black text-rose-700">{summary.cancellationRate}%</p>
                  <span className="text-xs font-bold text-slate-500">
                    ({summary.cancelled} {isUz ? 'ta' : ''})
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 font-medium mt-1 block">
                  {summary.noShow > 0
                    ? isUz
                      ? `${summary.noShow} ta kelmagan (No-show)`
                      : `${summary.noShow} не явились`
                    : isUz
                    ? 'Bekor qilingan qabullar ulushi'
                    : 'Доля отменённых записей'}
                </span>
              </div>

              {/* Inquiry-to-Booking Conversion */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 relative overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {isUz ? 'Murojaatlar natijadorligi' : 'Конверсия обращений'}
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-black text-purple-700">{leads.conversionRate}%</p>
                  <span className="text-xs font-bold text-slate-500">
                    ({leads.converted}/{leads.totalLeads})
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 font-medium mt-1 block">
                  {isUz ? 'Qabulga aylangan qayta qo\'ng\'iroqlar' : 'Заявки, перешедшие в реальный приём'}
                </span>
              </div>
            </div>

            {/* Revenue / Recorded Payments Card */}
            <div className="bg-gradient-to-r from-teal-900 via-teal-800 to-slate-900 rounded-3xl p-6 sm:p-7 text-white shadow-lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-teal-300" />
                    <span className="text-xs font-bold uppercase tracking-wider text-teal-200">
                      {isUz ? 'Moliyaviy tushum hisoboti' : 'Отчет по кассовым поступлениям'}
                    </span>
                  </div>
                  <h3 className="text-2xl font-black">
                    {revenue.hasRecordedPayments
                      ? `${revenue.netRevenueMinor.toLocaleString('uz-UZ')} so'm`
                      : isUz
                      ? 'Kassada to\'lovlar qayd etilmagan'
                      : 'Платежи в кассе не зафиксированы'}
                  </h3>
                  <p className="text-xs text-teal-100/80 max-w-2xl">
                    {isUz
                      ? 'Eslatma: Ushbu ko\'rsatkich faqat kassaga rasmiy kiritilgan haqiqiy to\'lovlar (Payment) asosida shakllantirilgan bo\'lib, qabul xizmatlarining taxminiy narxlaridan alohida yuritiladi.'
                      : 'Примечание: Данный показатель формируется исключительно на основе фактически проведённых платежей (Payment) в кассе и учитывается отдельно от предварительной стоимости услуг.'}
                  </p>
                </div>

                {revenue.hasRecordedPayments && (
                  <div className="flex items-center gap-4 border-t sm:border-t-0 sm:border-l border-teal-700/60 pt-3 sm:pt-0 sm:pl-6 text-xs shrink-0">
                    <div>
                      <span className="text-teal-300 block">{isUz ? 'Kirim:' : 'Приход:'}</span>
                      <strong className="text-emerald-300 text-sm">
                        +{revenue.totalIncomeMinor.toLocaleString('uz-UZ')}
                      </strong>
                    </div>
                    {revenue.totalRefundsMinor > 0 && (
                      <div>
                        <span className="text-teal-300 block">{isUz ? 'Qaytarilgan:' : 'Возвраты:'}</span>
                        <strong className="text-rose-300 text-sm">
                          -{revenue.totalRefundsMinor.toLocaleString('uz-UZ')}
                        </strong>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Detailed Visual Breakdown Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Status Breakdown Bar */}
              <div className="lg:col-span-6 bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-200 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-slate-900">
                    {isUz ? 'Qabullar holati taqsimoti' : 'Распределение статусов приёмов'}
                  </h2>
                  <span className="text-xs text-slate-400 font-semibold">
                    {summary.totalAppointments} {isUz ? 'ta' : ''}
                  </span>
                </div>

                <div className="space-y-3 pt-2">
                  {[
                    {
                      label: isUz ? 'Tasdiqlangan' : 'Подтверждён',
                      count: statusMap.CONFIRMED || 0,
                      color: 'bg-teal-600',
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
                      label: isUz ? 'Kelmadi (No-show)' : 'Не явился',
                      count: statusMap.NO_SHOW || 0,
                      color: 'bg-slate-400',
                    },
                  ].map((item, idx) => {
                    const total = summary.totalAppointments || 1;
                    const pct = Math.round((item.count / total) * 100);

                    return (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-semibold text-slate-700">{item.label}</span>
                          <span className="font-bold text-slate-900">
                            {item.count} ({pct}%)
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
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

              {/* Popular Services Demand */}
              <div className="lg:col-span-6 bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-200 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-slate-900">
                    {isUz ? 'Talab yuqori xizmatlar' : 'Востребованные услуги'}
                  </h2>
                  <Award className="w-4 h-4 text-teal-700" />
                </div>

                {popularServices.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400 italic bg-slate-50 rounded-2xl">
                    {isUz
                      ? 'Ushbu parametrlar bo\'yicha xizmatlar ma\'lumoti mavjud emas'
                      : 'Нет данных по услугам для выбранных параметров'}
                  </div>
                ) : (
                  <div className="space-y-2.5 pt-1">
                    {popularServices.map((srv, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-slate-50 hover:bg-slate-100/80 rounded-2xl flex items-center justify-between text-xs transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-[11px] shrink-0">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-slate-900">{srv.name}</span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-extrabold text-teal-800 bg-teal-50 border border-teal-200/60 px-2.5 py-1 rounded-xl text-xs inline-block">
                            {srv.count} {isUz ? 'ta qabul' : 'приёмов'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Doctor Workload & Patient Retention */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Doctor Utilization */}
              <div className="lg:col-span-7 bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-200 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-slate-900">
                    {isUz ? 'Shifokorlar bandligi va yuklamasi' : 'Занятость и нагрузка врачей'}
                  </h2>
                  <Stethoscope className="w-4 h-4 text-teal-700" />
                </div>

                {doctorUtilization.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400 italic bg-slate-50 rounded-2xl">
                    {isUz ? 'Shifokorlar bandligi haqida ma\'lumot yo\'q' : 'Данные о занятости отсутствуют'}
                  </div>
                ) : (
                  <div className="space-y-3 pt-1">
                    {doctorUtilization.map((doc, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 bg-slate-50 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <span className="font-bold text-slate-900 block text-sm">{doc.doctorName}</span>
                          <span className="text-[11px] text-slate-500 mt-0.5 block">
                            {doc.totalHoursBooked} {isUz ? 'soat rejalashtirilgan' : 'часов запланировано'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-extrabold text-xs text-slate-800 bg-white px-3 py-1.5 rounded-xl border border-slate-200">
                            {doc.appointmentsCount} {isUz ? 'ta qabul' : 'приёмов'}
                          </span>
                          <span className="font-black text-xs text-teal-700 bg-teal-50 px-3 py-1.5 rounded-xl border border-teal-200">
                            {doc.utilizationRate}% {isUz ? 'bandlik' : 'занятость'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* New vs Returning Patients & Lead Funnel */}
              <div className="lg:col-span-5 space-y-6">
                {/* Retention Card */}
                <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-200 space-y-4">
                  <h2 className="text-base font-bold text-slate-900">
                    {isUz ? 'Bemorlar tahlili (Sadoqat)' : 'Анализ пациентов (Удержание)'}
                  </h2>
                  <div className="p-4 bg-teal-50/60 rounded-2xl border border-teal-100 space-y-3 text-xs">
                    <div className="flex justify-between items-center pb-2 border-b border-teal-100">
                      <span className="text-slate-600">{isUz ? 'Yangi bemorlar:' : 'Новые пациенты:'}</span>
                      <span className="font-bold text-teal-900 text-sm">
                        {summary.newPatients} {isUz ? 'ta' : ''}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pb-2 border-b border-teal-100">
                      <span className="text-slate-600">
                        {isUz ? 'Qayta murojaat qilganlar:' : 'Повторные пациенты:'}
                      </span>
                      <span className="font-bold text-teal-900 text-sm">
                        {summary.returningPatients} {isUz ? 'ta' : ''}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-600">
                        {isUz ? 'Jami xizmat ko\'rsatilgan bemorlar:' : 'Всего обслужено пациентов:'}
                      </span>
                      <span className="font-black text-slate-900 text-sm">
                        {summary.uniquePatientsCount} {isUz ? 'ta' : ''}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 italic">
                    {isUz
                      ? 'Qayta murojaat qilgan bemorlar — klinikada ilgari kamida bitta muvaffaqiyatli qabuldan o\'tgan bemorlar hisoblanadi.'
                      : 'Повторные пациенты — пациенты, у которых ранее был хотя бы один завершённый приём.'}
                  </p>
                </div>

                {/* Lead Status Breakdown Card */}
                <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-200 space-y-3">
                  <h2 className="text-base font-bold text-slate-900">
                    {isUz ? 'Murojaatlar holati' : 'Статусы обращений'}
                  </h2>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <span className="text-slate-500 block text-[11px]">{isUz ? 'Yangi:' : 'Новые:'}</span>
                      <strong className="text-slate-800 text-sm">
                        {leads.byStatus?.NEW || 0}
                      </strong>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <span className="text-slate-500 block text-[11px]">{isUz ? 'Bog\'lanilgan:' : 'Связались:'}</span>
                      <strong className="text-slate-800 text-sm">
                        {leads.byStatus?.CONTACTED || 0}
                      </strong>
                    </div>
                    <div className="p-3 bg-teal-50 rounded-xl border border-teal-100">
                      <span className="text-teal-700 block text-[11px]">{isUz ? 'Qabulga yozildi:' : 'Записаны:'}</span>
                      <strong className="text-teal-900 text-sm">
                        {leads.byStatus?.BOOKED || 0}
                      </strong>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl">
                      <span className="text-slate-500 block text-[11px]">{isUz ? 'Yopilgan:' : 'Закрыты:'}</span>
                      <strong className="text-slate-800 text-sm">
                        {leads.byStatus?.CLOSED || 0}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
