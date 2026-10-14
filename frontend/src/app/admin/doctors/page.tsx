'use client';

import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  Clock,
  Calendar,
  Plus,
  RefreshCw,
  AlertCircle,
  Edit2,
  Trash2,
  Building2,
  ShieldAlert,
} from 'lucide-react';
import { AdminLayout } from '../../../components/AdminLayout';
import { api } from '../../../lib/api';

const DAYS_OF_WEEK = [
  { value: 'MONDAY', label: 'Dushanba' },
  { value: 'TUESDAY', label: 'Seshanba' },
  { value: 'WEDNESDAY', label: 'Chorshanba' },
  { value: 'THURSDAY', label: 'Payshanba' },
  { value: 'FRIDAY', label: 'Juma' },
  { value: 'SATURDAY', label: 'Shanba' },
  { value: 'SUNDAY', label: 'Yakshanba' },
];

export default function AdminDoctorsManagePage() {
  const [doctors, setDoctors] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [schedules, setSchedules] = useState<any[]>([]);
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Doctor Create/Edit Modal
  const [isDoctorModalOpen, setIsDoctorModalOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<any | null>(null);
  const [isSavingDoctor, setIsSavingDoctor] = useState(false);
  const [doctorError, setDoctorError] = useState<string | null>(null);
  const [doctorForm, setDoctorForm] = useState({
    firstNameUz: '',
    lastNameUz: '',
    firstNameRu: '',
    lastNameRu: '',
    slug: '',
    titleUz: 'Bosh stomatolog-terapevt',
    titleRu: 'Главный стоматолог-терапевт',
    bioUz: '',
    bioRu: '',
    educationUz: '',
    educationRu: '',
    experienceYears: 10,
    languages: 'uz, ru',
    photoUrl: '',
    isActive: true,
  });

  // Schedule Modal
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleForm, setScheduleForm] = useState({
    dayOfWeek: 'MONDAY',
    startTime: '09:00',
    endTime: '18:00',
    breakStart: '13:00',
    breakEnd: '14:00',
    branchId: '',
  });

  // Exception Modal
  const [showExceptionModal, setShowExceptionModal] = useState(false);
  const [exceptionType, setExceptionType] = useState('LEAVE');
  const [exceptionDate, setExceptionDate] = useState('');
  const [exceptionStartTime, setExceptionStartTime] = useState('');
  const [exceptionEndTime, setExceptionEndTime] = useState('');
  const [exceptionReason, setExceptionReason] = useState('');
  const [isSubmittingException, setIsSubmittingException] = useState(false);
  const [exceptionError, setExceptionError] = useState<string | null>(null);

  const loadDoctorsAndBranches = async () => {
    try {
      setIsLoading(true);
      const [docs, branchList] = await Promise.all([
        api.getAllDoctorsAdmin().catch(() => api.getDoctors()),
        api.getBranches(),
      ]);
      setDoctors(docs || []);
      setBranches(branchList || []);
      if (docs && docs.length > 0 && !selectedDoctorId) {
        setSelectedDoctorId(docs[0].id);
      }
      if (branchList && branchList.length > 0 && !scheduleForm.branchId) {
        setScheduleForm((prev) => ({ ...prev, branchId: branchList[0].id }));
      }
    } catch (e) {
      console.error('Failed to load doctors and branches', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDoctorsAndBranches();
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

  const openCreateDoctor = () => {
    setEditingDoctor(null);
    setDoctorForm({
      firstNameUz: '',
      lastNameUz: '',
      firstNameRu: '',
      lastNameRu: '',
      slug: '',
      titleUz: 'Bosh stomatolog-terapevt',
      titleRu: 'Главный стоматолог-терапевт',
      bioUz: '',
      bioRu: '',
      educationUz: '',
      educationRu: '',
      experienceYears: 10,
      languages: 'uz, ru',
      photoUrl: '',
      isActive: true,
    });
    setDoctorError(null);
    setIsDoctorModalOpen(true);
  };

  const openEditDoctor = (doc: any) => {
    setEditingDoctor(doc);
    setDoctorForm({
      firstNameUz: doc.firstNameUz || '',
      lastNameUz: doc.lastNameUz || '',
      firstNameRu: doc.firstNameRu || '',
      lastNameRu: doc.lastNameRu || '',
      slug: doc.slug || '',
      titleUz: doc.titleUz || '',
      titleRu: doc.titleRu || '',
      bioUz: doc.bioUz || '',
      bioRu: doc.bioRu || '',
      educationUz: doc.educationUz || '',
      educationRu: doc.educationRu || '',
      experienceYears: doc.experienceYears || 5,
      languages: Array.isArray(doc.languages) ? doc.languages.join(', ') : 'uz, ru',
      photoUrl: doc.photoUrl || '',
      isActive: doc.isActive !== false,
    });
    setDoctorError(null);
    setIsDoctorModalOpen(true);
  };

  const handleSaveDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSavingDoctor(true);
      setDoctorError(null);

      const langs = doctorForm.languages
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      const payload = {
        ...doctorForm,
        experienceYears: Number(doctorForm.experienceYears),
        languages: langs,
      };

      if (editingDoctor) {
        await api.updateDoctorAdmin(editingDoctor.id, payload);
      } else {
        await api.createDoctorAdmin(payload);
      }

      setIsDoctorModalOpen(false);
      await loadDoctorsAndBranches();
    } catch (err: any) {
      setDoctorError(err?.message || 'Shifokorni saqlashda xatolik yuz berdi');
    } finally {
      setIsSavingDoctor(false);
    }
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoctorId) return;

    try {
      setIsSavingSchedule(true);
      setScheduleError(null);

      await api.setDoctorSchedule({
        doctorId: selectedDoctorId,
        dayOfWeek: scheduleForm.dayOfWeek,
        startTime: scheduleForm.startTime,
        endTime: scheduleForm.endTime,
        breakStart: scheduleForm.breakStart || undefined,
        breakEnd: scheduleForm.breakEnd || undefined,
        branchId: scheduleForm.branchId || undefined,
      });

      setIsScheduleModalOpen(false);
      await loadDoctorScheduleData(selectedDoctorId);
    } catch (err: any) {
      setScheduleError(err?.message || 'Jadvalni saqlashda xatolik yuz berdi');
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handleAddException = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exceptionDate || !selectedDoctorId) return;

    try {
      setIsSubmittingException(true);
      setExceptionError(null);
      await api.addDoctorException({
        doctorId: selectedDoctorId,
        type: exceptionType,
        date: exceptionDate,
        startTime: exceptionStartTime || undefined,
        endTime: exceptionEndTime || undefined,
        reason: exceptionReason || undefined,
      });
      setShowExceptionModal(false);
      setExceptionReason('');
      setExceptionStartTime('');
      setExceptionEndTime('');
      await loadDoctorScheduleData(selectedDoctorId);
    } catch (err: any) {
      setExceptionError(err?.message || 'Ta\'til qo\'shishda xatolik yuz berdi');
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
              Shifokorlar profili, ish vaqti, tanaffuslar, ta&apos;tillar va band vaqtlar
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={openCreateDoctor}
              className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Yangi shifokor</span>
            </button>

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

        {/* Selected Doctor Profile Card */}
        {selectedDoctorObj && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col sm:flex-row items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700 font-bold text-lg shrink-0">
                {selectedDoctorObj.firstNameUz?.[0]}
                {selectedDoctorObj.lastNameUz?.[0]}
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Dr. {selectedDoctorObj.firstNameUz} {selectedDoctorObj.lastNameUz}
                </h2>
                <p className="text-xs text-teal-700 font-semibold">{selectedDoctorObj.titleUz}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Tajriba: {selectedDoctorObj.experienceYears} yil • Slug: <code className="text-teal-700">/{selectedDoctorObj.slug}</code>
                </p>
              </div>
            </div>

            <button
              onClick={() => openEditDoctor(selectedDoctorObj)}
              className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
            >
              <Edit2 className="w-3.5 h-3.5 text-teal-700" />
              <span>Profilni tahrirlash</span>
            </button>
          </div>
        )}

        {/* Doctor Schedules & Exceptions Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Weekly Schedule */}
          <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-teal-700" />
                <span>Haftalik ish jadvali</span>
              </h2>

              <button
                type="button"
                onClick={() => setIsScheduleModalOpen(true)}
                className="px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Kun qo&apos;shish / tahrirlash</span>
              </button>
            </div>

            {schedules.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">
                Ushbu shifokor uchun ish jadvali kiritilmagan.
              </p>
            ) : (
              <div className="space-y-2.5">
                {schedules.map((s) => {
                  const dayObj = DAYS_OF_WEEK.find((d) => d.value === s.dayOfWeek);
                  return (
                    <div
                      key={s.id}
                      className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold text-slate-900 text-sm block">
                          {dayObj?.label || s.dayOfWeek}
                        </span>
                        <span className="text-slate-500 text-[11px]">
                          Filial: {s.branch?.nameUz || 'Asosiy filial'}
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
                  );
                })}
              </div>
            )}
          </div>

          {/* Exceptions & Leaves */}
          <div className="lg:col-span-5 bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-teal-700" />
                <span>Ta&apos;tillar va band vaqtlar</span>
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowExceptionModal(true);
                  setExceptionError(null);
                }}
                className="px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Qo&apos;shish</span>
              </button>
            </div>

            {exceptions.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">
                Rejalashtirilgan ta&apos;tillar yoki band vaqtlar yo&apos;q.
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
                      {exc.startTime && exc.endTime && (
                        <span className="text-[11px] text-amber-900 block font-mono">
                          Soat: {exc.startTime} - {exc.endTime}
                        </span>
                      )}
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

      {/* Schedule Edit / Add Modal */}
      {isScheduleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">
                Ish kuni jadvalini saqlash
              </h3>
              <button onClick={() => setIsScheduleModalOpen(false)} className="p-1 text-slate-400">
                ✕
              </button>
            </div>

            {scheduleError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{scheduleError}</span>
              </div>
            )}

            <form onSubmit={handleSaveSchedule} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Hafta kuni *</label>
                <select
                  value={scheduleForm.dayOfWeek}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, dayOfWeek: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                  {DAYS_OF_WEEK.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Filial *</label>
                <select
                  value={scheduleForm.branchId}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, branchId: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nameUz}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Ish boshlanishi *</label>
                  <input
                    type="time"
                    required
                    value={scheduleForm.startTime}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, startTime: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Ish tugashi *</label>
                  <input
                    type="time"
                    required
                    value={scheduleForm.endTime}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, endTime: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tanaffus boshi</label>
                  <input
                    type="time"
                    value={scheduleForm.breakStart}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, breakStart: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tanaffus oxiri</label>
                  <input
                    type="time"
                    value={scheduleForm.breakEnd}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, breakEnd: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsScheduleModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={isSavingSchedule}
                  className="px-5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold shadow-md disabled:opacity-50"
                >
                  {isSavingSchedule ? 'Saqlanmoqda...' : 'Jadvalni saqlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Doctor Create / Edit Modal */}
      {isDoctorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="relative w-full max-w-xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">
                {editingDoctor ? 'Shifokor profilini tahrirlash' : 'Yangi shifokor qo\'shish'}
              </h3>
              <button onClick={() => setIsDoctorModalOpen(false)} className="p-1 text-slate-400">
                ✕
              </button>
            </div>

            {doctorError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{doctorError}</span>
              </div>
            )}

            <form onSubmit={handleSaveDoctor} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Ism (O&apos;zbekcha) *</label>
                  <input
                    type="text"
                    required
                    value={doctorForm.firstNameUz}
                    onChange={(e) => setDoctorForm({ ...doctorForm, firstNameUz: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Familiya (O&apos;zbekcha) *</label>
                  <input
                    type="text"
                    required
                    value={doctorForm.lastNameUz}
                    onChange={(e) => {
                      const last = e.target.value;
                      const slug = `${doctorForm.firstNameUz}-${last}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                      setDoctorForm({
                        ...doctorForm,
                        lastNameUz: last,
                        slug: editingDoctor ? doctorForm.slug : slug,
                      });
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Ism (Ruscha) *</label>
                  <input
                    type="text"
                    required
                    value={doctorForm.firstNameRu}
                    onChange={(e) => setDoctorForm({ ...doctorForm, firstNameRu: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Familiya (Ruscha) *</label>
                  <input
                    type="text"
                    required
                    value={doctorForm.lastNameRu}
                    onChange={(e) => setDoctorForm({ ...doctorForm, lastNameRu: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Slug (URL) *</label>
                  <input
                    type="text"
                    required
                    value={doctorForm.slug}
                    onChange={(e) => setDoctorForm({ ...doctorForm, slug: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tajriba (yil) *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={doctorForm.experienceYears}
                    onChange={(e) => setDoctorForm({ ...doctorForm, experienceYears: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tillar</label>
                  <input
                    type="text"
                    value={doctorForm.languages}
                    onChange={(e) => setDoctorForm({ ...doctorForm, languages: e.target.value })}
                    placeholder="uz, ru, en"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Unvon / Mutaxassislik (O&apos;zbekcha)</label>
                <input
                  type="text"
                  value={doctorForm.titleUz}
                  onChange={(e) => setDoctorForm({ ...doctorForm, titleUz: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Biografiya (O&apos;zbekcha)</label>
                <textarea
                  rows={2}
                  value={doctorForm.bioUz}
                  onChange={(e) => setDoctorForm({ ...doctorForm, bioUz: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Ta&apos;lim ma&apos;lumotlari (O&apos;zbekcha)</label>
                <input
                  type="text"
                  value={doctorForm.educationUz}
                  onChange={(e) => setDoctorForm({ ...doctorForm, educationUz: e.target.value })}
                  placeholder="Toshkent Davlat Stomatologiya Instituti (2012)"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsDoctorModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={isSavingDoctor}
                  className="px-5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold shadow-md disabled:opacity-50"
                >
                  {isSavingDoctor ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Exception Modal */}
      {showExceptionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">
                Ta&apos;til yoki band vaqt qo&apos;shish
              </h3>
              <button onClick={() => setShowExceptionModal(false)} className="p-1 text-slate-400">
                ✕
              </button>
            </div>

            {exceptionError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{exceptionError}</span>
              </div>
            )}

            <form onSubmit={handleAddException} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Turi</label>
                <select
                  value={exceptionType}
                  onChange={(e) => setExceptionType(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                  <option value="LEAVE">Ta&apos;til (Butun kun)</option>
                  <option value="HOLIDAY">Bayram kuni</option>
                  <option value="BLOCKED">Band qilingan soatlar</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Sana *</label>
                <input
                  type="date"
                  required
                  value={exceptionDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setExceptionDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              {exceptionType === 'BLOCKED' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Boshlanish soati</label>
                    <input
                      type="time"
                      value={exceptionStartTime}
                      onChange={(e) => setExceptionStartTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Tugash soati</label>
                    <input
                      type="time"
                      value={exceptionEndTime}
                      onChange={(e) => setExceptionEndTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Sabab (ixtiyoriy)
                </label>
                <input
                  type="text"
                  value={exceptionReason}
                  onChange={(e) => setExceptionReason(e.target.value)}
                  placeholder="Xizmat safari, seminar, konsilium..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowExceptionModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingException}
                  className="px-5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold shadow-md disabled:opacity-50"
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
