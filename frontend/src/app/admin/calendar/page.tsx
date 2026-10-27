'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  LayoutGrid,
  List,
} from 'lucide-react';
import { AdminLayout } from '../../../components/AdminLayout';
import { CustomSelect, SelectOption } from '../../../components/CustomSelect';
import { CustomDatePicker } from '../../../components/CustomDatePicker';
import { ModalDialog } from '../../../components/ModalDialog';
import { PhoneInput } from '../../../components/PhoneInput';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useI18n } from '../../../lib/i18n';
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
  getClinicDateParts,
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
  const { t, language } = useI18n();
  const isRu = language === 'ru';

  const getStatusInfo = useCallback(
    (status: string) => {
      const uz = STATUS_LABELS[status] || {
        label: status,
        color: 'bg-slate-100 text-slate-800 border-slate-300',
        desc: '',
      };
      if (!isRu) return uz;
      const ruMap: Record<string, { label: string; desc: string }> = {
        PENDING: { label: 'Ожидает подтверждения', desc: 'Заявка с сайта, требуется подтверждение' },
        CONFIRMED: { label: 'Ожидается визит', desc: 'Прием подтвержден, ожидается приход пациента' },
        CHECKED_IN: { label: 'Прибыл в клинику', desc: 'Пациент прибыл и ожидает в приемной' },
        COMPLETED: { label: 'Завершен', desc: 'Лечение успешно завершено' },
        CANCELLED: { label: 'Отменен', desc: 'Прием отменен' },
        NO_SHOW: { label: 'Не явился', desc: 'Пациент не явился на прием' },
      };
      const ru = ruMap[status];
      return {
        label: ru?.label || uz.label,
        color: uz.color,
        desc: ru?.desc || uz.desc,
      };
    },
    [isRu],
  );

  const [appointments, setAppointments] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);

  // Navigation & Filter states
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [isInboxMode, setIsInboxMode] = useState<boolean>(false);
  const [pendingTotal, setPendingTotal] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week');
  const [daySubView, setDaySubView] = useState<'timeline' | 'list'>('timeline');
  const [showFullDayHours, setShowFullDayHours] = useState<boolean>(false);
  const [monthAggregates, setMonthAggregates] = useState<Record<string, any>>({});
  const [isStartingTreatment, setIsStartingTreatment] = useState<boolean>(false);
  const loadRequestIdRef = useRef<number>(0);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 25;

  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Selected appointment modal & action states
  const [selectedAppt, setSelectedAppt] = useState<any | null>(null);
  const [highlightedApptId, setHighlightedApptId] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [mutatingStatus, setMutatingStatus] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Banner for recently confirmed appointment so the receptionist can immediately locate it on the calendar
  const [confirmedToast, setConfirmedToast] = useState<{
    id: string;
    patientName: string;
    startTime: string;
    doctorName?: string;
  } | null>(null);

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
      setHighlightedApptId(appt.id);
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

  // Read URL query params safely after client hydration
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const doc = params.get('doctorId');
    const br = params.get('branchId');
    const srv = params.get('serviceId');
    const stat = params.get('status');
    const mode = params.get('mode');
    const vm = params.get('view');
    const dParam = params.get('date');
    const p = parseInt(params.get('page') || '1', 10);

    if (doc) setSelectedDoctorId(doc);
    if (br) setSelectedBranchId(br);
    if (srv) setSelectedServiceId(srv);
    if (stat) setSelectedStatus(stat);
    if (stat === 'PENDING' || mode === 'inbox') setIsInboxMode(true);
    if (vm === 'day' || vm === 'week' || vm === 'month') setViewMode(vm);
    if (!isNaN(p) && p > 0) setCurrentPage(p);
    if (dParam) {
      const parsed = new Date(dParam);
      if (!isNaN(parsed.getTime())) setCurrentDate(parsed);
    }
  }, []);

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

  // Dynamic Interval-Aware Timeline Hours Range
  const dayTimelineHours = useMemo(() => {
    if (showFullDayHours) {
      return Array.from({ length: 24 }, (_, i) => i);
    }
    let minH = 8;
    let maxH = 20;
    for (const a of appointments) {
      const startP = getClinicDateParts(a.startTime);
      minH = Math.min(minH, startP.hour);
      const effEnd = (a.overrunActive && a.overrunEstimatedEndTime)
        ? new Date(new Date(a.overrunEstimatedEndTime).getTime() + (a.bufferMinutes ?? 5) * 60000)
        : new Date(a.endTime);
      const endP = getClinicDateParts(effEnd);
      const endH = endP.dateString !== startP.dateString ? 23 : Math.min(23, endP.hour + (endP.minute > 0 ? 1 : 0));
      maxH = Math.max(maxH, endH);
    }
    const count = Math.max(1, maxH - minH + 1);
    return Array.from({ length: count }, (_, i) => minH + i);
  }, [appointments, showFullDayHours]);

  // Compute month overview grid cells with authoritative complete server totals
  const monthCells = useMemo(() => {
    if (viewMode !== 'month') return [];
    const parts = getClinicDateParts(currentDate);
    const totalDays = new Date(parts.year, parts.month, 0).getDate();
    const firstDayParts = getClinicDateParts(new Date(Date.UTC(parts.year, parts.monthIndex, 1, 12, 0, 0)));
    const leadBlanks = firstDayParts.weekdayIndex === 0 ? 6 : firstDayParts.weekdayIndex - 1;

    const cells: Array<{
      day: number | null;
      dateStr: string;
      appts: any[];
      totalCount: number;
    }> = [];
    for (let i = 0; i < leadBlanks; i++) {
      cells.push({ day: null, dateStr: '', appts: [], totalCount: 0 });
    }

    const pad = (n: number) => String(n).padStart(2, '0');
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${parts.year}-${pad(parts.month)}-${pad(d)}`;
      const apptsOnDay = appointments.filter((a) => {
        const aParts = getClinicDateParts(a.startTime);
        return aParts.dateString === dateStr;
      });
      const agg = monthAggregates[dateStr];
      const totalCount = agg ? agg.total : apptsOnDay.length;
      cells.push({ day: d, dateStr, appts: apptsOnDay, totalCount });
    }
    return cells;
  }, [viewMode, currentDate, appointments, monthAggregates]);

  // Load appointments with server aggregates and race-condition protection
  const loadAppointments = useCallback(async () => {
    const currentReqId = ++loadRequestIdRef.current;
    try {
      setIsLoading(true);
      setFetchError(null);

      const params: Record<string, any> = {
        page: currentPage,
        limit: viewMode === 'month' ? 100 : (viewMode === 'day' ? 100 : pageSize),
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

      const curParts = getClinicDateParts(currentDate);
      const isMonth = viewMode === 'month' && !isInboxMode;

      const [res, pendingRes, monthAggRes] = await Promise.all([
        api.getAdminAppointments(params),
        api.getAdminAppointments(pendingParams).catch(() => ({ total: 0 })),
        isMonth
          ? api.getAdminMonthAggregates({
              year: curParts.year,
              month: curParts.month,
              doctorId: user?.role === 'DOCTOR' ? (user.doctorId || undefined) : (selectedDoctorId || undefined),
              branchId: selectedBranchId || undefined,
              status: selectedStatus || undefined,
            }).catch(() => null)
          : Promise.resolve(null),
      ]);

      // Discard stale out-of-order response after rapid date or filter switching
      if (currentReqId !== loadRequestIdRef.current) return;

      setAppointments(res?.items || []);
      setTotalCount(res?.total || 0);
      setPendingTotal(pendingRes?.total || 0);
      if (monthAggRes?.dailyCounts) {
        setMonthAggregates(monthAggRes.dailyCounts);
      } else if (!isMonth) {
        setMonthAggregates({});
      }

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
      if (currentReqId !== loadRequestIdRef.current) return;
      console.error('Failed to load appointments', e);
      setFetchError(e?.message || 'Qabullar ro\'yxatini yuklashda xatolik yuz berdi');
    } finally {
      if (currentReqId === loadRequestIdRef.current) {
        setIsLoading(false);
      }
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
          // Deterministic calendar navigation: clear conflicting filters so appointment is visible
          if (user?.role !== 'DOCTOR') {
            setSelectedDoctorId('');
          }
          setSelectedBranchId('');
          setSelectedServiceId('');
          setSelectedStatus('');
          setIsInboxMode(false);
          setSearch('');
          setCurrentPage(1);

          // Focus clinic date and switch to day view
          const start = new Date(appt.startTime);
          if (!isNaN(start.getTime())) {
            setCurrentDate(start);
          }
          setViewMode('day');

          setSelectedAppt(appt);
          setHighlightedApptId(appt.id);
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
  }, [user]);

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

      if (newStatus === 'CONFIRMED') {
        const docName =
          selectedAppt.doctor?.user?.fullName ||
          (selectedAppt.doctor
            ? `${selectedAppt.doctor.firstNameUz || ''} ${selectedAppt.doctor.lastNameUz || ''}`.trim()
            : undefined);
        setConfirmedToast({
          id: selectedAppt.id,
          patientName: selectedAppt.patientName,
          startTime: selectedAppt.startTime,
          doctorName: docName,
        });
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

  const handleStartTreatment = async () => {
    if (!selectedAppt) return;
    try {
      setIsStartingTreatment(true);
      setActionError(null);
      const updated = await api.startAppointmentTreatment(selectedAppt.id);
      setSelectedAppt((prev: any) =>
        prev
          ? {
              ...prev,
              actualStartTime: updated?.actualStartTime || new Date().toISOString(),
              status: prev.status === 'CONFIRMED' ? 'CHECKED_IN' : prev.status,
            }
          : prev
      );
      await loadAppointments();
    } catch (err: any) {
      setActionError(err?.message || 'Muolajani boshlashda xatolik yuz berdi');
    } finally {
      setIsStartingTreatment(false);
    }
  };

  const handleClearOverrun = async () => {
    if (!selectedAppt) return;
    try {
      setIsSavingDelay(true);
      setActionError(null);
      await api.clearAppointmentOverrun(selectedAppt.id);
      setSelectedAppt((prev: any) =>
        prev
          ? {
              ...prev,
              overrunActive: false,
              overrunMinutes: 0,
              overrunEstimatedEndTime: null,
            }
          : prev
      );
      setShowDelayModal(false);
      setDelayResult(null);
      await loadAppointments();
    } catch (err: any) {
      setActionError(err?.message || 'Kechikishni tozalashda xatolik yuz berdi');
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
    const loc = isRu ? 'ru' : 'uz';
    if (viewMode === 'day') {
      return formatClinicDate(currentDate, loc, { includeWeekday: true, includeYear: true });
    }
    if (viewMode === 'week') {
      const { startDate, endDate } = getDateRange();
      return formatRangeTitle(startDate, endDate, loc);
    }
    return formatMonthYear(currentDate, loc);
  };

  const validTransitions = selectedAppt ? ALLOWED_TRANSITIONS[selectedAppt.status] || [] : [];

  // Options for CustomSelect filters
  const doctorOptions: SelectOption[] = [
    { value: '', label: isRu ? 'Все врачи' : 'Barcha shifokorlar' },
    ...doctors.map((d) => ({
      value: d.id,
      label: `Dr. ${isRu && d.firstNameRu ? d.firstNameRu : d.firstNameUz} ${isRu && d.lastNameRu ? d.lastNameRu : d.lastNameUz}`,
      badge: (isRu && d.specialtyRu ? d.specialtyRu : d.specialtyUz) || undefined,
    })),
  ];

  const serviceOptions: SelectOption[] = [
    { value: '', label: isRu ? 'Все услуги' : 'Barcha xizmatlar' },
    ...services.map((s) => ({
      value: s.id,
      label: isRu && s.nameRu ? s.nameRu : s.nameUz,
    })),
  ];

  const branchOptions: SelectOption[] = [
    { value: '', label: isRu ? 'Все филиалы' : 'Barcha filiallar' },
    ...branches.map((b) => ({
      value: b.id,
      label: isRu && b.nameRu ? b.nameRu : b.nameUz,
    })),
  ];

  const statusOptions: SelectOption[] = [
    { value: '', label: isRu ? 'Все статусы' : 'Barcha holatlar' },
    { value: 'PENDING', label: isRu ? 'Ожидает' : 'Kutilmoqda' },
    { value: 'CONFIRMED', label: isRu ? 'Подтвержден' : 'Tasdiqlangan' },
    { value: 'CHECKED_IN', label: isRu ? 'В клинике' : 'Klinikada' },
    { value: 'COMPLETED', label: isRu ? 'Завершен' : 'Yakunlangan' },
    { value: 'CANCELLED', label: isRu ? 'Отменен' : 'Bekor qilingan' },
    { value: 'NO_SHOW', label: isRu ? 'Не явился' : 'Kelmadi' },
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
            <h1 className="text-2xl font-extrabold text-slate-900">
              {isRu ? 'Календарь приемов' : 'Qabullar taqvimi'}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {isRu
                ? 'Ежедневное и еженедельное расписание, мониторинг визитов и подтверждение заявок'
                : 'Kunlik, haftalik jadval monitoringi va yangi arizalarni tasdiqlash'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCreateOpen(true)}
              className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{isRu ? 'Новый прием' : 'Yangi qabul'}</span>
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

        {/* Confirmed Appointment Notification Banner */}
        {confirmedToast && (
          <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 flex-shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-900">
                  {isRu ? 'Заявка успешно подтверждена!' : 'Ariza muvaffaqiyatli tasdiqlandi!'}
                </p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  {confirmedToast.patientName} &bull; {formatClinicDate(confirmedToast.startTime)} {formatClinicTime(confirmedToast.startTime)} {confirmedToast.doctorName ? `(${confirmedToast.doctorName})` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsInboxMode(false);
                  setSelectedStatus('');
                  const targetDate = new Date(confirmedToast.startTime);
                  setCurrentDate(targetDate);
                  setViewMode('day');
                  openAppointment({ id: confirmedToast.id, startTime: confirmedToast.startTime });
                  setConfirmedToast(null);
                }}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <CalendarIcon className="w-4 h-4" />
                <span>{isRu ? 'Показать в календаре' : "Taqvimda ko'rish"}</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmedToast(null)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-emerald-100/50 cursor-pointer"
                title={isRu ? 'Закрыть' : 'Yopish'}
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Mode Selector: Pending Applications vs Working Calendar */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-100 p-1.5 rounded-2xl w-fit">
          <button
            type="button"
            onClick={() => {
              setIsInboxMode(false);
              setSelectedStatus('');
              setCurrentPage(1);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              !isInboxMode
                ? 'bg-white text-teal-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarIcon className="w-4 h-4" />
            <span>{isRu ? 'Расписание' : 'Taqvim jadvali'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setIsInboxMode(true);
              setSelectedStatus('PENDING');
              setCurrentPage(1);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              isInboxMode
                ? 'bg-amber-500 text-white shadow-sm'
                : 'text-slate-700 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Inbox className="w-4 h-4" />
            <span>{isRu ? 'Входящие заявки' : 'Kutilayotgan arizalar'}</span>
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
                className="px-3 py-1.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
              >
                {isRu ? 'Сегодня' : 'Bugun'}
              </button>
              <button
                onClick={handleTomorrow}
                className="px-3 py-1.5 border border-teal-200 bg-teal-50/50 hover:bg-teal-100/50 text-xs font-bold text-teal-800 rounded-xl transition-colors cursor-pointer"
                title={isRu ? "Перейти к завтрашнему дню" : "Ertangi kun jadvaliga o'tish"}
              >
                {isRu ? 'Завтра' : 'Ertaga'}
              </button>
              <button
                onClick={handleNextDate}
                className="p-2 border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 cursor-pointer"
                title={isRu ? "Вперед" : "Keyingi"}
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
                  className={`px-3 py-1 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
                    viewMode === mode
                      ? 'bg-white text-teal-800 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {mode === 'day' ? (isRu ? 'День' : 'Kunlik') : mode === 'week' ? (isRu ? 'Неделя' : 'Haftalik') : (isRu ? 'Месяц' : 'Oylik')}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 shadow-sm">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>{isRu ? 'Ожидающие заявки:' : 'Kutilayotgan arizalar:'}</strong>{' '}
                {isRu
                  ? 'Список всех заявок пациентов с сайта, ожидающих подтверждения администратором.'
                  : 'Saytdan bemorlar tomonidan yuborilgan barcha tasdiqlash kutayotgan arizalar ro‘yxati.'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsInboxMode(false);
                setSelectedStatus('');
                setCurrentPage(1);
              }}
              className="text-xs font-bold text-amber-800 underline hover:text-amber-950 shrink-0 cursor-pointer"
            >
              {isRu ? 'Вернуться к календарю' : 'Taqvim jadvaliga qaytish'}
            </button>
          </div>
        )}

        {/* Filters Bar with CustomSelect and Search */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Filter className="w-4 h-4 text-teal-700" />
            <span>{isRu ? 'Фильтрация и поиск:' : 'Filtrlash va qidirish:'}</span>
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
              placeholder={
                isRu
                  ? 'Поиск по имени пациента (Ф.И.О.) или номеру телефона...'
                  : 'Bemor ismi (F.I.SH) yoki telefon raqami bo\'yicha qidirish...'
              }
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
                placeholder={isRu ? 'Врач...' : 'Shifokor...'}
                locale={isRu ? 'ru' : 'uz'}
              />
            ) : (
              <div className="flex items-center px-3 py-2 bg-teal-50 text-teal-800 rounded-xl text-xs font-bold border border-teal-200 min-h-[44px]">
                {isRu ? 'Ваши личные приемы' : 'Shaxsiy qabullaringiz'}
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
              placeholder={isRu ? 'Услуга...' : 'Xizmat...'}
              locale={isRu ? 'ru' : 'uz'}
            />

            {/* Branch filter */}
            <CustomSelect
              options={branchOptions}
              value={selectedBranchId}
              onChange={(val) => {
                setSelectedBranchId(val);
                setCurrentPage(1);
              }}
              placeholder={isRu ? 'Филиал...' : 'Filial...'}
              locale={isRu ? 'ru' : 'uz'}
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
                placeholder={isRu ? 'Статус...' : 'Holat...'}
                locale={isRu ? 'ru' : 'uz'}
              />
            ) : (
              <div className="flex items-center px-3 py-2 bg-amber-50 text-amber-900 rounded-xl text-xs font-bold border border-amber-200 min-h-[44px]">
                {isRu
                  ? `Только ожидающие (${pendingTotal})`
                  : `Faqat tasdiqlash kutilayotganlar (${pendingTotal})`}
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

            <div className="flex items-center gap-3">
              {viewMode === 'day' && !isInboxMode && (
                <div className="flex items-center bg-slate-100 p-0.5 rounded-xl text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setDaySubView('timeline')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all ${
                      daySubView === 'timeline'
                        ? 'bg-white text-teal-800 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Vaqt shkalasi</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDaySubView('list')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all ${
                      daySubView === 'list'
                        ? 'bg-white text-teal-800 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                    <span>Ro&apos;yxat</span>
                  </button>
                  {daySubView === 'timeline' && (
                    <button
                      type="button"
                      onClick={() => setShowFullDayHours((prev) => !prev)}
                      className={`ml-1 px-2 py-1 rounded-lg transition-all ${
                        showFullDayHours
                          ? 'bg-teal-700 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                      title={showFullDayHours ? "Moslashuvchan ish vaqtiga qaytish" : "To'liq 24 soatlik ko'rinish"}
                    >
                      {showFullDayHours ? '24 soat' : 'Ish vaqti'}
                    </button>
                  )}
                </div>
              )}

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
          </div>

          {/* Month Calendar Overview Grid */}
          {viewMode === 'month' && !isInboxMode && !isLoading && (
            <div className="mb-6 p-4 bg-slate-50/70 rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-teal-700" />
                  <span>Oylik qabullar xaritasi:</span>
                </span>
                <span className="text-[11px] text-slate-400">Kunni tanlab, uning kunlik jadvaliga o&apos;tishingiz mumkin</span>
              </div>
              <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-bold text-slate-600 mb-1.5">
                {['Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan', 'Yak'].map((wd) => (
                  <div key={wd} className="py-1.5 bg-slate-100 rounded-lg text-slate-600 font-semibold text-[11px]">
                    {wd}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {monthCells.map((cell, idx) => {
                  if (!cell.day) {
                    return <div key={`empty-${idx}`} className="min-h-[72px] bg-slate-100/40 rounded-xl" />;
                  }

                  const isToday = cell.dateStr === toClinicDateString(new Date());
                  const isSelected = cell.dateStr === toClinicDateString(currentDate);

                  return (
                    <button
                      type="button"
                      key={cell.dateStr}
                      onClick={() => {
                        const [y, m, d] = cell.dateStr.split('-').map(Number);
                        setCurrentDate(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)));
                        setViewMode('day');
                        setCurrentPage(1);
                      }}
                      className={`min-h-[72px] p-2 rounded-xl border text-left transition-all flex flex-col justify-between ${
                        isSelected
                          ? 'border-teal-600 bg-teal-50/60 shadow-sm ring-2 ring-teal-500/20'
                          : isToday
                          ? 'border-teal-400 bg-white'
                          : 'border-slate-200/80 hover:border-teal-400 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs font-extrabold w-5 h-5 flex items-center justify-center rounded-full ${
                            isToday ? 'bg-teal-700 text-white' : 'text-slate-800'
                          }`}
                        >
                          {cell.day}
                        </span>
                        {cell.totalCount > 0 && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-800">
                            {cell.totalCount}
                          </span>
                        )}
                      </div>

                      <div className="mt-1 space-y-0.5">
                        {cell.appts.slice(0, 2).map((a) => (
                          <div
                            key={a.id}
                            className="text-[9px] truncate px-1 py-0.5 rounded bg-slate-100 text-slate-700 font-medium"
                          >
                            {formatClinicTime(a.startTime)} {a.patient?.fullName?.split(' ')[0] || a.patientName?.split(' ')[0]}
                          </div>
                        ))}
                        {cell.totalCount > 2 && (
                          <div className="text-[8px] text-slate-400 font-bold pl-0.5">
                            +{cell.totalCount - Math.min(2, cell.appts.length)} ta yana
                          </div>
                        )}
                        {cell.totalCount > 0 && cell.appts.length === 0 && (
                          <div className="text-[9px] text-teal-700 font-bold pl-0.5">
                            {cell.totalCount} ta qabul
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="p-16 text-center text-slate-400 text-sm">Qabullar yuklanmoqda...</div>
          ) : appointments.length === 0 ? (
            <div className="p-16 text-center text-slate-500 text-sm bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              {isInboxMode
                ? 'Tasdiqlash kutilayotgan yangi arizalar mavjud emas.'
                : 'Ushbu sana va parametrlar bo\'yicha qabullar topilmadi.'}
            </div>
          ) : viewMode === 'day' && !isInboxMode && daySubView === 'timeline' ? (
            /* Day Timeline View - Interval-Aware & Doctor-Specific */
            <div className="space-y-2 py-2">
              {dayTimelineHours.map((hour) => {
                const hourLabel = `${String(hour).padStart(2, '0')}:00`;
                const curParts = getClinicDateParts(currentDate);
                const slotStartMs = Date.UTC(curParts.year, curParts.monthIndex, curParts.day, hour - 5, 0, 0);
                const slotEndMs = Date.UTC(curParts.year, curParts.monthIndex, curParts.day, hour + 1 - 5, 0, 0);

                // Interval-aware matching: includes continuing appointments, multi-hour treatments, buffers and overruns
                const hourAppts = appointments.filter((a) => {
                  const aStart = new Date(a.startTime).getTime();
                  const aEnd = (a.overrunActive && a.overrunEstimatedEndTime)
                    ? new Date(new Date(a.overrunEstimatedEndTime).getTime() + (a.bufferMinutes ?? 5) * 60000).getTime()
                    : new Date(a.endTime).getTime();
                  return aStart < slotEndMs && aEnd > slotStartMs;
                });

                // Doctor-specific occupancy
                const occupiedDoctorIds = new Set(hourAppts.map((a) => a.doctorId).filter(Boolean));
                const occupiedDoctorNames = Array.from(occupiedDoctorIds)
                  .map((docId) => {
                    const d = doctors.find((doc) => doc.id === docId);
                    return d ? `Dr. ${d.firstNameUz || d.lastNameUz}` : null;
                  })
                  .filter(Boolean);

                return (
                  <div key={hour} className="flex gap-3 sm:gap-4 items-start group">
                    <div className="w-14 sm:w-16 shrink-0 pt-1.5 text-right font-mono text-xs font-bold text-slate-500">
                      {hourLabel}
                    </div>
                    <div className="flex-1 min-h-[56px] border-l-2 border-slate-200 pl-3 sm:pl-4 pb-3">
                      {hourAppts.length === 0 ? (
                        <div className="h-full border border-dashed border-slate-100 rounded-xl px-3 py-2 text-[11px] text-slate-400 flex items-center justify-between">
                          <span>Bo&apos;sh vaqt oralig&apos;i</span>
                          <span className="text-[10px] text-teal-600 font-semibold">
                            {selectedDoctorId ? 'Shifokor bo\'sh' : 'Barcha shifokorlar bo\'sh'}
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {!selectedDoctorId && occupiedDoctorNames.length > 0 && (
                            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 pb-0.5">
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-bold">
                                Band: {occupiedDoctorNames.join(', ')}
                              </span>
                              {doctors.length > occupiedDoctorIds.size && (
                                <span className="text-teal-700 font-medium">
                                  ({doctors.length - occupiedDoctorIds.size} ta shifokor bo&apos;sh)
                                </span>
                              )}
                            </div>
                          )}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                            {hourAppts.map((appt) => {
                              const aStart = new Date(appt.startTime).getTime();
                              const isContinuing = aStart < slotStartMs;
                              const timeStr = `${formatClinicTime(appt.startTime)} - ${formatClinicTime(appt.endTime)}`;
                              const badge = getStatusInfo(appt.status);
                              return (
                                <div
                                  key={appt.id}
                                  data-testid="appointment-row"
                                  onClick={() => openAppointment(appt)}
                                  className={`p-3 bg-white hover:bg-slate-50 border rounded-2xl shadow-sm cursor-pointer transition-all space-y-1.5 ${
                                    highlightedApptId === appt.id
                                      ? 'ring-4 ring-[#167b78] border-[#167b78] bg-[#e0f2ed]/40 shadow-md'
                                      : 'border-slate-200 hover:border-teal-500'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-xs font-extrabold text-teal-800 font-mono">
                                        {timeStr}
                                      </span>
                                      {isContinuing && (
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                                          Davom etmoqda ({formatClinicTime(appt.startTime)} dan)
                                        </span>
                                      )}
                                    </div>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.color}`}>
                                      {badge.label}
                                    </span>
                                  </div>
                                  <div className="font-bold text-xs text-slate-900">
                                    {appt.patient?.fullName || appt.patientName}
                                    <span className="text-slate-400 font-normal ml-1.5">
                                      ({appt.patient?.phone || appt.patientPhone})
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-600">
                                    {appt.serviceName || appt.service?.nameUz} • Dr. {appt.doctor?.firstNameUz} {appt.doctor?.lastNameUz}
                                  </div>
                                  {appt.actualStartTime && appt.status !== 'COMPLETED' && (
                                    <div className="text-[10px] text-emerald-800 font-semibold">
                                      Muolaja: {formatClinicTime(appt.actualStartTime)} da boshlangan
                                    </div>
                                  )}
                                  {appt.overrunActive && (
                                    <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 border border-amber-300 text-amber-900 rounded-lg text-[11px] font-bold">
                                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                      <span>Kechikish: +{appt.overrunMinutes} daq {appt.overrunReason ? `(${appt.overrunReason})` : ''}</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {appointments.map((appt) => {
                const dateFormatted = formatClinicDate(appt.startTime, 'uz', {
                  includeWeekday: true,
                  includeYear: false,
                });
                const timeFormatted = formatClinicTime(appt.startTime);
                const badge = getStatusInfo(appt.status);

                return (
                  <div
                    key={appt.id}
                    data-testid="appointment-row"
                    onClick={() => openAppointment(appt)}
                    className={`py-4 px-3 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer transition-colors ${
                      highlightedApptId === appt.id
                        ? 'ring-4 ring-[#167b78] border border-[#167b78] bg-[#e0f2ed]/40 shadow-md'
                        : 'hover:bg-slate-50'
                    }`}
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
            <span>{isRu ? 'Статусы приемов и их значения:' : 'Qabullar holatlari va ma\'nolari:'}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
            {Object.keys(STATUS_LABELS).map((k) => {
              const s = getStatusInfo(k);
              return (
                <div key={k} className="flex items-start gap-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 mt-0.5 ${s.color}`}>
                    {s.label}
                  </span>
                  <span className="text-[11px] text-slate-500 leading-tight">
                    {s.desc}
                  </span>
                </div>
              );
            })}
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

              <div className="p-2.5 bg-slate-50 rounded-xl space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Rejalashtirilgan:</span>
                  <span className="font-bold text-slate-800">
                    {formatClinicDate(selectedAppt.startTime, 'uz', { includeWeekday: true, includeYear: true })}{' '}
                    • {formatClinicTime(selectedAppt.startTime)} - {formatClinicTime(selectedAppt.endTime)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Klinikaga kelgan:</span>
                  <span className="font-semibold text-slate-700">
                    {selectedAppt.arrivedAt ? formatClinicTime(selectedAppt.arrivedAt) : 'Kelmagan / kutilmoqda'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Muolaja boshlanishi:</span>
                  <span className="font-semibold text-slate-700">
                    {selectedAppt.actualStartTime ? formatClinicTime(selectedAppt.actualStartTime) : 'Boshlanmagan'}
                  </span>
                </div>
                {selectedAppt.actualEndTime && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Muolaja yakuni:</span>
                    <span className="font-semibold text-slate-700">
                      {formatClinicTime(selectedAppt.actualEndTime)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between pt-1 border-t border-slate-200/60">
                  <span className="text-slate-500 font-semibold">{isRu ? 'Текущий статус:' : 'Joriy holat:'}</span>
                  <span className="font-bold text-teal-800">
                    {getStatusInfo(selectedAppt.status).label}
                  </span>
                </div>
              </div>

              {selectedAppt.note && (
                <div className="p-2.5 bg-slate-50 rounded-xl">
                  <span className="text-slate-500 block mb-1">Izoh / shikoyat:</span>
                  <p className="text-slate-700 italic">{selectedAppt.note}</p>
                </div>
              )}
            </div>

            {/* Valid Status Transitions & Clinical Actions */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <p className="text-xs font-bold text-slate-700">Amallar va holatni o&apos;zgartirish:</p>
              <div className="flex flex-wrap gap-2 items-center">
                {/* Explicit Start Treatment Action */}
                {['CONFIRMED', 'CHECKED_IN'].includes(selectedAppt.status) && !selectedAppt.actualStartTime && (
                  <button
                    type="button"
                    disabled={isStartingTreatment || isUpdating}
                    onClick={handleStartTreatment}
                    className="py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>{isStartingTreatment ? 'Boshlanmoqda...' : 'Muolajani boshlash'}</span>
                  </button>
                )}
                {selectedAppt.actualStartTime && selectedAppt.status !== 'COMPLETED' && (
                  <div className="py-1 px-2.5 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Muolaja ketmoqda ({formatClinicTime(selectedAppt.actualStartTime)})</span>
                  </div>
                )}

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

            {/* Delay & Overrun Section for in-progress or confirmed bookings */}
            {['CONFIRMED', 'CHECKED_IN'].includes(selectedAppt.status) && (
              <div className="pt-2 border-t border-slate-100 space-y-2">
                {selectedAppt.overrunActive && (
                  <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-900 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        Aktiv kechikish: +{selectedAppt.overrunMinutes} daqiqa {selectedAppt.overrunReason ? `(${selectedAppt.overrunReason})` : ''}
                      </span>
                      <button
                        type="button"
                        disabled={isSavingDelay}
                        onClick={handleClearOverrun}
                        className="px-2.5 py-1 bg-amber-200 hover:bg-amber-300 text-amber-900 font-bold rounded-lg text-[11px] transition-colors"
                      >
                        {isSavingDelay ? 'Tozalanmoqda...' : 'Kechikishni tozalash'}
                      </button>
                    </div>
                    {selectedAppt.overrunEstimatedEndTime && (
                      <p className="text-[11px] text-amber-800">
                        Kutilayotgan yangi tugash vaqti: <strong>{formatClinicTime(selectedAppt.overrunEstimatedEndTime)}</strong>
                      </p>
                    )}
                  </div>
                )}
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
                        <CustomDatePicker
                          id="admin-calendar-reschedule-date"
                          value={rescheduleDate}
                          min={new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date())}
                          onChange={(val) => setRescheduleDate(val)}
                          placeholder="Sanani tanlang..."
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
                  <PhoneInput
                    label="Telefon raqam *"
                    required
                    value={createForm.patientPhone}
                    onChange={(canonical) => setCreateForm({ ...createForm, patientPhone: canonical })}
                    placeholder="+998 (90) 123-45-67"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <CustomSelect
                    label="Shifokor *"
                    disabled={user?.role === 'DOCTOR'}
                    options={doctors.map((d) => ({
                      value: d.id,
                      label: `Dr. ${d.firstNameUz} ${d.lastNameUz}`,
                    }))}
                    value={createForm.doctorId}
                    onChange={(val) => setCreateForm({ ...createForm, doctorId: val })}
                    placeholder="Shifokorni tanlang..."
                  />
                </div>
                <div>
                  <CustomSelect
                    label="Xizmat turi *"
                    options={services.map((s) => ({
                      value: s.id,
                      label: s.nameUz,
                    }))}
                    value={createForm.serviceId}
                    onChange={(val) => setCreateForm({ ...createForm, serviceId: val })}
                    placeholder="Xizmatni tanlang..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <CustomSelect
                    label="Filial"
                    options={[
                      { value: '', label: 'Asosiy / Barcha filiallar' },
                      ...branches.map((b) => ({
                        value: b.id,
                        label: b.nameUz,
                      })),
                    ]}
                    value={createForm.branchId}
                    onChange={(val) => setCreateForm({ ...createForm, branchId: val })}
                    placeholder="Filialni tanlang..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Sana *
                  </label>
                  <CustomDatePicker
                    id="admin-calendar-create-date"
                    required
                    value={createForm.date}
                    onChange={(val) => setCreateForm({ ...createForm, date: val })}
                    placeholder="Sanani tanlang..."
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
