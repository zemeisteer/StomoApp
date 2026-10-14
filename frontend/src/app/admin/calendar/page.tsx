'use client';

import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Filter,
  Clock,
  User,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
} from 'lucide-react';
import { AdminLayout } from '../../../components/AdminLayout';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';

export default function AdminCalendarPage() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);

  // Filters
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  const [isLoading, setIsLoading] = useState(true);
  const [selectedAppt, setSelectedAppt] = useState<any | null>(null);

  // Status update
  const [isUpdating, setIsUpdating] = useState(false);

  // Load fixtures
  useEffect(() => {
    async function loadFixtures() {
      try {
        const [docsRes, branchRes] = await Promise.all([
          api.getDoctors(),
          api.getBranches(),
        ]);
        setDoctors(docsRes || []);
        setBranches(branchRes || []);
      } catch (e) {
        console.error('Failed to load fixtures', e);
      }
    }
    loadFixtures();
  }, []);

  const loadAppointments = async () => {
    try {
      setIsLoading(true);
      const params: Record<string, any> = {
        limit: 100,
      };

      if (selectedDoctorId) params.doctorId = selectedDoctorId;
      if (selectedBranchId) params.branchId = selectedBranchId;
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
  }, [selectedDoctorId, selectedBranchId, selectedStatus]);

  const handleStatusUpdate = async (newStatus: string) => {
    if (!selectedAppt) return;
    try {
      setIsUpdating(true);
      await api.updateAppointmentStatus(selectedAppt.id, newStatus);
      setSelectedAppt(null);
      await loadAppointments();
    } catch (err: any) {
      alert(err?.message || 'Holatni yangilashda xatolik yuz berdi');
    } finally {
      setIsUpdating(false);
    }
  };

  const statusColors: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-900 border-amber-300',
    CONFIRMED: 'bg-teal-100 text-teal-900 border-teal-300',
    CHECKED_IN: 'bg-blue-100 text-blue-900 border-blue-300',
    COMPLETED: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    CANCELLED: 'bg-rose-100 text-rose-900 border-rose-300',
    NO_SHOW: 'bg-slate-100 text-slate-800 border-slate-300',
  };

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
              onClick={loadAppointments}
              className="p-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 shadow-sm"
              title="Yangilash"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Filter className="w-4 h-4 text-teal-700" />
            <span>Filtrlar:</span>
          </div>

          {/* Doctor filter (if not scoped DOCTOR) */}
          {user?.role !== 'DOCTOR' && (
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
          )}

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
          </select>
        </div>

        {/* Appointments List / Calendar view */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
            <h2 className="text-base font-bold text-slate-800">
              Topilgan qabullar ({appointments.length})
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

                return (
                  <div
                    key={appt.id}
                    onClick={() => setSelectedAppt(appt)}
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
                            ({appt.patient?.phone})
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">
                          {appt.serviceName} • Dr. {appt.doctor?.firstNameUz} {appt.doctor?.lastNameUz}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {appt.branch?.nameUz} • {appt.durationMinutes} daqiqa
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center">
                      <span
                        className={`text-xs font-bold px-3 py-1 rounded-full border ${
                          statusColors[appt.status] || 'bg-slate-100'
                        }`}
                      >
                        {appt.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Appointment Detail & Status Action Modal */}
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

            <div className="space-y-3 text-xs text-slate-700">
              <div className="flex justify-between p-2.5 bg-slate-50 rounded-xl">
                <span className="text-slate-500">Telefon:</span>
                <a href={`tel:${selectedAppt.patient?.phone}`} className="font-bold text-teal-700">
                  {selectedAppt.patient?.phone}
                </a>
              </div>
              <div className="flex justify-between p-2.5 bg-slate-50 rounded-xl">
                <span className="text-slate-500">Xizmat:</span>
                <span className="font-bold text-slate-800">{selectedAppt.serviceName}</span>
              </div>
              <div className="flex justify-between p-2.5 bg-slate-50 rounded-xl">
                <span className="text-slate-500">Shifokor:</span>
                <span className="font-bold text-slate-800">
                  Dr. {selectedAppt.doctor?.firstNameUz} {selectedAppt.doctor?.lastNameUz}
                </span>
              </div>
              <div className="flex justify-between p-2.5 bg-slate-50 rounded-xl">
                <span className="text-slate-500">Vaqt:</span>
                <span className="font-bold text-slate-800">
                  {new Date(selectedAppt.startTime).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' })}
                </span>
              </div>
              <div className="flex justify-between p-2.5 bg-slate-50 rounded-xl">
                <span className="text-slate-500">Holat:</span>
                <span className="font-bold text-teal-800 uppercase">{selectedAppt.status}</span>
              </div>
              {selectedAppt.note && (
                <div className="p-2.5 bg-slate-50 rounded-xl">
                  <span className="text-slate-500 block mb-1">Izoh:</span>
                  <p className="text-slate-700 italic">{selectedAppt.note}</p>
                </div>
              )}
            </div>

            {/* Quick Status Transitions */}
            <div className="pt-2 border-t border-slate-100">
              <p className="text-xs font-bold text-slate-700 mb-2">Holatni o&apos;zgartirish:</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  disabled={isUpdating || selectedAppt.status === 'CONFIRMED'}
                  onClick={() => handleStatusUpdate('CONFIRMED')}
                  className="py-2 px-2 bg-teal-50 hover:bg-teal-700 hover:text-white text-teal-800 rounded-xl text-xs font-bold transition-all disabled:opacity-30"
                >
                  Tasdiqlash
                </button>
                <button
                  type="button"
                  disabled={isUpdating || selectedAppt.status === 'CHECKED_IN'}
                  onClick={() => handleStatusUpdate('CHECKED_IN')}
                  className="py-2 px-2 bg-blue-50 hover:bg-blue-700 hover:text-white text-blue-800 rounded-xl text-xs font-bold transition-all disabled:opacity-30"
                >
                  Keldi
                </button>
                <button
                  type="button"
                  disabled={isUpdating || selectedAppt.status === 'COMPLETED'}
                  onClick={() => handleStatusUpdate('COMPLETED')}
                  className="py-2 px-2 bg-emerald-50 hover:bg-emerald-700 hover:text-white text-emerald-800 rounded-xl text-xs font-bold transition-all disabled:opacity-30"
                >
                  Yakunlash
                </button>
                <button
                  type="button"
                  disabled={isUpdating || selectedAppt.status === 'CANCELLED'}
                  onClick={() => handleStatusUpdate('CANCELLED')}
                  className="py-2 px-2 bg-rose-50 hover:bg-rose-700 hover:text-white text-rose-800 rounded-xl text-xs font-bold transition-all disabled:opacity-30"
                >
                  Bekor qilish
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
