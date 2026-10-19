'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
  Inbox,
  AlertTriangle,
} from 'lucide-react';
import { AdminLayout } from '../../../components/AdminLayout';
import { CustomSelect, SelectOption } from '../../../components/CustomSelect';
import { ModalDialog } from '../../../components/ModalDialog';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import {
  formatClinicDate,
  formatClinicTime,
  formatRangeTitle,
  formatMonthYear,
  getClinicTodayDateString,
  getClinicTomorrowDateString,
  toClinicDateString,
  getClinicDayBoundaries,
  getClinicWeekBoundaries,
  getClinicMonthBoundaries,
  parseClinicDateTimeToUtcIso,
} from '../../../lib/dateFormat';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

const STATUS_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  PENDING: { label: 'Tasdiqlash kutilmoqda', color: 'bg-amber-100 text-amber-900 border-amber-300', desc: 'Mijoz arizasi, klinikadan tasdiqlash talab etiladi' },
  CONFIRMED: { label: 'Kelishi kutilmoqda', color: 'bg-teal-100 text-teal-900 border-teal-300', desc: 'Qabul tasdiqlangan, bemor kelishi kutilmoqda' },
  CHECKED_IN: { label: 'Klinikaga keldi', color: 'bg-blue-100 text-blue-900 border-blue-300', desc: 'Bemor klinikada ro‘yxatdan o‘tdi / navbatda' },
  COMPLETED: { label: 'Yakunlandi', color: 'bg-emerald-100 text-emerald-900 border-emerald-300', desc: 'Muolaja to‘liq yakunlangan' },
  CANCELLED: { label: 'Bekor qilindi', color: 'bg-rose-100 text-rose-900 border-rose-300', desc: 'Qabul bekor qilingan' },
  NO_SHOW: { label: 'Kelmadi', color: 'bg-slate-200 text-slate-800 border-slate-300', desc: 'Bemor kelmadi (xodim tomonidan qo‘lda belgilangan)' },
};

