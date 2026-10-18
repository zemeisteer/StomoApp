'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Stethoscope,
} from 'lucide-react';
import { AdminLayout } from '../../components/AdminLayout';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { formatClinicDate, formatClinicTime, getClinicTodayDateString } from '../../lib/dateFormat';

export default function AdminOverviewPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { t, language } = useI18n();

  const [todayAppointments, setTodayAppointments] = useState<any[]>([]);
  const [pendingAppointments, setPendingAppointments] = useState<any[]>([]);
  const [pendingTotal, setPendingTotal] = useState<number>(0);
  const [pendingPage, setPendingPage] = useState<number>(1);
  const pendingPageSize = 6;

  const [upcomingAppointments, setUpcomingAppointments] = useState<any[]>([]);
  const [completedDoctorCount, setCompletedDoctorCount] = useState<number>(0);
  const [scheduleTab, setScheduleTab] = useState<'today' | 'upcoming'>('today');
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  const [analytics, setAnalytics] = useState<any | null>(null);
  const [analyticsUnavailable, setAnalyticsUnavailable] = useState(false);
  const [recentLeads, setRecentLeads] = useState<any[]>([]);
  const [leadsUnavailable, setLeadsUnavailable] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Per-appointment mutation map: { [appointmentId]: 'CONFIRMED' | 'CANCELLED' | ... }
  const [mutatingMap, setMutatingMap] = useState<Record<string, string>>({});

  // Cancellation confirmation modal state
  const [cancellationTarget, setCancellationTarget] = useState<any | null>(null);

  // Request race condition guard & timer ref
  const loadReqSeqRef = useRef<number>(0);
  const feedbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  const getStatusLabel = (status: string) => {
    const key = status as keyof typeof t.statuses;
    return t.statuses[key] || status;
  };

  const getLeadStatusLabel = (status: string) => {
    switch (status) {
      case 'NEW':
        return language === 'ru' ? 'Новая' : 'Yangi';
      case 'CONTACTED':
        return language === 'ru' ? 'В обработке' : 'Bog\'lanildi';
      case 'BOOKED':
        return language === 'ru' ? 'Записан' : 'Qabulga yozildi';
      case 'CLOSED':
        return language === 'ru' ? 'Закрыта' : 'Yopilgan';
      default:
        return status;
    }
  };

  const loadData = useCallback(async () => {
    if (!user) return;

    const currentSeq = ++loadReqSeqRef.current;
    try {
      setIsLoading(true);
      setFetchError(null);

      const isDoctor = user.role === 'DOCTOR';
      const scopedDoctorId = isDoctor ? user.doctorId : undefined;
      const todayDateStr = getClinicTodayDateString();

      const pendingParams: Record<string, any> = {
        status: 'PENDING',
        page: pendingPage,
        limit: pendingPageSize,
      };
      if (scopedDoctorId) pendingParams.doctorId = scopedDoctorId;

      const upcomingParams: Record<string, any> = {
        status: 'CONFIRMED',
        limit: 20,
        dateFrom: `${todayDateStr}T00:00:00.000+05:00`,
      };
      if (scopedDoctorId) upcomingParams.doctorId = scopedDoctorId;

      if (isDoctor) {
        // DOCTOR: Strictly request permitted doctor-scoped endpoints
        // Never call clinic-wide analytics or leads endpoints (403 Forbidden)
        const completedParams: Record<string, any> = {
          status: 'COMPLETED',
          limit: 1,
        };
        if (scopedDoctorId) completedParams.doctorId = scopedDoctorId;

        const [todaySettled, pendingSettled, upcomingSettled, completedSettled] = await Promise.allSettled([
          api.getTodayAppointments(),
          api.getAdminAppointments(pendingParams),
          api.getAdminAppointments(upcomingParams),
          api.getAdminAppointments(completedParams),
        ]);

        if (currentSeq !== loadReqSeqRef.current) return;

        if (todaySettled.status === 'fulfilled') {
          const allToday = Array.isArray(todaySettled.value) ? todaySettled.value : [];
          setTodayAppointments(allToday);
        } else {
          console.warn('Doctor today appointments failed', todaySettled.reason);
          setTodayAppointments([]);
        }

        if (pendingSettled.status === 'fulfilled') {
          setPendingAppointments(pendingSettled.value?.items || []);
          setPendingTotal(pendingSettled.value?.total || 0);
        } else {
          console.warn('Doctor pending appointments failed', pendingSettled.reason);
          setPendingAppointments([]);
          setPendingTotal(0);
        }

        if (upcomingSettled.status === 'fulfilled') {
          const upList = upcomingSettled.value?.items || [];
          setUpcomingAppointments(upList);
          if (todayAppointments.length === 0 && upList.length > 0) {
            setScheduleTab('upcoming');
          }
        } else {
          setUpcomingAppointments([]);
        }

        if (completedSettled.status === 'fulfilled') {
          setCompletedDoctorCount(completedSettled.value?.total || 0);
        }

        setAnalytics(null);
        setAnalyticsUnavailable(false);
        setRecentLeads([]);
        setLeadsUnavailable(false);
      } else {
        // OWNER / ADMIN: Request full operational overview using Promise.allSettled
        // Independent panel failures do not prevent remaining dashboard panels from rendering
        const [todaySettled, pendingSettled, upcomingSettled, analyticsSettled, leadsSettled] = await Promise.allSettled([
          api.getTodayAppointments(),
          api.getAdminAppointments(pendingParams),
          api.getAdminAppointments(upcomingParams),
          api.getAnalyticsOverview(),
          api.getAdminLeads('NEW', 1, 5),
        ]);

        if (currentSeq !== loadReqSeqRef.current) return;

        if (todaySettled.status === 'fulfilled') {
          const today = Array.isArray(todaySettled.value) ? todaySettled.value : [];
          setTodayAppointments(today);
        } else {
          console.warn('Today appointments failed', todaySettled.reason);
          setTodayAppointments([]);
        }

        if (pendingSettled.status === 'fulfilled') {
          setPendingAppointments(pendingSettled.value?.items || []);
          setPendingTotal(pendingSettled.value?.total || 0);
        } else {
          console.warn('Pending appointments failed', pendingSettled.reason);
          setPendingAppointments([]);
          setPendingTotal(0);
        }

        if (upcomingSettled.status === 'fulfilled') {
          const upcoming = upcomingSettled.value?.items || [];
          setUpcomingAppointments(upcoming);
          if (todayAppointments.length === 0 && upcoming.length > 0) {
            setScheduleTab('upcoming');
          }
        } else {
          setUpcomingAppointments([]);
        }

        if (analyticsSettled.status === 'fulfilled') {
          setAnalytics(analyticsSettled.value);
          setAnalyticsUnavailable(false);
        } else {
          console.warn('Analytics overview failed', analyticsSettled.reason);
          setAnalytics(null);
          setAnalyticsUnavailable(true);
        }

        if (leadsSettled.status === 'fulfilled') {
          setRecentLeads(leadsSettled.value?.items || []);
          setLeadsUnavailable(false);
        } else {
          console.warn('Leads query failed', leadsSettled.reason);
          setRecentLeads([]);
          setLeadsUnavailable(true);
        }
      }
    } catch (err: any) {
      if (currentSeq === loadReqSeqRef.current) {
        console.error('Failed to load admin overview', err);
        setFetchError(err?.message || 'Ma\'lumotlarni yuklashda xatolik yuz berdi');
      }
    } finally {
      if (currentSeq === loadReqSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, [pendingPage, user]);

  useEffect(() => {
    if (!isAuthLoading && user) {
      loadData();
    }
  }, [loadData, isAuthLoading, user]);

  const handleStatusChange = async (
    appointmentId: string,
    newStatus: 'CONFIRMED' | 'CANCELLED' | 'CHECKED_IN' | 'COMPLETED'
  ) => {
    // Prevent duplicate clicks on the same appointment
    if (mutatingMap[appointmentId]) return;

    try {
      setMutatingMap((prev) => ({ ...prev, [appointmentId]: newStatus }));

      await api.updateAppointmentStatus(appointmentId, newStatus);

      // Instantly synchronize sidebar badge across app
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('pendingCountChanged'));
      }

      const msg =
        newStatus === 'CONFIRMED'
          ? language === 'ru'
            ? 'Запись успешно подтверждена и добавлена в официальное расписание врача.'
            : 'Qabul muvaffaqiyatli tasdiqlandi va shifokorning rasmiy ish jadvaliga kiritildi.'
          : newStatus === 'CANCELLED'
          ? language === 'ru'
            ? 'Запись отменена, забронированное время освобождено.'
            : 'Qabul bekor qilindi, band qilingan vaqt bo\'shatildi.'
          : 'Holat muvaffaqiyatli yangilandi.';

      setStatusFeedback(msg);
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => setStatusFeedback(null), 6000);

      // If we confirmed/cancelled the last item on a pagination page, navigate to previous page
      if (pendingAppointments.length <= 1 && pendingPage > 1) {
        setPendingPage((p) => Math.max(1, p - 1));
      }

      // Close cancellation modal only if it targets this specific appointment
      setCancellationTarget((prev: any) => (prev && prev.id === appointmentId ? null : prev));

      await loadData();
    } catch (err: any) {
      alert(err?.message || 'Holatni yangilashda xatolik yuz berdi');
    } finally {
      setMutatingMap((prev) => {
        const next = { ...prev };
        delete next[appointmentId];
        return next;
      });
    }
  };

  const isDoctor = user?.role === 'DOCTOR';

  const summary = analytics?.summary || {
    totalAppointments: 0,
    completed: 0,
    cancelled: 0,
    completionRate: 0,
  };

  const totalPendingPages = Math.max(1, Math.ceil(pendingTotal / pendingPageSize));

  if (isAuthLoading) {
    return (
      <AdminLayout allowedRoles={['OWNER', 'ADMIN', 'DOCTOR']}>
        <div className="p-16 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-teal-700" />
          <span>Foydalanuvchi ma&apos;lumotlari yuklanmoqda...</span>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout allowedRoles={['OWNER', 'ADMIN', 'DOCTOR']}>
      <div className="space-y-8">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              {isDoctor ? `Dr. ${user?.fullName || user?.email.split('@')[0]}` : `Assalomu alaykum, ${user?.email.split('@')[0]}!`}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              {isDoctor
                ? 'Shaxsiy qabullar jadvali va sizga yo\'naltirilgan arizalar monitoringi'
                : t.admin.pendingWebsiteBookingsSubtitle}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={loadData}
              className="px-3.5 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 flex items-center gap-1.5 shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-teal-700' : ''}`} />
              <span>{t.common.retry}</span>
            </button>
            <Link
              href="/admin/calendar"
              className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 transition-colors"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>{t.admin.calendar}</span>
            </Link>
          </div>
        </div>

        {/* Explicit Server Error Alert */}
        {fetchError && (
          <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 flex items-center justify-between gap-3 text-xs text-rose-900 shadow-sm animate-fade-in">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              <div>
                <strong className="block font-bold">Xatolik: Ma&apos;lumotlarni yuklab bo&apos;lmadi</strong>
                <span>{fetchError}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={loadData}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shrink-0 transition-colors"
            >
              Qayta urinish
            </button>
          </div>
        )}

        {/* Action Status Feedback Banner */}
        {statusFeedback && (
          <div className="bg-emerald-50 border-2 border-emerald-400 rounded-2xl p-4 flex items-center justify-between gap-3 text-xs text-emerald-900 shadow-sm animate-fade-in">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span className="font-bold">{statusFeedback}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusFeedback(null)}
              className="p-1 hover:bg-emerald-100 rounded-lg text-emerald-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Role-Aware KPI Cards */}
        {isDoctor ? (
          /* DOCTOR-SPECIFIC KPI CARDS */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Card 1: Kutilayotgan arizalarim */}
            <div
              className={`rounded-3xl p-6 shadow-sm border transition-all ${
                pendingTotal > 0
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
                    pendingTotal > 0 ? 'bg-amber-500 text-white animate-pulse' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {pendingTotal}
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900">{pendingTotal}</p>
              <span className="text-[11px] text-amber-800 font-semibold mt-1 block">
                {pendingTotal > 0 ? 'Tasdiqlash kutilayotgan' : 'Barcha arizalar ko\'rib chiqilgan'}
              </span>
            </div>

            {/* Card 2: Bugungi qabullarim */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Bugungi qabullarim
                </span>
                <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                  <Calendar className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900">{todayAppointments.length}</p>
              <span className="text-[11px] text-teal-700 font-semibold mt-1 block">
                Bugungi jadvalingizda
              </span>
            </div>

            {/* Card 3: Tasdiqlangan yaqin qabullar */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Kelgusi qabullar
                </span>
                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
                  <CalendarCheck className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900">{upcomingAppointments.length}</p>
              <span className="text-[11px] text-indigo-700 font-semibold mt-1 block">
                Yaqin kunlarga rejalashtirilgan
              </span>
            </div>

            {/* Card 4: Yakunlangan qabullar */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Yakunlangan qabullar
                </span>
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900">{completedDoctorCount}</p>
              <span className="text-[11px] text-emerald-600 font-semibold mt-1 block">
                Muvaffaqiyatli qabul qilingan
              </span>
            </div>
          </div>
        ) : (
          /* OWNER / ADMIN CLINIC-WIDE KPI CARDS */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Card 1: Yangi arizalar */}
            <div
              className={`rounded-3xl p-6 shadow-sm border transition-all ${
                pendingTotal > 0
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
                    pendingTotal > 0 ? 'bg-amber-500 text-white animate-pulse' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {pendingTotal}
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900">{pendingTotal}</p>
              <span className="text-[11px] text-amber-800 font-semibold mt-1 block">
                {pendingTotal > 0 ? 'Tasdiqlash kutilayotgan yangi qabullar' : t.admin.allPendingReviewed}
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

            {/* Card 3: Yaqin qabullar */}
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

            {/* Card 4: Jami qabullar / yakunlanish (Distinguishes unavailable from real zero) */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200/80">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Jami qabullar
                </span>
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              {analyticsUnavailable ? (
                <div>
                  <p className="text-sm font-bold text-slate-400">Ma&apos;lumot mavjud emas</p>
                  <span className="text-[11px] text-slate-400 mt-1 block">Qayta yangilab ko&apos;ring</span>
                </div>
              ) : (
                <div>
                  <p className="text-2xl font-black text-slate-900">{summary.totalAppointments}</p>
                  <span className="text-[11px] text-emerald-600 font-semibold mt-1 block">
                    {summary.completionRate}% yakunlanish darajasi
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PROMINENT SECTION: Saytdan kelgan yangi arizalar */}
        {pendingTotal > 0 && (
          <div className="bg-gradient-to-br from-amber-50 via-white to-orange-50 border-2 border-amber-300 rounded-3xl p-6 sm:p-7 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-amber-200/80 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/25">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                    {t.admin.pendingWebsiteBookings}
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-white text-xs font-black">
                      {pendingTotal} {t.admin.totalRecords.toLowerCase()}
                    </span>
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {t.admin.pendingWebsiteBookingsSubtitle}
                  </p>
                </div>
              </div>

              <Link
                href="/admin/calendar?status=PENDING"
                className="text-xs font-bold text-amber-900 hover:text-amber-950 flex items-center gap-1.5 self-start sm:self-center px-3.5 py-2 bg-white rounded-xl border border-amber-300 shadow-sm transition-all"
              >
                <span>{t.admin.viewAll} (Taqvimda)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {pendingAppointments.map((appt) => {
                const dateFormatted = formatClinicDate(appt.startTime, language, { includeWeekday: true });
                const timeFormatted = formatClinicTime(appt.startTime);
                const currentMutation = mutatingMap[appt.id];
                const isMutatingThis = Boolean(currentMutation);

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
                      {/* Exact ID link to calendar details */}
                      <Link
                        href={`/admin/calendar?status=PENDING&appointmentId=${appt.id}`}
                        className="text-xs font-semibold text-slate-500 hover:text-teal-700 flex items-center gap-1"
                        title="Ushbu qabul tafsilotlarini taqvimda ko'rish"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>{t.admin.appointmentDetails}</span>
                      </Link>

                      <div className="flex items-center gap-2">
                        {/* Cancellation Button */}
                        <button
                          type="button"
                          disabled={isMutatingThis}
                          onClick={() => setCancellationTarget(appt)}
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1 disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>
                            {isMutatingThis && currentMutation === 'CANCELLED'
                              ? t.admin.cancelling
                              : t.admin.cancelAction}
                          </span>
                        </button>

                        {/* Confirmation Button */}
                        <button
                          type="button"
                          disabled={isMutatingThis}
                          onClick={() => handleStatusChange(appt.id, 'CONFIRMED')}
                          className="px-4 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>
                            {isMutatingThis && currentMutation === 'CONFIRMED'
                              ? t.admin.confirming
                              : t.admin.confirmAction}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {totalPendingPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-amber-200/80 text-xs">
                <span className="text-slate-600 font-medium">
                  {t.admin.pageText} {pendingPage} / {totalPendingPages} ({t.admin.totalRecords}: {pendingTotal} ta)
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={pendingPage <= 1 || isLoading}
                    onClick={() => setPendingPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 bg-white border border-amber-300 text-amber-900 rounded-xl font-bold flex items-center gap-1 disabled:opacity-40 hover:bg-amber-50"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>{t.admin.prevPage}</span>
                  </button>

                  <button
                    type="button"
                    disabled={pendingPage >= totalPendingPages || isLoading}
                    onClick={() => setPendingPage((p) => p + 1)}
                    className="px-3 py-1.5 bg-white border border-amber-300 text-amber-900 rounded-xl font-bold flex items-center gap-1 disabled:opacity-40 hover:bg-amber-50"
                  >
                    <span>{t.admin.nextPage}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Schedule & Optional Leads Grid */}
        <div className={`grid grid-cols-1 ${isDoctor ? 'lg:grid-cols-12' : 'lg:grid-cols-12'} gap-8`}>
          {/* Appointments Schedule Timeline */}
          <div className={`${isDoctor ? 'lg:col-span-12' : 'lg:col-span-8'} bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-200/80 space-y-6`}>
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
                <div className="p-12 text-center text-slate-400 space-y-2 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <Calendar className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="text-xs font-semibold">
                    {isDoctor ? 'Bugungi kunga sizda rejalashtirilgan qabullar yo\'q' : t.admin.noAppointmentsToday}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {todayAppointments.map((appt) => {
                    const timeFormatted = formatClinicTime(appt.startTime);
                    const currentMutation = mutatingMap[appt.id];
                    const isMutatingThis = Boolean(currentMutation);

                    return (
                      <div
                        key={appt.id}
                        className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 rounded-xl px-2.5 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-16 text-center py-1 bg-teal-50 text-teal-800 rounded-lg text-xs font-extrabold shrink-0">
                            {timeFormatted}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-900">
                                {appt.patient?.fullName || appt.patientName}
                              </span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                                {getStatusLabel(appt.status)}
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
                              <span>{appt.patient?.phone || 'Telefon yo\'q'}</span>
                            </a>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center">
                          <Link
                            href={`/admin/calendar?appointmentId=${appt.id}`}
                            className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold shadow-sm"
                          >
                            {t.admin.appointmentDetails}
                          </Link>
                          {appt.status !== 'CANCELLED' && appt.status !== 'COMPLETED' && (
                            <button
                              type="button"
                              disabled={isMutatingThis}
                              onClick={() => setCancellationTarget(appt)}
                              className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold disabled:opacity-50"
                            >
                              {t.admin.cancelAction}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : upcomingAppointments.length === 0 ? (
              <div className="p-12 text-center text-slate-400 space-y-2 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <CalendarCheck className="w-8 h-8 mx-auto text-slate-300" />
                <p className="text-xs font-semibold">
                  {isDoctor ? 'Sizda yaqin kunlarga tasdiqlangan qabullar mavjud emas' : t.admin.noUpcomingAppointments}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {upcomingAppointments.map((appt) => {
                  const dateFormatted = formatClinicDate(appt.startTime, language, { includeWeekday: true });
                  const timeFormatted = formatClinicTime(appt.startTime);
                  const currentMutation = mutatingMap[appt.id];
                  const isMutatingThis = Boolean(currentMutation);

                  return (
                    <div
                      key={appt.id}
                      className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 rounded-xl px-2.5 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-24 text-center py-1 bg-indigo-50 text-indigo-900 rounded-lg text-xs font-bold shrink-0">
                          <span className="block text-[10px] text-indigo-600 font-semibold">{dateFormatted}</span>
                          <span className="font-extrabold">{timeFormatted}</span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900">
                              {appt.patient?.fullName || appt.patientName}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                              {getStatusLabel(appt.status)}
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
                          href={`/admin/calendar?appointmentId=${appt.id}`}
                          className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold shadow-sm"
                        >
                          {t.admin.appointmentDetails}
                        </Link>
                        <button
                          type="button"
                          disabled={isMutatingThis}
                          onClick={() => setCancellationTarget(appt)}
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-bold disabled:opacity-50"
                        >
                          {t.admin.cancelAction}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Callback Leads (Murojaatlar) - Only shown to OWNER and ADMIN */}
          {!isDoctor && (
            <div className="lg:col-span-4 bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-slate-200/80 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{t.admin.newLeadsCard}</h2>
                  <p className="text-xs text-slate-400">{t.admin.pendingLeadsSubtitle}</p>
                </div>
                <Link
                  href="/admin/leads"
                  className="text-xs font-bold text-teal-700 hover:text-teal-800"
                >
                  {t.common.all}
                </Link>
              </div>

              {leadsUnavailable ? (
                <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-2xl">
                  Murojaatlar ma&apos;lumotini yuklab bo&apos;lmadi
                </div>
              ) : recentLeads.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 bg-slate-50 rounded-2xl">
                  {t.admin.noNewLeads}
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
                          {getLeadStatusLabel(lead.status)}
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
          )}
        </div>
      </div>

      {/* Accessible Cancellation Confirmation Dialog */}
      {cancellationTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-modal-title"
          aria-describedby="cancel-modal-desc"
        >
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border border-slate-100 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 id="cancel-modal-title" className="text-lg font-extrabold text-slate-900">
                  {t.admin.cancelConfirmTitle}
                </h3>
                <p id="cancel-modal-desc" className="text-xs text-slate-500 mt-0.5">
                  {t.admin.cancelConfirmDesc}
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 text-xs space-y-1.5 text-slate-700">
              <div>
                <span className="text-slate-400 font-semibold mr-1">Bemor:</span>
                <strong>{cancellationTarget.patient?.fullName || cancellationTarget.patientName}</strong>
              </div>
              <div>
                <span className="text-slate-400 font-semibold mr-1">Vaqti:</span>
                <span>
                  {formatClinicDate(cancellationTarget.startTime, language, { includeWeekday: true })} — {formatClinicTime(cancellationTarget.startTime)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 font-semibold mr-1">Xizmat:</span>
                <span>{cancellationTarget.serviceName || cancellationTarget.service?.nameUz}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={Boolean(mutatingMap[cancellationTarget.id])}
                onClick={() => setCancellationTarget(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors"
              >
                {t.common.cancel}
              </button>
              <button
                type="button"
                disabled={Boolean(mutatingMap[cancellationTarget.id])}
                onClick={() => handleStatusChange(cancellationTarget.id, 'CANCELLED')}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-600/20 transition-all flex items-center gap-1.5"
              >
                <X className="w-4 h-4" />
                <span>
                  {mutatingMap[cancellationTarget.id] === 'CANCELLED' ? t.admin.cancelling : t.admin.cancelAction}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
