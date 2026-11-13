// Clean, localized date formatting and timezone-authoritative utilities
// All calendar calculations are strictly bound to Asia/Tashkent (UTC+5, constant offset)

export const CLINIC_TIMEZONE = 'Asia/Tashkent';

const UZ_MONTHS = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'
];

const UZ_MONTHS_GENITIVE = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'
];

const UZ_WEEKDAYS_SHORT = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan'];
const UZ_WEEKDAYS_FULL = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];

const RU_MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

const RU_MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
];

const RU_WEEKDAYS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const RU_WEEKDAYS_FULL = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];

export interface ClinicDateParts {
  year: number;
  month: number; // 1-12
  monthIndex: number; // 0-11
  day: number;
  weekdayIndex: number; // 0 (Sun) - 6 (Sat)
  hour: number;
  minute: number;
  second: number;
  dateString: string; // YYYY-MM-DD
  timeString: string; // HH:mm
}

/**
 * Extracts exact calendar parts in clinic timezone (Asia/Tashkent)
 * regardless of the client browser's local timezone.
 */
export function getClinicDateParts(dateInput: Date | string): ClinicDateParts {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) {
    return {
      year: 1970,
      month: 1,
      monthIndex: 0,
      day: 1,
      weekdayIndex: 0,
      hour: 0,
      minute: 0,
      second: 0,
      dateString: '1970-01-01',
      timeString: '00:00',
    };
  }

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: CLINIC_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });

  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;

  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekdayIndex = weekdays.indexOf(map.weekday);
  const year = parseInt(map.year, 10);
  const month = parseInt(map.month, 10);
  const day = parseInt(map.day, 10);
  const rawHour = parseInt(map.hour, 10);
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = parseInt(map.minute, 10);
  const second = parseInt(map.second, 10);

  const pad = (n: number) => String(n).padStart(2, '0');
  const dateString = `${year}-${pad(month)}-${pad(day)}`;
  const timeString = `${pad(hour)}:${pad(minute)}`;

  return {
    year,
    month,
    monthIndex: month - 1,
    day,
    weekdayIndex: weekdayIndex >= 0 ? weekdayIndex : 0,
    hour,
    minute,
    second,
    dateString,
    timeString,
  };
}

/**
 * Formats a timestamp into a natural, localized clinic date (Asia/Tashkent).
 * Immune to browser-local timezone discrepancies.
 */
export function formatClinicDate(
  dateInput: Date | string,
  locale: 'uz' | 'ru' = 'uz',
  options: {
    includeWeekday?: boolean;
    weekdayFormat?: 'short' | 'full';
    includeYear?: boolean;
    short?: boolean;
  } = {}
): string {
  const parts = getClinicDateParts(dateInput);
  if (parts.year === 1970 && parts.month === 1 && parts.day === 1 && typeof dateInput === 'string' && dateInput === '') {
    return '';
  }

  const isUz = locale === 'uz';
  const monthName = isUz ? UZ_MONTHS_GENITIVE[parts.monthIndex] : RU_MONTHS_GENITIVE[parts.monthIndex];
  
  let weekdayName = '';
  if (options.includeWeekday) {
    if (options.weekdayFormat === 'full') {
      weekdayName = isUz ? UZ_WEEKDAYS_FULL[parts.weekdayIndex] : RU_WEEKDAYS_FULL[parts.weekdayIndex];
    } else {
      weekdayName = isUz ? UZ_WEEKDAYS_SHORT[parts.weekdayIndex] : RU_WEEKDAYS_SHORT[parts.weekdayIndex];
    }
  }

  let result = `${parts.day} ${monthName}`;
  if (options.includeYear !== false) {
    result += ` ${parts.year}`;
  }
  if (options.includeWeekday && weekdayName) {
    result = `${weekdayName}, ${result}`;
  }

  return result;
}

/**
 * Formats a pure calendar date string 'YYYY-MM-DD' without timezone shift.
 */
export function formatCalendarDate(
  dateStr: string,
  locale: 'uz' | 'ru' = 'uz',
  options: {
    includeWeekday?: boolean;
    includeYear?: boolean;
  } = {}
): string {
  if (!dateStr || !dateStr.includes('-')) return dateStr;
  const noonTashkentIso = `${dateStr.slice(0, 10)}T12:00:00.000+05:00`;
  return formatClinicDate(noonTashkentIso, locale, options);
}

