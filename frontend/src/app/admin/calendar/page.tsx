'use client';

import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Filter,
  Clock,
  User,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Phone,
  Building2,
  Stethoscope,
} from 'lucide-react';
import { AdminLayout } from '../../../components/AdminLayout';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Kutilmoqda', color: 'bg-amber-100 text-amber-900 border-amber-300' },
  CONFIRMED: { label: 'Tasdiqlangan', color: 'bg-teal-100 text-teal-900 border-teal-300' },
  CHECKED_IN: { label: 'Klinikada', color: 'bg-blue-100 text-blue-900 border-blue-300' },
  COMPLETED: { label: 'Yakunlangan', color: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  CANCELLED: { label: 'Bekor qilingan', color: 'bg-rose-100 text-rose-900 border-rose-300' },
  NO_SHOW: { label: 'Kelmadi', color: 'bg-slate-200 text-slate-800 border-slate-300' },
};

export default function AdminCalendarPage() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);

  // Filters & Navigation
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  const [isLoading, setIsLoading] = useState(true);
  const [selectedAppt, setSelectedAppt] = useState<any | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Reschedule state
  const [rescheduleDate, setRescheduleDate] = useState<string>('');
  const [rescheduleTime, setRescheduleTime] = useState<string>('10:00');
  const [isRescheduling, setIsRescheduling] = useState(false);

  // Create Appointment Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    patientName: '',
    patientPhone: '+998',
    patientEmail: '',
    doctorId: '',
    serviceId: '',
    branchId: '',
    date: new Date().toISOString().split('T')[0],
    time: '09:00',
    note: '',
  });

  // Load fixtures
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

        if (docsRes && docsRes.length > 0 && !createForm.doctorId) {
          setCreateForm((prev) => ({
            ...prev,
            doctorId: user?.role === 'DOCTOR' && user.doctorId ? user.doctorId : docsRes[0].id,
            serviceId: servRes && servRes.length > 0 ? servRes[0].id : '',
            branchId: branchRes && branchRes.length > 0 ? branchRes[0].id : '',
          }));
        }
      } catch (e) {
        console.error('Failed to load fixtures', e);
      }
    }
    loadFixtures();
  }, [user]);

  // Compute date range for viewMode
  const getDateRange = () => {
    const d = new Date(currentDate);
    let start = new Date(d);
    let end = new Date(d);

    if (viewMode === 'day') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (viewMode === 'week') {
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as first day
      start = new Date(d.setDate(diff));
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else if (viewMode === 'month') {
      start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    return {
      dateFrom: start.toISOString(),
      dateTo: end.toISOString(),
    };
  };

  const loadAppointments = async () => {
    try {
      setIsLoading(true);
      const { dateFrom, dateTo } = getDateRange();
      const params: Record<string, any> = {
        limit: 200,
        dateFrom,
        dateTo,
      };

      if (user?.role === 'DOCTOR') {
        params.doctorId = user.doctorId;
      } else if (selectedDoctorId) {
        params.doctorId = selectedDoctorId;
      }

      if (selectedBranchId) params.branchId = selectedBranchId;
      if (selectedServiceId) params.serviceId = selectedServiceId;
      if (selectedStatus) params.status = selectedStatus;

      const res = await api.getAdminAppointments(params);
      setAppointments(res.items || []);
    } catch (e) {
      console.error('Failed to load appointments', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAppointments();
  }, [selectedDoctorId, selectedBranchId, selectedServiceId, selectedStatus, viewMode, currentDate]);

  const handlePrevDate = () => {
    const d = new Date(currentDate);
    if (viewMode === 'day') d.setDate(d.getDate() - 1);
    else if (viewMode === 'week') d.setDate(d.getDate() - 7);
    else if (viewMode === 'month') d.setMonth(d.getMonth() - 1);
    setCurrentDate(d);
  };

  const handleNextDate = () => {
    const d = new Date(currentDate);
    if (viewMode === 'day') d.setDate(d.getDate() + 1);
    else if (viewMode === 'week') d.setDate(d.getDate() + 7);
    else if (viewMode === 'month') d.setMonth(d.getMonth() + 1);
    setCurrentDate(d);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleStatusUpdate = async (newStatus: string) => {
    if (!selectedAppt) return;
    try {
      setIsUpdating(true);
      setActionError(null);
      await api.updateAppointmentStatus(selectedAppt.id, newStatus);
      setSelectedAppt(null);
      await loadAppointments();
    } catch (err: any) {
      setActionError(err?.message || 'Holatni yangilashda xatolik yuz berdi');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleReschedule = async () => {
    if (!selectedAppt || !rescheduleDate || !rescheduleTime) {
      setActionError('Iltimos sana va vaqtni tanlang');
      return;
    }
    try {
      setIsUpdating(true);
      setActionError(null);
      const newStartTime = new Date(`${rescheduleDate}T${rescheduleTime}:00+05:00`).toISOString();
      await api.adminRescheduleAppointment(selectedAppt.id, newStartTime);
      setIsRescheduling(false);
      setSelectedAppt(null);
      await loadAppointments();
    } catch (err: any) {
      setActionError(err?.message || 'Qayta rejalashtirishda xatolik yuz berdi');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmittingCreate(true);
      setCreateError(null);

      const startTime = new Date(`${createForm.date}T${createForm.time}:00+05:00`).toISOString();
      await api.createAppointmentAdmin({
        patientName: createForm.patientName.trim(),
        patientPhone: createForm.patientPhone.trim(),
        patientEmail: createForm.patientEmail?.trim() || undefined,
        doctorId: createForm.doctorId,
        serviceId: createForm.serviceId,
        branchId: createForm.branchId || undefined,
        startTime,
        note: createForm.note?.trim() || undefined,
        consentGiven: true,
      });

      setIsCreateOpen(false);
      setCreateForm({
        patientName: '',
        patientPhone: '+998',
        patientEmail: '',
        doctorId: doctors[0]?.id || '',
        serviceId: services[0]?.id || '',
        branchId: branches[0]?.id || '',
        date: new Date().toISOString().split('T')[0],
        time: '09:00',
        note: '',
      });
      await loadAppointments();
    } catch (err: any) {
      setCreateError(err?.message || 'Qabul yaratishda xatolik yuz berdi');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const currentRangeLabel = () => {
    const d = new Date(currentDate);
    if (viewMode === 'day') {
      return d.toLocaleDateString('uz-UZ', {
        timeZone: 'Asia/Tashkent',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }
    if (viewMode === 'week') {
      const { dateFrom, dateTo } = getDateRange();
      const s = new Date(dateFrom).toLocaleDateString('uz-UZ', { month: 'short', day: 'numeric' });
      const e = new Date(dateTo).toLocaleDateString('uz-UZ', { month: 'short', day: 'numeric', year: 'numeric' });
      return `${s} — ${e}`;
    }
    return d.toLocaleDateString('uz-UZ', { month: 'long', year: 'numeric' });
  };

  const validTransitions = selectedAppt ? ALLOWED_TRANSITIONS[selectedAppt.status] || [] : [];

  return (
    <AdminLayout allowedRoles={['OWNER', 'ADMIN', 'DOCTOR']}>
      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">Qabullar taqvimi</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Kunlik, haftalik va oylik qabullar monitoringi hamda boshqaruvi
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCreateOpen(true)}
              className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Yangi qabul</span>
            </button>

            <button
              onClick={loadAppointments}
              className="p-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 shadow-sm transition-all"
              title="Yangilash"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* View Mode & Date Navigation Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevDate}
              className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600"
              title="Oldingi"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleToday}
              className="px-3 py-1.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-xs font-bold text-slate-700"
            >
              Bugun
            </button>
            <button
              onClick={handleNextDate}
              className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600"
              title="Keyingi"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <span className="text-sm font-extrabold text-slate-800 ml-2">
              {currentRangeLabel()}
            </span>
          </div>

          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            {(['day', 'week', 'month'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1 rounded-lg text-xs font-bold capitalize transition-all ${
                  viewMode === mode
                    ? 'bg-white text-teal-800 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {mode === 'day' ? 'Kunlik' : mode === 'week' ? 'Haftalik' : 'Oylik'}
              </button>
            ))}
          </div>
        </div>

        {/* Filters Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Filter className="w-4 h-4 text-teal-700" />
            <span>Filtrlar:</span>
          </div>

          {/* Doctor filter (hidden if DOCTOR) */}
          {user?.role !== 'DOCTOR' ? (
            <select
              value={selectedDoctorId}
              onChange={(e) => setSelectedDoctorId(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-600 font-medium"
            >
              <option value="">Barcha shifokorlar</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  Dr. {d.firstNameUz} {d.lastNameUz}
                </option>
              ))}
            </select>
          ) : (
            <span className="px-3 py-1 bg-teal-50 text-teal-800 rounded-xl text-xs font-bold border border-teal-200">
              Shaxsiy qabullaringiz
            </span>
          )}

          {/* Service filter */}
          <select
            value={selectedServiceId}
            onChange={(e) => setSelectedServiceId(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-600 font-medium"
          >
            <option value="">Barcha xizmatlar</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nameUz}
              </option>
            ))}
          </select>

          {/* Branch filter */}
          <select
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-600 font-medium"
          >
            <option value="">Barcha filiallar</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nameUz}
              </option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-600 font-medium"
          >
            <option value="">Barcha holatlar</option>
            <option value="PENDING">Kutilmoqda</option>
            <option value="CONFIRMED">Tasdiqlangan</option>
            <option value="CHECKED_IN">Klinikada</option>
            <option value="COMPLETED">Yakunlangan</option>
            <option value="CANCELLED">Bekor qilingan</option>
            <option value="NO_SHOW">Kelmadi</option>
          </select>
        </div>

        {/* Appointments List / Grid */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
            <h2 className="text-base font-bold text-slate-800">
              Qabullar ({appointments.length})
            </h2>
          </div>

          {isLoading ? (
            <div className="p-16 text-center text-slate-400 text-sm">Yuklanmoqda...</div>
          ) : appointments.length === 0 ? (
            <div className="p-16 text-center text-slate-500 text-sm bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              Ushbu parametrlar bo&apos;yicha qabullar topilmadi.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {appointments.map((appt) => {
                const dateObj = new Date(appt.startTime);
                const dateFormatted = dateObj.toLocaleDateString('uz-UZ', {
                  timeZone: 'Asia/Tashkent',
                  month: 'short',
                  day: 'numeric',
                  weekday: 'short',
                });
                const timeFormatted = dateObj.toLocaleTimeString('uz-UZ', {
                  timeZone: 'Asia/Tashkent',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                const badge = STATUS_LABELS[appt.status] || {
                  label: appt.status,
                  color: 'bg-slate-100 text-slate-700 border-slate-200',
                };

                return (
                  <div
                    key={appt.id}
                    onClick={() => {
                      setSelectedAppt(appt);
                      setActionError(null);
                      setIsRescheduling(false);
                      const d = new Date(appt.startTime);
                      setRescheduleDate(d.toISOString().split('T')[0]);
                      setRescheduleTime(d.toTimeString().slice(0, 5));
                    }}
                    className="py-4 px-3 hover:bg-slate-50 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-20 text-center shrink-0">
                        <span className="block text-xs font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-lg">
                          {dateFormatted}
                        </span>
                        <span className="block text-sm font-extrabold text-slate-800 mt-1">
                          {timeFormatted}
                        </span>
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900">
                            {appt.patient?.fullName || appt.patientName}
                          </h3>
                          <span className="text-xs text-slate-400">
                            ({appt.patient?.phone || appt.patientPhone})
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">
                          {appt.serviceName || appt.service?.nameUz} • Dr. {appt.doctor?.firstNameUz} {appt.doctor?.lastNameUz}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {appt.branch?.nameUz} • {appt.durationMinutes} daqiqa
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center">
                      <span className={`text-xs font-bold px-3 py-1 rounded-full border ${badge.color}`}>
                        {badge.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Appointment Detail & Status Transition Modal */}
      {selectedAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg bg-white rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700">
                  Qabul boshqaruvi
                </span>
                <h3 className="text-xl font-extrabold text-slate-900 mt-0.5">
                  {selectedAppt.patient?.fullName || selectedAppt.patientName}
                </h3>
              </div>
              <button
                onClick={() => setSelectedAppt(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            {actionError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}

            <div className="space-y-3 text-xs text-slate-700">
              <div className="flex justify-between p-2.5 bg-slate-50 rounded-xl">
                <span className="text-slate-500">Telefon:</span>
                <a
                  href={`tel:${selectedAppt.patient?.phone || selectedAppt.patientPhone}`}
                  className="font-bold text-teal-700"
                >
                  {selectedAppt.patient?.phone || selectedAppt.patientPhone}
                </a>
              </div>
              <div className="flex justify-between p-2.5 bg-slate-50 rounded-xl">
                <span className="text-slate-500">Xizmat:</span>
                <span className="font-bold text-slate-800">
                  {selectedAppt.serviceName || selectedAppt.service?.nameUz}
                </span>
              </div>
              <div className="flex justify-between p-2.5 bg-slate-50 rounded-xl">
                <span className="text-slate-500">Shifokor:</span>
                <span className="font-bold text-slate-800">
                  Dr. {selectedAppt.doctor?.firstNameUz} {selectedAppt.doctor?.lastNameUz}
                </span>
              </div>
              <div className="flex justify-between p-2.5 bg-slate-50 rounded-xl">
                <span className="text-slate-500">Filial:</span>
                <span className="font-bold text-slate-800">
                  {selectedAppt.branch?.nameUz || 'Asosiy filial'}
                </span>
              </div>
              <div className="flex justify-between p-2.5 bg-slate-50 rounded-xl">
                <span className="text-slate-500">Vaqt:</span>
                <span className="font-bold text-slate-800">
                  {new Date(selectedAppt.startTime).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' })}
                </span>
              </div>
              <div className="flex justify-between p-2.5 bg-slate-50 rounded-xl">
                <span className="text-slate-500">Joriy holat:</span>
                <span className="font-bold text-teal-800 uppercase">{selectedAppt.status}</span>
              </div>
              {selectedAppt.note && (
                <div className="p-2.5 bg-slate-50 rounded-xl">
                  <span className="text-slate-500 block mb-1">Izoh:</span>
                  <p className="text-slate-700 italic">{selectedAppt.note}</p>
                </div>
              )}
            </div>

            {/* Valid Status Transitions */}
            {validTransitions.length > 0 ? (
              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs font-bold text-slate-700 mb-2">Ruxsat etilgan o&apos;tishlar:</p>
                <div className="flex flex-wrap gap-2">
                  {validTransitions.includes('CONFIRMED') && (
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => handleStatusUpdate('CONFIRMED')}
                      className="py-2 px-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                    >
                      Tasdiqlash
                    </button>
                  )}
                  {validTransitions.includes('CHECKED_IN') && (
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => handleStatusUpdate('CHECKED_IN')}
                      className="py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                    >
                      Klinikaga keldi
                    </button>
                  )}
                  {validTransitions.includes('COMPLETED') && (
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => handleStatusUpdate('COMPLETED')}
                      className="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                    >
                      Yakunlash
                    </button>
                  )}
                  {validTransitions.includes('NO_SHOW') && (
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => handleStatusUpdate('NO_SHOW')}
                      className="py-2 px-3 bg-slate-700 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                    >
                      Kelmadi (No-show)
                    </button>
                  )}
                  {validTransitions.includes('CANCELLED') && (
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => handleStatusUpdate('CANCELLED')}
                      className="py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                    >
                      Bekor qilish
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="pt-2 border-t border-slate-100 text-center text-xs text-slate-400">
                Ushbu qabul yakuniy holatda ({selectedAppt.status}).
              </div>
            )}

            {/* Reschedule Section */}
            {['PENDING', 'CONFIRMED'].includes(selectedAppt.status) && (
              <div className="pt-2 border-t border-slate-100">
                {!isRescheduling ? (
                  <button
                    type="button"
                    onClick={() => setIsRescheduling(true)}
                    className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all"
                  >
                    Boshqa vaqtga ko&apos;chirish (Reschedule)
                  </button>
                ) : (
                  <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
                    <p className="text-xs font-bold text-slate-800">Yangi sana va vaqtni tanlang:</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] text-slate-500 block mb-1">Sana</label>
                        <input
                          type="date"
                          value={rescheduleDate}
                          onChange={(e) => setRescheduleDate(e.target.value)}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-xl text-xs bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-500 block mb-1">Vaqt</label>
                        <input
                          type="time"
                          value={rescheduleTime}
                          onChange={(e) => setRescheduleTime(e.target.value)}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-xl text-xs bg-white"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={handleReschedule}
                        className="flex-1 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold disabled:opacity-50"
                      >
                        {isUpdating ? 'Ko\'chirilmoqda...' : 'Ko\'chirishni saqlash'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsRescheduling(false)}
                        className="px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-600 hover:bg-slate-100"
                      >
                        Bekor qilish
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* New Appointment Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg bg-white rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700">
                  Administrator
                </span>
                <h3 className="text-xl font-extrabold text-slate-900 mt-0.5">
                  Yangi qabul yaratish
                </h3>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateAppointment} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Bemor F.I.Sh. *
                  </label>
                  <input
                    type="text"
                    required
                    value={createForm.patientName}
                    onChange={(e) => setCreateForm({ ...createForm, patientName: e.target.value })}
                    placeholder="Masalan, Alisher Navoiy"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-teal-600 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Telefon raqam *
                  </label>
                  <input
                    type="tel"
                    required
                    value={createForm.patientPhone}
                    onChange={(e) => setCreateForm({ ...createForm, patientPhone: e.target.value })}
                    placeholder="+998901234567"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-teal-600 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Shifokor *
                  </label>
                  <select
                    required
                    disabled={user?.role === 'DOCTOR'}
                    value={createForm.doctorId}
                    onChange={(e) => setCreateForm({ ...createForm, doctorId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-teal-600 outline-none bg-white"
                  >
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        Dr. {d.firstNameUz} {d.lastNameUz}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Xizmat turi *
                  </label>
                  <select
                    required
                    value={createForm.serviceId}
                    onChange={(e) => setCreateForm({ ...createForm, serviceId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-teal-600 outline-none bg-white"
                  >
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nameUz}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Filial
                  </label>
                  <select
                    value={createForm.branchId}
                    onChange={(e) => setCreateForm({ ...createForm, branchId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-teal-600 outline-none bg-white"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.nameUz}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Sana *
                  </label>
                  <input
                    type="date"
                    required
                    value={createForm.date}
                    onChange={(e) => setCreateForm({ ...createForm, date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-teal-600 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Vaqt *
                  </label>
                  <input
                    type="time"
                    required
                    value={createForm.time}
                    onChange={(e) => setCreateForm({ ...createForm, time: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-teal-600 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Izoh yoki shikoyat (ixtiyoriy)
                </label>
                <textarea
                  rows={2}
                  value={createForm.note}
                  onChange={(e) => setCreateForm({ ...createForm, note: e.target.value })}
                  placeholder="Bemor shikoyati..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-teal-600 outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-xs text-slate-600 hover:bg-slate-50 font-bold"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCreate}
                  className="px-5 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-md transition-all disabled:opacity-50"
                >
                  {isSubmittingCreate ? 'Saqlanmoqda...' : 'Qabulni yaratish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