export default function AdminCalendarPage() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);

  // Navigation & Filter states initialized from URL params
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('doctorId') || '';
    }
    return '';
  });
  const [selectedBranchId, setSelectedBranchId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('branchId') || '';
    }
    return '';
  });
  const [selectedServiceId, setSelectedServiceId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('serviceId') || '';
    }
    return '';
  });
  const [selectedStatus, setSelectedStatus] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('status') || '';
    }
    return '';
  });

  // Inbox Mode: When true, views all pending website applications across all dates
  const [isInboxMode, setIsInboxMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const s = new URLSearchParams(window.location.search).get('status');
      const mode = new URLSearchParams(window.location.search).get('mode');
      return s === 'PENDING' || mode === 'inbox';
    }
    return false;
  });

  const [pendingTotal, setPendingTotal] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>(() => {
    if (typeof window !== 'undefined') {
      const v = new URLSearchParams(window.location.search).get('view');
      if (v === 'day' || v === 'week' || v === 'month') return v;
    }
    return 'week';
  });

  const [currentDate, setCurrentDate] = useState<Date>(() => {
    if (typeof window !== 'undefined') {
      const dParam = new URLSearchParams(window.location.search).get('date');
      if (dParam) {
        const parsed = new Date(dParam);
        if (!isNaN(parsed.getTime())) return parsed;
      }
    }
    return new Date();
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const p = parseInt(new URLSearchParams(window.location.search).get('page') || '1', 10);
      return !isNaN(p) && p > 0 ? p : 1;
    }
    return 1;
  });
  const pageSize = 25;

  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Selected appointment modal & action states
  const [selectedAppt, setSelectedAppt] = useState<any | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [mutatingStatus, setMutatingStatus] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Search by patient name or phone
  const [search, setSearch] = useState<string>('');

  // Delay & Overrun workflow
  const [showDelayModal, setShowDelayModal] = useState<boolean>(false);
  const [delayMinutes, setDelayMinutes] = useState<number>(15);
  const [delayReason, setDelayReason] = useState<string>('');
  const [delayResult, setDelayResult] = useState<any | null>(null);
  const [isSavingDelay, setIsSavingDelay] = useState<boolean>(false);

  // Accessible Cancellation Confirmation Modal
  const [cancelModalAppt, setCancelModalAppt] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');

  // Reschedule state
  const [rescheduleDate, setRescheduleDate] = useState<string>('');
  const [rescheduleTime, setRescheduleTime] = useState<string>('10:00');
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [adminSlots, setAdminSlots] = useState<any[]>([]);
  const [isLoadingAdminSlots, setIsLoadingAdminSlots] = useState(false);

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
    date: getClinicTodayDateString(),
    time: '09:00',
    note: '',
  });

  const [targetApptError, setTargetApptError] = useState<string | null>(null);

  // Synchronize state with URL search params
  const updateUrlParams = useCallback(
    (params: Record<string, string | null | undefined>) => {
      if (typeof window === 'undefined') return;
      const url = new URL(window.location.href);
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          url.searchParams.set(k, v);
        } else {
          url.searchParams.delete(k);
        }
      });
      window.history.replaceState({}, '', url.toString());
    },
    []
  );

  const openAppointment = useCallback(
    (appt: any) => {
      setSelectedAppt(appt);
      setActionError(null);
      setTargetApptError(null);
      setIsRescheduling(false);
      const dStr = toClinicDateString(appt.startTime);
      setRescheduleDate(dStr);
      setRescheduleTime(formatClinicTime(appt.startTime));
      updateUrlParams({ appointmentId: appt.id });
    },
    [updateUrlParams]
  );

  const closeAppointment = useCallback(() => {
    setSelectedAppt(null);
    setActionError(null);
    setTargetApptError(null);
    setIsRescheduling(false);
    setShowDelayModal(false);
    setDelayResult(null);
    updateUrlParams({ appointmentId: null });
  }, [updateUrlParams]);

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

  // Compute timezone-authoritative date range for viewMode
  const getDateRange = useCallback(() => {
    const dateStr = toClinicDateString(currentDate);

    if (viewMode === 'day') {
      const bounds = getClinicDayBoundaries(dateStr);
      return {
        dateFrom: bounds.dateFrom,
        dateTo: bounds.dateTo,
        startDate: new Date(bounds.dateFrom),
        endDate: new Date(bounds.dateTo),
      };
    } else if (viewMode === 'week') {
      const bounds = getClinicWeekBoundaries(dateStr);
      return {
        dateFrom: bounds.dateFrom,
        dateTo: bounds.dateTo,
        startDate: new Date(bounds.dateFrom),
        endDate: new Date(bounds.dateTo),
      };
    } else {
      const bounds = getClinicMonthBoundaries(dateStr);
      return {
        dateFrom: bounds.dateFrom,
        dateTo: bounds.dateTo,
        startDate: new Date(bounds.dateFrom),
        endDate: new Date(bounds.dateTo),
      };
    }
  }, [currentDate, viewMode]);

  // Load appointments
  const loadAppointments = useCallback(async () => {
    try {
      setIsLoading(true);
      setFetchError(null);

      const params: Record<string, any> = {
        page: currentPage,
        limit: pageSize,
      };

      if (search && search.trim()) {
        params.search = search.trim();
      }

      if (user?.role === 'DOCTOR') {
        params.doctorId = user.doctorId;
      } else if (selectedDoctorId) {
        params.doctorId = selectedDoctorId;
      }

      if (selectedBranchId) params.branchId = selectedBranchId;
      if (selectedServiceId) params.serviceId = selectedServiceId;

      if (isInboxMode) {
        params.status = 'PENDING';
      } else {
        const { dateFrom, dateTo } = getDateRange();
        params.dateFrom = dateFrom;
        params.dateTo = dateTo;
        if (selectedStatus) params.status = selectedStatus;
      }

      const pendingParams: Record<string, any> = { status: 'PENDING', limit: 1 };
      if (user?.role === 'DOCTOR') {
        pendingParams.doctorId = user.doctorId;
      }

      const [res, pendingRes] = await Promise.all([
        api.getAdminAppointments(params),
        api.getAdminAppointments(pendingParams).catch(() => ({ total: 0 })),
      ]);

      setAppointments(res?.items || []);
      setTotalCount(res?.total || 0);
      setPendingTotal(pendingRes?.total || 0);

      // Sync URL
      const dateStr = toClinicDateString(currentDate);
      updateUrlParams({
        mode: isInboxMode ? 'inbox' : null,
        status: isInboxMode ? 'PENDING' : selectedStatus || null,
        doctorId: selectedDoctorId || null,
        branchId: selectedBranchId || null,
        serviceId: selectedServiceId || null,
        view: isInboxMode ? null : viewMode,
        date: isInboxMode ? null : dateStr,
        page: currentPage > 1 ? String(currentPage) : null,
      });
    } catch (e: any) {
      console.error('Failed to load appointments', e);
      setFetchError(e?.message || 'Qabullar ro\'yxatini yuklashda xatolik yuz berdi');
    } finally {
      setIsLoading(false);
    }
  }, [
    currentPage,
    pageSize,
    user,
    selectedDoctorId,
    selectedBranchId,
    selectedServiceId,
    isInboxMode,
    selectedStatus,
    getDateRange,
    currentDate,
    viewMode,
    updateUrlParams,
    search,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadAppointments();
    }, 200);
    return () => clearTimeout(timer);
  }, [loadAppointments]);

  // URL appointmentId synchronization & popstate handling
  const syncFromUrl = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const searchParams = new URLSearchParams(window.location.search);
    const targetId = searchParams.get('appointmentId');
    if (targetId) {
      try {
        const appt = await api.getAppointmentDetail(targetId);
        if (appt) {
          setSelectedAppt(appt);
          setActionError(null);
          setTargetApptError(null);
          setIsRescheduling(false);
          const dStr = toClinicDateString(appt.startTime);
          setRescheduleDate(dStr);
          setRescheduleTime(formatClinicTime(appt.startTime));
        } else {
          setSelectedAppt(null);
          setTargetApptError('Qabul topilmadi yoki ko\'rish uchun ruxsat yo\'q');
        }
      } catch (err: any) {
        setSelectedAppt(null);
        setTargetApptError(err?.message || 'Qabul topilmadi yoki ko\'rish uchun ruxsat yo\'q');
      }
    } else {
      setSelectedAppt(null);
      setTargetApptError(null);
    }
  }, []);

  useEffect(() => {
    syncFromUrl();
  }, [syncFromUrl]);

  // Handle browser popstate (back/forward)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      syncFromUrl();
      const params = new URLSearchParams(window.location.search);
      setSelectedDoctorId(params.get('doctorId') || '');
      setSelectedBranchId(params.get('branchId') || '');
      setSelectedServiceId(params.get('serviceId') || '');
      const st = params.get('status') || '';
      const mode = params.get('mode') || '';
      setSelectedStatus(st);
      setIsInboxMode(st === 'PENDING' || mode === 'inbox');
      const v = params.get('view');
      if (v === 'day' || v === 'week' || v === 'month') setViewMode(v);
      const dParam = params.get('date');
      if (dParam) {
        const parsed = new Date(dParam);
        if (!isNaN(parsed.getTime())) setCurrentDate(parsed);
      }
      const pageNum = parseInt(params.get('page') || '1', 10);
      if (!isNaN(pageNum) && pageNum > 0) setCurrentPage(pageNum);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [syncFromUrl]);

  // Automatically keep pagination valid
  useEffect(() => {
    const totalPages = Math.ceil(totalCount / pageSize) || 1;
    if (currentPage > totalPages && totalPages >= 1) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalCount, pageSize]);

  // Fetch reschedule slots when date/appointment changes
  useEffect(() => {
    async function loadAdminSlots() {
      if (!isRescheduling || !selectedAppt || !rescheduleDate) {
        setAdminSlots([]);
        return;
      }
      try {
        setIsLoadingAdminSlots(true);
        const res = await api.getAdminRescheduleSlots(selectedAppt.id, rescheduleDate);
        setAdminSlots(res?.slots || []);
      } catch (e) {
        console.error('Failed to load reschedule slots', e);
        setAdminSlots([]);
      } finally {
        setIsLoadingAdminSlots(false);
      }
    }
    loadAdminSlots();
  }, [isRescheduling, selectedAppt, rescheduleDate]);

  const handlePrevDate = () => {
    const d = new Date(currentDate);
    if (viewMode === 'day') d.setDate(d.getDate() - 1);
    else if (viewMode === 'week') d.setDate(d.getDate() - 7);
    else if (viewMode === 'month') d.setMonth(d.getMonth() - 1);
    setCurrentDate(d);
    setCurrentPage(1);
  };

  const handleNextDate = () => {
    const d = new Date(currentDate);
    if (viewMode === 'day') d.setDate(d.getDate() + 1);
    else if (viewMode === 'week') d.setDate(d.getDate() + 7);
    else if (viewMode === 'month') d.setMonth(d.getMonth() + 1);
    setCurrentDate(d);
    setCurrentPage(1);
  };

  const handleToday = () => {
    const todayStr = getClinicTodayDateString();
    setCurrentDate(new Date(`${todayStr}T00:00:00+05:00`));
    setCurrentPage(1);
  };

  const handleTomorrow = () => {
    const tmrStr = getClinicTomorrowDateString();
    setCurrentDate(new Date(`${tmrStr}T00:00:00+05:00`));
    setCurrentPage(1);
  };

  const handleStatusUpdate = async (newStatus: string) => {
    if (!selectedAppt) return;
    if (newStatus === 'CANCELLED') {
      setCancelModalAppt(selectedAppt);
      setCancelReason('');
      return;
    }

    try {
      setIsUpdating(true);
      setMutatingStatus(newStatus);
      setActionError(null);
      await api.updateAppointmentStatus(selectedAppt.id, newStatus);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pendingCountChanged'));
      }
      closeAppointment();
      if (appointments.length === 1 && currentPage > 1) {
        setCurrentPage((prev) => Math.max(1, prev - 1));
      } else {
        await loadAppointments();
      }
    } catch (err: any) {
      setActionError(err?.message || 'Holatni yangilashda xatolik yuz berdi');
    } finally {
      setIsUpdating(false);
      setMutatingStatus(null);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelModalAppt) return;
    try {
      setIsUpdating(true);
      setMutatingStatus('CANCELLED');
      setActionError(null);
      await api.updateAppointmentStatus(cancelModalAppt.id, 'CANCELLED', cancelReason.trim() || undefined);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pendingCountChanged'));
      }
      setCancelModalAppt(null);
      closeAppointment();
      if (appointments.length === 1 && currentPage > 1) {
        setCurrentPage((prev) => Math.max(1, prev - 1));
      } else {
        await loadAppointments();
      }
    } catch (err: any) {
      setActionError(err?.message || 'Qabulni bekor qilishda xatolik yuz berdi');
    } finally {
      setIsUpdating(false);
      setMutatingStatus(null);
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
      const newStartTime = parseClinicDateTimeToUtcIso(rescheduleDate, rescheduleTime);
      await api.adminRescheduleAppointment(selectedAppt.id, newStartTime);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pendingCountChanged'));
      }
      setIsRescheduling(false);
      closeAppointment();
      await loadAppointments();
    } catch (err: any) {
      setActionError(err?.message || 'Qayta rejalashtirishda xatolik yuz berdi');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRecordDelay = async () => {
    if (!selectedAppt) return;
    try {
      setIsSavingDelay(true);
      setActionError(null);
      const res = await api.recordAppointmentDelay(selectedAppt.id, delayMinutes, delayReason);
      setDelayResult(res);
      await loadAppointments();
    } catch (err: any) {
      setActionError(err?.message || 'Kechikishni qayd etishda xatolik yuz berdi');
    } finally {
      setIsSavingDelay(false);
    }
  };

  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmittingCreate(true);
      setCreateError(null);

      const startTime = parseClinicDateTimeToUtcIso(createForm.date, createForm.time);
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

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pendingCountChanged'));
      }

      setIsCreateOpen(false);
      setCreateForm({
        patientName: '',
        patientPhone: '+998',
        patientEmail: '',
        doctorId: doctors[0]?.id || '',
        serviceId: services[0]?.id || '',
        branchId: branches[0]?.id || '',
        date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date()),
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

  // Human-readable date range label without Windows ICU tokens
  const currentRangeLabel = () => {
    if (viewMode === 'day') {
      return formatClinicDate(currentDate, 'uz', { includeWeekday: true, includeYear: true });
    }
    if (viewMode === 'week') {
      const { startDate, endDate } = getDateRange();
      return formatRangeTitle(startDate, endDate, 'uz');
    }
    return formatMonthYear(currentDate, 'uz');
  };

  const validTransitions = selectedAppt ? ALLOWED_TRANSITIONS[selectedAppt.status] || [] : [];

  // Options for CustomSelect filters
  const doctorOptions: SelectOption[] = [
    { value: '', label: 'Barcha shifokorlar' },
    ...doctors.map((d) => ({
      value: d.id,
      label: `Dr. ${d.firstNameUz} ${d.lastNameUz}`,
      badge: d.specialtyUz || undefined,
    })),
  ];

  const serviceOptions: SelectOption[] = [
    { value: '', label: 'Barcha xizmatlar' },
    ...services.map((s) => ({
      value: s.id,
      label: s.nameUz,
    })),
  ];

  const branchOptions: SelectOption[] = [
    { value: '', label: 'Barcha filiallar' },
    ...branches.map((b) => ({
      value: b.id,
      label: b.nameUz,
    })),
  ];

  const statusOptions: SelectOption[] = [
    { value: '', label: 'Barcha holatlar' },
    { value: 'PENDING', label: 'Kutilmoqda' },
    { value: 'CONFIRMED', label: 'Tasdiqlangan' },
    { value: 'CHECKED_IN', label: 'Klinikada' },
    { value: 'COMPLETED', label: 'Yakunlangan' },
    { value: 'CANCELLED', label: 'Bekor qilingan' },
    { value: 'NO_SHOW', label: 'Kelmadi' },
  ];

  const totalPages = Math.ceil(totalCount / pageSize);
  const startIndex = (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, totalCount);

  return (
    <AdminLayout allowedRoles={['OWNER', 'ADMIN', 'DOCTOR']}>
      <div className="space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">Qabullar taqvimi</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Kunlik, haftalik jadval monitoringi va yangi arizalarni tasdiqlash
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

        {/* Mode Selector: Pending Applications vs Working Calendar */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-100 p-1.5 rounded-2xl w-fit">
          <button
            type="button"
            onClick={() => {
              setIsInboxMode(false);
              setCurrentPage(1);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              !isInboxMode
                ? 'bg-white text-teal-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarIcon className="w-4 h-4" />
            <span>Taqvim jadvali</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsInboxMode(true);
              setSelectedStatus('PENDING');
              setCurrentPage(1);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
              isInboxMode
                ? 'bg-amber-500 text-white shadow-sm'
                : 'text-slate-700 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Inbox className="w-4 h-4" />
            <span>Kutilayotgan arizalar</span>
            {pendingTotal > 0 && (
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                  isInboxMode ? 'bg-white text-amber-700' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {pendingTotal}
              </span>
            )}
          </button>
        </div>

        {/* Date Navigation Bar (Visible only in Calendar Mode) */}
        {!isInboxMode ? (
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap">
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
                onClick={handleTomorrow}
                className="px-3 py-1.5 border border-teal-200 bg-teal-50/50 hover:bg-teal-100/50 text-xs font-bold text-teal-800 rounded-xl transition-colors"
                title="Ertangi kun jadvaliga o'tish"
              >
                Ertaga
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
                  onClick={() => {
                    setViewMode(mode);
                    setCurrentPage(1);
                  }}
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
        ) : (
          <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 shadow-sm">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Kutilayotgan arizalar (Tasdiqlash kutilmoqda):</strong> Saytdan bemorlar tomonidan yuborilgan barcha tasdiqlash kutayotgan arizalar ro‘yxati.
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsInboxMode(false);
                setSelectedStatus('');
                setCurrentPage(1);
              }}
              className="text-xs font-bold text-amber-800 underline hover:text-amber-950 shrink-0"
            >
              Taqvim jadvaliga qaytish
            </button>
          </div>
        )}

        {/* Filters Bar with CustomSelect and Search */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Filter className="w-4 h-4 text-teal-700" />
            <span>Filtrlash va qidirish:</span>
          </div>

          {/* Search Box by Name OR Phone */}
          <div className="relative">
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Bemor ismi (F.I.SH) yoki telefon raqami bo'yicha qidirish..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Doctor filter */}
            {user?.role !== 'DOCTOR' ? (
              <CustomSelect
                options={doctorOptions}
                value={selectedDoctorId}
                onChange={(val) => {
                  setSelectedDoctorId(val);
                  setCurrentPage(1);
                }}
                placeholder="Shifokor..."
              />
            ) : (
              <div className="flex items-center px-3 py-2 bg-teal-50 text-teal-800 rounded-xl text-xs font-bold border border-teal-200 min-h-[44px]">
                Shaxsiy qabullaringiz
              </div>
            )}

            {/* Service filter */}
            <CustomSelect
              options={serviceOptions}
              value={selectedServiceId}
              onChange={(val) => {
                setSelectedServiceId(val);
                setCurrentPage(1);
              }}
              placeholder="Xizmat..."
            />

            {/* Branch filter */}
            <CustomSelect
              options={branchOptions}
              value={selectedBranchId}
              onChange={(val) => {
                setSelectedBranchId(val);
                setCurrentPage(1);
              }}
              placeholder="Filial..."
            />

            {/* Status filter (hidden when in inbox mode) */}
            {!isInboxMode ? (
              <CustomSelect
                options={statusOptions}
                value={selectedStatus}
                onChange={(val) => {
                  setSelectedStatus(val);
                  setCurrentPage(1);
                }}
                placeholder="Holat..."
              />
            ) : (
              <div className="flex items-center px-3 py-2 bg-amber-50 text-amber-900 rounded-xl text-xs font-bold border border-amber-200 min-h-[44px]">
                Faqat tasdiqlash kutilayotganlar ({pendingTotal})
              </div>
            )}
          </div>
        </div>

        {/* Error Banner with Retry */}
        {fetchError && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{fetchError}</span>
            </div>
            <button
              onClick={loadAppointments}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold shrink-0 text-xs"
            >
              Qayta urinish
            </button>
          </div>
        )}

        {/* Appointments List / Grid */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 mb-4 gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-800">
                {isInboxMode ? 'Kutilayotgan arizalar ro\'yxati' : 'Qabullar jadvali'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {totalCount > 0
                  ? `Jami ${totalCount} ta yozuvdan ${startIndex}-${endIndex} ko'rsatilmoqda`
                  : 'Yozuvlar topilmadi'}
              </p>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1 || isLoading}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                >
                  Oldingi
                </button>
                <span className="text-xs font-semibold text-slate-600">
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages || isLoading}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                >
                  Keyingi
                </button>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="p-16 text-center text-slate-400 text-sm">Qabullar yuklanmoqda...</div>
          ) : appointments.length === 0 ? (
            <div className="p-16 text-center text-slate-500 text-sm bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              {isInboxMode
                ? 'Tasdiqlash kutilayotgan yangi arizalar mavjud emas.'
                : 'Ushbu sana va parametrlar bo\'yicha qabullar topilmadi.'}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {appointments.map((appt) => {
                const dateFormatted = formatClinicDate(appt.startTime, 'uz', {
                  includeWeekday: true,
                  includeYear: false,
                });
                const timeFormatted = formatClinicTime(appt.startTime);

                const badge = STATUS_LABELS[appt.status] || {
                  label: appt.status,
                  color: 'bg-slate-100 text-slate-700 border-slate-200',
                };

                return (
                  <div
                    key={appt.id}
                    data-testid="appointment-row"
                    onClick={() => openAppointment(appt)}
                    className="py-4 px-3 hover:bg-slate-50 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-24 text-center shrink-0">
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

          {/* Bottom Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-4 text-xs text-slate-500">
              <span>
                {startIndex}-{endIndex} / {totalCount} ta qabul
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1 || isLoading}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Oldingi
                </button>
                <span>
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages || isLoading}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Keyingi
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Attendance Status Legend */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm text-xs space-y-2">
          <div className="font-bold text-slate-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-teal-700" />
            <span>Qabullar holatlari va ma&apos;nolari:</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
            {Object.entries(STATUS_LABELS).map(([k, s]) => (
              <div key={k} className="flex items-start gap-2">
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 mt-0.5 ${s.color}`}>
                  {s.label}
                </span>
                <span className="text-[11px] text-slate-500 leading-tight">
                  {s.desc}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Appointment Detail & Status Transition Modal */}
      {selectedAppt && (
        <ModalDialog
          isOpen={!!selectedAppt}
          onClose={closeAppointment}
          title={selectedAppt.patient?.fullName || selectedAppt.patientName || 'Qabul boshqaruvi'}
          description="Qabul ma'lumotlari va holatni boshqarish"
          size="lg"
        >
          <div className="space-y-6">

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

              <div className="p-2.5 bg-slate-50 rounded-xl space-y-2">
                <div className="flex justify-between items-center text-slate-500 font-medium">
                  <span>Xizmatlar ({selectedAppt.serviceItems?.length || 1}):</span>
                  {selectedAppt.durationMinutes && (
                    <span className="text-[11px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md flex items-center gap-1.5">
                      {selectedAppt.durationMinutes} daq
                      {selectedAppt.durationAdjustmentMinutes !== undefined &&
                        selectedAppt.durationAdjustmentMinutes !== 0 && (
                          <span
                            className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-semibold"
                            title="Administrator tomonidan kiritilgan davomiylik tuzatmasi"
                          >
                            {selectedAppt.durationAdjustmentMinutes > 0
                              ? `+${selectedAppt.durationAdjustmentMinutes}`
                              : selectedAppt.durationAdjustmentMinutes}{' '}
                            daq tuzatish
                          </span>
                        )}
                    </span>
                  )}
                </div>

                {selectedAppt.serviceItems && selectedAppt.serviceItems.length > 0 ? (
                  <div className="space-y-1.5 pt-1 border-t border-slate-200/60">
                    {selectedAppt.serviceItems.map((item: any, idx: number) => (
                      <div key={item.id || idx} className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-slate-800">
                          {idx + 1}. {item.serviceNameUz || item.serviceNameRu}
                        </span>
                        <div className="flex items-center gap-2 text-slate-600 font-medium">
                          <span>{item.durationMinutes} daq</span>
                          <span>•</span>
                          <span className="font-bold text-teal-700">
                            {item.price?.toLocaleString('uz-UZ')} so&apos;m
                          </span>
                        </div>
                      </div>
                    ))}
                    {selectedAppt.price && (
                      <div className="flex justify-between items-center pt-1 border-t border-slate-200/60 text-xs font-bold text-slate-900">
                        <span>Jami summa:</span>
                        <span className="text-teal-800">
                          {Number(selectedAppt.price).toLocaleString('uz-UZ')} so&apos;m
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-800">
                      {selectedAppt.serviceName || selectedAppt.service?.nameUz}
                    </span>
                    {selectedAppt.price && (
                      <span className="font-bold text-teal-800">
                        {Number(selectedAppt.price).toLocaleString('uz-UZ')} so&apos;m
                      </span>
                    )}
                  </div>
                )}
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
                  {formatClinicDate(selectedAppt.startTime, 'uz', { includeWeekday: true, includeYear: true })}{' '}
                  • {formatClinicTime(selectedAppt.startTime)}
                </span>
              </div>

              <div className="flex justify-between p-2.5 bg-slate-50 rounded-xl">
                <span className="text-slate-500">Joriy holat:</span>
                <span className="font-bold text-teal-800">
                  {STATUS_LABELS[selectedAppt.status]?.label || selectedAppt.status}
                </span>
              </div>

              {selectedAppt.note && (
                <div className="p-2.5 bg-slate-50 rounded-xl">
                  <span className="text-slate-500 block mb-1">Izoh / shikoyat:</span>
                  <p className="text-slate-700 italic">{selectedAppt.note}</p>
                </div>
              )}
            </div>

            {/* Valid Status Transitions */}
            {validTransitions.length > 0 ? (
              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs font-bold text-slate-700 mb-2">Holatni o&apos;zgartirish:</p>
                <div className="flex flex-wrap gap-2">
                  {validTransitions.includes('CONFIRMED') && (
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => handleStatusUpdate('CONFIRMED')}
                      className="py-2 px-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                    >
                      {isUpdating && mutatingStatus === 'CONFIRMED'
                        ? 'Tasdiqlanmoqda...'
                        : 'Tasdiqlash'}
                    </button>
                  )}
                  {validTransitions.includes('CHECKED_IN') && (
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => handleStatusUpdate('CHECKED_IN')}
                      className="py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                    >
                      {isUpdating && mutatingStatus === 'CHECKED_IN'
                        ? 'Kiritilmoqda...'
                        : 'Klinikaga keldi'}
                    </button>
                  )}
                  {validTransitions.includes('COMPLETED') && (
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => handleStatusUpdate('COMPLETED')}
                      className="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                    >
                      {isUpdating && mutatingStatus === 'COMPLETED'
                        ? 'Yakunlanmoqda...'
                        : 'Yakunlash'}
                    </button>
                  )}
                  {validTransitions.includes('NO_SHOW') && (
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => handleStatusUpdate('NO_SHOW')}
                      className="py-2 px-3 bg-slate-700 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                    >
                      {isUpdating && mutatingStatus === 'NO_SHOW' ? 'Saqlanmoqda...' : 'Kelmadi'}
                    </button>
                  )}
                  {validTransitions.includes('CANCELLED') && (
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => handleStatusUpdate('CANCELLED')}
                      className="py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                    >
                      Bekor qilish...
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="pt-2 border-t border-slate-100 text-center text-xs text-slate-400">
                Ushbu qabul yakuniy holatda ({STATUS_LABELS[selectedAppt.status]?.label || selectedAppt.status}).
              </div>
            )}

            {/* Delay & Overrun Section for in-progress or confirmed bookings */}
            {['CONFIRMED', 'CHECKED_IN'].includes(selectedAppt.status) && (
              <div className="pt-2 border-t border-slate-100">
                {!showDelayModal ? (
                  <button
                    type="button"
                    onClick={() => {
                      setShowDelayModal(true);
                      setDelayResult(null);
                    }}
                    className="w-full py-2 px-3 border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span>Kechikishni qayd etish (+15 / +30 daqiqa muolaja cho‘zilishi)</span>
                  </button>
                ) : (
                  <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-3 animate-fade-in text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-950 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        Kechikish / Muolaja cho‘zilishini qayd etish
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowDelayModal(false)}
                        className="text-slate-400 hover:text-slate-600 text-xs"
                      >
                        ✕
                      </button>
                    </div>

                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      Joriy muolaja kutilganidan uzoq davom etsa, qo‘shimcha kutilayotgan daqiqalarni belgilang. Tizim keyingi navbatdagi bemorlar qabulidagi to‘qnashuvlarni tahlil qiladi va hisoblab beradi (mavjud qabullar bekor qilinmaydi yoki yashirin ko‘chirilmaydi).
                    </p>

                    <div className="flex items-center gap-2">
                      <label className="font-semibold text-slate-700 shrink-0">Qo‘shimcha vaqt:</label>
                      <div className="flex gap-1.5 flex-wrap">
                        {[10, 15, 20, 30, 45, 60].map((mins) => (
                          <button
                            type="button"
                            key={mins}
                            onClick={() => setDelayMinutes(mins)}
                            className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-colors ${
                              delayMinutes === mins
                                ? 'bg-amber-600 text-white shadow-sm'
                                : 'bg-white border border-amber-200 text-amber-900 hover:bg-amber-100'
                            }`}
                          >
                            +{mins} daq
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-700 font-semibold mb-1">Kechikish sababi (ixtiyoriy):</label>
                      <input
                        type="text"
                        value={delayReason}
                        onChange={(e) => setDelayReason(e.target.value)}
                        placeholder="Masalan: Murakkab kanal tozalash yoki kutilmagan asorat"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:ring-2 focus:ring-teal-600 bg-white"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowDelayModal(false)}
                        className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg font-semibold"
                      >
                        Bekor qilish
                      </button>
                      <button
                        type="button"
                        disabled={isSavingDelay}
                        onClick={handleRecordDelay}
                        className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold shadow-sm"
                      >
                        {isSavingDelay ? 'Qayd etilmoqda...' : 'Kechikishni qayd etish'}
                      </button>
                    </div>

                    {delayResult && (
                      <div className="mt-3 p-3 bg-white rounded-xl border border-amber-300 space-y-2 text-xs">
                        <div className="flex items-center gap-1.5 text-emerald-800 font-bold">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>Kechikish muvaffaqiyatli qayd etildi!</span>
                        </div>
                        <p className="text-slate-600 text-[11px]">
                          Rejalashtirilgan tugash: <strong>{new Date(delayResult.scheduledEndTime).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' })}</strong><br />
                          Kutilayotgan yangi tugash: <strong className="text-amber-800">{new Date(delayResult.estimatedEndTime).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' })} (taxminiy)</strong><br />
                          Bufer bilan shifokor bo‘shash vaqti: <strong className="text-teal-800">{new Date(delayResult.estimatedFreeTime).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' })}</strong>
                        </p>

                        {delayResult.affectedCount > 0 ? (
                          <div className="pt-2 border-t border-slate-100 space-y-1.5">
                            <span className="font-bold text-rose-700 block">
                              ⚠️ Ta&apos;sirlangan keyingi qabullar ({delayResult.affectedCount} ta):
                            </span>
                            {delayResult.affectedAppointments.map((aff: any) => (
                              <div key={aff.id} className="p-2 bg-rose-50/60 rounded-lg border border-rose-200 text-[11px] text-slate-800 flex justify-between items-center">
                                <div>
                                  <span className="font-bold">{aff.patientName}</span> ({aff.patientPhone})
                                  <div className="text-[10px] text-slate-500">
                                    Reja: {new Date(aff.scheduledStartTime).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' })} • Taxminiy kechikish: +{aff.estimatedDelayMinutes} daqiqa
                                  </div>
                                </div>
                                <span className="text-[10px] px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold">
                                  To‘qnashuv
                                </span>
                              </div>
                            ))}
                            <p className="text-[10px] text-slate-500 italic mt-1">
                              * Bemorlar bilan telefon orqali bog‘lanib, ularning roziligi bilan yangi qulay vaqtga ko‘chirish tavsiya etiladi.
                            </p>
                          </div>
                        ) : (
                          <p className="text-emerald-700 font-medium text-[11px]">
                            ✅ Ushbu kechikish keyingi qabullarga xalaqit bermaydi (yetarli tanaffus mavjud).
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Reschedule Section */}
            {['PENDING', 'CONFIRMED'].includes(selectedAppt.status) && (
              <div className="pt-2 border-t border-slate-100">
                {!isRescheduling ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsRescheduling(true);
                      const target = selectedAppt.startTime
                        ? new Date(selectedAppt.startTime)
                        : new Date(Date.now() + 24 * 60 * 60 * 1000);
                      const dStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(target);
                      setRescheduleDate(dStr);
                    }}
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
                          min={new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date())}
                          onChange={(e) => setRescheduleDate(e.target.value)}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-xl text-xs bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-slate-500 block mb-1">Tanlangan vaqt</label>
                        <input
                          type="time"
                          value={rescheduleTime}
                          onChange={(e) => setRescheduleTime(e.target.value)}
                          className="w-full px-3 py-1.5 border border-slate-300 rounded-xl text-xs bg-white"
                        />
                      </div>
                    </div>

                    {/* Appointment-aware slots */}
                    <div>
                      <span className="text-[11px] text-slate-500 block mb-1.5">
                        Mavjud bo&apos;sh vaqtlar ({selectedAppt.durationMinutes} daq qabul):
                      </span>
                      {isLoadingAdminSlots ? (
                        <div className="p-3 text-center text-xs text-slate-400">Bo&apos;sh vaqtlar tekshirilmoqda...</div>
                      ) : adminSlots.length > 0 ? (
                        <div className="grid grid-cols-4 gap-1.5 max-h-32 overflow-y-auto">
                          {adminSlots.map((slot: any) => {
                            const timeStr = formatClinicTime(slot.startTime);
                            const isSelected = rescheduleTime === timeStr;
                            return (
                              <button
                                type="button"
                                key={slot.startTime}
                                disabled={!slot.available}
                                onClick={() => setRescheduleTime(timeStr)}
                                className={`py-1 px-1 text-xs font-semibold rounded-lg ${
                                  !slot.available
                                    ? 'bg-slate-200 text-slate-400 line-through'
                                    : isSelected
                                    ? 'bg-teal-700 text-white'
                                    : 'bg-white border border-teal-200 text-teal-800 hover:bg-teal-50'
                                }`}
                              >
                                {timeStr}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic">Ushbu sanada bo&apos;sh vaqtlar topilmadi</p>
                      )}
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
        </ModalDialog>
      )}

      {/* Accessible Cancellation Confirmation Modal */}
      {cancelModalAppt && (
        <ModalDialog
          isOpen={!!cancelModalAppt}
          onClose={() => setCancelModalAppt(null)}
          title="Qabulni bekor qilishni tasdiqlaysizmi?"
          description={`Bemor: ${cancelModalAppt.patient?.fullName || cancelModalAppt.patientName} (${cancelModalAppt.patient?.phone || cancelModalAppt.patientPhone})`}
          size="md"
        >
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-bold">Bekor qilingan qabulni qayta tiklab bo&apos;lmaydi.</p>
                <p className="text-rose-600 mt-0.5">Bemorga bekor qilinganligi haqida ma&apos;lumot beriladi.</p>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Bekor qilish sababi (ixtiyoriy):
              </label>
              <textarea
                rows={2}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Masalan: Bemor kelishini bekor qildi yoki boshqa kunga ko'chirishni so'radi"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCancelModalAppt(null)}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Ortga
              </button>
              <button
                type="button"
                disabled={isUpdating}
                onClick={handleConfirmCancel}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md transition-all disabled:opacity-50"
              >
                {isUpdating ? 'Bekor qilinmoqda...' : 'Bekor qilishni tasdiqlash'}
              </button>
            </div>
          </div>
        </ModalDialog>
      )}

      {/* New Appointment Modal */}
      <ModalDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Yangi qabul yaratish"
        description="Administrator tomonidan yangi bemor qabulini kiritish"
        size="lg"
      >
        <div className="space-y-4">

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
      </ModalDialog>

      {/* Target Appointment Not Found or Forbidden Modal */}
      {targetApptError && (
        <ModalDialog
          isOpen={!!targetApptError}
          onClose={() => {
            setTargetApptError(null);
            updateUrlParams({ appointmentId: null });
          }}
          title="Qabul topilmadi"
          size="sm"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{targetApptError}</span>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setTargetApptError(null);
                  updateUrlParams({ appointmentId: null });
                }}
                className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold"
              >
                Tushunarli
              </button>
            </div>
          </div>
        </ModalDialog>
      )}
    </AdminLayout>
  );
}
