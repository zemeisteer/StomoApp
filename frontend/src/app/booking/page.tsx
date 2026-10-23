'use client';

import React, { useState, useEffect, Suspense, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Calendar,
  Clock,
  User,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  Copy,
  Building2,
  Stethoscope,
  Info,
  Check,
  ArrowRight,
  Sparkles,
  MapPin,
  Phone,
  Star,
  ShieldCheck,
} from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { api } from '../../lib/api';
import { PhoneInput } from '../../components/PhoneInput';
import { normalizeUzPhone } from '../../lib/phone';

interface ServerCalculation {
  key: string;
  durationMinutes: number;
  bufferMinutes: number;
  priceFrom: number;
  serviceName: string;
}

const DAY_NAME_MAP_LOCALIZED: Record<string, { uz: string; ru: string }> = {
  MONDAY: { uz: 'Dushanba', ru: 'Понедельник' },
  TUESDAY: { uz: 'Seshanba', ru: 'Вторник' },
  WEDNESDAY: { uz: 'Chorshanba', ru: 'Среда' },
  THURSDAY: { uz: 'Payshanba', ru: 'Четверг' },
  FRIDAY: { uz: 'Juma', ru: 'Пятница' },
  SATURDAY: { uz: 'Shanba', ru: 'Суббота' },
  SUNDAY: { uz: 'Yakshanba', ru: 'Воскресенье' },
};

const SHORT_DAY_NAMES_UZ = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Juma', 'Shan'];
const SHORT_DAY_NAMES_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

const SHORT_MONTHS_UZ = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];
const SHORT_MONTHS_RU = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

const FULL_MONTHS_UZ = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentyabr', 'oktabr', 'noyabr', 'dekabr'];
const FULL_MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

const FULL_DAYS_UZ = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
const FULL_DAYS_RU = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

function formatDisplayDate(dateStr: string, lang: 'uz' | 'ru' = 'uz'): string {
  if (!dateStr) return '';
  const d = parseCalendarDate(dateStr);
  const dayOfWeek = d.getUTCDay();
  const dayNum = d.getUTCDate();
  const monthIdx = d.getUTCMonth();
  const year = d.getUTCFullYear();

  if (lang === 'ru') {
    return `${dayNum} ${FULL_MONTHS_RU[monthIdx]} ${year} г., ${FULL_DAYS_RU[dayOfWeek]}`;
  }
  return `${year}-yil ${dayNum}-${FULL_MONTHS_UZ[monthIdx]} (${FULL_DAYS_UZ[dayOfWeek]})`;
}

const UZ_DAY_TO_INT: Record<string, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function getTashkentDateParts(date: Date = new Date()): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  const parts = formatter.formatToParts(date);
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') {
      map[p.type] = Number(p.value);
    }
  }
  return { year: map.year, month: map.month, day: map.day };
}