/**
 * Formats a timestamp into clinic time (HH:mm) in Asia/Tashkent.
 */
export function formatClinicTime(dateInput: Date | string): string {
  const parts = getClinicDateParts(dateInput);
  return parts.timeString;
}

/**
 * Formats a date range for display using clinic timezone parts.
 */
export function formatRangeTitle(
  startDateInput: Date | string,
  endDateInput: Date | string,
  locale: 'uz' | 'ru' = 'uz'
): string {
  const isUz = locale === 'uz';
  const startParts = getClinicDateParts(startDateInput);
  const endParts = getClinicDateParts(endDateInput);

  const startMonth = isUz ? UZ_MONTHS_GENITIVE[startParts.monthIndex] : RU_MONTHS_GENITIVE[startParts.monthIndex];
  const endMonth = isUz ? UZ_MONTHS_GENITIVE[endParts.monthIndex] : RU_MONTHS_GENITIVE[endParts.monthIndex];

  if (startParts.year === endParts.year && startParts.monthIndex === endParts.monthIndex) {
    if (startParts.day === endParts.day) {
      return `${startParts.day} ${endMonth} ${endParts.year}`;
    }
    return `${startParts.day} — ${endParts.day} ${endMonth} ${endParts.year}`;
  }
  if (startParts.year === endParts.year) {
    return `${startParts.day} ${startMonth} — ${endParts.day} ${endMonth} ${endParts.year}`;
  }
  return `${startParts.day} ${startMonth} ${startParts.year} — ${endParts.day} ${endMonth} ${endParts.year}`;
}

/**
 * Formats a month and year in clinic timezone (e.g. "Oktabr 2026").
 */
export function formatMonthYear(
  dateInput: Date | string,
  locale: 'uz' | 'ru' = 'uz'
): string {
  const parts = getClinicDateParts(dateInput);
  const isUz = locale === 'uz';
  const monthName = isUz ? UZ_MONTHS[parts.monthIndex] : RU_MONTHS[parts.monthIndex];
  return `${monthName} ${parts.year}`;
}

/**
 * Returns current date string 'YYYY-MM-DD' in Asia/Tashkent.
 */
export function getClinicTodayDateString(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TIMEZONE }).format(new Date());
}

/**
 * Returns tomorrow date string 'YYYY-MM-DD' in Asia/Tashkent.
 */
export function getClinicTomorrowDateString(): string {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TIMEZONE }).format(tomorrow);
}

/**
 * Converts a date or timestamp to 'YYYY-MM-DD' in Asia/Tashkent.
 */
export function toClinicDateString(dateInput: Date | string): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  return new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TIMEZONE }).format(d);
}

/**
 * Calculates start and end of day in Asia/Tashkent as UTC ISO strings.
 * E.g. for '2026-10-20', returns 2026-10-19T19:00:00.000Z to 2026-10-20T18:59:59.999Z.
 */
export function getClinicDayBoundaries(dateStr: string): { dateFrom: string; dateTo: string } {
  const cleanDate = dateStr.slice(0, 10);
  const dateFrom = new Date(`${cleanDate}T00:00:00.000+05:00`).toISOString();
  const dateTo = new Date(`${cleanDate}T23:59:59.999+05:00`).toISOString();
  return { dateFrom, dateTo };
}

/**
 * Calculates week boundaries (Monday 00:00:00 to Sunday 23:59:59.999) in Asia/Tashkent
 * as UTC ISO strings, along with the start and end date strings.
 */
export function getClinicWeekBoundaries(dateInput: Date | string): {
  dateFrom: string;
  dateTo: string;
  startDateStr: string;
  endDateStr: string;
} {
  const dateStr = typeof dateInput === 'string' ? dateInput.slice(0, 10) : toClinicDateString(dateInput);
  const mid = new Date(`${dateStr}T12:00:00.000+05:00`);

  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: CLINIC_TIMEZONE, weekday: 'short' });
  const weekdayShort = dtf.format(mid);
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const wIdx = weekdays.indexOf(weekdayShort);
  const diffToMon = wIdx === 0 ? -6 : 1 - wIdx;

  const monDate = new Date(mid.getTime() + diffToMon * 86400000);
  const sunDate = new Date(monDate.getTime() + 6 * 86400000);

  const dtfCa = new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TIMEZONE });
  const startDateStr = dtfCa.format(monDate);
  const endDateStr = dtfCa.format(sunDate);

  const dateFrom = new Date(`${startDateStr}T00:00:00.000+05:00`).toISOString();
  const dateTo = new Date(`${endDateStr}T23:59:59.999+05:00`).toISOString();

  return { dateFrom, dateTo, startDateStr, endDateStr };
}

