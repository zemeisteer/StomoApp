'use client';

import React, { useState, useEffect, Suspense } from 'react';
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
} from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { api } from '../../lib/api';

function BookingContent() {
  const { t, language } = useI18n();
  const searchParams = useSearchParams();

  // Step state (1: Branch, 2: Service, 3: Doctor, 4: Date & Slot, 5: Patient info, 6: Result)
  const [step, setStep] = useState<number>(1);

  // Form state
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedSlotTime, setSelectedSlotTime] = useState<string>('');

  const [patientName, setPatientName] = useState<string>('');
  const [patientPhone, setPatientPhone] = useState<string>('');
  const [patientEmail, setPatientEmail] = useState<string>('');
  const [patientNote, setPatientNote] = useState<string>('');
  const [consentGiven, setConsentGiven] = useState<boolean>(true);

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
          setSelectedServiceId(qService);
          setStep(2);
        }
        if (qDoctor) {
          setSelectedDoctorId(qDoctor);
          setStep(3);
        }

        // Set default date to tomorrow in YYYY-MM-DD
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

  // Load available slots when Doctor, Service, and Date are chosen
  useEffect(() => {
    async function fetchSlots() {
      if (!selectedDoctorId || !selectedServiceId || !selectedDate) {
        setAvailableSlots([]);
        return;
      }

      try {
        setIsLoadingSlots(true);
        setErrorMessage(null);
        const slots = await api.getAvailableSlots(
          selectedDoctorId,
          selectedDate,
          selectedServiceId,
          selectedBranchId || undefined
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
  }, [step, selectedDoctorId, selectedServiceId, selectedDate, selectedBranchId]);

  // Handle final submission
  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consentGiven) {
      setErrorMessage(t.booking.consentError);
      return;
    }

    if (!patientName.trim() || !patientPhone.trim()) {
      setErrorMessage('Iltimos, ismingiz va telefon raqamingizni kiriting');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      // Create booking payload
      const result = await api.createBooking({
        branchId: selectedBranchId || undefined,
        serviceId: selectedServiceId,
        doctorId: selectedDoctorId,
        startTime: selectedSlotTime,
        patientName: patientName.trim(),
        patientPhone: patientPhone.trim(),
        patientEmail: patientEmail.trim() || undefined,
        note: patientNote.trim() || undefined,
        consentGiven,
      });

      setBookingResult(result);
      setStep(6); // Step 6: Confirmation result
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

  const selectedServiceObj = services.find((s) => s.id === selectedServiceId);
  const selectedDoctorObj = doctors.find((d) => d.id === selectedDoctorId);
  const selectedBranchObj = branches.find((b) => b.id === selectedBranchId);

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

        {/* STEP 2: Service Selection */}
        {step === 2 && (
          <div className="space-y-6 animate-fade-in">
            <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-teal-700" />
              <span>{t.booking.selectService}</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[440px] overflow-y-auto pr-2">
              {services.map((s) => {
                const name = language === 'ru' && s.nameRu ? s.nameRu : s.nameUz;
                const price = (s.priceFrom / 100).toLocaleString('uz-UZ');
                const isSelected = selectedServiceId === s.id;

                return (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => setSelectedServiceId(s.id)}
                    className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'border-teal-700 bg-teal-50/50 ring-2 ring-teal-600'
                        : 'border-slate-200 hover:border-teal-300 bg-white'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                        <span className="font-bold text-teal-700 uppercase">{s.category}</span>
                        <span>{s.durationMinutes} daq</span>
                      </div>
                      <p className="font-bold text-sm text-slate-900">{name}</p>
                    </div>
                    <p className="text-xs font-extrabold text-slate-800 mt-3">
                      {price} {t.common.uzs}
                    </p>
                  </button>
                );
              })}
            </div>

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
                disabled={!selectedServiceId}
                onClick={() => setStep(3)}
                className="px-6 py-3 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white font-bold rounded-xl shadow-md flex items-center gap-2"
              >
                <span>{t.common.next}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Doctor Selection */}
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

                return (
                  <button
                    type="button"
                    key={d.id}
                    onClick={() => setSelectedDoctorId(d.id)}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                      isSelected
                        ? 'border-teal-700 bg-teal-50/50 ring-2 ring-teal-600'
                        : 'border-slate-200 hover:border-teal-300 bg-white'
                    }`}
                  >
                    <p className="font-bold text-sm text-slate-900">Dr. {fullName}</p>
                    <p className="text-xs text-teal-700 font-medium mt-0.5">{title}</p>
                    <p className="text-xs text-slate-400 mt-2">{d.experienceYears}+ yil tajriba</p>
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
            <h2 className="text-xl font-bold text-slate-900 mb-2 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-teal-700" />
              <span>{t.booking.selectSlot}</span>
            </h2>

            {/* Date Picker Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t.booking.selectDate}
              </label>
              <input
                type="date"
                value={selectedDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setSelectedSlotTime('');
                }}
                className="w-full sm:w-64 px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            {/* Slots Grid */}
            <div className="pt-2">
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                {selectedDate} sana uchun mavjud vaqtlar:
              </label>

              {isLoadingSlots ? (
                <div className="p-8 text-center text-slate-500 text-sm bg-slate-50 rounded-2xl">
                  {t.common.loading}
                </div>
              ) : availableSlots.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <p>{t.booking.noSlots}</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 max-h-60 overflow-y-auto p-1">
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
                        className={`py-2.5 px-2 rounded-xl text-xs font-bold transition-all ${
                          !slot.available
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed line-through'
                            : isSelected
                            ? 'bg-teal-700 text-white ring-2 ring-teal-600 shadow-md'
                            : 'bg-teal-50 text-teal-800 hover:bg-teal-100'
                        }`}
                      >
                        {timeStr}
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
            <div className="p-4 bg-teal-50/70 rounded-2xl border border-teal-100 text-xs text-slate-700 space-y-1.5 mb-4">
              <p>
                <strong>{t.common.service}:</strong>{' '}
                {selectedServiceObj?.nameUz || 'Tanlangan xizmat'}
              </p>
              <p>
                <strong>{t.common.doctor}:</strong> Dr.{' '}
                {selectedDoctorObj ? `${selectedDoctorObj.firstNameUz} ${selectedDoctorObj.lastNameUz}` : 'Tanlangan shifokor'}
              </p>
              <p>
                <strong>{t.common.time}:</strong>{' '}
                {selectedSlotTime ? new Date(selectedSlotTime).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' }) : ''}
              </p>
            </div>

            <div className="space-y-4">
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
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.common.phone} *
                </label>
                <input
                  type="tel"
                  required
                  value={patientPhone}
                  onChange={(e) => setPatientPhone(e.target.value)}
                  placeholder={t.booking.phonePlaceholder}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.common.email} (ixtiyoriy)
                </label>
                <input
                  type="email"
                  value={patientEmail}
                  onChange={(e) => setPatientEmail(e.target.value)}
                  placeholder="bemor@misol.uz"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t.common.note}
                </label>
                <textarea
                  rows={2}
                  value={patientNote}
                  onChange={(e) => setPatientNote(e.target.value)}
                  placeholder="Tish og'rig'i, bezovta qilayotgan belgilar..."
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
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
                disabled={isSubmitting}
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
                <span className="text-slate-500">{t.common.time}:</span>
                <span className="font-semibold text-slate-800">
                  {new Date(bookingResult.startTime).toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">{t.common.doctor}:</span>
                <span className="font-semibold text-slate-800">{bookingResult.doctorName}</span>
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
