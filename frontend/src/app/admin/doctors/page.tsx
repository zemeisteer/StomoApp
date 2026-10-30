'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
import { CustomDatePicker } from '../../../components/CustomDatePicker';
import { ModalDialog } from '../../../components/ModalDialog';
import { api } from '../../../lib/api';
import { formatClinicDate } from '../../../lib/dateFormat';
import { useI18n } from '../../../lib/i18n';
import {
  translateName,
  translateSpecialty,
  generateDoctorSlug,
  latinToCyrillic,
} from '../../../lib/transliterate';

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
  OVERTIME: "Qo'shimcha ish vaqti (Overtime)",
};

const AVAILABLE_LANGUAGES = [
  { code: 'uz', label: "O'zbekcha", flag: '🇺🇿' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
];

const SPECIALTY_PRESETS = [
  { uz: 'Stomatolog-terapevt', ru: 'Стоматолог-терапевт' },
  { uz: 'Stomatolog-ortoped', ru: 'Стоматолог-ортопед' },
  { uz: 'Stomatolog-jarroh', ru: 'Стоматолог-хирург' },
  { uz: 'Ortodont', ru: 'Ортодонт' },
  { uz: 'Implantolog', ru: 'Имплантолог' },
  { uz: 'Bolalar stomatologi', ru: 'Детский стоматолог' },
  { uz: 'Parodontolog', ru: 'Пародонтолог' },
  { uz: 'Bosh shifokor', ru: 'Главный врач' },
];

const EDUCATION_PRESETS = [
  'Toshkent Davlat Stomatologiya Instituti',
  'Samarqand Davlat Tibbiyot Universiteti',
  'Toshkent Tibbiyot Akademiyasi',
  'Andijon Davlat Tibbiyot Instituti',
];

export default function AdminDoctorsManagePage() {
  const { language } = useI18n();
  const isRu = language === 'ru';
  const isUz = !isRu;

  const [doctors, setDoctors] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [doctorSearch, setDoctorSearch] = useState<string>('');
  const [schedules, setSchedules] = useState<any[]>([]);
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Doctor Deletion & Lifecycle Modal State
  const [deletingDoctor, setDeletingDoctor] = useState<any | null>(null);
  const [doctorPreview, setDoctorPreview] = useState<any | null>(null);
  const [isLoadingDoctorPreview, setIsLoadingDoctorPreview] = useState(false);
  const [isDeletingDoctor, setIsDeletingDoctor] = useState(false);
  const [deleteDoctorError, setDeleteDoctorError] = useState<string | null>(null);
  const [deleteDoctorSuccess, setDeleteDoctorSuccess] = useState<string | null>(null);

  // Exception Deletion State
  const [deletingExceptionId, setDeletingExceptionId] = useState<string | null>(null);
  const [isDeletingException, setIsDeletingException] = useState(false);

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
    languages: string[];
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
    languages: ['uz', 'ru'],
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
    doctorIds: [] as string[],
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
    toDoctorIds: [] as string[],
    mode: 'merge' as 'replace' | 'merge',
    targetBranchId: '',
  });
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewResult, setPreviewResult] = useState<any | null>(null);

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
  const [exceptionBranchId, setExceptionBranchId] = useState('');
  const [isSubmittingException, setIsSubmittingException] = useState(false);
  const [exceptionError, setExceptionError] = useState<string | null>(null);

  const selectedDoctor = useMemo(() => {
    return doctors.find((d) => d.id === selectedDoctorId);
  }, [doctors, selectedDoctorId]);

  const eligibleDoctorBranches = useMemo(() => {
    if (!selectedDoctor) return [];
    const branchMap = new Map<string, any>();
    if (Array.isArray(selectedDoctor.branches)) {
      selectedDoctor.branches.forEach((b: any) => {
        const br = b.branch || branches.find((branch) => branch.id === (b.branchId || b.id));
        if (br && br.isActive !== false) {
          branchMap.set(br.id, br);
        }
      });
    }
    if (Array.isArray(selectedDoctor.schedules)) {
      selectedDoctor.schedules.forEach((s: any) => {
        if (s.isActive !== false) {
          const br = s.branch || branches.find((branch) => branch.id === s.branchId);
          if (br && br.isActive !== false) {
            branchMap.set(br.id, br);
          }
        }
      });
    }
    return Array.from(branchMap.values());
  }, [selectedDoctor, branches]);

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
      languages: ['uz', 'ru'],
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
    const existingLangs = Array.isArray(doc.languages)
      ? doc.languages
      : typeof doc.languages === 'string'
      ? doc.languages.split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean)
      : ['uz', 'ru'];

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
      languages: existingLangs.length > 0 ? existingLangs : ['uz', 'ru'],
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

      // Auto-generate slug if not explicitly set
      const autoSlug = doctorForm.slug || generateDoctorSlug(doctorForm.firstNameUz, doctorForm.lastNameUz);

      const langs = Array.isArray(doctorForm.languages) && doctorForm.languages.length > 0
        ? doctorForm.languages
        : ['uz', 'ru'];

      const payload = {
        ...doctorForm,
        slug: autoSlug,
        titleRu: doctorForm.titleRu || translateSpecialty(doctorForm.titleUz).ru,
        bioRu: doctorForm.bioRu || latinToCyrillic(doctorForm.bioUz),
        educationRu: doctorForm.educationRu || latinToCyrillic(doctorForm.educationUz),
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
      setDoctorError(err?.message || (isRu ? 'Ошибка при сохранении врача' : 'Shifokorni saqlashda xatolik yuz berdi'));
    } finally {
      setIsSavingDoctor(false);
    }
  };

  const handlePreviewBulkSchedule = async () => {
    const targetDocIds = bulkForm.doctorIds.length > 0
      ? bulkForm.doctorIds
      : (selectedDoctorId ? [selectedDoctorId] : []);
    if (targetDocIds.length === 0) {
      setBulkError('Kamida bitta shifokor tanlanishi shart');
      return;
    }
    if (bulkForm.daysOfWeek.length === 0) {
      setBulkError('Kamida bitta hafta kuni tanlanishi shart');
      return;
    }

    try {
      setIsPreviewing(true);
      setBulkError(null);
      setPreviewResult(null);

      const res = await api.previewBatchSchedules({
        doctorIds: targetDocIds,
        daysOfWeek: bulkForm.daysOfWeek,
        startTime: bulkForm.startTime,
        endTime: bulkForm.endTime,
        breakStart: bulkForm.breakStart || undefined,
        breakEnd: bulkForm.breakEnd || undefined,
        branchId: bulkForm.branchId || branches[0]?.id,
        mode: bulkForm.mode,
      });

      setPreviewResult(res);
    } catch (err: any) {
      setBulkError(err?.message || 'Jadvalni tekshirishda xatolik yuz berdi');
    } finally {
      setIsPreviewing(false);
    }
  };

  const handlePreviewCopySchedule = async () => {
    if (!copyForm.fromDoctorId) {
      setBulkError('Manba shifokorni tanlang');
      return;
    }
    const targetDocIds = copyForm.toDoctorIds.length > 0
      ? copyForm.toDoctorIds.filter((id) => id !== copyForm.fromDoctorId)
      : (selectedDoctorId && selectedDoctorId !== copyForm.fromDoctorId ? [selectedDoctorId] : []);
    if (targetDocIds.length === 0) {
      setBulkError('Nusxa olinadigan maqsadli shifokorlarni tanlang');
      return;
    }

    try {
      setIsPreviewing(true);
      setBulkError(null);
      setPreviewResult(null);

      const res = await api.previewCopyDoctorSchedules({
        fromDoctorId: copyForm.fromDoctorId,
        toDoctorIds: targetDocIds,
        mode: copyForm.mode,
        targetBranchId: copyForm.targetBranchId || undefined,
      });

      setPreviewResult(res);
    } catch (err: any) {
      setBulkError(err?.message || 'Jadval nusxasini tekshirishda xatolik yuz berdi');
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleSaveBulkSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetDocIds = bulkForm.doctorIds.length > 0
      ? bulkForm.doctorIds
      : (selectedDoctorId ? [selectedDoctorId] : []);
    if (targetDocIds.length === 0) {
      setBulkError('Kamida bitta shifokor tanlanishi shart');
      return;
    }

    try {
      setIsSavingBulk(true);
      setBulkError(null);
      setBulkSuccessMsg(null);

      const res = await api.setBatchSchedules({
        doctorIds: targetDocIds,
        daysOfWeek: bulkForm.daysOfWeek,
        startTime: bulkForm.startTime,
        endTime: bulkForm.endTime,
        breakStart: bulkForm.breakStart || undefined,
        breakEnd: bulkForm.breakEnd || undefined,
        branchId: bulkForm.branchId || branches[0]?.id,
        mode: bulkForm.mode,
      });

      setBulkSuccessMsg(`Haftalik jadval muvaffaqiyatli saqlandi (${res.totalApplied || res.updatedCount || bulkForm.daysOfWeek.length} ta yozuv)`);
      setTimeout(() => {
        setIsBulkModalOpen(false);
        setBulkSuccessMsg(null);
        setPreviewResult(null);
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
    if (!copyForm.fromDoctorId) {
      setBulkError('Manba shifokor tanlanmagan');
      return;
    }
    const targetDocIds = copyForm.toDoctorIds.length > 0
      ? copyForm.toDoctorIds.filter((id) => id !== copyForm.fromDoctorId)
      : (selectedDoctorId && selectedDoctorId !== copyForm.fromDoctorId ? [selectedDoctorId] : []);
    if (targetDocIds.length === 0) {
      setBulkError('Maqsadli shifokorlar tanlanmagan');
      return;
    }

    try {
      setIsSavingBulk(true);
      setBulkError(null);
      setBulkSuccessMsg(null);

      const res = await api.copyDoctorSchedules({
        fromDoctorId: copyForm.fromDoctorId,
        toDoctorIds: targetDocIds,
        mode: copyForm.mode,
        targetBranchId: copyForm.targetBranchId || undefined,
      });

      setBulkSuccessMsg(`Jadval muvaffaqiyatli nusxalandi (${res.copiedSchedulesCount || 0} ta yozuv)`);
      setTimeout(() => {
        setIsBulkModalOpen(false);
        setBulkSuccessMsg(null);
        setPreviewResult(null);
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

    if (exceptionType === 'OVERTIME') {
      if (!exceptionStartTime || !exceptionEndTime) {
        setExceptionError("Qo'shimcha ish vaqti uchun boshlanish va tugash soatini kiriting");
        return;
      }
      if (eligibleDoctorBranches.length > 1 && !exceptionBranchId) {
        setExceptionError("Shifokor bir nechta filialda ishlaydi. Iltimos filialni tanlang");
        return;
      }
    }

    try {
      setIsSubmittingException(true);
      setExceptionError(null);
      const chosenBranchId =
        exceptionType === 'OVERTIME'
          ? (exceptionBranchId || (eligibleDoctorBranches.length === 1 ? eligibleDoctorBranches[0].id : undefined))
          : undefined;

      await api.addDoctorException({
        doctorId: selectedDoctorId,
        type: exceptionType,
        date: exceptionDate,
        startTime: exceptionStartTime || undefined,
        endTime: exceptionEndTime || undefined,
        reason: exceptionReason || undefined,
        branchId: chosenBranchId,
      });
      setShowExceptionModal(false);
      setExceptionReason('');
      setExceptionStartTime('');
      setExceptionEndTime('');
      setExceptionBranchId('');
      await loadDoctorScheduleData(selectedDoctorId);
    } catch (err: any) {
      setExceptionError(err?.message || 'Ta\'til qo\'shishda xatolik yuz berdi');
    } finally {
      setIsSubmittingException(false);
    }
  };

  const promptDeleteException = (id: string) => {
    setDeletingExceptionId(id);
  };

  const confirmDeleteException = async () => {
    if (!deletingExceptionId || isDeletingException) return;
    try {
      setIsDeletingException(true);
      await api.deleteDoctorException(deletingExceptionId);
      setDeletingExceptionId(null);
      await loadDoctorScheduleData(selectedDoctorId);
    } catch (err: any) {
      setExceptionError(err?.message || (isRu ? 'Ошибка при удалении записи' : 'O\'chirishda xatolik'));
    } finally {
      setIsDeletingException(false);
    }
  };

  const promptDeleteDoctor = async (doc: any) => {
    if (!doc) return;
    setDeletingDoctor(doc);
    setDoctorPreview(null);
    setDeleteDoctorError(null);
    setDeleteDoctorSuccess(null);
    setIsLoadingDoctorPreview(true);
    try {
      const preview = await api.getDoctorLifecyclePreview(doc.id);
      setDoctorPreview(preview);
    } catch (err: any) {
      setDeleteDoctorError(err?.message || (isRu ? 'Ошибка при проверке статуса врача' : 'Shifokor holatini tekshirishda xatolik yuz berdi'));
    } finally {
      setIsLoadingDoctorPreview(false);
    }
  };

  const confirmDeleteDoctor = async () => {
    if (!deletingDoctor || isDeletingDoctor) return;
    try {
      setIsDeletingDoctor(true);
      setDeleteDoctorError(null);
      const res = await api.deleteDoctorAdmin(deletingDoctor.id);
      setDeleteDoctorSuccess(res?.message || (isRu ? 'Врач успешно удален' : 'Shifokor muvaffaqiyatli o‘chirildi'));
      await loadDoctorsAndBranches();
      setTimeout(() => {
        setDeletingDoctor(null);
        setDoctorPreview(null);
        setDeleteDoctorSuccess(null);
      }, 1200);
    } catch (err: any) {
      setDeleteDoctorError(err?.message || (isRu ? 'Ошибка при удалении врача' : 'Shifokorni o‘chirishda xatolik yuz berdi'));
    } finally {
      setIsDeletingDoctor(false);
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

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => openEditDoctor(selectedDoctorObj)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
                >
                  <Edit2 className="w-3.5 h-3.5 text-teal-700" />
                  <span>Profil va xizmatlarni tahrirlash</span>
                </button>
                <button
                  type="button"
                  onClick={() => promptDeleteDoctor(selectedDoctorObj)}
                  className="px-3.5 py-2 border border-rose-200 text-rose-700 hover:bg-rose-50 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                  title="Shifokorni o'chirish"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                  <span>O&apos;chirish</span>
                </button>
              </div>
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
                    setPreviewResult(null);
                    if (selectedDoctorId) {
                      setBulkForm((prev) => ({
                        ...prev,
                        doctorIds: prev.doctorIds.length > 0 ? prev.doctorIds : [selectedDoctorId],
                        branchId: prev.branchId || branches[0]?.id || '',
                      }));
                      setCopyForm((prev) => ({
                        ...prev,
                        toDoctorIds: prev.toDoctorIds.length > 0 ? prev.toDoctorIds : [selectedDoctorId],
                      }));
                    }
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
                        {formatClinicDate(exc.date, 'uz')} — {EXCEPTION_TYPE_LABELS[exc.type] || exc.type}
                      </span>
                      {exc.startTime && exc.endTime && (
                        <span className="text-[11px] text-amber-900 block font-mono">
                          Soat: {exc.startTime} - {exc.endTime}
                        </span>
                      )}
                      {exc.branchId && (
                        <span className="text-[11px] text-teal-800 font-semibold block mt-0.5">
                          Filial: {exc.branch?.nameUz || branches.find((b) => b.id === exc.branchId)?.nameUz || exc.branchId}
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
                      onClick={() => promptDeleteException(exc.id)}
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
                <CustomSelect
                  label="Hafta kuni *"
                  options={DAYS_OF_WEEK.map((d) => ({ value: d.value, label: d.label }))}
                  value={scheduleForm.dayOfWeek}
                  onChange={(val) => setScheduleForm({ ...scheduleForm, dayOfWeek: val })}
                  placeholder="Hafta kunini tanlang..."
                />
              </div>

              <div>
                <CustomSelect
                  label="Filial *"
                  options={branches.map((b) => ({ value: b.id, label: b.nameUz }))}
                  value={scheduleForm.branchId}
                  onChange={(val) => setScheduleForm({ ...scheduleForm, branchId: val })}
                  placeholder="Filialni tanlang..."
                />
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
              {/* Names: Uzbek Latin and Russian Cyrillic with bidirectional auto-sync */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-slate-700">Ism (O&apos;zbekcha) *</label>
                    <span className="text-[10px] text-teal-600 font-semibold">Avto-tarjima</span>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Masalan: Anvar"
                    value={doctorForm.firstNameUz}
                    onChange={(e) => {
                      const val = e.target.value;
                      const { uz, ru } = translateName(val);
                      setDoctorForm((prev) => ({
                        ...prev,
                        firstNameUz: val,
                        firstNameRu: ru || prev.firstNameRu,
                        slug: editingDoctor ? prev.slug : generateDoctorSlug(uz || val, prev.lastNameUz),
                      }));
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-bold text-slate-700">Familiya (O&apos;zbekcha) *</label>
                    <span className="text-[10px] text-teal-600 font-semibold">Avto-tarjima</span>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="Masalan: Karimov"
                    value={doctorForm.lastNameUz}
                    onChange={(e) => {
                      const val = e.target.value;
                      const { uz, ru } = translateName(val);
                      setDoctorForm((prev) => ({
                        ...prev,
                        lastNameUz: val,
                        lastNameRu: ru || prev.lastNameRu,
                        slug: editingDoctor ? prev.slug : generateDoctorSlug(prev.firstNameUz, uz || val),
                      }));
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Ism (Ruscha) *</label>
                  <input
                    type="text"
                    required
                    placeholder="Анвар"
                    value={doctorForm.firstNameRu}
                    onChange={(e) => {
                      const val = e.target.value;
                      const { uz } = translateName(val);
                      setDoctorForm((prev) => ({
                        ...prev,
                        firstNameRu: val,
                        firstNameUz: uz || prev.firstNameUz,
                        slug: editingDoctor ? prev.slug : generateDoctorSlug(uz || prev.firstNameUz, prev.lastNameUz),
                      }));
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Familiya (Ruscha) *</label>
                  <input
                    type="text"
                    required
                    placeholder="Каримов"
                    value={doctorForm.lastNameRu}
                    onChange={(e) => {
                      const val = e.target.value;
                      const { uz } = translateName(val);
                      setDoctorForm((prev) => ({
                        ...prev,
                        lastNameRu: val,
                        lastNameUz: uz || prev.lastNameUz,
                        slug: editingDoctor ? prev.slug : generateDoctorSlug(prev.firstNameUz, uz || prev.lastNameUz),
                      }));
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* Tajriba and Tillar selection (Interactive Pill selector) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tajriba (yil) *</label>
                  <input
                    type="number"
                    required
                    min={0}
                    max={60}
                    value={doctorForm.experienceYears}
                    onChange={(e) => setDoctorForm({ ...doctorForm, experienceYears: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Muloqot tillari *</label>
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {AVAILABLE_LANGUAGES.map((lang) => {
                      const isSelected = doctorForm.languages.includes(lang.code);
                      return (
                        <button
                          key={lang.code}
                          type="button"
                          onClick={() => {
                            setDoctorForm((prev) => {
                              const exists = prev.languages.includes(lang.code);
                              const updated = exists
                                ? prev.languages.filter((c) => c !== lang.code)
                                : [...prev.languages, lang.code];
                              return {
                                ...prev,
                                languages: updated.length > 0 ? updated : [lang.code],
                              };
                            });
                          }}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${
                            isSelected
                              ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <span>{lang.flag}</span>
                          <span>{lang.label}</span>
                          {isSelected && <span className="text-[10px]">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Mutaxassislik va Unvon */}
              <div className="space-y-1.5 p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-slate-800">
                    Mutaxassislik va Unvon *
                  </label>
                  <span className="text-[10px] text-slate-500">
                    💡 Shifokor yo&apos;nalishi va toifasi
                  </span>
                </div>

                {/* Quick specialty presets */}
                <div className="flex flex-wrap gap-1 mb-2">
                  {SPECIALTY_PRESETS.map((spec) => {
                    const isCurrent = doctorForm.titleUz === spec.uz;
                    return (
                      <button
                        key={spec.uz}
                        type="button"
                        onClick={() => {
                          setDoctorForm((prev) => ({
                            ...prev,
                            titleUz: spec.uz,
                            titleRu: spec.ru,
                          }));
                        }}
                        className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all ${
                          isCurrent
                            ? 'bg-teal-700 text-white'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {spec.uz}
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-0.5">O&apos;zbekcha</label>
                    <input
                      type="text"
                      placeholder="Stomatolog-terapevt"
                      value={doctorForm.titleUz}
                      onChange={(e) => {
                        const val = e.target.value;
                        const spec = translateSpecialty(val);
                        setDoctorForm((prev) => ({
                          ...prev,
                          titleUz: val,
                          titleRu: spec.ru || latinToCyrillic(val),
                        }));
                      }}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white focus:border-teal-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block mb-0.5">Ruscha</label>
                    <input
                      type="text"
                      placeholder="Стоматолог-терапевт"
                      value={doctorForm.titleRu}
                      onChange={(e) => setDoctorForm({ ...doctorForm, titleRu: e.target.value })}
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white focus:border-teal-500"
                    />
                  </div>
                </div>
              </div>

              {/* Biografiya */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-700">Biografiya</label>
                  <span className="text-[10px] text-teal-600 font-semibold">Ruscha avto-sinxronlanadi</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <textarea
                      rows={2}
                      placeholder="Biografiya (O'zbekcha)"
                      value={doctorForm.bioUz}
                      onChange={(e) => {
                        const val = e.target.value;
                        setDoctorForm((prev) => ({
                          ...prev,
                          bioUz: val,
                          bioRu: latinToCyrillic(val),
                        }));
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-teal-500"
                    />
                  </div>
                  <div>
                    <textarea
                      rows={2}
                      placeholder="Биография (Русский)"
                      value={doctorForm.bioRu}
                      onChange={(e) => setDoctorForm({ ...doctorForm, bioRu: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-teal-500"
                    />
                  </div>
                </div>
              </div>

              {/* Ta'lim ma'lumotlari */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-700">Ta&apos;lim ma&apos;lumotlari</label>
                  <span className="text-[10px] text-teal-600 font-semibold">Avto-tarjima</span>
                </div>
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {EDUCATION_PRESETS.map((uni) => (
                    <button
                      key={uni}
                      type="button"
                      onClick={() => {
                        setDoctorForm((prev) => ({
                          ...prev,
                          educationUz: uni,
                          educationRu: latinToCyrillic(uni),
                        }));
                      }}
                      className="px-2 py-0.5 rounded text-[10px] bg-slate-100 text-slate-600 hover:bg-teal-50 hover:text-teal-700 border border-slate-200"
                    >
                      {uni}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Toshkent Davlat Stomatologiya Instituti (2012)"
                    value={doctorForm.educationUz}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDoctorForm((prev) => ({
                        ...prev,
                        educationUz: val,
                        educationRu: latinToCyrillic(val),
                      }));
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-teal-500"
                  />
                  <input
                    type="text"
                    placeholder="Ташкентский Государственный Стоматологический Институт (2012)"
                    value={doctorForm.educationRu}
                    onChange={(e) => setDoctorForm({ ...doctorForm, educationRu: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-teal-500"
                  />
                </div>
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

              <div className="pt-2 flex justify-between items-center border-t border-slate-100">
                {editingDoctor ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsDoctorModalOpen(false);
                      promptDeleteDoctor(editingDoctor);
                    }}
                    className="px-3.5 py-2 text-rose-600 hover:bg-rose-50 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 text-rose-600" />
                    <span>Shifokorni o&apos;chirish</span>
                  </button>
                ) : <div />}

                <div className="flex gap-2">
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
                <CustomSelect
                  label="Turi"
                  options={[
                    { value: 'LEAVE', label: "Ta'til (Butun kun)" },
                    { value: 'HOLIDAY', label: 'Bayram kuni' },
                    { value: 'BLOCKED', label: 'Band qilingan soatlar' },
                    { value: 'OVERTIME', label: "Qo'shimcha ish vaqti (Overtime)" },
                  ]}
                  value={exceptionType}
                  onChange={(val) => {
                    setExceptionType(val);
                    if (val === 'OVERTIME' && eligibleDoctorBranches.length === 1) {
                      setExceptionBranchId(eligibleDoctorBranches[0].id);
                    }
                  }}
                  placeholder="Turini tanlang..."
                />
              </div>

              {exceptionType === 'OVERTIME' && (
                <div>
                  <CustomSelect
                    id="admin-doctor-exception-branch"
                    label="Filial *"
                    options={eligibleDoctorBranches.map((b) => ({
                      value: b.id,
                      label: `${b.nameUz} (${b.addressUz || ''})`,
                    }))}
                    value={exceptionBranchId || (eligibleDoctorBranches.length === 1 ? eligibleDoctorBranches[0].id : '')}
                    onChange={(val) => setExceptionBranchId(val)}
                    placeholder="Filialni tanlang..."
                  />
                  {eligibleDoctorBranches.length > 1 && !exceptionBranchId && (
                    <p className="text-[11px] text-amber-700 mt-1">
                      Shifokor bir nechta filialda ishlaydi. Qaysi filialda overtime bo&apos;lishini aniq tanlang.
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Sana *</label>
                <CustomDatePicker
                  id="admin-doctor-exception-date"
                  required
                  value={exceptionDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={(val) => setExceptionDate(val)}
                  placeholder="Sanani tanlang..."
                />
              </div>

              {(exceptionType === 'BLOCKED' || exceptionType === 'OVERTIME') && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Boshlanish soati {exceptionType === 'OVERTIME' && '*'}
                    </label>
                    <input
                      type="time"
                      required={exceptionType === 'OVERTIME'}
                      value={exceptionStartTime}
                      onChange={(e) => setExceptionStartTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Tugash soati {exceptionType === 'OVERTIME' && '*'}
                    </label>
                    <input
                      type="time"
                      required={exceptionType === 'OVERTIME'}
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
                {/* Doctor Multi-Select */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-bold text-slate-700">
                      Shifokorlarni tanlang * ({bulkForm.doctorIds.length} ta tanlandi)
                    </label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewResult(null);
                          setBulkForm((prev) => ({
                            ...prev,
                            doctorIds: doctors.filter((d) => d.isActive).map((d) => d.id),
                          }));
                        }}
                        className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-semibold"
                      >
                        Barchasi
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewResult(null);
                          setBulkForm((prev) => ({ ...prev, doctorIds: [] }));
                        }}
                        className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-semibold"
                      >
                        Tozalash
                      </button>
                    </div>
                  </div>
                  <div className="max-h-28 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap gap-1.5 scrollbar-thin">
                    {doctors.filter((d) => d.isActive).map((doc) => {
                      const isChecked = bulkForm.doctorIds.includes(doc.id);
                      return (
                        <label
                          key={doc.id}
                          className={`px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 ${
                            isChecked
                              ? 'bg-teal-700 border-teal-700 text-white shadow-xs'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={isChecked}
                            onChange={(e) => {
                              setPreviewResult(null);
                              if (e.target.checked) {
                                setBulkForm((prev) => ({ ...prev, doctorIds: [...prev.doctorIds, doc.id] }));
                              } else {
                                setBulkForm((prev) => ({
                                  ...prev,
                                  doctorIds: prev.doctorIds.filter((id) => id !== doc.id),
                                }));
                              }
                            }}
                          />
                          <span>Dr. {doc.firstNameUz} {doc.lastNameUz}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Weekdays Multi-select */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-bold text-slate-700">Hafta kunlarini tanlang *</label>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewResult(null);
                          setBulkForm((prev) => ({
                            ...prev,
                            daysOfWeek: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
                          }));
                        }}
                        className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-semibold"
                      >
                        Du-Ju
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewResult(null);
                          setBulkForm((prev) => ({
                            ...prev,
                            daysOfWeek: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'],
                          }));
                        }}
                        className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-semibold"
                      >
                        Du-Sha
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewResult(null);
                          setBulkForm((prev) => ({ ...prev, daysOfWeek: DAYS_OF_WEEK.map((d) => d.value) }));
                        }}
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
                              setPreviewResult(null);
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
                        setBulkError(null);
                        setPreviewResult(null);
                        setBulkForm((prev) => ({
                          ...prev,
                          startTime: mondaySched.startTime,
                          endTime: mondaySched.endTime,
                          breakStart: mondaySched.breakStart || '13:00',
                          breakEnd: mondaySched.breakEnd || '14:00',
                        }));
                      } else {
                        setBulkError("Dushanba kuni uchun mavjud jadval topilmadi");
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
                  <CustomSelect
                    label="Qaysi filial uchun? *"
                    options={branches.map((b) => ({
                      value: b.id,
                      label: `${b.nameUz} (${b.addressUz})`,
                    }))}
                    value={bulkForm.branchId}
                    onChange={(val) => {
                      setPreviewResult(null);
                      setBulkForm({ ...bulkForm, branchId: val });
                    }}
                    placeholder="Filialni tanlang..."
                  />
                </div>

                {/* Working Interval */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Ish boshlanishi *</label>
                    <input
                      type="time"
                      required
                      value={bulkForm.startTime}
                      onChange={(e) => {
                        setPreviewResult(null);
                        setBulkForm({ ...bulkForm, startTime: e.target.value });
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Ish tugashi *</label>
                    <input
                      type="time"
                      required
                      value={bulkForm.endTime}
                      onChange={(e) => {
                        setPreviewResult(null);
                        setBulkForm({ ...bulkForm, endTime: e.target.value });
                      }}
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
                      onChange={(e) => {
                        setPreviewResult(null);
                        setBulkForm({ ...bulkForm, breakStart: e.target.value });
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Tanaffus tugashi</label>
                    <input
                      type="time"
                      value={bulkForm.breakEnd}
                      onChange={(e) => {
                        setPreviewResult(null);
                        setBulkForm({ ...bulkForm, breakEnd: e.target.value });
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200"
                    />
                  </div>
                </div>

                {/* Mode: Replace vs Merge with Simple Bilingual Explanations */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                  <div className="font-bold text-slate-800 text-xs">Qo&apos;llash rejimi / Режим применения:</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <label
                      className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                        bulkForm.mode === 'merge'
                          ? 'border-teal-500 bg-teal-50/50 shadow-xs'
                          : 'border-slate-200 bg-white hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <input
                          type="radio"
                          name="bulkMode"
                          value="merge"
                          checked={bulkForm.mode === 'merge'}
                          onChange={() => {
                            setPreviewResult(null);
                            setBulkForm({ ...bulkForm, mode: 'merge' });
                          }}
                          className="text-teal-600"
                        />
                        <span className="font-bold text-slate-900">Birlashtirish (Merge)</span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-tight">
                        <strong>UZ:</strong> Mavjud jadvallarni saqlab, faqat jadvali yo&apos;q kunlarga yangisini qo&apos;shadi.<br />
                        <strong>RU:</strong> Сохраняет существующие дни без изменений, добавляя график только на пустые дни.
                      </p>
                    </label>

                    <label
                      className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                        bulkForm.mode === 'replace'
                          ? 'border-teal-500 bg-teal-50/50 shadow-xs'
                          : 'border-slate-200 bg-white hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <input
                          type="radio"
                          name="bulkMode"
                          value="replace"
                          checked={bulkForm.mode === 'replace'}
                          onChange={() => {
                            setPreviewResult(null);
                            setBulkForm({ ...bulkForm, mode: 'replace' });
                          }}
                          className="text-teal-600"
                        />
                        <span className="font-bold text-slate-900">To&apos;liq almashtirish (Replace)</span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-tight">
                        <strong>UZ:</strong> Tanlangan filial va kunlar bo&apos;yicha eski jadvallarni yangisiga almashtiradi.<br />
                        <strong>RU:</strong> Полностью заменяет графики на выбранные дни и филиал новыми часами.
                      </p>
                    </label>
                  </div>
                </div>

                {/* Preview / Conflict Results Display */}
                {previewResult && (
                  <div
                    className={`p-3.5 rounded-2xl border text-xs space-y-2.5 animate-fade-in ${
                      previewResult.canApply
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                        : 'bg-rose-50 border-rose-200 text-rose-950'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span className="flex items-center gap-1.5">
                        {previewResult.canApply ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-600" />
                        )}
                        {previewResult.canApply
                          ? "To'qnashuvlar topilmadi. Jadval xavfsiz qo'llanilishi mumkin:"
                          : `To'qnashuv aniqlandi (${previewResult.conflicts.length} ta qabul):`}
                      </span>
                    </div>

                    {previewResult.canApply && previewResult.summary && (
                      <div className="flex flex-wrap gap-2 text-[11px]">
                        <span className="px-2 py-0.5 rounded bg-emerald-100/80 font-bold text-emerald-900">
                          Shifokorlar: {previewResult.summary.totalDoctors} ta
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-100/80 font-bold text-emerald-900">
                          Yaratiladi: {previewResult.summary.totalSchedulesToCreate} ta
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-100/80 font-bold text-emerald-900">
                          Yangilanadi: {previewResult.summary.totalSchedulesToUpdate} ta
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-100/80 font-bold text-emerald-900">
                          Saqlanadi: {previewResult.summary.totalSchedulesToPreserve} ta
                        </span>
                      </div>
                    )}

                    {!previewResult.canApply && previewResult.conflicts.length > 0 && (
                      <div className="space-y-1.5 max-h-36 overflow-y-auto scrollbar-thin">
                        <p className="text-[11px] text-rose-800 font-semibold">
                          Quyidagi qabullar yangi ish soatlari yoki tanaffusga to&apos;g&apos;ri keladi. Qabullarni avval ko&apos;chirish yoki bekor qilish lozim:
                        </p>
                        {previewResult.conflicts.map((c: any, idx: number) => (
                          <div key={idx} className="p-2 bg-white rounded-xl border border-rose-200 text-[11px] text-rose-900">
                            <div className="font-bold">{c.doctorName}: {c.patientName} ({c.patientPhone || "Tel yo'q"})</div>
                            <div className="text-slate-600">Vaqt: {c.formattedTime} • Filial: {c.branchName}</div>
                            <div className="text-rose-700 font-semibold">Sabab: {c.reason}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handlePreviewBulkSchedule}
                    disabled={isPreviewing || bulkForm.daysOfWeek.length === 0}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold flex items-center justify-center gap-1.5 transition-all"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isPreviewing ? 'animate-spin' : ''}`} />
                    <span>{isPreviewing ? 'Tekshirilmoqda...' : 'Ko\'rib chiqish (Preview)'}</span>
                  </button>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      onClick={() => setIsBulkModalOpen(false)}
                      className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold"
                    >
                      Bekor qilish
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingBulk || bulkForm.daysOfWeek.length === 0 || (previewResult && !previewResult.canApply)}
                      className="px-5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold shadow-md disabled:opacity-50"
                    >
                      {isSavingBulk ? 'Saqlanmoqda...' : 'Jadvalni qo\'llash'}
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <form onSubmit={handleCopySchedule} className="space-y-4 text-xs">
                {/* Source Doctor */}
                <div>
                  <CustomSelect
                    label="Qaysi shifokordan nusxa olinadi? *"
                    options={[
                      { value: '', label: '-- Shifokorni tanlang --' },
                      ...doctors
                        .filter((d) => d.id !== selectedDoctorId)
                        .map((d) => ({
                          value: d.id,
                          label: `Dr. ${d.firstNameUz} ${d.lastNameUz} (${d.titleUz || 'Shifokor'})`,
                        })),
                    ]}
                    value={copyForm.fromDoctorId}
                    onChange={(val) => {
                      setPreviewResult(null);
                      setCopyForm({ ...copyForm, fromDoctorId: val });
                    }}
                    placeholder="Shifokorni tanlang..."
                  />
                </div>

                {/* Target Doctors Multi-select */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-bold text-slate-700">
                      Maqsadli shifokorlar ({copyForm.toDoctorIds.length} ta tanlandi) *
                    </label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewResult(null);
                          setCopyForm((prev) => ({
                            ...prev,
                            toDoctorIds: doctors
                              .filter((d) => d.isActive && d.id !== copyForm.fromDoctorId)
                              .map((d) => d.id),
                          }));
                        }}
                        className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-semibold"
                      >
                        Barchasi
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewResult(null);
                          setCopyForm((prev) => ({ ...prev, toDoctorIds: [] }));
                        }}
                        className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-semibold"
                      >
                        Tozalash
                      </button>
                    </div>
                  </div>
                  <div className="max-h-28 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap gap-1.5 scrollbar-thin">
                    {doctors
                      .filter((d) => d.isActive && d.id !== copyForm.fromDoctorId)
                      .map((doc) => {
                        const isChecked = copyForm.toDoctorIds.includes(doc.id);
                        return (
                          <label
                            key={doc.id}
                            className={`px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 ${
                              isChecked
                                ? 'bg-teal-700 border-teal-700 text-white shadow-xs'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="hidden"
                              checked={isChecked}
                              onChange={(e) => {
                                setPreviewResult(null);
                                if (e.target.checked) {
                                  setCopyForm((prev) => ({ ...prev, toDoctorIds: [...prev.toDoctorIds, doc.id] }));
                                } else {
                                  setCopyForm((prev) => ({
                                    ...prev,
                                    toDoctorIds: prev.toDoctorIds.filter((id) => id !== doc.id),
                                  }));
                                }
                              }}
                            />
                            <span>Dr. {doc.firstNameUz} {doc.lastNameUz}</span>
                          </label>
                        );
                      })}
                  </div>
                </div>

                {/* Target Branch */}
                <div>
                  <CustomSelect
                    label="Maqsadli filial (ixtiyoriy)"
                    options={[
                      { value: '', label: '-- Manbadagi filial saqlansin --' },
                      ...branches.map((b) => ({
                        value: b.id,
                        label: b.nameUz,
                      })),
                    ]}
                    value={copyForm.targetBranchId}
                    onChange={(val) => {
                      setPreviewResult(null);
                      setCopyForm({ ...copyForm, targetBranchId: val });
                    }}
                    placeholder="Filialni tanlang..."
                  />
                </div>

                {/* Copy Mode */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                  <div className="font-bold text-slate-800 text-xs">Nusxalash rejimi / Режим копирования:</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <label
                      className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                        copyForm.mode === 'merge'
                          ? 'border-teal-500 bg-teal-50/50 shadow-xs'
                          : 'border-slate-200 bg-white hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <input
                          type="radio"
                          name="copyMode"
                          value="merge"
                          checked={copyForm.mode === 'merge'}
                          onChange={() => {
                            setPreviewResult(null);
                            setCopyForm({ ...copyForm, mode: 'merge' });
                          }}
                          className="text-teal-600"
                        />
                        <span className="font-bold text-slate-900">Birlashtirish (Merge)</span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-tight">
                        <strong>UZ:</strong> Mavjud jadvallarni saqlaydi, faqat bo&apos;sh kunlarga qo&apos;shadi.<br />
                        <strong>RU:</strong> Сохраняет существующие графики, добавляя только на свободные дни.
                      </p>
                    </label>

                    <label
                      className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                        copyForm.mode === 'replace'
                          ? 'border-teal-500 bg-teal-50/50 shadow-xs'
                          : 'border-slate-200 bg-white hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <input
                          type="radio"
                          name="copyMode"
                          value="replace"
                          checked={copyForm.mode === 'replace'}
                          onChange={() => {
                            setPreviewResult(null);
                            setCopyForm({ ...copyForm, mode: 'replace' });
                          }}
                          className="text-teal-600"
                        />
                        <span className="font-bold text-slate-900">Almashtirish (Replace)</span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-tight">
                        <strong>UZ:</strong> Nusxalanayotgan kunlar va filial bo&apos;yicha eski jadvallarni almashtiradi.<br />
                        <strong>RU:</strong> Заменяет графики на целевых днях и филиалах новыми.
                      </p>
                    </label>
                  </div>
                </div>

                {/* Preview / Conflict Results Display */}
                {previewResult && (
                  <div
                    className={`p-3.5 rounded-2xl border text-xs space-y-2.5 animate-fade-in ${
                      previewResult.canApply
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                        : 'bg-rose-50 border-rose-200 text-rose-950'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span className="flex items-center gap-1.5">
                        {previewResult.canApply ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-600" />
                        )}
                        {previewResult.canApply
                          ? "To'qnashuvlar topilmadi. Nusxa olish xavfsiz:"
                          : `To'qnashuv aniqlandi (${previewResult.conflicts.length} ta qabul):`}
                      </span>
                    </div>

                    {previewResult.canApply && previewResult.summary && (
                      <div className="flex flex-wrap gap-2 text-[11px]">
                        <span className="px-2 py-0.5 rounded bg-emerald-100/80 font-bold text-emerald-900">
                          Shifokorlar: {previewResult.summary.totalDoctors} ta
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-100/80 font-bold text-emerald-900">
                          Nusxalanadi: {previewResult.summary.totalSchedulesToCreate} ta
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-100/80 font-bold text-emerald-900">
                          Saqlanadi: {previewResult.summary.totalSchedulesToPreserve} ta
                        </span>
                      </div>
                    )}

                    {!previewResult.canApply && previewResult.conflicts.length > 0 && (
                      <div className="space-y-1.5 max-h-36 overflow-y-auto scrollbar-thin">
                        <p className="text-[11px] text-rose-800 font-semibold">
                          Quyidagi qabullar yangi ish soatlari yoki tanaffusga to&apos;g&apos;ri keladi:
                        </p>
                        {previewResult.conflicts.map((c: any, idx: number) => (
                          <div key={idx} className="p-2 bg-white rounded-xl border border-rose-200 text-[11px] text-rose-900">
                            <div className="font-bold">{c.doctorName}: {c.patientName} ({c.patientPhone || "Tel yo'q"})</div>
                            <div className="text-slate-600">Vaqt: {c.formattedTime} • Filial: {c.branchName}</div>
                            <div className="text-rose-700 font-semibold">Sabab: {c.reason}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handlePreviewCopySchedule}
                    disabled={isPreviewing || !copyForm.fromDoctorId}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold flex items-center justify-center gap-1.5 transition-all"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isPreviewing ? 'animate-spin' : ''}`} />
                    <span>{isPreviewing ? 'Tekshirilmoqda...' : 'Ko\'rib chiqish (Preview)'}</span>
                  </button>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      onClick={() => setIsBulkModalOpen(false)}
                      className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold"
                    >
                      Bekor qilish
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingBulk || !copyForm.fromDoctorId || (previewResult && !previewResult.canApply)}
                      className="px-5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold shadow-md disabled:opacity-50"
                    >
                      {isSavingBulk ? 'Nusxalanmoqda...' : 'Nusxa olish'}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {/* Accessible Doctor Deletion / Lifecycle Modal */}
      <ModalDialog
        isOpen={Boolean(deletingDoctor)}
        onClose={() => {
          if (!isDeletingDoctor) {
            setDeletingDoctor(null);
            setDoctorPreview(null);
            setDeleteDoctorError(null);
            setDeleteDoctorSuccess(null);
          }
        }}
        title={
          doctorPreview
            ? (doctorPreview.action === 'BLOCKED_ACTIVE_TREATMENT'
                ? (isRu ? 'Удаление заблокировано: идет лечение' : 'O\'chirish taqiqlanadi: muolaja jarayonda')
                : doctorPreview.action === 'BLOCKED_FUTURE_APPOINTMENTS'
                ? (isRu ? 'Удаление заблокировано: есть будущие приемы' : 'O\'chirish taqiqlanadi: kelgusi qabullar mavjud')
                : doctorPreview.action === 'ARCHIVE'
                ? (isRu ? 'Архивация профиля врача' : 'Shifokorni arxivlash va nofaol qilish')
                : (isRu ? 'Полное удаление профиля врача' : 'Shifokor profilini butunlay o\'chirish'))
            : (isRu ? 'Удаление врача' : 'Shifokorni o\'chirish')
        }
        size="md"
      >
        <div className="space-y-4 text-xs">
          {isLoadingDoctorPreview ? (
            <div className="p-8 text-center text-slate-500 space-y-2">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto text-teal-600" />
              <p>{isRu ? 'Проверка клинической истории и связей...' : 'Klinik tarix va bog\'liqliklar tekshirilmoqda...'}</p>
            </div>
          ) : (
            <>
              {deleteDoctorSuccess && (
                <div
                  role="status"
                  aria-live="polite"
                  className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-800 font-bold flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{deleteDoctorSuccess}</span>
                </div>
              )}

              {deleteDoctorError && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-800 font-bold flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{deleteDoctorError}</span>
                </div>
              )}

              {deletingDoctor && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <h3 className="font-extrabold text-sm text-slate-900">
                    Dr. {deletingDoctor.firstNameUz} {deletingDoctor.lastNameUz}
                  </h3>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    {deletingDoctor.titleUz || deletingDoctor.titleRu || 'Stomatolog'}
                  </p>
                </div>
              )}

              {doctorPreview && (
                <div className="space-y-3">
                  {/* Detailed explanation alert */}
                  <div
                    className={`p-3.5 rounded-xl border ${
                      !doctorPreview.canDelete
                        ? 'bg-rose-50 border-rose-200 text-rose-900'
                        : doctorPreview.action === 'ARCHIVE' || doctorPreview.actionType === 'ARCHIVE'
                        ? 'bg-amber-50 border-amber-200 text-amber-900'
                        : 'bg-teal-50 border-teal-200 text-teal-900'
                    }`}
                  >
                    <p className="font-bold mb-1">
                      {!doctorPreview.canDelete
                        ? (isRu ? 'Внимание! Операция заблокирована системой:' : 'Diqqat! Ushbu amal tizim tomonidan taqiqlangan:')
                        : doctorPreview.action === 'ARCHIVE' || doctorPreview.actionType === 'ARCHIVE'
                        ? (isRu ? 'Внимание! Врач будет заархивирован:' : 'Diqqat! Shifokor profili arxivlanadi:')
                        : (isRu ? 'Врач не имеет клинической истории и будет полностью удален:' : 'Shifokorda hech qanday klinik tarix yo\'q va u butunlay o\'chiriladi:')
                      }
                    </p>
                    <p className="text-[11px] leading-relaxed">
                      {doctorPreview.reason || doctorPreview.resolutionGuidance || (isRu ? 'Сведения о блокировке получены от сервера.' : 'Tizim tomonidan cheklov aniqlandi.')}
                    </p>
                  </div>

                  {/* Impact Statistics Grid with robust fallbacks */}
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-slate-500 block">{isRu ? 'Активное лечение (сейчас):' : 'Faol muolaja (hozir):'}</span>
                      <strong className={`text-sm ${(doctorPreview.activeTreatmentsCount ?? doctorPreview.activeTreatmentCount ?? 0) > 0 ? 'text-rose-600' : 'text-slate-800'}`}>
                        {doctorPreview.activeTreatmentsCount ?? doctorPreview.activeTreatmentCount ?? 0} ta
                      </strong>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-slate-500 block">{isRu ? 'Будущие приемы:' : 'Kelgusi qabullar:'}</span>
                      <strong className={`text-sm ${(doctorPreview.futureAppointmentsCount ?? doctorPreview.futureAppointmentCount ?? 0) > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
                        {doctorPreview.futureAppointmentsCount ?? doctorPreview.futureAppointmentCount ?? 0} ta
                      </strong>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-slate-500 block">{isRu ? 'Исторические приемы:' : 'Tarixiy qabullar:'}</span>
                      <strong className="text-sm text-slate-800">
                        {doctorPreview.historicalAppointmentsCount ?? doctorPreview.historicalAppointmentCount ?? 0} ta
                      </strong>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-slate-500 block">{isRu ? 'Записи расписания:' : 'Ish jadvallari:'}</span>
                      <strong className="text-sm text-slate-800">
                        {doctorPreview.scheduleRecordsCount ?? 0} ta
                      </strong>
                    </div>
                  </div>

                  {/* Blocking active chair treatments if any */}
                  {doctorPreview.activeTreatments && doctorPreview.activeTreatments.length > 0 && (
                    <div className="space-y-1.5 p-2.5 bg-rose-50 border border-rose-200 rounded-xl">
                      <strong className="text-rose-900 text-[11px] block">
                        {isRu ? 'Активные сеансы в кресле:' : 'Hozirda stulda davolanayotgan bemorlar:'}
                      </strong>
                      <div className="max-h-28 overflow-y-auto space-y-1">
                        {doctorPreview.activeTreatments.map((t: any) => (
                          <div key={t.id} className="p-1.5 bg-white rounded border border-rose-100 text-[10px]">
                            <div className="font-bold text-slate-800">{t.patientName} ({t.chairName})</div>
                            <div className="text-slate-500">{t.treatmentType} • {new Date(t.startedAt).toLocaleTimeString('uz-UZ')} dan buyon</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Blocking future appointments list */}
                  {doctorPreview.futureAppointments && doctorPreview.futureAppointments.length > 0 && (
                    <div className="space-y-1.5 p-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                      <strong className="text-amber-900 text-[11px] block">
                        {isRu ? 'Блокирующие будущие записи:' : 'O‘chirishni to‘sib turgan kelgusi qabullar:'}
                      </strong>
                      <div className="max-h-36 overflow-y-auto space-y-1">
                        {doctorPreview.futureAppointments.map((app: any) => (
                          <div key={app.id} className="p-1.5 bg-white rounded border border-amber-100 flex items-center justify-between text-[10px]">
                            <div>
                              <div className="font-bold text-slate-800">{app.patientName}</div>
                              <div className="text-slate-500">
                                {new Date(app.startTime).toLocaleString('uz-UZ')} {app.serviceName ? `• ${app.serviceName}` : ''}
                              </div>
                            </div>
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 uppercase">
                              {app.status}
                            </span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-amber-800 mt-1">
                        {isRu
                          ? 'Чтобы удалить или архивировать врача, сначала отмените или перенесите эти записи на другого врача.'
                          : 'Shifokorni o‘chirish yoki arxivlash uchun avval ushbu qabullarni bekor qiling yoki boshqa shifokorga ko‘chiring.'}
                      </p>
                    </div>
                  )}

                  {doctorPreview.linkedStaffAccount && (
                    <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-950 text-[11px]">
                      <strong>{isRu ? 'Связанная учетная запись сотрудника:' : 'Biriktirilgan xodim hisobi:'}</strong>{' '}
                      {doctorPreview.linkedStaffAccount.username} ({doctorPreview.linkedStaffAccount.role}).{' '}
                      {isRu ? 'Учетная запись будет деактивирована, активные сессии сброшены.' : 'Hisob nofaol qilinadi va sessiyalari bekor qilinadi.'}
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      disabled={isDeletingDoctor}
                      onClick={() => {
                        setDeletingDoctor(null);
                        setDoctorPreview(null);
                      }}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
                    >
                      {isRu ? 'Отмена' : 'Bekor qilish'}
                    </button>

                    {doctorPreview.canDelete ? (
                      <button
                        type="button"
                        disabled={isDeletingDoctor}
                        onClick={confirmDeleteDoctor}
                        className={`px-4 py-2 text-white rounded-xl font-bold flex items-center gap-1.5 ${
                          doctorPreview.action === 'ARCHIVE' || doctorPreview.actionType === 'ARCHIVE'
                            ? 'bg-amber-600 hover:bg-amber-700'
                            : 'bg-rose-600 hover:bg-rose-700'
                        }`}
                      >
                        {isDeletingDoctor && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                        <span>
                          {isDeletingDoctor
                            ? (isRu ? 'Выполняется...' : 'Bajarilmoqda...')
                            : doctorPreview.action === 'ARCHIVE' || doctorPreview.actionType === 'ARCHIVE'
                            ? (isRu ? 'Архивировать врача' : 'Shifokorni arxivlash')
                            : (isRu ? 'Удалить навсегда' : 'Butunlay o\'chirish')}
                        </span>
                      </button>
                    ) : (
                      <div className="text-[11px] font-bold text-rose-700 bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200">
                        {isRu ? 'Действие заблокировано' : 'Amal bloklangan'}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </ModalDialog>

      {/* Accessible Exception Deletion Confirmation Modal */}
      <ModalDialog
        isOpen={Boolean(deletingExceptionId)}
        onClose={() => {
          if (!isDeletingException) setDeletingExceptionId(null);
        }}
        title={isRu ? 'Удаление записи исключения' : 'Ta\'til / Istisno yozuvini o\'chirish'}
        size="sm"
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-600">
            {isRu
              ? 'Вы уверены, что хотите удалить эту запись графика/исключения?'
              : 'Haqiqatan ham ushbu ta\'til/istisno yozuvini o\'chirmoqchimisiz?'}
          </p>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              disabled={isDeletingException}
              onClick={() => setDeletingExceptionId(null)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold"
            >
              {isRu ? 'Отмена' : 'Bekor qilish'}
            </button>
            <button
              type="button"
              disabled={isDeletingException}
              onClick={confirmDeleteException}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold flex items-center gap-1.5"
            >
              {isDeletingException && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>{isDeletingException ? (isRu ? 'Удаление...' : 'O\'chirilmoqda...') : (isRu ? 'Удалить' : 'O\'chirish')}</span>
            </button>
          </div>
        </div>
      </ModalDialog>
    </AdminLayout>
  );
}
