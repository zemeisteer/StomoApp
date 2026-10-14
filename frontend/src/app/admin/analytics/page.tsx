'use client';

import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  DollarSign,
  Filter,
  RefreshCw,
  HelpCircle,
} from 'lucide-react';
import { AdminLayout } from '../../../components/AdminLayout';
import { api } from '../../../lib/api';

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<any | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadAnalytics = async () => {
    try {
      setIsLoading(true);
      const res = await api.getAnalyticsOverview(startDate || undefined, endDate || undefined);
      setData(res);
    } catch (e) {
      console.error('Failed to load analytics', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [startDate, endDate]);

  const summary = data?.summary || {
    totalAppointments: 0,
    completed: 0,
    cancelled: 0,
    noShow: 0,
    completionRate: 0,
    cancellationRate: 0,
  };

  const statusMap = data?.statusBreakdown || {};
  const popularServices = data?.popularServices || [];
  const doctorUtilization = data?.doctorUtilization || [];
  const patientRetention = data?.patientRetention || { newPatients: 0, returningPatients: 0, totalPatients: 0 };
  const leadConversion = data?.leadConversion || { totalLeads: 0, convertedLeads: 0, conversionRate: 0 };
  const revenue = data?.revenue || { totalPayments: 0, totalRefunds: 0, netRevenue: 0 };

  return (
    <AdminLayout allowedRoles={['OWNER', 'ADMIN']}>
      <div className="space-y-8">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">
              Klinika tahlili va ko&apos;rsatkichlari (Analytics)
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Haqiqiy ma&apos;lumotlar bazasi agregatsiyasi asosida shakllantirilgan operatsion tahlil
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadAnalytics}
              className="p-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 shadow-sm"
              title="Yangilash"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Date Filters Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2 font-bold text-slate-700">
            <Filter className="w-4 h-4 text-teal-700" />
            <span>Davr:</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400">Dan:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-slate-50"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400">Gacha:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-slate-50"
            />
          </div>

          {(startDate || endDate) && (
            <button
              type="button"
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
              className="text-teal-700 font-bold hover:underline"
            >
              Tozalash
            </button>
          )}

          <div className="ml-auto text-slate-400 text-[11px]">
            Vaqt zonasi: <strong>Asia/Tashkent</strong>
          </div>
        </div>

        {/* Operational KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Jami buyurtmalar
              </span>
              <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                <Calendar className="w-4 h-4" />
              </div>
            </div>
            <p className="text-3xl font-black text-slate-900">{summary.totalAppointments}</p>
            <span className="text-[11px] text-slate-500 font-medium mt-1 block">
              Tanlangan davrdagi qabullar soni
            </span>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Yakunlanish darajasi
              </span>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <p className="text-3xl font-black text-emerald-700">{summary.completionRate}%</p>
            <span className="text-[11px] text-slate-500 font-medium mt-1 block">
              {summary.completed} ta muvaffaqiyatli qabul
            </span>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Bekor qilinish darajasi
              </span>
              <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center">
                <XCircle className="w-4 h-4" />
              </div>
            </div>
            <p className="text-3xl font-black text-rose-700">{summary.cancellationRate}%</p>
            <span className="text-[11px] text-slate-500 font-medium mt-1 block">
              {summary.cancelled} ta bekor qilingan
            </span>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Lid konversiyasi
              </span>
              <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <p className="text-3xl font-black text-purple-700">{leadConversion.conversionRate}%</p>
            <span className="text-[11px] text-slate-500 font-medium mt-1 block">
              {leadConversion.convertedLeads} / {leadConversion.totalLeads} lidlar qabulga aylandi
            </span>
          </div>
        </div>

        {/* Detailed Breakdown Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Status Breakdown Bar */}
          <div className="lg:col-span-6 bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-200 space-y-4">
            <h2 className="text-base font-bold text-slate-900">Qabullar holati taqsimoti</h2>
            <div className="space-y-3 pt-2">
              {[
                { label: 'Tasdiqlangan (CONFIRMED)', count: statusMap.CONFIRMED || 0, color: 'bg-teal-600' },
                { label: 'Muvaffaqiyatli yakunlangan (COMPLETED)', count: statusMap.COMPLETED || 0, color: 'bg-emerald-600' },
                { label: 'Kutilmoqda (PENDING)', count: statusMap.PENDING || 0, color: 'bg-amber-500' },
                { label: 'Klinikada qabulda (CHECKED_IN)', count: statusMap.CHECKED_IN || 0, color: 'bg-blue-600' },
                { label: 'Bekor qilingan (CANCELLED)', count: statusMap.CANCELLED || 0, color: 'bg-rose-500' },
                { label: 'Kelmadi (NO_SHOW)', count: statusMap.NO_SHOW || 0, color: 'bg-slate-400' },
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
            <h2 className="text-base font-bold text-slate-900">Talab yuqori xizmatlar</h2>
            {popularServices.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">Ma&apos;lumotlar yo&apos;q.</p>
            ) : (
              <div className="space-y-3 pt-2">
                {popularServices.map((srv: any, idx: number) => {
                  return (
                    <div
                      key={idx}
                      className="p-3 bg-slate-50 rounded-2xl flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-slate-900 block">{srv.serviceName}</span>
                        <span className="text-[11px] text-slate-400 uppercase">
                          {srv.category}
                        </span>
                      </div>
                      <span className="font-black text-teal-800 text-sm bg-teal-50 px-3 py-1 rounded-xl">
                        {srv.count} ta qabul
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Doctor Utilization & Patient Retention */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Doctor Utilization */}
          <div className="lg:col-span-7 bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-200 space-y-4">
            <h2 className="text-base font-bold text-slate-900">Shifokorlar bandligi va yuklamasi</h2>
            {doctorUtilization.length === 0 ? (
              <p className="text-xs text-slate-500 py-8 text-center">Ma&apos;lumotlar yo&apos;q.</p>
            ) : (
              <div className="space-y-3 pt-2">
                {doctorUtilization.map((doc: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3.5 bg-slate-50 rounded-2xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-900 block">{doc.doctorName}</span>
                      <span className="text-[11px] text-slate-400">
                        {doc.completedAppointments} ta muvaffaqiyatli yakunlangan
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-extrabold text-sm text-slate-800 block">
                        {doc.appointmentCount} ta qabul
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* New vs Returning Patients */}
          <div className="lg:col-span-5 bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-200 space-y-4">
            <h2 className="text-base font-bold text-slate-900">Bemorlar sadoqati (Retention)</h2>
            <div className="p-5 bg-teal-50/50 rounded-2xl border border-teal-100 space-y-4 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-teal-100">
                <span className="text-slate-600">Yangi bemorlar:</span>
                <span className="font-bold text-teal-900 text-sm">
                  {patientRetention.newPatients} ta
                </span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-teal-100">
                <span className="text-slate-600">Qayta murojaat qilganlar:</span>
                <span className="font-bold text-teal-900 text-sm">
                  {patientRetention.returningPatients} ta
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-600">Jami faol bemorlar:</span>
                <span className="font-bold text-slate-900 text-sm">
                  {patientRetention.totalPatients} ta
                </span>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl text-[11px] text-slate-500 flex items-start gap-2">
              <HelpCircle className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
              <span>
                Qayta murojaat qilganlar — klinikada kamida 2 marta qabuldan o&apos;tgan bemorlar hisoblanadi.
              </span>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
