'use client';

import React from 'react';
import Link from 'next/link';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Play,
  Plus,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Wallet,
  Printer,
} from 'lucide-react';
import { PaymentReceiptModal, PaymentReceiptData } from './PaymentReceiptModal';
import { PhoneInput } from '../PhoneInput';
import { CustomSelect } from '../CustomSelect';
import { formatClinicDate, formatClinicTime } from '../../lib/dateFormat';

export interface ReceptionWorkspaceProps {
  filteredToday: any[];
  queueItems: any[];
  queueTab: 'ALL' | 'ARRIVED' | 'IN_TREATMENT' | 'COMPLETED';
  setQueueTab: (tab: 'ALL' | 'ARRIVED' | 'IN_TREATMENT' | 'COMPLETED') => void;
  arrivedCount: number;
  inTreatmentCount: number;
  completedTodayCount: number;
  mutatingMap: Record<string, string>;
  handleStatusChange: (id: string, status: string) => void;
  handleStartTreatment: (id: string) => void;
  isUz: boolean;
  language: 'uz' | 'ru';
  // Quick Reg
  savedAppointmentSummary: any;
  regSuccessMsg: string | null;
  regErrorMsg: string | null;
  regName: string;
  setRegName: (v: string) => void;
  regPhone: string;
  setRegPhone: (v: string) => void;
  regDoctorId: string;
  handleDoctorSelect: (id: string) => void;
  regServiceId: string;
  handleServiceSelect: (id: string) => void;
  regBranchId: string;
  handleBranchSelect: (id: string) => void;
  branches: any[];
  availableDoctorsForReg: any[];
  availableServicesForReg: any[];
  selectedDoctorObjForReg: any;
  selectedServiceObj: any;
  selectedBranchObjForReg: any;
  regSlotQuote: any;
  regSlots: Array<{ startTime: string; endTime: string; available: boolean }>;
  isLoadingSlots: boolean;
  slotFetchError: string | null;
  setSlotRefreshSeq: React.Dispatch<React.SetStateAction<number>>;
  regSelectedSlot: string;
  setRegSelectedSlot: (slot: string) => void;
  regConsentGiven: boolean;
  setRegConsentGiven: (v: boolean) => void;
  isSubmittingReg: boolean;
  handleQuickRegister: (e: React.FormEvent) => void;
  handleResetQuickReg: () => void;
  onOpenDebtModal?: () => void;
  invoices?: any[];
  totalDebt?: number;
}

