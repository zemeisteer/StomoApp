'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  BellRing,
  X,
  Search,
  Activity,
  BarChart3,
  Wallet,
  Check,
  FileCheck,
  Hourglass,
} from 'lucide-react';
import { AdminLayout } from '../../components/AdminLayout';
import { CustomSelect } from '../../components/CustomSelect';
import { DoctorWorkspace } from '../../components/admin/DoctorWorkspace';
import { OwnerWorkspace } from '../../components/admin/OwnerWorkspace';
import { ReceptionWorkspace } from '../../components/admin/ReceptionWorkspace';
import { api } from '../../lib/api';
import { useAuth, StaffRole } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { formatClinicDate, formatClinicTime, getClinicTodayDateString } from '../../lib/dateFormat';
import { normalizeUzPhone } from '../../lib/phone';

export default function AdminOverviewPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { language } = useI18n();
  const isUz = language === 'uz';

  // Appointments State
  const [todayAppointments, setTodayAppointments] = useState<any[]>([]);
  const [pendingTotal, setPendingTotal] = useState<number>(0);
  const [upcomingAppointments, setUpcomingAppointments] = useState<any[]>([]);
  const [completedDoctorCount, setCompletedDoctorCount] = useState<number>(0);

  // Fixtures for quick registration & filters
  const [doctors, setDoctors] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);

  // Real server clinical/billing data
  const [serverInvoices, setServerInvoices] = useState<any[]>([]);
  const [serverDebts, setServerDebts] = useState<any[]>([]);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDoctorId, setFilterDoctorId] = useState('');
  const [filterBranchId, setFilterBranchId] = useState('');
  const [queueTab, setQueueTab] = useState<'ALL' | 'ARRIVED' | 'IN_TREATMENT' | 'COMPLETED'>('ALL');

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

  // Doctor Workspace State
  const [selectedTooth, setSelectedTooth] = useState<number>(14);
  const [xrayBrightness, setXrayBrightness] = useState<number>(100);
  const [xrayContrast, setXrayContrast] = useState<number>(100);
  const [doctorAttachments] = useState<Array<{ id: string; name: string; type: string; date: string }>>([
    { id: 'att-1', name: 'Panoramik rentgen (OPG HD)', type: 'OPG', date: '2026-10-30' },
    { id: 'att-2', name: 'Periapikal rentgen (#14 tish)', type: 'Periapical', date: '2026-10-31' },
    { id: 'att-3', name: '3D KT Tomografiya segmenti', type: 'CBCT', date: '2026-10-25' },
  ]);

  // Doctor commission rates (Owner Workspace)
  const [doctorCommissionRates, setDoctorCommissionRates] = useState<Record<string, number>>({});

  // Debt Repayment Modal State (Reception / Admin)
  const [debtModalOpen, setDebtModalOpen] = useState(false);
  const [debtPatientId, setDebtPatientId] = useState<string>('');
  const [debtAmount, setDebtAmount] = useState<number>(0);
  const [debtMethod, setDebtMethod] = useState<'CASH' | 'CARD' | 'TRANSFER' | 'OTHER'>('CASH');
  const [debtNotes, setDebtNotes] = useState<string>('');
  const [debtSuccessMsg, setDebtSuccessMsg] = useState<string | null>(null);
  const [debtErrorMsg, setDebtErrorMsg] = useState<string | null>(null);

  const loadReqSeqRef = useRef<number>(0);
  const feedbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Staff Role (Strictly derived from authenticated login credentials - fail-closed)
  const effectiveRole = user?.role;
  const isDoctor = effectiveRole === 'DOCTOR';
  const isOwner = effectiveRole === 'OWNER';

  // Load Fixtures
  useEffect(() => {
    let active = true;
    const fetchFixtures = async () => {
      try {
        const [docs, brs, svcs, comms] = await Promise.all([
          api.getDoctors().catch(() => []),
          api.getBranches().catch(() => []),
          api.getServices().catch(() => []),
          isOwner ? api.getDoctorCommissions().catch(() => []) : Promise.resolve([]),
        ]);
        if (active) {
          setDoctors(Array.isArray(docs) ? docs : []);
          setBranches(Array.isArray(brs) ? brs : []);
          setServices(Array.isArray(svcs) ? svcs : []);
          if (Array.isArray(comms) && comms.length > 0) {
            const rateMap: Record<string, number> = {};
            comms.forEach((c: any) => {
              rateMap[c.doctorId] = c.percentage;
            });
            setDoctorCommissionRates(rateMap);
          }
          if (Array.isArray(brs) && brs.length === 1) {
            setRegBranchId(brs[0].id);
          }
        }
      } catch {
        // Handled silently
      }
    };
    fetchFixtures();
    return () => {
      active = false;
    };
  }, [isOwner]);

  // Main Data Loader
  const loadData = useCallback(async () => {
    const seq = ++loadReqSeqRef.current;
    setIsLoading(true);
    setFetchError(null);

    const todayDateStr = getClinicTodayDateString();
    try {
      const pendingPromise = api.getAdminAppointments({
        status: 'PENDING',
        page: 1,
        limit: 10,
      }).catch(() => ({ data: [], total: 0 }));

      const todayPromise = api.getAdminAppointments({
        startDate: todayDateStr,
        endDate: todayDateStr,
        limit: 100,
      }).catch(() => ({ data: [], total: 0 }));

      const upcomingPromise = api.getAdminAppointments({
        limit: 20,
      }).catch(() => ({ data: [], total: 0 }));

      const invoicesPromise = api.getInvoices().catch(() => []);
      const debtsPromise = api.getDebts().catch(() => []);

      const [pendingRes, todayRes, upcomingRes, invRes, debtRes] = await Promise.all([
        pendingPromise,
        todayPromise,
        upcomingPromise,
        invoicesPromise,
        debtsPromise,
      ]);

      if (seq !== loadReqSeqRef.current) return;

      setPendingTotal(pendingRes.total || 0);
      const todayList = todayRes.data || [];
      setTodayAppointments(todayList);
      setUpcomingAppointments(upcomingRes.data || []);
      setServerInvoices(Array.isArray(invRes) ? invRes : []);
      setServerDebts(Array.isArray(debtRes) ? debtRes : debtRes?.items || []);

      if (isDoctor && user?.doctorId) {
        const docCompleted = todayList.filter(
          (a: any) => a.doctorId === user.doctorId && a.status === 'COMPLETED'
        ).length;
        setCompletedDoctorCount(docCompleted);
      }
    } catch (err: any) {
      if (seq === loadReqSeqRef.current) {
        setFetchError(err?.message || (isUz ? 'Ma\'lumotlarni yuklashda xatolik yuz berdi' : 'Ошибка при загрузке данных'));
      }
    } finally {
      if (seq === loadReqSeqRef.current) {
        setIsLoading(false);
      }
    }
  }, [isDoctor, user, isUz]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Status Change Handler
  const handleStatusChange = async (appointmentId: string, nextStatus: string) => {
    setMutatingMap((prev) => ({ ...prev, [appointmentId]: nextStatus }));
    try {
      await api.updateAppointmentStatus(appointmentId, nextStatus);
      setStatusFeedback(
        isUz
          ? `Qabul holati muvaffaqiyatli "${nextStatus}"ga o'zgartirildi`
          : `Статус приема успешно изменен на "${nextStatus}"`
      );
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = setTimeout(() => setStatusFeedback(null), 4000);
      await loadData();
    } catch (err: any) {
      setStatusFeedback(
        err?.message || (isUz ? 'Holatni o\'zgartirishda xatolik' : 'Ошибка изменения статуса')
      );
    } finally {
      setMutatingMap((prev) => {
        const next = { ...prev };
        delete next[appointmentId];
        return next;
      });
      setCancellationTarget(null);
    }
  };

  const handleStartTreatment = async (appointmentId: string) => {
    setMutatingMap((prev) => ({ ...prev, [appointmentId]: 'IN_TREATMENT' }));
    try {
      await api.startAppointmentTreatment(appointmentId);
      setStatusFeedback(
        isUz
          ? 'Bemor kresloga olindi va davolanish vaqti hisoblana boshladi'
          : 'Пациент принят в кресло, начался учет времени приема'
      );
      await loadData();
    } catch (err: any) {
      setStatusFeedback(err?.message || (isUz ? 'Xatolik yuz berdi' : 'Произошла ошибка'));
    } finally {
      setMutatingMap((prev) => {
        const next = { ...prev };
        delete next[appointmentId];
        return next;
      });
    }
  };

  const handleRecordDelay = async (appointmentId: string) => {
    try {
      await api.recordAppointmentDelay(appointmentId, 15);
      setStatusFeedback(
        isUz
          ? 'Qabul 15 daqiqaga uzaytirildi va keyingi slotlar yangilandi'
          : 'Прием продлен на 15 минут, последующие слоты скорректированы'
      );
      await loadData();
    } catch (err: any) {
      setStatusFeedback(err?.message || (isUz ? 'Xatolik yuz berdi' : 'Произошла ошибка'));
    }
  };

  // Quick Registration Handlers
  const availableDoctorsForReg = useMemo(() => {
    if (!regBranchId) return doctors;
    return doctors.filter((d) => !d.branchId || d.branchId === regBranchId);
  }, [doctors, regBranchId]);

  const selectedDoctorObjForReg = useMemo(() => {
    return doctors.find((d) => d.id === regDoctorId) || null;
  }, [doctors, regDoctorId]);

  const availableServicesForReg = useMemo(() => {
    if (!selectedDoctorObjForReg) return services;
    if (Array.isArray(selectedDoctorObjForReg.doctorServices) && selectedDoctorObjForReg.doctorServices.length > 0) {
      const allowedIds = new Set(selectedDoctorObjForReg.doctorServices.map((ds: any) => ds.serviceId));
      return services.filter((s) => allowedIds.has(s.id));
    }
    return services;
  }, [selectedDoctorObjForReg, services]);

  const selectedServiceObj = useMemo(() => {
    return services.find((s) => s.id === regServiceId) || null;
  }, [services, regServiceId]);

  const selectedBranchObjForReg = useMemo(() => {
    return branches.find((b) => b.id === regBranchId) || null;
  }, [branches, regBranchId]);

  const handleBranchSelect = (branchId: string) => {
    setRegBranchId(branchId);
    if (regDoctorId) {
      const doc = doctors.find((d) => d.id === regDoctorId);
      if (doc?.branchId && doc.branchId !== branchId) {
        setRegDoctorId('');
        setRegServiceId('');
      }
    }
    setRegSelectedSlot('');
    setRegSlots([]);
  };

  const handleDoctorSelect = (docId: string) => {
    setRegDoctorId(docId);
    const doc = doctors.find((d) => d.id === docId);
    if (doc?.branchId && !regBranchId) {
      setRegBranchId(doc.branchId);
    }
    if (doc && Array.isArray(doc.doctorServices) && doc.doctorServices.length > 0) {
      const allowedIds = new Set(doc.doctorServices.map((ds: any) => ds.serviceId));
      if (regServiceId && !allowedIds.has(regServiceId)) {
        setRegServiceId('');
      }
    }
    setRegSelectedSlot('');
    setRegSlots([]);
  };

  const handleServiceSelect = (serviceId: string) => {
    setRegServiceId(serviceId);
    setRegSelectedSlot('');
    setRegSlots([]);
  };

  // Slots Fetcher for Quick Reg
  useEffect(() => {
    if (!regDoctorId || !regServiceId || !regBranchId) {
      setRegSlots([]);
      setRegSlotQuote(null);
      setIsLoadingSlots(false);
      setSlotFetchError(null);
      return;
    }

    let active = true;
    const fetchSlots = async () => {
      setIsLoadingSlots(true);
      setSlotFetchError(null);
      try {
        const todayStr = getClinicTodayDateString();
        const res = await api.getAvailableSlots(regDoctorId, todayStr, regServiceId);
        if (active) {
          const slots = (res.slots || []).filter((s: any) => s.available);
          setRegSlots(slots);
          setRegSlotQuote({
            durationMinutes: res.durationMinutes,
            bufferMinutes: res.bufferMinutes,
            priceFrom: res.priceFrom,
          });
          if (slots.length > 0 && !regSelectedSlot) {
            setRegSelectedSlot(slots[0].startTime);
          }
        }
      } catch (err: any) {
        if (active) {
          setSlotFetchError(
            err?.message || (isUz ? 'Bo\'sh vaqtlarni olishda xatolik yuz berdi' : 'Ошибка при получении слотов')
          );
        }
      } finally {
        if (active) setIsLoadingSlots(false);
      }
    };

    fetchSlots();
    return () => {
      active = false;
    };
  }, [regDoctorId, regServiceId, regBranchId, slotRefreshSeq, isUz, regSelectedSlot]);

  const handleResetQuickReg = () => {
    setSavedAppointmentSummary(null);
    setRegName('');
    setRegPhone('+998 ');
    setRegSelectedSlot('');
    setRegConsentGiven(false);
    setRegSuccessMsg(null);
    setRegErrorMsg(null);
    setRegIdempotencyKey(`quick_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    setSlotRefreshSeq((s) => s + 1);
  };

  const handleQuickRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim() || !regPhone || !regDoctorId || !regServiceId || !regBranchId || !regSelectedSlot) {
      setRegErrorMsg(isUz ? 'Barcha majburiy maydonlarni to\'ldiring' : 'Заполните все обязательные поля');
      return;
    }

    const phoneCheck = normalizeUzPhone(regPhone, true);
    if (!phoneCheck.isValid || !phoneCheck.normalized) {
      setRegErrorMsg(phoneCheck.errorMessageUz || (isUz ? 'Telefon raqami noto\'g\'ri kiritilgan' : 'Некорректный номер телефона'));
      return;
    }

    setIsSubmittingReg(true);
    setRegErrorMsg(null);
    try {
      const created = await api.createAppointmentAdmin({
        doctorId: regDoctorId,
        serviceIds: [regServiceId],
        branchId: regBranchId,
        startTime: regSelectedSlot,
        patientName: regName.trim(),
        patientPhone: phoneCheck.normalized,
        idempotencyKey: regIdempotencyKey,
      });

      setSavedAppointmentSummary(created);
      setRegSuccessMsg(
        isUz
          ? 'Bemor muvaffaqiyatli navbatga qo\'shildi!'
          : 'Пациент успешно добавлен в очередь!'
      );
      setRegIdempotencyKey(`quick_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
      setSlotRefreshSeq((s) => s + 1);
      await loadData();
    } catch (err: any) {
      setRegErrorMsg(err?.message || (isUz ? 'Bemor qo\'shishda xatolik yuz berdi' : 'Ошибка при регистрации пациента'));
      setSlotRefreshSeq((s) => s + 1);
    } finally {
      setIsSubmittingReg(false);
    }
  };

  // Debt Repayment Submit (Server API Integration)
  const handleRepayDebtSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!debtPatientId || debtAmount <= 0) {
      setDebtErrorMsg(isUz ? 'Bemor va to\'lov summasini kiriting' : 'Укажите пациента и сумму');
      return;
    }

    try {
      await api.recordPayment({
        patientId: debtPatientId,
        amount: debtAmount,
        method: debtMethod,
        note: debtNotes || (isUz ? 'Qarzni so\'ndirish' : 'Погашение долга'),
      });
      setDebtSuccessMsg(
        isUz
          ? `${debtAmount.toLocaleString()} so'm to'lov muvaffaqiyatli qabul qilindi!`
          : `Платеж на сумму ${debtAmount.toLocaleString()} сум успешно принят!`
      );
      setDebtErrorMsg(null);
      setDebtPatientId('');
      setDebtAmount(0);
      setDebtNotes('');
      await loadData();
      setTimeout(() => {
        setDebtModalOpen(false);
        setDebtSuccessMsg(null);
      }, 1500);
    } catch (err: any) {
      setDebtErrorMsg(err?.message || (isUz ? 'To\'lovni qabul qilishda xatolik' : 'Ошибка при приеме платежа'));
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

  // Queue items for Reception
  const queueItems = useMemo(() => {
    return filteredToday.filter((appt) => {
      if (queueTab === 'ALL') return true;
      if (queueTab === 'ARRIVED') return appt.status === 'CHECKED_IN' && !appt.actualStartTime;
      if (queueTab === 'IN_TREATMENT') return appt.status === 'CHECKED_IN' && Boolean(appt.actualStartTime);
      if (queueTab === 'COMPLETED') return appt.status === 'COMPLETED';
      return true;
    });
  }, [filteredToday, queueTab]);

  const arrivedCount = todayAppointments.filter((a) => a.status === 'CHECKED_IN' && !a.actualStartTime).length;
  const inTreatmentCount = todayAppointments.filter((a) => a.status === 'CHECKED_IN' && Boolean(a.actualStartTime)).length;
  const completedTodayCount = todayAppointments.filter((a) => a.status === 'COMPLETED').length;
  const totalDebtSum = serverDebts.reduce((sum, d) => sum + (d.totalDebt || 0), 0);

  // Status Badge Helper
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

  const allowedRoles: StaffRole[] = ['OWNER', 'ADMIN', 'DOCTOR', 'RECEPTION'];

  if (isAuthLoading) {
    return (
      <AdminLayout allowedRoles={allowedRoles}>
        <div className="p-16 text-center text-ink-muted text-sm flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-brand-600" />
          <span>{isUz ? 'Foydalanuvchi ma\'lumotlari yuklanmoqda...' : 'Загрузка данных пользователя...'}</span>
        </div>
      </AdminLayout>
    );
  }

  if (!user || !user.role) {
    return (
      <AdminLayout allowedRoles={allowedRoles}>
        <div className="p-16 text-center text-rose-600 text-sm font-semibold">
          {isUz ? 'Kirish rad etildi: foydalanuvchi roli aniqlanmadi' : 'Доступ запрещен: роль пользователя не определена'}
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout allowedRoles={allowedRoles}>
      <div className="space-y-6">
        {/* Top Operational Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-line shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-600 bg-brand-100 px-2.5 py-0.5 rounded-md">
                {isDoctor
                  ? (isUz ? 'Shifokor xonasi' : 'Кабинет врача')
                  : isOwner
                  ? (isUz ? 'Rahbar boshqaruv markazi' : 'Кабинет руководителя')
                  : (isUz ? 'Qabulxona / Administrator' : 'Регистратура / Администратор')}
              </span>
              <span suppressHydrationWarning className="text-xs text-ink-muted">
                {formatClinicDate(new Date().toISOString(), language, { includeWeekday: true })}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-ink mt-1">
              {isDoctor
                ? `${isUz ? 'Dr.' : 'Д-р'} ${user?.fullName || user?.email.split('@')[0]}`
                : isOwner
                ? (isUz ? 'Klinika rahbari boshqaruvi' : 'Управление клиникой руководителя')
                : (isUz ? 'Bugungi operatsion boshqaruv' : 'Оперативное управление на сегодня')}
            </h1>
            <p className="text-xs text-ink-muted mt-0.5">
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
            {/* Authenticated Staff Identity Chip */}
            <div className="flex items-center gap-2.5 bg-canvas px-3 py-1.5 rounded-xl border border-line text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
              <div className="flex flex-col">
                <span className="font-extrabold text-ink text-xs leading-tight">
                  {user?.fullName || user?.email || (isUz ? 'Xodim' : 'Сотрудник')}
                </span>
              </div>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-brand-600 text-white tracking-wider">
                {effectiveRole === 'DOCTOR'
                  ? (isUz ? 'Shifokor' : 'Врач')
                  : effectiveRole === 'OWNER'
                  ? (isUz ? 'Rahbar' : 'Руководитель')
                  : (effectiveRole as string) === 'RECEPTION'
                  ? (isUz ? 'Qabulxona' : 'Ресепшн')
                  : (isUz ? 'Administrator' : 'Администратор')}
              </span>
            </div>

            {/* Search Input */}
            <div className="relative min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              <input
                type="text"
                placeholder={isUz ? 'Bemor yoki telefon...' : 'Пациент или телефон...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs bg-canvas border border-line rounded-xl text-ink focus:outline-none focus:border-brand-600"
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
              className="p-2 bg-canvas hover:bg-brand-50 text-ink rounded-xl border border-line transition-colors"
              title={isUz ? 'Yangilash' : 'Обновить'}
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-brand-600' : ''}`} />
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
          <div className="bg-brand-100 border border-brand-600/40 rounded-2xl p-3.5 flex items-center justify-between text-xs text-brand-700 font-semibold">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-brand-600 shrink-0" />
              <span>{statusFeedback}</span>
            </div>
            <button onClick={() => setStatusFeedback(null)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 4 KPI Metrics Row */}
        <div className="metric-grid">
          {/* 1: Yangi arizalar (Crucial for test: data-testid="kpi-pending-count") */}
          <div className="ui-card flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-ink-muted block">{isUz ? 'Yangi arizalar' : 'Новые заявки'}</span>
              <p data-testid="kpi-pending-count" className="text-2xl font-black text-ink mt-0.5">
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
              <span className="text-xs font-semibold text-ink-muted block">{isUz ? 'Bugungi qabullar' : 'Приемы на сегодня'}</span>
              <p className="text-2xl font-black text-ink mt-0.5">
                {todayAppointments.length}
              </p>
              <span className="text-[11px] text-brand-600 font-medium">{isUz ? 'Jadval bo\'yicha' : 'По расписанию'}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
          </div>

          {/* 3: Klinikada / Navbatda */}
          <div className="ui-card flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-ink-muted block">{isUz ? 'Klinikada hozir' : 'Сейчас в клинике'}</span>
              <p className="text-2xl font-black text-ink mt-0.5">
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
              <span className="text-xs font-semibold text-ink-muted block">{isUz ? 'Yakunlandi' : 'Завершено'}</span>
              <p className="text-2xl font-black text-ink mt-0.5">
                {isDoctor ? completedDoctorCount : completedTodayCount}
              </p>
              <span className="text-[11px] text-emerald-700 font-medium">{isUz ? 'Muvaffaqiyatli' : 'Успешно'}</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* WORKSPACE SELECTION BY AUTHENTICATED ROLE */}
        {isDoctor ? (
          <DoctorWorkspace
            filteredToday={filteredToday}
            upcomingAppointments={upcomingAppointments}
            isUz={isUz}
            selectedTooth={selectedTooth}
            setSelectedTooth={setSelectedTooth}
            xrayBrightness={xrayBrightness}
            setXrayBrightness={setXrayBrightness}
            xrayContrast={xrayContrast}
            setXrayContrast={setXrayContrast}
            doctorAttachments={doctorAttachments}
            renderStatusBadge={renderStatusBadge}
            handleStartTreatment={handleStartTreatment}
            handleRecordDelay={handleRecordDelay}
            handleStatusChange={handleStatusChange}
            handleOpenCancelModal={(appt) => setCancellationTarget(appt)}
          />
        ) : isOwner ? (
          <div className="space-y-6">
            <div className="p-4 bg-gradient-to-r from-brand-950 to-brand-900 rounded-2xl text-white border border-brand-800 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-600 text-white flex items-center justify-center font-bold">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">
                    {isUz ? 'Klinika Rahbari boshqaruv markazi' : 'Центр управления руководителя клиники'}
                  </h3>
                  <p className="text-xs text-brand-200">
                    {isUz
                      ? 'Filiallar daromadi, shifokorlar samaradorligi va moliyaviy konversiya'
                      : 'Доход филиалов, эффективность врачей и финансовая конверсия'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href="/admin/analytics"
                  className="px-3.5 py-2 bg-brand-600 hover:bg-secondary-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
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

            <OwnerWorkspace
              doctors={doctors}
              isUz={isUz}
              doctorCommissionRates={doctorCommissionRates}
              handleUpdateDoctorCommissionRate={async (docId, rate) => {
                setDoctorCommissionRates((prev) => ({ ...prev, [docId]: rate }));
                try {
                  await api.updateDoctorCommission(docId, { percentage: rate });
                  setStatusFeedback(isUz ? "Shifokor komissiya foizi saqlandi" : 'Процент комиссии сохранен');
                } catch {
                  setStatusFeedback(isUz ? "Komissiyani saqlashda xatolik yuz berdi" : 'Ошибка сохранения комиссии');
                }
              }}
              setStatusFeedback={setStatusFeedback}
            />
          </div>
        ) : (
          <ReceptionWorkspace
            filteredToday={filteredToday}
            queueItems={queueItems}
            queueTab={queueTab}
            setQueueTab={setQueueTab}
            arrivedCount={arrivedCount}
            inTreatmentCount={inTreatmentCount}
            completedTodayCount={completedTodayCount}
            mutatingMap={mutatingMap}
            handleStatusChange={handleStatusChange}
            handleStartTreatment={handleStartTreatment}
            isUz={isUz}
            language={language}
            savedAppointmentSummary={savedAppointmentSummary}
            regSuccessMsg={regSuccessMsg}
            regErrorMsg={regErrorMsg}
            regName={regName}
            setRegName={setRegName}
            regPhone={regPhone}
            setRegPhone={setRegPhone}
            regDoctorId={regDoctorId}
            handleDoctorSelect={handleDoctorSelect}
            regServiceId={regServiceId}
            handleServiceSelect={handleServiceSelect}
            regBranchId={regBranchId}
            handleBranchSelect={handleBranchSelect}
            branches={branches}
            availableDoctorsForReg={availableDoctorsForReg}
            availableServicesForReg={availableServicesForReg}
            selectedDoctorObjForReg={selectedDoctorObjForReg}
            selectedServiceObj={selectedServiceObj}
            selectedBranchObjForReg={selectedBranchObjForReg}
            regSlotQuote={regSlotQuote}
            regSlots={regSlots}
            isLoadingSlots={isLoadingSlots}
            slotFetchError={slotFetchError}
            setSlotRefreshSeq={setSlotRefreshSeq}
            regSelectedSlot={regSelectedSlot}
            setRegSelectedSlot={setRegSelectedSlot}
            regConsentGiven={regConsentGiven}
            setRegConsentGiven={setRegConsentGiven}
            isSubmittingReg={isSubmittingReg}
            handleQuickRegister={handleQuickRegister}
            handleResetQuickReg={handleResetQuickReg}
            onOpenDebtModal={() => setDebtModalOpen(true)}
            invoices={serverInvoices}
            totalDebt={totalDebtSum}
          />
        )}

        {/* Cancellation Modal */}
        {cancellationTarget && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fade-in"
            role="dialog"
            aria-modal="true"
          >
            <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-line space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-ink">
                    {isUz ? 'Qabulni bekor qilish' : 'Отмена записи на прием'}
                  </h3>
                  <p className="text-xs text-ink-muted">
                    {isUz ? 'Haqiqatan ham ushbu qabulni bekor qilmoqchimisiz?' : 'Вы действительно хотите отменить эту запись на прием?'}
                  </p>
                </div>
              </div>

              <div className="p-3 bg-canvas rounded-xl border border-line text-xs space-y-1 text-ink">
                <div>
                  <span className="text-ink-muted">{isUz ? 'Bemor: ' : 'Пациент: '}</span>
                  <strong>{cancellationTarget.patient?.fullName || cancellationTarget.patientName}</strong>
                </div>
                <div>
                  <span className="text-ink-muted">{isUz ? 'Vaqti: ' : 'Время: '}</span>
                  <span>{formatClinicTime(cancellationTarget.startTime)}</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCancellationTarget(null)}
                  className="px-4 py-2 border border-line text-ink rounded-xl text-xs font-semibold hover:bg-canvas"
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

        {/* Debt Repayment Modal */}
        {debtModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in"
            role="dialog"
            aria-modal="true"
          >
            <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-line space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-ink">
                      {isUz ? "Bemor qarzini so'ndirish" : 'Погашение долга пациента'}
                    </h3>
                    <p className="text-xs text-ink-muted">
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
                  <label className="text-[11px] font-bold text-ink-muted block mb-1">
                    {isUz ? 'Qarzdor bemor' : 'Пациент с долгом'} <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={debtPatientId}
                    onChange={(e) => {
                      const pId = e.target.value;
                      setDebtPatientId(pId);
                      const pat = serverDebts.find((p) => p.patientId === pId);
                      if (pat) setDebtAmount(pat.totalDebt);
                    }}
                    className="w-full px-3 py-2 bg-canvas border border-line rounded-xl text-ink focus:outline-none focus:border-brand-600 font-medium"
                    required
                  >
                    <option value="">{isUz ? 'Bemorni tanlang' : 'Выберите пациента'}</option>
                    {serverDebts
                      .filter((p) => p.totalDebt > 0)
                      .map((p) => (
                        <option key={p.patientId} value={p.patientId}>
                          {p.patientName} ({p.phone}) — {isUz ? 'Qarz:' : 'Долг:'} {p.totalDebt.toLocaleString()} {isUz ? "so'm" : "сум"}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Repayment Amount */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-ink-muted">
                      {isUz ? "To'lov summasi (so'm)" : 'Сумма оплаты (сум)'} <span className="text-red-500">*</span>
                    </label>
                    {(() => {
                      const activePat = serverDebts.find((p) => p.patientId === debtPatientId);
                      return activePat ? (
                        <span className="text-[10px] text-rose-600 font-bold">
                          {isUz ? 'Jami qarz:' : 'Всего долг:'} {activePat.totalDebt.toLocaleString()} {isUz ? "so'm" : "сум"}
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
                    className="w-full px-3 py-2 bg-canvas border border-line rounded-xl text-ink font-mono font-bold focus:outline-none focus:border-brand-600"
                    required
                  />
                </div>

                {/* Payment Method Selector */}
                <div>
                  <label className="text-[11px] font-bold text-ink-muted block mb-1.5">
                    {isUz ? "To'lov usuli" : 'Способ оплаты'}
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { id: 'CASH' as const, label: isUz ? 'Naqd' : 'Наличные' },
                      { id: 'CARD' as const, label: 'Karta (Uzcard/Humo)' },
                      { id: 'TRANSFER' as const, label: 'Payme / Click' },
                      { id: 'OTHER' as const, label: isUz ? 'Boshqa' : 'Другое' },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setDebtMethod(m.id)}
                        className={`p-2 rounded-xl border text-center transition-all ${
                          debtMethod === m.id
                            ? 'bg-brand-600 text-white border-brand-700 shadow-2xs font-bold'
                            : 'bg-canvas text-ink-muted border-line hover:bg-brand-50'
                        }`}
                      >
                        <span className="text-[10px] block leading-tight">{m.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="text-[11px] font-bold text-ink-muted block mb-1">
                    {isUz ? 'Izoh' : 'Примечание'}
                  </label>
                  <input
                    type="text"
                    value={debtNotes}
                    onChange={(e) => setDebtNotes(e.target.value)}
                    placeholder={isUz ? "Qarz to'lovi izohi..." : "Примечание к оплате..."}
                    className="w-full px-3 py-2 bg-canvas border border-line rounded-xl text-ink focus:outline-none focus:border-brand-600"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                  <button
                    type="button"
                    onClick={() => setDebtModalOpen(false)}
                    className="px-4 py-2 border border-line text-ink rounded-xl text-xs font-semibold hover:bg-canvas"
                  >
                    {isUz ? 'Yopish' : 'Закрыть'}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{isUz ? "To'lovni tasdiqlash" : 'Подтвердить оплату'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
