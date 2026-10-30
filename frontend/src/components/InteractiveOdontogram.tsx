'use client';

import React, { useState, useMemo } from 'react';
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
} from 'lucide-react';

export type ToothCondition =
  | 'HEALTHY'
  | 'CARIES'
  | 'FILLING'
  | 'CROWN'
  | 'PULPITIS'
  | 'IMPLANT'
  | 'EXTRACTION';

export type ToothSurface = 'O' | 'M' | 'D' | 'V' | 'L'; // Occlusal, Mesial, Distal, Vestibular, Lingual

export interface ToothRecord {
  toothNum: number;
  condition: ToothCondition;
  surfaces: ToothSurface[];
  note?: string;
  treatmentNameUz: string;
  treatmentNameRu: string;
  costUzs: number;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED';
}

const CONDITION_METADATA: Record<
  ToothCondition,
  {
    nameUz: string;
    nameRu: string;
    treatmentUz: string;
    treatmentRu: string;
    defaultCost: number;
    bgClass: string;
    textClass: string;
    borderClass: string;
    badgeBg: string;
    badgeText: string;
    hexColor: string;
    icon: string;
  }
> = {
  HEALTHY: {
    nameUz: "Sog'lom",
    nameRu: 'Здоров',
    treatmentUz: "Profilaktik ko'rik",
    treatmentRu: 'Профилактический осмотр',
    defaultCost: 0,
    bgClass: 'bg-white',
    textClass: 'text-slate-800',
    borderClass: 'border-slate-200',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-700',
    hexColor: '#ffffff',
    icon: '✨',
  },
  CARIES: {
    nameUz: 'Karies',
    nameRu: 'Кариес',
    treatmentUz: 'Karies davolash va plombalash',
    treatmentRu: 'Лечение кариеса и пломбирование',
    defaultCost: 350000,
    bgClass: 'bg-amber-500',
    textClass: 'text-white',
    borderClass: 'border-amber-600',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-800',
    hexColor: '#f59e0b',
    icon: '🦷',
  },
  FILLING: {
    nameUz: 'Plomba',
    nameRu: 'Пломбирован',
    treatmentUz: 'Fotopolimer kompozit restavratsiya',
    treatmentRu: 'Фотополимерная реставрация',
    defaultCost: 450000,
    bgClass: 'bg-[#14bdac]',
    textClass: 'text-white',
    borderClass: 'border-[#116460]',
    badgeBg: 'bg-[#e0f2ed]',
    badgeText: 'text-[#167b78]',
    hexColor: '#14bdac',
    icon: '🛡️',
  },
  CROWN: {
    nameUz: 'Qoplama (Koronka)',
    nameRu: 'Коронка',
    treatmentUz: "Sirkoniy / metallokeramika qoplama o'rnatish",
    treatmentRu: 'Установка циркониевой / металлокерамической коронки',
    defaultCost: 1200000,
    bgClass: 'bg-blue-600',
    textClass: 'text-white',
    borderClass: 'border-blue-700',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-800',
    hexColor: '#2563eb',
    icon: '👑',
  },
  PULPITIS: {
    nameUz: 'Pulpit / Endodontiya',
    nameRu: 'Пульпит / Каналы',
    treatmentUz: 'Ildiz kanallarini mexanik va dori bilan davolash',
    treatmentRu: 'Эндодонтическое лечение корневых каналов',
    defaultCost: 650000,
    bgClass: 'bg-rose-500',
    textClass: 'text-white',
    borderClass: 'border-rose-600',
    badgeBg: 'bg-rose-100',
    badgeText: 'text-rose-800',
    hexColor: '#f43f5e',
    icon: '⚡',
  },
  IMPLANT: {
    nameUz: 'Implantat',
    nameRu: 'Имплант',
    treatmentUz: "Titan implantat o'rnatish",
    treatmentRu: 'Установка титанового имплантата',
    defaultCost: 3800000,
    bgClass: 'bg-purple-600',
    textClass: 'text-white',
    borderClass: 'border-purple-700',
    badgeBg: 'bg-purple-100',
    badgeText: 'text-purple-800',
    hexColor: '#9333ea',
    icon: '🔩',
  },
  EXTRACTION: {
    nameUz: "Sug'urilgan / Yo'q",
    nameRu: 'Удален / Отсутствует',
    treatmentUz: "Jarrohlik yo'li bilan olib tashlash",
    treatmentRu: 'Хирургическое удаление зуба',
    defaultCost: 250000,
    bgClass: 'bg-slate-700',
    textClass: 'text-white',
    borderClass: 'border-slate-800',
    badgeBg: 'bg-slate-200',
    badgeText: 'text-slate-800',
    hexColor: '#334155',
    icon: '❌',
  },
};

