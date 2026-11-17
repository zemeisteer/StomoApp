/**
 * Stand-in photographs for the public site (licensed from Wikimedia Commons).
 * They hold each slot until the clinic supplies its own pictures: replace a file in
 * public/site/ (same name) or point the slot at a new `src`, and update CREDITS.
 * Shot list for the clinic: the team at work in a treatment room, the room from the door,
 * instruments on the tray, a check-up with a mirror, a procedure, a child at the chair.
 */
export type SitePhoto = {
  /** base path without extension; files exist as `${base}.webp`, `${base}-960.webp`, `${base}-500.webp` */
  base: string;
  width: number;
  height: number;
  altUz: string;
  altRu: string;
};

const p = (id: string, width: number, height: number, altUz: string, altRu: string): SitePhoto => ({
  base: `/site/photo-${id}`,
  width,
  height,
  altUz,
  altRu,
});

export const SITE_PHOTOS = {
  team: p('f190774270', 1280, 853, 'Shifokor va yordamchi kreslodagi bemorni davolamoqda', 'Врач и ассистент лечат пациента в кресле'),
  tools: p('f196715622', 1280, 1910, 'Stomatologik asboblar ish stolida', 'Стоматологические инструменты на рабочем столе'),
  checkup: p('f190774257', 1280, 826, 'Shifokor oyna bilan tishlarni ko‘rmoqda', 'Врач осматривает зубы с зеркалом'),
  room: p('f196715621', 1280, 1910, 'Davolash xonasi: kreslo va asboblar', 'Лечебный кабинет: кресло и инструменты'),
  procedure: p('f190774260', 1280, 853, 'Shifokor muolaja o‘tkazmoqda', 'Врач проводит процедуру'),
  child: p('f197684384', 1280, 853, 'Shifokor bola bilan qabul oldidan suhbatlashmoqda', 'Врач беседует с ребёнком перед приёмом'),
} as const;

export const srcSet = (ph: SitePhoto) => `${ph.base}-500.webp 500w, ${ph.base}-960.webp 960w, ${ph.base}.webp 1280w`;

export const altOf = (ph: SitePhoto, lang: string) => (lang === 'ru' ? ph.altRu : ph.altUz);

/** One footer line: CC BY / CC BY-SA require naming the author and the licence. */
export const PHOTO_CREDITS = [
  { by: 'Jameswasswa', licence: 'CC BY-SA 4.0', url: 'https://commons.wikimedia.org/wiki/File:Modern_Dentistry_in_Practice.jpg' },
  { by: 'Shixart1985', licence: 'CC BY 2.0', url: 'https://commons.wikimedia.org/wiki/File:Child_receives_dental_care_in_a_clinic_with_a_smiling_dentist.jpg' },
];
