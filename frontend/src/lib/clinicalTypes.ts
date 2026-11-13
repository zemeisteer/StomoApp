/**
 * Clinical odontogram types and metadata
 * File: frontend/src/lib/clinicalTypes.ts
 */

export type ToothCondition =
  | 'HEALTHY'
  | 'CARIES'
  | 'PULPITIS'
  | 'PERIODONTITIS'
  | 'FILLING'
  | 'CROWN'
  | 'EXTRACTION'
  | 'IMPLANT'
  | 'ROOT_CANAL';

export type ToothSurface = 'O' | 'M' | 'D' | 'V' | 'L'; // Occlusal, Mesial, Distal, Vestibular/Buccal, Lingual

export type DentalChartType = 'ADULT' | 'PEDIATRIC';

export interface ToothRecord {
  toothNum: number;
  condition: ToothCondition;
  surfaces: ToothSurface[];
  note?: string;
  treatmentNameUz: string;
  treatmentNameRu: string;
  costUzs: number;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED';
  chartType: DentalChartType;
  updatedAt?: string;
}

export const CONDITION_METADATA: Record<
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
    borderClass: 'border-slate-300',
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
  PULPITIS: {
    nameUz: 'Pulpit',
    nameRu: 'Пульпит',
    treatmentUz: 'Pulpitni dori bilan davolash',
    treatmentRu: 'Купирование пульпита и девитализация',
    defaultCost: 650000,
    bgClass: 'bg-rose-500',
    textClass: 'text-white',
    borderClass: 'border-rose-600',
    badgeBg: 'bg-rose-100',
    badgeText: 'text-rose-800',
    hexColor: '#f43f5e',
    icon: '⚡',
  },
  PERIODONTITIS: {
    nameUz: 'Periodontit',
    nameRu: 'Периодонтит',
    treatmentUz: "Periodontitni kompleks davolash va yallig'lanishni bartaraf etish",
    treatmentRu: 'Комплексное эндодонтическое лечение периодонтита',
    defaultCost: 750000,
    bgClass: 'bg-amber-700',
    textClass: 'text-white',
    borderClass: 'border-amber-800',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-900',
    hexColor: '#b45309',
    icon: '🔥',
  },
  FILLING: {
    nameUz: 'Plomba',
    nameRu: 'Пломба',
    treatmentUz: 'Fotopolimer kompozit restavratsiya',
    treatmentRu: 'Световая фотополимерная пломба',
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
    treatmentUz: "Sirkoniy to'liq qoplama",
    treatmentRu: 'Циркониевая коронка',
    defaultCost: 1200000,
    bgClass: 'bg-blue-600',
    textClass: 'text-white',
    borderClass: 'border-blue-700',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-800',
    hexColor: '#2563eb',
    icon: '👑',
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
    icon: '🪚',
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
  ROOT_CANAL: {
    nameUz: 'Kanal davolash (Endodontiya)',
    nameRu: 'Лечение каналов (Эндодонтия)',
    treatmentUz: 'Ildiz kanallarini mexanik tozalash va obturatsiya',
    treatmentRu: 'Механическая обработка и пломбирование каналов',
    defaultCost: 850000,
    bgClass: 'bg-emerald-600',
    textClass: 'text-white',
    borderClass: 'border-emerald-700',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-800',
    hexColor: '#059669',
    icon: '💉',
  },
};

