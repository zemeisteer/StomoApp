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
  MapPin,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  CalendarCheck,
  Phone,
} from 'lucide-react';
import { useI18n } from '../../../../lib/i18n';
import { api } from '../../../../lib/api';
import { formatClinicDate, formatClinicTime } from '../../../../lib/dateFormat';
import { CustomDatePicker } from '../../../../components/CustomDatePicker';
import { CustomSelect } from '../../../../components/CustomSelect';

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
      setErrorMessage(
        err?.message ||
          (currentLang === 'ru' ? 'Не удалось найти запись' : 'Qabul ma\'lumotlarini topib bo\'lmadi')
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAppointment();
  }, [token]);

  useEffect(() => {
    async function loadSlots() {
      if (!isRescheduling || !appointment || !newDate || !token) return;
      try {
        setIsLoadingSlots(true);
        const res = await api.getRescheduleSlots(token, newDate, 'Asia/Tashkent');
        const slots = Array.isArray(res) ? res : res?.slots || [];
        setAvailableSlots(slots);
      } catch (err: any) {
        setErrorMessage(
          err?.message ||
            (currentLang === 'ru'
              ? 'Ошибка загрузки свободного времени'
              : 'Bo\'sh vaqtlarni yuklashda xatolik yuz berdi')
        );
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
      setSuccessMessage(
        currentLang === 'ru'
          ? 'Время приема успешно изменено!'
          : 'Qabul vaqti muvaffaqiyatli o\'zgartirildi!'
      );
      setIsRescheduling(false);
      await loadAppointment();
    } catch (err: any) {
      setErrorMessage(
        err?.message ||
          (currentLang === 'ru'
            ? 'Ошибка при переносе приема'
            : 'Vaqtni o\'zgartirishda xatolik yuz berdi')
      );
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
      setSuccessMessage(currentLang === 'ru' ? 'Запись отменена.' : 'Qabul bekor qilindi.');
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
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-3 border-[#167b78] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-[#52696e]">{t.common.loading}</p>
        </div>
      </div>
    );
  }

  if (errorMessage && !appointment) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-rose-200">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-[#152f34] mb-2">{t.common.error}</h2>
        <p className="text-sm text-[#52696e] mb-6">{errorMessage}</p>
        <Link
          href="/"
          className="ui-button ui-button--primary text-sm font-bold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t.nav.home}</span>
        </Link>
      </div>
    );
  }

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

  const branchAddress = appointment?.branch
    ? (currentLang === 'ru' ? appointment.branch.addressRu : appointment.branch.addressUz)
    : '';

  const serviceTitle = appointment
    ? (appointment.serviceItems && appointment.serviceItems.length > 0
        ? appointment.serviceItems.map((i: any) => currentLang === 'ru' && i.serviceNameRu ? i.serviceNameRu : i.serviceNameUz).join(', ')
        : (appointment.serviceName || (currentLang === 'ru' ? 'Стоматологическая услуга' : 'Stomatologiya xizmati')))
    : '';

  const durationMinutes = appointment?.durationMinutes || 30;
  const isUz = currentLang === 'uz';

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 sm:py-14 space-y-6">
      {/* Back button */}
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#52696e] hover:text-[#167b78] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{t.nav.home}</span>
        </Link>

        <span className="text-xs text-[#52696e] bg-[#eaf5f2] px-3 py-1 rounded-full font-semibold border border-[#d8e5e2]">
          {isUz ? "Bemor portali (O'z-o'ziga xizmat)" : "Портал пациента (Самообслуживание)"}
        </span>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-center gap-3 text-xs text-emerald-900 font-semibold animate-fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-300 rounded-2xl flex items-center gap-3 text-xs text-rose-900 font-semibold animate-fade-in">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Welcome & Patient Header (Image 1 Style) */}
      <div className="bg-white p-6 rounded-2xl border border-[#d8e5e2] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-[#e0f2ed] text-[#167b78] flex items-center justify-center font-bold text-base border border-[#167b78]/20">
            {appointment.patient?.fullName?.charAt(0) || appointment.patientName?.charAt(0) || 'B'}
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-[#152f34]">
              {appointment.patient?.fullName || appointment.patientName}
            </h1>
            <p className="text-xs text-[#52696e]">
              {appointment.patient?.phone || (isUz ? 'Telefon qayd etilgan' : 'Телефон указан')}
            </p>
          </div>
        </div>

        <Link
          href="/booking"
          className="ui-button ui-button--primary text-xs font-bold self-start sm:self-center"
        >
          <CalendarCheck className="w-4 h-4" />
          <span>{isUz ? 'Yangi qabulga yozilish' : 'Записаться на новый прием'}</span>
        </Link>
      </div>

      {/* Main Upcoming Appointment Card (Image 1 OraDent Style) */}
      <div className="ui-card space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#d8e5e2] pb-4">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#167b78] bg-[#e0f2ed] px-2 py-0.5 rounded-md">
              {isUz ? 'Navbatdagi qabulingiz' : 'Ваш следующий прием'}
            </span>
            <h2 className="text-xl font-black text-[#152f34] mt-1">
              {serviceTitle}
            </h2>
          </div>

          <div className="self-start sm:self-auto">
            {appointment.status === 'CONFIRMED' && (
              <span className="ui-badge bg-teal-100 text-teal-900 border border-teal-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-teal-700" />
                <span>{isUz ? 'Tasdiqlangan' : 'Подтвержден'}</span>
              </span>
            )}
            {appointment.status === 'PENDING' && (
              <span className="ui-badge bg-amber-100 text-amber-900 border border-amber-300">
                <Clock className="w-3.5 h-3.5 text-amber-700" />
                <span>{isUz ? 'Kutilmoqda' : 'В ожидании'}</span>
              </span>
            )}
            {appointment.status === 'CHECKED_IN' && (
              <span className="ui-badge bg-blue-100 text-blue-900 border border-blue-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-700" />
                <span>{isUz ? 'Klinikada qabulda' : 'В клинике на приеме'}</span>
              </span>
            )}
            {appointment.status === 'COMPLETED' && (
              <span className="ui-badge bg-emerald-100 text-emerald-900 border border-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                <span>{isUz ? 'Yakunlandi' : 'Завершено'}</span>
              </span>
            )}
            {appointment.status === 'CANCELLED' && (
              <span className="ui-badge bg-rose-100 text-rose-800 border border-rose-300">
                <XCircle className="w-3.5 h-3.5 text-rose-600" />
                <span>{isUz ? 'Bekor qilingan' : 'Отменено'}</span>
              </span>
            )}
          </div>
        </div>

        {/* Doctor & Location Info (Image 1 Style) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          {/* Doctor Info */}
          <div className="p-4 bg-[#f3f8f7] rounded-xl border border-[#d8e5e2] flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#167b78] text-white flex items-center justify-center font-bold text-sm shrink-0">
              {doctorDisplayName.replace(/^(Dr\.|Д-р)\s*/, '').charAt(0)}
            </div>
            <div>
              <span className="text-[#52696e] block text-[11px]">
                {isUz ? 'Shifokoringiz' : 'Ваш лечащий врач'}
              </span>
              <span className="font-bold text-[#152f34] text-sm">{doctorDisplayName}</span>
            </div>
          </div>

          {/* Time & Duration */}
          <div className="p-4 bg-[#f3f8f7] rounded-xl border border-[#d8e5e2] flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#e0f2ed] text-[#167b78] flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[#52696e] block text-[11px]">
                {isUz ? `Qabul vaqti (${durationMinutes} daqiqa)` : `Время приема (${durationMinutes} минут)`}
              </span>
              <span className="font-bold text-[#152f34] text-sm">
                {formatClinicDate(appointment.startTime, currentLang, { includeWeekday: true })} • {formatClinicTime(appointment.startTime)}
              </span>
            </div>
          </div>

          {/* Branch & Map */}
          <div className="sm:col-span-2 p-4 bg-[#f3f8f7] rounded-xl border border-[#d8e5e2] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <MapPin className="w-4 h-4 text-[#167b78] shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-[#152f34] block">{branchDisplayName}</span>
                {branchAddress && <span className="text-[#52696e] text-[11px] block">{branchAddress}</span>}
              </div>
            </div>

            {appointment.branch?.mapUrl && (
              <a
                href={appointment.branch.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-[#167b78] hover:bg-[#eaf5f2] rounded-lg border border-[#d8e5e2] font-semibold text-xs transition-colors shrink-0"
              >
                <span>{isUz ? "Xaritada ko'rish" : "Посмотреть на карте"}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>

        {/* Services & Price breakdown */}
        {appointment.serviceItems && appointment.serviceItems.length > 0 && (
          <div className="p-4 bg-[#f3f8f7] rounded-xl border border-[#d8e5e2] space-y-2">
            <span className="text-xs font-bold text-[#152f34] block uppercase tracking-wider">
              {isUz ? `Tanlangan xizmatlar (${appointment.serviceItems.length}):` : `Выбранные услуги (${appointment.serviceItems.length}):`}
            </span>
            <div className="space-y-1.5">
              {appointment.serviceItems.map((item: any, idx: number) => {
                const itemName = currentLang === 'ru' && item.serviceNameRu ? item.serviceNameRu : item.serviceNameUz;
                return (
                  <div key={item.id || idx} className="flex items-center justify-between text-xs bg-white p-2.5 rounded-lg border border-[#d8e5e2]">
                    <span className="font-semibold text-[#152f34]">{itemName}</span>
                    <div className="text-right">
                      <span className="text-[#52696e] mr-2">
                        {item.durationMinutes} {isUz ? 'daqiqa' : 'мин'}
                      </span>
                      {item.priceFrom ? (
                        <span className="font-bold text-[#167b78]">
                          {(item.priceFrom / 100).toLocaleString(isUz ? 'uz-UZ' : 'ru-RU')} {isUz ? "so'm" : "сум"}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Action Buttons: Reschedule & Cancel */}
        {!isTerminal && !isRescheduling && !isCancelling && (
          <div className="pt-3 border-t border-[#d8e5e2] flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setIsRescheduling(true)}
              className="ui-button ui-button--primary text-xs font-bold"
            >
              {isUz ? "Vaqtni o'zgartirish" : 'Перенести запись'}
            </button>
            <button
              type="button"
              onClick={() => setIsCancelling(true)}
              className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-colors"
            >
              {isUz ? 'Qabulni bekor qilish' : 'Отменить запись'}
            </button>
          </div>
        )}

        {/* Reschedule Form Drawer */}
        {isRescheduling && (
          <form onSubmit={handleRescheduleSubmit} className="p-4 bg-teal-50/50 rounded-2xl border border-teal-200 space-y-4 animate-fade-in text-xs">
            <h3 className="font-bold text-[#152f34] text-sm">
              {isUz ? "Qabul vaqtini o'zgartirish" : 'Перенос времени приема'}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-semibold text-[#52696e] block mb-1">
                  {isUz ? 'Yangi sanani tanlang:' : 'Выберите новую дату:'}
                </label>
                <CustomDatePicker
                  id="reschedule-datepicker"
                  value={newDate}
                  min={getTashkentDateString(new Date())}
                  onChange={(val) => setNewDate(val)}
                  locale={isUz ? 'uz' : 'ru'}
                  placeholder={isUz ? 'Sanani tanlang...' : 'Выберите дату...'}
                  required
                />
              </div>

              <div>
                <label className="font-semibold text-[#52696e] block mb-1">
                  {isUz ? "Mavjud bo'sh vaqtlar:" : 'Доступное свободное время:'}
                </label>
                {isLoadingSlots ? (
                  <p className="text-[#52696e] py-2">
                    {isUz ? 'Vaqtlar tekshirilmoqda...' : 'Проверка доступного времени...'}
                  </p>
                ) : availableSlots.length === 0 ? (
                  <p className="text-rose-600 py-2">
                    {isUz ? "Ushbu kunda bo'sh vaqt yo'q" : 'На этот день нет свободного времени'}
                  </p>
                ) : (
                  <CustomSelect
                    id="reschedule-slot-select"
                    value={selectedSlotTime}
                    onChange={(val) => setSelectedSlotTime(val)}
                    placeholder={isUz ? 'Vaqtni tanlang' : 'Выберите время'}
                    options={availableSlots.map((slot) => ({
                      value: slot.startTime,
                      label: formatClinicTime(slot.startTime),
                    }))}
                    locale={isUz ? 'uz' : 'ru'}
                  />
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="submit"
                disabled={isSubmittingReschedule || !selectedSlotTime}
                className="ui-button ui-button--primary text-xs font-bold"
              >
                {isSubmittingReschedule
                  ? (isUz ? 'Saqlanmoqda...' : 'Сохранение...')
                  : (isUz ? 'Vaqtni tasdiqlash' : 'Подтвердить время')}
              </button>
              <button
                type="button"
                onClick={() => setIsRescheduling(false)}
                className="px-4 py-2 border border-[#d8e5e2] text-[#152f34] rounded-xl font-semibold hover:bg-white"
              >
                {isUz ? 'Bekor qilish' : 'Отмена'}
              </button>
            </div>
          </form>
        )}

        {/* Cancel Form Drawer */}
        {isCancelling && (
          <form onSubmit={handleCancelSubmit} className="p-4 bg-rose-50/60 rounded-2xl border border-rose-200 space-y-3 animate-fade-in text-xs">
            <h3 className="font-bold text-rose-900 text-sm">
              {isUz ? 'Haqiqatan ham qabulni bekor qilmoqchimisiz?' : 'Вы действительно хотите отменить прием?'}
            </h3>
            <textarea
              placeholder={isUz ? 'Bekor qilish sababi (ixtiyoriy)...' : 'Причина отмены (необязательно)...'}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full p-3 bg-white rounded-xl border border-rose-200 text-[#152f34]"
              rows={2}
            />
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={isSubmittingCancel}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold"
              >
                {isSubmittingCancel
                  ? (isUz ? 'Bekor qilinmoqda...' : 'Отмена...')
                  : (isUz ? 'Ha, bekor qilinsin' : 'Да, отменить')}
              </button>
              <button
                type="button"
                onClick={() => setIsCancelling(false)}
                className="px-4 py-2 border border-[#d8e5e2] text-[#152f34] rounded-xl font-semibold hover:bg-white"
              >
                {isUz ? 'Ortga qaytish' : 'Назад'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Security & Milestone Disclosure */}
      <div className="p-4 bg-white rounded-2xl border border-[#d8e5e2] text-xs text-[#52696e] flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-[#167b78] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <strong className="text-[#152f34] block">
            {isUz ? 'Maxfiylik va Xavfsizlik' : 'Конфиденциальность и безопасность'}
          </strong>
          <p className="leading-relaxed">
            {isUz
              ? "Qabulingiz shaxsiy maxfiy havola orqali himoyalangan. Barcha ma'lumotlar xavfsiz saqlanadi."
              : 'Ваша запись защищена персональной секретной ссылкой. Все данные хранятся в безопасности.'}
          </p>
        </div>
      </div>
    </div>
  );
}


