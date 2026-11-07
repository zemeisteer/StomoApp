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
  Upload,
  RotateCw,
  RefreshCw,
  Image as ImageIcon,
  AlertCircle,
  Eye,
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
  const [zoomLevel, setZoomLevel] = React.useState<number>(1);
  const [rotationDeg, setRotationDeg] = React.useState<number>(0);
  const [isInverted, setIsInverted] = React.useState<boolean>(false);
  const [xrays, setXrays] = React.useState<Array<{ id: string; url: string; name: string; date?: string }>>([]);
  const [selectedXrayIndex, setSelectedXrayIndex] = React.useState<number>(0);
  const [isUploading, setIsUploading] = React.useState<boolean>(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    api.getMediaList('xray')
      .then((res) => {
        if (res?.data && res.data.length > 0) {
          setXrays(
            res.data.map((item: any) => ({
              id: item.id,
              url: item.url,
              name: item.originalName || item.fileName,
              date: item.createdAt,
            })),
          );
        }
      })
      .catch(() => {});
  }, []);

  const handleXrayUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setUploadError(isUz ? 'Fayl hajmi 5MB dan oshmasligi kerak' : 'Размер файла не должен превышать 5МБ');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    try {
      const res = await api.uploadMedia(file, 'xray');
      const newXray = {
        id: res.id,
        url: res.url,
        name: res.originalName || file.name,
        date: new Date().toISOString(),
      };
      setXrays((prev) => [newXray, ...prev]);
      setSelectedXrayIndex(0);
      setZoomLevel(1);
      setRotationDeg(0);
    } catch (err: any) {
      setUploadError(err?.message || (isUz ? 'Yuklashda xatolik yuz berdi' : 'Ошибка при загрузке'));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleResetControls = () => {
    setXrayBrightness(100);
    setXrayContrast(100);
    setZoomLevel(1);
    setRotationDeg(0);
    setIsInverted(false);
  };

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
        <div className="ui-card flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-4 border-l-brand-600">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-full bg-brand-600 text-white flex items-center justify-center font-bold text-base shadow-sm">
              {patientName.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-ink">
                  {isUz ? 'Bemor' : 'Пациент'}: {patientName} <span className="text-sm font-normal text-ink-muted">(ID: {patientId})</span>
                </h2>
                {activeAppt && renderStatusBadge(activeAppt)}
              </div>
              <p className="text-xs text-ink-muted mt-0.5">
                {serviceName} • {activeAppt ? `${activeAppt.durationMinutes} ${isUz ? 'daqiqa' : 'мин'}` : (isUz ? '45 daqiqa' : '45 мин')} • DentaCare Clinic
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            {activeAppt && !activeAppt.actualStartTime && (
              <button
                type="button"
                onClick={() => handleStartTreatment(activeAppt.id)}
                className="px-3.5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
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
          {/* Hidden File Input for Doctor X-Ray Upload */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleXrayUpload}
          />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-line pb-3">
            <div>
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-brand-600" />
                <h3 className="text-sm font-bold text-ink">
                  {isUz ? 'Rentgen va Tomografiya tahlili (DICOM/OPG)' : 'Рентгенодиагностика и Томография (DICOM/OPG)'}
                </h3>
                {xrays.length > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {xrays.length} {isUz ? 'ta rasm' : 'снимков'}
                  </span>
                )}
              </div>
              <p className="text-xs text-ink-muted mt-0.5">
                {isUz
                  ? "Ildiz kanallari va suyak to'qimasini tahlil qilish: yorug'lik, kontrast, kattalashtirish va negativ/pozitiv filtrlar"
                  : 'Анализ корневых каналов и костной ткани: яркость, контраст, масштабирование и негатив'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors"
                title={isUz ? 'Kompyuterdan rentgen rasmini yuklash' : 'Загрузить рентген снимок'}
              >
                {isUploading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                <span>{isUploading ? (isUz ? 'Yuklanmoqda...' : 'Загрузка...') : (isUz ? 'Rentgen yuklash' : 'Загрузить снимок')}</span>
              </button>

              <div className="h-4 w-px bg-line hidden sm:block" />

              <div className="flex items-center gap-1.5 text-xs text-ink-muted bg-canvas px-2 py-1 rounded-xl border border-line">
                <span className="font-medium text-[11px]">{isUz ? 'Yorug\':' : 'Ярк:'} {xrayBrightness}%</span>
                <input
                  type="range"
                  min="40"
                  max="180"
                  value={xrayBrightness}
                  onChange={(e) => setXrayBrightness(Number(e.target.value))}
                  className="w-16 accent-brand-600 cursor-pointer"
                  title={isUz ? 'Yorug\'lik' : 'Яркость'}
                />
              </div>

              <div className="flex items-center gap-1.5 text-xs text-ink-muted bg-canvas px-2 py-1 rounded-xl border border-line">
                <span className="font-medium text-[11px]">{isUz ? 'Kontrast:' : 'Контр:'} {xrayContrast}%</span>
                <input
                  type="range"
                  min="50"
                  max="200"
                  value={xrayContrast}
                  onChange={(e) => setXrayContrast(Number(e.target.value))}
                  className="w-16 accent-brand-600 cursor-pointer"
                  title={isUz ? 'Kontrast' : 'Контраст'}
                />
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsInverted((prev) => !prev)}
                  className={`px-2 py-1 rounded-xl text-xs font-semibold border transition-colors ${
                    isInverted
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white text-ink border-line hover:bg-canvas'
                  }`}
                  title={isUz ? 'Negativ / Pozitiv rentgen rejimi' : 'Режим негатива / позитива'}
                >
                  {isUz ? 'Negativ' : 'Негатив'}
                </button>

                <button
                  type="button"
                  onClick={() => setRotationDeg((deg) => (deg + 90) % 360)}
                  className="p-1.5 text-ink-muted hover:text-ink bg-white border border-line rounded-xl hover:bg-canvas text-xs"
                  title={isUz ? '90° ga burish' : 'Повернуть на 90°'}
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
                  className="p-1.5 text-ink-muted hover:text-ink bg-white border border-line rounded-xl hover:bg-canvas text-xs"
                  title={isUz ? 'Kattalashtirish' : 'Увеличить'}
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
                  className="p-1.5 text-ink-muted hover:text-ink bg-white border border-line rounded-xl hover:bg-canvas text-xs"
                  title={isUz ? 'Kichiklashtirish' : 'Уменьшить'}
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={handleResetControls}
                  className="p-1.5 text-ink-subtle hover:text-ink rounded-xl hover:bg-canvas transition-colors"
                  title={isUz ? 'Asliga qaytarish' : 'Сброс всех настроек'}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Upload Error Banner */}
          {uploadError && (
            <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{uploadError}</span>
            </div>
          )}

          {/* Interactive Dental X-Ray Canvas */}
          <div className="relative w-full h-96 rounded-2xl bg-black border border-slate-800 overflow-hidden flex items-center justify-center select-none">
            {xrays.length > 0 && xrays[selectedXrayIndex] ? (
              <div className="w-full h-full flex items-center justify-center overflow-hidden p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={xrays[selectedXrayIndex].url}
                  alt={xrays[selectedXrayIndex].name}
                  style={{
                    transform: `scale(${zoomLevel}) rotate(${rotationDeg}deg)`,
                    filter: `brightness(${xrayBrightness}%) contrast(${xrayContrast}%) grayscale(100%) ${
                      isInverted ? 'invert(100%)' : ''
                    }`,
                    transition: 'transform 0.15s ease-out, filter 0.05s linear',
                    maxHeight: '100%',
                    maxWidth: '100%',
                    objectFit: 'contain',
                    pointerEvents: 'none',
                  }}
                  className="rounded-lg shadow-2xl"
                />
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-3 cursor-pointer hover:bg-white/5 transition-colors"
                style={{
                  filter: `brightness(${xrayBrightness}%) contrast(${xrayContrast}%) grayscale(100%) ${
                    isInverted ? 'invert(100%)' : ''
                  }`,
                  backgroundImage: `radial-gradient(circle at center, #232d30 0%, #050505 100%)`,
                }}
              >
                <div className="w-56 h-36 border-2 border-dashed border-teal-500/40 rounded-2xl flex flex-col items-center justify-center bg-teal-950/20 backdrop-blur-xs p-4 space-y-2 hover:border-teal-400 transition-colors">
                  <ImageIcon className="w-8 h-8 text-teal-400/80" />
                  <span className="text-xs font-mono font-bold text-teal-300 block">
                    [DICOM / OPG DENTAL CT]
                  </span>
                  <span className="text-[11px] text-teal-100/70 block">
                    {isUz
                      ? 'Rentgen rasmini yuklash uchun bosing'
                      : 'Нажмите для загрузки рентген снимка'}
                  </span>
                </div>
              </div>
            )}

            {/* Canvas Status & Patient Overlay */}
            <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-xl text-white font-mono text-[11px] border border-white/10 flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{isUz ? 'Bemor' : 'Пациент'}: {patientName}</span>
              <span className="text-ink-subtle">|</span>
              <span className="text-teal-300">{Math.round(zoomLevel * 100)}%</span>
              {rotationDeg > 0 && <span className="text-amber-300">{rotationDeg}°</span>}
              {isInverted && <span className="text-purple-300 font-bold">INV</span>}
            </div>

            {/* Quick Canvas Controls */}
            <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-black/70 backdrop-blur-md p-1.5 rounded-xl border border-white/10">
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
                className="p-1 text-white/80 hover:text-white hover:bg-white/10 rounded-lg text-xs"
                title={isUz ? 'Kattalashtirish' : 'Увеличить'}
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
                className="p-1 text-white/80 hover:text-white hover:bg-white/10 rounded-lg text-xs"
                title={isUz ? 'Kichiklashtirish' : 'Уменьшить'}
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsInverted((prev) => !prev)}
                className="p-1 text-white/80 hover:text-white hover:bg-white/10 rounded-lg text-xs"
                title={isUz ? 'Negativ rejim' : 'Режим негатива'}
              >
                <Eye className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Thumbnails Gallery Strip */}
          {xrays.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1">
              {xrays.map((item, idx) => (
                <button
                  key={item.id || idx}
                  type="button"
                  onClick={() => {
                    setSelectedXrayIndex(idx);
                    setZoomLevel(1);
                    setRotationDeg(0);
                  }}
                  className={`relative shrink-0 w-20 h-16 rounded-xl overflow-hidden border-2 transition-all ${
                    selectedXrayIndex === idx
                      ? 'border-brand-600 ring-2 ring-brand-600/30 scale-105'
                      : 'border-line opacity-70 hover:opacity-100 hover:border-line-strong'
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.url}
                    alt={item.name}
                    className="w-full h-full object-cover grayscale"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-black/70 text-[9px] text-white truncate px-1 py-0.5 text-center font-mono">
                    #{idx + 1}
                  </div>
                </button>
              ))}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="shrink-0 w-20 h-16 rounded-xl border-2 border-dashed border-line-strong hover:border-brand-600 flex flex-col items-center justify-center text-ink-subtle hover:text-brand-600 transition-colors bg-canvas"
                title={isUz ? 'Yangi rasm qo\'shish' : 'Добавить снимок'}
              >
                <Upload className="w-4 h-4" />
                <span className="text-[10px] font-semibold mt-1">{isUz ? '+ Yuklash' : '+ Загрузить'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right 4 Cols: Clinical Protocol, Doctor Quick Notes, Attachments & Doctor Schedule */}
      <div className="lg:col-span-4 space-y-6">
        {/* Doctor Earnings & Commission Summary */}
        <div className="ui-card bg-gradient-to-br from-brand-600/10 via-secondary-600/5 to-transparent border border-brand-600/20 p-4 rounded-2xl space-y-3">
          <div className="flex items-center justify-between border-b border-brand-600/20 pb-2">
            <span className="text-xs font-bold text-ink uppercase tracking-wide">
              {isUz ? 'Mening Komissiyam' : 'Моя комиссия'}
            </span>
            <span className="text-xs font-extrabold px-2 py-0.5 bg-brand-600 text-white rounded-full">
              {earnings ? `${earnings.percentage}%` : '30%'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 bg-white/80 rounded-xl border border-line">
              <span className="text-[10px] text-ink-muted block">{isUz ? 'Jami tushum' : 'Всего сборов'}</span>
              <span className="font-bold text-ink text-sm">
                {(earnings?.totalCollected || 0).toLocaleString()} {isUz ? "so'm" : 'сум'}
              </span>
            </div>
            <div className="p-2.5 bg-white/80 rounded-xl border border-line">
              <span className="text-[10px] text-brand-600 font-bold block">{isUz ? 'Hisoblangan daromad' : 'Заработано'}</span>
              <span className="font-extrabold text-brand-600 text-sm">
                {(earnings?.totalEarned || 0).toLocaleString()} {isUz ? "so'm" : 'сум'}
              </span>
            </div>
          </div>
          {earnings?.fixedBonus > 0 && (
            <p className="text-[10px] text-ink-muted">
              {isUz ? `Qo'shimcha fiks bonus: ${earnings.fixedBonus.toLocaleString()} so'm` : `Фикс бонус: ${earnings.fixedBonus.toLocaleString()} сум`}
            </p>
          )}
        </div>

        {/* Doctor Day Schedule */}
        <div className="ui-card space-y-3">
          <div className="flex items-center justify-between border-b border-line pb-2.5">
            <h3 className="font-bold text-sm text-ink flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-brand-600" />
              <span>{isUz ? 'Bugungi qabullaringiz' : 'Ваши приемы на сегодня'}</span>
            </h3>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-brand-100 text-brand-600">
              {filteredToday.length} {isUz ? 'ta qabul' : 'приемов'}
            </span>
          </div>

          <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
            {filteredToday.length === 0 ? (
              <p className="text-xs text-ink-muted text-center py-6">
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
                        ? 'bg-brand-600 text-white border-brand-700 shadow-sm'
                        : 'bg-white border-line hover:bg-canvas'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className={`font-mono text-xs font-bold ${isSelected ? 'text-white' : 'text-ink'}`}>
                        {timeStr}
                      </span>
                      {renderStatusBadge(appt)}
                    </div>
                    <h4 className={`text-sm font-bold truncate ${isSelected ? 'text-white' : 'text-ink'}`}>
                      {appt.patient?.fullName || appt.patientName}
                    </h4>
                    <p className={`text-xs mt-0.5 truncate ${isSelected ? 'text-brand-100' : 'text-ink-muted'}`}>
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
          <div className="flex items-center justify-between border-b border-line pb-2.5">
            <h3 className="font-bold text-sm text-ink flex items-center gap-2">
              <Paperclip className="w-4 h-4 text-brand-600" />
              <span>{isUz ? 'Biriktirilgan fayllar' : 'Прикрепленные файлы'}</span>
            </h3>
            <span className="text-[10px] font-bold text-brand-600">
              {doctorAttachments.length} {isUz ? 'ta fayl' : 'файла'}
            </span>
          </div>

          <div className="space-y-2">
            {doctorAttachments.map((att) => (
              <div
                key={att.id}
                className="p-2.5 bg-canvas hover:bg-brand-50 rounded-xl border border-line flex items-center justify-between gap-2 text-xs transition-colors"
              >
                <div className="min-w-0">
                  <p className="font-bold text-ink truncate">{att.name}</p>
                  <span className="text-[10px] text-ink-muted">
                    {att.type} • {att.date}
                  </span>
                </div>
                <button
                  type="button"
                  className="px-2 py-1 bg-white hover:bg-canvas text-brand-600 rounded-lg text-[11px] font-bold border border-line shrink-0"
                >
                  {isUz ? 'Ochish' : 'Открыть'}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Appointments */}
        <div className="ui-card space-y-3">
          <div className="flex items-center justify-between border-b border-line pb-2.5">
            <h3 className="font-bold text-sm text-ink flex items-center gap-2">
              <Clock className="w-4 h-4 text-brand-600" />
              <span>{isUz ? 'Yaqin kunlardagi qabullar' : 'Ближайшие записи'}</span>
            </h3>
          </div>

          {upcomingAppointments.length === 0 ? (
            <p className="text-xs text-ink-muted text-center py-4">
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
                    className="p-3 bg-white hover:bg-canvas rounded-2xl border border-line transition-all"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-mono text-xs font-black text-ink">
                        {dateStr} • {timeStr}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-ink">
                      {appt.patient?.fullName || appt.patientName}
                    </h4>
                    <p className="text-xs text-ink-muted mt-0.5">
                      {isUz
                        ? (appt.serviceName || appt.service?.nameUz || 'Stomatologik ko\'rik')
                        : (appt.service?.nameRu || appt.serviceName || 'Стоматологический осмотр')}
                    </p>
                    <div className="mt-2 pt-2 border-t border-black/5 flex items-center justify-between">
                      <div>{renderStatusBadge(appt)}</div>
                      <Link
                        href={`/admin/calendar?appointmentId=${appt.id}`}
                        className="text-xs text-brand-600 font-bold hover:underline flex items-center gap-1"
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

