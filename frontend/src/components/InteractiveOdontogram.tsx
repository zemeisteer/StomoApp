'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Check,
  AlertCircle,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  Clock,
  Sparkles,
  FileText,
  DollarSign,
  Layers,
  Info,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Baby,
  Smile,
  Shield,
  Activity,
} from 'lucide-react';
import {
  clinicStore,
  ToothCondition,
  ToothSurface,
  DentalChartType,
  ToothRecord,
  CONDITION_METADATA,
} from '../lib/clinicState';

// Tooth Anatomical Names (Uzbek & Russian)
export const TOOTH_NAMES: Record<number, { uz: string; ru: string }> = {
  // Adult Upper Right (Quadrant 1)
  18: { uz: "O'ng yuqori aql tishi", ru: 'Правый верхний зуб мудрости' },
  17: { uz: "O'ng yuqori 2-molyar", ru: 'Правый верхний 2-й моляр' },
  16: { uz: "O'ng yuqori 1-molyar", ru: 'Правый верхний 1-й моляр' },
  15: { uz: "O'ng yuqori 2-premolyar", ru: 'Правый верхний 2-й премоляр' },
  14: { uz: "O'ng yuqori 1-premolyar", ru: 'Правый верхний 1-й премоляр' },
  13: { uz: "O'ng yuqori qoziq tish", ru: 'Правый верхний клык' },
  12: { uz: "O'ng yuqori yon kurak tish", ru: 'Правый верхний латеральный резец' },
  11: { uz: "O'ng yuqori markaziy kurak tish", ru: 'Правый верхний центральный резец' },

  // Adult Upper Left (Quadrant 2)
  21: { uz: 'Chap yuqori markaziy kurak tish', ru: 'Левый верхний центральный резец' },
  22: { uz: 'Chap yuqori yon kurak tish', ru: 'Левый верхний латеральный резец' },
  23: { uz: 'Chap yuqori qoziq tish', ru: 'Левый верхний клык' },
  24: { uz: 'Chap yuqori 1-premolyar', ru: 'Левый верхний 1-й премоляр' },
  25: { uz: 'Chap yuqori 2-premolyar', ru: 'Левый верхний 2-й премоляр' },
  26: { uz: 'Chap yuqori 1-molyar', ru: 'Левый верхний 1-й моляр' },
  27: { uz: 'Chap yuqori 2-molyar', ru: 'Левый верхний 2-й моляр' },
  28: { uz: 'Chap yuqori aql tishi', ru: 'Левый верхний зуб мудрости' },

  // Adult Lower Right (Quadrant 4)
  48: { uz: "O'ng pastki aql tishi", ru: 'Правый нижний зуб мудрости' },
  47: { uz: "O'ng pastki 2-molyar", ru: 'Правый нижний 2-й моляр' },
  46: { uz: "O'ng pastki 1-molyar", ru: 'Правый нижний 1-й моляр' },
  45: { uz: "O'ng pastki 2-premolyar", ru: 'Правый нижний 2-й премоляр' },
  44: { uz: "O'ng pastki 1-premolyar", ru: 'Правый нижний 1-й премоляр' },
  43: { uz: "O'ng pastki qoziq tish", ru: 'Правый нижний клык' },
  42: { uz: "O'ng pastki yon kurak tish", ru: 'Правый нижний латеральный резец' },
  41: { uz: "O'ng pastki markaziy kurak tish", ru: 'Правый нижний центральный резец' },

  // Adult Lower Left (Quadrant 3)
  31: { uz: 'Chap pastki markaziy kurak tish', ru: 'Левый нижний центральный резец' },
  32: { uz: 'Chap pastki yon kurak tish', ru: 'Левый нижний латеральный резец' },
  33: { uz: 'Chap pastki qoziq tish', ru: 'Левый нижний клык' },
  34: { uz: 'Chap pastki 1-premolyar', ru: 'Левый нижний 1-й премоляр' },
  35: { uz: 'Chap pastki 2-premolyar', ru: 'Левый нижний 2-й премоляр' },
  36: { uz: 'Chap pastki 1-molyar', ru: 'Левый нижний 1-й моляр' },
  37: { uz: 'Chap pastki 2-molyar', ru: 'Левый нижний 2-й моляр' },
  38: { uz: 'Chap pastki aql tishi', ru: 'Левый нижний зуб мудрости' },

  // Pediatric Upper Right (Quadrant 5)
  55: { uz: "O'ng yuqori 2-sut molyari", ru: 'Правый верхний 2-й молочный моляр' },
  54: { uz: "O'ng yuqori 1-sut molyari", ru: 'Правый верхний 1-й молочный моляр' },
  53: { uz: "O'ng yuqori sut qoziq tishi", ru: 'Правый верхний молочный клык' },
  52: { uz: "O'ng yuqori yon sut kuragi", ru: 'Правый верхний боковой молочный резец' },
  51: { uz: "O'ng yuqori markaziy sut kuragi", ru: 'Правый верхний центральный молочный резец' },

  // Pediatric Upper Left (Quadrant 6)
  61: { uz: 'Chap yuqori markaziy sut kuragi', ru: 'Левый верхний центральный молочный резец' },
  62: { uz: 'Chap yuqori yon sut kuragi', ru: 'Левый верхний боковой молочный резец' },
  63: { uz: 'Chap yuqori sut qoziq tishi', ru: 'Левый верхний молочный клык' },
  64: { uz: 'Chap yuqori 1-sut molyari', ru: 'Левый верхний 1-й молочный моляр' },
  65: { uz: 'Chap yuqori 2-sut molyari', ru: 'Левый верхний 2-й молочный моляр' },

  // Pediatric Lower Right (Quadrant 8)
  85: { uz: "O'ng pastki 2-sut molyari", ru: 'Правый нижний 2-й молочный моляр' },
  84: { uz: "O'ng pastki 1-sut molyari", ru: 'Правый нижний 1-й молочный моляр' },
  83: { uz: "O'ng pastki sut qoziq tishi", ru: 'Правый нижний молочный клык' },
  82: { uz: "O'ng pastki yon sut kuragi", ru: 'Правый нижний боковой молочный резец' },
  81: { uz: "O'ng pastki markaziy sut kuragi", ru: 'Правый нижний центральный молочный резец' },

  // Pediatric Lower Left (Quadrant 7)
  71: { uz: 'Chap pastki markaziy sut kuragi', ru: 'Левый нижний центральный молочный резец' },
  72: { uz: 'Chap pastki yon sut kuragi', ru: 'Левый нижний боковой молочный резец' },
  73: { uz: 'Chap pastki sut qoziq tishi', ru: 'Левый нижний молочный клык' },
  74: { uz: 'Chap pastki 1-sut molyari', ru: 'Левый нижний 1-й молочный моляр' },
  75: { uz: 'Chap pastki 2-sut molyari', ru: 'Левый нижний 2-й молочный моляр' },
};