const TOOTH_NAMES: Record<number, { uz: string; ru: string }> = {
  // Upper Right
  18: { uz: "Yuqori o'ng 3-molyar (Aql tishi)", ru: 'Верхний правый 3-й моляр (зуб мудрости)' },
  17: { uz: "Yuqori o'ng 2-molyar", ru: 'Верхний правый 2-й моляр' },
  16: { uz: "Yuqori o'ng 1-molyar", ru: 'Верхний правый 1-й моляр' },
  15: { uz: "Yuqori o'ng 2-premolyar", ru: 'Верхний правый 2-й премоляр' },
  14: { uz: "Yuqori o'ng 1-premolyar", ru: 'Верхний правый 1-й премоляр' },
  13: { uz: "Yuqori o'ng qoziq tish (Kanin)", ru: 'Верхний правый клык' },
  12: { uz: "Yuqori o'ng yon kesuvchi", ru: 'Верхний правый латеральный резец' },
  11: { uz: "Yuqori o'ng markaziy kesuvchi", ru: 'Верхний правый центральный резец' },
  // Upper Left
  21: { uz: "Yuqori chap markaziy kesuvchi", ru: 'Верхний левый центральный резец' },
  22: { uz: "Yuqori chap yon kesuvchi", ru: 'Верхний левый латеральный резец' },
  23: { uz: "Yuqori chap qoziq tish (Kanin)", ru: 'Верхний левый клык' },
  24: { uz: "Yuqori chap 1-premolyar", ru: 'Верхний левый 1-й премоляр' },
  25: { uz: "Yuqori chap 2-premolyar", ru: 'Верхний левый 2-й премоляр' },
  26: { uz: "Yuqori chap 1-molyar", ru: 'Верхний левый 1-й моляр' },
  27: { uz: "Yuqori chap 2-molyar", ru: 'Верхний левый 2-й моляр' },
  28: { uz: "Yuqori chap 3-molyar (Aql tishi)", ru: 'Верхний левый 3-й моляр (зуб мудрости)' },
  // Lower Right
  48: { uz: "Pastki o'ng 3-molyar (Aql tishi)", ru: 'Нижний правый 3-й моляр (зуб мудрости)' },
  47: { uz: "Pastki o'ng 2-molyar", ru: 'Нижний правый 2-й моляр' },
  46: { uz: "Pastki o'ng 1-molyar", ru: 'Нижний правый 1-й моляр' },
  45: { uz: "Pastki o'ng 2-premolyar", ru: 'Нижний правый 2-й премоляр' },
  44: { uz: "Pastki o'ng 1-premolyar", ru: 'Нижний правый 1-й премоляр' },
  43: { uz: "Pastki o'ng qoziq tish (Kanin)", ru: 'Нижний правый клык' },
  42: { uz: "Pastki o'ng yon kesuvchi", ru: 'Нижний правый латеральный резец' },
  41: { uz: "Pastki o'ng markaziy kesuvchi", ru: 'Нижний правый центральный резец' },
  // Lower Left
  31: { uz: "Pastki chap markaziy kesuvchi", ru: 'Нижний левый центральный резец' },
  32: { uz: "Pastki chap yon kesuvchi", ru: 'Нижний левый латеральный резец' },
  33: { uz: "Pastki chap qoziq tish (Kanin)", ru: 'Нижний левый клык' },
  34: { uz: "Pastki chap 1-premolyar", ru: 'Нижний левый 1-й премоляр' },
  35: { uz: "Pastki chap 2-premolyar", ru: 'Нижний левый 2-й премоляр' },
  36: { uz: "Pastki chap 1-molyar", ru: 'Нижний левый 1-й моляр' },
  37: { uz: "Pastki chap 2-molyar", ru: 'Нижний левый 2-й моляр' },
  38: { uz: "Pastki chap 3-molyar (Aql tishi)", ru: 'Нижний левый 3-й моляр (зуб мудрости)' },
};

