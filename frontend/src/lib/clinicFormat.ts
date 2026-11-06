/** Shared formatting for clinical and billing screens. */

export function formatUzs(amount: number | null | undefined, lang: string = 'uz'): string {
  const n = Math.round(Number(amount) || 0);
  const digits = n.toLocaleString('ru-RU').replace(/ | /g, ' ');
  return lang === 'ru' ? `${digits} сум` : `${digits} so'm`;
}

export function doctorName(d: any, lang: string = 'uz'): string {
  if (!d) return '';
  const first = lang === 'ru' ? d.firstNameRu || d.firstNameUz : d.firstNameUz;
  const last = lang === 'ru' ? d.lastNameRu || d.lastNameUz : d.lastNameUz;
  return [first, last].filter(Boolean).join(' ');
}

type Tone = 'neutral' | 'brand' | 'info' | 'success' | 'warning' | 'danger';

export const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-canvas text-ink-muted ring-line',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-rose-50 text-rose-700 ring-rose-200',
};

export const PLAN_STATUS: Record<string, { uz: string; ru: string; tone: Tone }> = {
  DRAFT: { uz: 'Qoralama', ru: 'Черновик', tone: 'neutral' },
  PRESENTED: { uz: 'Bemorga yuborilgan', ru: 'Отправлен пациенту', tone: 'info' },
  ACCEPTED: { uz: 'Rozilik berilgan', ru: 'Согласован', tone: 'brand' },
  DECLINED: { uz: 'Rad etilgan', ru: 'Отклонён', tone: 'danger' },
  IN_PROGRESS: { uz: 'Davolanmoqda', ru: 'В процессе', tone: 'warning' },
  COMPLETED: { uz: 'Yakunlangan', ru: 'Завершён', tone: 'success' },
  CANCELLED: { uz: 'Bekor qilingan', ru: 'Отменён', tone: 'neutral' },
};

export const ITEM_STATUS: Record<string, { uz: string; ru: string; tone: Tone }> = {
  PLANNED: { uz: 'Rejada', ru: 'Запланировано', tone: 'neutral' },
  IN_PROGRESS: { uz: 'Jarayonda', ru: 'В работе', tone: 'warning' },
  COMPLETED: { uz: 'Bajarildi', ru: 'Выполнено', tone: 'success' },
  CANCELLED: { uz: 'Bekor', ru: 'Отменено', tone: 'neutral' },
};

export const APPOINTMENT_STATUS: Record<string, { uz: string; ru: string; tone: Tone }> = {
  PENDING: { uz: 'Kutilmoqda', ru: 'Ожидает', tone: 'warning' },
  CONFIRMED: { uz: 'Tasdiqlangan', ru: 'Подтверждён', tone: 'brand' },
  CHECKED_IN: { uz: 'Klinikada', ru: 'В клинике', tone: 'info' },
  COMPLETED: { uz: 'Yakunlangan', ru: 'Завершён', tone: 'success' },
  CANCELLED: { uz: 'Bekor qilingan', ru: 'Отменён', tone: 'neutral' },
  NO_SHOW: { uz: 'Kelmadi', ru: 'Не пришёл', tone: 'danger' },
};

export const PAYMENT_METHOD: Record<string, { uz: string; ru: string }> = {
  CASH: { uz: 'Naqd', ru: 'Наличные' },
  CARD: { uz: 'Karta', ru: 'Карта' },
  TRANSFER: { uz: "O'tkazma", ru: 'Перевод' },
  OTHER: { uz: 'Boshqa', ru: 'Другое' },
};