/**
 * Calculates month boundaries (1st day 00:00:00 to last day 23:59:59.999) in Asia/Tashkent
 * as UTC ISO strings.
 */
export function getClinicMonthBoundaries(dateInput: Date | string): {
  dateFrom: string;
  dateTo: string;
  startDateStr: string;
  endDateStr: string;
} {
  const parts = getClinicDateParts(dateInput);
  const pad = (n: number) => String(n).padStart(2, '0');

  // Days in this month
  const lastDay = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();

  const startDateStr = `${parts.year}-${pad(parts.month)}-01`;
  const endDateStr = `${parts.year}-${pad(parts.month)}-${pad(lastDay)}`;

  const dateFrom = new Date(`${startDateStr}T00:00:00.000+05:00`).toISOString();
  const dateTo = new Date(`${endDateStr}T23:59:59.999+05:00`).toISOString();

  return { dateFrom, dateTo, startDateStr, endDateStr };
}

/**
 * Parses clinic date (YYYY-MM-DD) and clinic time (HH:mm) into an exact UTC ISO string.
 */
export function parseClinicDateTimeToUtcIso(dateStr: string, timeStr: string): string {
  const cleanDate = dateStr.slice(0, 10);
  const cleanTime = timeStr.slice(0, 5);
  return new Date(`${cleanDate}T${cleanTime}:00+05:00`).toISOString();
}

/**
 * Formats a Branch workingHours JSON object into a human-readable localized string.
 */
export function formatWorkingHours(workingHours: any, lang: 'uz' | 'ru' = 'uz'): string {
  if (!workingHours) return '';
  if (typeof workingHours === 'string') return workingHours;
  if (typeof workingHours !== 'object') return '';

  const dayLabelsUz: Record<string, string> = {
    mon: 'Dush', tue: 'Sesh', wed: 'Chor', thu: 'Pay', fri: 'Juma', sat: 'Shanba', sun: 'Yakshanba',
  };
  const dayLabelsRu: Record<string, string> = {
    mon: 'Пн', tue: 'Вт', wed: 'Ср', thu: 'Чт', fri: 'Пт', sat: 'Сб', sun: 'Вс',
  };

  const getHours = (d: string) => {
    const val = workingHours[d];
    if (!val || val.closed || val.isClosed) return 'closed';
    if (val.open && val.close) return `${val.open} - ${val.close}`;
    return '';
  };

  const monHours = getHours('mon');
  const tueHours = getHours('tue');
  const wedHours = getHours('wed');
  const thuHours = getHours('thu');
  const friHours = getHours('fri');
  const satHours = getHours('sat');
  const sunHours = getHours('sun');

  if (!monHours && !satHours && !sunHours) {
    return '';
  }

  const parts: string[] = [];
  const closedText = lang === 'ru' ? 'Выходной' : 'Yopiq';

  if (monHours && monHours === tueHours && monHours === wedHours && monHours === thuHours && monHours === friHours) {
    const rangeLabel = lang === 'ru' ? 'Пн-Пт' : 'Dush-Juma';
    parts.push(`${rangeLabel}: ${monHours === 'closed' ? closedText : monHours}`);
  } else {
    for (const d of ['mon', 'tue', 'wed', 'thu', 'fri'] as const) {
      const h = getHours(d);
      if (h) {
        const label = lang === 'ru' ? dayLabelsRu[d] : dayLabelsUz[d];
        parts.push(`${label}: ${h === 'closed' ? closedText : h}`);
      }
    }
  }

  if (satHours) {
    const satLabel = lang === 'ru' ? 'Сб' : 'Shanba';
    parts.push(`${satLabel}: ${satHours === 'closed' ? closedText : satHours}`);
  }

  if (sunHours) {
    const sunLabel = lang === 'ru' ? 'Вс' : 'Yakshanba';
    parts.push(`${sunLabel}: ${sunHours === 'closed' ? closedText : sunHours}`);
  }

  return parts.join(', ');
}

