'use client';

import React, { useState, useEffect, Suspense, useMemo } from 'react';
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
  Plus,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { api } from '../../lib/api';

const DAY_NAME_MAP: Record<string, string> = {
  MONDAY: 'Dushanba',
  TUESDAY: 'Seshanba',
  WEDNESDAY: 'Chorshanba',
  THURSDAY: 'Payshanba',
  FRIDAY: 'Juma',
  SATURDAY: 'Shanba',
  SUNDAY: 'Yakshanba',
};

const SHORT_DAY_NAMES = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Juma', 'Shan'];

const UZ_DAY_TO_INT: Record<string, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

function formatUzPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  let localDigits = digits;
  if (digits.startsWith('998')) {
    localDigits = digits.slice(3);
  }
  localDigits = localDigits.slice(0, 9);

  let formatted = '+998';
  if (localDigits.length > 0) {
    formatted += ' (' + localDigits.slice(0, 2);
  }
  if (localDigits.length >= 2) {
    formatted += ') ' + localDigits.slice(2, 5);
  }
  if (localDigits.length >= 5) {
    formatted += '-' + localDigits.slice(5, 7);
  }
  if (localDigits.length >= 7) {
    formatted += '-' + localDigits.slice(7, 9);
  }
  return formatted;
}

const PHONE_REGEX = /^\+998\s?\((33|88|90|91|93|94|95|97|98|99|71|77|\d{2})\)\s?\d{3}-\d{2}-\d{2}$|^\+998\d{9}$/;
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

function getDoctorScheduleInfo(doctor: any, branchId?: string): { days: string[]; hours: string; summary: string } {
  if (!doctor?.schedules || doctor.schedules.length === 0) {
    return {
      days: ['Dushanba', 'Chorshanba', 'Juma'],
      hours: '09:00 - 18:00',
      summary: 'Dushanba, Chorshanba, Juma (09:00 - 18:00)',
    };
  }

  const filtered = branchId
    ? doctor.schedules.filter((s: any) => s.branchId === branchId && s.isActive !== false)
    : doctor.schedules.filter((s: any) => s.isActive !== false);

  const activeSchedules = filtered.length > 0 ? filtered : doctor.schedules;
  const days = Array.from(new Set(activeSchedules.map((s: any) => DAY_NAME_MAP[s.dayOfWeek] || s.dayOfWeek))) as string[];
  const hours = activeSchedules[0] ? `${activeSchedules[0].startTime} - ${activeSchedules[0].endTime}` : '09:00 - 18:00';
  const summary = `${days.join(', ')} (${hours})`;

  return { days, hours, summary };
}

function isDoctorWorkingOnDate(dateStr: string, doctor: any, branchId?: string): boolean {
  if (!doctor?.schedules || doctor.schedules.length === 0) return true;
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return false;
  const dateObj = new Date(y, m - 1, d);
  const dayOfWeekNum = dateObj.getDay();

  const filtered = branchId
    ? doctor.schedules.filter((s: any) => s.branchId === branchId && s.isActive !== false)
    : doctor.schedules.filter((s: any) => s.isActive !== false);
  const activeSchedules = filtered.length > 0 ? filtered : doctor.schedules;

  return activeSchedules.some((s: any) => UZ_DAY_TO_INT[s.dayOfWeek] === dayOfWeekNum);
}

function findNextWorkingDate(startDateStr: string, doctor: any, branchId?: string): string {
  const [y, m, d] = startDateStr.split('-').map(Number);
  let cur = new Date(y, m - 1, d);
  for (let i = 0; i < 14; i++) {
    const curStr = cur.toISOString().split('T')[0];
    if (isDoctorWorkingOnDate(curStr, doctor, branchId)) {
      return curStr;
    }
    cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
  }
  return startDateStr;
}

