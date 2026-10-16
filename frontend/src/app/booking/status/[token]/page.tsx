'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Calendar,
  Clock,
  User,
  Building2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  ArrowLeft,
} from 'lucide-react';
import { useI18n } from '../../../../lib/i18n';
import { api } from '../../../../lib/api';

function getTashkentDateString(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tashkent',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export default function BookingStatusPage() {
  const { language, t } = useI18n();
  const currentLang = language;
  const params = useParams();
  const token = params.token as string;

  const [appointment, setAppointment] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Reschedule state
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [selectedSlotTime, setSelectedSlotTime] = useState('');
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isSubmittingReschedule, setIsSubmittingReschedule] = useState(false);

  // Cancellation state
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);

  const loadAppointment = async () => {
    if (!token) return;
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const data = await api.getBookingByToken(token);
      setAppointment(data);

      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      setNewDate(getTashkentDateString(tomorrow));
    } catch (err: any) {
      setErrorMessage(err?.message || (currentLang === 'ru' ? 'Не удалось найти запись' : 'Qabul ma\'lumotlarini topib bo\'lmadi'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAppointment();
  }, [token]);

  // Load appointment-aware slots when rescheduling (preserves historical duration & buffer)
  useEffect(() => {
    async function loadSlots() {
      if (!isRescheduling || !appointment || !newDate || !token) return;
      try {
        setIsLoadingSlots(true);
        const res = await api.getRescheduleSlots(token, newDate, 'Asia/Tashkent');
        const slots = Array.isArray(res) ? res : res?.slots || [];
        setAvailableSlots(slots);
      } catch (err: any) {
        setErrorMessage(err?.message || (currentLang === 'ru' ? 'Ошибка загрузки свободного времени' : 'Bo\'sh vaqtlarni yuklashda xatolik yuz berdi'));
      } finally {
        setIsLoadingSlots(false);
      }
    }
    loadSlots();
  }, [isRescheduling, appointment, newDate, token, currentLang]);

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlotTime) return;

    try {
      setIsSubmittingReschedule(true);
      setErrorMessage(null);
      await api.rescheduleBooking(token, selectedSlotTime);
      setSuccessMessage(currentLang === 'ru' ? 'Время приема успешно изменено!' : 'Qabul vaqti muvaffaqiyatli o\'zgartirildi!');
      setIsRescheduling(false);
      await loadAppointment();
    } catch (err: any) {
      setErrorMessage(err?.message || (currentLang === 'ru' ? 'Ошибка при переносе приема' : 'Vaqtni o\'zgartirishda xatolik yuz berdi'));
    } finally {
      setIsSubmittingReschedule(false);
    }
  };

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmittingCancel(true);
      setErrorMessage(null);
      await api.cancelBooking(token, cancelReason || undefined);
      setSuccessMessage('Qabul bekor qilindi.');
      setIsCancelling(false);
      await loadAppointment();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Qabulni bekor qilishda xatolik yuz berdi');
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <div className="w-10 h-10 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm font-semibold text-slate-600">{t.common.loading}</p>
      </div>
    );
  }

  if (errorMessage && !appointment) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">{t.common.error}</h2>
        <p className="text-sm text-slate-500 mb-6">{errorMessage}</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-teal-700 text-white rounded-xl font-semibold shadow-md"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t.nav.home}</span>
        </Link>
      </div>
    );
  }

  const statusColorMap: Record<string, string> = {
    PENDING: 'bg-amber-100 text-amber-800 border-amber-200',
    CONFIRMED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    CHECKED_IN: 'bg-blue-100 text-blue-800 border-blue-200',
    COMPLETED: 'bg-purple-100 text-purple-800 border-purple-200',
    CANCELLED: 'bg-rose-100 text-rose-800 border-rose-200',
    NO_SHOW: 'bg-slate-100 text-slate-800 border-slate-200',
  };

  const statusLabelMap: Record<string, Record<'uz' | 'ru', string>> = {
    PENDING: {
      uz: 'Kutilmoqda (So\'rov qabul qilindi)',
      ru: 'Ожидает подтверждения',
    },
    CONFIRMED: {
      uz: 'Tasdiqlangan',
      ru: 'Подтверждено',
    },
    CHECKED_IN: {
      uz: 'Klinikada qabulda',
      ru: 'В клинике на приеме',
    },
    COMPLETED: {
      uz: 'Muvaffaqiyatli yakunlangan',
      ru: 'Завершено',
    },
    CANCELLED: {
      uz: 'Bekor qilingan',
      ru: 'Отменено',
    },
    NO_SHOW: {
      uz: 'Kelmadi',
      ru: 'Не явился',
    },
  };

  const isTerminal = appointment?.status === 'COMPLETED' || appointment?.status === 'CANCELLED';

  const doctorDisplayName = appointment
    ? (currentLang === 'ru'
        ? (appointment.doctorFullNameRu || (appointment.doctor ? `Д-р ${appointment.doctor.firstNameRu} ${appointment.doctor.lastNameRu}` : 'Врач'))
        : (appointment.doctorName || appointment.doctorFullNameUz || (appointment.doctor ? `Dr. ${appointment.doctor.firstNameUz} ${appointment.doctor.lastNameUz}` : 'Shifokor')))
    : '';

  const branchDisplayName = appointment
    ? (currentLang === 'ru'
        ? (appointment.branchNameRu || appointment.branch?.nameRu || 'Главный филиал')
        : (appointment.branchName || appointment.branchNameUz || appointment.branch?.nameUz || 'Asosiy filial'))
    : '';

  const serviceTitle = appointment
    ? (appointment.serviceItems && appointment.serviceItems.length > 0
        ? appointment.serviceItems.map((i: any) => currentLang === 'ru' && i.serviceNameRu ? i.serviceNameRu : i.serviceNameUz).join(', ')
        : (appointment.serviceName || (currentLang === 'ru' ? 'Стоматологическая услуга' : 'Stomatologiya xizmati')))
    : '';

  const durationMinutes = appointment
    ? (appointment.durationMinutes || (appointment.startTime && appointment.endTime ? Math.round((new Date(appointment.endTime).getTime() - new Date(appointment.startTime).getTime()) / 60000) : 30))
    : 30;

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-teal-700 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>{t.nav.home}</span>
      </Link>

      {/* Notifications */}
      {successMessage && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-sm text-emerald-800 animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-sm text-red-800 animate-fade-in">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Appointment Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-100 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-5">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700">
              {currentLang === 'ru' ? 'Детали записи' : 'Qabul tafsilotlari'}
            </span>
            <h1 className="text-2xl font-extrabold text-slate-900 mt-0.5">
              {serviceTitle}
            </h1>
          </div>

          <span
            className={`self-start sm:self-auto px-3.5 py-1.5 rounded-full text-xs font-bold border ${
              statusColorMap[appointment.status] || 'bg-slate-100 text-slate-700'
            }`}
          >
            {statusLabelMap[appointment.status]?.[currentLang] || appointment.status}
          </span>
        </div>

        {/* Key Info Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="p-4 bg-slate-50 rounded-2xl flex items-start gap-3">
            <Clock className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-slate-400 block">{t.common.time}</span>
              <span className="font-bold text-slate-800">
                {new Date(appointment.startTime).toLocaleString(currentLang === 'ru' ? 'ru-RU' : 'uz-UZ', { timeZone: 'Asia/Tashkent' })}
              </span>
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl flex items-start gap-3">
            <User className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-slate-400 block">{t.common.doctor}</span>
              <span className="font-bold text-slate-800">
                {doctorDisplayName}
              </span>
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl flex items-start gap-3">
            <Building2 className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-slate-400 block">{t.common.branch}</span>
              <span className="font-bold text-slate-800">
                {branchDisplayName}
              </span>
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl flex items-start gap-3">
            <Calendar className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
            <div>
              <span className="text-xs text-slate-400 block">
                {currentLang === 'ru' ? 'Длительность приема' : 'Qabul davomiyligi'}
              </span>
              <span className="font-bold text-slate-800 flex items-center flex-wrap gap-1">
                {durationMinutes} {currentLang === 'ru' ? 'минут' : 'daqiqa'}
                {appointment.durationAdjustmentMinutes !== undefined && appointment.durationAdjustmentMinutes !== 0 && (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200"
                    title={currentLang === 'ru' ? 'Длительность изменена администратором' : 'Administrator tomonidan davomiylik o\'zgartirilgan'}
                  >
                    {appointment.durationAdjustmentMinutes > 0 ? `+${appointment.durationAdjustmentMinutes}` : appointment.durationAdjustmentMinutes} {currentLang === 'ru' ? 'мин (коррекция)' : 'daq (tuzatish)'}
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Multi-service Itemized Breakdown */}
        {appointment.serviceItems && appointment.serviceItems.length > 0 && (
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
            <span className="text-xs font-bold text-slate-700 block uppercase tracking-wider">
              {t.booking.selectedServices} ({appointment.serviceItems.length}):
            </span>
            <div className="space-y-1.5">
              {appointment.serviceItems.map((item: any, idx: number) => {
                const itemName = currentLang === 'ru' && item.serviceNameRu ? item.serviceNameRu : item.serviceNameUz;
                return (
                  <div key={item.id || idx} className="flex items-center justify-between text-xs bg-white p-2.5 rounded-xl border border-slate-200">
                    <span className="font-semibold text-slate-800">
                      {itemName}
                      {item.isLegacyBundle && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                          {currentLang === 'ru' ? 'Пакет' : 'Paket'}
                        </span>
                      )}
                    </span>
                    <div className="text-right">
                      <span className="text-slate-500 mr-2">{item.durationMinutes} {currentLang === 'ru' ? 'мин' : 'daqiqa'}</span>
                      {item.priceFrom ? (
                        <span className="font-bold text-teal-800">
                          {(item.priceFrom / 100).toLocaleString(currentLang === 'ru' ? 'ru-RU' : 'uz-UZ')} {t.common.uzs}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Action Buttons (Disabled if completed/cancelled) */}
        {!isTerminal && !isRescheduling && !isCancelling && (
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center gap-3">
            <button
              type="button"
              onClick={() => setIsRescheduling(true)}
              className="w-full sm:w-auto px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold rounded-xl shadow-md flex items-center justify-center gap-2 transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              <span>{t.common.reschedule}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsCancelling(true)}
              className="w-full sm:w-auto px-5 py-2.5 border border-red-200 text-red-600 hover:bg-red-50 text-sm font-semibold rounded-xl transition-all"
            >
              <span>{t.common.cancel}</span>
            </button>
          </div>
        )}

        {/* RESCHEDULE FORM */}
        {isRescheduling && (
          <form
            onSubmit={handleRescheduleSubmit}
            className="p-5 bg-teal-50/70 border border-teal-200 rounded-2xl space-y-4 animate-fade-in"
          >
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-teal-700" />
              <span>{currentLang === 'ru' ? 'Выберите новое время приема' : 'Yangi qabul vaqtini tanlang'}</span>
            </h3>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t.booking.selectDate}
              </label>
              <input
                type="date"
                value={newDate}
                min={getTashkentDateString()}
                onChange={(e) => {
                  setNewDate(e.target.value);
                  setSelectedSlotTime('');
                }}
                className="w-full sm:w-60 px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">
                {currentLang === 'ru' ? 'Доступное свободное время:' : 'Mavjud bo\'sh vaqtlar:'}
              </label>
              {isLoadingSlots ? (
                <div className="p-4 text-center text-xs text-slate-500">{t.common.loading}</div>
              ) : availableSlots.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">{t.booking.noSlots}</div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                  {availableSlots.map((slot) => {
                    const slotDate = new Date(slot.startTime);
                    const timeStr = slotDate.toLocaleTimeString(currentLang === 'ru' ? 'ru-RU' : 'uz-UZ', {
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
                        className={`py-2 px-1 text-xs font-bold rounded-lg ${
                          !slot.available
                            ? 'bg-slate-200 text-slate-400 line-through'
                            : isSelected
                            ? 'bg-teal-700 text-white'
                            : 'bg-white text-teal-800 border border-teal-200 hover:bg-teal-100'
                        }`}
                      >
                        {timeStr}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsRescheduling(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg"
              >
                {t.common.cancel}
              </button>
              <button
                type="submit"
                disabled={!selectedSlotTime || isSubmittingReschedule}
                className="px-5 py-2 bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow"
              >
                {isSubmittingReschedule ? t.common.loading : t.common.save}
              </button>
            </div>
          </form>
        )}

        {/* CANCEL FORM */}
        {isCancelling && (
          <form
            onSubmit={handleCancelSubmit}
            className="p-5 bg-red-50 border border-red-200 rounded-2xl space-y-4 animate-fade-in"
          >
            <h3 className="font-bold text-red-900 text-base flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-600" />
              <span>{currentLang === 'ru' ? 'Отмена записи' : 'Qabulni bekor qilish'}</span>
            </h3>

            <p className="text-xs text-red-700">
              {currentLang === 'ru'
                ? 'Вы уверены, что хотите отменить запись? Это действие нельзя отменить.'
                : 'Qabulni bekor qilishga ishonchingiz komilmi? Bu amalni orqaga qaytarib bo\'lmaydi.'}
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {currentLang === 'ru' ? 'Причина отмены (необязательно)' : 'Bekor qilish sababi (ixtiyoriy)'}
              </label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder={currentLang === 'ru' ? 'Планы изменились...' : "Rejalar o'zgardi, boshqa vaqtga qoldirildi..."}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white"
              />
            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCancelling(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg"
              >
                {currentLang === 'ru' ? 'Назад' : 'Ortga'}
              </button>
              <button
                type="submit"
                disabled={isSubmittingCancel}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow"
              >
                {isSubmittingCancel ? t.common.loading : (currentLang === 'ru' ? 'Да, отменить' : 'Ha, bekor qilinsin')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
