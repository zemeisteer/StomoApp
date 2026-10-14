'use client';

import React, { useState, useEffect } from 'react';
import { UserCheck, Clock, Calendar, Plus, RefreshCw, AlertCircle } from 'lucide-react';
import { AdminLayout } from '../../../components/AdminLayout';
import { api } from '../../../lib/api';

export default function AdminDoctorsManagePage() {
  const [doctors, setDoctors] = useState<any[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [schedules, setSchedules] = useState<any[]>([]);
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // New exception form
  const [showExceptionModal, setShowExceptionModal] = useState(false);
  const [exceptionType, setExceptionType] = useState('LEAVE');
  const [exceptionDate, setExceptionDate] = useState('');
  const [exceptionReason, setExceptionReason] = useState('');
  const [isSubmittingException, setIsSubmittingException] = useState(false);

  const loadDoctors = async () => {
    try {
      setIsLoading(true);
      const docs = await api.getDoctors();
      setDoctors(docs || []);
      if (docs && docs.length > 0 && !selectedDoctorId) {
        setSelectedDoctorId(docs[0].id);
      }
    } catch (e) {
      console.error('Failed to load doctors', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDoctors();
  }, []);

  const loadDoctorScheduleData = async (docId: string) => {
    if (!docId) return;
    try {
      const [schedRes, excRes] = await Promise.all([
        api.getDoctorSchedules(docId).catch(() => []),
        api.getDoctorExceptions(docId).catch(() => []),
      ]);
      setSchedules(schedRes || []);
      setExceptions(excRes || []);
    } catch (e) {
      console.error('Failed to load schedule', e);
    }
  };

  useEffect(() => {
    if (selectedDoctorId) {
      loadDoctorScheduleData(selectedDoctorId);
    }
  }, [selectedDoctorId]);

  const handleAddException = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exceptionDate) return;

    try {
      setIsSubmittingException(true);
      await api.addDoctorException({
        doctorId: selectedDoctorId,
        type: exceptionType,
        date: exceptionDate,
        reason: exceptionReason || undefined,
      });
      setShowExceptionModal(false);
      setExceptionReason('');
      await loadDoctorScheduleData(selectedDoctorId);
    } catch (err: any) {
      alert(err?.message || 'Ta\'til qo\'shishda xatolik yuz berdi');
    } finally {
      setIsSubmittingException(false);
    }
  };

  const handleDeleteException = async (id: string) => {
    if (!confirm('Ta\'til yozuvini o\'chirishga ishonchingiz komilmi?')) return;
    try {
      await api.deleteDoctorException(id);
      await loadDoctorScheduleData(selectedDoctorId);
    } catch (err: any) {
      alert(err?.message || 'O\'chirishda xatolik');
    }
  };

  const selectedDoctorObj = doctors.find((d) => d.id === selectedDoctorId);

  return (
    <AdminLayout allowedRoles={['OWNER', 'ADMIN']}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">
              Shifokorlar va ish jadvallari
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Ish kunlari, tanaffus vaqtlari, ta&apos;tillar va istisnolar boshqaruvi
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadDoctorScheduleData(selectedDoctorId)}
              className="p-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 shadow-sm"
              title="Yangilash"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Doctor Selector Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {doctors.map((doc) => {
            const isSelected = doc.id === selectedDoctorId;
            return (
              <button
                type="button"
                key={doc.id}
                onClick={() => setSelectedDoctorId(doc.id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold shrink-0 transition-all ${
                  isSelected
                    ? 'bg-teal-700 text-white shadow-md'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                Dr. {doc.firstNameUz} {doc.lastNameUz}
              </button>
            );
          })}
        </div>

        {/* Doctor Schedules & Exceptions Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Weekly Schedule */}
          <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-teal-700" />
                <span>Haftalik ish jadvali</span>
              </h2>
            </div>

            {schedules.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">
                Ushbu shifokor uchun ish jadvali kiritilmagan.
              </p>
            ) : (
              <div className="space-y-2.5">
                {schedules.map((s) => (
                  <div
                    key={s.id}
                    className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-900 text-sm block">
                        {s.dayOfWeek}
                      </span>
                      <span className="text-slate-500 text-[11px]">
                        Filial: {s.branch?.nameUz}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="font-mono font-bold text-teal-800 text-sm block">
                        {s.startTime} - {s.endTime}
                      </span>
                      {s.breakStart && s.breakEnd && (
                        <span className="text-[11px] text-slate-400">
                          Tanaffus: {s.breakStart} - {s.breakEnd}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Exceptions & Leaves */}
          <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-teal-700" />
                <span>Ta&apos;tillar va istisnolar</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowExceptionModal(true)}
                className="px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Qo&apos;shish</span>
              </button>
            </div>

            {exceptions.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">
                Rejalashtirilgan ta&apos;tillar yo&apos;q.
              </p>
            ) : (
              <div className="space-y-2">
                {exceptions.map((exc) => (
                  <div
                    key={exc.id}
                    className="p-3 bg-amber-50/70 border border-amber-200/60 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-amber-950 block">
                        {new Date(exc.date).toLocaleDateString()} — {exc.type}
                      </span>
                      {exc.reason && (
                        <span className="text-[11px] text-amber-800 italic block mt-0.5">
                          {exc.reason}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteException(exc.id)}
                      className="text-red-600 hover:underline text-xs font-bold"
                    >
                      O&apos;chirish
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Exception Modal */}
      {showExceptionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">
                Ta&apos;til yoki istisno qo&apos;shish
              </h3>
              <button onClick={() => setShowExceptionModal(false)} className="p-1 text-slate-400">
                ✕
              </button>
            </div>

            <form onSubmit={handleAddException} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Turi</label>
                <select
                  value={exceptionType}
                  onChange={(e) => setExceptionType(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                  <option value="LEAVE">Ta&apos;til (LEAVE)</option>
                  <option value="HOLIDAY">Bayram kuni (HOLIDAY)</option>
                  <option value="BLOCKED">Band qilingan vaqt (BLOCKED)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Sana</label>
                <input
                  type="date"
                  required
                  value={exceptionDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setExceptionDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Sabab (ixtiyoriy)
                </label>
                <input
                  type="text"
                  value={exceptionReason}
                  onChange={(e) => setExceptionReason(e.target.value)}
                  placeholder="Xizmat safari, seminar..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowExceptionModal(false)}
                  className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingException}
                  className="px-5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold shadow"
                >
                  {isSubmittingException ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