const INITIAL_TEETH_RECORDS: Record<number, ToothRecord> = {
  14: {
    toothNum: 14,
    condition: 'CARIES',
    surfaces: ['O', 'M'],
    note: "Chuqur okluzal karies. Anesteziya ostida tozalash kerak.",
    treatmentNameUz: "Molyar restavratsiyasi (Karies davolash)",
    treatmentNameRu: 'Реставрация моляра (Лечение кариеса)',
    costUzs: 350000,
    status: 'IN_PROGRESS',
  },
  15: {
    toothNum: 15,
    condition: 'FILLING',
    surfaces: ['O'],
    note: 'Eski plomba, holati yaxshi.',
    treatmentNameUz: 'Kompozit plomba nazorati',
    treatmentNameRu: 'Контроль композитной пломбы',
    costUzs: 150000,
    status: 'COMPLETED',
  },
  16: {
    toothNum: 16,
    condition: 'CROWN',
    surfaces: ['O', 'M', 'D', 'V', 'L'],
    note: "Sirkoniy qoplama o'rnatilgan.",
    treatmentNameUz: "Sirkoniy to'liq qoplama",
    treatmentNameRu: 'Циркониевая коронка',
    costUzs: 1200000,
    status: 'COMPLETED',
  },
  21: {
    toothNum: 21,
    condition: 'CARIES',
    surfaces: ['M'],
    note: "Oldingi tishda emal kariesi.",
    treatmentNameUz: 'Estetik kompozit restavratsiya',
    treatmentNameRu: 'Эстетическая реставрация',
    costUzs: 400000,
    status: 'PLANNED',
  },
  11: {
    toothNum: 11,
    condition: 'PULPITIS',
    surfaces: ['O', 'L'],
    note: "O'tkir pulpit. Ildiz kanalini tozalash va davolash.",
    treatmentNameUz: 'Ildiz kanallarini endodontik davolash',
    treatmentNameRu: 'Эндодонтическое лечение каналов',
    costUzs: 650000,
    status: 'IN_PROGRESS',
  },
  26: {
    toothNum: 26,
    condition: 'CROWN',
    surfaces: ['O', 'M', 'D', 'V', 'L'],
    note: 'Metallokeramika qoplama.',
    treatmentNameUz: 'Metallokeramika qoplama',
    treatmentNameRu: 'Металлокерамическая коронка',
    costUzs: 900000,
    status: 'COMPLETED',
  },
  36: {
    toothNum: 36,
    condition: 'CARIES',
    surfaces: ['O', 'D'],
    note: "O'rtacha karies.",
    treatmentNameUz: 'Karies davolash va plombalash',
    treatmentNameRu: 'Лечение кариеса и пломба',
    costUzs: 350000,
    status: 'PLANNED',
  },
  46: {
    toothNum: 46,
    condition: 'FILLING',
    surfaces: ['O'],
    note: 'Fotopolimer plomba muvaffaqiyatli qilingan.',
    treatmentNameUz: 'Fotopolimer plomba',
    treatmentNameRu: 'Фотополимерная пломба',
    costUzs: 450000,
    status: 'COMPLETED',
  },
};

interface InteractiveOdontogramProps {
  language?: 'uz' | 'ru';
  patientName?: string;
  onSavePlan?: (records: Record<number, ToothRecord>) => void;
}

