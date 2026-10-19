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
  Search,
  Layers,
  Copy,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from 'lucide-react';
import { AdminLayout } from '../../../components/AdminLayout';
import { CustomSelect } from '../../../components/CustomSelect';
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

const EXCEPTION_TYPE_LABELS: Record<string, string> = {
  LEAVE: "Ta'til",
  HOLIDAY: 'Bayram kuni',
  BLOCKED: 'Band soat',
};

export default function AdminDoctorsManagePage() {
  const [doctors, setDoctors] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [doctorSearch, setDoctorSearch] = useState<string>('');
  const [schedules, setSchedules] = useState<any[]>([]);
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Doctor Create/Edit Modal
  const [isDoctorModalOpen, setIsDoctorModalOpen] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<any | null>(null);
  const [isSavingDoctor, setIsSavingDoctor] = useState(false);
  const [doctorError, setDoctorError] = useState<string | null>(null);
  const [doctorForm, setDoctorForm] = useState<{
    firstNameUz: string;
    lastNameUz: string;
    firstNameRu: string;
    lastNameRu: string;
    slug: string;
    titleUz: string;
    titleRu: string;
    bioUz: string;
    bioRu: string;
    educationUz: string;
    educationRu: string;
    experienceYears: number;
    languages: string;
    photoUrl: string;
    isActive: boolean;
    serviceIds: string[];
    branchIds: string[];
  }>({
    firstNameUz: '',
    lastNameUz: '',
    firstNameRu: '',
    lastNameRu: '',
    slug: '',
    titleUz: '',
    titleRu: '',
    bioUz: '',
    bioRu: '',
    educationUz: '',
    educationRu: '',
    experienceYears: 0,
    languages: 'uz, ru',
    photoUrl: '',
    isActive: true,
    serviceIds: [],
    branchIds: [],
  });

  // Bulk Schedule Modal State
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isSavingBulk, setIsSavingBulk] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSuccessMsg, setBulkSuccessMsg] = useState<string | null>(null);
  const [bulkTab, setBulkTab] = useState<'batch' | 'copy'>('batch');
  const [bulkForm, setBulkForm] = useState({
    daysOfWeek: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
    startTime: '09:00',
    endTime: '18:00',
    breakStart: '13:00',
    breakEnd: '14:00',
    branchId: '',
    mode: 'merge' as 'replace' | 'merge',
  });
  const [copyForm, setCopyForm] = useState({
    fromDoctorId: '',
    mode: 'merge' as 'replace' | 'merge',
    targetBranchId: '',
  });

  // Single Schedule Modal
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
      const [docs, branchList, serviceList] = await Promise.all([
        api.getAllDoctorsAdmin().catch(() => api.getDoctors()),
        api.getBranches(),
        api.getServices(),
      ]);
      setDoctors(docs || []);
      setBranches(branchList || []);
      setServices(serviceList || []);
      if (docs && docs.length > 0 && !selectedDoctorId) {
        setSelectedDoctorId(docs[0].id);
      }
      if (branchList && branchList.length > 0 && !scheduleForm.branchId) {
        setScheduleForm((prev) => ({ ...prev, branchId: branchList[0].id }));
        setBulkForm((prev) => ({ ...prev, branchId: branchList[0].id }));
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
      titleUz: '',
      titleRu: '',
      bioUz: '',
      bioRu: '',
      educationUz: '',
      educationRu: '',
      experienceYears: 0,
      languages: 'uz, ru',
      photoUrl: '',
      isActive: true,
      serviceIds: [],
      branchIds: branches.length > 0 ? [branches[0].id] : [],
    });
    setDoctorError(null);
    setIsDoctorModalOpen(true);
  };

  const openEditDoctor = (doc: any) => {
    setEditingDoctor(doc);
    const existingServiceIds = doc.services?.map((s: any) => s.serviceId || s.service?.id).filter(Boolean) || [];
    const existingBranchIds = doc.branches?.map((b: any) => b.branchId || b.branch?.id).filter(Boolean) || [];
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
      experienceYears: Number(doc.experienceYears) || 0,
      languages: Array.isArray(doc.languages) ? doc.languages.join(', ') : 'uz, ru',
      photoUrl: doc.photoUrl || '',
      isActive: doc.isActive !== false,
      serviceIds: existingServiceIds,
      branchIds: existingBranchIds,
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
        experienceYears: Number(doctorForm.experienceYears) || 0,
        languages: langs,
        serviceIds: doctorForm.serviceIds,
        branchIds: doctorForm.branchIds,
      };

      if (editingDoctor) {
        await api.updateDoctorAdmin(editingDoctor.id, payload);
      } else {
        await api.createDoctorAdmin(payload);
      }

      setIsDoctorModalOpen(false);
      await loadDoctorsAndBranches();
      if (selectedDoctorId) {
        await loadDoctorScheduleData(selectedDoctorId);
      }
    } catch (err: any) {
      setDoctorError(err?.message || 'Shifokorni saqlashda xatolik yuz berdi');
    } finally {
      setIsSavingDoctor(false);
    }
  };

  const handleSaveBulkSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoctorId) return;

    try {
      setIsSavingBulk(true);
      setBulkError(null);
      setBulkSuccessMsg(null);

      const res = await api.setBatchSchedules({
        doctorIds: [selectedDoctorId],
        daysOfWeek: bulkForm.daysOfWeek,
        startTime: bulkForm.startTime,
        endTime: bulkForm.endTime,
        breakStart: bulkForm.breakStart || undefined,
        breakEnd: bulkForm.breakEnd || undefined,
        branchId: bulkForm.branchId || branches[0]?.id,
        mode: bulkForm.mode,
      });

      setBulkSuccessMsg(`Haftalik jadval muvaffaqiyatli saqlandi (${res.updatedCount || bulkForm.daysOfWeek.length} ta yozuv)`);
      setTimeout(() => {
        setIsBulkModalOpen(false);
        setBulkSuccessMsg(null);
      }, 1200);
      await loadDoctorScheduleData(selectedDoctorId);
    } catch (err: any) {
      setBulkError(err?.message || 'Ommaviy jadvalni saqlashda xatolik');
    } finally {
      setIsSavingBulk(false);
    }
  };

  const handleCopySchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoctorId || !copyForm.fromDoctorId) return;

    try {
      setIsSavingBulk(true);
      setBulkError(null);
      setBulkSuccessMsg(null);

      const res = await api.copyDoctorSchedules({
        fromDoctorId: copyForm.fromDoctorId,
        toDoctorIds: [selectedDoctorId],
        mode: copyForm.mode,
        targetBranchId: copyForm.targetBranchId || undefined,
      });

      setBulkSuccessMsg(`Jadval muvaffaqiyatli nusxalandi (${res.copiedSchedulesCount || 0} ta yozuv)`);
      setTimeout(() => {
        setIsBulkModalOpen(false);
        setBulkSuccessMsg(null);
      }, 1200);
      await loadDoctorScheduleData(selectedDoctorId);
    } catch (err: any) {
      setBulkError(err?.message || 'Jadvaldan nusxa olishda xatolik');
    } finally {
      setIsSavingBulk(false);
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

  const filteredDoctors = doctors.filter((doc) => {
    if (!doctorSearch.trim()) return true;
    const q = doctorSearch.toLowerCase().trim();
    const fullNameUz = `${doc.firstNameUz || ''} ${doc.lastNameUz || ''}`.toLowerCase();
    const fullNameRu = `${doc.firstNameRu || ''} ${doc.lastNameRu || ''}`.toLowerCase();
    const titleUz = (doc.titleUz || '').toLowerCase();
    return fullNameUz.includes(q) || fullNameRu.includes(q) || titleUz.includes(q) || (doc.slug || '').includes(q);
  });

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
              Shifokorlar profili, xizmatlari, filiallari, ish vaqti va ta&apos;tillari
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

        {/* Searchable Doctor Selector */}
        <div className="bg-white rounded-3xl border border-slate-200 p-4 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={doctorSearch}
                onChange={(e) => setDoctorSearch(e.target.value)}
                placeholder="Shifokor ismi yoki mutaxassisligi bo'yicha qidirish..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white"
              />
            </div>
            <div className="text-xs text-slate-500 font-semibold w-full sm:w-auto text-right">
              Topildi: {filteredDoctors.length} / {doctors.length} ta shifokor
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {filteredDoctors.map((doc) => {
              const isSelected = doc.id === selectedDoctorId;
              const hasServices = (doc.services?.length || 0) > 0;
              const hasBranches = (doc.branches?.length || 0) > 0;
              const isReady = hasServices && hasBranches && doc.isActive;
              return (
                <button
                  type="button"
                  key={doc.id}
                  onClick={() => setSelectedDoctorId(doc.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 transition-all flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-teal-700 text-white shadow-md'
                      : 'bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${isReady ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <span>Dr. {doc.firstNameUz} {doc.lastNameUz}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Doctor Profile Card */}
        {selectedDoctorObj && (() => {
          const docServicesCount = selectedDoctorObj.services?.length || 0;
          const docBranchesCount = selectedDoctorObj.branches?.length || 0;
          const docSchedulesCount = schedules.length;
          const isReady = docServicesCount > 0 && docBranchesCount > 0 && docSchedulesCount > 0 && selectedDoctorObj.isActive;

          return (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex flex-col sm:flex-row items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700 font-bold text-lg shrink-0">
                  {selectedDoctorObj.firstNameUz?.[0]}
                  {selectedDoctorObj.lastNameUz?.[0]}
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900">
                      Dr. {selectedDoctorObj.firstNameUz} {selectedDoctorObj.lastNameUz}
                    </h2>
                    {isReady ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Qabulga yozilishga tayyor
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Qabulga tayyor emas (Sozlamalar yetishmaydi)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-teal-700 font-semibold">{selectedDoctorObj.titleUz || 'Mutaxassis'}</p>
                  <p className="text-[11px] text-slate-500">
                    Tajriba: {selectedDoctorObj.experienceYears || 0} yil • Slug: <code className="text-teal-700">/{selectedDoctorObj.slug}</code>
                  </p>

                  {/* Readiness Breakdown Badges */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${docServicesCount > 0 ? 'bg-slate-100 text-slate-700' : 'bg-rose-100 text-rose-800'}`}>
                      {docServicesCount > 0 ? `Xizmatlar: ${docServicesCount} ta` : '⚠ Xizmat biriktirilmagan'}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${docBranchesCount > 0 ? 'bg-slate-100 text-slate-700' : 'bg-rose-100 text-rose-800'}`}>
                      {docBranchesCount > 0 ? `Filiallar: ${docBranchesCount} ta` : '⚠ Filial biriktirilmagan'}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${docSchedulesCount > 0 ? 'bg-slate-100 text-slate-700' : 'bg-rose-100 text-rose-800'}`}>
                      {docSchedulesCount > 0 ? `Ish jadvali: ${docSchedulesCount} kun` : '⚠ Ish jadvali belgilanmagan'}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => openEditDoctor(selectedDoctorObj)}
                className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm shrink-0"
              >
                <Edit2 className="w-3.5 h-3.5 text-teal-700" />
                <span>Profil va xizmatlarni tahrirlash</span>
              </button>
            </div>
          );
        })()}

        {/* Doctor Schedules & Exceptions Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Weekly Schedule */}
          <div className="lg:col-span-7 bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-teal-700" />
                <span>Haftalik ish jadvali</span>
              </h2>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsBulkModalOpen(true);
                    setBulkError(null);
                    setBulkSuccessMsg(null);
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1 transition-all"
                  title="Bir nechta kunga birdaniga jadval kiritish yoki boshqa shifokordan nusxalash"
                >
                  <Layers className="w-3.5 h-3.5 text-teal-700" />
                  <span>Ommaviy haftalik jadval</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsScheduleModalOpen(true)}
                  className="px-3 py-1.5 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Kun qo&apos;shish</span>
                </button>
              </div>
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
                        {new Date(exc.date).toLocaleDateString()} — {EXCEPTION_TYPE_LABELS[exc.type] || exc.type}
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

              {/* Connected Services */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Ko&apos;rsatadigan xizmatlari * ({doctorForm.serviceIds.length} ta tanlandi)
                </label>
                <div className="max-h-36 overflow-y-auto p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 scrollbar-thin">
                  {services.map((serv) => {
                    const isChecked = doctorForm.serviceIds.includes(serv.id);
                    return (
                      <label key={serv.id} className="flex items-center gap-2 cursor-pointer text-xs p-1 hover:bg-slate-100 rounded-lg">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setDoctorForm((prev) => ({ ...prev, serviceIds: [...prev.serviceIds, serv.id] }));
                            } else {
                              setDoctorForm((prev) => ({ ...prev, serviceIds: prev.serviceIds.filter((id) => id !== serv.id) }));
                            }
                          }}
                          className="w-4 h-4 text-teal-600 rounded"
                        />
                        <span className="font-semibold text-slate-800">{serv.nameUz}</span>
                        <span className="text-[10px] text-slate-400">({serv.durationMinutes} daq)</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Connected Branches */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Ishlaydigan filiallari * ({doctorForm.branchIds.length} ta tanlandi)
                </label>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                  {branches.map((b) => {
                    const isChecked = doctorForm.branchIds.includes(b.id);
                    return (
                      <label key={b.id} className="flex items-center gap-2 cursor-pointer text-xs p-1 hover:bg-slate-100 rounded-lg">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setDoctorForm((prev) => ({ ...prev, branchIds: [...prev.branchIds, b.id] }));
                            } else {
                              setDoctorForm((prev) => ({ ...prev, branchIds: prev.branchIds.filter((id) => id !== b.id) }));
                            }
                          }}
                          className="w-4 h-4 text-teal-600 rounded"
                        />
                        <span className="font-semibold text-slate-800">{b.nameUz}</span>
                        <span className="text-[10px] text-slate-400">({b.addressUz})</span>
                      </label>
                    );
                  })}
                </div>
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

      {/* Bulk Weekly Schedule Modal */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="relative w-full max-w-xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
                  <Layers className="w-4 h-4 text-teal-700" />
                  <span>Ommaviy haftalik ish jadvali sozlamalari</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Dr. {selectedDoctorObj?.firstNameUz} {selectedDoctorObj?.lastNameUz} uchun jadval
                </p>
              </div>
              <button onClick={() => setIsBulkModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            {/* Mode Tabs */}
            <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold">
              <button
                type="button"
                onClick={() => setBulkTab('batch')}
                className={`flex-1 py-1.5 rounded-lg transition-all ${
                  bulkTab === 'batch' ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tanlangan kunlarga kiritish
              </button>
              <button
                type="button"
                onClick={() => setBulkTab('copy')}
                className={`flex-1 py-1.5 rounded-lg transition-all ${
                  bulkTab === 'copy' ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Boshqa shifokordan nusxalash
              </button>
            </div>

            {bulkError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{bulkError}</span>
              </div>
            )}

            {bulkSuccessMsg && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                <span>{bulkSuccessMsg}</span>
              </div>
            )}

            {bulkTab === 'batch' ? (
              <form onSubmit={handleSaveBulkSchedule} className="space-y-4 text-xs">
                {/* Weekdays Multi-select */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-bold text-slate-700">Hafta kunlarini tanlang *</label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setBulkForm((prev) => ({ ...prev, daysOfWeek: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'] }))}
                        className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-semibold"
                      >
                        Du-Ju
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkForm((prev) => ({ ...prev, daysOfWeek: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] }))}
                        className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-semibold"
                      >
                        Du-Sha
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkForm((prev) => ({ ...prev, daysOfWeek: DAYS_OF_WEEK.map((d) => d.value) }))}
                        className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-semibold"
                      >
                        Hammasi
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {DAYS_OF_WEEK.map((day) => {
                      const isChecked = bulkForm.daysOfWeek.includes(day.value);
                      return (
                        <label
                          key={day.value}
                          className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer transition-all ${
                            isChecked
                              ? 'border-teal-500 bg-teal-50/50 text-teal-900 font-bold'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setBulkForm((prev) => ({ ...prev, daysOfWeek: [...prev.daysOfWeek, day.value] }));
                              } else {
                                setBulkForm((prev) => ({
                                  ...prev,
                                  daysOfWeek: prev.daysOfWeek.filter((d) => d !== day.value),
                                }));
                              }
                            }}
                            className="w-4 h-4 text-teal-600 rounded"
                          />
                          <span>{day.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Quick copy Monday action */}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      const mondaySched = schedules.find((s) => s.dayOfWeek === 'MONDAY');
                      if (mondaySched) {
                        setBulkForm((prev) => ({
                          ...prev,
                          startTime: mondaySched.startTime,
                          endTime: mondaySched.endTime,
                          breakStart: mondaySched.breakStart || '13:00',
                          breakEnd: mondaySched.breakEnd || '14:00',
                        }));
                      } else {
                        alert("Dushanba kuni uchun mavjud jadval topilmadi");
                      }
                    }}
                    className="text-[11px] text-teal-700 hover:text-teal-900 font-bold flex items-center gap-1 hover:underline"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Dushanba parametrlarini ko&apos;chirish</span>
                  </button>
                </div>

                {/* Branch selector */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Qaysi filial uchun? *</label>
                  <select
                    value={bulkForm.branchId}
                    onChange={(e) => setBulkForm({ ...bulkForm, branchId: e.target.value })}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.nameUz} ({b.addressUz})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Working Interval */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Ish boshlanishi *</label>
                    <input
                      type="time"
                      required
                      value={bulkForm.startTime}
                      onChange={(e) => setBulkForm({ ...bulkForm, startTime: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Ish tugashi *</label>
                    <input
                      type="time"
                      required
                      value={bulkForm.endTime}
                      onChange={(e) => setBulkForm({ ...bulkForm, endTime: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200"
                    />
                  </div>
                </div>

                {/* Break Interval */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Tanaffus boshlanishi</label>
                    <input
                      type="time"
                      value={bulkForm.breakStart}
                      onChange={(e) => setBulkForm({ ...bulkForm, breakStart: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Tanaffus tugashi</label>
                    <input
                      type="time"
                      value={bulkForm.breakEnd}
                      onChange={(e) => setBulkForm({ ...bulkForm, breakEnd: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200"
                    />
                  </div>
                </div>

                {/* Mode: Replace vs Merge */}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="font-bold text-slate-800">Qo&apos;llash rejimi:</div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="bulkMode"
                        value="merge"
                        checked={bulkForm.mode === 'merge'}
                        onChange={() => setBulkForm({ ...bulkForm, mode: 'merge' })}
                        className="text-teal-600"
                      />
                      <span><strong>Birlashtirish (Merge)</strong> — mavjud kunlarni yangilaydi</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="bulkMode"
                        value="replace"
                        checked={bulkForm.mode === 'replace'}
                        onChange={() => setBulkForm({ ...bulkForm, mode: 'replace' })}
                        className="text-teal-600"
                      />
                      <span><strong>To&apos;liq almashtirish (Replace)</strong></span>
                    </label>
                  </div>
                </div>

                {/* Preview */}
                <div className="p-3 bg-teal-50/50 border border-teal-100 rounded-xl text-[11px] text-teal-900">
                  <div className="font-bold mb-1">Jadval xulosasi:</div>
                  <div>Kunlar: {bulkForm.daysOfWeek.map((d) => DAYS_OF_WEEK.find((x) => x.value === d)?.label).join(', ') || 'Tanlanmagan'}</div>
                  <div>Ish vaqti: {bulkForm.startTime} - {bulkForm.endTime} (Tanaffus: {bulkForm.breakStart} - {bulkForm.breakEnd})</div>
                </div>

                <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsBulkModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold"
                  >
                    Bekor qilish
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingBulk || bulkForm.daysOfWeek.length === 0}
                    className="px-5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold shadow-md disabled:opacity-50"
                  >
                    {isSavingBulk ? 'Saqlanmoqda...' : 'Jadvalni qo\'llash'}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleCopySchedule} className="space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Qaysi shifokordan nusxa olinadi? *</label>
                  <select
                    value={copyForm.fromDoctorId}
                    onChange={(e) => setCopyForm({ ...copyForm, fromDoctorId: e.target.value })}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium"
                  >
                    <option value="">-- Shifokorni tanlang --</option>
                    {doctors
                      .filter((d) => d.id !== selectedDoctorId)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          Dr. {d.firstNameUz} {d.lastNameUz} ({d.titleUz || 'Shifokor'})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Maqsadli filial (ixtiyoriy)</label>
                  <select
                    value={copyForm.targetBranchId}
                    onChange={(e) => setCopyForm({ ...copyForm, targetBranchId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium"
                  >
                    <option value="">-- Manbadagi filial saqlansin --</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.nameUz}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="font-bold text-slate-800">Nusxalash rejimi:</div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="copyMode"
                        value="merge"
                        checked={copyForm.mode === 'merge'}
                        onChange={() => setCopyForm({ ...copyForm, mode: 'merge' })}
                        className="text-teal-600"
                      />
                      <span><strong>Birlashtirish (Merge)</strong> — mavjud kunlarni saqlaydi</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="copyMode"
                        value="replace"
                        checked={copyForm.mode === 'replace'}
                        onChange={() => setCopyForm({ ...copyForm, mode: 'replace' })}
                        className="text-teal-600"
                      />
                      <span><strong>Almashtirish (Replace)</strong></span>
                    </label>
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsBulkModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold"
                  >
                    Bekor qilish
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingBulk || !copyForm.fromDoctorId}
                    className="px-5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold shadow-md disabled:opacity-50"
                  >
                    {isSavingBulk ? 'Nusxalanmoqda...' : 'Nusxa olish'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
