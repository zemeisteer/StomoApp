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
  BellRing,
  Check,
  X,
  ExternalLink,
  CalendarCheck,
} from 'lucide-react';
import { AdminLayout } from '../../components/AdminLayout';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';

export default function AdminOverviewPage() {
  const { user } = useAuth();
  const [todayAppointments, setTodayAppointments] = useState<any[]>([]);
  const [pendingAppointments, setPendingAppointments] = useState<any[]>([]);
  const [upcomingAppointments, setUpcomingAppointments] = useState<any[]>([]);
  const [scheduleTab, setScheduleTab] = useState<'today' | 'upcoming'>('today');
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [recentLeads, setRecentLeads] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const nowIso = new Date().toISOString();
      const [todayRes, pendingRes, upcomingRes, analyticsRes, leadsRes] = await Promise.all([
        api.getTodayAppointments().catch(() => []),
        api.getAdminAppointments({ status: 'PENDING', limit: 50 }).catch(() => ({ items: [] })),
        api.getAdminAppointments({ status: 'CONFIRMED', limit: 20, dateFrom: nowIso }).catch(() => ({ items: [] })),
        api.getAnalyticsOverview().catch(() => null),
        api.getAdminLeads('NEW', 1, 5).catch(() => ({ items: [] })),
      ]);

      const today = todayRes || [];
      const upcoming = upcomingRes?.items || [];
      setTodayAppointments(today);
      setPendingAppointments(pendingRes?.items || []);
      setUpcomingAppointments(upcoming);
      setAnalytics(analyticsRes);
      setRecentLeads(leadsRes?.items || []);

      // If today has no appointments, but upcoming has appointments, default to upcoming
      if (today.length === 0 && upcoming.length > 0) {
        setScheduleTab('upcoming');
      }
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
      if (newStatus === 'CONFIRMED') {
        setStatusFeedback("Qabul muvaffaqiyatli tasdiqlandi! U shifokorning rasmiy ish jadvaliga (Taqvimga) kiritildi.");
        setScheduleTab('upcoming');
        setTimeout(() => setStatusFeedback(null), 8000);
      }
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
              Klinika boshqaruv paneli, yangi buyurtmalar va tasdiqlangan qabullar jadvali
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              className="px-3.5 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 flex items-center gap-1.5 shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Yangilash</span>
            </button>
            <Link
              href="/admin/calendar"
              className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 transition-colors"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Taqvimga o&apos;tish</span>
            </Link>
          </div>
        </div>

        {/* Action Status Feedback Banner */}
        {statusFeedback && (
          <div className="bg-emerald-50 border-2 border-emerald-400 rounded-2xl p-4 flex items-center justify-between gap-3 text-xs text-emerald-900 shadow-sm animate-fade-in">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span className="font-bold">{statusFeedback}</span>
            </div>
            <button
              onClick={() => setStatusFeedback(null)}
              className="p-1 hover:bg-emerald-100 rounded-lg text-emerald-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Card 1: Kutilayotgan arizalar (Website Bookings) */}
          <div
            className={`rounded-3xl p-6 shadow-sm border transition-all ${
              pendingAppointments.length > 0
                ? 'bg-amber-50/70 border-amber-300 ring-2 ring-amber-400/20'
                : 'bg-white border-slate-200/80'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                <BellRing className="w-3.5 h-3.5" />
                <span>Yangi arizalar</span>
              </span>
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                  pendingAppointments.length > 0
                    ? 'bg-amber-500 text-white animate-pulse'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {pendingAppointments.length}
              </div>
            </div>
            <p className="text-2xl font-black text-slate-900">{pendingAppointments.length}</p>
            <span className="text-[11px] text-amber-800 font-semibold mt-1 block">
              {pendingAppointments.length > 0
                ? 'Tasdiqlash kutilayotgan yangi qabullar'
                : 'Barcha arizalar ko\'rib chiqilgan'}
            </span>
          </div>

          {/* Card 2: Bugungi qabullar */}
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

          {/* Card 3: Rejalashtirilgan yaqin qabullar */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Yaqin qabullar
              </span>
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
                <CalendarCheck className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-slate-900">{upcomingAppointments.length}</p>
            <span className="text-[11px] text-indigo-700 font-semibold mt-1 block">
              Tasdiqlangan kelgusi qabullar
            </span>
          </div>

          {/* Card 4: Jami qabullar */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Jami qabullar
              </span>
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-slate-900">{summary.totalAppointments}</p>
            <span className="text-[11px] text-emerald-600 font-semibold mt-1 block">
              {summary.completionRate}% yakunlanish darajasi
            </span>
          </div>
        </div>

        {/* PROMINENT SECTION: Saytdan kelgan yangi arizalar (Pending Bookings) */}
        {pendingAppointments.length > 0 && (
          <div className="bg-gradient-to-br from-amber-50 via-white to-orange-50 border-2 border-amber-300 rounded-3xl p-6 sm:p-7 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-amber-200/80 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/25">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                    Saytdan kelgan yangi qabullar
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-white text-xs font-black">
                      {pendingAppointments.length} ta kutilmoqda
                    </span>
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Ushbu arizalarni tasdiqlaganingizdan so&apos;ng, ular avtomatik tarzda shifokorning rasmiy ish jadvaliga (Taqvimga) biriktiriladi.
                  </p>
                </div>
              </div>

              <Link
                href="/admin/calendar?status=PENDING"
                className="text-xs font-bold text-amber-900 hover:text-amber-950 flex items-center gap-1.5 self-start sm:self-center px-3.5 py-2 bg-white rounded-xl border border-amber-300 shadow-sm transition-all"
              >
                <span>Taqvimda ko&apos;rish</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {pendingAppointments.map((appt) => {
                const dateObj = new Date(appt.startTime);
                const dateFormatted = dateObj.toLocaleDateString('uz-UZ', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  timeZone: 'Asia/Tashkent',
                });
                const timeFormatted = dateObj.toLocaleTimeString('uz-UZ', {
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZone: 'Asia/Tashkent',
                });

                return (
                  <div
                    key={appt.id}
                    className="bg-white rounded-2xl p-5 border border-amber-200 shadow-sm flex flex-col justify-between gap-4 hover:border-amber-400 hover:shadow-md transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-slate-900">
                            {appt.patient?.fullName || appt.patientName}
                          </h3>
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                            {appt.source === 'website' ? 'Sayt orqali' : 'Admin'}
                          </span>
                        </div>
                        <a
                          href={`tel:${appt.patient?.phone || ''}`}
                          className="text-xs font-semibold text-teal-700 hover:underline flex items-center gap-1 mt-1"
                        >
                          <PhoneCall className="w-3.5 h-3.5" />
                          <span>{appt.patient?.phone || 'Telefon kiritilmagan'}</span>
                        </a>
                      </div>

                      <div className="text-right">
                        <span className="inline-block px-3 py-1 rounded-xl bg-amber-100 text-amber-900 text-xs font-black">
                          {dateFormatted}
                        </span>
                        <div className="text-sm font-extrabold text-slate-900 mt-1">
                          ⏰ {timeFormatted}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Xizmat</span>
                        <span className="font-semibold text-slate-800 line-clamp-1">
                          {appt.serviceName || appt.service?.nameUz || 'Maslahat'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px] uppercase font-bold">Shifokor</span>
                        <span className="font-semibold text-slate-800 line-clamp-1">
                          Dr. {appt.doctor?.firstNameUz} {appt.doctor?.lastNameUz}
                        </span>
                      </div>
                      {appt.branch && (
                        <div className="col-span-2 pt-1 border-t border-slate-200/50">
                          <span className="text-slate-400 text-[10px] uppercase font-bold mr-1">Filial:</span>
                          <span className="font-medium text-slate-700">{appt.branch.nameUz}</span>
                        </div>
                      )}
                      {appt.note && (
                        <div className="col-span-2 text-[11px] text-slate-500 italic">
                          Izoh: &quot;{appt.note}&quot;
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
                      <Link
                        href={`/admin/calendar?status=PENDING`}
                        className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Tafsilotlar</span>
                      </Link>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={isUpdatingStatus === appt.id}
                          onClick={() => handleStatusChange(appt.id, 'CANCELLED')}
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Bekor qilish</span>
                        </button>
                        <button
                          type="button"
                          disabled={isUpdatingStatus === appt.id}
                          onClick={() => handleStatusChange(appt.id, 'CONFIRMED')}
                          className="px-4 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{isUpdatingStatus === appt.id ? 'Tasdiqlanmoqda...' : 'Tasdiqlash'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Two Columns: Appointments Schedule (Today / Upcoming) & Recent Leads */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Appointments Schedule Timeline with Tabs */}
          <div className="lg:col-span-8 bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-200/80 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setScheduleTab('today')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    scheduleTab === 'today'
                      ? 'bg-white text-teal-800 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Bugungi qabullar ({todayAppointments.length})
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleTab('upcoming')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    scheduleTab === 'upcoming'
                      ? 'bg-white text-teal-800 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tasdiqlangan yaqin qabullar ({upcomingAppointments.length})
                </button>
              </div>

              <Link
                href="/admin/calendar"
                className="text-xs font-bold text-teal-700 hover:text-teal-800 flex items-center gap-1 shrink-0"
              >
                <span>To&apos;liq taqvim</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {isLoading ? (
              <div className="p-10 text-center text-xs text-slate-400">Yuklanmoqda...</div>
            ) : scheduleTab === 'today' ? (
              todayAppointments.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-2">
                  <p>Bugungi kunga hozircha faol qabullar mavjud emas.</p>
                  {upcomingAppointments.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setScheduleTab('upcoming')}
                      className="text-xs font-bold text-teal-700 hover:underline"
                    >
                      Kelgusi kunlardagi ({upcomingAppointments.length} ta) tasdiqlangan qabullarni ko&apos;rish →
                    </button>
                  )}
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
              )
            ) : (
              /* Upcoming Confirmed Appointments List */
              upcomingAppointments.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  Kelgusi kunlarga hozircha tasdiqlangan qabullar mavjud emas.
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingAppointments.map((appt) => {
                    const dateObj = new Date(appt.startTime);
                    const dateFormatted = dateObj.toLocaleDateString('uz-UZ', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'long',
                      timeZone: 'Asia/Tashkent',
                    });
                    const timeStr = dateObj.toLocaleTimeString('uz-UZ', {
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'Asia/Tashkent',
                    });

                    return (
                      <div
                        key={appt.id}
                        className="p-4 rounded-2xl border border-teal-100 hover:border-teal-300 bg-teal-50/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all"
                      >
                        <div className="flex items-start gap-3">
                          <div className="px-3 py-2 rounded-xl bg-teal-700 text-white font-extrabold text-xs text-center shrink-0">
                            <div>{timeStr}</div>
                            <div className="text-[10px] font-medium opacity-90">{dateFormatted}</div>
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-slate-900">
                                {appt.patient?.fullName || appt.patientName}
                              </p>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                                Tasdiqlangan
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 mt-0.5">
                              {appt.serviceName || appt.service?.nameUz} • Dr. {appt.doctor?.firstNameUz} {appt.doctor?.lastNameUz}
                            </p>
                            <a
                              href={`tel:${appt.patient?.phone || ''}`}
                              className="text-[11px] text-teal-700 hover:underline flex items-center gap-1 mt-0.5"
                            >
                              <PhoneCall className="w-3 h-3" />
                              <span>{appt.patient?.phone}</span>
                            </a>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center">
                          <Link
                            href={`/admin/calendar`}
                            className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold shadow-sm"
                          >
                            Taqvimda ko&apos;rish
                          </Link>
                          <button
                            type="button"
                            disabled={isUpdatingStatus === appt.id}
                            onClick={() => handleStatusChange(appt.id, 'CANCELLED')}
                            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold"
                          >
                            Bekor qilish
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
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
