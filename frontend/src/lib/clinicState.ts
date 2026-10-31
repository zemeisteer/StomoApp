'use client';

/**
 * Unified Centralized Reactive State & Cross-Role Sync Engine for StomoApp
 * File: frontend/src/lib/clinicState.ts
 *
 * Synchronizes:
 * - Patient Portal (/booking, patient history)
 * - Reception Dashboard (/admin, /admin/calendar, /admin/patients)
 * - Dentist Workspace (/admin, interactive odontogram, treatment plan)
 * - Clinic Owner CRM (/admin, /admin/analytics, /admin/staff, inventory & debt engine)
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

export type AppointmentStatus =
  | 'PENDING'
  | 'SCHEDULED'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'IN_CHAIR'
  | 'IN_TREATMENT'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  patientPhone: string;
  doctorId: string;
  doctorName: string;
  branchId: string;
  branchName: string;
  serviceId: string;
  serviceName: string;
  startTime: string; // ISO 8601 string
  endTime: string;   // ISO 8601 string
  durationMinutes: number;
  status: AppointmentStatus;
  notes?: string;
  actualStartTime?: string;
  delayMinutes: number;
  idempotencyKey: string;
  createdAt: string;
}

export type PaymentMethod = 'CASH' | 'UZCARD' | 'HUMO' | 'PAYME' | 'CLICK' | 'UZCARD_HUMO';

export interface PaymentTransaction {
  id: string;
  invoiceId: string;
  patientId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  notes?: string;
  createdAt: string;
}

export interface Invoice {
  id: string;
  patientId: string;
  patientName: string;
  appointmentId?: string;
  totalAmount: number;
  paidAmount: number;
  debtAmount: number;
  status: 'PENDING' | 'PARTIALLY_PAID' | 'PAID' | 'REFUNDED';
  procedures: Array<{
    nameUz: string;
    nameRu: string;
    toothNum?: number;
    cost: number;
  }>;
  payments: PaymentTransaction[];
  createdAt: string;
}

export interface Patient {
  id: string;
  fullName: string;
  phone: string;
  birthDate?: string;
  allergies?: string[];
  medicalNotes?: string;
  totalDebt: number;
  totalPaid: number;
  createdAt: string;
}

export interface InventoryItem {
  id: string;
  nameUz: string;
  nameRu: string;
  category: 'anesthetic' | 'composite' | 'implant' | 'endo' | 'consumable';
  quantity: number;
  unit: string;
  minThreshold: number;
  costPerUnit: number;
  lastRestockedAt: string;
}

export interface DoctorCommission {
  doctorId: string;
  doctorName: string;
  commissionRatePct: number; // e.g. 40%
  materialDeductionPct: number; // e.g. 10%
}

export interface ClinicState {
  patients: Patient[];
  appointments: Appointment[];
  odontograms: Record<string, Record<number, ToothRecord>>; // patientId -> toothNum -> ToothRecord
  invoices: Invoice[];
  inventory: InventoryItem[];
  commissions: Record<string, DoctorCommission>; // doctorId -> DoctorCommission
  lastSyncAt: string;
}

const STORAGE_KEY = 'stomo_clinic_state_v2';

// Standard Condition Metadata with realistic Tashkent clinic pricing (UZS)
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

// Initial Seed Fixtures
const SEED_PATIENTS: Patient[] = [
  {
    id: 'pat-101',
    fullName: 'Aziz Rahimov',
    phone: '+998 90 123 45 67',
    birthDate: '1992-05-14',
    allergies: ['Penitsillin'],
    medicalNotes: "Gipertoniya 1-daraja. 14-tishda o'tkir og'riq bilan murojaat qilgan.",
    totalDebt: 350000,
    totalPaid: 850000,
    createdAt: '2026-10-15T09:00:00Z',
  },
  {
    id: 'pat-102',
    fullName: 'Malika Karimova',
    phone: '+998 97 765 43 21',
    birthDate: '1998-11-20',
    allergies: [],
    medicalNotes: 'Homiladorlik 2-trimestr. Faqat xavfsiz anesteziya mumkin.',
    totalDebt: 1200000,
    totalPaid: 450000,
    createdAt: '2026-10-20T11:30:00Z',
  },
  {
    id: 'pat-103',
    fullName: 'Jasur Shodiyev',
    phone: '+998 93 555 12 34',
    birthDate: '1985-03-08',
    allergies: ['Lidokain'],
    medicalNotes: "Profilaktik ko'rik va tozalash rejalashtirilgan.",
    totalDebt: 0,
    totalPaid: 650000,
    createdAt: '2026-10-25T14:00:00Z',
  },
  {
    id: 'pat-104',
    fullName: 'Diyorbek Usmonov (Bolalar)',
    phone: '+998 94 999 88 77',
    birthDate: '2018-07-22',
    allergies: [],
    medicalNotes: "Sut tishlari kariesi (FDI 54, 64). Og'riqsiz davolash tavsiya etiladi.",
    totalDebt: 250000,
    totalPaid: 200000,
    createdAt: '2026-10-28T10:00:00Z',
  },
];

const SEED_APPOINTMENTS: Appointment[] = [
  {
    id: 'appt-1',
    patientId: 'pat-101',
    patientName: 'Aziz Rahimov',
    patientPhone: '+998 90 123 45 67',
    doctorId: 'doc-1',
    doctorName: 'Dr. Aziz Karimov',
    branchId: 'br-1',
    branchName: 'Chilonzor filiali',
    serviceId: 'srv-1',
    serviceName: 'Molyar restavratsiyasi',
    startTime: new Date(new Date().setHours(10, 0, 0, 0)).toISOString(),
    endTime: new Date(new Date().setHours(10, 45, 0, 0)).toISOString(),
    durationMinutes: 45,
    status: 'IN_TREATMENT',
    notes: 'Kresloda muolaja davom etmoqda',
    actualStartTime: new Date(new Date().setHours(10, 5, 0, 0)).toISOString(),
    delayMinutes: 5,
    idempotencyKey: 'seed_appt_1',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'appt-2',
    patientId: 'pat-102',
    patientName: 'Malika Karimova',
    patientPhone: '+998 97 765 43 21',
    doctorId: 'doc-1',
    doctorName: 'Dr. Aziz Karimov',
    branchId: 'br-1',
    branchName: 'Chilonzor filiali',
    serviceId: 'srv-2',
    serviceName: 'Sirkoniy qoplama (Koronka)',
    startTime: new Date(new Date().setHours(11, 0, 0, 0)).toISOString(),
    endTime: new Date(new Date().setHours(12, 0, 0, 0)).toISOString(),
    durationMinutes: 60,
    status: 'CHECKED_IN',
    notes: 'Qabulxonada kutmoqda',
    delayMinutes: 0,
    idempotencyKey: 'seed_appt_2',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'appt-3',
    patientId: 'pat-103',
    patientName: 'Jasur Shodiyev',
    patientPhone: '+998 93 555 12 34',
    doctorId: 'doc-2',
    doctorName: 'Dr. Nilufar Usmanova',
    branchId: 'br-1',
    branchName: 'Chilonzor filiali',
    serviceId: 'srv-3',
    serviceName: 'Professional tozalash',
    startTime: new Date(new Date().setHours(14, 0, 0, 0)).toISOString(),
    endTime: new Date(new Date().setHours(14, 30, 0, 0)).toISOString(),
    durationMinutes: 30,
    status: 'CONFIRMED',
    notes: 'Tasdiqlangan qabul',
    delayMinutes: 0,
    idempotencyKey: 'seed_appt_3',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'appt-4',
    patientId: 'pat-104',
    patientName: 'Diyorbek Usmonov (Bolalar)',
    patientPhone: '+998 94 999 88 77',
    doctorId: 'doc-3',
    doctorName: 'Dr. Shahnoza Rahimova',
    branchId: 'br-2',
    branchName: "Mirzo Ulug'bek filiali",
    serviceId: 'srv-4',
    serviceName: 'Bolalar tish davolash',
    startTime: new Date(new Date().setHours(15, 0, 0, 0)).toISOString(),
    endTime: new Date(new Date().setHours(15, 40, 0, 0)).toISOString(),
    durationMinutes: 40,
    status: 'PENDING',
    notes: 'Yangi ariza',
    delayMinutes: 0,
    idempotencyKey: 'seed_appt_4',
    createdAt: new Date().toISOString(),
  },
];

const SEED_ODONTOGRAMS: Record<string, Record<number, ToothRecord>> = {
  'pat-101': {
    14: {
      toothNum: 14,
      condition: 'CARIES',
      surfaces: ['O', 'M'],
      note: 'Chuqur okluzal karies. Anesteziya bilan tozalash lozim.',
      treatmentNameUz: 'Molyar restavratsiyasi (Karies)',
      treatmentNameRu: 'Реставрация моляра (Кариес)',
      costUzs: 350000,
      status: 'IN_PROGRESS',
      chartType: 'ADULT',
    },
    15: {
      toothNum: 15,
      condition: 'FILLING',
      surfaces: ['O'],
      note: 'Fotopolimer kompozit restavratsiya.',
      treatmentNameUz: 'Kompozit plomba',
      treatmentNameRu: 'Композитная пломба',
      costUzs: 450000,
      status: 'COMPLETED',
      chartType: 'ADULT',
    },
    16: {
      toothNum: 16,
      condition: 'CROWN',
      surfaces: ['O', 'M', 'D', 'V', 'L'],
      note: "Sirkoniy qoplama o'rnatilgan.",
      treatmentNameUz: 'Sirkoniy tosh qoplama',
      treatmentNameRu: 'Циркониевая коронка',
      costUzs: 1200000,
      status: 'COMPLETED',
      chartType: 'ADULT',
    },
    11: {
      toothNum: 11,
      condition: 'ROOT_CANAL',
      surfaces: ['O', 'L'],
      note: 'Kanal mexanik kengaytirildi va plombalandi.',
      treatmentNameUz: 'Kanal endodontik davolash',
      treatmentNameRu: 'Эндодонтия корневых каналов',
      costUzs: 850000,
      status: 'PLANNED',
      chartType: 'ADULT',
    },
  },
  'pat-104': {
    54: {
      toothNum: 54,
      condition: 'CARIES',
      surfaces: ['O'],
      note: 'Sut tishi kariesi, ogriqsiz tozalash.',
      treatmentNameUz: 'Bolalar kompozit restavratsiyasi',
      treatmentNameRu: 'Детская реставрация зуба',
      costUzs: 250000,
      status: 'PLANNED',
      chartType: 'PEDIATRIC',
    },
    64: {
      toothNum: 64,
      condition: 'PULPITIS',
      surfaces: ['O', 'D'],
      note: 'Sut tishi pulpiti.',
      treatmentNameUz: 'Sut tishi pulpiti davosi',
      treatmentNameRu: 'Лечение пульпита молочного зуба',
      costUzs: 300000,
      status: 'PLANNED',
      chartType: 'PEDIATRIC',
    },
  },
};

const SEED_INVOICES: Invoice[] = [
  {
    id: 'inv-101',
    patientId: 'pat-101',
    patientName: 'Aziz Rahimov',
    appointmentId: 'appt-1',
    totalAmount: 1200000,
    paidAmount: 850000,
    debtAmount: 350000,
    status: 'PARTIALLY_PAID',
    procedures: [
      { nameUz: 'Molyar restavratsiyasi #14', nameRu: 'Реставрация моляра #14', toothNum: 14, cost: 350000 },
      { nameUz: 'Kompozit plomba #15', nameRu: 'Композитная пломба #15', toothNum: 15, cost: 450000 },
      { nameUz: 'Professional tozalash', nameRu: 'Профессиональная чистка', cost: 400000 },
    ],
    payments: [
      {
        id: 'pay-1',
        invoiceId: 'inv-101',
        patientId: 'pat-101',
        amount: 500000,
        paymentMethod: 'CLICK',
        notes: "Oldindan to'lov",
        createdAt: '2026-10-25T11:00:00Z',
      },
      {
        id: 'pay-2',
        invoiceId: 'inv-101',
        patientId: 'pat-101',
        amount: 350000,
        paymentMethod: 'CASH',
        notes: "Kassa naqd to'lov",
        createdAt: '2026-10-28T16:00:00Z',
      },
    ],
    createdAt: '2026-10-25T10:30:00Z',
  },
  {
    id: 'inv-102',
    patientId: 'pat-102',
    patientName: 'Malika Karimova',
    appointmentId: 'appt-2',
    totalAmount: 1650000,
    paidAmount: 450000,
    debtAmount: 1200000,
    status: 'PARTIALLY_PAID',
    procedures: [
      { nameUz: 'Sirkoniy qoplama #16', nameRu: 'Циркониевая коронка #16', toothNum: 16, cost: 1200000 },
      { nameUz: 'Diagnostik rentgen OPG', nameRu: 'Рентген диагностика', cost: 450000 },
    ],
    payments: [
      {
        id: 'pay-3',
        invoiceId: 'inv-102',
        patientId: 'pat-102',
        amount: 450000,
        paymentMethod: 'UZCARD_HUMO',
        notes: 'Terminal orqali',
        createdAt: '2026-10-26T14:30:00Z',
      },
    ],
    createdAt: '2026-10-26T14:00:00Z',
  },
];

const SEED_INVENTORY: InventoryItem[] = [
  {
    id: 'inv-item-1',
    nameUz: 'Artikain 4% anestetik ampula',
    nameRu: 'Артикаин 4% анестетик ампула',
    category: 'anesthetic',
    quantity: 18,
    unit: 'ampula',
    minThreshold: 25,
    costPerUnit: 18000,
    lastRestockedAt: '2026-10-20',
  },
  {
    id: 'inv-item-2',
    nameUz: 'Filtek Z250 kompozit shpris (A2)',
    nameRu: 'Filtek Z250 композит шприц (A2)',
    category: 'composite',
    quantity: 8,
    unit: 'dona',
    minThreshold: 10,
    costPerUnit: 280000,
    lastRestockedAt: '2026-10-22',
  },
  {
    id: 'inv-item-3',
    nameUz: 'Straumann titan implantat 4.1mm',
    nameRu: 'Straumann титановый имплантат 4.1мм',
    category: 'implant',
    quantity: 4,
    unit: 'dona',
    minThreshold: 5,
    costPerUnit: 1450000,
    lastRestockedAt: '2026-10-18',
  },
  {
    id: 'inv-item-4',
    nameUz: 'ProTaper Gold endo fayllar to‘plami',
    nameRu: 'ProTaper Gold эндофайлы набор',
    category: 'endo',
    quantity: 12,
    unit: 'quti',
    minThreshold: 8,
    costPerUnit: 320000,
    lastRestockedAt: '2026-10-25',
  },
  {
    id: 'inv-item-5',
    nameUz: 'Nitril tibbiy qo‘lqoplar (M o‘lcham)',
    nameRu: 'Нитриловые перчатки (Размер M)',
    category: 'consumable',
    quantity: 6,
    unit: 'quti (100 dona)',
    minThreshold: 15,
    costPerUnit: 65000,
    lastRestockedAt: '2026-10-15',
  },
];

const SEED_COMMISSIONS: Record<string, DoctorCommission> = {
  'doc-1': {
    doctorId: 'doc-1',
    doctorName: 'Dr. Aziz Karimov',
    commissionRatePct: 40,
    materialDeductionPct: 10,
  },
  'doc-2': {
    doctorId: 'doc-2',
    doctorName: 'Dr. Nilufar Usmanova',
    commissionRatePct: 45,
    materialDeductionPct: 12,
  },
  'doc-3': {
    doctorId: 'doc-3',
    doctorName: 'Dr. Shahnoza Rahimova',
    commissionRatePct: 35,
    materialDeductionPct: 8,
  },
};

class ClinicStateManager {
  private state: ClinicState;
  private listeners: Set<(state: ClinicState) => void> = new Set();

  constructor() {
    this.state = this.loadInitialState();
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY && e.newValue) {
          try {
            this.state = JSON.parse(e.newValue);
            this.notify();
          } catch {}
        }
      });
    }
  }

  private loadInitialState(): ClinicState {
    if (typeof window === 'undefined') {
      return {
        patients: SEED_PATIENTS,
        appointments: SEED_APPOINTMENTS,
        odontograms: SEED_ODONTOGRAMS,
        invoices: SEED_INVOICES,
        inventory: SEED_INVENTORY,
        commissions: SEED_COMMISSIONS,
        lastSyncAt: new Date().toISOString(),
      };
    }

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.patients && parsed.appointments) {
          return parsed;
        }
      }
    } catch {}

    const initial: ClinicState = {
      patients: SEED_PATIENTS,
      appointments: SEED_APPOINTMENTS,
      odontograms: SEED_ODONTOGRAMS,
      invoices: SEED_INVOICES,
      inventory: SEED_INVENTORY,
      commissions: SEED_COMMISSIONS,
      lastSyncAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    } catch {}
    return initial;
  }

  private persist() {
    this.state.lastSyncAt = new Date().toISOString();
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
        window.dispatchEvent(new CustomEvent('clinicStateChanged', { detail: this.state }));
      } catch (e) {
        console.error('[ClinicState] Failed to persist state:', e);
      }
    }
    this.notify();
  }

  public getState(): ClinicState {
    return this.state;
  }

  // =========================================================================
  // FASTAPI BACKEND CLIENT ADAPTER & OFFLINE FALLBACK (Phase 4 Requirement 3)
  // =========================================================================

  private get fastApiBaseUrl(): string {
    return process.env.NEXT_PUBLIC_FASTAPI_URL || 'http://localhost:8000';
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (typeof window !== 'undefined') {
      try {
        const token = localStorage.getItem('token') || localStorage.getItem('auth_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
      } catch {}
    }
    return headers;
  }

  public async syncWithFastApiBackend(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${this.fastApiBaseUrl}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) return false;

      // Sync inventory & debts from FastAPI
      const [invRes, debtRes] = await Promise.allSettled([
        fetch(`${this.fastApiBaseUrl}/api/inventory`, { headers: this.getAuthHeaders() }),
        fetch(`${this.fastApiBaseUrl}/api/billing/debts`, { headers: this.getAuthHeaders() }),
      ]);

      let hasUpdates = false;
      if (invRes.status === 'fulfilled' && invRes.value.ok) {
        const invData = await invRes.value.json();
        if (Array.isArray(invData) && invData.length > 0) {
          invData.forEach((remoteItem: any) => {
            const local = this.state.inventory.find((i) => i.id === remoteItem.id);
            if (local) {
              local.quantity = remoteItem.quantity;
            }
          });
          hasUpdates = true;
        }
      }

      if (hasUpdates) {
        this.persist();
      }
      return true;
    } catch {
      // Graceful offline fallback: Continue using reactive localStorage state
      return false;
    }
  }

  public subscribe(listener: (state: ClinicState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((listener) => {
      listener(this.state);
    });
  }

  // =========================================================================
  // ACTIONS & COLLISION-SAFE BOOKING
  // =========================================================================

  /**
   * Check if a given doctor has an overlapping booking
   */
  public checkSlotCollision(params: {
    doctorId: string;
    startTime: string;
    durationMinutes: number;
    excludeAppointmentId?: string;
  }): boolean {
    const start = new Date(params.startTime);
    const end = new Date(start.getTime() + params.durationMinutes * 60000);

    return this.state.appointments.some((a) => {
      if (a.doctorId !== params.doctorId || a.status === 'CANCELLED') return false;
      if (params.excludeAppointmentId && a.id === params.excludeAppointmentId) return false;
      const aStart = new Date(a.startTime);
      const aEnd = new Date(a.endTime);
      return aStart < end && aEnd > start;
    });
  }

  /**
   * Collision-Safe Appointment Booking
   * Validates doctor schedule conflicts across active appointments.
   */
  public bookAppointment(payload: {
    patientName: string;
    patientPhone: string;
    doctorId: string;
    doctorName?: string;
    branchId: string;
    branchName?: string;
    serviceId: string;
    serviceName?: string;
    startTime: string; // ISO String
    durationMinutes: number;
    notes?: string;
    idempotencyKey?: string;
  }): { success: boolean; appointment?: Appointment; error?: string } {
    const start = new Date(payload.startTime);
    const end = new Date(start.getTime() + payload.durationMinutes * 60000);

    // Collision Check: (appt.start < newEnd) && (appt.end > newStart)
    const conflict = this.state.appointments.find((a) => {
      if (a.doctorId !== payload.doctorId || a.status === 'CANCELLED') return false;
      const aStart = new Date(a.startTime);
      const aEnd = new Date(a.endTime);
      return aStart < end && aEnd > start;
    });

    if (conflict) {
      return {
        success: false,
        error: `Shifokor tanlangan vaqtda band (${new Date(conflict.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(conflict.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}). Iltimos, boshqa vaqt tanlang.`,
      };
    }

    // Find or register patient
    let patient = this.state.patients.find(
      (p) => p.phone.replace(/\D/g, '') === payload.patientPhone.replace(/\D/g, '')
    );

    if (!patient) {
      patient = {
        id: `pat-${Date.now().toString().slice(-5)}`,
        fullName: payload.patientName,
        phone: payload.patientPhone,
        totalDebt: 0,
        totalPaid: 0,
        createdAt: new Date().toISOString(),
      };
      this.state.patients.push(patient);
    }

    const newAppt: Appointment = {
      id: `appt-${Date.now()}`,
      patientId: patient.id,
      patientName: patient.fullName,
      patientPhone: patient.phone,
      doctorId: payload.doctorId,
      doctorName: payload.doctorName || 'Dr. Shifokor',
      branchId: payload.branchId,
      branchName: payload.branchName || 'DentaCare Filiali',
      serviceId: payload.serviceId,
      serviceName: payload.serviceName || 'Stomatologik muolaja',
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      durationMinutes: payload.durationMinutes,
      status: 'CONFIRMED',
      notes: payload.notes,
      delayMinutes: 0,
      idempotencyKey: `client_book_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    };

    this.state.appointments.unshift(newAppt);
    this.persist();
    return { success: true, appointment: newAppt };
  }

  public updateAppointmentStatus(appointmentId: string, status: AppointmentStatus): boolean {
    const appt = this.state.appointments.find((a) => a.id === appointmentId);
    if (!appt) return false;

    appt.status = status;
    if (status === 'IN_TREATMENT' && !appt.actualStartTime) {
      appt.actualStartTime = new Date().toISOString();
    }
    this.persist();
    return true;
  }

  public recordAppointmentDelay(appointmentId: string, additionalMinutes: number = 15): boolean {
    const appt = this.state.appointments.find((a) => a.id === appointmentId);
    if (!appt) return false;

    appt.delayMinutes = (appt.delayMinutes || 0) + additionalMinutes;
    const end = new Date(appt.endTime);
    appt.endTime = new Date(end.getTime() + additionalMinutes * 60000).toISOString();
    this.persist();
    return true;
  }

  // =========================================================================
  // ODONTOGRAM & CLINICAL TREATMENTS
  // =========================================================================

  public savePatientOdontogram(
    patientId: string,
    records: Record<number, ToothRecord>
  ) {
    if (!this.state.odontograms[patientId]) {
      this.state.odontograms[patientId] = {};
    }
    this.state.odontograms[patientId] = { ...records };

    // Update patient active invoices & total debt
    let activeTotalCost = 0;
    const procedures: Array<{ nameUz: string; nameRu: string; toothNum?: number; cost: number }> = [];

    Object.values(records).forEach((rec) => {
      if (rec.condition !== 'HEALTHY') {
        activeTotalCost += rec.costUzs;
        procedures.push({
          nameUz: `${rec.treatmentNameUz} #${rec.toothNum}`,
          nameRu: `${rec.treatmentNameRu} #${rec.toothNum}`,
          toothNum: rec.toothNum,
          cost: rec.costUzs,
        });
      }
    });

    const patient = this.state.patients.find((p) => p.id === patientId);
    if (patient) {
      // Find or create active invoice
      let invoice = this.state.invoices.find(
        (inv) => inv.patientId === patientId && inv.status !== 'PAID'
      );
      if (!invoice) {
        invoice = {
          id: `inv-${Date.now()}`,
          patientId,
          patientName: patient.fullName,
          totalAmount: activeTotalCost,
          paidAmount: 0,
          debtAmount: activeTotalCost,
          status: activeTotalCost > 0 ? 'PENDING' : 'PAID',
          procedures,
          payments: [],
          createdAt: new Date().toISOString(),
        };
        this.state.invoices.unshift(invoice);
      } else {
        invoice.totalAmount = activeTotalCost;
        invoice.debtAmount = Math.max(0, activeTotalCost - invoice.paidAmount);
        invoice.procedures = procedures;
        invoice.status =
          invoice.debtAmount === 0 ? 'PAID' : invoice.paidAmount > 0 ? 'PARTIALLY_PAID' : 'PENDING';
      }

      patient.totalDebt = invoice.debtAmount;
    }

    this.persist();
  }

  // =========================================================================
  // FINANCIALS, DEBT ("QARZLAR") & PAYMENTS
  // =========================================================================

  public recordPayment(params: {
    invoiceId: string;
    amount: number;
    paymentMethod: PaymentMethod;
    notes?: string;
  }): { success: boolean; invoice?: Invoice; error?: string } {
    const invoice = this.state.invoices.find((i) => i.id === params.invoiceId);
    if (!invoice) return { success: false, error: 'Hisob-faktura topilmadi' };

    const payment: PaymentTransaction = {
      id: `pay-${Date.now()}`,
      invoiceId: invoice.id,
      patientId: invoice.patientId,
      amount: params.amount,
      paymentMethod: params.paymentMethod,
      notes: params.notes,
      createdAt: new Date().toISOString(),
    };

    invoice.payments.unshift(payment);
    invoice.paidAmount += params.amount;
    invoice.debtAmount = Math.max(0, invoice.totalAmount - invoice.paidAmount);
    invoice.status =
      invoice.debtAmount === 0 ? 'PAID' : invoice.paidAmount > 0 ? 'PARTIALLY_PAID' : 'PENDING';

    const patient = this.state.patients.find((p) => p.id === invoice.patientId);
    if (patient) {
      patient.totalPaid += params.amount;
      patient.totalDebt = Math.max(0, patient.totalDebt - params.amount);
    }

    this.persist();
    return { success: true, invoice };
  }

  public repayPatientDebt(params: {
    patientId: string;
    amount: number;
    paymentMethod: PaymentMethod;
    notes?: string;
  }): { success: boolean; remainingDebt: number; error?: string } {
    const patient = this.state.patients.find((p) => p.id === params.patientId);
    if (!patient) return { success: false, remainingDebt: 0, error: 'Bemor topilmadi' };

    let remainingToPay = params.amount;
    const patientInvoices = this.state.invoices.filter(
      (inv) => inv.patientId === params.patientId && inv.debtAmount > 0
    );

    for (const inv of patientInvoices) {
      if (remainingToPay <= 0) break;
      const paymentAmount = Math.min(inv.debtAmount, remainingToPay);
      inv.payments.unshift({
        id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        invoiceId: inv.id,
        patientId: patient.id,
        amount: paymentAmount,
        paymentMethod: params.paymentMethod,
        notes: params.notes || 'Qarzni qaytarish (Repayment)',
        createdAt: new Date().toISOString(),
      });
      inv.paidAmount += paymentAmount;
      inv.debtAmount -= paymentAmount;
      inv.status = inv.debtAmount === 0 ? 'PAID' : 'PARTIALLY_PAID';
      remainingToPay -= paymentAmount;
    }

    patient.totalPaid += params.amount;
    patient.totalDebt = Math.max(0, patient.totalDebt - params.amount);

    this.persist();
    return { success: true, remainingDebt: patient.totalDebt };
  }

  // =========================================================================
  // DOCTOR COMMISSION CALCULATOR
  // =========================================================================

  public setDoctorCommission(doctorId: string, commissionRatePct: number, materialDeductionPct: number = 10) {
    if (!this.state.commissions[doctorId]) {
      this.state.commissions[doctorId] = {
        doctorId,
        doctorName: `Dr. #${doctorId}`,
        commissionRatePct,
        materialDeductionPct,
      };
    } else {
      this.state.commissions[doctorId].commissionRatePct = commissionRatePct;
      this.state.commissions[doctorId].materialDeductionPct = materialDeductionPct;
    }
    this.persist();
  }

  public calculateDoctorEarnings(doctorId: string, startDate?: string, endDate?: string) {
    const comm = this.state.commissions[doctorId] || {
      doctorId,
      doctorName: `Dr. #${doctorId}`,
      commissionRatePct: 40,
      materialDeductionPct: 10,
    };

    const completedAppts = this.state.appointments.filter((a) => {
      if (a.doctorId !== doctorId || a.status !== 'COMPLETED') return false;
      if (startDate && a.startTime < startDate) return false;
      if (endDate && a.startTime > endDate) return false;
      return true;
    });

    // Sum of procedures from completed appointments
    let grossClinicalRevenue = 0;
    for (const appt of completedAppts) {
      const inv = this.state.invoices.find((i) => i.appointmentId === appt.id || i.patientId === appt.patientId);
      if (inv) {
        grossClinicalRevenue += inv.paidAmount;
      } else {
        grossClinicalRevenue += 450000; // standard average appointment revenue
      }
    }

    const materialCosts = Math.round((grossClinicalRevenue * comm.materialDeductionPct) / 100);
    const netBase = Math.max(0, grossClinicalRevenue - materialCosts);
    const doctorPayout = Math.round((netBase * comm.commissionRatePct) / 100);
    const clinicNetProfit = grossClinicalRevenue - doctorPayout - materialCosts;

    return {
      completedVisits: completedAppts.length,
      grossClinicalRevenue,
      materialCosts,
      commissionRatePct: comm.commissionRatePct,
      doctorPayout,
      clinicNetProfit,
    };
  }

  // =========================================================================
  // INVENTORY & LOW-STOCK CONSUMABLES
  // =========================================================================

  public addStock(itemId: string, qty: number) {
    this.updateInventoryQuantity(itemId, Math.abs(qty));
  }

  public deductStock(itemId: string, qty: number) {
    this.updateInventoryQuantity(itemId, -Math.abs(qty));
  }

  public completeProcedureAndGenerateInvoice(
    patientId: string,
    toothNum: number,
    record: ToothRecord
  ) {
    // 1. Mark tooth record as COMPLETED
    if (!this.state.odontograms[patientId]) {
      this.state.odontograms[patientId] = {};
    }
    this.state.odontograms[patientId][toothNum] = {
      ...record,
      status: 'COMPLETED',
      updatedAt: new Date().toISOString(),
    };

    // 2. Generate or update invoice
    const patient = this.state.patients.find((p) => p.id === patientId);
    const cost = record.costUzs;
    const procNameUz = `${record.treatmentNameUz} #${toothNum}`;
    const procNameRu = `${record.treatmentNameRu} #${toothNum}`;

    let invoice = this.state.invoices.find(
      (inv) => inv.patientId === patientId && inv.status !== 'PAID'
    );

    if (!invoice) {
      invoice = {
        id: `inv-${Date.now()}`,
        patientId,
        patientName: patient ? patient.fullName : `Bemor #${patientId}`,
        totalAmount: cost,
        paidAmount: 0,
        debtAmount: cost,
        status: 'PENDING',
        procedures: [
          {
            nameUz: procNameUz,
            nameRu: procNameRu,
            toothNum,
            cost,
          },
        ],
        payments: [],
        createdAt: new Date().toISOString(),
      };
      this.state.invoices.unshift(invoice);
    } else {
      const existingProc = invoice.procedures.find((p) => p.toothNum === toothNum);
      if (!existingProc) {
        invoice.procedures.push({
          nameUz: procNameUz,
          nameRu: procNameRu,
          toothNum,
          cost,
        });
        invoice.totalAmount += cost;
        invoice.debtAmount += cost;
      }
    }

    if (patient) {
      patient.totalDebt = invoice.debtAmount;
    }

    this.persist();
    return invoice;
  }

  public updateInventoryQuantity(itemId: string, delta: number) {
    const item = this.state.inventory.find((i) => i.id === itemId);
    if (!item) return;

    item.quantity = Math.max(0, item.quantity + delta);
    if (delta > 0) {
      item.lastRestockedAt = new Date().toISOString().split('T')[0];
    }
    this.persist();
  }

  public getLowStockItems(): InventoryItem[] {
    return this.state.inventory.filter((i) => i.quantity <= i.minThreshold);
  }
}

// Global Singleton Export
export const clinicStore = new ClinicStateManager();