function toCalendarDateStr(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseCalendarDate(str: string): Date {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function isDoctorWorkingOnDate(dateStr: string, doctor: any, branchId?: string): boolean {
  if (!doctor) return false;

  // 1. Check doctor exceptions for this specific calendar date
  const exceptions = doctor.exceptions || [];
  const dayExceptions = exceptions.filter((ex: any) => {
    const exDate = typeof ex.date === 'string' ? ex.date.split('T')[0] : new Date(ex.date).toISOString().split('T')[0];
    return exDate === dateStr;
  });

  // Check whole-day off: HOLIDAY or full-day LEAVE/BLOCKED
  const isWholeDayOff = dayExceptions.some(
    (ex: any) =>
      ex.type === 'HOLIDAY' ||
      ((ex.type === 'LEAVE' || ex.type === 'BLOCKED') && (!ex.startTime || !ex.endTime))
  );
  if (isWholeDayOff) return false;

  // Check OVERTIME
  const hasOvertime = dayExceptions.some((ex: any) => ex.type === 'OVERTIME');
  if (hasOvertime) return true;

  // 2. Check weekly recurring schedule
  if (!doctor.schedules || doctor.schedules.length === 0) return false;
  const dateObj = parseCalendarDate(dateStr);
  const dayOfWeekNum = dateObj.getUTCDay();

  const filtered = branchId
    ? doctor.schedules.filter((s: any) => s.branchId === branchId && s.isActive !== false)
    : doctor.schedules.filter((s: any) => s.isActive !== false);

  if (filtered.length === 0) return false;
  return filtered.some((s: any) => UZ_DAY_TO_INT[s.dayOfWeek] === dayOfWeekNum);
}

function getDoctorScheduleForDate(dateStr: string, doctor: any, lang: 'uz' | 'ru' = 'uz'): {
  isWorking: boolean;
  workingHours: string;
  branchId?: string;
  branchName?: string;
  branchAddress?: string;
} {
  if (!doctor || !doctor.schedules || doctor.schedules.length === 0) {
    return { isWorking: false, workingHours: '' };
  }
  const dateObj = parseCalendarDate(dateStr);
  const dayOfWeekNum = dateObj.getUTCDay();

  const activeSchedules = doctor.schedules.filter(
    (s: any) => UZ_DAY_TO_INT[s.dayOfWeek] === dayOfWeekNum && s.isActive !== false
  );

  if (activeSchedules.length === 0) {
    return { isWorking: false, workingHours: '' };
  }

  const firstSched = activeSchedules[0];
  const branch = firstSched.branch;
  const branchName = branch ? (lang === 'ru' && branch.nameRu ? branch.nameRu : branch.nameUz) : undefined;
  const branchAddress = branch ? (lang === 'ru' && branch.addressRu ? branch.addressRu : branch.addressUz) : undefined;

  const hoursList = activeSchedules.map((s: any) => {
    let t = `${s.startTime} - ${s.endTime}`;
    if (s.breakStart && s.breakEnd) {
      t += ` (${lang === 'ru' ? 'обед' : 'tushlik'}: ${s.breakStart}-${s.breakEnd})`;
    }
    return t;
  });

  return {
    isWorking: true,
    workingHours: hoursList.join(', '),
    branchId: firstSched.branchId,
    branchName,
    branchAddress,
  };
}

function findNextWorkingDate(startDateStr: string, doctor: any, branchId?: string): string {
  const base = parseCalendarDate(startDateStr);
  for (let i = 1; i <= 14; i++) {
    const cur = new Date(base.getTime() + i * 24 * 60 * 60 * 1000);
    const curStr = toCalendarDateStr(cur);
    if (isDoctorWorkingOnDate(curStr, doctor, branchId)) {
      return curStr;
    }
  }
  return startDateStr;
}

function BookingContent() {
  const { t, language } = useI18n();
  const searchParams = useSearchParams();

  // 7-step sequence matching user requirement:
  // 1: Kunni tanlash (Select Date)
  // 2: Nimadan foydalanmoqchi ekanligini (Select Service)
  // 3: O'sha kuni qaysi doktorlar borligini ko'rsatish (Show available doctors for chosen date)
  // 4: Tanlangan doktorning ochiq vaqtini ko'rsatish (Doctor's open time slots)
  // 5: Manzil tanlash, o'sha belgilaganlariga qarab recommend qilish (Branch selection & recommendation)
  // 6: Bemor ma'lumotlari (Patient Contact Details & Confirmation)
  // 7: Natija / Tasdiq (Booking Confirmation & Management)
  const [step, setStep] = useState<number>(1);

  // Form selections
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [selectedSlotTime, setSelectedSlotTime] = useState<string>('');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');

  // Patient info
  const [patientName, setPatientName] = useState<string>('');
  const [patientPhone, setPatientPhone] = useState<string>('+998 ');
  const [patientEmail, setPatientEmail] = useState<string>('');
  const [patientNote, setPatientNote] = useState<string>('');
  const [consentGiven, setConsentGiven] = useState<boolean>(true);

  // Validation touch state
  const [isPhoneTouched, setIsPhoneTouched] = useState<boolean>(false);
  const [isEmailTouched, setIsEmailTouched] = useState<boolean>(false);

  // Data collections from backend
  const [branches, setBranches] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);

  // Server calculation results
  const [serverCalc, setServerCalc] = useState<ServerCalculation | null>(null);

  // Loading & error states
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Stable Idempotency Key
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');

  // Confirmation result
  const [bookingResult, setBookingResult] = useState<any | null>(null);
  const [copiedToken, setCopiedToken] = useState<boolean>(false);

  // Race condition protection for slots fetching
  const slotsRequestIdRef = useRef<number>(0);

  // Initialize tomorrow's date in Tashkent timezone
  useEffect(() => {
    const todayParts = getTashkentDateParts();
    const tomorrow = new Date(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day + 1, 12, 0, 0));
    setSelectedDate(toCalendarDateStr(tomorrow));
  }, []);

  // Initial load
  useEffect(() => {
    async function loadData() {
      try {
        setIsLoadingData(true);
        const [branchesRes, servicesRes, doctorsRes] = await Promise.all([
          api.getBranches(),
          api.getServices(),
          api.getDoctors(),
        ]);

        const validBranches = branchesRes || [];
        const validServices = servicesRes || [];
        const validDoctors = doctorsRes || [];

        setBranches(validBranches);
        setServices(validServices);
        setDoctors(validDoctors);

        const qDate = searchParams.get('date');
        const qService = searchParams.get('serviceId');
        const qDoctor = searchParams.get('doctorId');
        const qBranch = searchParams.get('branchId');

        if (qDate && /^\d{4}-\d{2}-\d{2}$/.test(qDate)) {
          setSelectedDate(qDate);
        }

        if (qService && validServices.some((s: any) => s.id === qService && s.isActive !== false)) {
          setSelectedServiceIds([qService]);
        }

        if (qDoctor && validDoctors.some((d: any) => d.id === qDoctor && d.isActive !== false)) {
          setSelectedDoctorId(qDoctor);
        }

        if (qBranch && validBranches.some((b: any) => b.id === qBranch && b.isActive !== false)) {
          setSelectedBranchId(qBranch);
        }
      } catch (err: any) {
        setErrorMessage(err?.message || t.common.error);
      } finally {
        setIsLoadingData(false);
      }
    }
    loadData();
  }, [searchParams, t.common.error]);

  // Derived selected services
  const selectedServices = useMemo(() => {
    return services.filter((s) => selectedServiceIds.includes(s.id));
  }, [services, selectedServiceIds]);

  const fallbackTotalDuration = useMemo(() => {
    return selectedServices.reduce((sum, s) => sum + (s.durationMinutes || 30), 0);
  }, [selectedServices]);

  const fallbackTotalPrice = useMemo(() => {
    return selectedServices.reduce((sum, s) => sum + (s.priceFrom || 0), 0);
  }, [selectedServices]);

  // Unique selection key for calculating authoritative duration and price
  const currentSelectionKey = useMemo(() => {
    if (!selectedDoctorId || selectedServiceIds.length === 0 || !selectedDate) return '';
    const sortedServices = [...selectedServiceIds].sort().join(',');
    return `${selectedBranchId || ''}|${selectedDoctorId}|${selectedDate}|${sortedServices}`;
  }, [selectedBranchId, selectedDoctorId, selectedDate, selectedServiceIds]);

  const isCalculationAuthoritative = Boolean(
    serverCalc && currentSelectionKey && serverCalc.key === currentSelectionKey
  );

  const totalDuration = isCalculationAuthoritative
    ? serverCalc!.durationMinutes
    : fallbackTotalDuration;

  const totalPrice = isCalculationAuthoritative
    ? (typeof serverCalc!.priceFrom === 'number' ? serverCalc!.priceFrom : fallbackTotalPrice)
    : fallbackTotalPrice;

  const serverServiceName = isCalculationAuthoritative ? serverCalc!.serviceName : null;

  const selectedDoctorObj = useMemo(() => {
    return doctors.find((d) => d.id === selectedDoctorId);
  }, [doctors, selectedDoctorId]);

  // Helper to check if doctor provides all selected services
  const doctorProvidesSelectedServices = (doc: any) => {
    if (!doc) return false;
    if (selectedServiceIds.length === 0) return true;
    return (
      Array.isArray(doc.services) &&
      doc.services.length > 0 &&
      selectedServiceIds.every((srvId) =>
        doc.services.some((ds: any) => ds.serviceId === srvId)
      )
    );
  };

  // Doctors categorized for Step 3 (Chosen Date)
  const { doctorsWorkingOnDate, doctorsOtherDays } = useMemo(() => {
    const working: any[] = [];
    const other: any[] = [];

    for (const doc of doctors) {
      if (doc.isActive === false) continue;
      const provides = doctorProvidesSelectedServices(doc);
      if (!provides) continue;

      const isWorking = isDoctorWorkingOnDate(selectedDate, doc);
      if (isWorking) {
        working.push(doc);
      } else {
        other.push(doc);
      }
    }

    return { doctorsWorkingOnDate: working, doctorsOtherDays: other };
  }, [doctors, selectedDate, selectedServiceIds]);

  // Recommended branch calculation based on chosen doctor and date/time
  const recommendedBranchObj = useMemo(() => {
    if (!selectedDoctorObj || !selectedDate) {
      return branches[0] || null;
    }
    const schedInfo = getDoctorScheduleForDate(selectedDate, selectedDoctorObj, language);
    if (schedInfo.branchId) {
      const match = branches.find((b) => b.id === schedInfo.branchId);
      if (match) return match;
    }
    if (Array.isArray(selectedDoctorObj.branches) && selectedDoctorObj.branches.length > 0) {
      const match = branches.find((b) => b.id === selectedDoctorObj.branches[0].branchId);
      if (match) return match;
    }
    return branches[0] || null;
  }, [selectedDoctorObj, selectedDate, branches, language]);

  // Ensure recommended branch is pre-selected when arriving at branch step
  useEffect(() => {
    if (step >= 5 && recommendedBranchObj && !selectedBranchId) {
      setSelectedBranchId(recommendedBranchObj.id);
    }
  }, [step, recommendedBranchObj, selectedBranchId]);

  const selectedBranchObj = useMemo(() => {
    return branches.find((b) => b.id === selectedBranchId) || recommendedBranchObj;
  }, [branches, selectedBranchId, recommendedBranchObj]);

  // Validated step navigation function
  const goToStep = (targetStep: number) => {
    setErrorMessage(null);

    if (targetStep <= step) {
      setStep(targetStep);
      return;
    }

    // Step 1 -> 2: Must have date
    if (targetStep >= 2 && !selectedDate) {
      setErrorMessage(t.booking.selectDateFirst);
      setStep(1);
      return;
    }

    // Step 2 -> 3: Must have at least 1 service
    if (targetStep >= 3 && selectedServiceIds.length === 0) {
      setErrorMessage(t.booking.selectServiceFirst);
      setStep(2);
      return;
    }

    // Step 3 -> 4: Must have selected a doctor
    if (targetStep >= 4 && !selectedDoctorId) {
      setErrorMessage(t.booking.selectDoctorFirst);
      setStep(3);
      return;
    }

    // Step 4 -> 5: Must have selected a slot
    if (targetStep >= 5 && !selectedSlotTime) {
      setErrorMessage(t.booking.selectSlotFirst);
      setStep(4);
      return;
    }

    // Step 5 -> 6: Auto-select recommended branch if none selected yet
    if (targetStep >= 6 && !selectedBranchId) {
      if (recommendedBranchObj) {
        setSelectedBranchId(recommendedBranchObj.id);
      } else {
        setErrorMessage(t.booking.selectBranchFirst);
        setStep(5);
        return;
      }
    }

    setStep(targetStep);
  };

  // Date selection handler (Step 1)
  const handleSelectDate = (dateStr: string) => {
    setSelectedDate(dateStr);
    setSelectedSlotTime('');
    setIdempotencyKey('');
    setServerCalc(null);
    slotsRequestIdRef.current++;
    setAvailableSlots([]);

    // Check if previously selected doctor still works on this new date
    if (selectedDoctorObj && !isDoctorWorkingOnDate(dateStr, selectedDoctorObj)) {
      setSelectedDoctorId('');
    }
  };

  // Service toggle handler (Step 2)
  const toggleService = (serviceId: string) => {
    setSelectedSlotTime('');
    setIdempotencyKey('');
    setServerCalc(null);
    slotsRequestIdRef.current++;
    setAvailableSlots([]);

    setSelectedServiceIds((prev) => {
      let updated: string[];
      if (prev.includes(serviceId)) {
        updated = prev.filter((id) => id !== serviceId);
      } else {
        if (prev.length >= 3) {
          setErrorMessage(t.booking.maxServicesLimit);
          return prev;
        }
        setErrorMessage(null);
        updated = [...prev, serviceId];
      }

      // Check if previously selected doctor still provides all updated services
      if (selectedDoctorObj) {
        const stillProvides =
          Array.isArray(selectedDoctorObj.services) &&
          updated.every((id) =>
            selectedDoctorObj.services.some((ds: any) => ds.serviceId === id)
          );
        if (!stillProvides) {
          setSelectedDoctorId('');
        }
      }
      return updated;
    });
  };

  // Doctor selection handler (Step 3)
  const handleSelectDoctor = (doctorId: string) => {
    setSelectedDoctorId(doctorId);
    setSelectedSlotTime('');
    setIdempotencyKey('');
    setServerCalc(null);
    slotsRequestIdRef.current++;
    setAvailableSlots([]);

    // Pre-calculate recommended branch for this doctor on this date
    const doc = doctors.find((d) => d.id === doctorId);
    if (doc) {
      const sched = getDoctorScheduleForDate(selectedDate, doc, language);
      if (sched.branchId) {
        setSelectedBranchId(sched.branchId);
      }
    }
  };

  // Fetch slots whenever step === 4 or relevant parameters change
  useEffect(() => {
    async function fetchSlots() {
      if (!selectedDoctorId || selectedServiceIds.length === 0 || !selectedDate) {
        setAvailableSlots([]);
        return;
      }

      const currentReqId = ++slotsRequestIdRef.current;
      const currentReqKey = `${selectedBranchId || ''}|${selectedDoctorId}|${selectedDate}|${[...selectedServiceIds].sort().join(',')}`;

      try {
        setIsLoadingSlots(true);
        setErrorMessage(null);

        const res = await api.getAvailableSlots(
          selectedDoctorId,
          selectedDate,
          selectedServiceIds[0],
          selectedBranchId || undefined,
          undefined,
          selectedServiceIds
        );

        if (slotsRequestIdRef.current !== currentReqId) {
          return;
        }

        const slotList = Array.isArray(res) ? res : res?.slots || [];
        setAvailableSlots(slotList);

        if (res && typeof res === 'object' && !Array.isArray(res)) {
          setServerCalc({
            key: currentReqKey,
            durationMinutes: res.durationMinutes || fallbackTotalDuration,
            bufferMinutes: res.bufferMinutes ?? 5,
            priceFrom: typeof res.priceFrom === 'number' ? res.priceFrom : fallbackTotalPrice,
            serviceName: res.serviceName || selectedServices.map((s) => s.nameUz).join(', '),
          });
        }
      } catch (err: any) {
        if (slotsRequestIdRef.current === currentReqId) {
          setAvailableSlots([]);
          setErrorMessage(err?.message || t.booking.noSlots);
        }
      } finally {
        if (slotsRequestIdRef.current === currentReqId) {
          setIsLoadingSlots(false);
        }
      }
    }

    if (step === 4) {
      fetchSlots();
    } else {
      slotsRequestIdRef.current++;
      setAvailableSlots([]);
    }
  }, [step, selectedDoctorId, selectedServiceIds, selectedDate, selectedBranchId, fallbackTotalDuration, fallbackTotalPrice, selectedServices, t.booking.noSlots]);

  // Real-time phone and email validation
  const isPhoneValid = useMemo(() => {
    const val = normalizeUzPhone(patientPhone, true);
    return val.isValid;
  }, [patientPhone]);

  const isEmailValid = useMemo(() => {
    if (!patientEmail.trim()) return true;
    return EMAIL_REGEX.test(patientEmail.trim());
  }, [patientEmail]);

  // Idempotency Key
  const getOrGenerateIdempotencyKey = () => {
    if (idempotencyKey) return idempotencyKey;
    const newKey = `idem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    setIdempotencyKey(newKey);
    return newKey;
  };

  // Final submit handler
  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPhoneTouched(true);
    setIsEmailTouched(true);

    if (!consentGiven) {
      setErrorMessage(t.booking.consentError);
      return;
    }

    if (!patientName.trim()) {
      setErrorMessage(t.booking.nameRequired);
      return;
    }

    const phoneValidation = normalizeUzPhone(patientPhone, true);
    if (!phoneValidation.isValid) {
      setErrorMessage(
        (language === 'ru' ? phoneValidation.errorMessageRu : phoneValidation.errorMessageUz) ||
          'Telefon raqami noto\'g\'ri'
      );
      return;
    }

    if (!isEmailValid) {
      setErrorMessage(t.booking.emailValidationError);
      return;
    }

    const currentKey = getOrGenerateIdempotencyKey();

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const result = await api.createBooking({
        branchId: selectedBranchId || recommendedBranchObj?.id || undefined,
        serviceId: selectedServiceIds[0],
        serviceIds: selectedServiceIds,
        doctorId: selectedDoctorId,
        startTime: selectedSlotTime,
        patientName: patientName.trim(),
        patientPhone: phoneValidation.normalized,
        patientEmail: patientEmail.trim() || undefined,
        note: patientNote.trim() || undefined,
        consentGiven,
        idempotencyKey: currentKey,
      });

      setBookingResult({
        ...result,
        doctorName:
          result.doctorName ||
          (selectedDoctorObj
            ? `Dr. ${language === 'ru' && selectedDoctorObj.firstNameRu ? selectedDoctorObj.firstNameRu : selectedDoctorObj.firstNameUz} ${
                language === 'ru' && selectedDoctorObj.lastNameRu ? selectedDoctorObj.lastNameRu : selectedDoctorObj.lastNameUz
              }`
            : 'Shifokor'),
        branchName:
          result.branchName ||
          (selectedBranchObj ? (language === 'ru' && selectedBranchObj.nameRu ? selectedBranchObj.nameRu : selectedBranchObj.nameUz) : 'Asosiy filial'),
        serviceName:
          result.serviceName ||
          serverServiceName ||
          selectedServices.map((s) => (language === 'ru' && s.nameRu ? s.nameRu : s.nameUz)).join(', '),
        durationMinutes: result.durationMinutes || totalDuration,
        bufferMinutes: result.bufferMinutes || serverCalc?.bufferMinutes || 5,
        servicePriceFrom: result.servicePriceFrom || totalPrice,
      });
      setStep(7);
    } catch (err: any) {
      const isConflict =
        err?.status === 409 ||
        err?.message?.includes('band') ||
        err?.message?.includes('conflict') ||
        err?.message?.includes('allaqachon');

      if (isConflict) {
        setErrorMessage(t.booking.slotConflictNotice);
        setSelectedSlotTime('');
        setIdempotencyKey('');
        slotsRequestIdRef.current++;
        setAvailableSlots([]);
        setStep(4);
      } else {
        setErrorMessage(err?.message || t.common.error);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyManagementUrl = () => {
    if (!bookingResult?.publicToken) return;
    const url = `${window.location.origin}/booking/status/${bookingResult.publicToken}`;
    navigator.clipboard.writeText(url);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2500);
  };

  // 14-day date chips starting from tomorrow anchored in Tashkent timezone
  const dateChips = useMemo(() => {
    const list: Array<{
      dateStr: string;
      dayName: string;
      dayNum: string;
      monthStr: string;
      isToday: boolean;
      isTomorrow: boolean;
    }> = [];
    const todayParts = getTashkentDateParts(new Date());

    for (let i = 1; i <= 14; i++) {
      const cur = new Date(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day + i, 12, 0, 0));
      const dateStr = toCalendarDateStr(cur);
      const dayOfWeekNum = cur.getUTCDay();
      const dayName = language === 'ru' ? SHORT_DAY_NAMES_RU[dayOfWeekNum] : SHORT_DAY_NAMES_UZ[dayOfWeekNum];
      const dayNum = String(cur.getUTCDate());
      const monthStr = language === 'ru' ? SHORT_MONTHS_RU[cur.getUTCMonth()] : SHORT_MONTHS_UZ[cur.getUTCMonth()];

      list.push({
        dateStr,
        dayName,
        dayNum,
        monthStr,
        isToday: i === 0,
        isTomorrow: i === 1,
      });
    }
    return list;
  }, [language]);

  // Formatted date string for header/preview
  const formattedSelectedDate = useMemo(() => {
    if (!selectedDate) return '';
    return formatDisplayDate(selectedDate, language);
  }, [selectedDate, language]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f3f8f7] via-white to-[#f3f8f7] py-10 sm:py-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Title Header */}
        <div className="text-center mb-10">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#eaf5f2] text-[#167b78] border border-[#d8e5e2]">
            <Sparkles className="w-3.5 h-3.5 text-[#167b78]" />
            DentaCare Online
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#152f34] mt-3 tracking-tight">
            {t.booking.title}
          </h1>
          <p className="text-sm text-[#52696e] max-w-xl mx-auto mt-2 leading-relaxed">
            {t.booking.subtitle}
          </p>
        </div>

        {/* 6-Step Stepper Header */}
        {step < 7 && (
          <div className="flex items-center justify-between mb-8 overflow-x-auto py-2">
            {[
              { num: 1, label: t.booking.stepDate },
              { num: 2, label: t.booking.stepService },
              { num: 3, label: t.booking.stepDoctor },
              { num: 4, label: t.booking.stepTime },
              { num: 5, label: t.booking.stepBranch },
              { num: 6, label: t.booking.stepDetails },
            ].map((item, idx) => (
              <React.Fragment key={item.num}>
                <button
                  type="button"
                  onClick={() => goToStep(item.num)}
                  className="flex flex-col items-center shrink-0 focus:outline-none group cursor-pointer"
                >
                  <div
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-xs transition-all ${
                      step === item.num
                        ? 'bg-[#167b78] text-white ring-4 ring-[#167b78]/15 shadow-md shadow-[#167b78]/20'
                        : step > item.num
                        ? 'bg-[#167b78] text-white group-hover:bg-[#126462]'
                        : 'bg-[#eef4f3] text-[#52696e] group-hover:bg-[#e2ecea]'
                    }`}
                  >
                    {step > item.num ? <CheckCircle2 className="w-4 h-4" /> : item.num}
                  </div>
                  <span
                    className={`text-[11px] font-semibold mt-1.5 hidden sm:block ${
                      step === item.num ? 'text-[#167b78]' : 'text-[#52696e]'
                    }`}
                  >
                    {item.label}
                  </span>
                </button>
                {idx < 5 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 transition-all ${
                      step > idx + 1 ? 'bg-[#167b78]' : 'bg-[#d8e5e2]'
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Error Banner */}
        {errorMessage && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-sm text-red-800 animate-fade-in shadow-sm">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">{errorMessage}</p>
            </div>
          </div>
        )}

        {/* Booking Card */}
        <div className="bg-white rounded-3xl p-6 sm:p-10 shadow-xl shadow-[#167b78]/5 border border-[#d8e5e2] relative">
          {/* STEP 1: Kunni tanlash (Date Selection) */}
          {step === 1 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h2 className="text-xl font-bold text-[#152f34] flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-[#167b78]" />
                  <span>{t.booking.selectDate}</span>
                </h2>
                <p className="text-xs text-[#52696e] mt-1">
                  {language === 'ru'
                    ? 'Выберите удобный день для визита в клинику'
                    : 'Klinikaga tashrif buyurish uchun sizga qulay sanani belgilang'}
                </p>
              </div>

              {/* Quick 14-day interactive date chips */}
              <div>
                <label className="block text-xs font-semibold text-[#152f34] mb-2.5">
                  {language === 'ru' ? 'Быстрый выбор даты:' : 'Yaqin kunlardan birini tanlang:'}
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-7 gap-2.5">
                  {dateChips.map((chip) => {
                    const isSelected = selectedDate === chip.dateStr;
                    return (
                      <button
                        type="button"
                        key={chip.dateStr}
                        onClick={() => handleSelectDate(chip.dateStr)}
                        className={`flex flex-col items-center py-3 px-2 rounded-2xl border text-xs transition-all cursor-pointer relative group ${
                          isSelected
                            ? 'border-[#167b78] bg-[#167b78] text-white shadow-md shadow-[#167b78]/25 scale-[1.02]'
                            : 'border-[#d8e5e2] bg-white hover:border-[#167b78]/50 hover:bg-[#f3f8f7] text-[#152f34]'
                        }`}
                      >
                        {chip.isTomorrow && (
                          <span
                            className={`text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.2 rounded-full mb-1 ${
                              isSelected
                                ? 'bg-white/20 text-white'
                                : 'bg-[#eaf5f2] text-[#167b78]'
                            }`}
                          >
                            {language === 'ru' ? 'Завтра' : 'Ertaga'}
                          </span>
                        )}
                        <span
                          className={`text-[11px] font-semibold ${
                            isSelected ? 'text-[#eaf5f2]' : 'text-[#52696e]'
                          }`}
                        >
                          {chip.dayName}
                        </span>
                        <span className="text-lg font-extrabold my-0.5">{chip.dayNum}</span>
                        <span
                          className={`text-[10px] ${
                            isSelected ? 'text-[#eaf5f2]' : 'text-[#52696e]'
                          }`}
                        >
                          {chip.monthStr}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Native Date Picker Input */}
              <div className="pt-2">
                <label className="block text-xs font-semibold text-[#152f34] mb-1.5">
                  {language === 'ru'
                    ? 'Или укажите другую дату в календаре:'
                    : 'Yoki taqvimdan boshqa sanani tanlang:'}
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  min={toCalendarDateStr(new Date())}
                  onChange={(e) => handleSelectDate(e.target.value)}
                  className="w-full sm:w-64 px-4 py-2.5 rounded-xl border border-[#d8e5e2] text-sm focus:outline-none focus:ring-2 focus:ring-[#167b78] bg-white text-[#152f34]"
                />
              </div>

              {/* Selected date confirmation alert */}
              {selectedDate && (
                <div className="p-4 rounded-2xl bg-[#eaf5f2] border border-[#d8e5e2] text-xs text-[#152f34] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#167b78] shrink-0" />
                    <span>
                      {language === 'ru' ? 'Выбранная дата:' : 'Tanlangan sana:'}{' '}
                      <strong className="text-[#167b78] capitalize">{formattedSelectedDate}</strong>
                    </span>
                  </div>
                  <span className="text-[11px] text-[#52696e] font-medium hidden sm:inline">
                    {language === 'ru' ? 'Шаг 1 из 5' : '1-qadam (5 tadan)'}
                  </span>
                </div>
              )}

              <div className="pt-4 flex justify-end">
                <button
                  type="button"
                  disabled={!selectedDate}
                  onClick={() => goToStep(2)}
                  className="px-6 py-3 bg-[#167b78] hover:bg-[#126462] disabled:opacity-50 text-white font-bold rounded-2xl shadow-md shadow-[#167b78]/20 flex items-center gap-2 transition-all cursor-pointer"
                >
                  <span>{t.common.next}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Nimadan foydalanmoqchi ekanligini (Select Service) */}
          {step === 2 && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-xl font-bold text-[#152f34] flex items-center gap-2">
                    <Stethoscope className="w-5 h-5 text-[#167b78]" />
                    <span>{t.booking.selectService}</span>
                  </h2>
                  <p className="text-xs text-[#52696e] mt-0.5">
                    {t.booking.servicesSelectionHint}
                  </p>
                </div>

                {selectedServiceIds.length > 0 && (
                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#eaf5f2] border border-[#d8e5e2] text-[#167b78] text-xs font-bold">
                    <Sparkles className="w-3.5 h-3.5 text-[#167b78]" />
                    <span>
                      {selectedServiceIds.length} {language === 'ru' ? 'выбрано' : 'ta tanlandi'}
                    </span>
                  </div>
                )}
              </div>

              {/* Services List */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[440px] overflow-y-auto pr-1">
                {services.map((s) => {
                  const name = language === 'ru' && s.nameRu ? s.nameRu : s.nameUz;
                  const price = (s.priceFrom / 100).toLocaleString(
                    language === 'ru' ? 'ru-RU' : 'uz-UZ'
                  );
                  const isSelected = selectedServiceIds.includes(s.id);

                  return (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => toggleService(s.id)}
                      className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between relative group cursor-pointer ${
                        isSelected
                          ? 'border-[#167b78] bg-[#f3f8f7] ring-2 ring-[#167b78] shadow-sm'
                          : 'border-[#d8e5e2] hover:border-[#167b78]/50 bg-white hover:bg-[#fbfdfd]'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between text-xs text-[#52696e] mb-1.5">
                          <span className="font-bold text-[#167b78] uppercase tracking-wider text-[10px]">
                            {s.category}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[#52696e]">
                              {s.durationMinutes} {t.booking.minutes}
                            </span>
                            <span
                              className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                                isSelected
                                  ? 'bg-[#167b78] text-white'
                                  : 'border border-[#d8e5e2] text-transparent group-hover:border-[#167b78]'
                              }`}
                            >
                              <Check className="w-3 h-3 stroke-[3]" />
                            </span>
                          </div>
                        </div>
                        <p className="font-bold text-sm text-[#152f34] pr-4">{name}</p>
                      </div>
                      <div className="mt-3 pt-2 border-t border-[#d8e5e2]/60 flex items-center justify-between">
                        <span className="text-[11px] text-[#52696e]">
                          {language === 'ru' ? 'Цена от:' : 'Boshlang\'ich narxi:'}
                        </span>
                        <p className="text-xs font-extrabold text-[#167b78]">
                          {price} {t.common.uzs}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Selected Services Summary Box */}
              {selectedServiceIds.length > 0 && (
                <div className="p-4 rounded-2xl bg-[#eaf5f2] border border-[#d8e5e2] text-xs text-[#152f34] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-bold text-[#152f34]">
                      <CheckCircle2 className="w-4 h-4 text-[#167b78]" />
                      <span>
                        {t.booking.selectedServices} ({selectedServices.length}):
                      </span>
                    </div>
                    <p className="text-[#52696e] pl-6">
                      {selectedServices
                        .map((s) => (language === 'ru' && s.nameRu ? s.nameRu : s.nameUz))
                        .join(', ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 sm:border-l sm:border-[#d8e5e2] sm:pl-4">
                    <div>
                      <span className="text-[#52696e] block text-[10px] uppercase font-semibold">
                        {t.booking.estimatedDuration}:
                      </span>
                      <span className="font-extrabold text-[#152f34] text-sm">
                        {totalDuration} {t.booking.minutes}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#52696e] block text-[10px] uppercase font-semibold">
                        {t.booking.estimatedPrice}:
                      </span>
                      <span className="font-extrabold text-[#167b78] text-sm">
                        {(totalPrice / 100).toLocaleString(language === 'ru' ? 'ru-RU' : 'uz-UZ')}{' '}
                        {t.common.uzs}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => goToStep(1)}
                  className="px-5 py-2.5 border border-[#d8e5e2] text-[#152f34] font-semibold rounded-2xl hover:bg-[#f3f8f7] flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>{t.common.back}</span>
                </button>

                <button
                  type="button"
                  disabled={selectedServiceIds.length === 0}
                  onClick={() => goToStep(3)}
                  className="px-6 py-3 bg-[#167b78] hover:bg-[#126462] disabled:opacity-50 text-white font-bold rounded-2xl shadow-md shadow-[#167b78]/20 flex items-center gap-2 transition-all cursor-pointer"
                >
                  <span>{t.common.next}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: O'sha kuni qaysi doktorlar borligini ko'rsatish (Doctors Available on Chosen Date) */}
          {step === 3 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h2 className="text-xl font-bold text-[#152f34] flex items-center gap-2">
                  <User className="w-5 h-5 text-[#167b78]" />
                  <span>{t.booking.doctorsAvailableOnDate}</span>
                </h2>
                <p className="text-xs text-[#52696e] mt-1">
                  <span className="font-semibold text-[#167b78] capitalize">{formattedSelectedDate}</span>{' '}
                  — {t.booking.doctorsAvailableOnDateDesc}
                </p>
              </div>

              {/* Doctors working on this date */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#167b78] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      {language === 'ru'
                        ? `Врачи, принимающие ${selectedDate} (${doctorsWorkingOnDate.length}):`
                        : `${selectedDate} sanasida qabul qiluvchi shifokorlar (${doctorsWorkingOnDate.length}):`}
                    </span>
                  </span>
                </div>

                {doctorsWorkingOnDate.length === 0 ? (
                  <div className="p-6 text-center bg-[#f3f8f7] rounded-2xl border border-dashed border-[#d8e5e2] space-y-2">
                    <p className="text-sm font-semibold text-[#152f34]">
                      {language === 'ru'
                        ? 'На выбранную дату нет свободных врачей по выбранным услугам'
                        : 'Tanlangan kunda ushbu xizmatlar bo\'yicha qabul qiluvchi shifokor mavjud emas'}
                    </p>
                    <p className="text-xs text-[#52696e]">
                      {language === 'ru'
                        ? 'Пожалуйста, выберите другую дату или ознакомьтесь с врачами ниже.'
                        : 'Iltimos, boshqa sanani tanlang yoki quyidagi mutaxassislar jadvali bilan tanishing.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => goToStep(1)}
                      className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-[#167b78] text-white rounded-xl text-xs font-bold hover:bg-[#126462] cursor-pointer"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{language === 'ru' ? 'Выбрать другую дату' : 'Boshqa sanani tanlash'}</span>
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {doctorsWorkingOnDate.map((d) => {
                      const fullName = `${language === 'ru' && d.firstNameRu ? d.firstNameRu : d.firstNameUz} ${
                        language === 'ru' && d.lastNameRu ? d.lastNameRu : d.lastNameUz
                      }`;
                      const title = language === 'ru' && d.titleRu ? d.titleRu : d.titleUz;
                      const isSelected = selectedDoctorId === d.id;
                      const schedInfo = getDoctorScheduleForDate(selectedDate, d, language);

                      return (
                        <button
                          type="button"
                          key={d.id}
                          onClick={() => handleSelectDoctor(d.id)}
                          className={`p-4 rounded-2xl border text-left transition-all relative cursor-pointer group ${
                            isSelected
                              ? 'border-[#167b78] bg-[#f3f8f7] ring-2 ring-[#167b78] shadow-md shadow-[#167b78]/10'
                              : 'border-[#d8e5e2] hover:border-[#167b78]/60 bg-white hover:bg-[#fbfdfd]'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 mb-1.5">
                                <Check className="w-3 h-3" />
                                {t.booking.doctorWorksTodayBadge}
                              </span>
                              <p className="font-bold text-sm text-[#152f34]">Dr. {fullName}</p>
                              <p className="text-xs text-[#167b78] font-semibold mt-0.5">{title}</p>
                              <p className="text-xs text-[#52696e] mt-1">
                                {d.experienceYears}+ {language === 'ru' ? 'лет опыта' : 'yil tajriba'}
                              </p>
                            </div>
                            <span
                              className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all ${
                                isSelected
                                  ? 'bg-[#167b78] text-white'
                                  : 'border border-[#d8e5e2] text-transparent group-hover:border-[#167b78]'
                              }`}
                            >
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </span>
                          </div>

                          {/* Hours and branch on this date */}
                          <div className="mt-3 pt-2.5 border-t border-[#d8e5e2]/60 space-y-1 text-xs text-[#52696e]">
                            <div className="flex items-center gap-1.5 font-medium text-[#152f34]">
                              <Clock className="w-3.5 h-3.5 text-[#167b78] shrink-0" />
                              <span>{schedInfo.workingHours}</span>
                            </div>
                            {schedInfo.branchName && (
                              <div className="flex items-center gap-1.5 text-[11px] text-[#52696e]">
                                <MapPin className="w-3.5 h-3.5 text-[#167b78] shrink-0" />
                                <span>{schedInfo.branchName}</span>
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Other doctors who provide this service on other days */}
              {doctorsOtherDays.length > 0 && (
                <div className="pt-4 border-t border-[#d8e5e2]">
                  <p className="text-xs font-semibold text-[#52696e] mb-3">
                    {language === 'ru'
                      ? 'Врачи, принимающие в другие дни:'
                      : 'Boshqa kunlarda qabul qiluvchi mutaxassislar:'}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {doctorsOtherDays.map((d) => {
                      const fullName = `${language === 'ru' && d.firstNameRu ? d.firstNameRu : d.firstNameUz} ${
                        language === 'ru' && d.lastNameRu ? d.lastNameRu : d.lastNameUz
                      }`;
                      const title = language === 'ru' && d.titleRu ? d.titleRu : d.titleUz;
                      const nextDate = findNextWorkingDate(selectedDate, d);

                      return (
                        <div
                          key={d.id}
                          className="p-3.5 rounded-2xl border border-dashed border-[#d8e5e2] bg-slate-50/70 text-left flex items-center justify-between"
                        >
                          <div>
                            <p className="font-semibold text-xs text-[#152f34]">Dr. {fullName}</p>
                            <p className="text-[11px] text-[#52696e]">{title}</p>
                            <span className="text-[10px] text-amber-700 font-medium block mt-1">
                              {language === 'ru' ? 'Ближайший прием:' : 'Eng yaqin qabul:'} {nextDate}
                            </span>
                          </div>
                          {nextDate !== selectedDate && (
                            <button
                              type="button"
                              onClick={() => {
                                handleSelectDate(nextDate);
                                handleSelectDoctor(d.id);
                              }}
                              className="px-2.5 py-1.5 bg-white border border-[#d8e5e2] hover:border-[#167b78] text-[#167b78] font-bold text-[11px] rounded-xl shadow-sm transition-colors cursor-pointer"
                            >
                              {language === 'ru' ? 'Перейти' : 'O\'tish'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="pt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => goToStep(2)}
                  className="px-5 py-2.5 border border-[#d8e5e2] text-[#152f34] font-semibold rounded-2xl hover:bg-[#f3f8f7] flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>{t.common.back}</span>
                </button>

                <button
                  type="button"
                  disabled={!selectedDoctorId}
                  onClick={() => goToStep(4)}
                  className="px-6 py-3 bg-[#167b78] hover:bg-[#126462] disabled:opacity-50 text-white font-bold rounded-2xl shadow-md shadow-[#167b78]/20 flex items-center gap-2 transition-all cursor-pointer"
                >
                  <span>{t.common.next}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Tanlangan doktorning ochiq vaqtini ko'rsatish (Doctor's Open Time Slots) */}
          {step === 4 && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-xl font-bold text-[#152f34] flex items-center gap-2">
                    <Clock className="w-5 h-5 text-[#167b78]" />
                    <span>{t.booking.selectSlot}</span>
                  </h2>
                  <p className="text-xs text-[#52696e] mt-0.5">
                    {language === 'ru'
                      ? 'Выберите наиболее подходящее свободное время для вашего визита'
                      : 'Tashrifingiz uchun eng qulay bo\'sh qabul vaqtini tanlang'}
                  </p>
                </div>

                {selectedSlotTime && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#eaf5f2] border border-[#d8e5e2] text-[#167b78] text-xs font-bold">
                    <Clock className="w-3.5 h-3.5 text-[#167b78]" />
                    <span>
                      {new Date(selectedSlotTime).toLocaleTimeString(
                        language === 'ru' ? 'ru-RU' : 'uz-UZ',
                        {
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: 'Asia/Tashkent',
                        }
                      )}
                    </span>
                  </div>
                )}
              </div>

              {/* Doctor and Date Recap Card */}
              {selectedDoctorObj && (
                <div className="p-4 rounded-2xl bg-[#eaf5f2] border border-[#d8e5e2] text-xs text-[#152f34] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-bold text-[#152f34]">
                      <User className="w-4 h-4 text-[#167b78]" />
                      <span>
                        Dr.{' '}
                        {language === 'ru' && selectedDoctorObj.firstNameRu
                          ? `${selectedDoctorObj.firstNameRu} ${selectedDoctorObj.lastNameRu}`
                          : `${selectedDoctorObj.firstNameUz} ${selectedDoctorObj.lastNameUz}`}
                      </span>
                      <span className="text-[#52696e] font-normal">
                        ({selectedDoctorObj.titleUz || 'Stomatolog'})
                      </span>
                    </div>
                    <p className="text-[#52696e] pl-6">
                      📅 <span className="capitalize">{formattedSelectedDate}</span>
                    </p>
                  </div>
                  <div className="sm:border-l sm:border-[#d8e5e2] sm:pl-4 shrink-0 text-right sm:text-left">
                    <span className="text-[#52696e] block text-[10px] uppercase font-semibold">
                      {t.booking.estimatedDuration}:
                    </span>
                    <span className="font-extrabold text-[#167b78] text-sm">
                      {totalDuration} {t.booking.minutes}
                    </span>
                  </div>
                </div>
              )}

              {/* Slots Grid */}
              <div>
                <label className="block text-xs font-semibold text-[#152f34] mb-2.5">
                  {language === 'ru' ? 'Свободные интервалы приёма:' : 'Mavjud bo\'sh qabul vaqtlari:'}
                </label>

                {isLoadingSlots ? (
                  <div className="p-8 text-center text-[#52696e] text-sm bg-[#f3f8f7] rounded-2xl border border-[#d8e5e2]">
                    <div className="inline-block w-6 h-6 border-2 border-[#167b78] border-t-transparent rounded-full animate-spin mb-2" />
                    <p>{t.common.loading}</p>
                  </div>
                ) : availableSlots.length === 0 ? (
                  <div className="p-8 text-center text-[#52696e] text-sm bg-[#f3f8f7] rounded-2xl border border-dashed border-[#d8e5e2] space-y-3">
                    <p className="font-semibold text-[#152f34]">{t.booking.noSlots}</p>
                    <p className="text-xs text-[#52696e]">
                      {language === 'ru'
                        ? 'Пожалуйста, выберите другую дату или вернитесь к выбору специалиста.'
                        : 'Iltimos, boshqa sanani tanlang yoki boshqa shifokorni ko\'ring.'}
                    </p>
                    <div className="flex items-center justify-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => goToStep(1)}
                        className="px-4 py-2 bg-[#167b78] text-white rounded-xl text-xs font-bold hover:bg-[#126462] cursor-pointer"
                      >
                        {language === 'ru' ? 'Сменить дату' : 'Sanani o\'zgartirish'}
                      </button>
                      <button
                        type="button"
                        onClick={() => goToStep(3)}
                        className="px-4 py-2 bg-white border border-[#d8e5e2] text-[#152f34] rounded-xl text-xs font-bold hover:bg-[#f3f8f7] cursor-pointer"
                      >
                        {language === 'ru' ? 'Выбрать другого врача' : 'Boshqa shifokor'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5 max-h-64 overflow-y-auto pr-1">
                    {availableSlots.map((slot) => {
                      const slotDate = new Date(slot.startTime);
                      const timeStr = slotDate.toLocaleTimeString(
                        language === 'ru' ? 'ru-RU' : 'uz-UZ',
                        {
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: 'Asia/Tashkent',
                        }
                      );
                      const isSelected = selectedSlotTime === slot.startTime;

                      return (
                        <button
                          type="button"
                          key={slot.startTime}
                          disabled={!slot.available}
                          onClick={() => setSelectedSlotTime(slot.startTime)}
                          className={`py-3 px-2 rounded-2xl text-xs font-bold transition-all flex flex-col items-center justify-center cursor-pointer ${
                            !slot.available
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed line-through opacity-60'
                              : isSelected
                              ? 'bg-[#167b78] text-white ring-2 ring-[#167b78] shadow-md shadow-[#167b78]/25 scale-[1.02]'
                              : 'bg-[#eaf5f2] text-[#167b78] hover:bg-[#167b78] hover:text-white hover:scale-[1.01]'
                          }`}
                        >
                          <span className="text-sm font-extrabold">{timeStr}</span>
                          <span
                            className={`text-[10px] mt-0.5 ${
                              isSelected ? 'text-[#eaf5f2]' : 'text-[#167b78]'
                            }`}
                          >
                            {totalDuration} {t.booking.minutes}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="pt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => goToStep(3)}
                  className="px-5 py-2.5 border border-[#d8e5e2] text-[#152f34] font-semibold rounded-2xl hover:bg-[#f3f8f7] flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>{t.common.back}</span>
                </button>

                <button
                  type="button"
                  disabled={!selectedSlotTime}
                  onClick={() => goToStep(5)}
                  className="px-6 py-3 bg-[#167b78] hover:bg-[#126462] disabled:opacity-50 text-white font-bold rounded-2xl shadow-md shadow-[#167b78]/20 flex items-center gap-2 transition-all cursor-pointer"
                >
                  <span>{t.common.next}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: Manzil tanlash, o'sha belgilaganlariga qarab recommend qilish (Branch Selection with Intelligent Recommendation) */}
          {step === 5 && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h2 className="text-xl font-bold text-[#152f34] flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-[#167b78]" />
                  <span>{t.booking.selectBranch}</span>
                </h2>
                <p className="text-xs text-[#52696e] mt-1">
                  {language === 'ru'
                    ? 'На основе выбранного врача, даты и времени показан рекомендуемый филиал приема'
                    : 'Tanlangan shifokor, sana va vaqtga asosan tavsiya etilgan klinika filiali ko\'rsatilgan'}
                </p>
              </div>

              {/* Recommendation Callout */}
              {recommendedBranchObj && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-[#eaf5f2] to-[#dff0ec] border border-[#167b78]/30 text-xs text-[#152f34] flex items-start gap-3">
                  <Star className="w-5 h-5 text-amber-500 fill-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-extrabold text-[#152f34] text-sm">
                      {t.booking.branchRecommendedBadge}
                    </p>
                    <p className="text-[#52696e] mt-0.5 leading-relaxed">
                      Dr.{' '}
                      {selectedDoctorObj
                        ? `${selectedDoctorObj.firstNameUz} ${selectedDoctorObj.lastNameUz}`
                        : 'Shifokor'}{' '}
                      {selectedDate} kuni aynan{' '}
                      <strong>
                        {language === 'ru' && recommendedBranchObj.nameRu
                          ? recommendedBranchObj.nameRu
                          : recommendedBranchObj.nameUz}
                      </strong>{' '}
                      filialida qabul qiladi.
                    </p>
                  </div>
                </div>
              )}

              {/* Branches Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {branches.map((b) => {
                  const name = language === 'ru' && b.nameRu ? b.nameRu : b.nameUz;
                  const addr = language === 'ru' && b.addressRu ? b.addressRu : b.addressUz;
                  const isSelected = selectedBranchId === b.id;
                  const isRecommended = recommendedBranchObj?.id === b.id;

                  return (
                    <button
                      type="button"
                      key={b.id}
                      onClick={() => setSelectedBranchId(b.id)}
                      className={`p-5 rounded-2xl border text-left transition-all relative cursor-pointer group ${
                        isSelected
                          ? 'border-[#167b78] bg-[#f3f8f7] ring-2 ring-[#167b78] shadow-md shadow-[#167b78]/10'
                          : isRecommended
                          ? 'border-[#167b78]/60 bg-white hover:bg-[#fbfdfd]'
                          : 'border-[#d8e5e2] hover:border-[#167b78]/50 bg-white hover:bg-[#fbfdfd]'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          {isRecommended && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-[#167b78] text-white mb-2 shadow-sm">
                              <Star className="w-3 h-3 fill-amber-300 text-amber-300" />
                              <span>{language === 'ru' ? 'Рекомендуется' : 'Tavsiya etiladi'}</span>
                            </span>
                          )}
                          <p className="font-bold text-base text-[#152f34]">{name}</p>
                          <p className="text-xs text-[#52696e] mt-1 flex items-start gap-1">
                            <MapPin className="w-3.5 h-3.5 text-[#167b78] shrink-0 mt-0.5" />
                            <span>{addr}</span>
                          </p>
                        </div>
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all ${
                            isSelected
                              ? 'bg-[#167b78] text-white'
                              : 'border border-[#d8e5e2] text-transparent group-hover:border-[#167b78]'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </span>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-[#d8e5e2]/60 flex items-center justify-between text-xs">
                        <span className="text-[#167b78] font-semibold flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{b.openingHours || '09:00 - 20:00'}</span>
                        </span>
                        {b.phone && (
                          <span className="text-[#52696e] flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            <span>{b.phone}</span>
                          </span>
                        )}
                      </div>

                      {!isRecommended && (
                        <p className="text-[10px] text-[#718b90] mt-2 italic">
                          *{t.booking.branchOtherNote}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="pt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => goToStep(4)}
                  className="px-5 py-2.5 border border-[#d8e5e2] text-[#152f34] font-semibold rounded-2xl hover:bg-[#f3f8f7] flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>{t.common.back}</span>
                </button>

                <button
                  type="button"
                  disabled={!selectedBranchId}
                  onClick={() => goToStep(6)}
                  className="px-6 py-3 bg-[#167b78] hover:bg-[#126462] disabled:opacity-50 text-white font-bold rounded-2xl shadow-md shadow-[#167b78]/20 flex items-center gap-2 transition-all cursor-pointer"
                >
                  <span>{t.common.next}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 6: Bemor ma'lumotlari (Patient Contact Details & Final Confirmation) */}
          {step === 6 && (
            <form onSubmit={handleFinalSubmit} className="space-y-6 animate-fade-in">
              <div>
                <h2 className="text-xl font-bold text-[#152f34] flex items-center gap-2">
                  <User className="w-5 h-5 text-[#167b78]" />
                  <span>{t.booking.patientInfo}</span>
                </h2>
                <p className="text-xs text-[#52696e] mt-0.5">
                  {language === 'ru'
                    ? 'Заполните контактные данные для подтверждения и напоминания о визите'
                    : 'Qabulni tasdiqlash va eslatma yuborish uchun bog\'lanish ma\'lumotlaringizni kiriting'}
                </p>
              </div>

              {/* Complete Booking Summary Card */}
              <div className="p-5 bg-gradient-to-br from-[#f3f8f7] to-[#eaf5f2] rounded-3xl border border-[#d8e5e2] text-xs text-[#152f34] space-y-2.5">
                <div className="flex items-center justify-between pb-2 border-b border-[#d8e5e2]/70">
                  <span className="font-bold uppercase tracking-wider text-[11px] text-[#167b78]">
                    {language === 'ru' ? 'Сводка бронирования:' : 'Qabul xulosasi:'}
                  </span>
                  <span className="text-[11px] font-bold text-[#152f34]">
                    {(totalPrice / 100).toLocaleString(language === 'ru' ? 'ru-RU' : 'uz-UZ')}{' '}
                    {t.common.uzs}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[#52696e] block text-[11px]">{t.common.date} & {t.common.time}:</span>
                    <strong className="text-[#152f34] capitalize">
                      {formattedSelectedDate},{' '}
                      {selectedSlotTime
                        ? new Date(selectedSlotTime).toLocaleTimeString(
                            language === 'ru' ? 'ru-RU' : 'uz-UZ',
                            { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' }
                          )
                        : ''}{' '}
                      ({totalDuration} {t.booking.minutes})
                    </strong>
                  </div>

                  <div>
                    <span className="text-[#52696e] block text-[11px]">{t.common.doctor}:</span>
                    <strong className="text-[#152f34]">
                      Dr.{' '}
                      {selectedDoctorObj
                        ? `${selectedDoctorObj.firstNameUz} ${selectedDoctorObj.lastNameUz}`
                        : 'Tanlangan shifokor'}
                    </strong>
                  </div>

                  <div>
                    <span className="text-[#52696e] block text-[11px]">{t.common.service}:</span>
                    <strong className="text-[#152f34]">
                      {serverServiceName ||
                        selectedServices
                          .map((s) => (language === 'ru' && s.nameRu ? s.nameRu : s.nameUz))
                          .join(', ')}
                    </strong>
                  </div>

                  <div>
                    <span className="text-[#52696e] block text-[11px]">{t.common.branch}:</span>
                    <strong className="text-[#152f34]">
                      {selectedBranchObj?.nameUz || 'Asosiy filial'}
                    </strong>
                    {selectedBranchId === recommendedBranchObj?.id && (
                      <span className="ml-1.5 text-[10px] text-[#167b78] font-bold">
                        (★ Tavsiya etilgan)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Patient Fields */}
              <div className="space-y-4">
                {/* Full Name */}
                <div>
                  <label className="block text-xs font-semibold text-[#152f34] mb-1">
                    {t.common.name} *
                  </label>
                  <input
                    type="text"
                    required
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    placeholder={t.booking.fullNamePlaceholder}
                    className="w-full px-4 py-2.5 rounded-xl border border-[#d8e5e2] text-sm focus:outline-none focus:ring-2 focus:ring-[#167b78] bg-white text-[#152f34]"
                  />
                </div>

                {/* Phone (+998 canonical validated) */}
                <div>
                  <PhoneInput
                    label={t.common.phone}
                    required
                    value={patientPhone}
                    locale={language}
                    onChange={(canonical) => {
                      setPatientPhone(canonical);
                    }}
                  />
                </div>

                {/* Email (Optional but regex validated) */}
                <div>
                  <label className="block text-xs font-semibold text-[#152f34] mb-1">
                    {t.common.email} ({language === 'ru' ? 'необязательно' : 'ixtiyoriy'})
                  </label>
                  <input
                    type="email"
                    value={patientEmail}
                    onChange={(e) => {
                      setIsEmailTouched(true);
                      setPatientEmail(e.target.value);
                    }}
                    onBlur={() => setIsEmailTouched(true)}
                    placeholder="bemor@misol.uz"
                    className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 bg-white text-[#152f34] transition-colors ${
                      isEmailTouched && !isEmailValid
                        ? 'border-red-400 focus:ring-red-500'
                        : 'border-[#d8e5e2] focus:ring-[#167b78]'
                    }`}
                  />
                  {isEmailTouched && !isEmailValid && (
                    <p className="text-[11px] text-red-600 mt-1 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{t.booking.emailValidationError}</span>
                    </p>
                  )}
                </div>

                {/* Note */}
                <div>
                  <label className="block text-xs font-semibold text-[#152f34] mb-1">
                    {t.common.note}
                  </label>
                  <textarea
                    rows={2}
                    value={patientNote}
                    onChange={(e) => setPatientNote(e.target.value)}
                    placeholder={
                      language === 'ru'
                        ? 'Симптомы, жалобы...'
                        : 'Tish og\'rig\'i, bezovta qilayotgan belgilar...'
                    }
                    className="w-full px-4 py-2 rounded-xl border border-[#d8e5e2] text-sm focus:outline-none focus:ring-2 focus:ring-[#167b78] bg-white text-[#152f34]"
                  />
                </div>

                {/* Consent Checkbox */}
                <label className="flex items-start gap-2.5 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={consentGiven}
                    onChange={(e) => setConsentGiven(e.target.checked)}
                    className="mt-1 w-4 h-4 text-[#167b78] rounded border-[#d8e5e2] focus:ring-[#167b78]"
                  />
                  <span className="text-xs text-[#52696e] leading-relaxed">
                    {t.booking.consentText}
                  </span>
                </label>
              </div>

              <div className="pt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => goToStep(5)}
                  className="px-5 py-2.5 border border-[#d8e5e2] text-[#152f34] font-semibold rounded-2xl hover:bg-[#f3f8f7] flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>{t.common.back}</span>
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting || !isPhoneValid || !isEmailValid}
                  className="px-8 py-3.5 bg-[#167b78] hover:bg-[#126462] disabled:opacity-50 text-white font-bold rounded-2xl shadow-lg shadow-[#167b78]/20 flex items-center gap-2 transition-all cursor-pointer"
                >
                  {isSubmitting ? (
                    <span>{t.common.loading}</span>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>{t.common.confirm}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* STEP 7: Booking Result & Confirmation */}
          {step === 7 && bookingResult && (
            <div className="text-center py-6 animate-fade-in space-y-6">
              <div className="w-20 h-20 bg-[#eaf5f2] text-[#167b78] rounded-3xl flex items-center justify-center mx-auto shadow-md">
                <CheckCircle2 className="w-12 h-12" />
              </div>

              <div>
                <h2 className="text-2xl font-extrabold text-[#152f34] mb-2">
                  {t.booking.bookingSuccess}
                </h2>
                <p className="text-sm text-[#52696e] max-w-lg mx-auto leading-relaxed">
                  {t.booking.requestReceivedNotice}
                </p>
              </div>

              {/* Appointment Details Box */}
              <div className="p-6 bg-[#f3f8f7] rounded-3xl max-w-md mx-auto text-left text-sm space-y-2.5 border border-[#d8e5e2]">
                <div className="flex justify-between border-b border-[#d8e5e2]/60 pb-2">
                  <span className="text-[#52696e]">{t.booking.appointmentId}:</span>
                  <span className="font-mono font-bold text-[#152f34] text-xs">
                    {bookingResult.appointmentId}
                  </span>
                </div>
                <div className="flex justify-between border-b border-[#d8e5e2]/60 pb-2">
                  <span className="text-[#52696e]">{t.common.status}:</span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#eaf5f2] text-[#167b78] border border-[#d8e5e2]">
                    {bookingResult.status === 'PENDING'
                      ? language === 'ru'
                        ? 'Ожидает подтверждения'
                        : 'Kutilmoqda (So\'rov qabul qilindi)'
                      : bookingResult.status}
                  </span>
                </div>
                <div className="flex justify-between border-b border-[#d8e5e2]/60 pb-2">
                  <span className="text-[#52696e]">{t.common.service}:</span>
                  <span className="font-semibold text-[#152f34]">{bookingResult.serviceName}</span>
                </div>

                {/* Service Items Itemized Breakdown */}
                {bookingResult.serviceItems && bookingResult.serviceItems.length > 0 && (
                  <div className="py-2 border-b border-[#d8e5e2]/60 space-y-1.5">
                    <span className="text-[11px] font-bold text-[#152f34] uppercase block">
                      {t.booking.selectedServices}:
                    </span>
                    {bookingResult.serviceItems.map((item: any, idx: number) => (
                      <div
                        key={item.id || idx}
                        className="flex items-center justify-between text-xs bg-white p-2.5 rounded-xl border border-[#d8e5e2]"
                      >
                        <span className="font-medium text-[#152f34]">
                          {language === 'ru' && item.serviceNameRu ? item.serviceNameRu : item.serviceNameUz}
                        </span>
                        <div className="text-right">
                          <span className="text-[#52696e] mr-2">
                            {item.durationMinutes} {t.booking.minutes}
                          </span>
                          {item.priceFrom ? (
                            <span className="font-bold text-[#167b78]">
                              {(item.priceFrom / 100).toLocaleString(
                                language === 'ru' ? 'ru-RU' : 'uz-UZ'
                              )}{' '}
                              {t.common.uzs}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-between border-b border-[#d8e5e2]/60 pb-2">
                  <span className="text-[#52696e]">{t.common.time}:</span>
                  <span className="font-semibold text-[#152f34]">
                    {new Date(bookingResult.startTime).toLocaleString(
                      language === 'ru' ? 'ru-RU' : 'uz-UZ',
                      {
                        timeZone: 'Asia/Tashkent',
                      }
                    )}
                  </span>
                </div>
                <div className="flex justify-between border-b border-[#d8e5e2]/60 pb-2">
                  <span className="text-[#52696e]">{t.common.doctor}:</span>
                  <span className="font-semibold text-[#152f34]">{bookingResult.doctorName}</span>
                </div>
                <div className="flex justify-between border-b border-[#d8e5e2]/60 pb-2">
                  <span className="text-[#52696e]">{t.common.branch}:</span>
                  <span className="font-semibold text-[#152f34]">{bookingResult.branchName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#52696e]">{t.booking.estimatedDuration}:</span>
                  <span className="font-semibold text-[#152f34]">
                    {bookingResult.durationMinutes || totalDuration} {t.booking.minutes}
                  </span>
                </div>
              </div>

              {/* Self-service Link & Management Token */}
              <div className="p-5 bg-[#eaf5f2] border border-[#d8e5e2] rounded-3xl max-w-md mx-auto text-left">
                <div className="flex items-start gap-2.5">
                  <Info className="w-5 h-5 text-[#167b78] shrink-0 mt-0.5" />
                  <div className="text-xs text-[#152f34] space-y-2">
                    <p className="font-semibold text-[#152f34]">
                      {language === 'ru'
                        ? 'Ссылка для управления записью:'
                        : 'Qabulni mustaqil boshqarish havolasi:'}
                    </p>
                    <p className="text-[#52696e]">{t.booking.managementTokenNotice}</p>
                    <button
                      type="button"
                      onClick={copyManagementUrl}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-[#d8e5e2] rounded-xl text-[#167b78] font-bold shadow-sm hover:bg-[#f3f8f7] transition-colors cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>
                        {copiedToken
                          ? language === 'ru'
                            ? 'Скопировано!'
                            : 'Nusxa olindi!'
                          : language === 'ru'
                          ? 'Скопировать ссылку'
                          : 'Havoladan nusxa olish'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
                <Link
                  href={`/booking/status/${bookingResult.publicToken}`}
                  className="w-full sm:w-auto px-6 py-3 bg-[#167b78] hover:bg-[#126462] text-white font-semibold rounded-2xl shadow-md shadow-[#167b78]/20 transition-all text-center"
                >
                  {t.booking.trackBooking}
                </Link>
                <Link
                  href="/"
                  className="w-full sm:w-auto px-6 py-3 bg-white border border-[#d8e5e2] text-[#152f34] font-semibold rounded-2xl hover:bg-[#f3f8f7] transition-colors text-center"
                >
                  {t.nav.home}
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function BookingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen py-24 flex items-center justify-center text-slate-500 font-medium">
          Yuklanmoqda...
        </div>
      }
    >
      <BookingContent />
    </Suspense>
  );
}
