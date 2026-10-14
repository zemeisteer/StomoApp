'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Calendar,
  Clock,
  User,
  Users,
  PhoneCall,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { AdminLayout } from '../../components/AdminLayout';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';

export default function AdminOverviewPage() {
  const { user } = useAuth();
  const [todayAppointments, setTodayAppointments] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [recentLeads, setRecentLeads] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [todayRes, analyticsRes, leadsRes] = await Promise.all([
        api.getTodayAppointments().catch(() => []),
        api.getAnalyticsOverview().catch(() => null),
        api.getAdminLeads('NEW', 1, 5).catch(() => ({ items: [] })),
      ]);

      setTodayAppointments(todayRes || []);
      setAnalytics(analyticsRes);
      setRecentLeads(leadsRes.items || []);
    } catch (e) {
      console.error('Failed to load admin overview', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleStatusChange = async (appointmentId: string, newStatus: string) => {
    try {
      setIsUpdatingStatus(appointmentId);
      await api.updateAppointmentStatus(appointmentId, newStatus);
      await loadData();
    } catch (err: any) {
      alert(err?.message || 'Holatni o\'zgartirishda xatolik yuz berdi');
    } finally {
      setIsUpdatingStatus(null);
    }
  };

  const summary = analytics?.summary || {
    totalAppointments: 0,
    completed: 0,
    cancelled: 0,
    completionRate: 0,
  };

  return (
    <AdminLayout allowedRoles={['OWNER', 'ADMIN', 'DOCTOR']}>
      <div className="space-y-8">
        {/* Page Topbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              Assalomu alaykum, {user?.email.split('@')[0]}!
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Bugungi klinika faoliyati va navbatdagi qabullar ko&apos;rsatkichlari
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              className="px-3.5 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 flex items-center gap-1.5 shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Yangilash</span>
            </button>
            <Link
              href="/admin/calendar"
              className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Taqvimga o&apos;tish</span>
            </Link>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Bugungi qabullar
              </span>
              <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                <Calendar className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-slate-900">{todayAppointments.length}</p>
            <span className="text-[11px] text-teal-700 font-semibold mt-1 block">
              Bugungi kunga rejalashtirilgan
            </span>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Jami qabullar
              </span>
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-slate-900">{summary.totalAppointments}</p>
            <span className="text-[11px] text-slate-500 font-medium mt-1 block">
              Barcha filiallar bo&apos;yicha
            </span>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Muvaffaqiyatli qabul
              </span>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-slate-900">{summary.completed}</p>
            <span className="text-[11px] text-emerald-600 font-semibold mt-1 block">
              {summary.completionRate}% yakunlanish darajasi
            </span>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Yangi qayta qo&apos;ng&apos;iroqlar
              </span>
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                <PhoneCall className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-slate-900">{recentLeads.length}</p>
            <span className="text-[11px] text-amber-700 font-semibold mt-1 block">
              Tezkor javob kutilmoqda
            </span>
          </div>
        </div>

        {/* Two Columns: Today's Schedule & Recent Leads */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Today's Appointments Timeline */}
          <div className="lg:col-span-8 bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-200/80 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Bugungi qabullar jadvali</h2>
                <p className="text-xs text-slate-400">
                  {new Date().toLocaleDateString('uz-UZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
              <Link
                href="/admin/calendar"
                className="text-xs font-bold text-teal-700 hover:text-teal-800 flex items-center gap-1"
              >
                <span>To&apos;liq taqvim</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {isLoading ? (
              <div className="p-10 text-center text-xs text-slate-400">Yuklanmoqda...</div>
            ) : todayAppointments.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                Bugungi kunga hozircha faol qabullar mavjud emas.
              </div>
            ) : (
              <div className="space-y-3">
                {todayAppointments.map((appt) => {
                  const timeStr = new Date(appt.startTime).toLocaleTimeString('uz-UZ', {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Asia/Tashkent',
                  });

                  return (
                    <div
                      key={appt.id}
                      className="p-4 rounded-2xl border border-slate-100 hover:border-teal-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-14 h-11 rounded-xl bg-teal-100/70 text-teal-900 font-extrabold text-sm flex items-center justify-center shrink-0">
                          {timeStr}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">
                            {appt.patient?.fullName || appt.patientName}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {appt.serviceName} • Dr. {appt.doctor?.firstNameUz} {appt.doctor?.lastNameUz}
                          </p>
                          <p className="text-[11px] text-slate-400">{appt.patient?.phone}</p>
                        </div>
                      </div>

                      {/* Action buttons based on status */}
                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-700">
                          {appt.status}
                        </span>

                        {appt.status === 'PENDING' && (
                          <button
                            type="button"
                            disabled={isUpdatingStatus === appt.id}
                            onClick={() => handleStatusChange(appt.id, 'CONFIRMED')}
                            className="px-3 py-1 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-xs font-bold shadow-sm"
                          >
                            Tasdiqlash
                          </button>
                        )}

                        {appt.status === 'CONFIRMED' && (
                          <button
                            type="button"
                            disabled={isUpdatingStatus === appt.id}
                            onClick={() => handleStatusChange(appt.id, 'CHECKED_IN')}
                            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm"
                          >
                            Keldi
                          </button>
                        )}

                        {appt.status === 'CHECKED_IN' && (
                          <button
                            type="button"
                            disabled={isUpdatingStatus === appt.id}
                            onClick={() => handleStatusChange(appt.id, 'COMPLETED')}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm"
                          >
                            Yakunlash
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Callback Leads Needing Attention */}
          <div className="lg:col-span-4 bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-200/80 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Yangi murojaatlar</h2>
                <p className="text-xs text-slate-400">Qayta qo&apos;ng&apos;iroq kutayotgan lidlar</p>
              </div>
              <Link
                href="/admin/leads"
                className="text-xs font-bold text-teal-700 hover:text-teal-800"
              >
                Barchasi
              </Link>
            </div>

            {recentLeads.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl">
                Yangi murojaatlar yo&apos;q.
              </div>
            ) : (
              <div className="space-y-3">
                {recentLeads.map((lead) => (
                  <div
                    key={lead.id}
                    className="p-3.5 rounded-2xl border border-slate-100 hover:border-teal-200 bg-slate-50/50 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-slate-900">{lead.fullName}</p>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                        {lead.status}
                      </span>
                    </div>
                    <a
                      href={`tel:${lead.phone}`}
                      className="text-xs font-semibold text-teal-700 hover:underline block"
                    >
                      {lead.phone}
                    </a>
                    {lead.notes && (
                      <p className="text-[11px] text-slate-500 line-clamp-1">{lead.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
