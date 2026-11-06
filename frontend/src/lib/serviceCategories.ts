/**
 * Service categories: must match the Prisma `ServiceCategory` enum
 * (backend/prisma/schema.prisma). Single source for labels on the public
 * site, the booking wizard and the admin panel.
 */
export const SERVICE_CATEGORIES = [
  { value: 'PREVENTIVE', uz: 'Profilaktika va gigiyena', ru: 'Профилактика и гигиена' },
  { value: 'THERAPY', uz: 'Terapiya va karies', ru: 'Терапия и кариес' },
  { value: 'ORTHODONTICS', uz: 'Ortodontiya (breketlar)', ru: 'Ортодонтия (брекеты)' },
  { value: 'IMPLANTS', uz: 'Implantatsiya', ru: 'Имплантация' },
  { value: 'PROSTHETICS', uz: 'Protezlash', ru: 'Протезирование' },
  { value: 'PEDIATRIC', uz: 'Bolalar stomatologiyasi', ru: 'Детская стоматология' },
  { value: 'WHITENING', uz: 'Oqartirish', ru: 'Отбеливание' },
  { value: 'SURGERY', uz: 'Jarrohlik', ru: 'Хирургия' },
  { value: 'DIAGNOSTICS', uz: 'Diagnostika', ru: 'Диагностика' },
  { value: 'OTHER', uz: 'Boshqa xizmatlar', ru: 'Другие услуги' },
] as const;

export type ServiceCategoryValue = (typeof SERVICE_CATEGORIES)[number]['value'];

export function serviceCategoryLabel(value: string | null | undefined, language: string = 'uz'): string {
  const found = SERVICE_CATEGORIES.find((c) => c.value === value);
  if (!found) return value || '';
  return language === 'ru' ? found.ru : found.uz;
}
