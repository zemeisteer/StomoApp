'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  Building2,
  Search,
  Plus,
  Play,
  Hourglass,
  DollarSign,
  Activity,
  FileCheck,
  ShieldAlert,
  BarChart3,
  Wallet,
  CreditCard,
  Package,
  Percent,
  Filter,
  Sparkles,
  Shield,
  FileText,
  Layers,
} from 'lucide-react';
import { AdminLayout } from '../../components/AdminLayout';
import { PhoneInput } from '../../components/PhoneInput';
import { CustomSelect } from '../../components/CustomSelect';
import { InteractiveOdontogram } from '../../components/InteractiveOdontogram';
import {
  clinicStore,
  Invoice,
  Patient,
  PaymentMethod,
  InventoryItem,
  ToothRecord,
} from '../../lib/clinicState';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { formatClinicDate, formatClinicTime, getClinicTodayDateString } from '../../lib/dateFormat';
import { normalizeUzPhone } from '../../lib/phone';

export default function AdminOverviewPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { t, language } = useI18n();
  const isUz = language === 'uz';

  // Appointments State
  const [todayAppointments, setTodayAppointments] = useState<any[]>([]);
  const [pendingAppointments, setPendingAppointments] = useState<any[]>([]);
  const [pendingTotal, setPendingTotal] = useState<number>(0);
  const [pendingPage, setPendingPage] = useState<number>(1);
  const pendingPageSize = 6;

  const [upcomingAppointments, setUpcomingAppointments] = useState<any[]>([]);
  const [completedDoctorCount, setCompletedDoctorCount] = useState<number>(0);
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [analyticsUnavailable, setAnalyticsUnavailable] = useState(false);

  // Fixtures for quick registration & filters
  const [doctors, setDoctors] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDoctorId, setFilterDoctorId] = useState('');
  const [filterBranchId, setFilterBranchId] = useState('');
  const [queueTab, setQueueTab] = useState<'ALL' | 'WAITING' | 'ARRIVED' | 'IN_TREATMENT' | 'COMPLETED'>('ALL');

  // Quick Registration Form State
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('+998 ');
  const [regDoctorId, setRegDoctorId] = useState('');
  const [regServiceId, setRegServiceId] = useState('');
  const [regBranchId, setRegBranchId] = useState('');
  const [regConsentGiven, setRegConsentGiven] = useState(false);
  const [regSlots, setRegSlots] = useState<Array<{ startTime: string; endTime: string; available: boolean }>>([]);
  const [regSlotQuote, setRegSlotQuote] = useState<{ durationMinutes: number; bufferMinutes: number; priceFrom: number } | null>(null);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [slotFetchError, setSlotFetchError] = useState<string | null>(null);
  const [slotRefreshSeq, setSlotRefreshSeq] = useState<number>(0);
  const [loadedSlotContext, setLoadedSlotContext] = useState<{
    doctorId: string;
    serviceId: string;
    branchId: string;
    date: string;
  } | null>(null);
  const [regSelectedSlot, setRegSelectedSlot] = useState<string>('');
  const [regIdempotencyKey, setRegIdempotencyKey] = useState<string>(() => `quick_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  const [savedAppointmentSummary, setSavedAppointmentSummary] = useState<any | null>(null);
  const [isSubmittingReg, setIsSubmittingReg] = useState(false);
  const [regSuccessMsg, setRegSuccessMsg] = useState<string | null>(null);
  const [regErrorMsg, setRegErrorMsg] = useState<string | null>(null);

  // Status mutation & feedback
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);
  const [mutatingMap, setMutatingMap] = useState<Record<string, string>>({});
  const [cancellationTarget, setCancellationTarget] = useState<any | null>(null);

  // Doctor Workspace Interactive Odontogram & X-Ray State (Image 3 Reference)
  const [selectedTooth, setSelectedTooth] = useState<number>(14);
  const [xrayBrightness, setXrayBrightness] = useState<number>(100);
  const [xrayContrast, setXrayContrast] = useState<number>(100);

  const loadReqSeqRef = useRef<number>(0);
  const feedbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Dynamic role switching & preview
  const [roleOverride, setRoleOverride] = useState<'AUTO' | 'DOCTOR' | 'RECEPTIONIST' | 'OWNER' | 'PATIENT'>('AUTO');
  const effectiveRole = roleOverride === 'AUTO' ? (user?.role || 'ADMIN') : roleOverride;
  const isDoctor = effectiveRole === 'DOCTOR';
  const isOwner = effectiveRole === 'OWNER';
  const isPatient = effectiveRole === 'PATIENT';

  // Demo Auth & Role Switching Modal
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [activePatientPortalId, setActivePatientPortalId] = useState<string>('pat-101');

  // Owner CRM Date Filter
  const [ownerDateFilter, setOwnerDateFilter] = useState<'today' | 'week' | 'month' | 'custom'>('today');
  const [ownerCustomStart, setOwnerCustomStart] = useState<string>('');
  const [ownerCustomEnd, setOwnerCustomEnd] = useState<string>('');

  // Doctor Clinical Attachments & Note Templates
  const [doctorAttachments, setDoctorAttachments] = useState<Array<{ id: string; name: string; type: string; date: string }>>([
    { id: 'att-1', name: 'Panoramik rentgen (OPG HD)', type: 'OPG', date: '2026-10-30' },
    { id: 'att-2', name: 'Periapikal rentgen (#14 tish)', type: 'Periapical', date: '2026-10-31' },
    { id: 'att-3', name: '3D KT Tomografiya segmenti', type: 'CBCT', date: '2026-10-25' },
  ]);

  // Unified Reactive Clinic State (Phase 2 & Phase 3 Cross-Role Sync)
  const [clinicState, setClinicState] = useState(() => clinicStore.getState());
  const [debtModalOpen, setDebtModalOpen] = useState(false);
  const [debtPatientId, setDebtPatientId] = useState<string>('');
  const [debtAmount, setDebtAmount] = useState<number>(0);
  const [debtMethod, setDebtMethod] = useState<PaymentMethod>('CASH');
  const [debtNotes, setDebtNotes] = useState<string>('');
  const [debtSuccessMsg, setDebtSuccessMsg] = useState<string | null>(null);
  const [debtErrorMsg, setDebtErrorMsg] = useState<string | null>(null);

  // Doctor Commission Calculator (Owner CRM)
  const [selectedCommissionDocId, setSelectedCommissionDocId] = useState<string>('');
  const [doctorCommissionRates, setDoctorCommissionRates] = useState<Record<string, number>>({
    'doc-1': 40,
    'doc-2': 45,
    'doc-3': 35,
  });

  useEffect(() => {
    const unsub = clinicStore.subscribe((newState) => {
      setClinicState(newState);
    });
    return unsub;
  }, []);

  const handleOpenDebtModal = (patientId?: string) => {
    const debtors = clinicState.patients.filter((p) => p.totalDebt > 0);
    const targetId = patientId || (debtors.length > 0 ? debtors[0].id : '');
    const patient = clinicState.patients.find((p) => p.id === targetId);
    setDebtPatientId(targetId);
    setDebtAmount(patient ? patient.totalDebt : 0);
    setDebtMethod('CASH');
    setDebtNotes('');
    setDebtSuccessMsg(null);
    setDebtErrorMsg(null);
    setDebtModalOpen(true);
  };

  const handleRepayDebtSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDebtErrorMsg(null);
    setDebtSuccessMsg(null);
    if (!debtPatientId) {
      setDebtErrorMsg(isUz ? 'Bemor tanlanmagan' : 'Пациент не выбран');
      return;
    }
    if (debtAmount <= 0) {
      setDebtErrorMsg(isUz ? "To'lov summasi 0 dan katta bo'lishi kerak" : 'Сумма оплаты должна быть больше 0');
      return;
    }

    const res = clinicStore.repayPatientDebt({
      patientId: debtPatientId,
      amount: debtAmount,
      paymentMethod: debtMethod,
      notes: debtNotes || (isUz ? "Qarz to'lovi" : "Погашение задолженности"),
    });

    if (res.success) {
      setDebtSuccessMsg(
        isUz
          ? `To'lov muvaffaqiyatli qabul qilindi! Qoldiq qarz: ${res.remainingDebt.toLocaleString()} so'm`
          : `Оплата успешно принята! Остаток долга: ${res.remainingDebt.toLocaleString()} сум`
      );
      setStatusFeedback(
        isUz ? "Bemor qarzi muvaffaqiyatli so'ndirildi" : "Задолженность пациента успешно погашена"
      );
      setTimeout(() => {
        setDebtModalOpen(false);
      }, 1500);
    } else {
      setDebtErrorMsg(res.error || (isUz ? "To'lovda xatolik yuz berdi" : "Ошибка при оплате"));
    }
  };

  const handleRestockInventory = (itemId: string, qty: number = 10) => {
    clinicStore.addStock(itemId, qty);
    setStatusFeedback(
      isUz ? `Zaxira +${qty} birlikka to'ldirildi` : `Склад пополнен на +${qty} ед.`
    );
  };

  const handleDeductInventory = (itemId: string, qty: number = 1) => {
    clinicStore.deductStock(itemId, qty);
    setStatusFeedback(
      isUz ? `Zaxiradan -${qty} birlik sarflandi` : `Списано -${qty} ед. со склада`
    );
  };

  const handleUpdateDoctorCommissionRate = (doctorId: string, rate: number) => {
    setDoctorCommissionRates((prev) => ({ ...prev, [doctorId]: rate }));
    clinicStore.setDoctorCommission(doctorId, rate, 10);
    setStatusFeedback(
      isUz ? `Shifokor komissiyasi ${rate}% ga belgilandi` : `Комиссия врача установлена на ${rate}%`
    );
  };

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    };
  }, []);

  // Load Fixtures (Doctors, Branches, Services)
  useEffect(() => {
    async function loadFixtures() {
      try {
        const [docsRes, branchRes, servRes] = await Promise.all([
          api.getDoctors(),
          api.getBranches(),
          api.getServices(),
        ]);
        const docs = docsRes || [];
        const brs = branchRes || [];
        const srvs = servRes || [];
        setDoctors(docs);
        setBranches(brs);
        setServices(srvs);

        // Explicit branch selection: Only preselect if there is exactly 1 active branch
        if (brs.length === 1 && !regBranchId) {
          setRegBranchId(brs[0].id);
        }

        if (docs.length > 0 && !regDoctorId) {
          const firstDoc = docs[0];
          setRegDoctorId(firstDoc.id);
          if (brs.length === 1) {
            setRegBranchId(brs[0].id);
          } else if (firstDoc.branches && firstDoc.branches.length === 1) {
            setRegBranchId(firstDoc.branches[0].branchId || firstDoc.branches[0].id);
          }
          // Only allow services assigned to the selected doctor. NO fallback to srvs[0]!
          if (firstDoc.services && firstDoc.services.length > 0) {
            setRegServiceId(firstDoc.services[0].serviceId || firstDoc.services[0].id);
          } else {
            setRegServiceId('');
          }
        }
      } catch (err) {
        console.error('Failed to load fixtures', err);
      }
    }
    loadFixtures();
  }, [regBranchId, regDoctorId]);

  // Main Data Loader
  const loadData = useCallback(async () => {
    if (!user) return;

    const currentSeq = ++loadReqSeqRef.current;
    try {
      setIsLoading(true);
      setFetchError(null);

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
        // DOCTOR: Scoped endpoints
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
          setTodayAppointments(Array.isArray(todaySettled.value) ? todaySettled.value : []);
        } else {
          setTodayAppointments([]);
        }

        if (pendingSettled.status === 'fulfilled') {
          setPendingAppointments(pendingSettled.value?.items || []);
          setPendingTotal(pendingSettled.value?.total || 0);
        } else {
          setPendingAppointments([]);
          setPendingTotal(0);
        }

        if (upcomingSettled.status === 'fulfilled') {
          setUpcomingAppointments(upcomingSettled.value?.items || []);
        } else {
          setUpcomingAppointments([]);
        }

        if (completedSettled.status === 'fulfilled') {
          setCompletedDoctorCount(completedSettled.value?.total || 0);
        }
      } else {
        // OWNER / ADMIN: Operational dashboard
        const [todaySettled, pendingSettled, upcomingSettled, analyticsSettled] = await Promise.allSettled([
          api.getTodayAppointments(),
          api.getAdminAppointments(pendingParams),
          api.getAdminAppointments(upcomingParams),
          api.getAnalyticsOverview(),
        ]);

        if (currentSeq !== loadReqSeqRef.current) return;

        if (todaySettled.status === 'fulfilled') {
          setTodayAppointments(Array.isArray(todaySettled.value) ? todaySettled.value : []);
        } else {
          setTodayAppointments([]);
        }

        if (pendingSettled.status === 'fulfilled') {
          setPendingAppointments(pendingSettled.value?.items || []);
          setPendingTotal(pendingSettled.value?.total || 0);
        } else {
          setPendingAppointments([]);
          setPendingTotal(0);
        }

        if (upcomingSettled.status === 'fulfilled') {
          setUpcomingAppointments(upcomingSettled.value?.items || []);
        } else {
          setUpcomingAppointments([]);
        }

        if (analyticsSettled.status === 'fulfilled') {
          setAnalytics(analyticsSettled.value);
          setAnalyticsUnavailable(false);
        } else {
          setAnalytics(null);
          setAnalyticsUnavailable(true);
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
  }, [pendingPage, user, isDoctor]);

  useEffect(() => {
    if (!isAuthLoading && user) {
      loadData();
    }
  }, [loadData, isAuthLoading, user]);

  // Appointment Status Transitions
  const handleStatusChange = async (
    appointmentId: string,
    newStatus: string
  ) => {
    if (mutatingMap[appointmentId]) return;

    try {
      setMutatingMap((prev) => ({ ...prev, [appointmentId]: newStatus }));

      await api.updateAppointmentStatus(appointmentId, newStatus);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('pendingCountChanged'));
      }

      const msg =
        newStatus === 'CONFIRMED'
          ? (language === 'ru' ? 'Запись подтверждена' : 'Qabul muvaffaqiyatli tasdiqlandi')
          : newStatus === 'CHECKED_IN'
          ? (language === 'ru' ? 'Пациент прибыл в клинику' : 'Bemor klinikaga kelgani qayd etildi')
          : newStatus === 'COMPLETED'
          ? (language === 'ru' ? 'Прием успешно завершен' : 'Qabul yakunlandi')
          : newStatus === 'CANCELLED'
          ? (language === 'ru' ? 'Запись отменена' : 'Qabul bekor qilindi')
          : 'Holat yangilandi';

      setStatusFeedback(msg);
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => setStatusFeedback(null), 5000);

      setCancellationTarget((prev: any) => (prev && prev.id === appointmentId ? null : prev));
      await loadData();
    } catch (err: any) {
      setStatusFeedback(err?.message || (language === 'ru' ? 'Ошибка при обновлении статуса' : 'Holatni yangilashda xatolik yuz berdi'));
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => setStatusFeedback(null), 5000);
    } finally {
      setMutatingMap((prev) => {
        const next = { ...prev };
        delete next[appointmentId];
        return next;
      });
    }
  };

  // Explicit Start Treatment Action (separates arrival from treatment)
  const handleStartTreatment = async (appointmentId: string) => {
    if (mutatingMap[appointmentId]) return;
    try {
      setMutatingMap((prev) => ({ ...prev, [appointmentId]: 'STARTING' }));
      await api.startAppointmentTreatment(appointmentId);
      setStatusFeedback(
        language === 'ru'
          ? 'Лечение начато! Время начала зафиксировано.'
          : 'Muolaja boshlandi! Boshlanish vaqti qayd etildi.'
      );
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => setStatusFeedback(null), 5000);
      await loadData();
    } catch (err: any) {
      setStatusFeedback(err?.message || (language === 'ru' ? 'Ошибка при начале лечения' : 'Muolajani boshlashda xatolik yuz berdi'));
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => setStatusFeedback(null), 5000);
    } finally {
      setMutatingMap((prev) => {
        const next = { ...prev };
        delete next[appointmentId];
        return next;
      });
    }
  };

  // Record Overrun/Delay (+15 min) - plain text feedback without internal jargon
  const handleRecordDelay = async (appointmentId: string) => {
    try {
      await api.recordAppointmentDelay(appointmentId, 15, 'Amaliyot cho\'zildi');
      setStatusFeedback(
        language === 'ru'
          ? 'Время приема продлено на 15 минут'
          : 'Qabul vaqti 15 daqiqaga uzaytirildi'
      );
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => setStatusFeedback(null), 5000);
      await loadData();
    } catch (err: any) {
      setStatusFeedback(err?.message || (language === 'ru' ? 'Ошибка при продлении приема' : 'Kechikishni qayd etishda xatolik yuz berdi'));
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => setStatusFeedback(null), 5000);
    }
  };

  // Branch selection handler with honest cascading and immediate invalidation
  const handleBranchSelect = (branchId: string) => {
    setRegBranchId(branchId);
    setRegErrorMsg(null);
    setSlotFetchError(null);
    setSavedAppointmentSummary(null);
    // Immediately invalidate old slot selections and quote to prevent race conditions
    setRegSlots([]);
    setRegSlotQuote(null);
    setRegSelectedSlot('');
    setLoadedSlotContext(null);

    if (regDoctorId) {
      const doc = doctors.find((d) => d.id === regDoctorId);
      const docBranchIds = doc?.branches?.map((b: any) => b.branchId || b.id) || [];
      if (!docBranchIds.includes(branchId)) {
        setRegDoctorId('');
        setRegServiceId('');
      }
    }
  };

  // Doctor selection handler that strictly syncs valid doctor services and branch
  const handleDoctorSelect = (docId: string) => {
    setRegDoctorId(docId);
    setRegErrorMsg(null);
    setSlotFetchError(null);
    setSavedAppointmentSummary(null);
    // Immediately clear slots, quote, and selection
    setRegSlots([]);
    setRegSlotQuote(null);
    setRegSelectedSlot('');
    setLoadedSlotContext(null);

    const doc = doctors.find((d) => d.id === docId);
    if (doc) {
      const docBranchIds = doc.branches?.map((b: any) => b.branchId || b.id) || [];
      if (!regBranchId || !docBranchIds.includes(regBranchId)) {
        if (docBranchIds.length === 1) {
          setRegBranchId(docBranchIds[0]);
        } else {
          setRegBranchId('');
        }
      }
      const docSrvIds = doc.services?.map((ds: any) => ds.serviceId || ds.id) || [];
      if (!docSrvIds.includes(regServiceId)) {
        setRegServiceId(docSrvIds[0] || '');
      }
    } else {
      setRegServiceId('');
    }
  };

  // Service selection handler
  const handleServiceSelect = (serviceId: string) => {
    setRegServiceId(serviceId);
    setRegErrorMsg(null);
    setSlotFetchError(null);
    setSavedAppointmentSummary(null);
    setRegSlots([]);
    setRegSlotQuote(null);
    setRegSelectedSlot('');
    setLoadedSlotContext(null);
  };

  // Compute available doctors for selected branch
  const availableDoctorsForReg = useMemo(() => {
    if (!regBranchId) return doctors;
    return doctors.filter((doc) => {
      const docBranchIds = doc.branches?.map((b: any) => b.branchId || b.id) || [];
      return docBranchIds.includes(regBranchId);
    });
  }, [doctors, regBranchId]);

  // Compute available services strictly supported by currently selected doctor (NO silent fallback)
  const availableServicesForReg = useMemo(() => {
    if (!regDoctorId) return [];
    const doc = doctors.find((d) => d.id === regDoctorId);
    if (!doc || !doc.services || doc.services.length === 0) return [];
    const docSrvIds = doc.services.map((ds: any) => ds.serviceId || ds.id);
    return services.filter((s) => docSrvIds.includes(s.id));
  }, [doctors, regDoctorId, services]);

  const selectedServiceObj = useMemo(() => {
    return services.find((s) => s.id === regServiceId);
  }, [services, regServiceId]);

  const selectedDoctorObjForReg = useMemo(() => {
    return doctors.find((d) => d.id === regDoctorId);
  }, [doctors, regDoctorId]);

  const selectedBranchObjForReg = useMemo(() => {
    return branches.find((b) => b.id === regBranchId);
  }, [branches, regBranchId]);

  // Server-authoritative available slots fetch for today with strict context binding
  useEffect(() => {
    let active = true;
    const todayDateStr = getClinicTodayDateString();

    if (!regDoctorId || !regServiceId || !regBranchId) {
      setRegSlots([]);
      setRegSlotQuote(null);
      setRegSelectedSlot('');
      setLoadedSlotContext(null);
      setSlotFetchError(null);
      return;
    }

    const currentContext = {
      doctorId: regDoctorId,
      serviceId: regServiceId,
      branchId: regBranchId,
      date: todayDateStr,
    };

    async function fetchSlots() {
      setIsLoadingSlots(true);
      setSlotFetchError(null);
      try {
        const res = await api.getAvailableSlots(regDoctorId, todayDateStr, regServiceId, regBranchId);
        if (!active) return;

        // Verify that this response matches the current live selection (ignore race responses)
        if (
          currentContext.doctorId !== regDoctorId ||
          currentContext.serviceId !== regServiceId ||
          currentContext.branchId !== regBranchId
        ) {
          return;
        }

        const rawSlots = res?.slots || [];
        const availableOnly = rawSlots.filter((s: any) => s.available);
        availableOnly.sort((a: any, b: any) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
        setRegSlots(availableOnly);
        setRegSlotQuote({
          durationMinutes: res.durationMinutes,
          bufferMinutes: res.bufferMinutes,
          priceFrom: res.priceFrom,
        });
        setLoadedSlotContext(currentContext);

        // Pick nearest slot (>= now, or first available)
        const nowMs = Date.now();
        const nearest = availableOnly.find((s: any) => new Date(s.startTime).getTime() >= nowMs) || availableOnly[0] || null;
        setRegSelectedSlot(nearest ? nearest.startTime : '');
      } catch (err: any) {
        if (!active) return;
        console.error('Failed to load slots for quick registration', err);
        setRegSlots([]);
        setRegSlotQuote(null);
        setRegSelectedSlot('');
        setLoadedSlotContext(null);
        setSlotFetchError(
          err?.message || (isUz ? 'Bo\'sh vaqtlarni yuklab bo\'lmadi' : 'Не удалось загрузить доступные слоты')
        );
      } finally {
        if (active) setIsLoadingSlots(false);
      }
    }

    fetchSlots();

    return () => {
      active = false;
    };
  }, [regDoctorId, regServiceId, regBranchId, slotRefreshSeq, isUz]);

  // Reset quick reg state to register another patient:
  // Invalidates availability, clears booked slot, and fetches fresh server slots
  const handleResetQuickReg = () => {
    setSavedAppointmentSummary(null);
    setRegSuccessMsg(null);
    setRegErrorMsg(null);
    setSlotFetchError(null);
    setRegName('');
    setRegPhone('+998 ');
    setRegConsentGiven(false);
    setRegSelectedSlot('');
    setRegSlots([]);
    setRegSlotQuote(null);
    setLoadedSlotContext(null);
    setRegIdempotencyKey(`quick_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    // Trigger fresh availability refetch so the booked slot is gone from the UI
    setSlotRefreshSeq((s) => s + 1);
  };

  // Quick Patient Registration Submission
  const handleQuickRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegErrorMsg(null);
    setRegSuccessMsg(null);

    const phoneVal = normalizeUzPhone(regPhone, true);
    if (!phoneVal.isValid) {
      setRegErrorMsg(
        isUz
          ? (phoneVal.errorMessageUz || 'Telefon raqami O\'zbekiston formati (+998XXXXXXXXX)da bo\'lishi shart')
          : (phoneVal.errorMessageRu || 'Номер телефона должен быть в формате (+998XXXXXXXXX)')
      );
      return;
    }

    if (!regName.trim()) {
      setRegErrorMsg(isUz ? 'Bemor ism-familiyasini kiriting' : 'Введите Ф.И.О. пациента');
      return;
    }
    if (!regBranchId) {
      setRegErrorMsg(isUz ? 'Filialni tanlang' : 'Выберите филиал');
      return;
    }
    if (!regDoctorId) {
      setRegErrorMsg(isUz ? 'Shifokorni tanlang' : 'Выберите врача');
      return;
    }
    if (!regServiceId) {
      setRegErrorMsg(isUz ? 'Xizmatni tanlang' : 'Выберите услугу');
      return;
    }
    if (isLoadingSlots) {
      setRegErrorMsg(isUz ? 'Bo\'sh vaqtlar tekshirilmoqda, kuting' : 'Проверка доступных слотов, подождите');
      return;
    }
    if (!regSelectedSlot) {
      setRegErrorMsg(
        isUz
          ? 'Bugungi kunga bo\'sh vaqt mavjud emas yoki tanlanmagan'
          : 'Свободное время на сегодня отсутствует или не выбрано'
      );
      return;
    }

    // Context verification: confirm selected slot belongs to the currently loaded context
    if (
      !loadedSlotContext ||
      loadedSlotContext.doctorId !== regDoctorId ||
      loadedSlotContext.serviceId !== regServiceId ||
      loadedSlotContext.branchId !== regBranchId
    ) {
      setRegErrorMsg(isUz ? 'Bo\'sh vaqtlar yangilanmoqda, kuting' : 'Слоты обновляются, подождите');
      return;
    }

    const slotValid = regSlots.some((s) => s.startTime === regSelectedSlot && s.available);
    if (!slotValid) {
      setRegErrorMsg(
        isUz
          ? 'Tanlangan vaqt band qilingan yoki eskirgan. Yangi vaqt tanlang.'
          : 'Выбранное время уже занято или устарело. Выберите другое время.'
      );
      setSlotRefreshSeq((s) => s + 1);
      return;
    }

    if (!regConsentGiven) {
      setRegErrorMsg(
        isUz
          ? 'Bemorning og\'zaki roziligi olinganini tasdiqlang'
          : 'Подтвердите получение устного согласия пациента'
      );
      return;
    }

    try {
      setIsSubmittingReg(true);

      const created = await api.createAppointmentAdmin({
        patientName: regName.trim(),
        patientPhone: phoneVal.normalized,
        doctorId: regDoctorId,
        serviceId: regServiceId,
        branchId: regBranchId,
        startTime: regSelectedSlot,
        consentGiven: true,
        idempotencyKey: regIdempotencyKey,
      });

      setSavedAppointmentSummary(created);
      setRegSuccessMsg(
        isUz
          ? 'Bemor muvaffaqiyatli navbatga qo\'shildi!'
          : 'Пациент успешно добавлен в очередь!'
      );
      setRegIdempotencyKey(`quick_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
      // Invalidate slots immediately so background slots reflect the booked appointment
      setSlotRefreshSeq((s) => s + 1);
      await loadData();
    } catch (err: any) {
      // Retain entered name, phone, doctor, branch, and idempotencyKey on error!
      setRegErrorMsg(err?.message || (isUz ? 'Bemor qo\'shishda xatolik yuz berdi' : 'Ошибка при регистрации пациента'));
      // On conflict error, refresh availability to reflect occupied slots while preserving patient inputs
      const isConflict =
        err?.status === 409 ||
        (err?.message && (err.message.includes('band') || err.message.includes('conflict') || err.message.includes('overrun')));
      if (isConflict) {
        setSlotRefreshSeq((s) => s + 1);
      }
    } finally {
      setIsSubmittingReg(false);
    }
  };

  // Filtered Today Appointments
  const filteredToday = useMemo(() => {
    return todayAppointments.filter((appt) => {
      if (filterDoctorId && appt.doctorId !== filterDoctorId) return false;
      if (filterBranchId && appt.branchId !== filterBranchId) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const pName = (appt.patient?.fullName || appt.patientName || '').toLowerCase();
        const pPhone = (appt.patient?.phone || '').toLowerCase();
        if (!pName.includes(q) && !pPhone.includes(q)) return false;
      }
      return true;
    });
  }, [todayAppointments, filterDoctorId, filterBranchId, searchQuery]);

  // Queue categorizations
  const queueItems = useMemo(() => {
    return filteredToday.filter((appt) => {
      if (queueTab === 'ALL') return true;
      if (queueTab === 'WAITING') return appt.status === 'PENDING' || appt.status === 'CONFIRMED';
      if (queueTab === 'ARRIVED') return appt.status === 'CHECKED_IN' && !appt.actualStartTime;
      if (queueTab === 'IN_TREATMENT') return appt.status === 'CHECKED_IN' && Boolean(appt.actualStartTime);
      if (queueTab === 'COMPLETED') return appt.status === 'COMPLETED';
      return true;
    });
  }, [filteredToday, queueTab]);

  // Status Badge Mapper
  const renderStatusBadge = (appt: any) => {
    if (appt.status === 'PENDING') {
      return (
        <span className="ui-badge bg-amber-100 text-amber-900 border border-amber-300">
          <Hourglass className="w-3 h-3 text-amber-700" />
          <span>{isUz ? 'Kutilmoqda' : 'В ожидании'}</span>
        </span>
      );
    }
    if (appt.status === 'CONFIRMED') {
      return (
        <span className="ui-badge bg-teal-100 text-teal-900 border border-teal-300">
          <Clock className="w-3 h-3 text-teal-700" />
          <span>{isUz ? 'Kelishi kutilmoqda' : 'Ожидается визит'}</span>
        </span>
      );
    }
    if (appt.status === 'CHECKED_IN') {
      if (appt.actualStartTime) {
        return (
          <span className="ui-badge bg-blue-100 text-blue-900 border border-blue-300">
            <Activity className="w-3 h-3 text-blue-700 animate-pulse" />
            <span>{isUz ? 'Qabulda (Kresloda)' : 'На приеме (В кресле)'}</span>
          </span>
        );
      }
      return (
        <span className="ui-badge bg-emerald-100 text-emerald-900 border border-emerald-300">
          <CheckCircle2 className="w-3 h-3 text-emerald-700" />
          <span>{isUz ? 'Keldi (Kutish zalida)' : 'Прибыл (В зале)'}</span>
        </span>
      );
    }
    if (appt.status === 'COMPLETED') {
      return (
        <span className="ui-badge bg-slate-100 text-slate-700 border border-slate-300">
          <FileCheck className="w-3 h-3 text-slate-600" />
          <span>{isUz ? 'Yakunlandi' : 'Завершено'}</span>
        </span>
      );
    }
    if (appt.status === 'CANCELLED') {
      return (
        <span className="ui-badge bg-rose-100 text-rose-800 border border-rose-300">
          <X className="w-3 h-3 text-rose-600" />
          <span>{isUz ? 'Bekor qilindi' : 'Отменено'}</span>
        </span>
      );
    }
    return (
      <span className="ui-badge bg-slate-100 text-slate-700">
        {appt.status}
      </span>
    );
  };

  // Total counts for today's summary
  const arrivedCount = todayAppointments.filter((a) => a.status === 'CHECKED_IN' && !a.actualStartTime).length;
  const inTreatmentCount = todayAppointments.filter((a) => a.status === 'CHECKED_IN' && Boolean(a.actualStartTime)).length;
  const completedTodayCount = todayAppointments.filter((a) => a.status === 'COMPLETED').length;

  if (isAuthLoading) {
    return (
      <AdminLayout allowedRoles={['OWNER', 'ADMIN', 'DOCTOR']}>
        <div className="p-16 text-center text-[#52696e] text-sm flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-[#167b78]" />
          <span>{isUz ? 'Foydalanuvchi ma\'lumotlari yuklanmoqda...' : 'Загрузка данных пользователя...'}</span>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout allowedRoles={['OWNER', 'ADMIN', 'DOCTOR']}>
      <div className="space-y-6">
        {/* Top Operational Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-[#d8e5e2] shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#167b78] bg-[#e0f2ed] px-2.5 py-0.5 rounded-md">
                {isDoctor
                  ? (isUz ? 'Shifokor xonasi' : 'Кабинет врача')
                  : (isUz ? 'Qabulxona / Administrator' : 'Регистратура / Администратор')}
              </span>
              <span suppressHydrationWarning className="text-xs text-[#52696e]">
                {formatClinicDate(new Date().toISOString(), language, { includeWeekday: true })}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-[#152f34] mt-1">
              {isDoctor
                ? `${isUz ? 'Dr.' : 'Д-р'} ${user?.fullName || user?.email.split('@')[0]}`
                : (isUz ? 'Bugungi operatsion boshqaruv' : 'Оперативное управление на сегодня')}
            </h1>
            <p className="text-xs text-[#52696e] mt-0.5">
              {isDoctor
                ? (isUz
                    ? 'Shaxsiy qabullar jadvali va sizga yo\'naltirilgan arizalar monitoringi'
                    : 'Индивидуальное расписание приемов и мониторинг направленных заявок')
                : (isUz
                    ? 'Barcha filiallar va shifokorlar bo\'yicha kunlik operatsion monitoring'
                    : 'Ежедневный операционный мониторинг по всем филиалам и врачам')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Role View Switcher */}
            <div className="flex items-center gap-1 bg-[#f3f8f7] p-1 rounded-xl border border-[#d8e5e2] text-xs">
              <span className="text-[10px] font-bold text-[#52696e] px-1.5 hidden xl:inline">
                {isUz ? 'Rol:' : 'Роль:'}
              </span>
              <button
                type="button"
                onClick={() => setRoleOverride('AUTO')}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                  roleOverride === 'AUTO'
                    ? 'bg-[#167b78] text-white shadow-xs'
                    : 'text-[#52696e] hover:text-[#152f34]'
                }`}
                title={isUz ? 'Haqiqiy rol bo\'yicha' : 'По фактической роли'}
              >
                {isUz ? 'Asl' : 'Авто'} ({user?.role || 'ADMIN'})
              </button>
              <button
                type="button"
                onClick={() => setRoleOverride('DOCTOR')}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                  effectiveRole === 'DOCTOR' && roleOverride !== 'AUTO'
                    ? 'bg-[#167b78] text-white shadow-xs'
                    : 'text-[#52696e] hover:text-[#152f34]'
                }`}
              >
                🦷 {isUz ? 'Shifokor' : 'Врач'}
              </button>
              <button
                type="button"
                onClick={() => setRoleOverride('RECEPTIONIST')}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                  effectiveRole === 'RECEPTIONIST'
                    ? 'bg-[#167b78] text-white shadow-xs'
                    : 'text-[#52696e] hover:text-[#152f34]'
                }`}
              >
                📋 {isUz ? 'Qabulxona' : 'Рецепция'}
              </button>
              <button
                type="button"
                onClick={() => setRoleOverride('OWNER')}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                  effectiveRole === 'OWNER' && roleOverride !== 'AUTO'
                    ? 'bg-[#167b78] text-white shadow-xs'
                    : 'text-[#52696e] hover:text-[#152f34]'
                }`}
              >
                💼 {isUz ? 'Rahbar' : 'Руководитель'}
              </button>
              <button
                type="button"
                onClick={() => setRoleOverride('PATIENT')}
                className={`px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                  effectiveRole === 'PATIENT'
                    ? 'bg-[#167b78] text-white shadow-xs'
                    : 'text-[#52696e] hover:text-[#152f34]'
                }`}
              >
                👤 {isUz ? 'Bemor' : 'Пациент'}
              </button>
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="px-2 py-1 rounded-lg text-xs font-bold bg-[#167b78]/10 text-[#167b78] hover:bg-[#167b78]/20 transition-all flex items-center gap-1"
                title={isUz ? "Rollarni almashtirish / Kirish" : "Смена роли / Авторизация"}
              >
                <Shield className="w-3 h-3" />
                <span className="hidden sm:inline">{isUz ? 'Kirish' : 'Вход'}</span>
              </button>
              <Link
                href="/booking"
                target="_blank"
                className="px-2 py-1 rounded-lg text-xs font-bold text-[#167b78] hover:bg-[#e0f2ed] transition-all flex items-center gap-1"
                title={isUz ? 'Bemor portali (Yangi oynada)' : 'Портал пациента (в новом окне)'}
              >
                <span>🌐</span>
                <span className="hidden xl:inline">{isUz ? 'Portal' : 'Портал'}</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>

            {/* Search Input */}
            <div className="relative min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#52696e]" />
              <input
                type="text"
                placeholder={isUz ? 'Bemor yoki telefon...' : 'Пациент или телефон...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#f3f8f7] border border-[#d8e5e2] rounded-xl text-[#152f34] focus:outline-none focus:border-[#167b78]"
              />
            </div>

            {/* Doctor Filter (if not doctor) */}
            {!isDoctor && (
              <div className="min-w-[170px]">
                <CustomSelect
                  id="admin-filter-doctor-select"
                  value={filterDoctorId}
                  onChange={(val) => setFilterDoctorId(val)}
                  placeholder={isUz ? 'Barcha shifokorlar' : 'Все врачи'}
                  options={[
                    { value: '', label: isUz ? 'Barcha shifokorlar' : 'Все врачи' },
                    ...doctors.map((d) => ({
                      value: d.id,
                      label: isUz ? `Dr. ${d.firstNameUz} ${d.lastNameUz}` : `Д-р ${d.firstNameRu || d.firstNameUz} ${d.lastNameRu || d.lastNameUz}`,
                    })),
                  ]}
                  locale={isUz ? 'uz' : 'ru'}
                />
              </div>
            )}

            {/* Refresh */}
            <button
              type="button"
              onClick={loadData}
              className="p-2 bg-[#f3f8f7] hover:bg-[#eaf5f2] text-[#152f34] rounded-xl border border-[#d8e5e2] transition-colors"
              title={isUz ? 'Yangilash' : 'Обновить'}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#167b78]' : ''}`} />
            </button>
          </div>
        </div>

        {/* Status Alerts */}
        {fetchError && (
          <div className="bg-rose-50 border border-rose-300 rounded-2xl p-4 flex items-center justify-between text-xs text-rose-900">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{fetchError}</span>
            </div>
            <button onClick={loadData} className="font-bold underline">
              {isUz ? 'Qayta urinish' : 'Повторить'}
            </button>
          </div>
        )}

        {statusFeedback && (
          <div className="bg-[#e0f2ed] border border-[#167b78]/40 rounded-2xl p-3.5 flex items-center justify-between text-xs text-[#116460] font-semibold">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#167b78] shrink-0" />
              <span>{statusFeedback}</span>
            </div>
            <button onClick={() => setStatusFeedback(null)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Owner CRM Intelligence Quick Banner */}
        {isOwner && (
          <div className="p-4 bg-gradient-to-r from-[#12353b] to-[#1a4a52] rounded-2xl text-white border border-[#245158] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#167b78] text-white flex items-center justify-center font-bold">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold">
                  {isUz ? 'Klinika Rahbari boshqaruv markazi' : 'Центр управления руководителя клиники'}
                </h3>
                <p className="text-xs text-[#b2c9ca]">
                  {isUz
                    ? 'Filiallar daromadi, shifokorlar samaradorligi va moliyaviy konversiya'
                    : 'Доход филиалов, эффективность врачей и финансовая конверсия'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/admin/analytics"
                className="px-3.5 py-2 bg-[#167b78] hover:bg-[#14bdac] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>{isUz ? 'Batafsil CRM Analitika' : 'Подробная CRM аналитика'}</span>
              </Link>
              <Link
                href="/admin/staff"
                className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold transition-colors"
              >
                {isUz ? 'Xodimlar' : 'Сотрудники'}
              </Link>
            </div>
          </div>
        )}

        {/* 4 KPI Metrics Row */}
        <div className="metric-grid">
          {/* 1: Yangi arizalar (Crucial for test: data-testid="kpi-pending-count") */}
          <div className="ui-card flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-[#52696e] block">{isUz ? 'Yangi arizalar' : 'Новые заявки'}</span>
              <p data-testid="kpi-pending-count" className="text-2xl font-black text-[#152f34] mt-0.5">
                {pendingTotal}
              </p>
              <span className="text-[11px] text-amber-700 font-medium">{isUz ? 'Tasdiqlash kutilmoqda' : 'Ожидают подтверждения'}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <BellRing className="w-5 h-5" />
            </div>
          </div>

          {/* 2: Bugungi qabullar */}
          <div className="ui-card flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-[#52696e] block">{isUz ? 'Bugungi qabullar' : 'Приемы на сегодня'}</span>
              <p className="text-2xl font-black text-[#152f34] mt-0.5">
                {todayAppointments.length}
              </p>
              <span className="text-[11px] text-[#167b78] font-medium">{isUz ? 'Jadval bo\'yicha' : 'По расписанию'}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#e0f2ed] text-[#167b78] flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
          </div>

          {/* 3: Klinikada / Navbatda */}
          <div className="ui-card flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-[#52696e] block">{isUz ? 'Klinikada hozir' : 'Сейчас в клинике'}</span>
              <p className="text-2xl font-black text-[#152f34] mt-0.5">
                {arrivedCount + inTreatmentCount}
              </p>
              <span className="text-[11px] text-blue-700 font-medium">
                {isUz
                  ? `${inTreatmentCount} qabulda, ${arrivedCount} kutmoqda`
                  : `${inTreatmentCount} на приеме, ${arrivedCount} ожидает`}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </div>
          </div>

          {/* 4: Yakunlangan */}
          <div className="ui-card flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-[#52696e] block">{isUz ? 'Yakunlandi' : 'Завершено'}</span>
              <p className="text-2xl font-black text-[#152f34] mt-0.5">
                {isDoctor ? completedDoctorCount : completedTodayCount}
              </p>
              <span className="text-[11px] text-emerald-700 font-medium">{isUz ? 'Muvaffaqiyatli' : 'Успешно'}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* WORKSPACE CONTENT: Doctor Workspace (Image 3) vs Receptionist Workspace (Image 2) */}
        {isDoctor ? (
          /* =========================================================================
             DOCTOR WORKSPACE (Image 3 Reference)
             ========================================================================= */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left 8 Cols: Patient Header, Odontogram, Treatment Plan & X-Ray Viewer (Image 3) */}
            <div className="lg:col-span-8 space-y-6">
              {/* Doctor Workspace Left Column: Patient Header + Interactive Odontogram + X-Ray Viewer */}
              {(() => {
                const activeAppt = filteredToday.find((a) => a.status === 'CHECKED_IN') || filteredToday[0];
                const patientName = activeAppt?.patient?.fullName || activeAppt?.patientName || (isUz ? 'Aziz Rahimov' : 'Азиз Рахимов');
                const patientId = activeAppt ? `#${activeAppt.id.slice(-4).toUpperCase()}` : '#8329';
                const serviceName = activeAppt
                  ? (isUz ? (activeAppt.serviceName || activeAppt.service?.nameUz) : (activeAppt.service?.nameRu || activeAppt.serviceName))
                  : (isUz ? 'Tish davolash / Molyar restavratsiyasi' : 'Лечение зуба / Реставрация моляра');

                return (
                  <>
                    {/* Patient Header Card (Image 3) */}
                    <div className="ui-card flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-4 border-l-[#167b78]">
                      <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-full bg-[#167b78] text-white flex items-center justify-center font-bold text-base shadow-sm">
                          {patientName.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-base sm:text-lg font-bold text-[#152f34]">
                              {isUz ? 'Bemor' : 'Пациент'}: {patientName} <span className="text-sm font-normal text-[#52696e]">(ID: {patientId})</span>
                            </h2>
                            {activeAppt && renderStatusBadge(activeAppt)}
                          </div>
                          <p className="text-xs text-[#52696e] mt-0.5">
                            {serviceName} • {activeAppt ? `${activeAppt.durationMinutes} ${isUz ? 'daqiqa' : 'мин'}` : (isUz ? '45 daqiqa' : '45 мин')} • DentaCare Clinic
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-center">
                        {activeAppt && !activeAppt.actualStartTime && (
                          <button
                            type="button"
                            onClick={() => handleStartTreatment(activeAppt.id)}
                            className="px-3.5 py-2 bg-[#167b78] hover:bg-[#116460] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>{isUz ? 'Muolajani boshlash' : 'Начать прием'}</span>
                          </button>
                        )}
                        {activeAppt && activeAppt.actualStartTime && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleRecordDelay(activeAppt.id)}
                              className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold"
                            >
                              {isUz ? '+15 daqiqa (Kechikish)' : '+15 минут (Задержка)'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStatusChange(activeAppt.id, 'COMPLETED')}
                              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>{isUz ? 'Yakunlash' : 'Завершить'}</span>
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="px-3.5 py-2 bg-[#f3f8f7] hover:bg-[#eaf5f2] text-[#152f34] border border-[#d8e5e2] rounded-xl text-xs font-bold"
                        >
                          {isUz ? 'Tezkor ma\'lumot' : 'Подробности'}
                        </button>
                      </div>
                    </div>

                    {/* Interactive 3D Odontogram & Live Treatment Plan (FDI 11–48 adult & 51–85 pediatric) */}
                    <InteractiveOdontogram
                      language={isUz ? 'uz' : 'ru'}
                      patientId={activeAppt?.patientId || activeAppt?.id || 'pat-101'}
                      patientName={patientName}
                      onSavePlan={() => {
                        setStatusFeedback(
                          isUz
                            ? "Davolash rejasi saqlandi va bemor hisob-fakturasi yangilandi"
                            : "План лечения сохранен и счет пациента обновлен"
                        );
                      }}
                    />

                    {/* X-Ray Image Viewer (Image 3) */}
                    <div className="ui-card bg-[#12353b] text-white border-[#245158] space-y-3">
                      <div className="flex items-center justify-between border-b border-[#245158] pb-2.5">
                        <h2 className="text-sm font-bold text-white">
                          {isUz ? 'Rentgen (X-Ray) ko\'rish oynasi' : 'Просмотр рентген-снимков (X-Ray)'}
                        </h2>
                        <div className="flex items-center gap-1 text-xs text-[#b2c9ca]">
                          <button type="button" className="p-1 hover:text-white" title={isUz ? 'Oldingi' : 'Предыдущий'}>
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <button type="button" className="p-1 hover:text-white" title={isUz ? 'Keyingi' : 'Следующий'}>
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Panoramic Dental Radiograph Visualization */}
                      <div className="relative h-40 w-full rounded-xl overflow-hidden bg-black/50 border border-[#245158] flex items-center justify-center">
                        <svg
                          viewBox="0 0 400 180"
                          className="w-full h-full object-cover transition-all"
                          style={{
                            filter: `brightness(${xrayBrightness}%) contrast(${xrayContrast}%)`,
                          }}
                        >
                          <rect width="400" height="180" fill="#081418" />
                          <ellipse cx="200" cy="110" rx="170" ry="60" fill="none" stroke="#2a454d" strokeWidth="18" opacity="0.6" />
                          <path d="M 40 120 Q 200 160 360 120" stroke="#3d626d" strokeWidth="24" fill="none" opacity="0.4" />
                          {Array.from({ length: 16 }).map((_, i) => (
                            <g key={`xray-up-${i}`}>
                              <rect x={70 + i * 16} y="55" width="12" height="28" rx="3" fill="#8cbac7" opacity="0.75" />
                              <line x1={76 + i * 16} y1="83" x2={76 + i * 16} y2="105" stroke="#a4d4e2" strokeWidth="3" opacity="0.6" />
                            </g>
                          ))}
                          {Array.from({ length: 16 }).map((_, i) => (
                            <g key={`xray-low-${i}`}>
                              <rect x={70 + i * 16} y="112" width="12" height="26" rx="3" fill="#8cbac7" opacity="0.75" />
                              <line x1={76 + i * 16} y1="95" x2={76 + i * 16} y2="112" stroke="#a4d4e2" strokeWidth="3" opacity="0.6" />
                            </g>
                          ))}
                          <rect x={134} y="55" width="12" height="14" fill="#ffffff" opacity="0.95" />
                          <circle cx="140" cy="62" r="8" fill="none" stroke="#14bdac" strokeWidth="2" strokeDasharray="3 2" />
                        </svg>
                        <span className="absolute bottom-2 left-2 text-[10px] bg-black/60 px-2 py-0.5 rounded text-[#b2c9ca]">
                          {isUz ? 'Panoramali OPG • HD' : 'Панорамный снимок ОПТГ • HD'}
                        </span>
                      </div>

                      {/* Sliders: Brightness & Contrast (Image 3) */}
                      <div className="space-y-2 pt-1 text-xs">
                        <div className="flex items-center justify-between text-[#b2c9ca] text-[11px]">
                          <span>{isUz ? 'Yorug\'lik' : 'Яркость'}</span>
                          <span className="font-mono">{xrayBrightness}%</span>
                        </div>
                        <input
                          type="range"
                          min="50"
                          max="150"
                          value={xrayBrightness}
                          onChange={(e) => setXrayBrightness(Number(e.target.value))}
                          className="w-full accent-[#14bdac] h-1.5 bg-[#245158] rounded-lg cursor-pointer"
                        />

                        <div className="flex items-center justify-between text-[#b2c9ca] text-[11px] pt-1">
                          <span>{isUz ? 'Kontrast' : 'Контраст'}</span>
                          <span className="font-mono">{xrayContrast}%</span>
                        </div>
                        <input
                          type="range"
                          min="50"
                          max="150"
                          value={xrayContrast}
                          onChange={(e) => setXrayContrast(Number(e.target.value))}
                          className="w-full accent-[#14bdac] h-1.5 bg-[#245158] rounded-lg cursor-pointer"
                        />
                      </div>
                    </div>

                    {/* Clinical Note Templates & Protocols Card */}
                    <div className="ui-card space-y-3">
                      <div className="flex items-center justify-between border-b border-[#d8e5e2] pb-2.5">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-[#167b78]" />
                          <h3 className="text-xs sm:text-sm font-bold text-[#152f34]">
                            {isUz ? 'Klinik protokol va qabul izohlari shablonlari' : 'Шаблоны клинических протоколов и заметок'}
                          </h3>
                        </div>
                        <span className="text-[10px] bg-[#e0f2ed] text-[#167b78] font-bold px-2 py-0.5 rounded-full">
                          SOAP / Standart
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {[
                          {
                            titleUz: "Boshlang'ich ko'rik",
                            titleRu: 'Первичный осмотр',
                            textUz: "Bemor shikoyati: o'tkir og'riq. Obyektiv ko'rik: emal defekti, zondlash og'riqli. Tashxis: O'tkir o'choqli pulpit.",
                          },
                          {
                            titleUz: 'Karies & Restavratsiya',
                            titleRu: 'Кариес и реставрация',
                            textUz: "Anesteziya: Ubistesin 1.7ml. Karioz bo'shliq nekroektomiyasi. Adgeziv sistema: Single Bond. Fotopolimer Filtek Z250.",
                          },
                          {
                            titleUz: 'Endodontiya (Kanal)',
                            titleRu: 'Эндодонтия (Каналы)',
                            textUz: "Anesteziya. Karioz bo'shliq ochildi. Pulpektomiya. Apekslokator 21mm. Mexanik va medikamentoz ishlov berildi (NaOCl 3%).",
                          },
                          {
                            titleUz: "Jarrohlik & Sug'urish",
                            titleRu: 'Хирургическое удаление',
                            textUz: "Infiltratsion anesteziya. Sindesmotomiya. Tish ehtiyotkorlik bilan ekstraksiya qilindi. Alveola kuretaj qilindi. Gemostaz.",
                          },
                          {
                            titleUz: 'Ortopediya / Koronka',
                            titleRu: 'Ортопедия / Коронка',
                            textUz: "Sirkoniy qoplama uchun tish yonbosh va okluzal sirtlari silliqlandi. Karotid chiziq chekkasi hosil qilindi. 2 bosqichli silikon iz olindi.",
                          },
                          {
                            titleUz: 'Periodontit terapiyasi',
                            titleRu: 'Терапия периодонтита',
                            textUz: "Ildiz kanallari tozalash va antiseptik ishlov. Yallig'lanishga qarshi kalsiy gidroksid dorisi kiritildi. Vaqtinchalik plomba.",
                          },
                        ].map((tmpl, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setStatusFeedback(
                                isUz
                                  ? `"${tmpl.titleUz}" protokoli bemor kartasiga kiritildi`
                                  : `Протокол "${tmpl.titleRu}" добавлен в карту`
                              );
                            }}
                            className="p-2.5 rounded-xl border border-[#d8e5e2] hover:border-[#167b78] hover:bg-[#f8fbfa] text-left transition-all text-xs"
                          >
                            <span className="font-bold text-[#152f34] block text-[11px]">{isUz ? tmpl.titleUz : tmpl.titleRu}</span>
                            <span className="text-[10px] text-[#52696e] line-clamp-1 mt-0.5">{tmpl.textUz}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Attachment & X-Ray Upload Preview Cards */}
                    <div className="ui-card space-y-3">
                      <div className="flex items-center justify-between border-b border-[#d8e5e2] pb-2.5">
                        <div className="flex items-center gap-2">
                          <Layers className="w-4 h-4 text-[#167b78]" />
                          <h3 className="text-xs sm:text-sm font-bold text-[#152f34]">
                            {isUz ? 'Rentgen va biriktirilgan fayllar' : 'Рентген-снимки и прикрепленные файлы'}
                          </h3>
                        </div>
                        <label className="px-2.5 py-1 bg-[#167b78] hover:bg-[#116460] text-white rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1 transition-colors">
                          <Plus className="w-3 h-3" />
                          <span>{isUz ? 'Fayl yuklash' : 'Загрузить снимок'}</span>
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={(e) => {
                              if (e.target.files && e.target.files[0]) {
                                const file = e.target.files[0];
                                setDoctorAttachments((prev) => [
                                  {
                                    id: `att-${Date.now()}`,
                                    name: file.name,
                                    type: 'Rentgen / Skaner',
                                    date: new Date().toISOString().split('T')[0],
                                  },
                                  ...prev,
                                ]);
                                setStatusFeedback(
                                  isUz ? `"${file.name}" biriktirildi` : `Снимок "${file.name}" успешно прикреплен`
                                );
                              }
                            }}
                          />
                        </label>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {doctorAttachments.map((att) => (
                          <div
                            key={att.id}
                            className="p-3 bg-[#f8fbfa] border border-[#d8e5e2] rounded-xl flex items-center justify-between text-xs hover:border-[#167b78] transition-all"
                          >
                            <div className="min-w-0 pr-2">
                              <span className="text-[9px] font-bold uppercase tracking-wider text-[#167b78] bg-[#e0f2ed] px-1.5 py-0.5 rounded">
                                {att.type}
                              </span>
                              <p className="font-bold text-[#152f34] text-xs truncate mt-1">{att.name}</p>
                              <span className="text-[10px] text-[#52696e] block">{att.date}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setStatusFeedback(isUz ? `Ko'rish rejimi: ${att.name}` : `Просмотр: ${att.name}`);
                              }}
                              className="p-1.5 text-[#167b78] hover:bg-[#e0f2ed] rounded-lg shrink-0"
                              title={isUz ? "Ko'rish" : 'Просмотреть'}
                            >
                              <ExternalLink className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Right 4 Cols: Daily Schedule (Image 3 Reference) */}
            <div className="lg:col-span-4 space-y-6">
              <div className="ui-card space-y-4">
                <div className="flex items-center justify-between border-b border-[#d8e5e2] pb-3">
                  <div>
                    <h2 className="text-base font-bold text-[#152f34]">
                      {isUz ? 'Shaxsiy qabullar jadvali' : 'Личное расписание приемов'}
                    </h2>
                    <p className="text-xs text-[#52696e]">
                      {isUz ? 'Bugun' : 'Сегодня'} — {formatClinicDate(new Date().toISOString(), language, { includeWeekday: false })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" className="p-1 hover:bg-[#f3f8f7] rounded-lg text-[#52696e]">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button type="button" className="p-1 hover:bg-[#f3f8f7] rounded-lg text-[#52696e]">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {filteredToday.length === 0 ? (
                  <p className="text-xs text-[#52696e] text-center p-6 bg-[#f3f8f7] rounded-xl border border-dashed border-[#d8e5e2]">
                    {isUz ? 'Bugungi kunga qabullar yo\'q' : 'На сегодня приемов нет'}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {filteredToday.map((appt, idx) => {
                      const isEven = idx % 2 === 0;
                      const timeStr = formatClinicTime(appt.startTime);
                      const isMutating = Boolean(mutatingMap[appt.id]);

                      return (
                        <div
                          key={appt.id}
                          className={`p-3.5 rounded-2xl border transition-all ${
                            isEven
                              ? 'bg-[#e0f2ed]/70 border-[#167b78]/30 hover:border-[#167b78]'
                              : 'bg-blue-50/70 border-blue-200 hover:border-blue-400'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-mono text-xs font-black text-[#152f34]">
                              {timeStr}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/80 text-[#152f34] border border-[#d8e5e2]">
                              {appt.durationMinutes} {isUz ? 'daqiqa' : 'мин'}
                            </span>
                          </div>
                          <h3 className="text-sm font-bold text-[#152f34]">
                            {appt.patient?.fullName || appt.patientName}
                          </h3>
                          <p className="text-xs text-[#52696e] mt-0.5">
                            {isUz
                              ? (appt.serviceName || appt.service?.nameUz || 'Stomatologik ko\'rik')
                              : (appt.service?.nameRu || appt.serviceName || 'Стоматологический осмотр')}
                          </p>

                          <div className="mt-3 pt-2 border-t border-black/5 flex items-center justify-between">
                            <div>{renderStatusBadge(appt)}</div>
                            <Link
                              href={`/admin/calendar?appointmentId=${appt.id}`}
                              className="text-xs text-[#167b78] font-bold hover:underline flex items-center gap-1"
                            >
                              <span>{isUz ? 'Batafsil' : 'Подробнее'}</span>
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : isOwner ? (
          /* =========================================================================
             CLINIC OWNER CRM & EXECUTIVE DASHBOARD (Phase 3 & 4 Requirements)
             ========================================================================= */
          <div className="space-y-6">
            {/* Owner CRM Date Filter Bar (Today / This Week / This Month / Custom) */}
            <div className="bg-white p-3.5 rounded-2xl border border-[#d8e5e2] flex flex-wrap items-center justify-between gap-3 shadow-xs">
              <div className="flex flex-wrap items-center gap-2">
                <Filter className="w-4 h-4 text-[#167b78]" />
                <span className="text-xs font-bold text-[#152f34]">
                  {isUz ? 'Davr bo\'yicha tahlil:' : 'Период анализа:'}
                </span>
                <div className="flex items-center bg-[#f3f8f7] p-1 rounded-xl border border-[#d8e5e2] text-xs">
                  {(['today', 'week', 'month', 'custom'] as const).map((filterKey) => (
                    <button
                      key={filterKey}
                      type="button"
                      onClick={() => setOwnerDateFilter(filterKey)}
                      className={`px-3 py-1 rounded-lg font-bold text-xs transition-all ${
                        ownerDateFilter === filterKey
                          ? 'bg-[#167b78] text-white shadow-xs'
                          : 'text-[#52696e] hover:text-[#152f34]'
                      }`}
                    >
                      {filterKey === 'today'
                        ? (isUz ? 'Bugun' : 'Сегодня')
                        : filterKey === 'week'
                        ? (isUz ? 'Bu hafta' : 'Эта неделя')
                        : filterKey === 'month'
                        ? (isUz ? 'Bu oy' : 'Этот месяц')
                        : (isUz ? 'Boshqa davr' : 'Период')}
                    </button>
                  ))}
                </div>
              </div>

              {ownerDateFilter === 'custom' && (
                <div className="flex items-center gap-2 text-xs">
                  <input
                    type="date"
                    value={ownerCustomStart}
                    onChange={(e) => setOwnerCustomStart(e.target.value)}
                    className="px-2.5 py-1 bg-[#f3f8f7] border border-[#d8e5e2] rounded-lg text-[#152f34] text-xs"
                  />
                  <span>—</span>
                  <input
                    type="date"
                    value={ownerCustomEnd}
                    onChange={(e) => setOwnerCustomEnd(e.target.value)}
                    className="px-2.5 py-1 bg-[#f3f8f7] border border-[#d8e5e2] rounded-lg text-[#152f34] text-xs"
                  />
                </div>
              )}
            </div>

            {/* Owner KPI Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* KPI 1: Gross Clinic Revenue */}
              <div className="ui-card flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-[#52696e] block">{isUz ? 'Jami tushum (Klinika daromadi)' : 'Общая выручка клиники'}</span>
                  <p className="text-2xl font-black text-[#152f34] mt-0.5">
                    {clinicState.invoices.reduce((acc, inv) => acc + inv.paidAmount, 0).toLocaleString()} <span className="text-xs font-bold text-[#52696e]">so'm</span>
                  </p>
                  <span className="text-[11px] text-emerald-700 font-medium">{isUz ? "Muolajalar va to'lovlar" : 'Оплаченные процедуры'}</span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <DollarSign className="w-5 h-5" />
                </div>
              </div>

              {/* KPI 2: Total Debt (Qarzlar) */}
              <div className="ui-card flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-[#52696e] block">{isUz ? 'Bemorlar qarzdorligi (Qarzlar)' : 'Задолженность пациентов'}</span>
                  <p className="text-2xl font-black text-rose-600 mt-0.5">
                    {clinicState.patients.reduce((acc, p) => acc + p.totalDebt, 0).toLocaleString()} <span className="text-xs font-bold text-[#52696e]">so'm</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => handleOpenDebtModal()}
                    className="text-[11px] text-[#167b78] hover:underline font-bold flex items-center gap-1"
                  >
                    <Wallet className="w-3 h-3" />
                    <span>{isUz ? "Qarzni to'lash" : 'Погасить долг'}</span>
                  </button>
                </div>
                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5" />
                </div>
              </div>

              {/* KPI 3: Total Active Patients */}
              <div className="ui-card flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-[#52696e] block">{isUz ? 'Ro\'yxatdagi bemorlar' : 'Всего пациентов'}</span>
                  <p className="text-2xl font-black text-[#152f34] mt-0.5">
                    {clinicState.patients.length} <span className="text-xs font-bold text-[#52696e]">{isUz ? 'nafar' : 'чел.'}</span>
                  </p>
                  <span className="text-[11px] text-teal-700 font-medium">{isUz ? '94% qayta murojaat' : '94% лояльность'}</span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-[#e0f2ed] text-[#167b78] flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
              </div>

              {/* KPI 4: Consumables Health */}
              {(() => {
                const lowStockCount = clinicState.inventory.filter((i) => i.quantity <= i.minThreshold).length;
                return (
                  <div className="ui-card flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-[#52696e] block">{isUz ? 'Sarf materiallari zaxirasi' : 'Состояние склада расходников'}</span>
                      <p className={`text-2xl font-black mt-0.5 ${lowStockCount > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {lowStockCount > 0 ? `${lowStockCount} ${isUz ? 'ta kam qoldi' : 'в дефиците'}` : (isUz ? 'Normada' : 'В норме')}
                      </p>
                      <span className="text-[11px] text-[#52696e] font-medium">
                        {lowStockCount > 0 ? (isUz ? "Zaxirani to'ldirish zarur" : 'Требуется пополнение') : (isUz ? "Barcha mahsulotlar yetarli" : 'Все позиции в достатке')}
                      </span>
                    </div>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${lowStockCount > 0 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                      <Package className="w-5 h-5" />
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Main Owner CRM Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left 7 Cols: Doctor Commission & Payouts + Consumables Inventory */}
              <div className="lg:col-span-7 space-y-6">
                {/* Card 1: Doctor Commission & Payout Calculator (Phase 3 Requirement 2) */}
                <div className="ui-card space-y-4">
                  <div className="flex items-center justify-between border-b border-[#d8e5e2] pb-3">
                    <div>
                      <h2 className="text-base font-bold text-[#152f34] flex items-center gap-2">
                        <Percent className="w-4 h-4 text-[#167b78]" />
                        <span>{isUz ? 'Shifokorlar komissiyasi va oylik daromadi' : 'Калькулятор комиссии и выплат врачам'}</span>
                      </h2>
                      <p className="text-xs text-[#52696e]">
                        {isUz
                          ? 'Bajarilgan muolajalar summasidan materiallar harajati (10%) chegirilib, shifokor ulushi (30%-50%) hisoblanadi'
                          : 'Расчет выплат врачам (30%-50%) от стоимости завершенных процедур за вычетом материалов (10%)'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {doctors.map((doc) => {
                      const docId = doc.id;
                      const currentRate = doctorCommissionRates[docId] ?? 40;
                      const earnings = clinicStore.calculateDoctorEarnings(docId);
                      const docName = isUz
                        ? `Dr. ${doc.firstNameUz} ${doc.lastNameUz}`
                        : `Др. ${doc.firstNameRu || doc.firstNameUz} ${doc.lastNameRu || doc.lastNameUz}`;

                      return (
                        <div
                          key={docId}
                          className="p-3.5 bg-[#f8fbfa] hover:bg-[#eef7f5] rounded-2xl border border-[#d8e5e2] space-y-3 transition-colors"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-[#167b78] text-white font-bold flex items-center justify-center text-sm shadow-xs">
                                {doc.firstNameUz?.charAt(0) || 'D'}
                              </div>
                              <div>
                                <h3 className="font-bold text-sm text-[#152f34]">{docName}</h3>
                                <p className="text-xs text-[#52696e]">
                                  {isUz ? (doc.specializationUz || 'Stomatolog-terapevt') : (doc.specializationRu || 'Стоматолог-терапевт')} • {earnings.completedVisits} {isUz ? 'ta muolaja' : 'процедур'}
                                </p>
                              </div>
                            </div>

                            {/* Commission Rate Selector (30% - 50%) */}
                            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-[#d8e5e2]">
                              <span className="text-xs text-[#52696e] font-semibold">{isUz ? 'Ulush:' : 'Ставка:'}</span>
                              <select
                                value={currentRate}
                                onChange={(e) => handleUpdateDoctorCommissionRate(docId, Number(e.target.value))}
                                className="text-xs font-bold text-[#167b78] bg-transparent focus:outline-none cursor-pointer"
                              >
                                <option value={30}>30%</option>
                                <option value={35}>35%</option>
                                <option value={40}>40%</option>
                                <option value={45}>45%</option>
                                <option value={50}>50%</option>
                              </select>
                            </div>
                          </div>

                          {/* Earnings Breakdown */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#d8e5e2]/60 text-xs">
                            <div className="bg-white p-2 rounded-xl border border-[#e2eeee]">
                              <span className="text-[10px] text-[#52696e] block">{isUz ? 'Jami xizmat:' : 'Валовый сбор:'}</span>
                              <strong className="text-xs text-[#152f34] block mt-0.5">
                                {earnings.grossClinicalRevenue.toLocaleString()} so'm
                              </strong>
                            </div>
                            <div className="bg-white p-2 rounded-xl border border-[#e2eeee]">
                              <span className="text-[10px] text-[#52696e] block">{isUz ? 'Material (10%):' : 'Материалы (10%):'}</span>
                              <strong className="text-xs text-amber-700 block mt-0.5">
                                -{earnings.materialCosts.toLocaleString()} so'm
                              </strong>
                            </div>
                            <div className="bg-[#e0f2ed] p-2 rounded-xl border border-[#167b78]/30">
                              <span className="text-[10px] text-[#167b78] font-bold block">{isUz ? 'Shifokorga to\'lov:' : 'Выплата врачу:'}</span>
                              <strong className="text-xs text-[#116460] block mt-0.5 font-black">
                                {earnings.doctorPayout.toLocaleString()} so'm
                              </strong>
                            </div>
                            <div className="bg-white p-2 rounded-xl border border-[#e2eeee]">
                              <span className="text-[10px] text-[#52696e] block">{isUz ? 'Klinika foydasi:' : 'Прибыль клиники:'}</span>
                              <strong className="text-xs text-emerald-700 block mt-0.5 font-bold">
                                {earnings.clinicNetProfit.toLocaleString()} so'm
                              </strong>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Card 2: Consumables Inventory Tracker & Low-Stock Alerts (Phase 3 Requirement 3) */}
                <div className="ui-card space-y-4">
                  <div className="flex items-center justify-between border-b border-[#d8e5e2] pb-3">
                    <div>
                      <h2 className="text-base font-bold text-[#152f34] flex items-center gap-2">
                        <Package className="w-4 h-4 text-[#167b78]" />
                        <span>{isUz ? 'Sarf materiallari va qoldiq monitoringi' : 'Склад расходных материалов и мониторинг'}</span>
                      </h2>
                      <p className="text-xs text-[#52696e]">
                        {isUz
                          ? 'Minimal me\'yordan past bo\'lgan materiallar avtomatik qizil ogohlantirish beradi'
                          : 'Позиции ниже минимального порога автоматически подсвечиваются предупреждением'}
                      </p>
                    </div>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#e0f2ed] text-[#167b78]">
                      {clinicState.inventory.length} {isUz ? 'ta tovar' : 'позиций'}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {clinicState.inventory.map((item) => {
                      const isLow = item.quantity <= item.minThreshold;
                      const pct = Math.min(100, Math.round((item.quantity / (item.minThreshold * 2.5)) * 100));

                      return (
                        <div
                          key={item.id}
                          className={`p-3 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                            isLow
                              ? 'bg-rose-50/70 border-rose-300'
                              : 'bg-white border-[#d8e5e2] hover:bg-[#f8fbfa]'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold text-xs sm:text-sm text-[#152f34] truncate">
                                {isUz ? item.nameUz : item.nameRu}
                              </h3>
                              {isLow ? (
                                <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white font-bold text-[10px] animate-pulse">
                                  {isUz ? 'Kam qoldi!' : 'Мало!'}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                                  {isUz ? 'Yetarli' : 'Норма'}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-[#52696e] mt-0.5">
                              {isUz ? 'Kategoriya:' : 'Категория:'} <span className="font-semibold">{item.category}</span> • {isUz ? 'Minimal chegara:' : 'Мин. порог:'}{' '}
                              <strong>{item.minThreshold} {item.unit}</strong>
                            </p>

                            {/* Stock progress */}
                            <div className="w-full h-1.5 bg-black/5 rounded-full overflow-hidden mt-2 max-w-xs">
                              <div
                                className={`h-full rounded-full ${isLow ? 'bg-rose-600' : 'bg-[#167b78]'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                            <div className="text-right">
                              <span className="text-xs font-black text-[#152f34]">
                                {item.quantity} {item.unit}
                              </span>
                              <span className="text-[10px] text-[#52696e] block">
                                {item.costPerUnit.toLocaleString()} so'm/{item.unit}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleDeductInventory(item.id, 1)}
                                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold border border-slate-300 transition-colors"
                                title={isUz ? "1 ta sarflash" : 'Списать 1'}
                              >
                                -1
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRestockInventory(item.id, 10)}
                                className="px-3 py-1.5 bg-[#167b78] hover:bg-[#116460] text-white rounded-xl text-xs font-bold shadow-2xs flex items-center gap-1 transition-colors"
                                title={isUz ? "10 ta qo'shish" : 'Добавить 10'}
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>+10</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right 5 Cols: Debt Registry & Recent Payments */}
              <div className="lg:col-span-5 space-y-6">
                {/* Card 3: Debt Registry ("Qarz Daftari" - Phase 3 Requirement 1) */}
                <div className="ui-card space-y-4">
                  <div className="flex items-center justify-between border-b border-[#d8e5e2] pb-3">
                    <div>
                      <h2 className="text-base font-bold text-[#152f34] flex items-center gap-2">
                        <Wallet className="w-4 h-4 text-rose-600" />
                        <span>{isUz ? 'Qarz daftari ("Qarzlar")' : 'Книга задолженностей'}</span>
                      </h2>
                      <p className="text-xs text-[#52696e]">
                        {isUz ? 'Klinikadan qarzi bor bemorlar ro\'yxati va to\'lov qabul qilish' : 'Список пациентов с долгом и прием оплат'}
                      </p>
                    </div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                      {clinicState.patients.filter((p) => p.totalDebt > 0).length} {isUz ? 'bemor' : 'пац.'}
                    </span>
                  </div>

                  {clinicState.patients.filter((p) => p.totalDebt > 0).length === 0 ? (
                    <div className="p-8 text-center text-[#52696e] space-y-2 bg-[#f3f8f7] rounded-xl border border-dashed border-[#d8e5e2]">
                      <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-600" />
                      <p className="text-xs font-semibold">
                        {isUz ? 'Klinikada muddati o\'tgan qarzlar yo\'q!' : 'У клиники нет задолженностей!'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                      {clinicState.patients
                        .filter((p) => p.totalDebt > 0)
                        .map((patient) => (
                          <div
                            key={patient.id}
                            className="p-3 bg-white hover:bg-rose-50/40 rounded-2xl border border-rose-200 flex items-center justify-between gap-3 shadow-2xs transition-all"
                          >
                            <div className="min-w-0">
                              <p className="font-bold text-xs text-[#152f34] truncate">{patient.fullName}</p>
                              <p className="text-[11px] font-mono text-[#52696e]">{patient.phone}</p>
                              <p className="text-xs font-black text-rose-600 mt-0.5">
                                {isUz ? 'Qarz:' : 'Долг:'} {patient.totalDebt.toLocaleString()} so'm
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleOpenDebtModal(patient.id)}
                              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1 shrink-0 transition-colors"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              <span>{isUz ? "To'lash" : 'Погасить'}</span>
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* Card 4: Recent Payments Stream */}
                <div className="ui-card space-y-4">
                  <div className="flex items-center justify-between border-b border-[#d8e5e2] pb-3">
                    <div>
                      <h2 className="text-base font-bold text-[#152f34] flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>{isUz ? 'So\'nggi to\'lovlar va kassa' : 'Недавние платежи и касса'}</span>
                      </h2>
                      <p className="text-xs text-[#52696e]">
                        {isUz ? 'Naqd, Uzcard/Humo, Payme va Click orqali tushumlar' : 'Поступления через Наличные, Карты, Payme и Click'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {clinicState.invoices
                      .flatMap((inv) => inv.payments.map((p) => ({ ...p, patientName: inv.patientName })))
                      .slice(0, 6)
                      .map((pay) => (
                        <div
                          key={pay.id}
                          className="p-2.5 bg-[#f8fbfa] rounded-xl border border-[#d8e5e2] flex items-center justify-between text-xs"
                        >
                          <div>
                            <p className="font-bold text-[#152f34]">{pay.patientName}</p>
                            <span className="text-[10px] text-[#52696e]">
                              {formatClinicTime(pay.createdAt)} • {pay.paymentMethod}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-xs text-emerald-700 block">
                              +{pay.amount.toLocaleString()} so'm
                            </span>
                            <span className="text-[10px] text-slate-500">{pay.notes || (isUz ? 'Qabul' : 'Прием')}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : isPatient ? (
          /* =========================================================================
             PATIENT PORTAL DASHBOARD (Phase 2 & Phase 3 Cross-Role Sync)
             ========================================================================= */
          <div className="space-y-6">
            {/* Patient Header & Quick Patient Switcher */}
            {(() => {
              const activePatient =
                clinicState.patients.find((p) => p.id === activePatientPortalId) ||
                clinicState.patients[0];
              const patAppt = clinicState.appointments.find(
                (a) => a.patientId === activePatient?.id || a.patientPhone === activePatient?.phone
              );

              return (
                <>
                  <div className="ui-card bg-gradient-to-r from-[#12353b] to-[#1a4a52] text-white border-[#245158] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-[#167b78] text-white flex items-center justify-center font-black text-xl shadow-md shrink-0">
                        {activePatient?.fullName.charAt(0) || 'B'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase font-bold tracking-wider bg-[#167b78] px-2 py-0.5 rounded text-white">
                            {isUz ? 'Bemor portali' : 'Портал пациента'}
                          </span>
                          <span className="text-xs text-[#b2c9ca] font-mono">
                            ID: {activePatient?.id}
                          </span>
                        </div>
                        <h2 className="text-xl font-black text-white mt-0.5">
                          {activePatient?.fullName}
                        </h2>
                        <p className="text-xs text-[#b2c9ca] mt-0.5">
                          📞 {activePatient?.phone} • {isUz ? 'Tug‘ilgan sana:' : 'Дата рождения:'}{' '}
                          {activePatient?.birthDate || '1992-05-14'}
                        </p>
                      </div>
                    </div>

                    {/* Quick Demo Switch to another patient */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                      <div className="bg-white/10 p-2 rounded-xl text-xs">
                        <span className="text-[10px] text-[#b2c9ca] block mb-1">
                          {isUz ? 'Bemor almashtirish (Demo):' : 'Переключить пациента (Демо):'}
                        </span>
                        <select
                          value={activePatientPortalId}
                          onChange={(e) => setActivePatientPortalId(e.target.value)}
                          className="bg-[#12353b] text-white text-xs font-bold px-2 py-1 rounded-lg border border-[#245158] focus:outline-none cursor-pointer"
                        >
                          {clinicState.patients.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.fullName} ({p.phone})
                            </option>
                          ))}
                        </select>
                      </div>

                      <Link
                        href="/booking"
                        target="_blank"
                        className="px-4 py-2.5 bg-[#14bdac] hover:bg-[#11998b] text-[#12353b] font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-all shrink-0"
                      >
                        <CalendarCheck className="w-4 h-4" />
                        <span>{isUz ? 'Yangi qabulga yozilish' : 'Записаться на прием'}</span>
                      </Link>
                    </div>
                  </div>

                  {/* Real-time Queue & Chair Status Indicator */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Status Card */}
                    <div className="ui-card md:col-span-2 flex flex-col justify-between">
                      <div className="flex items-center justify-between border-b border-[#d8e5e2] pb-3">
                        <div className="flex items-center gap-2">
                          <Activity className="w-5 h-5 text-[#167b78]" />
                          <h3 className="text-sm font-bold text-[#152f34]">
                            {isUz ? 'Hozirgi qabul va kreslo holati' : 'Текущий статус визита и кресла'}
                          </h3>
                        </div>
                        <span className="text-xs text-[#52696e]">
                          {formatClinicDate(new Date().toISOString(), language, { includeWeekday: true })}
                        </span>
                      </div>

                      <div className="py-4">
                        {patAppt ? (
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-[#f8fbfa] border border-[#d8e5e2]">
                            <div>
                              <div className="flex items-center gap-2 mb-1.5">
                                {patAppt.status === 'IN_TREATMENT' || (patAppt.status === 'CHECKED_IN' && patAppt.actualStartTime) ? (
                                  <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-900 border border-blue-300 font-extrabold text-xs flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                                    <span>{isUz ? '🟢 Siz hozir shifokor kreslosidasiz' : '🟢 Вы находитесь в кресле стоматолога'}</span>
                                  </span>
                                ) : patAppt.status === 'CHECKED_IN' ? (
                                  <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-xs flex items-center gap-1.5">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                                    <span>{isUz ? '🟡 Siz kutish zalidasiz (Keling, xush kelibsiz!)' : '🟡 Вы в зале ожидания (Добро пожаловать!)'}</span>
                                  </span>
                                ) : patAppt.status === 'COMPLETED' ? (
                                  <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-300 font-bold text-xs">
                                    {isUz ? '✅ Bugungi muolaja muvaffaqiyatli yakunlandi' : '✅ Прием успешно завершен'}
                                  </span>
                                ) : (
                                  <span className="px-3 py-1 rounded-full bg-teal-100 text-teal-900 border border-teal-300 font-bold text-xs">
                                    {isUz ? '🔵 Qabulingiz tasdiqlangan va rejalashtirilgan' : '🔵 Прием подтвержден и запланирован'}
                                  </span>
                                )}
                              </div>
                              <h4 className="font-bold text-sm text-[#152f34] mt-1">
                                {patAppt.serviceName}
                              </h4>
                              <p className="text-xs text-[#52696e] mt-0.5">
                                {isUz ? 'Shifokor:' : 'Врач:'} {patAppt.doctorName} • {isUz ? 'Boshlanish vaqti:' : 'Время:'}{' '}
                                <strong className="text-[#152f34]">{formatClinicTime(patAppt.startTime)}</strong> ({patAppt.durationMinutes} {isUz ? 'daqiqa' : 'мин'})
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <span className="text-[10px] text-[#52696e] block">{isUz ? 'Filial:' : 'Филиал:'}</span>
                              <strong className="text-xs text-[#152f34] block">{patAppt.branchName || 'DentaCare Markaziy'}</strong>
                            </div>
                          </div>
                        ) : (
                          <div className="p-6 text-center bg-[#f8fbfa] rounded-2xl border border-dashed border-[#d8e5e2] text-xs text-[#52696e]">
                            <p className="font-semibold text-sm text-[#152f34]">
                              {isUz ? 'Bugungi kunga rejalashtirilgan qabulingiz yo‘q' : 'На сегодня у вас нет запланированных визитов'}
                            </p>
                            <p className="text-[11px] mt-1 text-[#52696e]">
                              {isUz
                                ? 'Tishlar salomatligi uchun profilaktik ko‘rikka yoziling'
                                : 'Запишитесь на профилактический осмотр для поддержания здоровья зубов'}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="pt-3 border-t border-[#d8e5e2] flex items-center justify-between text-xs text-[#52696e]">
                        <span>{isUz ? 'Allergiya va eslatmalar:' : 'Аллергии и противопоказания:'}</span>
                        <span className="font-bold text-rose-600">
                          {activePatient?.allergies && activePatient.allergies.length > 0
                            ? activePatient.allergies.join(', ')
                            : (isUz ? "Allergiya yo'q" : 'Аллергий не зафиксировано')}
                        </span>
                      </div>
                    </div>

                    {/* Debt & Billing Balance Card */}
                    <div className="ui-card flex flex-col justify-between border-t-4 border-t-rose-500">
                      <div>
                        <div className="flex items-center justify-between border-b border-[#d8e5e2] pb-3">
                          <h3 className="text-sm font-bold text-[#152f34]">
                            {isUz ? 'Moliyaviy hisob-kitob' : 'Финансовый расчет'}
                          </h3>
                          <Wallet className="w-4 h-4 text-rose-600" />
                        </div>

                        <div className="py-4 space-y-3">
                          <div>
                            <span className="text-xs text-[#52696e] block">{isUz ? 'Qarzdorlik holati ("Qarzlar"):' : 'Текущий долг:'}</span>
                            <p className={`text-2xl font-black mt-0.5 ${activePatient?.totalDebt && activePatient.totalDebt > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                              {(activePatient?.totalDebt || 0).toLocaleString()} <span className="text-xs font-bold text-[#52696e]">so'm</span>
                            </p>
                          </div>

                          <div className="bg-[#f8fbfa] p-2.5 rounded-xl border border-[#d8e5e2] text-xs">
                            <span className="text-[10px] text-[#52696e] block">{isUz ? 'Jami to‘langan:' : 'Всего оплачено:'}</span>
                            <strong className="text-xs text-emerald-700 block">
                              {(activePatient?.totalPaid || 0).toLocaleString()} so'm
                            </strong>
                          </div>
                        </div>
                      </div>

                      {activePatient?.totalDebt && activePatient.totalDebt > 0 ? (
                        <button
                          type="button"
                          onClick={() => handleOpenDebtModal(activePatient.id)}
                          className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs transition-colors"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>{isUz ? "Qarzni to'lash (Payme / Click / Karta)" : 'Погасить долг (Payme / Click / Карта)'}</span>
                        </button>
                      ) : (
                        <div className="p-2.5 bg-emerald-50 text-emerald-800 rounded-xl text-center text-xs font-bold border border-emerald-200">
                          {isUz ? "Sizda qarz mavjud emas. Rahmat!" : "У вас нет задолженностей. Спасибо!"}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Patient Interactive Odontogram Chart & Treatment Plan */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-[#d8e5e2] pb-2">
                      <div>
                        <h3 className="text-base font-extrabold text-[#152f34]">
                          {isUz ? 'Sizning tish xaritangiz va davolash rejasi' : 'Ваша зубная карта и план лечения'}
                        </h3>
                        <p className="text-xs text-[#52696e]">
                          {isUz
                            ? 'Shifokor tomonidan belgilangan holatlar va muolaja narxlari'
                            : 'Состояние зубов и стоимость назначенных врачом процедур'}
                        </p>
                      </div>
                    </div>

                    <InteractiveOdontogram
                      language={isUz ? 'uz' : 'ru'}
                      patientId={activePatient?.id || 'pat-101'}
                      patientName={activePatient?.fullName || 'Bemor'}
                      onSavePlan={() => {
                        setStatusFeedback(
                          isUz ? "Davolash rejasi yangilandi" : "План лечения обновлен"
                        );
                      }}
                    />
                  </div>
                </>
              );
            })()}
          </div>
        ) : (
          /* =========================================================================
             RECEPTIONIST / ADMIN WORKSPACE (Image 2 Reference: DentalCare OS)
             ========================================================================= */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Column 1 (5 cols): Daily Appointment Calendar (Image 2) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="ui-card space-y-4">
                <div className="flex items-center justify-between border-b border-[#d8e5e2] pb-3">
                  <div>
                    <h2 className="text-base font-extrabold text-[#152f34]">
                      {isUz ? 'Kunlik qabullar taqvimi' : 'Ежедневный календарь приемов'}
                    </h2>
                    <p suppressHydrationWarning className="text-xs text-[#52696e]">
                      {formatClinicDate(new Date().toISOString(), language, { includeWeekday: false })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button type="button" className="p-1 hover:bg-[#f3f8f7] rounded-lg text-[#52696e]">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-bold text-[#167b78] bg-[#e0f2ed] px-2 py-0.5 rounded-md">
                      {isUz ? 'Bugun' : 'Сегодня'}
                    </span>
                    <button type="button" className="p-1 hover:bg-[#f3f8f7] rounded-lg text-[#52696e]">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {filteredToday.length === 0 ? (
                  <div className="p-12 text-center text-[#52696e] space-y-2 bg-[#f3f8f7] rounded-xl border border-dashed border-[#d8e5e2]">
                    <Calendar className="w-8 h-8 mx-auto text-[#b2c9ca]" />
                    <p className="text-xs font-semibold">
                      {isUz ? 'Bugungi kunga qabullar topilmadi' : 'На сегодня приемов не найдено'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredToday.map((appt, idx) => {
                      const timeStart = formatClinicTime(appt.startTime);
                      const timeEnd = formatClinicTime(appt.endTime);
                      const isMutating = Boolean(mutatingMap[appt.id]);
                      const isTeal = idx % 2 === 0;

                      return (
                        <div
                          key={appt.id}
                          className={`p-3.5 rounded-2xl border transition-all ${
                            isTeal
                              ? 'bg-[#167b78] text-white border-[#116460] shadow-xs'
                              : 'bg-[#2563eb] text-white border-blue-700 shadow-xs'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs opacity-90 mb-1">
                            <span className="font-mono font-bold">{timeStart} — {timeEnd}</span>
                            <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px] font-bold">
                              {appt.durationMinutes} {isUz ? 'daq' : 'мин'}
                            </span>
                          </div>
                          <h3 className="text-sm font-bold text-white">
                            {appt.patient?.fullName || appt.patientName}
                          </h3>
                          <p className="text-xs text-white/80 mt-0.5">
                            {(isUz ? (appt.serviceName || appt.service?.nameUz) : (appt.service?.nameRu || appt.serviceName || appt.service?.nameUz))} • {isUz ? 'Dr.' : 'Др.'} {(isUz ? appt.doctor?.firstNameUz : (appt.doctor?.firstNameRu || appt.doctor?.firstNameUz)) || ''}
                          </p>

                          <div className="mt-3 pt-2 border-t border-white/20 flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              {appt.status === 'CONFIRMED' && (
                                <button
                                  type="button"
                                  disabled={isMutating}
                                  onClick={() => handleStatusChange(appt.id, 'CHECKED_IN')}
                                  className="px-2.5 py-1 bg-white text-[#167b78] rounded-lg text-[11px] font-bold shadow-xs hover:bg-slate-100"
                                >
                                  {isUz ? 'Keldi' : 'Прибыл'}
                                </button>
                              )}
                              {appt.status === 'CHECKED_IN' && !appt.actualStartTime && (
                                <button
                                  type="button"
                                  disabled={isMutating}
                                  onClick={() => handleStartTreatment(appt.id)}
                                  className="px-2.5 py-1 bg-white text-blue-700 rounded-lg text-[11px] font-bold shadow-xs hover:bg-slate-100 flex items-center gap-1"
                                >
                                  <Play className="w-3 h-3 fill-current" />
                                  <span>{isUz ? 'Qabul' : 'Прием'}</span>
                                </button>
                              )}
                              {appt.status === 'CHECKED_IN' && appt.actualStartTime && (
                                <button
                                  type="button"
                                  disabled={isMutating}
                                  onClick={() => handleStatusChange(appt.id, 'COMPLETED')}
                                  className="px-2.5 py-1 bg-emerald-500 text-white rounded-lg text-[11px] font-bold shadow-xs hover:bg-emerald-600"
                                >
                                  {isUz ? 'Yakunlash' : 'Завершить'}
                                </button>
                              )}
                              {appt.status === 'COMPLETED' && (
                                <span className="px-2.5 py-1 bg-emerald-600/90 text-white rounded-lg text-[11px] font-bold shadow-xs flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>{isUz ? 'Yakunlangan' : 'Завершено'}</span>
                                </span>
                              )}
                            </div>

                            <Link
                              href={`/admin/calendar?appointmentId=${appt.id}`}
                              className="text-[11px] text-white/90 hover:text-white underline font-medium"
                            >
                              {isUz ? 'Tafsilotlar' : 'Подробнее'}
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Column 2 (4 cols): Check-In Queue (Image 2) */}
            <div className="lg:col-span-4 space-y-4">
              <div className="ui-card space-y-4">
                <div className="flex items-center justify-between border-b border-[#d8e5e2] pb-3">
                  <div>
                    <h2 className="text-base font-extrabold text-[#152f34]">
                      {isUz ? 'Bemorlar navbati' : 'Очередь пациентов'}
                    </h2>
                    <p className="text-xs text-[#52696e]">
                      {isUz ? 'Klinikada navbatdagi bemorlar' : 'Пациенты в очереди клиники'}
                    </p>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#e0f2ed] text-[#167b78]">
                    {queueItems.length} {isUz ? 'nafar' : 'чел.'}
                  </span>
                </div>

                {/* Queue Tabs */}
                <div className="flex items-center gap-1 bg-[#f3f8f7] p-1 rounded-xl text-xs overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setQueueTab('ALL')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                      queueTab === 'ALL' ? 'bg-white text-[#152f34] shadow-xs' : 'text-[#52696e]'
                    }`}
                  >
                    {isUz ? 'Barchasi' : 'Все'} ({filteredToday.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setQueueTab('ARRIVED')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                      queueTab === 'ARRIVED' ? 'bg-white text-[#152f34] shadow-xs' : 'text-[#52696e]'
                    }`}
                  >
                    {isUz ? 'Kutmoqda' : 'Ожидают'} ({arrivedCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setQueueTab('IN_TREATMENT')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                      queueTab === 'IN_TREATMENT' ? 'bg-white text-[#152f34] shadow-xs' : 'text-[#52696e]'
                    }`}
                  >
                    {isUz ? 'Kresloda' : 'В кресле'} ({inTreatmentCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setQueueTab('COMPLETED')}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                      queueTab === 'COMPLETED' ? 'bg-white text-[#152f34] shadow-xs' : 'text-[#52696e]'
                    }`}
                  >
                    {isUz ? 'Tugallanganlar' : 'Завершенные'} ({completedTodayCount})
                  </button>
                </div>

                {queueItems.length === 0 ? (
                  <p className="text-xs text-[#52696e] text-center p-6 bg-[#f3f8f7] rounded-xl border border-dashed border-[#d8e5e2]">
                    {isUz ? 'Hozirda navbatda bemorlar yo\'q' : 'Сейчас в очереди нет пациентов'}
                  </p>
                ) : (
                  <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                    {queueItems.slice(0, 15).map((item) => {
                      const isWaiting = item.status === 'CHECKED_IN' && !item.actualStartTime;
                      const isInChair = item.status === 'CHECKED_IN' && Boolean(item.actualStartTime);
                      const isCompleted = item.status === 'COMPLETED';

                      return (
                        <div
                          key={item.id}
                          className="p-3 bg-white hover:bg-[#f8fbfa] rounded-2xl border border-[#d8e5e2] flex items-center justify-between gap-3 shadow-2xs transition-all"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-full bg-[#e0f2ed] text-[#167b78] flex items-center justify-center font-bold text-sm shrink-0">
                              {(item.patient?.fullName || item.patientName || 'B').charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-xs text-[#152f34] truncate">
                                {item.patient?.fullName || item.patientName}
                              </p>
                              <p className="text-[11px] text-[#52696e] truncate">
                                {isUz
                                  ? (item.serviceName || item.service?.nameUz || 'Ko\'rik')
                                  : (item.service?.nameRu || item.serviceName || 'Осмотр')}
                              </p>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {isInChair ? (
                              <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 font-bold text-[11px] flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                                <span>{isUz ? 'Kresloda' : 'В кресле'}</span>
                              </span>
                            ) : isWaiting ? (
                              <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-bold text-[11px]">
                                {isUz ? 'Kutmoqda' : 'Ожидает'}
                              </span>
                            ) : isCompleted ? (
                              <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px] flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600 inline" />
                                <span>{isUz ? 'Tugallandi' : 'Завершено'}</span>
                              </span>
                            ) : item.status === 'CONFIRMED' ? (
                              <span className="px-2.5 py-1 rounded-full bg-teal-100 text-teal-800 font-bold text-[11px]">
                                {isUz ? 'Kutilmoqda' : 'Ожидается'}
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 font-bold text-[11px]">
                                {item.status}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Column 3 (3 cols): Quick Patient Registration & Billing Status (Image 2) */}
            <div className="lg:col-span-3 space-y-6">
              {/* Card 1: Quick Patient Registration (Image 2) */}
              <div className="ui-card space-y-3.5">
                <div className="border-b border-[#d8e5e2] pb-2.5 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-[#152f34]">
                      {isUz ? 'Tezkor bemor ro\'yxatga olish' : 'Быстрая регистрация пациента'}
                    </h2>
                    <p className="text-[11px] text-[#52696e]">
                      {isUz ? 'Bemor kelganda navbatga qo\'shish' : 'Добавить пациента в очередь при визите'}
                    </p>
                  </div>
                  {savedAppointmentSummary && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                      {isUz ? 'Muvaffaqiyatli' : 'Успешно'}
                    </span>
                  )}
                </div>

                {regSuccessMsg && (
                  <div
                    role="status"
                    aria-live="polite"
                    className="p-2.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{regSuccessMsg}</span>
                  </div>
                )}
                {regErrorMsg && (
                  <div
                    role="alert"
                    aria-live="assertive"
                    className="p-2.5 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-800 font-semibold flex items-center gap-2"
                  >
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{regErrorMsg}</span>
                  </div>
                )}

                {savedAppointmentSummary ? (
                  /* Saved Appointment Summary Card */
                  <div className="space-y-3 text-xs">
                    <div className="p-3 bg-[#e0f2ed]/60 rounded-xl border border-[#167b78]/30 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#152f34]">
                          {savedAppointmentSummary.patient?.fullName || savedAppointmentSummary.patientName}
                        </span>
                        <span className="text-[10px] font-mono text-[#52696e]">
                          {savedAppointmentSummary.patient?.phone || savedAppointmentSummary.patientPhone}
                        </span>
                      </div>

                      <div className="text-[11px] text-[#52696e] space-y-1 pt-1 border-t border-black/5">
                        <p>
                          <strong className="text-[#152f34]">{isUz ? 'Vaqt:' : 'Время:'}</strong>{' '}
                          {formatClinicDate(savedAppointmentSummary.startTime, language, { includeWeekday: false })}{' '}
                          <span className="font-mono font-bold text-[#167b78]">
                            {formatClinicTime(savedAppointmentSummary.startTime)} — {formatClinicTime(savedAppointmentSummary.endTime)}
                          </span>
                        </p>
                        <p>
                          <strong className="text-[#152f34]">{isUz ? 'Shifokor:' : 'Врач:'}</strong>{' '}
                          {savedAppointmentSummary.doctorName ||
                            (selectedDoctorObjForReg
                              ? `${isUz ? 'Dr.' : 'Др.'} ${isUz ? `${selectedDoctorObjForReg.firstNameUz} ${selectedDoctorObjForReg.lastNameUz}` : `${selectedDoctorObjForReg.firstNameRu || selectedDoctorObjForReg.firstNameUz} ${selectedDoctorObjForReg.lastNameRu || selectedDoctorObjForReg.lastNameUz}`}`
                              : '')}
                        </p>
                        <p>
                          <strong className="text-[#152f34]">{isUz ? 'Xizmat:' : 'Услуга:'}</strong>{' '}
                          {savedAppointmentSummary.serviceName ||
                            (selectedServiceObj ? (isUz ? selectedServiceObj.nameUz : (selectedServiceObj.nameRu || selectedServiceObj.nameUz)) : '')}
                        </p>
                        <p>
                          <strong className="text-[#152f34]">{isUz ? 'Filial:' : 'Филиал:'}</strong>{' '}
                          {savedAppointmentSummary.branchName ||
                            (selectedBranchObjForReg ? (isUz ? selectedBranchObjForReg.nameUz : (selectedBranchObjForReg.nameRu || selectedBranchObjForReg.nameUz)) : '')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <Link
                        href={`/admin/calendar?appointmentId=${savedAppointmentSummary.id}`}
                        className="flex-1 ui-button ui-button--primary text-xs font-bold justify-center"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>{isUz ? 'Taqvimda ko\'rish' : 'Смотреть в календаре'}</span>
                      </Link>
                      <button
                        type="button"
                        onClick={handleResetQuickReg}
                        className="px-3 py-2 bg-[#f3f8f7] hover:bg-[#eaf5f2] text-[#152f34] border border-[#d8e5e2] rounded-xl text-xs font-bold"
                      >
                        {isUz ? 'Yangi bemor' : 'Новый'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleQuickRegister} className="space-y-2.5 text-xs">
                    <div>
                      <label className="text-[11px] font-bold text-[#52696e] block mb-1">
                        {isUz ? 'F.I.Sh.' : 'Ф.И.О. пациента'}
                      </label>
                      <input
                        type="text"
                        placeholder={isUz ? "Masalan: Rustam Aliyev" : "Например: Рустам Алиев"}
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        className="ui-input text-xs"
                        required
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-[#52696e] block mb-1">
                        {isUz ? 'Telefon raqami' : 'Номер телефона'}
                      </label>
                      <PhoneInput
                        value={regPhone}
                        onChange={(val) => setRegPhone(val)}
                        className="text-xs"
                        required
                      />
                    </div>

                    {branches.length > 1 ? (
                      <div>
                        <label className="text-[11px] font-bold text-[#52696e] block mb-1">
                          {isUz ? 'Filial' : 'Филиал'} <span className="text-red-500">*</span>
                        </label>
                        <CustomSelect
                          id="admin-quickreg-branch-select"
                          value={regBranchId}
                          onChange={(val) => handleBranchSelect(val)}
                          placeholder={isUz ? 'Filialni tanlang' : 'Выберите филиал'}
                          options={branches.map((b) => ({
                            value: b.id,
                            label: isUz ? b.nameUz : (b.nameRu || b.nameUz),
                          }))}
                          locale={isUz ? 'uz' : 'ru'}
                        />
                      </div>
                    ) : branches.length === 1 ? (
                      <div className="p-2 bg-[#f3f8f7] border border-[#d8e5e2] rounded-xl flex items-center justify-between text-xs">
                        <span className="text-[#52696e] text-[11px] font-medium">{isUz ? 'Filial:' : 'Филиал:'}</span>
                        <span className="font-bold text-[#152f34] text-[11px]">
                          {isUz ? branches[0].nameUz : (branches[0].nameRu || branches[0].nameUz)}
                        </span>
                      </div>
                    ) : null}

                    <div>
                      <label className="text-[11px] font-bold text-[#52696e] block mb-1">
                        {isUz ? 'Shifokor' : 'Врач'} <span className="text-red-500">*</span>
                      </label>
                      <CustomSelect
                        id="admin-quickreg-doctor-select"
                        value={regDoctorId}
                        onChange={(val) => handleDoctorSelect(val)}
                        placeholder={isUz ? 'Shifokorni tanlang' : 'Выберите врача'}
                        options={availableDoctorsForReg.map((d) => ({
                          value: d.id,
                          label: `${isUz ? 'Dr.' : 'Др.'} ${isUz ? `${d.firstNameUz} ${d.lastNameUz}` : `${d.firstNameRu || d.firstNameUz} ${d.lastNameRu || d.lastNameUz}`}`,
                        }))}
                        locale={isUz ? 'uz' : 'ru'}
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-[#52696e] block mb-1">
                        {isUz ? 'Xizmat' : 'Услуга'} <span className="text-red-500">*</span>
                      </label>
                      <CustomSelect
                        id="admin-quickreg-service-select"
                        value={regServiceId}
                        onChange={(val) => handleServiceSelect(val)}
                        placeholder={isUz ? 'Xizmatni tanlang' : 'Выберите услугу'}
                        options={availableServicesForReg.map((s) => ({
                          value: s.id,
                          label: isUz ? s.nameUz : (s.nameRu || s.nameUz),
                        }))}
                        locale={isUz ? 'uz' : 'ru'}
                      />
                      {regDoctorId && availableServicesForReg.length === 0 && (
                        <div className="p-2 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 mt-1">
                          {isUz
                            ? 'Ushbu shifokorga xizmatlar biriktirilmagan. Qabulga yozish uchun avval shifokorga xizmat biriktiring.'
                            : 'У выбранного врача нет прикрепленных услуг. Прикрепите услуги для записи.'}
                        </div>
                      )}
                    </div>

                    {/* Duration, Buffer & Price Estimate */}
                    {selectedServiceObj && (
                      <div className="p-2 bg-[#f8fbfa] border border-[#d8e5e2] rounded-xl text-[11px] text-[#52696e] flex items-center justify-between">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-[#167b78]" />
                          <span>
                            ~{regSlotQuote?.durationMinutes ?? selectedServiceObj.durationMinutes} {isUz ? 'daq' : 'мин'}
                            {' '}(+{regSlotQuote?.bufferMinutes ?? selectedServiceObj.bufferMinutes ?? 5} {isUz ? 'oraliq' : 'буфер'})
                          </span>
                        </span>
                        <span className="font-bold text-[#152f34]">
                          {((regSlotQuote?.priceFrom ?? selectedServiceObj.priceFrom) || 0).toLocaleString()} {isUz ? 'so\'m' : 'сум'}
                        </span>
                      </div>
                    )}

                    {/* Server-Authoritative Available Slots Selection */}
                    {regDoctorId && regServiceId && regBranchId && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-[#52696e]">
                            {isUz ? 'Bugungi bo\'sh vaqt' : 'Свободное время на сегодня'}
                          </label>
                          {!isLoadingSlots && (
                            <button
                              type="button"
                              onClick={() => setSlotRefreshSeq((s) => s + 1)}
                              className="text-[10px] text-[#167b78] hover:underline flex items-center gap-1 font-bold"
                              title={isUz ? 'Vaqtlarni yangilash' : 'Обновить слоты'}
                            >
                              <RefreshCw className="w-2.5 h-2.5" />
                              <span>{isUz ? 'Yangilash' : 'Обновить'}</span>
                            </button>
                          )}
                        </div>

                        {isLoadingSlots ? (
                          <div className="p-2.5 bg-[#f3f8f7] rounded-xl text-[11px] text-[#52696e] flex items-center gap-2">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#167b78]" />
                            <span>{isUz ? 'Bo\'sh vaqtlar tekshirilmoqda...' : 'Проверка свободных слотов...'}</span>
                          </div>
                        ) : slotFetchError ? (
                          <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-[11px] text-red-800 flex items-center justify-between gap-2">
                            <span>{slotFetchError}</span>
                            <button
                              type="button"
                              onClick={() => setSlotRefreshSeq((s) => s + 1)}
                              className="px-2 py-1 bg-red-100 hover:bg-red-200 text-red-900 rounded font-bold text-[10px] shrink-0"
                            >
                              {isUz ? 'Qayta urinish' : 'Повторить'}
                            </button>
                          </div>
                        ) : regSlots.length === 0 ? (
                          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 space-y-1.5">
                            <p>
                              {isUz
                                ? 'Bugungi kunga bo\'sh vaqt mavjud emas.'
                                : 'На сегодня нет свободного времени.'}
                            </p>
                            <Link
                              href="/admin/calendar"
                              className="inline-flex items-center gap-1 font-bold text-[#167b78] hover:underline text-[11px]"
                            >
                              <Calendar className="w-3.5 h-3.5" />
                              <span>{isUz ? 'Taqvimda boshqa kunlarni ko\'rish' : 'Смотреть другие даты в календаре'}</span>
                            </Link>
                          </div>
                        ) : (
                          <CustomSelect
                            id="admin-quickreg-slot-select"
                            value={regSelectedSlot}
                            onChange={(val) => setRegSelectedSlot(val)}
                            placeholder={isUz ? 'Vaqtni tanlang' : 'Выберите время'}
                            options={regSlots.map((slot, idx) => {
                              const tStr = formatClinicTime(slot.startTime);
                              const isFirst = idx === 0;
                              return {
                                value: slot.startTime,
                                label: `${tStr} ${isFirst ? (isUz ? '(Eng yaqin)' : '(Ближайшее)') : ''}`,
                              };
                            })}
                            locale={isUz ? 'uz' : 'ru'}
                          />
                        )}
                      </div>
                    )}

                    {/* Explicit staff-recorded patient consent */}
                    <label className="flex items-start gap-2 cursor-pointer pt-1">
                      <input
                        type="checkbox"
                        checked={regConsentGiven}
                        onChange={(e) => setRegConsentGiven(e.target.checked)}
                        className="mt-0.5 rounded text-[#167b78] focus:ring-[#167b78]"
                        required
                      />
                      <span className="text-[11px] text-[#52696e] font-medium leading-tight">
                        {isUz
                          ? 'Bemor roziligi og\'zaki olindi (xodim tomonidan tasdiqlangan)'
                          : 'Согласие пациента получено устно (подтверждено сотрудником)'}
                      </span>
                    </label>

                    <button
                      type="submit"
                      disabled={
                        isSubmittingReg ||
                        isLoadingSlots ||
                        !regSelectedSlot ||
                        !regConsentGiven ||
                        regSlots.length === 0 ||
                        availableServicesForReg.length === 0
                      }
                      className="w-full ui-button ui-button--primary text-xs font-bold mt-2 disabled:opacity-50"
                    >
                      <Plus className="w-4 h-4" />
                      <span>
                        {isSubmittingReg
                          ? (isUz ? 'Qo\'shilmoqda...' : 'Добавление...')
                          : (isUz ? 'Navbatga qo\'shish' : 'Добавить в очередь')}
                      </span>
                    </button>
                  </form>
                )}
              </div>

              {/* Card 2: Billing Status & Debt Action (Phase 3 Requirement 1) */}
              <div className="ui-card space-y-3.5">
                <div className="flex items-center justify-between border-b border-[#d8e5e2] pb-2.5">
                  <div>
                    <h2 className="text-sm font-bold text-[#152f34]">
                      {isUz ? 'Hisob-kitob va Qarzlar' : 'Статус оплаты и долги'}
                    </h2>
                    <span className="text-[11px] text-[#52696e]">
                      {isUz ? 'Bemorlar hisob-fakturalari' : 'Счета пациентов'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenDebtModal()}
                    className="text-xs text-rose-600 font-bold hover:underline flex items-center gap-1"
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    <span>{isUz ? "Qarz to'lash" : 'Погасить'}</span>
                  </button>
                </div>

                {/* Total Clinic Debt Pill */}
                {(() => {
                  const totalDebt = clinicState.patients.reduce((acc, p) => acc + p.totalDebt, 0);
                  return (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[10px] text-rose-800 font-bold uppercase block">
                          {isUz ? 'Jami qarzlar:' : 'Общий долг:'}
                        </span>
                        <span className="text-xs font-black text-rose-900">{totalDebt.toLocaleString()} so'm</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenDebtModal()}
                        className="px-2.5 py-1 bg-rose-600 text-white rounded-lg text-[11px] font-bold shadow-2xs hover:bg-rose-700"
                      >
                        {isUz ? "To'lash" : 'Погасить'}
                      </button>
                    </div>
                  );
                })()}

                {/* Live Invoices list */}
                <div className="space-y-2 text-xs">
                  {clinicState.invoices.slice(0, 3).map((inv) => (
                    <div key={inv.id} className="p-2.5 bg-[#f8fbfa] rounded-xl border border-[#d8e5e2] flex items-center justify-between">
                      <div className="min-w-0 pr-2">
                        <p className="font-bold text-[#152f34] truncate">{inv.patientName}</p>
                        <span className="text-[10px] text-[#52696e] block truncate">
                          {inv.procedures[0]?.nameUz || (isUz ? 'Stomatologik muolaja' : 'Стоматологическая процедура')}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded-full font-bold text-[10px] block mb-0.5 ${
                            inv.status === 'PAID'
                              ? 'bg-emerald-100 text-emerald-800'
                              : inv.status === 'PARTIALLY_PAID'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {inv.status === 'PAID'
                            ? (isUz ? "To'langan" : 'Оплачено')
                            : inv.status === 'PARTIALLY_PAID'
                            ? (isUz ? 'Qisman' : 'Частично')
                            : (isUz ? 'Kutilmoqda' : 'В ожидании')}
                        </span>
                        <strong className="text-xs text-[#152f34]">
                          {inv.totalAmount.toLocaleString()} {isUz ? "so'm" : "сум"}
                        </strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Cancellation Modal */}
        {cancellationTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fade-in"
            role="dialog"
            aria-modal="true"
          >
            <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-[#d8e5e2] space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#152f34]">
                    {isUz ? 'Qabulni bekor qilish' : 'Отмена записи на прием'}
                  </h3>
                  <p className="text-xs text-[#52696e]">
                    {isUz ? 'Haqiqatan ham ushbu qabulni bekor qilmoqchimisiz?' : 'Вы действительно хотите отменить эту запись на прием?'}
                  </p>
                </div>
              </div>

              <div className="p-3 bg-[#f3f8f7] rounded-xl border border-[#d8e5e2] text-xs space-y-1 text-[#152f34]">
                <div>
                  <span className="text-[#52696e]">{isUz ? 'Bemor: ' : 'Пациент: '}</span>
                  <strong>{cancellationTarget.patient?.fullName || cancellationTarget.patientName}</strong>
                </div>
                <div>
                  <span className="text-[#52696e]">{isUz ? 'Vaqti: ' : 'Время: '}</span>
                  <span>{formatClinicTime(cancellationTarget.startTime)}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCancellationTarget(null)}
                  className="px-4 py-2 border border-[#d8e5e2] text-[#152f34] rounded-xl text-xs font-semibold hover:bg-[#f3f8f7]"
                >
                  {isUz ? 'Yopish' : 'Закрыть'}
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChange(cancellationTarget.id, 'CANCELLED')}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold"
                >
                  {isUz ? 'Ha, bekor qilinsin' : 'Да, отменить'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Debt Repayment Modal ("Qarzni to'lash" - Phase 3 Requirement 1) */}
        {debtModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in"
            role="dialog"
            aria-modal="true"
          >
            <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-[#d8e5e2] space-y-4">
              <div className="flex items-center justify-between border-b border-[#d8e5e2] pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#152f34]">
                      {isUz ? "Bemor qarzini so'ndirish" : 'Погашение долга пациента'}
                    </h3>
                    <p className="text-xs text-[#52696e]">
                      {isUz ? 'Qarzlar daftari orqali to\'lov qabul qilish' : 'Прием оплаты по книге задолженностей'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDebtModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {debtSuccessMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{debtSuccessMsg}</span>
                </div>
              )}
              {debtErrorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-800 font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{debtErrorMsg}</span>
                </div>
              )}

              <form onSubmit={handleRepayDebtSubmit} className="space-y-3.5 text-xs">
                {/* Select Patient with Debt */}
                <div>
                  <label className="text-[11px] font-bold text-[#52696e] block mb-1">
                    {isUz ? 'Qarzdor bemor' : 'Пациент с долгом'} <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={debtPatientId}
                    onChange={(e) => {
                      const pId = e.target.value;
                      setDebtPatientId(pId);
                      const pat = clinicState.patients.find((p) => p.id === pId);
                      if (pat) setDebtAmount(pat.totalDebt);
                    }}
                    className="w-full px-3 py-2 bg-[#f3f8f7] border border-[#d8e5e2] rounded-xl text-[#152f34] focus:outline-none focus:border-[#167b78] font-medium"
                    required
                  >
                    <option value="">{isUz ? 'Bemorni tanlang' : 'Выберите пациента'}</option>
                    {clinicState.patients
                      .filter((p) => p.totalDebt > 0)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.fullName} ({p.phone}) — {isUz ? 'Qarz:' : 'Долг:'} {p.totalDebt.toLocaleString()} so'm
                        </option>
                      ))}
                  </select>
                </div>

                {/* Repayment Amount */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-[#52696e]">
                      {isUz ? "To'lov summasi (so'm)" : 'Сумма оплаты (сум)'} <span className="text-red-500">*</span>
                    </label>
                    {(() => {
                      const activePat = clinicState.patients.find((p) => p.id === debtPatientId);
                      return activePat ? (
                        <span className="text-[10px] text-rose-600 font-bold">
                          {isUz ? 'Jami qarz:' : 'Всего долг:'} {activePat.totalDebt.toLocaleString()} so'm
                        </span>
                      ) : null;
                    })()}
                  </div>
                  <input
                    type="number"
                    min={1000}
                    step={10000}
                    value={debtAmount || ''}
                    onChange={(e) => setDebtAmount(Number(e.target.value))}
                    placeholder="500000"
                    className="w-full px-3 py-2 bg-[#f3f8f7] border border-[#d8e5e2] rounded-xl text-[#152f34] font-mono font-bold focus:outline-none focus:border-[#167b78]"
                    required
                  />
                </div>

                {/* Quick Amount Chips */}
                {(() => {
                  const activePat = clinicState.patients.find((p) => p.id === debtPatientId);
                  if (!activePat || activePat.totalDebt <= 0) return null;
                  return (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      <button
                        type="button"
                        onClick={() => setDebtAmount(activePat.totalDebt)}
                        className="px-2.5 py-1 bg-[#e0f2ed] hover:bg-[#cbeae3] text-[#116460] rounded-lg text-[10px] font-bold"
                      >
                        {isUz ? "To'liq (100%)" : 'Полностью (100%)'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDebtAmount(Math.round(activePat.totalDebt / 2))}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-[10px] font-semibold"
                      >
                        50%
                      </button>
                      <button
                        type="button"
                        onClick={() => setDebtAmount(Math.min(activePat.totalDebt, 300000))}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-[10px] font-semibold"
                      >
                        300 000
                      </button>
                      <button
                        type="button"
                        onClick={() => setDebtAmount(Math.min(activePat.totalDebt, 500000))}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-[10px] font-semibold"
                      >
                        500 000
                      </button>
                    </div>
                  );
                })()}

                {/* Payment Method Selector */}
                <div>
                  <label className="text-[11px] font-bold text-[#52696e] block mb-1.5">
                    {isUz ? "To'lov usuli (Barcha to'lov tizimlari)" : 'Способ оплаты (Все платежные системы)'}
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {[
                      { id: 'CASH' as PaymentMethod, label: isUz ? 'Naqd' : 'Наличные', icon: '💵' },
                      { id: 'UZCARD' as PaymentMethod, label: 'Uzcard', icon: '💳' },
                      { id: 'HUMO' as PaymentMethod, label: 'Humo', icon: '💳' },
                      { id: 'PAYME' as PaymentMethod, label: 'Payme', icon: '📱' },
                      { id: 'CLICK' as PaymentMethod, label: 'Click', icon: '⚡' },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setDebtMethod(m.id)}
                        className={`p-2 rounded-xl border text-center transition-all ${
                          debtMethod === m.id
                            ? 'bg-[#167b78] text-white border-[#116460] shadow-2xs font-bold'
                            : 'bg-[#f3f8f7] text-[#52696e] border-[#d8e5e2] hover:bg-[#eaf5f2]'
                        }`}
                      >
                        <span className="block text-sm mb-0.5">{m.icon}</span>
                        <span className="text-[10px] block leading-tight">{m.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="text-[11px] font-bold text-[#52696e] block mb-1">
                    {isUz ? 'Izoh' : 'Примечание'}
                  </label>
                  <input
                    type="text"
                    value={debtNotes}
                    onChange={(e) => setDebtNotes(e.target.value)}
                    placeholder={isUz ? "Qarz to'lovi izohi..." : "Примечание к оплате..."}
                    className="w-full px-3 py-2 bg-[#f3f8f7] border border-[#d8e5e2] rounded-xl text-[#152f34] focus:outline-none focus:border-[#167b78]"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#d8e5e2]">
                  <button
                    type="button"
                    onClick={() => setDebtModalOpen(false)}
                    className="px-4 py-2 border border-[#d8e5e2] text-[#152f34] rounded-xl text-xs font-semibold hover:bg-[#f3f8f7]"
                  >
                    {isUz ? 'Yopish' : 'Закрыть'}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#167b78] hover:bg-[#116460] text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{isUz ? "To'lovni tasdiqlash" : 'Подтвердить оплату'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Role Switching / Auth Demo Modal */}
        {authModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in"
            role="dialog"
            aria-modal="true"
          >
            <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-[#d8e5e2] space-y-4">
              <div className="flex items-center justify-between border-b border-[#d8e5e2] pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#e0f2ed] text-[#167b78] flex items-center justify-center font-bold">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#152f34]">
                      {isUz ? 'Foydalanuvchi roli va avtorizatsiya (Demo)' : 'Роль пользователя и авторизация (Демо)'}
                    </h3>
                    <p className="text-xs text-[#52696e]">
                      {isUz ? 'Tizimni 4 xil rol nigohi bilan sinovdan o\'tkazing' : 'Тестируйте систему от лица 4 ролей'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAuthModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Patient */}
                <button
                  type="button"
                  onClick={() => {
                    setRoleOverride('PATIENT');
                    setActivePatientPortalId('pat-101');
                    setAuthModalOpen(false);
                    setStatusFeedback(isUz ? "Bemor roli faollashtirildi (Aziz Rahimov)" : "Активирована роль пациента (Азиз Рахимов)");
                  }}
                  className={`p-3.5 rounded-2xl border text-left transition-all ${
                    effectiveRole === 'PATIENT' ? 'border-[#167b78] bg-[#e0f2ed]/50 shadow-xs' : 'border-[#d8e5e2] hover:bg-[#f8fbfa]'
                  }`}
                >
                  <span className="text-xl">👤</span>
                  <h4 className="font-bold text-xs text-[#152f34] mt-1">{isUz ? 'Bemor' : 'Пациент'}</h4>
                  <p className="text-[10px] text-[#52696e] mt-0.5">Aziz Rahimov (+998 90 123 45 67)</p>
                  <span className="inline-block mt-2 text-[9px] font-bold text-[#167b78] bg-white px-2 py-0.5 rounded border border-[#d8e5e2]">
                    {isUz ? 'Odontogramma, qarz, qabul' : 'Карта, долг, визиты'}
                  </span>
                </button>

                {/* 2. Receptionist */}
                <button
                  type="button"
                  onClick={() => {
                    setRoleOverride('RECEPTIONIST');
                    setAuthModalOpen(false);
                    setStatusFeedback(isUz ? "Qabulxona administratori roli faollashtirildi" : "Активирована роль регистратора");
                  }}
                  className={`p-3.5 rounded-2xl border text-left transition-all ${
                    effectiveRole === 'RECEPTIONIST' ? 'border-[#167b78] bg-[#e0f2ed]/50 shadow-xs' : 'border-[#d8e5e2] hover:bg-[#f8fbfa]'
                  }`}
                >
                  <span className="text-xl">📋</span>
                  <h4 className="font-bold text-xs text-[#152f34] mt-1">{isUz ? 'Qabulxona (Resepshn)' : 'Регистратура'}</h4>
                  <p className="text-[10px] text-[#52696e] mt-0.5">Nilufar Qosimova</p>
                  <span className="inline-block mt-2 text-[9px] font-bold text-[#167b78] bg-white px-2 py-0.5 rounded border border-[#d8e5e2]">
                    {isUz ? 'Navbat, ro\'yxat, kassa' : 'Очередь, слоты, касса'}
                  </span>
                </button>

                {/* 3. Dentist */}
                <button
                  type="button"
                  onClick={() => {
                    setRoleOverride('DOCTOR');
                    setAuthModalOpen(false);
                    setStatusFeedback(isUz ? "Shifokor-stomatolog roli faollashtirildi (Dr. Aziz Karimov)" : "Активирована роль врача (Др. Азиз Каримов)");
                  }}
                  className={`p-3.5 rounded-2xl border text-left transition-all ${
                    effectiveRole === 'DOCTOR' ? 'border-[#167b78] bg-[#e0f2ed]/50 shadow-xs' : 'border-[#d8e5e2] hover:bg-[#f8fbfa]'
                  }`}
                >
                  <span className="text-xl">🦷</span>
                  <h4 className="font-bold text-xs text-[#152f34] mt-1">{isUz ? 'Shifokor-stomatolog' : 'Врач-стоматолог'}</h4>
                  <p className="text-[10px] text-[#52696e] mt-0.5">Dr. Aziz Karimov (Terapevt)</p>
                  <span className="inline-block mt-2 text-[9px] font-bold text-[#167b78] bg-white px-2 py-0.5 rounded border border-[#d8e5e2]">
                    {isUz ? 'Odontogramma, rentgen, reja' : 'Карта, X-Ray, лечение'}
                  </span>
                </button>

                {/* 4. Owner */}
                <button
                  type="button"
                  onClick={() => {
                    setRoleOverride('OWNER');
                    setAuthModalOpen(false);
                    setStatusFeedback(isUz ? "Klinika rahbari (Owner) roli faollashtirildi" : "Активирована роль руководителя клиники");
                  }}
                  className={`p-3.5 rounded-2xl border text-left transition-all ${
                    effectiveRole === 'OWNER' ? 'border-[#167b78] bg-[#e0f2ed]/50 shadow-xs' : 'border-[#d8e5e2] hover:bg-[#f8fbfa]'
                  }`}
                >
                  <span className="text-xl">💼</span>
                  <h4 className="font-bold text-xs text-[#152f34] mt-1">{isUz ? 'Klinika Rahbari' : 'Руководитель (Owner)'}</h4>
                  <p className="text-[10px] text-[#52696e] mt-0.5">Bosh shifokor / Klinika egasi</p>
                  <span className="inline-block mt-2 text-[9px] font-bold text-[#167b78] bg-white px-2 py-0.5 rounded border border-[#d8e5e2]">
                    {isUz ? 'CRM, komissiya, zaxira, qarz' : 'CRM, комиссия, склад, долг'}
                  </span>
                </button>
              </div>

              <div className="pt-3 border-t border-[#d8e5e2] flex items-center justify-between text-xs">
                <span className="text-[#52696e]">
                  {isUz ? 'Joriy faol rol:' : 'Текущая роль:'} <strong className="text-[#167b78]">{effectiveRole}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setRoleOverride('AUTO');
                    setAuthModalOpen(false);
                  }}
                  className="px-3 py-1.5 rounded-xl border border-[#d8e5e2] hover:bg-[#f3f8f7] text-xs font-bold text-[#152f34]"
                >
                  {isUz ? 'Asl rolga qaytish' : 'Сбросить на оригинал'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