const ADULT_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const ADULT_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

const PEDIATRIC_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
const PEDIATRIC_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];

interface InteractiveOdontogramProps {
  language?: 'uz' | 'ru';
  patientId?: string;
  patientName?: string;
  onSavePlan?: (records: Record<number, ToothRecord>) => void;
}

export const InteractiveOdontogram: React.FC<InteractiveOdontogramProps> = ({
  language = 'uz',
  patientId = 'pat-101',
  patientName = 'Aziz Rahimov',
  onSavePlan,
}) => {
  const isUz = language === 'uz';

  // Odontogram Chart Type: Adult (32 teeth) vs Pediatric (20 teeth)
  const [chartType, setChartType] = useState<DentalChartType>('ADULT');
  const [selectedTooth, setSelectedTooth] = useState<number>(14);
  const [teethRecords, setTeethRecords] = useState<Record<number, ToothRecord>>({});
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Mobile Zoom & Pan Controls
  const [zoomScale, setZoomScale] = useState<number>(1.0);

  // Load from reactive clinicStore
  useEffect(() => {
    const state = clinicStore.getState();
    const patientOdonto = state.odontograms[patientId] || {};
    setTeethRecords(patientOdonto);

    // If patient is pediatric, default to pediatric chart
    if (patientName.toLowerCase().includes('bola') || patientName.toLowerCase().includes('diyorbek')) {
      setChartType('PEDIATRIC');
      setSelectedTooth(54);
    } else {
      setChartType('ADULT');
      setSelectedTooth(14);
    }

    const unsubscribe = clinicStore.subscribe((newState) => {
      const updated = newState.odontograms[patientId];
      if (updated) {
        setTeethRecords(updated);
      }
    });

    return () => unsubscribe();
  }, [patientId, patientName]);

  // Active tooth record
  const currentRecord: ToothRecord = useMemo(() => {
    return (
      teethRecords[selectedTooth] || {
        toothNum: selectedTooth,
        condition: 'HEALTHY',
        surfaces: [],
        note: '',
        treatmentNameUz: "Profilaktik ko'rik",
        treatmentNameRu: 'Профилактический осмотр',
        costUzs: 0,
        status: 'PLANNED',
        chartType,
      }
    );
  }, [teethRecords, selectedTooth, chartType]);

  // Set Condition for Selected Tooth
  const handleSetCondition = (condition: ToothCondition) => {
    const meta = CONDITION_METADATA[condition];
    setTeethRecords((prev) => {
      const next = { ...prev };
      if (condition === 'HEALTHY') {
        delete next[selectedTooth];
      } else {
        const existing = prev[selectedTooth];
        next[selectedTooth] = {
          toothNum: selectedTooth,
          condition,
          surfaces: existing?.surfaces?.length ? existing.surfaces : ['O'],
          note: existing?.note || '',
          treatmentNameUz: meta.treatmentUz,
          treatmentNameRu: meta.treatmentRu,
          costUzs: meta.defaultCost,
          status: existing?.status || 'PLANNED',
          chartType,
          updatedAt: new Date().toISOString(),
        };
      }
      return next;
    });
  };

  // Toggle Surface Sector (Occlusal, Mesial, Distal, Vestibular, Lingual)
  const handleToggleSurface = (surface: ToothSurface) => {
    setTeethRecords((prev) => {
      const existing = prev[selectedTooth] || {
        toothNum: selectedTooth,
        condition: 'CARIES',
        surfaces: [],
        note: '',
        treatmentNameUz: CONDITION_METADATA.CARIES.treatmentUz,
        treatmentNameRu: CONDITION_METADATA.CARIES.treatmentRu,
        costUzs: CONDITION_METADATA.CARIES.defaultCost,
        status: 'PLANNED',
        chartType,
      };

      const hasSurface = existing.surfaces.includes(surface);
      const nextSurfaces = hasSurface
        ? existing.surfaces.filter((s) => s !== surface)
        : [...existing.surfaces, surface];

      return {
        ...prev,
        [selectedTooth]: {
          ...existing,
          condition: existing.condition === 'HEALTHY' ? 'CARIES' : existing.condition,
          surfaces: nextSurfaces,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  };

  // Update Status of Item in Treatment Plan
  const handleUpdateStatus = (
    toothNum: number,
    status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED'
  ) => {
    setTeethRecords((prev) => {
      if (!prev[toothNum]) return prev;
      return {
        ...prev,
        [toothNum]: {
          ...prev[toothNum],
          status,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  };

  // Update Custom Cost
  const handleUpdateCost = (toothNum: number, costUzs: number) => {
    setTeethRecords((prev) => {
      if (!prev[toothNum]) return prev;
      return {
        ...prev,
        [toothNum]: {
          ...prev[toothNum],
          costUzs: Math.max(0, costUzs),
          updatedAt: new Date().toISOString(),
        },
      };
    });
  };

  // Update Doctor Note
  const handleUpdateNote = (note: string) => {
    setTeethRecords((prev) => {
      const existing = prev[selectedTooth];
      if (!existing) return prev;
      return {
        ...prev,
        [selectedTooth]: {
          ...existing,
          note,
          updatedAt: new Date().toISOString(),
        },
      };
    });
  };

  // Save to Centralized Clinic Store
  const handleSaveTreatmentPlan = () => {
    clinicStore.savePatientOdontogram(patientId, teethRecords);
    if (onSavePlan) {
      onSavePlan(teethRecords);
    }
    setSaveSuccessMsg(
      isUz
        ? "Davolash rejasi va odontogramma muvaffaqiyatli saqlandi hamda hisob-kitobga yo'naltirildi!"
        : 'План лечения и зубная карта успешно сохранены и синхронизированы с биллингом!'
    );
    setTimeout(() => setSaveSuccessMsg(null), 4000);
  };

  // Treatment Plan Summaries
  const treatmentItems = useMemo(() => {
    return Object.values(teethRecords).filter((r) => r.condition !== 'HEALTHY');
  }, [teethRecords]);

  const totalCost = useMemo(() => {
    return treatmentItems.reduce((sum, item) => sum + item.costUzs, 0);
  }, [treatmentItems]);

  const completedCost = useMemo(() => {
    return treatmentItems
      .filter((i) => i.status === 'COMPLETED')
      .reduce((sum, item) => sum + item.costUzs, 0);
  }, [treatmentItems]);

  const completionPercent = useMemo(() => {
    if (totalCost === 0) return 0;
    return Math.round((completedCost / totalCost) * 100);
  }, [totalCost, completedCost]);

  // Current Arch Teeth
  const upperTeeth = chartType === 'ADULT' ? ADULT_UPPER : PEDIATRIC_UPPER;
  const lowerTeeth = chartType === 'ADULT' ? ADULT_LOWER : PEDIATRIC_LOWER;

  return (
    <div className="space-y-6">
      {/* ODONTOGRAM HEADER & CONTROLS */}
      <div className="ui-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#d8e5e2] pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-[#152f34]">
                {isUz ? 'Interaktiv FDI Odontogramma' : 'Интерактивная FDI Одонтограмма'}
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#167b78] text-white">
                {chartType === 'ADULT' ? (isUz ? "Kattalar (32 ta tish)" : "Взрослые (32 зуба)") : (isUz ? "Bolalar (20 ta tish)" : "Детские (20 зубов)")}
              </span>
            </div>
            <p className="text-xs text-[#52696e] mt-0.5">
              {isUz
                ? `Bemor: ${patientName} • Tishni yoki sirtini bosing va tashxis tanlang`
                : `Пациент: ${patientName} • Выберите зуб или поверхность для назначения лечения`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Adult vs Pediatric Chart Switcher */}
            <div className="flex items-center bg-[#f3f8f7] p-1 rounded-xl border border-[#d8e5e2] text-xs">
              <button
                type="button"
                onClick={() => {
                  setChartType('ADULT');
                  setSelectedTooth(14);
                }}
                className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                  chartType === 'ADULT'
                    ? 'bg-[#167b78] text-white shadow-xs'
                    : 'text-[#52696e] hover:text-[#152f34]'
                }`}
              >
                <Smile className="w-3.5 h-3.5" />
                <span>{isUz ? 'Kattalar' : 'Взрослая'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setChartType('PEDIATRIC');
                  setSelectedTooth(54);
                }}
                className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                  chartType === 'PEDIATRIC'
                    ? 'bg-[#167b78] text-white shadow-xs'
                    : 'text-[#52696e] hover:text-[#152f34]'
                }`}
              >
                <Baby className="w-3.5 h-3.5" />
                <span>{isUz ? 'Bolalar' : 'Детская'}</span>
              </button>
            </div>

            {/* Zoom / Scale Controls for Mobile / Tablet */}
            <div className="flex items-center bg-[#f3f8f7] p-1 rounded-xl border border-[#d8e5e2] text-xs">
              <button
                type="button"
                onClick={() => setZoomScale((s) => Math.max(0.75, s - 0.1))}
                className="p-1.5 text-[#52696e] hover:text-[#152f34] rounded-lg"
                title={isUz ? 'Kichraytirish' : 'Уменьшить'}
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] font-mono font-bold px-1.5 text-[#152f34]">
                {Math.round(zoomScale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoomScale((s) => Math.min(1.4, s + 0.1))}
                className="p-1.5 text-[#52696e] hover:text-[#152f34] rounded-lg"
                title={isUz ? 'Kattalashtirish' : 'Увеличить'}
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoomScale(1.0)}
                className="p-1.5 text-[#52696e] hover:text-[#152f34] rounded-lg"
                title={isUz ? 'Asl holat' : 'Сброс масштаба'}
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>

            {/* Save Button */}
            <button
              type="button"
              onClick={handleSaveTreatmentPlan}
              className="px-3.5 py-1.5 bg-[#167b78] hover:bg-[#116460] text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isUz ? 'Rejani saqlash' : 'Сохранить план'}</span>
            </button>
          </div>
        </div>

        {/* Save Success Toast */}
        {saveSuccessMsg && (
          <div className="p-3 bg-[#e0f2ed] border border-[#167b78]/40 text-[#116460] rounded-xl text-xs font-bold flex items-center justify-between animate-fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#167b78] shrink-0" />
              <span>{saveSuccessMsg}</span>
            </div>
            <button onClick={() => setSaveSuccessMsg(null)}>✕</button>
          </div>
        )}

        {/* TEETH ARCH DISPLAY (Touch scrollable & zoomable) */}
        <div className="overflow-x-auto pb-2 scrollbar-thin">
          <div
            className="min-w-[620px] p-4 bg-[#f8fbfa] rounded-2xl border border-[#d8e5e2] space-y-6 transition-transform origin-top-left"
            style={{ transform: `scale(${zoomScale})` }}
          >
            {/* Upper Jaw (Maxillary) */}
            <div>
              <div className="flex justify-between items-center text-[11px] font-bold text-[#52696e] mb-2 px-2">
                <span>{isUz ? "Yuqori jag' (Maxillary) • O'ng" : 'Верхняя челюсть • Справа'}</span>
                <span className="text-[10px] bg-slate-200/70 text-slate-700 px-2 py-0.5 rounded-full uppercase">
                  {chartType}
                </span>
                <span>{isUz ? 'Chap' : 'Слева'}</span>
              </div>
              <div
                className="gap-1 sm:gap-1.5 text-center"
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${upperTeeth.length}, minmax(0, 1fr))`,
                }}
              >
                {upperTeeth.map((toothNum) => {
                  const record = teethRecords[toothNum];
                  const condition = record?.condition || 'HEALTHY';
                  const meta = CONDITION_METADATA[condition];
                  const isSelected = selectedTooth === toothNum;

                  return (
                    <button
                      key={toothNum}
                      type="button"
                      onClick={() => setSelectedTooth(toothNum)}
                      className={`flex flex-col items-center justify-between p-1.5 rounded-xl border transition-all duration-150 ${meta.bgClass} ${meta.textClass} ${meta.borderClass} ${
                        isSelected ? 'ring-3 ring-[#167b78] ring-offset-2 scale-105 shadow-md z-10' : 'hover:scale-102 shadow-2xs'
                      }`}
                      title={`${isUz ? 'Tish' : 'Зуб'} #${toothNum} - ${isUz ? meta.nameUz : meta.nameRu}`}
                    >
                      <span className="text-[10px] font-mono font-bold leading-none">{toothNum}</span>
                      <div className="w-5 h-8 my-1 flex items-center justify-center">
                        <svg viewBox="0 0 24 36" className="w-full h-full fill-current opacity-95">
                          <path d="M12 2 C8 2, 4 6, 4 14 C4 20, 6 26, 7 34 C8 35, 10 35, 11 31 C11.5 28, 12.5 28, 13 31 C14 35, 16 35, 17 34 C18 26, 20 20, 20 14 C20 6, 16 2, 12 2 Z" />
                        </svg>
                      </div>
                      <span className="text-[9px] leading-tight font-extrabold">{meta.icon}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Lower Jaw (Mandibular) */}
            <div>
              <div
                className="gap-1 sm:gap-1.5 text-center"
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${lowerTeeth.length}, minmax(0, 1fr))`,
                }}
              >
                {lowerTeeth.map((toothNum) => {
                  const record = teethRecords[toothNum];
                  const condition = record?.condition || 'HEALTHY';
                  const meta = CONDITION_METADATA[condition];
                  const isSelected = selectedTooth === toothNum;

                  return (
                    <button
                      key={toothNum}
                      type="button"
                      onClick={() => setSelectedTooth(toothNum)}
                      className={`flex flex-col items-center justify-between p-1.5 rounded-xl border transition-all duration-150 ${meta.bgClass} ${meta.textClass} ${meta.borderClass} ${
                        isSelected ? 'ring-3 ring-[#167b78] ring-offset-2 scale-105 shadow-md z-10' : 'hover:scale-102 shadow-2xs'
                      }`}
                      title={`${isUz ? 'Tish' : 'Зуб'} #${toothNum} - ${isUz ? meta.nameUz : meta.nameRu}`}
                    >
                      <span className="text-[9px] leading-tight font-extrabold">{meta.icon}</span>
                      <div className="w-5 h-8 my-1 flex items-center justify-center">
                        <svg viewBox="0 0 24 36" className="w-full h-full fill-current opacity-95 transform rotate-180">
                          <path d="M12 2 C8 2, 4 6, 4 14 C4 20, 6 26, 7 34 C8 35, 10 35, 11 31 C11.5 28, 12.5 28, 13 31 C14 35, 16 35, 17 34 C18 26, 20 20, 20 14 C20 6, 16 2, 12 2 Z" />
                        </svg>
                      </div>
                      <span className="text-[10px] font-mono font-bold leading-none">{toothNum}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-between items-center text-[11px] font-bold text-[#52696e] mt-2 px-2">
                <span>{isUz ? "Pastki jag' (Mandibular) • O'ng" : 'Нижняя челюсть • Справа'}</span>
                <span>{isUz ? 'Chap' : 'Слева'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* CONDITION STATUS PALETTE (Clickable Quick Set) */}
        <div className="space-y-2 pt-2 border-t border-[#d8e5e2]">
          <span className="text-xs font-bold text-[#52696e] block">
            {isUz
              ? `Tashxis tanlash (#${selectedTooth}-tish uchun):`
              : `Выберите статус для зуба #${selectedTooth}:`}
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2">
            {(Object.keys(CONDITION_METADATA) as ToothCondition[]).map((cond) => {
              const meta = CONDITION_METADATA[cond];
              const isCurrent = currentRecord.condition === cond;

              return (
                <button
                  key={cond}
                  type="button"
                  onClick={() => handleSetCondition(cond)}
                  className={`p-2 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-1 border transition-all ${
                    isCurrent
                      ? 'ring-2 ring-slate-900 border-transparent shadow-sm scale-102'
                      : 'bg-white hover:bg-slate-50 border-slate-200 text-[#152f34]'
                  }`}
                  style={{
                    backgroundColor: isCurrent ? meta.hexColor : undefined,
                    color: isCurrent && meta.hexColor !== '#ffffff' ? '#ffffff' : undefined,
                  }}
                >
                  <span className="text-base">{meta.icon}</span>
                  <span className="text-[11px] text-center leading-tight">
                    {isUz ? meta.nameUz : meta.nameRu}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* TOOTH DETAIL & SURFACE SELECTOR PANEL */}
        <div className="p-4 bg-[#f8fbfa] rounded-2xl border border-[#d8e5e2] grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          {/* Surface Sector Clicker (5 Sectors) */}
          <div className="md:col-span-5 flex flex-col items-center justify-center space-y-2">
            <span className="text-xs font-bold text-[#152f34]">
              {isUz ? `Anatomik sirtlar (#${selectedTooth})` : `Поверхности зуба (#${selectedTooth})`}
            </span>
            <div className="relative w-28 h-28">
              {/* Vestibular / Buccal (Top) */}
              <button
                type="button"
                onClick={() => handleToggleSurface('V')}
                className={`absolute top-0 left-6 right-6 h-8 rounded-t-xl text-[10px] font-bold border transition-colors ${
                  currentRecord.surfaces.includes('V')
                    ? 'bg-[#167b78] text-white border-[#116460]'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                }`}
                title={isUz ? 'Vestibulyar (Daxliz) sirt' : 'Вестибулярная поверхность'}
              >
                V
              </button>

              {/* Mesial (Left) */}
              <button
                type="button"
                onClick={() => handleToggleSurface('M')}
                className={`absolute top-6 bottom-6 left-0 w-8 rounded-l-xl text-[10px] font-bold border transition-colors ${
                  currentRecord.surfaces.includes('M')
                    ? 'bg-[#167b78] text-white border-[#116460]'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                }`}
                title={isUz ? 'Mezial (Oldingi) sirt' : 'Медиальная поверхность'}
              >
                M
              </button>

              {/* Occlusal (Center) */}
              <button
                type="button"
                onClick={() => handleToggleSurface('O')}
                className={`absolute top-8 bottom-8 left-8 right-8 rounded-lg text-[10px] font-bold border transition-colors ${
                  currentRecord.surfaces.includes('O')
                    ? 'bg-[#167b78] text-white border-[#116460]'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                }`}
                title={isUz ? 'Okluzal (Chaynash) sirt' : 'Окклюзионная поверхность'}
              >
                O
              </button>

              {/* Distal (Right) */}
              <button
                type="button"
                onClick={() => handleToggleSurface('D')}
                className={`absolute top-6 bottom-6 right-0 w-8 rounded-r-xl text-[10px] font-bold border transition-colors ${
                  currentRecord.surfaces.includes('D')
                    ? 'bg-[#167b78] text-white border-[#116460]'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                }`}
                title={isUz ? 'Distal (Orqa) sirt' : 'Дистальная поверхность'}
              >
                D
              </button>

              {/* Lingual (Bottom) */}
              <button
                type="button"
                onClick={() => handleToggleSurface('L')}
                className={`absolute bottom-0 left-6 right-6 h-8 rounded-b-xl text-[10px] font-bold border transition-colors ${
                  currentRecord.surfaces.includes('L')
                    ? 'bg-[#167b78] text-white border-[#116460]'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                }`}
                title={isUz ? 'Lingval (Til tomoni) sirt' : 'Язычная поверхность'}
              >
                L
              </button>
            </div>
            <p className="text-[10px] text-[#52696e] text-center">
              {currentRecord.surfaces.length > 0
                ? `${isUz ? 'Tanlangan sirtlar:' : 'Выбранные поверхности:'} [${currentRecord.surfaces.join(', ')}]`
                : (isUz ? 'To‘liq tish tanlangan' : 'Выбран весь зуб целиком')}
            </p>
          </div>

          {/* Quick Doctor Note Field */}
          <div className="md:col-span-7 space-y-2">
            <label className="text-xs font-bold text-[#152f34] flex items-center justify-between">
              <span>{isUz ? 'Klinik izoh va tavsiyalar:' : 'Клинические заметки врача:'}</span>
              <span className="text-[11px] text-[#52696e] font-normal">
                {TOOTH_NAMES[selectedTooth]?.[language] || `#${selectedTooth}-tish`}
              </span>
            </label>
            <textarea
              rows={2}
              placeholder={
                isUz
                  ? "Masalan: Anesteziya ostida tozalash kerak, ildiz kanali tor..."
                  : 'Например: Требуется анестезия, корневой канал сужен...'
              }
              value={currentRecord.note || ''}
              onChange={(e) => handleUpdateNote(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-[#167b78] focus:ring-1 focus:ring-[#167b78] bg-white text-[#152f34]"
            />
            {/* Quick Note Presets */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[
                isUz ? "O'tkir og'riq" : 'Острая боль',
                isUz ? 'Rentgen kerak' : 'Нужен рентген',
                isUz ? 'Eski plomba' : 'Старая пломба',
                isUz ? 'Kanal tozalash' : 'Чистка каналов',
              ].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() =>
                    handleUpdateNote(
                      currentRecord.note ? `${currentRecord.note}, ${chip}` : chip
                    )
                  }
                  className="px-2 py-0.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-[10px] font-medium text-slate-700"
                >
                  + {chip}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* DYNAMIC TREATMENT PLAN & REAL-TIME COST BREAKDOWN */}
      <div className="ui-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#d8e5e2] pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-[#152f34]">
                {isUz ? 'Bemorning umumiy davolash rejasi' : 'Общий план лечения пациента'}
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-[#167b78] text-white">
                {treatmentItems.length} {isUz ? 'ta muolaja' : 'процедур'}
              </span>
            </div>
            <p className="text-xs text-[#52696e] mt-0.5">
              {isUz
                ? 'Odontogramma asosida avtomatik shakllantirilgan davolash bosqichlari va narxlar'
                : 'Этапы лечения и калькуляция стоимости, сформированные на основе зубной карты'}
            </p>
          </div>

          {/* Real-time Financial Summary */}
          <div className="flex items-center gap-3 bg-[#f8fbfa] px-4 py-2 rounded-xl border border-[#d8e5e2]">
            <div>
              <span className="text-[10px] text-[#52696e] block">
                {isUz ? 'Jami hisob:' : 'Итоговая стоимость:'}
              </span>
              <strong className="text-sm sm:text-base font-extrabold text-[#167b78]">
                {totalCost.toLocaleString('uz-UZ')} {isUz ? "so'm" : 'сум'}
              </strong>
            </div>
            <div className="w-px h-8 bg-[#d8e5e2]" />
            <div>
              <span className="text-[10px] text-[#52696e] block">
                {isUz ? 'Tugallangan:' : 'Выполнено:'}
              </span>
              <strong className="text-xs sm:text-sm font-bold text-emerald-700">
                {completionPercent}% ({completedCost.toLocaleString('uz-UZ')} {isUz ? "so'm" : 'сум'})
              </strong>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs font-bold text-[#152f34]">
            <span>{isUz ? 'Muolajalar bajarilish darajasi' : 'Прогресс выполнения плана лечения'}</span>
            <span className="text-[#167b78]">{completionPercent}%</span>
          </div>
          <div className="w-full h-2.5 bg-[#e0f2ed] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#14bdac] rounded-full transition-all duration-500"
              style={{ width: `${completionPercent}%` }}
            />
          </div>
        </div>

        {/* Treatment Items List */}
        {treatmentItems.length === 0 ? (
          <div className="p-8 text-center bg-[#f8fbfa] rounded-2xl border border-dashed border-[#d8e5e2] text-[#52696e] text-xs">
            <p className="font-semibold">
              {isUz
                ? "Bemor tishlarida muolaja talab holatlar belgilanmagan (Barcha tishlar sog'lom)."
                : 'В зубной карте нет назначенных процедур (Все зубы здоровы).'}
            </p>
            <p className="text-[11px] mt-1 text-slate-400">
              {isUz
                ? 'Yuqoridagi tish xaritasidan tishni tanlab karies, plomba, kanal yoki koronka belgilang.'
                : 'Выберите зуб на карте сверху, чтобы назначить лечение.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {treatmentItems.map((item) => {
              const meta = CONDITION_METADATA[item.condition];
              const isSelected = selectedTooth === item.toothNum;

              return (
                <div
                  key={item.toothNum}
                  onClick={() => setSelectedTooth(item.toothNum)}
                  className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#e0f2ed]/70 border-[#167b78] ring-1 ring-[#167b78]/30 shadow-xs'
                      : 'bg-white hover:bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="w-8 h-8 rounded-lg flex items-center justify-center font-mono font-extrabold text-xs text-white shrink-0"
                      style={{ backgroundColor: meta.hexColor }}
                    >
                      #{item.toothNum}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="text-xs font-bold text-[#152f34]">
                          {isUz ? item.treatmentNameUz : item.treatmentNameRu}
                        </strong>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.badgeBg} ${meta.badgeText}`}>
                          {isUz ? meta.nameUz : meta.nameRu}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#52696e] mt-0.5">
                        {TOOTH_NAMES[item.toothNum]?.[language]}
                        {item.surfaces.length > 0 && ` • Sirtlar: [${item.surfaces.join(', ')}]`}
                        {item.note && ` • Izoh: ${item.note}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    {/* Editable Cost input */}
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={item.costUzs}
                        onChange={(e) => handleUpdateCost(item.toothNum, Number(e.target.value))}
                        onClick={(e) => e.stopPropagation()}
                        className="w-24 text-right px-2 py-1 text-xs font-bold rounded-lg border border-slate-200 focus:border-[#167b78] bg-white text-[#152f34]"
                      />
                      <span className="text-[10px] text-[#52696e] font-semibold">{isUz ? "so'm" : 'сум'}</span>
                    </div>

                    {/* Procedure Status Selector */}
                    <select
                      value={item.status}
                      onChange={(e) =>
                        handleUpdateStatus(
                          item.toothNum,
                          e.target.value as 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED'
                        )
                      }
                      onClick={(e) => e.stopPropagation()}
                      className={`text-[11px] font-bold px-2 py-1 rounded-lg border cursor-pointer ${
                        item.status === 'COMPLETED'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : item.status === 'IN_PROGRESS'
                          ? 'bg-amber-100 text-amber-800 border-amber-300'
                          : 'bg-blue-100 text-blue-800 border-blue-300'
                      }`}
                    >
                      <option value="PLANNED">{isUz ? 'Rejada' : 'Запланировано'}</option>
                      <option value="IN_PROGRESS">{isUz ? 'Jarayonda' : 'В процессе'}</option>
                      <option value="COMPLETED">{isUz ? 'Bajarildi' : 'Выполнено'}</option>
                    </select>

                    {/* Delete handler */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSetCondition('HEALTHY');
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                      title={isUz ? "Rejadan o'chirish" : 'Удалить из плана'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
