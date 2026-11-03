'use client';

import React from 'react';
import Link from 'next/link';
import {
  Play,
  Check,
  CheckCircle2,
  Calendar as CalendarIcon,
  Clock,
  ExternalLink,
  Sliders,
  Paperclip,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
} from 'lucide-react';
import { InteractiveOdontogram } from '../InteractiveOdontogram';
import { formatClinicDate, formatClinicTime } from '../../lib/dateFormat';
import { api } from '../../lib/api';

export interface DoctorWorkspaceProps {
  filteredToday: any[];
  upcomingAppointments: any[];
  isUz: boolean;
  selectedTooth: number;
  setSelectedTooth: (tooth: number) => void;
  xrayBrightness: number;
  setXrayBrightness: React.Dispatch<React.SetStateAction<number>>;
  xrayContrast: number;
  setXrayContrast: React.Dispatch<React.SetStateAction<number>>;
  doctorAttachments: Array<{ id: string; name: string; type: string; date: string }>;
  renderStatusBadge: (appt: any) => React.ReactNode;
  handleStartTreatment: (id: string) => void;
  handleRecordDelay: (id: string) => void;
  handleStatusChange: (id: string, status: string) => void;
  handleOpenCancelModal: (appt: any) => void;
}

export function DoctorWorkspace({
  filteredToday,
  upcomingAppointments,
  isUz,
  selectedTooth,
  setSelectedTooth,
  xrayBrightness,
  setXrayBrightness,
  xrayContrast,
  setXrayContrast,
  doctorAttachments,
  renderStatusBadge,
  handleStartTreatment,
  handleRecordDelay,
  handleStatusChange,
  handleOpenCancelModal,
}: DoctorWorkspaceProps) {
  const activeAppt = filteredToday.find((a) => a.status === 'CHECKED_IN') || filteredToday[0];
  const patientName = activeAppt?.patient?.fullName || activeAppt?.patientName || (isUz ? 'Aziz Rahimov' : 'Азиз Рахимов');
  const patientId = activeAppt ? `#${activeAppt.id.slice(-4).toUpperCase()}` : '#8329';
  const rawPatientId = activeAppt?.patient?.id || activeAppt?.patientId || 'pat-1';
  const [earnings, setEarnings] = React.useState<any>(null);

  React.useEffect(() => {
    api.getMyDoctorEarnings()
      .then((res) => setEarnings(res))
      .catch(() => {});
  }, []);
  const serviceName = activeAppt
    ? (isUz ? (activeAppt.serviceName || activeAppt.service?.nameUz) : (activeAppt.service?.nameRu || activeAppt.serviceName))
    : (isUz ? 'Tish davolash / Molyar restavratsiyasi' : 'Лечение зуба / Реставрация моляра');

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left 8 Cols: Patient Header, Odontogram, Treatment Plan & X-Ray Viewer */}
      <div className="lg:col-span-8 space-y-6">
        {/* Patient Header Card */}
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
          </div>
        </div>

        {/* Interactive Odontogram Component */}
        <InteractiveOdontogram
          patientId={rawPatientId}
          patientName={patientName}
        />

        {/* X-Ray Radiography Viewer Module */}
        <div className="ui-card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#d8e5e2] pb-3">
            <div>
              <h3 className="text-sm font-bold text-[#152f34] flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#167b78]" />
                <span>{isUz ? 'Rentgen va Tomografiya tahlili (DICOM/OPG)' : 'Рентгенодиагностика и Томография (DICOM/OPG)'}</span>
              </h3>
              <p className="text-xs text-[#52696e] mt-0.5">
                {isUz
                  ? "Rentgen tasviri yorug'ligi va kontrastini sozlash orqali ildiz kanallarini aniq ko'rish"
                  : 'Настройка яркости и контрастности для детального осмотра корневых каналов'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#52696e]">
                {isUz ? 'Yorug\'lik:' : 'Яркость:'} {xrayBrightness}%
              </span>
              <input
                type="range"
                min="50"
                max="180"
                value={xrayBrightness}
                onChange={(e) => setXrayBrightness(Number(e.target.value))}
                className="w-24 accent-[#167b78] cursor-pointer"
              />
              <span className="text-xs font-semibold text-[#52696e] ml-2">
                {isUz ? 'Kontrast:' : 'Контраст:'} {xrayContrast}%
              </span>
              <input
                type="range"
                min="50"
                max="200"
                value={xrayContrast}
                onChange={(e) => setXrayContrast(Number(e.target.value))}
                className="w-24 accent-[#167b78] cursor-pointer"
              />
              <button
                type="button"
                onClick={() => {
                  setXrayBrightness(100);
                  setXrayContrast(100);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                title={isUz ? 'Asliga qaytarish' : 'Сброс'}
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Interactive Simulated X-Ray Canvas */}
          <div className="relative w-full h-80 rounded-2xl bg-black border border-slate-800 overflow-hidden flex items-center justify-center select-none">
            <div
              className="absolute inset-0 bg-cover bg-center transition-all duration-75"
              style={{
                filter: `brightness(${xrayBrightness}%) contrast(${xrayContrast}%) grayscale(100%)`,
                backgroundImage: `radial-gradient(circle at center, #2a2a2a 0%, #050505 100%)`,
              }}
            >
              <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-3">
                <div className="w-48 h-32 border border-dashed border-teal-500/40 rounded-xl flex items-center justify-center bg-teal-950/20 backdrop-blur-xs">
                  <div className="text-center space-y-1">
                    <span className="text-xs font-mono font-bold text-teal-400 block">
                      [DICOM DENTAL CT #14]
                    </span>
                    <span className="text-[11px] text-teal-200/70 font-mono block">
                      Apikal soha: Patologiyasiz
                    </span>
                    <span className="text-[10px] text-teal-200/50 block">
                      {isUz ? 'Ildiz kanallari uzunligi: 21mm' : 'Длина корневого канала: 21мм'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md px-3 py-1 rounded-lg text-white font-mono text-[11px] border border-white/10 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{isUz ? 'Bemor' : 'Пациент'}: {patientName} (OPG HD 2026)</span>
            </div>

            <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-md p-1 rounded-xl border border-white/10">
              <button
                type="button"
                onClick={() => {
                  setXrayBrightness((b) => Math.min(180, b + 10));
                  setXrayContrast((c) => Math.min(200, c + 10));
                }}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg text-xs"
                title={isUz ? 'Kattalashtirish' : 'Увеличить'}
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setXrayBrightness((b) => Math.max(50, b - 10));
                  setXrayContrast((c) => Math.max(50, c - 10));
                }}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg text-xs"
                title={isUz ? 'Kichiklashtirish' : 'Уменьшить'}
              >
                <ZoomOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Right 4 Cols: Clinical Protocol, Doctor Quick Notes, Attachments & Doctor Schedule */}
      <div className="lg:col-span-4 space-y-6">
        {/* Doctor Earnings & Commission Summary */}
        <div className="ui-card bg-gradient-to-br from-[#167b78]/10 via-[#14bdac]/5 to-transparent border border-[#167b78]/20 p-4 rounded-2xl space-y-3">
          <div className="flex items-center justify-between border-b border-[#167b78]/20 pb-2">
            <span className="text-xs font-bold text-[#152f34] uppercase tracking-wide">
              {isUz ? 'Mening Komissiyam' : 'Моя комиссия'}
            </span>
            <span className="text-xs font-extrabold px-2 py-0.5 bg-[#167b78] text-white rounded-full">
              {earnings ? `${earnings.percentage}%` : '30%'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 bg-white/80 rounded-xl border border-[#d8e5e2]">
              <span className="text-[10px] text-[#52696e] block">{isUz ? 'Jami tushum' : 'Всего сборов'}</span>
              <span className="font-bold text-[#152f34] text-sm">
                {(earnings?.totalCollected || 0).toLocaleString()} {isUz ? "so'm" : 'сум'}
              </span>
            </div>
            <div className="p-2.5 bg-white/80 rounded-xl border border-[#d8e5e2]">
              <span className="text-[10px] text-[#167b78] font-bold block">{isUz ? 'Hisoblangan daromad' : 'Заработано'}</span>
              <span className="font-extrabold text-[#167b78] text-sm">
                {(earnings?.totalEarned || 0).toLocaleString()} {isUz ? "so'm" : 'сум'}
              </span>
            </div>
          </div>
          {earnings?.fixedBonus > 0 && (
            <p className="text-[10px] text-[#52696e]">
              {isUz ? `Qo'shimcha fiks bonus: ${earnings.fixedBonus.toLocaleString()} so'm` : `Фикс бонус: ${earnings.fixedBonus.toLocaleString()} сум`}
            </p>
          )}
        </div>

        {/* Doctor Day Schedule */}
        <div className="ui-card space-y-3">
          <div className="flex items-center justify-between border-b border-[#d8e5e2] pb-2.5">
            <h3 className="font-bold text-sm text-[#152f34] flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-[#167b78]" />
              <span>{isUz ? 'Bugungi qabullaringiz' : 'Ваши приемы на сегодня'}</span>
            </h3>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#e0f2ed] text-[#167b78]">
              {filteredToday.length} {isUz ? 'ta qabul' : 'приемов'}
            </span>
          </div>

          <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
            {filteredToday.length === 0 ? (
              <p className="text-xs text-[#52696e] text-center py-6">
                {isUz ? 'Bugun rejalashtirilgan qabullar yo\'q' : 'На сегодня приемов нет'}
              </p>
            ) : (
              filteredToday.map((appt) => {
                const isSelected = activeAppt?.id === appt.id;
                const timeStr = `${formatClinicTime(appt.startTime)} — ${formatClinicTime(appt.endTime)}`;

                return (
                  <div
                    key={appt.id}
                    className={`p-3 rounded-2xl border transition-all ${
                      isSelected
                        ? 'bg-[#167b78] text-white border-[#116460] shadow-sm'
                        : 'bg-white border-[#d8e5e2] hover:bg-[#f3f8f7]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`font-mono text-xs font-bold ${isSelected ? 'text-white' : 'text-[#152f34]'}`}>
                        {timeStr}
                      </span>
                      {renderStatusBadge(appt)}
                    </div>
                    <h4 className={`text-sm font-bold truncate ${isSelected ? 'text-white' : 'text-[#152f34]'}`}>
                      {appt.patient?.fullName || appt.patientName}
                    </h4>
                    <p className={`text-xs mt-0.5 truncate ${isSelected ? 'text-[#e0f2ed]' : 'text-[#52696e]'}`}>
                      {isUz ? (appt.serviceName || appt.service?.nameUz) : (appt.service?.nameRu || appt.serviceName)}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Clinical Attachments */}
        <div className="ui-card space-y-3">
          <div className="flex items-center justify-between border-b border-[#d8e5e2] pb-2.5">
            <h3 className="font-bold text-sm text-[#152f34] flex items-center gap-2">
              <Paperclip className="w-4 h-4 text-[#167b78]" />
              <span>{isUz ? 'Biriktirilgan fayllar' : 'Прикрепленные файлы'}</span>
            </h3>
            <span className="text-[10px] font-bold text-[#167b78]">
              {doctorAttachments.length} {isUz ? 'ta fayl' : 'файла'}
            </span>
          </div>

          <div className="space-y-2">
            {doctorAttachments.map((att) => (
              <div
                key={att.id}
                className="p-2.5 bg-[#f8fbfa] hover:bg-[#f0f7f5] rounded-xl border border-[#d8e5e2] flex items-center justify-between gap-2 text-xs transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-bold text-[#152f34] truncate">{att.name}</p>
                  <span className="text-[10px] text-[#52696e]">
                    {att.type} • {att.date}
                  </span>
                </div>
                <button
                  type="button"
                  className="px-2 py-1 bg-white hover:bg-slate-100 text-[#167b78] rounded-lg text-[11px] font-bold border border-[#d8e5e2] shrink-0"
                >
                  {isUz ? 'Ochish' : 'Открыть'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Appointments */}
        <div className="ui-card space-y-3">
          <div className="flex items-center justify-between border-b border-[#d8e5e2] pb-2.5">
            <h3 className="font-bold text-sm text-[#152f34] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#167b78]" />
              <span>{isUz ? 'Yaqin kunlardagi qabullar' : 'Ближайшие записи'}</span>
            </h3>
          </div>

          {upcomingAppointments.length === 0 ? (
            <p className="text-xs text-[#52696e] text-center py-4">
              {isUz ? 'Yaqin kunlarda boshqa qabullar yo\'q' : 'Ближайших записей нет'}
            </p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {upcomingAppointments.slice(0, 5).map((appt) => {
                const dateStr = formatClinicDate(appt.startTime);
                const timeStr = `${formatClinicTime(appt.startTime)} — ${formatClinicTime(appt.endTime)}`;

                return (
                  <div
                    key={appt.id}
                    className="p-3 bg-white hover:bg-[#f8fbfa] rounded-2xl border border-[#d8e5e2] transition-all"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-mono text-xs font-black text-[#152f34]">
                        {dateStr} • {timeStr}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-[#152f34]">
                      {appt.patient?.fullName || appt.patientName}
                    </h4>
                    <p className="text-xs text-[#52696e] mt-0.5">
                      {isUz
                        ? (appt.serviceName || appt.service?.nameUz || 'Stomatologik ko\'rik')
                        : (appt.service?.nameRu || appt.serviceName || 'Стоматологический осмотр')}
                    </p>
                    <div className="mt-2 pt-2 border-t border-black/5 flex items-center justify-between">
                      <div>{renderStatusBadge(appt)}</div>
                      <Link
                        href={`/admin/calendar?appointmentId=${appt.id}`}
                        className="text-xs text-[#167b78] font-bold hover:underline flex items-center gap-1"
                      >
                        <span>{isUz ? 'Taqvimda ko\'rish' : 'В календаре'}</span>
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
  );
}

