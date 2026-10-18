// Clean, localized date formatting for Uzbek and Russian without Windows ICU "M10" abbreviations

const UZ_MONTHS = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'
];

const UZ_MONTHS_GENITIVE = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'
];

const UZ_WEEKDAYS_SHORT = ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan'];

const RU_MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

const RU_MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
];

const RU_WEEKDAYS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

export function formatClinicDate(
  dateInput: Date | string,
  locale: 'uz' | 'ru' = 'uz',
  options: {
    includeWeekday?: boolean;
    includeYear?: boolean;
    short?: boolean;
  } = {}
): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return '';

  const day = date.getDate();
  const monthIdx = date.getMonth();
  const year = date.getFullYear();
  const weekdayIdx = date.getDay();

  const isUz = locale === 'uz';
  const monthName = isUz ? UZ_MONTHS_GENITIVE[monthIdx] : RU_MONTHS_GENITIVE[monthIdx];
  const weekdayName = isUz ? UZ_WEEKDAYS_SHORT[weekdayIdx] : RU_WEEKDAYS_SHORT[weekdayIdx];

  let result = `${day} ${monthName}`;
  if (options.includeYear !== false) {
    result += ` ${year}`;
  }
  if (options.includeWeekday) {
    result = `${weekdayName}, ${result}`;
  }

  return result;
}

export function formatClinicTime(dateInput: Date | string): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return '';

  return date.toLocaleTimeString('uz-UZ', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tashkent',
  });
}

export function formatRangeTitle(
  startDate: Date,
  endDate: Date,
  locale: 'uz' | 'ru' = 'uz'
): string {
  const isUz = locale === 'uz';
  const startDay = startDate.getDate();
  const endDay = endDate.getDate();
  const startMonth = isUz ? UZ_MONTHS_GENITIVE[startDate.getMonth()] : RU_MONTHS_GENITIVE[startDate.getMonth()];
  const endMonth = isUz ? UZ_MONTHS_GENITIVE[endDate.getMonth()] : RU_MONTHS_GENITIVE[endDate.getMonth()];
  const endYear = endDate.getFullYear();

  if (startDate.getMonth() === endDate.getMonth()) {
    return `${startDay} — ${endDay} ${endMonth} ${endYear}`;
  }
  return `${startDay} ${startMonth} — ${endDay} ${endMonth} ${endYear}`;
}

export function formatMonthYear(
  dateInput: Date | string,
  locale: 'uz' | 'ru' = 'uz'
): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return '';
  const isUz = locale === 'uz';
  const monthName = isUz ? UZ_MONTHS[date.getMonth()] : RU_MONTHS[date.getMonth()];
  return `${monthName} ${date.getFullYear()}`;
}