export function ReceptionWorkspace({
  filteredToday,
  queueItems,
  queueTab,
  setQueueTab,
  arrivedCount,
  inTreatmentCount,
  completedTodayCount,
  mutatingMap,
  handleStatusChange,
  handleStartTreatment,
  isUz,
  language,
  savedAppointmentSummary,
  regSuccessMsg,
  regErrorMsg,
  regName,
  setRegName,
  regPhone,
  setRegPhone,
  regDoctorId,
  handleDoctorSelect,
  regServiceId,
  handleServiceSelect,
  regBranchId,
  handleBranchSelect,
  branches,
  availableDoctorsForReg,
  availableServicesForReg,
  selectedDoctorObjForReg,
  selectedServiceObj,
  selectedBranchObjForReg,
  regSlotQuote,
  regSlots,
  isLoadingSlots,
  slotFetchError,
  setSlotRefreshSeq,
  regSelectedSlot,
  setRegSelectedSlot,
  regConsentGiven,
  setRegConsentGiven,
  isSubmittingReg,
  handleQuickRegister,
  handleResetQuickReg,
  onOpenDebtModal,
  invoices = [],
  totalDebt = 0,
}: ReceptionWorkspaceProps) {
  const [selectedReceipt, setSelectedReceipt] = React.useState<PaymentReceiptData | null>(null);
  const [receiptModalOpen, setReceiptModalOpen] = React.useState(false);

  const handleOpenReceipt = (rec: PaymentReceiptData) => {
    setSelectedReceipt(rec);
    setReceiptModalOpen(true);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Column 1 (5 cols): Daily Appointment Calendar */}
      <div className="lg:col-span-5 space-y-4">
        <div className="ui-card space-y-4">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <h2 className="text-base font-extrabold text-ink">
                {isUz ? 'Kunlik qabullar taqvimi' : 'Ежедневный календарь приемов'}
              </h2>
              <p suppressHydrationWarning className="text-xs text-ink-muted">
                {formatClinicDate(new Date().toISOString(), language, { includeWeekday: false })}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" className="p-1 hover:bg-canvas rounded-lg text-ink-muted">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-bold text-brand-600 bg-brand-100 px-2 py-0.5 rounded-md">
                {isUz ? 'Bugun' : 'Сегодня'}
              </span>
              <button type="button" className="p-1 hover:bg-canvas rounded-lg text-ink-muted">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {filteredToday.length === 0 ? (
            <div className="p-12 text-center text-ink-muted space-y-2 bg-canvas rounded-xl border border-dashed border-line">
              <Calendar className="w-8 h-8 mx-auto text-brand-200" />
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
                        ? 'bg-brand-600 text-white border-brand-700 shadow-xs'
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
                            className="px-2.5 py-1 bg-white text-brand-600 rounded-lg text-[11px] font-bold shadow-xs hover:bg-canvas"
                          >
                            {isUz ? 'Keldi' : 'Прибыл'}
                          </button>
                        )}
                        {appt.status === 'CHECKED_IN' && !appt.actualStartTime && (
                          <button
                            type="button"
                            disabled={isMutating}
                            onClick={() => handleStartTreatment(appt.id)}
                            className="px-2.5 py-1 bg-white text-blue-700 rounded-lg text-[11px] font-bold shadow-xs hover:bg-canvas flex items-center gap-1"
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

      {/* Column 2 (4 cols): Check-In Queue */}
      <div className="lg:col-span-4 space-y-4">
        <div className="ui-card space-y-4">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <h2 className="text-base font-extrabold text-ink">
                {isUz ? 'Bemorlar navbati' : 'Очередь пациентов'}
              </h2>
              <p className="text-xs text-ink-muted">
                {isUz ? 'Klinikada navbatdagi bemorlar' : 'Пациенты в очереди клиники'}
              </p>
            </div>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-brand-100 text-brand-600">
              {queueItems.length} {isUz ? 'nafar' : 'чел.'}
            </span>
          </div>

          {/* Queue Tabs */}
          <div className="flex items-center gap-1 bg-canvas p-1 rounded-xl text-xs overflow-x-auto">
            <button
              type="button"
              onClick={() => setQueueTab('ALL')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                queueTab === 'ALL' ? 'bg-white text-ink shadow-xs' : 'text-ink-muted'
              }`}
            >
              {isUz ? 'Barchasi' : 'Все'} ({filteredToday.length})
            </button>
            <button
              type="button"
              onClick={() => setQueueTab('ARRIVED')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                queueTab === 'ARRIVED' ? 'bg-white text-ink shadow-xs' : 'text-ink-muted'
              }`}
            >
              {isUz ? 'Kutmoqda' : 'Ожидают'} ({arrivedCount})
            </button>
            <button
              type="button"
              onClick={() => setQueueTab('IN_TREATMENT')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                queueTab === 'IN_TREATMENT' ? 'bg-white text-ink shadow-xs' : 'text-ink-muted'
              }`}
            >
              {isUz ? 'Kresloda' : 'В кресле'} ({inTreatmentCount})
            </button>
            <button
              type="button"
              onClick={() => setQueueTab('COMPLETED')}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                queueTab === 'COMPLETED' ? 'bg-white text-ink shadow-xs' : 'text-ink-muted'
              }`}
            >
              {isUz ? 'Tugallanganlar' : 'Завершенные'} ({completedTodayCount})
            </button>
          </div>

          {queueItems.length === 0 ? (
            <p className="text-xs text-ink-muted text-center p-6 bg-canvas rounded-xl border border-dashed border-line">
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
                    className="p-3 bg-white hover:bg-canvas rounded-2xl border border-line flex items-center justify-between gap-3 shadow-2xs transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center font-bold text-sm shrink-0">
                        {(item.patient?.fullName || item.patientName || 'B').charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-xs text-ink truncate">
                          {item.patient?.fullName || item.patientName}
                        </p>
                        <p className="text-[11px] text-ink-muted truncate">
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
                        <span className="px-2.5 py-1 rounded-full bg-canvas text-ink font-bold text-[11px]">
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

      {/* Column 3 (3 cols): Quick Patient Registration & Billing Status */}
      <div className="lg:col-span-3 space-y-6">
        {/* Card 1: Quick Patient Registration */}
        <div className="ui-card space-y-3.5">
          <div className="border-b border-line pb-2.5 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-ink">
                {isUz ? 'Tezkor bemor ro\'yxatga olish' : 'Быстрая регистрация пациента'}
              </h2>
              <p className="text-[11px] text-ink-muted">
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
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-brand-100/60 rounded-xl border border-brand-600/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-ink">
                    {savedAppointmentSummary.patient?.fullName || savedAppointmentSummary.patientName}
                  </span>
                  <span className="text-[10px] font-mono text-ink-muted">
                    {savedAppointmentSummary.patient?.phone || savedAppointmentSummary.patientPhone}
                  </span>
                </div>

                <div className="text-[11px] text-ink-muted space-y-1 pt-1 border-t border-black/5">
                  <p>
                    <strong className="text-ink">{isUz ? 'Vaqt:' : 'Время:'}</strong>{' '}
                    {formatClinicDate(savedAppointmentSummary.startTime, language, { includeWeekday: false })}{' '}
                    <span className="font-mono font-bold text-brand-600">
                      {formatClinicTime(savedAppointmentSummary.startTime)} — {formatClinicTime(savedAppointmentSummary.endTime)}
                    </span>
                  </p>
                  <p>
                    <strong className="text-ink">{isUz ? 'Shifokor:' : 'Врач:'}</strong>{' '}
                    {savedAppointmentSummary.doctorName ||
                      (selectedDoctorObjForReg
                        ? `${isUz ? 'Dr.' : 'Др.'} ${isUz ? `${selectedDoctorObjForReg.firstNameUz} ${selectedDoctorObjForReg.lastNameUz}` : `${selectedDoctorObjForReg.firstNameRu || selectedDoctorObjForReg.firstNameUz} ${selectedDoctorObjForReg.lastNameRu || selectedDoctorObjForReg.lastNameUz}`}`
                        : '')}
                  </p>
                  <p>
                    <strong className="text-ink">{isUz ? 'Xizmat:' : 'Услуга:'}</strong>{' '}
                    {savedAppointmentSummary.serviceName ||
                      (selectedServiceObj ? (isUz ? selectedServiceObj.nameUz : (selectedServiceObj.nameRu || selectedServiceObj.nameUz)) : '')}
                  </p>
                  <p>
                    <strong className="text-ink">{isUz ? 'Filial:' : 'Филиал:'}</strong>{' '}
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
                  className="px-3 py-2 bg-canvas hover:bg-brand-50 text-ink border border-line rounded-xl text-xs font-bold"
                >
                  {isUz ? 'Yangi bemor' : 'Новый'}
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleQuickRegister} className="space-y-2.5 text-xs">
              <div>
                <label className="text-[11px] font-bold text-ink-muted block mb-1">
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
                <label className="text-[11px] font-bold text-ink-muted block mb-1">
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
                  <label className="text-[11px] font-bold text-ink-muted block mb-1">
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
                <div className="p-2 bg-canvas border border-line rounded-xl flex items-center justify-between text-xs">
                  <span className="text-ink-muted text-[11px] font-medium">{isUz ? 'Filial:' : 'Филиал:'}</span>
                  <span className="font-bold text-ink text-[11px]">
                    {isUz ? branches[0].nameUz : (branches[0].nameRu || branches[0].nameUz)}
                  </span>
                </div>
              ) : null}

              <div>
                <label className="text-[11px] font-bold text-ink-muted block mb-1">
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
                <label className="text-[11px] font-bold text-ink-muted block mb-1">
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
                <div className="p-2 bg-canvas border border-line rounded-xl text-[11px] text-ink-muted flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-brand-600" />
                    <span>
                      ~{regSlotQuote?.durationMinutes ?? selectedServiceObj.durationMinutes} {isUz ? 'daq' : 'мин'}
                      {' '}(+{regSlotQuote?.bufferMinutes ?? selectedServiceObj.bufferMinutes ?? 5} {isUz ? 'oraliq' : 'буфер'})
                    </span>
                  </span>
                  <span className="font-bold text-ink">
                    {Math.round(((regSlotQuote?.priceFrom ?? selectedServiceObj.priceFrom) || 0) / 100).toLocaleString()} {isUz ? "so'm" : 'сум'}
                  </span>
                </div>
              )}

              {/* Server-Authoritative Available Slots Selection */}
              {regDoctorId && regServiceId && regBranchId && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-bold text-ink-muted">
                      {isUz ? 'Bugungi bo\'sh vaqt' : 'Свободное время на сегодня'}
                    </label>
                    {!isLoadingSlots && (
                      <button
                        type="button"
                        onClick={() => setSlotRefreshSeq((s) => s + 1)}
                        className="text-[10px] text-brand-600 hover:underline flex items-center gap-1 font-bold"
                        title={isUz ? 'Vaqtlarni yangilash' : 'Обновить слоты'}
                      >
                        <RefreshCw className="w-2.5 h-2.5" />
                        <span>{isUz ? 'Yangilash' : 'Обновить'}</span>
                      </button>
                    )}
                  </div>

                  {isLoadingSlots ? (
                    <div className="p-2.5 bg-canvas rounded-xl text-[11px] text-ink-muted flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-600" />
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
                        className="inline-flex items-center gap-1 font-bold text-brand-600 hover:underline text-[11px]"
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
                  className="mt-0.5 rounded text-brand-600 focus:ring-brand-600"
                  required
                />
                <span className="text-[11px] text-ink-muted font-medium leading-tight">
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

        {/* Card 2: Billing Status & Invoices Summary */}
        <div className="ui-card space-y-3.5">
          <div className="flex items-center justify-between border-b border-line pb-2.5">
            <div>
              <h2 className="text-sm font-bold text-ink">
                {isUz ? 'Hisob-kitob va Qarzlar' : 'Статус оплаты и долги'}
              </h2>
              <span className="text-[11px] text-ink-muted">
                {isUz ? 'Bemorlar hisob-fakturalari' : 'Счета пациентов'}
              </span>
            </div>
            {onOpenDebtModal && (
              <button
                type="button"
                onClick={onOpenDebtModal}
                className="text-xs text-rose-600 font-bold hover:underline flex items-center gap-1"
              >
                <Wallet className="w-3.5 h-3.5" />
                <span>{isUz ? "Qarz to'lash" : 'Погасить'}</span>
              </button>
            )}
          </div>

          {/* Total Clinic Debt Pill */}
          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-xs">
            <div>
              <span className="text-[10px] text-rose-800 font-bold uppercase block">
                {isUz ? 'Jami qarzlar:' : 'Общий долг:'}
              </span>
              <span className="text-xs font-black text-rose-900">
                {totalDebt.toLocaleString()} {isUz ? "so'm" : 'сум'}
              </span>
            </div>
            {onOpenDebtModal && (
              <button
                type="button"
                onClick={onOpenDebtModal}
                className="px-2.5 py-1 bg-rose-600 text-white rounded-lg text-[11px] font-bold shadow-2xs hover:bg-rose-700"
              >
                {isUz ? "To'lash" : 'Погасить'}
              </button>
            )}
          </div>

          {/* Live Invoices list */}
          <div className="space-y-2 text-xs">
            {invoices.slice(0, 3).map((inv) => (
              <div key={inv.id} className="p-2.5 bg-canvas rounded-xl border border-line flex items-center justify-between">
                <div className="min-w-0 pr-2">
                  <p className="font-bold text-ink truncate">{inv.patientName || inv.patient?.fullName}</p>
                  <span className="text-[10px] text-ink-muted block truncate">
                    {inv.procedures?.[0]?.nameUz || (isUz ? 'Stomatologik muolaja' : 'Стоматологическая процедура')}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold text-[10px] block mb-0.5 ${
                        inv.status === 'PAID'
                          ? 'bg-emerald-100 text-emerald-800'
                          : inv.status === 'PARTIALLY_PAID'
                          ? 'bg-blue-100 text-blue-800'
                          : inv.status === 'CANCELLED'
                          ? 'bg-line text-ink-muted'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {inv.status === 'PAID'
                        ? (isUz ? "To'langan" : 'Оплачено')
                        : inv.status === 'PARTIALLY_PAID'
                        ? (isUz ? 'Qisman' : 'Частично')
                        : inv.status === 'CANCELLED'
                        ? (isUz ? 'Bekor qilingan' : 'Отменён')
                        : (isUz ? 'Kutilmoqda' : 'В ожидании')}
                    </span>
                    <strong className="text-xs text-ink">
                      {(inv.totalAmount || 0).toLocaleString()} {isUz ? "so'm" : 'сум'}
                    </strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenReceipt({
                      patientName: inv.patientName || inv.patient?.fullName || (isUz ? 'Bemor' : 'Пациент'),
                      amount: inv.paidAmount || inv.totalAmount || 0,
                      method: inv.payments?.[0]?.method || 'CASH',
                      date: inv.createdAt || new Date(),
                      invoiceId: inv.id,
                      serviceName: inv.procedures?.[0]?.nameUz || (isUz ? 'Stomatologik xizmat' : 'Стоматологическая процедура'),
                      note: inv.notes,
                    })}
                    className="p-1.5 text-ink-subtle hover:text-brand-600 hover:bg-brand-100 rounded-lg transition-colors cursor-pointer"
                    title={isUz ? 'Kvitansiyani chop etish' : 'Печать квитанции'}
                  >
                    <Printer className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {invoices.length === 0 && (
              <p className="text-center text-[11px] text-ink-muted py-3">
                {isUz ? 'Hozircha hisob-fakturalar yo\'q' : 'Счетов пока нет'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