function BookingContent() {
  const { t, language } = useI18n();
  const searchParams = useSearchParams();

  // Step state (1: Branch, 2: Service, 3: Doctor, 4: Date & Slot, 5: Patient info, 6: Result)
  const [step, setStep] = useState<number>(1);

  // Form state
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedSlotTime, setSelectedSlotTime] = useState<string>('');

  const [patientName, setPatientName] = useState<string>('');
  const [patientPhone, setPatientPhone] = useState<string>('+998 ');
  const [patientEmail, setPatientEmail] = useState<string>('');
  const [patientNote, setPatientNote] = useState<string>('');
  const [consentGiven, setConsentGiven] = useState<boolean>(true);

  // Validation state
  const [isPhoneTouched, setIsPhoneTouched] = useState<boolean>(false);
  const [isEmailTouched, setIsEmailTouched] = useState<boolean>(false);

  // Data collections from backend
  const [branches, setBranches] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);

  // Loading & error states
  const [isLoadingData, setIsLoadingData] = useState<boolean>(true);
  const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Confirmation result
  const [bookingResult, setBookingResult] = useState<any | null>(null);
  const [copiedToken, setCopiedToken] = useState<boolean>(false);

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

        setBranches(branchesRes || []);
        setServices(servicesRes || []);
        setDoctors(doctorsRes || []);

        // Check query parameters
        const qBranch = searchParams.get('branchId');
        const qService = searchParams.get('serviceId');
        const qDoctor = searchParams.get('doctorId');

        if (qBranch) setSelectedBranchId(qBranch);
        if (qService) {
          setSelectedServiceIds([qService]);
          setStep(2);
        }
        if (qDoctor) {
          setSelectedDoctorId(qDoctor);
          setStep(3);
        }

        // Default date to tomorrow in YYYY-MM-DD
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const dateStr = tomorrow.toISOString().split('T')[0];
        setSelectedDate(dateStr);
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

  const totalDuration = useMemo(() => {
    return selectedServices.reduce((sum, s) => sum + (s.durationMinutes || 30), 0);
  }, [selectedServices]);

  const totalPrice = useMemo(() => {
    return selectedServices.reduce((sum, s) => sum + (s.priceFrom || 0), 0);
  }, [selectedServices]);

  const selectedDoctorObj = useMemo(() => {
    return doctors.find((d) => d.id === selectedDoctorId);
  }, [doctors, selectedDoctorId]);

  const selectedBranchObj = useMemo(() => {
    return branches.find((b) => b.id === selectedBranchId);
  }, [branches, selectedBranchId]);

  // Doctor schedule for currently selected branch
  const doctorScheduleInfo = useMemo(() => {
    return getDoctorScheduleInfo(selectedDoctorObj, selectedBranchId);
  }, [selectedDoctorObj, selectedBranchId]);

  // Check if current date is working day for doctor
  const isSelectedDateWorkingDay = useMemo(() => {
    if (!selectedDate || !selectedDoctorObj) return true;
    return isDoctorWorkingOnDate(selectedDate, selectedDoctorObj, selectedBranchId);
  }, [selectedDate, selectedDoctorObj, selectedBranchId]);

  // Nearest working date
  const nextWorkingDate = useMemo(() => {
    if (!selectedDoctorObj || !selectedDate) return selectedDate;
    return findNextWorkingDate(selectedDate, selectedDoctorObj, selectedBranchId);
  }, [selectedDoctorObj, selectedDate, selectedBranchId]);

  // Toggle service selection (up to 3 services)
  const toggleService = (serviceId: string) => {
    setSelectedServiceIds((prev) => {
      if (prev.includes(serviceId)) {
        return prev.filter((id) => id !== serviceId);
      } else {
        if (prev.length >= 3) {
          setErrorMessage('Bir vaqtning o\'zida ko\'pi bilan 3 ta xizmat tanlash mumkin');
          return prev;
        }
        setErrorMessage(null);
        return [...prev, serviceId];
      }
    });
  };

  // When step 4 opens, automatically snap date to nearest working date if non-working day
  useEffect(() => {
    if (step === 4 && selectedDoctorObj && selectedDate) {
      if (!isDoctorWorkingOnDate(selectedDate, selectedDoctorObj, selectedBranchId)) {
        const nextDate = findNextWorkingDate(selectedDate, selectedDoctorObj, selectedBranchId);
        if (nextDate !== selectedDate) {
          setSelectedDate(nextDate);
        }
      }
    }
  }, [step, selectedDoctorObj, selectedBranchId]);

  // Load available slots when Doctor, Service, and Date are chosen
  useEffect(() => {
    async function fetchSlots() {
      if (!selectedDoctorId || selectedServiceIds.length === 0 || !selectedDate) {
        setAvailableSlots([]);
        return;
      }

      try {
        setIsLoadingSlots(true);
        setErrorMessage(null);
        const slots = await api.getAvailableSlots(
          selectedDoctorId,
          selectedDate,
          selectedServiceIds[0],
          selectedBranchId || undefined,
          totalDuration,
          selectedServiceIds
        );
        setAvailableSlots(slots || []);
      } catch (err: any) {
        setAvailableSlots([]);
        setErrorMessage(err?.message || 'Bo\'sh vaqtlarni yuklashda xatolik yuz berdi');
      } finally {
        setIsLoadingSlots(false);
      }
    }

    if (step === 4) {
      fetchSlots();
    }
  }, [step, selectedDoctorId, selectedServiceIds, selectedDate, selectedBranchId, totalDuration]);

  // Real-time validation checks
  const isPhoneValid = useMemo(() => {
    const digitsOnly = patientPhone.replace(/\D/g, '');
    return digitsOnly.length === 12 && digitsOnly.startsWith('998');
  }, [patientPhone]);

  const isEmailValid = useMemo(() => {
    if (!patientEmail.trim()) return true; // optional
    return EMAIL_REGEX.test(patientEmail.trim());
  }, [patientEmail]);

  // Handle phone input changes with auto-formatting
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsPhoneTouched(true);
    const formatted = formatUzPhone(e.target.value);
    setPatientPhone(formatted);
  };

  // Handle final submission
  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPhoneTouched(true);
    setIsEmailTouched(true);

    if (!consentGiven) {
      setErrorMessage(t.booking.consentError);
      return;
    }

    if (!patientName.trim()) {
      setErrorMessage('Iltimos, ismingizni kiriting');
      return;
    }

    if (!isPhoneValid) {
      setErrorMessage('Iltimos, telefon raqamini to\'liq kiriting (+998 XX XXX-XX-XX)');
      return;
    }

    if (!isEmailValid) {
      setErrorMessage('Elektron pochta manzili formati noto\'g\'ri');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      // Create booking payload with multi-service and custom combined duration
      const result = await api.createBooking({
        branchId: selectedBranchId || undefined,
        serviceId: selectedServiceIds[0],
        serviceIds: selectedServiceIds,
        customDurationMinutes: totalDuration,
        doctorId: selectedDoctorId,
        startTime: selectedSlotTime,
        patientName: patientName.trim(),
        patientPhone: patientPhone.trim(),
        patientEmail: patientEmail.trim() || undefined,
        note: patientNote.trim() || undefined,
        consentGiven,
      });

      setBookingResult({
        ...result,
        doctorName:
          result.doctorName ||
          (selectedDoctorObj
            ? `Dr. ${selectedDoctorObj.firstNameUz} ${selectedDoctorObj.lastNameUz}`
            : 'Shifokor'),
        branchName: result.branchName || selectedBranchObj?.nameUz || 'Asosiy filial',
        serviceName:
          result.serviceName ||
          selectedServices.map((s) => s.nameUz).join(', '),
        durationMinutes: result.durationMinutes || totalDuration,
      });
      setStep(6);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Qabulga yozilishda xatolik yuz berdi. Iltimos qayta urinib ko\'ring.');
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

  // Quick 10-day date chip generator
  const dateChips = useMemo(() => {
    const list: Array<{ dateStr: string; dayName: string; dayNum: string; monthStr: string; isWorking: boolean }> = [];
    const base = new Date();
    // Start from tomorrow
    base.setDate(base.getDate() + 1);

    for (let i = 0; i < 10; i++) {
      const cur = new Date(base.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = cur.toISOString().split('T')[0];
      const dayName = SHORT_DAY_NAMES[cur.getDay()];
      const dayNum = String(cur.getDate());
      const monthStr = cur.toLocaleDateString('uz-UZ', { month: 'short' });
      const isWorking = selectedDoctorObj
        ? isDoctorWorkingOnDate(dateStr, selectedDoctorObj, selectedBranchId)
        : true;

      list.push({ dateStr, dayName, dayNum, monthStr, isWorking });
    }
    return list;
  }, [selectedDoctorObj, selectedBranchId]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
      {/* Title Header */}
      <div className="text-center mb-10">
        <span className="text-xs font-bold uppercase tracking-widest text-teal-700">
          DentaCare Online
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-1">
          {t.booking.title}
        </h1>
        <p className="text-sm text-slate-500 max-w-xl mx-auto mt-2">
          {t.booking.subtitle}
        </p>
      </div>

      {/* Progress Steps Header */}
      {step < 6 && (
        <div className="flex items-center justify-between mb-8 overflow-x-auto py-2">
          {[
            { num: 1, label: t.booking.stepBranch },
            { num: 2, label: t.booking.stepService },
            { num: 3, label: t.booking.stepDoctor },
            { num: 4, label: t.booking.stepTime },
            { num: 5, label: t.booking.stepDetails },
          ].map((item, idx) => (
            <React.Fragment key={item.num}>
              <div className="flex flex-col items-center shrink-0">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs transition-all ${
                    step === item.num
                      ? 'bg-teal-700 text-white ring-4 ring-teal-100 shadow-md'
                      : step > item.num
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {step > item.num ? <CheckCircle2 className="w-4 h-4" /> : item.num}
                </div>
                <span className="text-[11px] font-semibold text-slate-600 mt-1.5 hidden sm:block">
                  {item.label}
                </span>
              </div>
              {idx < 4 && (
                <div
                  className={`flex-1 h-0.5 mx-2 transition-all ${
                    step > idx + 1 ? 'bg-emerald-500' : 'bg-slate-200'
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Error Banner */}
      {errorMessage && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-sm text-red-800 animate-fade-in">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Booking Form Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-10 shadow-xl border border-slate-100 relative">
        {/* STEP 1: Branch Selection */}
        {step === 1 && (
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-teal-700" />
              <span>{t.booking.selectBranch}</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {branches.map((b) => {
                const name = language === 'ru' && b.nameRu ? b.nameRu : b.nameUz;
                const addr = language === 'ru' && b.addressRu ? b.addressRu : b.addressUz;
                const isSelected = selectedBranchId === b.id;

                return (
                  <button
                    type="button"
                    key={b.id}
                    onClick={() => setSelectedBranchId(b.id)}
                    className={`p-5 rounded-2xl border text-left transition-all ${
                      isSelected
                        ? 'border-teal-700 bg-teal-50/50 ring-2 ring-teal-600'
                        : 'border-slate-200 hover:border-teal-300 bg-white'
                    }`}
                  >
                    <p className="font-bold text-base text-slate-900">{name}</p>
                    <p className="text-xs text-slate-500 mt-1">{addr}</p>
                    <p className="text-xs text-teal-700 font-semibold mt-3 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{b.openingHours || '09:00 - 20:00'}</span>
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-6 py-3 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-xl shadow-md flex items-center gap-2"
              >
                <span>{t.common.next}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Service Selection (Multi-Select Support) */}
        {step === 2 && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <div>
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Stethoscope className="w-5 h-5 text-teal-700" />
                  <span>{t.booking.selectService}</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Bir vaqtning o&apos;zida 1 tadan 3 tagacha xizmatni tanlashingiz mumkin
                </p>
              </div>

              {selectedServiceIds.length > 0 && (
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-xs font-bold">
                  <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                  <span>{selectedServiceIds.length} ta tanlandi</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[440px] overflow-y-auto pr-2">
              {services.map((s) => {
                const name = language === 'ru' && s.nameRu ? s.nameRu : s.nameUz;
                const price = (s.priceFrom / 100).toLocaleString('uz-UZ');
                const isSelected = selectedServiceIds.includes(s.id);

                return (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => toggleService(s.id)}
                    className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between relative group ${
                      isSelected
                        ? 'border-teal-700 bg-teal-50/60 ring-2 ring-teal-600 shadow-sm'
                        : 'border-slate-200 hover:border-teal-300 bg-white hover:bg-slate-50/50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                        <span className="font-bold text-teal-700 uppercase tracking-wider text-[10px]">
                          {s.category}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-500">{s.durationMinutes} daq</span>
                          <span
                            className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                              isSelected
                                ? 'bg-teal-700 text-white'
                                : 'border border-slate-300 text-transparent group-hover:border-teal-500'
                            }`}
                          >
                            <Check className="w-3 h-3 stroke-[3]" />
                          </span>
                        </div>
                      </div>
                      <p className="font-bold text-sm text-slate-900 pr-6">{name}</p>
                    </div>
                    <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">Boshlang&apos;ich narxi:</span>
                      <p className="text-xs font-extrabold text-teal-900">
                        {price} {t.common.uzs}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Selected Services Summary Pill */}
            {selectedServiceIds.length > 0 && (
              <div className="p-4 rounded-2xl bg-teal-50/80 border border-teal-200 text-xs text-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-bold text-teal-950">
                    <CheckCircle2 className="w-4 h-4 text-teal-700" />
                    <span>Tanlangan xizmatlar ({selectedServices.length} ta):</span>
                  </div>
                  <p className="text-slate-600 pl-6">
                    {selectedServices.map((s) => s.nameUz).join(', ')}
                  </p>
                </div>
                <div className="flex items-center gap-4 shrink-0 sm:border-l sm:border-teal-200 sm:pl-4">
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold">Jami vaqt:</span>
                    <span className="font-extrabold text-slate-900 text-sm">{totalDuration} daqiqa</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-semibold">Jami narx:</span>
                    <span className="font-extrabold text-teal-800 text-sm">
                      {(totalPrice / 100).toLocaleString('uz-UZ')} {t.common.uzs}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="pt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-5 py-2.5 border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>{t.common.back}</span>
              </button>

              <button
                type="button"
                disabled={selectedServiceIds.length === 0}
                onClick={() => setStep(3)}
                className="px-6 py-3 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white font-bold rounded-xl shadow-md flex items-center gap-2 transition-all"
              >
                <span>{t.common.next}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Doctor Selection (Displaying Schedules) */}
        {step === 3 && (
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-teal-700" />
              <span>{t.booking.selectDoctor}</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {doctors.map((d) => {
                const fullName = `${language === 'ru' && d.firstNameRu ? d.firstNameRu : d.firstNameUz} ${
                  language === 'ru' && d.lastNameRu ? d.lastNameRu : d.lastNameUz
                }`;
                const title = language === 'ru' && d.titleRu ? d.titleRu : d.titleUz;
                const isSelected = selectedDoctorId === d.id;
                const sched = getDoctorScheduleInfo(d, selectedBranchId);

                return (
                  <button
                    type="button"
                    key={d.id}
                    onClick={() => {
                      setSelectedDoctorId(d.id);
                      // Auto-check nearest working date
                      if (selectedDate) {
                        const nearest = findNextWorkingDate(selectedDate, d, selectedBranchId);
                        setSelectedDate(nearest);
                      }
                    }}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                      isSelected
                        ? 'border-teal-700 bg-teal-50/50 ring-2 ring-teal-600 shadow-sm'
                        : 'border-slate-200 hover:border-teal-300 bg-white'
                    }`}
                  >
                    <p className="font-bold text-sm text-slate-900">Dr. {fullName}</p>
                    <p className="text-xs text-teal-700 font-medium mt-0.5">{title}</p>
                    <p className="text-xs text-slate-400 mt-1">{d.experienceYears}+ yil tajriba</p>

                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-start gap-1.5 text-xs text-slate-600">
                      <Calendar className="w-3.5 h-3.5 text-teal-700 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-semibold text-slate-700 block text-[11px]">
                          Qabul kunlari:
                        </span>
                        <span className="text-[11px] text-teal-900 font-medium">{sched.summary}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-5 py-2.5 border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>{t.common.back}</span>
              </button>

              <button
                type="button"
                disabled={!selectedDoctorId}
                onClick={() => setStep(4)}
                className="px-6 py-3 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white font-bold rounded-xl shadow-md flex items-center gap-2"
              >
                <span>{t.common.next}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Date & Available Slot Selection */}
        {step === 4 && (
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-xl font-bold text-slate-900 mb-1 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-teal-700" />
              <span>{t.booking.selectSlot}</span>
            </h2>

            {/* Doctor working schedule banner */}
            {selectedDoctorObj && (
              <div className="p-3.5 rounded-2xl bg-teal-50/70 border border-teal-200 text-xs text-teal-950 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-bold">
                    Dr. {selectedDoctorObj.firstNameUz} {selectedDoctorObj.lastNameUz}
                  </span>{' '}
                  ish jadvali ({selectedBranchObj?.nameUz || 'Tanlangan filial'}):{' '}
                  <span className="font-semibold text-teal-800">{doctorScheduleInfo.summary}</span>
                </div>
              </div>
            )}

            {/* Quick 10-day date chips */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                Tezkor sana tanlash:
              </label>
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                {dateChips.map((chip) => {
                  const isSelected = selectedDate === chip.dateStr;
                  return (
                    <button
                      type="button"
                      key={chip.dateStr}
                      onClick={() => {
                        setSelectedDate(chip.dateStr);
                        setSelectedSlotTime('');
                      }}
                      className={`flex flex-col items-center py-2 px-3 rounded-2xl min-w-[72px] border text-xs transition-all shrink-0 ${
                        isSelected
                          ? 'border-teal-700 bg-teal-700 text-white shadow-md'
                          : chip.isWorking
                          ? 'border-teal-200 bg-white hover:bg-teal-50/50 text-slate-800'
                          : 'border-slate-200 bg-slate-50 text-slate-400 opacity-75'
                      }`}
                    >
                      <span className={`text-[11px] font-semibold ${isSelected ? 'text-teal-100' : 'text-slate-500'}`}>
                        {chip.dayName}
                      </span>
                      <span className="text-base font-extrabold my-0.5">{chip.dayNum}</span>
                      <span className={`text-[10px] ${isSelected ? 'text-teal-100' : 'text-slate-400'}`}>
                        {chip.monthStr}
                      </span>
                      <div className="mt-1 flex items-center gap-1">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            chip.isWorking
                              ? isSelected
                                ? 'bg-emerald-300'
                                : 'bg-emerald-500'
                              : 'bg-slate-300'
                          }`}
                        />
                        <span className="text-[9px] font-medium">
                          {chip.isWorking ? 'Ish kuni' : 'Dam olish'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Date Picker Input */}
            <div className="pt-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Yoki taqvimdan sanani ko&apos;rsating:
              </label>
              <input
                type="date"
                value={selectedDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setSelectedSlotTime('');
                }}
                className="w-full sm:w-64 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
              />
            </div>

            {/* Non-working Day Guidance Card */}
            {!isSelectedDateWorkingDay && (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">
                      Tanlangan kunda ({selectedDate}) shifokor qabul qilmaydi.
                    </p>
                    <p className="text-amber-800 mt-0.5">
                      Shifokor faqat {doctorScheduleInfo.days.join(', ')} kunlari ishlaydi.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDate(nextWorkingDate);
                    setSelectedSlotTime('');
                  }}
                  className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-sm text-xs flex items-center gap-1.5 shrink-0 self-start sm:self-center"
                >
                  <span>Eng yaqin ish kuniga o&apos;tish ({nextWorkingDate})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Slots Grid */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-semibold text-slate-700">
                  {selectedDate} sana uchun mavjud vaqtlar (Davomiyligi: {totalDuration} daqiqa):
                </label>
                {selectedSlotTime && (
                  <span className="text-xs font-bold text-teal-700">
                    Tanlandi:{' '}
                    {new Date(selectedSlotTime).toLocaleTimeString('uz-UZ', {
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'Asia/Tashkent',
                    })}
                  </span>
                )}
              </div>

              {isLoadingSlots ? (
                <div className="p-8 text-center text-slate-500 text-sm bg-slate-50 rounded-2xl">
                  {t.common.loading}
                </div>
              ) : availableSlots.length === 0 ? (
                <div className="p-8 text-center text-slate-600 text-sm bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-3">
                  <p className="font-semibold text-slate-700">
                    Tanlangan kunda bo&apos;sh vaqtlar mavjud emas yoki kun to&apos;liq band.
                  </p>
                  <p className="text-xs text-slate-500">
                    Dr. {selectedDoctorObj?.firstNameUz} {selectedDoctorObj?.lastNameUz} qabul kunlari:{' '}
                    {doctorScheduleInfo.summary}
                  </p>
                  {nextWorkingDate !== selectedDate && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDate(nextWorkingDate);
                        setSelectedSlotTime('');
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-700 text-white rounded-xl text-xs font-bold shadow-sm hover:bg-teal-800 transition-colors"
                    >
                      <span>Eng yaqin bo&apos;sh kunga o&apos;tish ({nextWorkingDate})</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 max-h-60 overflow-y-auto p-1">
                  {availableSlots.map((slot) => {
                    const slotDate = new Date(slot.startTime);
                    const timeStr = slotDate.toLocaleTimeString('uz-UZ', {
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'Asia/Tashkent',
                    });
                    const isSelected = selectedSlotTime === slot.startTime;

                    return (
                      <button
                        type="button"
                        key={slot.startTime}
                        disabled={!slot.available}
                        onClick={() => setSelectedSlotTime(slot.startTime)}
                        className={`py-3 px-2 rounded-2xl text-xs font-bold transition-all flex flex-col items-center justify-center ${
                          !slot.available
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed line-through opacity-60'
                            : isSelected
                            ? 'bg-teal-700 text-white ring-2 ring-teal-600 shadow-md scale-[1.02]'
                            : 'bg-teal-50 text-teal-800 hover:bg-teal-100 hover:scale-[1.01]'
                        }`}
                      >
                        <span className="text-sm font-extrabold">{timeStr}</span>
                        <span className={`text-[10px] mt-0.5 ${isSelected ? 'text-teal-100' : 'text-teal-600'}`}>
                          {totalDuration} daq
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
                onClick={() => setStep(3)}
                className="px-5 py-2.5 border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>{t.common.back}</span>
              </button>

              <button
                type="button"
                disabled={!selectedSlotTime}
                onClick={() => setStep(5)}
                className="px-6 py-3 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white font-bold rounded-xl shadow-md flex items-center gap-2"
              >
                <span>{t.common.next}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: Patient Contact Details & Consent */}
        {step === 5 && (
          <form onSubmit={handleFinalSubmit} className="space-y-6 animate-fade-in">
            <h2 className="text-xl font-bold text-slate-900 mb-2 flex items-center gap-2">
              <User className="w-5 h-5 text-teal-700" />
              <span>{t.booking.patientInfo}</span>
            </h2>

            {/* Summary Preview Box */}
            <div className="p-4 bg-teal-50/70 rounded-2xl border border-teal-100 text-xs text-slate-700 space-y-2 mb-4">
              <p>
                <strong>{t.common.service}:</strong>{' '}
                {selectedServices.map((s) => s.nameUz).join(', ') || 'Tanlangan xizmat'}
              </p>
              <p>
                <strong>{t.common.doctor}:</strong> Dr.{' '}
                {selectedDoctorObj ? `${selectedDoctorObj.firstNameUz} ${selectedDoctorObj.lastNameUz}` : 'Tanlangan shifokor'}
              </p>
              <p>
                <strong>{t.common.branch}:</strong>{' '}
                {selectedBranchObj?.nameUz || 'Asosiy filial'}
              </p>
              <p>
                <strong>{t.common.time}:</strong>{' '}
                {selectedSlotTime ? new Date(selectedSlotTime).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' }) : ''}{' '}
                ({totalDuration} daqiqa)
              </p>
              <p>
                <strong>Taxminiy narx:</strong>{' '}
                <span className="font-extrabold text-teal-800">
                  {(totalPrice / 100).toLocaleString('uz-UZ')} {t.common.uzs}
                </span>
              </p>
            </div>

            <div className="space-y-4">
              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.common.name} *
                </label>
                <input
                  type="text"
                  required
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder={t.booking.fullNamePlaceholder}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
                />
              </div>

              {/* Phone (+998 masked and regex validated) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.common.phone} *
                </label>
                <input
                  type="tel"
                  required
                  value={patientPhone}
                  onChange={handlePhoneChange}
                  onBlur={() => setIsPhoneTouched(true)}
                  placeholder="+998 (90) 123-45-67"
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 bg-white transition-colors ${
                    isPhoneTouched && !isPhoneValid
                      ? 'border-red-400 focus:ring-red-500'
                      : 'border-slate-200 focus:ring-teal-600'
                  }`}
                />
                {isPhoneTouched && !isPhoneValid && (
                  <p className="text-[11px] text-red-600 mt-1 font-medium flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Telefon raqamini to&apos;liq kiriting: +998 (90) 123-45-67</span>
                  </p>
                )}
              </div>

              {/* Email (Optional but regex validated) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.common.email} (ixtiyoriy)
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
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 bg-white transition-colors ${
                    isEmailTouched && !isEmailValid
                      ? 'border-red-400 focus:ring-red-500'
                      : 'border-slate-200 focus:ring-teal-600'
                  }`}
                />
                {isEmailTouched && !isEmailValid && (
                  <p className="text-[11px] text-red-600 mt-1 font-medium flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Elektron pochta manzili formati noto&apos;g&apos;ri (masalan: misol@gmail.com)</span>
                  </p>
                )}
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.common.note}
                </label>
                <textarea
                  rows={2}
                  value={patientNote}
                  onChange={(e) => setPatientNote(e.target.value)}
                  placeholder="Tish og'rig'i, bezovta qilayotgan belgilar..."
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600 bg-white"
                />
              </div>

              {/* Consent Checkbox */}
              <label className="flex items-start gap-2.5 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={consentGiven}
                  onChange={(e) => setConsentGiven(e.target.checked)}
                  className="mt-1 w-4 h-4 text-teal-700 rounded border-slate-300 focus:ring-teal-600"
                />
                <span className="text-xs text-slate-600 leading-relaxed">
                  {t.booking.consentText}
                </span>
              </label>
            </div>

            <div className="pt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(4)}
                className="px-5 py-2.5 border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>{t.common.back}</span>
              </button>

              <button
                type="submit"
                disabled={isSubmitting || !isPhoneValid || !isEmailValid}
                className="px-8 py-3.5 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-teal-700/20 flex items-center gap-2"
              >
                {isSubmitting ? (
                  <span>{t.common.loading}</span>
                ) : (
                  <span>{t.common.confirm}</span>
                )}
              </button>
            </div>
          </form>
        )}

        {/* STEP 6: Booking Result & Confirmation */}
        {step === 6 && bookingResult && (
          <div className="text-center py-6 animate-fade-in space-y-6">
            <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-md">
              <CheckCircle2 className="w-12 h-12" />
            </div>

            <div>
              <h2 className="text-2xl font-extrabold text-slate-900 mb-2">
                {t.booking.bookingSuccess}
              </h2>
              <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
                {t.booking.requestReceivedNotice}
              </p>
            </div>

            {/* Appointment Details Box */}
            <div className="p-6 bg-slate-50 rounded-2xl max-w-md mx-auto text-left text-sm space-y-2.5 border border-slate-200">
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500">{t.booking.appointmentId}:</span>
                <span className="font-mono font-bold text-slate-800 text-xs">
                  {bookingResult.appointmentId}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500">{t.common.status}:</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                  {bookingResult.status === 'PENDING' ? 'Kutilmoqda (So\'rov qabul qilindi)' : bookingResult.status}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500">{t.common.service}:</span>
                <span className="font-semibold text-slate-800">{bookingResult.serviceName}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500">{t.common.time}:</span>
                <span className="font-semibold text-slate-800">
                  {new Date(bookingResult.startTime).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' })}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500">{t.common.doctor}:</span>
                <span className="font-semibold text-slate-800">{bookingResult.doctorName}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200 pb-2">
                <span className="text-slate-500">{t.common.branch}:</span>
                <span className="font-semibold text-slate-800">{bookingResult.branchName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Qabul davomiyligi:</span>
                <span className="font-semibold text-slate-800">
                  {bookingResult.durationMinutes || totalDuration} daqiqa
                </span>
              </div>
            </div>

            {/* Self-service Link & Management Token */}
            <div className="p-5 bg-teal-50/70 border border-teal-200 rounded-2xl max-w-md mx-auto text-left">
              <div className="flex items-start gap-2.5">
                <Info className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-700 space-y-2">
                  <p className="font-semibold text-slate-900">
                    Qabulni mustaqil boshqarish havolasi:
                  </p>
                  <p className="text-slate-600">{t.booking.managementTokenNotice}</p>
                  <button
                    type="button"
                    onClick={copyManagementUrl}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-teal-200 rounded-lg text-teal-800 font-semibold shadow-sm hover:bg-teal-50 transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedToken ? 'Nusxa olindi!' : 'Havoladan nusxa olish'}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href={`/booking/status/${bookingResult.publicToken}`}
                className="w-full sm:w-auto px-6 py-3 bg-teal-700 hover:bg-teal-800 text-white font-semibold rounded-xl shadow-md"
              >
                {t.booking.trackBooking}
              </Link>
              <Link
                href="/"
                className="w-full sm:w-auto px-6 py-3 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50"
              >
                {t.nav.home}
              </Link>
            </div>
          </div>
        )}
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