export const InteractiveOdontogram: React.FC<InteractiveOdontogramProps> = ({
  language = 'uz',
  patientName = 'Aziz Rahimov',
  onSavePlan,
}) => {
  const isUz = language === 'uz';
  const [selectedTooth, setSelectedTooth] = useState<number>(14);
  const [teethRecords, setTeethRecords] = useState<Record<number, ToothRecord>>(INITIAL_TEETH_RECORDS);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Active tooth record helper
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
      }
    );
  }, [teethRecords, selectedTooth]);

  // Update tooth condition
  const handleSetCondition = (condition: ToothCondition) => {
    const meta = CONDITION_METADATA[condition];
    setTeethRecords((prev) => {
      const next = { ...prev };
      if (condition === 'HEALTHY') {
        // Remove from active treatment plan
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
        };
      }
      return next;
    });
  };

  // Toggle surface
  const handleToggleSurface = (surface: ToothSurface) => {
    setTeethRecords((prev) => {
      const existing = prev[selectedTooth] || {
        toothNum: selectedTooth,
        condition: 'CARIES',
        surfaces: [],
        note: '',
        treatmentNameUz: 'Karies davolash',
        treatmentNameRu: 'Лечение кариеса',
        costUzs: 350000,
        status: 'PLANNED',
      };

      const hasSurface = existing.surfaces.includes(surface);
      const updatedSurfaces = hasSurface
        ? existing.surfaces.filter((s) => s !== surface)
        : [...existing.surfaces, surface];

      return {
        ...prev,
        [selectedTooth]: {
          ...existing,
          surfaces: updatedSurfaces.length > 0 ? updatedSurfaces : ['O'],
        },
      };
    });
  };

  // Update status
  const handleSetStatus = (status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED') => {
    setTeethRecords((prev) => {
      const existing = prev[selectedTooth];
      if (!existing) return prev;
      return {
        ...prev,
        [selectedTooth]: {
          ...existing,
          status,
        },
      };
    });
  };

  // Update note
  const handleUpdateNote = (note: string) => {
    setTeethRecords((prev) => {
      const existing = prev[selectedTooth];
      if (!existing) return prev;
      return {
        ...prev,
        [selectedTooth]: {
          ...existing,
          note,
        },
      };
    });
  };

  // Calculate Treatment Plan Totals
  const treatmentItems = useMemo(() => {
    return Object.values(teethRecords).sort((a, b) => a.toothNum - b.toothNum);
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
    if (totalCost === 0) return 100;
    return Math.round((completedCost / totalCost) * 100);
  }, [completedCost, totalCost]);

  // Handle Save
  const handleSave = () => {
    if (onSavePlan) {
      onSavePlan(teethRecords);
    }
    setSaveSuccessMsg(
      isUz
        ? `Davolash rejasi saqlandi! (${treatmentItems.length} ta tish, jami: ${totalCost.toLocaleString('uz-UZ')} so'm)`
        : `План лечения сохранен! (${treatmentItems.length} зубов, всего: ${totalCost.toLocaleString('uz-UZ')} сум)`
    );
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  const selectedToothInfo = TOOTH_NAMES[selectedTooth] || {
    uz: `Tish #${selectedTooth}`,
    ru: `Зуб #${selectedTooth}`,
  };

  return (
    <div className="space-y-6">
      {/* Save Success Alert */}
      {saveSuccessMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-800 text-xs font-bold flex items-center gap-2 shadow-sm animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {/* Main Odontogram Dental Arch Card */}
      <div className="ui-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#d8e5e2] pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-[#152f34]">
                {isUz ? 'Interaktiv 3D Odontogramma — Tishlar xaritasi' : 'Интерактивная 3D одонтограмма — Зубная карта'}
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#e0f2ed] text-[#167b78] border border-[#167b78]/30">
                FDI (11–48)
              </span>
            </div>
            <p className="text-xs text-[#52696e] mt-0.5">
              {isUz
                ? `Bemor: ${patientName} • Tishni tanlang, tashxis va sirtlarni belgilang`
                : `Пациент: ${patientName} • Выберите зуб для назначения диагноза и поверхностей`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 bg-[#167b78] hover:bg-[#116460] text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isUz ? 'Rejani saqlash' : 'Сохранить план'}</span>
            </button>
          </div>
        </div>

        {/* 32-Teeth Anatomical Grid */}
        <div className="p-4 bg-[#f8fbfa] rounded-2xl border border-[#d8e5e2] space-y-6">
          {/* Upper Arch (Maxillary): 18-11 and 21-28 */}
          <div>
            <div className="flex justify-between items-center text-[10px] font-bold text-[#52696e] mb-1.5 px-2">
              <span className="flex items-center gap-1">
                <span>🦷</span>
                <span>{isUz ? "Yuqori jag' (Maxilla) • O'ng (18–11)" : 'Верхняя челюсть (Maxilla) • Справа (18–11)'}</span>
              </span>
              <span>{isUz ? 'Chap (21–28)' : 'Слева (21–28)'}</span>
            </div>

            <div className="grid grid-cols-16 gap-1 sm:gap-1.5 text-center" style={{ display: 'grid', gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}>
              {[18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28].map((toothNum) => {
                const isSelected = selectedTooth === toothNum;
                const rec = teethRecords[toothNum];
                const cond = rec?.condition || 'HEALTHY';
                const meta = CONDITION_METADATA[cond];

                return (
                  <button
                    key={toothNum}
                    type="button"
                    onClick={() => setSelectedTooth(toothNum)}
                    className={`flex flex-col items-center justify-between p-1 rounded-xl border transition-all duration-150 cursor-pointer ${meta.bgClass} ${meta.textClass} ${meta.borderClass} ${
                      isSelected ? 'ring-3 ring-[#167b78] ring-offset-2 scale-105 shadow-md' : 'hover:scale-102 hover:shadow-xs'
                    }`}
                    title={`${isUz ? 'Tish' : 'Зуб'} #${toothNum}: ${isUz ? meta.nameUz : meta.nameRu}`}
                  >
                    <span className="text-[10px] font-mono font-bold">{toothNum}</span>
                    <div className="w-5 h-8 my-1 flex items-center justify-center">
                      <svg viewBox="0 0 24 36" className="w-full h-full fill-current opacity-95">
                        <path d="M12 2 C8 2, 4 6, 4 14 C4 20, 6 26, 7 34 C8 35, 10 35, 11 31 C11.5 28, 12.5 28, 13 31 C14 35, 16 35, 17 34 C18 26, 20 20, 20 14 C20 6, 16 2, 12 2 Z" />
                      </svg>
                    </div>
                    {rec && rec.condition !== 'HEALTHY' && (
                      <span className="text-[8px] font-bold px-1 rounded bg-black/20 truncate max-w-full">
                        {rec.surfaces.join('')}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Lower Arch (Mandibular): 48-41 and 31-38 */}
          <div>
            <div className="grid grid-cols-16 gap-1 sm:gap-1.5 text-center" style={{ display: 'grid', gridTemplateColumns: 'repeat(16, minmax(0, 1fr))' }}>
              {[48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38].map((toothNum) => {
                const isSelected = selectedTooth === toothNum;
                const rec = teethRecords[toothNum];
                const cond = rec?.condition || 'HEALTHY';
                const meta = CONDITION_METADATA[cond];

                return (
                  <button
                    key={toothNum}
                    type="button"
                    onClick={() => setSelectedTooth(toothNum)}
                    className={`flex flex-col items-center justify-between p-1 rounded-xl border transition-all duration-150 cursor-pointer ${meta.bgClass} ${meta.textClass} ${meta.borderClass} ${
                      isSelected ? 'ring-3 ring-[#167b78] ring-offset-2 scale-105 shadow-md' : 'hover:scale-102 hover:shadow-xs'
                    }`}
                    title={`${isUz ? 'Tish' : 'Зуб'} #${toothNum}: ${isUz ? meta.nameUz : meta.nameRu}`}
                  >
                    {rec && rec.condition !== 'HEALTHY' && (
                      <span className="text-[8px] font-bold px-1 rounded bg-black/20 truncate max-w-full">
                        {rec.surfaces.join('')}
                      </span>
                    )}
                    <div className="w-5 h-8 my-1 flex items-center justify-center">
                      <svg viewBox="0 0 24 36" className="w-full h-full fill-current opacity-95 transform rotate-180">
                        <path d="M12 2 C8 2, 4 6, 4 14 C4 20, 6 26, 7 34 C8 35, 10 35, 11 31 C11.5 28, 12.5 28, 13 31 C14 35, 16 35, 17 34 C18 26, 20 20, 20 14 C20 6, 16 2, 12 2 Z" />
                      </svg>
                    </div>
                    <span className="text-[10px] font-mono font-bold">{toothNum}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-between items-center text-[10px] font-bold text-[#52696e] mt-1.5 px-2">
              <span className="flex items-center gap-1">
                <span>🦷</span>
                <span>{isUz ? "Pastki jag' (Mandibula) • O'ng (48–41)" : 'Нижняя челюсть (Mandibula) • Справа (48–41)'}</span>
              </span>
              <span>{isUz ? 'Chap (31–38)' : 'Слева (31–38)'}</span>
            </div>
          </div>

          {/* Quick Condition Legend */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-3 border-t border-[#d8e5e2] text-xs">
            {Object.entries(CONDITION_METADATA).map(([key, meta]) => (
              <div key={key} className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-full border border-black/10 shrink-0"
                  style={{ backgroundColor: meta.hexColor }}
                />
                <span className="text-[#52696e] text-[11px] font-medium">
                  {isUz ? meta.nameUz : meta.nameRu}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Selected Tooth Interactive Inspector & Surface Sector Editor */}
        <div className="p-4 bg-white rounded-2xl border border-[#167b78]/30 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-[#167b78] text-white font-mono font-extrabold text-sm">
                  #{selectedTooth}
                </span>
                <h3 className="font-bold text-sm sm:text-base text-[#152f34]">
                  {isUz ? selectedToothInfo.uz : selectedToothInfo.ru}
                </h3>
              </div>
              <p className="text-xs text-[#52696e] mt-0.5">
                {isUz ? 'Holat:' : 'Статус:'}{' '}
                <strong className="text-[#167b78]">
                  {isUz
                    ? CONDITION_METADATA[currentRecord.condition].nameUz
                    : CONDITION_METADATA[currentRecord.condition].nameRu}
                </strong>
                {currentRecord.surfaces.length > 0 && ` • Sirtlar: ${currentRecord.surfaces.join(', ')}`}
              </p>
            </div>

            {/* Status pill (Planned, In Progress, Completed) */}
            <div className="flex items-center gap-1.5 text-xs">
              {(['PLANNED', 'IN_PROGRESS', 'COMPLETED'] as const).map((st) => {
                const isActive = currentRecord.status === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => handleSetStatus(st)}
                    className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-colors cursor-pointer ${
                      isActive
                        ? st === 'COMPLETED'
                          ? 'bg-emerald-600 text-white'
                          : st === 'IN_PROGRESS'
                          ? 'bg-amber-600 text-white'
                          : 'bg-[#167b78] text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {st === 'PLANNED'
                      ? isUz
                        ? 'Rejalashtirilgan'
                        : 'Запланировано'
                      : st === 'IN_PROGRESS'
                      ? isUz
                        ? 'Jarayonda'
                        : 'В процессе'
                      : isUz
                      ? 'Bajarildi'
                      : 'Завершено'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Condition Selector Chips */}
          <div>
            <label className="block text-xs font-bold text-[#152f34] mb-2">
              {isUz ? "Tish holatini tanlang (Tashxis):" : 'Выберите диагноз / процедуру:'}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {(Object.keys(CONDITION_METADATA) as ToothCondition[]).map((cond) => {
                const meta = CONDITION_METADATA[cond];
                const isCurrent = currentRecord.condition === cond;
                return (
                  <button
                    key={cond}
                    type="button"
                    onClick={() => handleSetCondition(cond)}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                      isCurrent
                        ? 'bg-[#167b78] text-white border-[#116460] shadow-sm scale-102 ring-2 ring-[#167b78]/40'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-base">{meta.icon}</span>
                    <span className="text-center text-[11px] leading-tight">
                      {isUz ? meta.nameUz : meta.nameRu}
                    </span>
                    {meta.defaultCost > 0 && (
                      <span className={`text-[9px] ${isCurrent ? 'text-teal-100' : 'text-slate-500'}`}>
                        {meta.defaultCost.toLocaleString('uz-UZ')} {isUz ? "so'm" : 'сум'}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Surface & Note Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            {/* Clickable Tooth Surface Sectors (Occlusal, Mesial, Distal, Vestibular, Lingual) */}
            <div>
              <label className="block text-xs font-bold text-[#152f34] mb-1.5">
                {isUz ? "Zararlangan tish sirtlari (Surfaces):" : 'Поверхности зуба:'}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { key: 'O' as ToothSurface, labelUz: 'Okluzal (O)', labelRu: 'Окклюзионная (O)' },
                  { key: 'M' as ToothSurface, labelUz: 'Mezial (M)', labelRu: 'Медиальная (M)' },
                  { key: 'D' as ToothSurface, labelUz: 'Distal (D)', labelRu: 'Дистальная (D)' },
                  { key: 'V' as ToothSurface, labelUz: 'Vestibulyar (V)', labelRu: 'Вестибулярная (V)' },
                  { key: 'L' as ToothSurface, labelUz: 'Til / Tanglay (L)', labelRu: 'Язычная (L)' },
                ].map((surf) => {
                  const isChecked = currentRecord.surfaces.includes(surf.key);
                  return (
                    <button
                      key={surf.key}
                      type="button"
                      onClick={() => handleToggleSurface(surf.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                        isChecked
                          ? 'bg-[#14bdac] text-white border-[#116460] shadow-xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {isUz ? surf.labelUz : surf.labelRu} {isChecked && '✓'}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Doctor Note */}
            <div>
              <label className="block text-xs font-bold text-[#152f34] mb-1.5">
                {isUz ? "Shifokor klinik izohi:" : 'Клиническая заметка врача:'}
              </label>
              <input
                type="text"
                placeholder={isUz ? "Masalan: Chuqur karies, anesteziya qilindi..." : 'Например: Глубокий кариес, анестезия...'}
                value={currentRecord.note || ''}
                onChange={(e) => handleUpdateNote(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-[#167b78] focus:ring-1 focus:ring-[#167b78]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Dynamic Treatment Plan & Real-time Cost Summary */}
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

          {/* Real-time Financial Breakdown */}
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
              {isUz ? "Yuqoridagi tish xaritasidan tishni tanlab karies, plomba yoki koronka belgilang." : 'Выберите зуб на карте сверху, чтобы назначить лечение.'}
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
                        {isUz ? TOOTH_NAMES[item.toothNum]?.uz : TOOTH_NAMES[item.toothNum]?.ru}
                        {item.surfaces.length > 0 && ` • Sirtlar: [${item.surfaces.join(', ')}]`}
                        {item.note && ` • Izoh: ${item.note}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    <span className="font-mono text-xs font-extrabold text-[#167b78]">
                      {item.costUzs.toLocaleString('uz-UZ')} {isUz ? "so'm" : 'сум'}
                    </span>

                    <span
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-lg ${
                        item.status === 'COMPLETED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : item.status === 'IN_PROGRESS'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {item.status === 'COMPLETED'
                        ? isUz
                          ? 'Bajarildi'
                          : 'Выполнено'
                        : item.status === 'IN_PROGRESS'
                        ? isUz
                          ? 'Jarayonda'
                          : 'В процессе'
                        : isUz
                        ? 'Rejada'
                        : 'Запланировано'}
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSetCondition('HEALTHY');
                      }}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                      title={isUz ? "Rejadan o'chirish" : 'Удалить из плана'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
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
