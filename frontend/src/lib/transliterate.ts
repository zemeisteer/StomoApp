/**
 * Intelligent Uzbek Latin <-> Cyrillic transliteration and medical domain dictionary helper.
 * Supports bidirectional transliteration and common clinic/doctor terminology translation.
 */

// Common medical specialties and titles dictionary
export const SPECIALTY_DICTIONARY: Record<string, { uz: string; ru: string }> = {
  'stomatolog-terapevt': { uz: 'Stomatolog-terapevt', ru: 'Стоматолог-терапевт' },
  'stomatolog-ortoped': { uz: 'Stomatolog-ortoped', ru: 'Стоматолог-ортопед' },
  'stomatolog-jarroh': { uz: 'Stomatolog-jarroh', ru: 'Стоматолог-хирург' },
  'ortodont': { uz: 'Ortodont', ru: 'Ортодонт' },
  'implantolog': { uz: 'Implantolog', ru: 'Имплантолог' },
  'bolalar stomatologi': { uz: 'Bolalar stomatologi', ru: 'Детский стоматолог' },
  'bosh shifokor': { uz: 'Bosh shifokor', ru: 'Главный врач' },
  'oliy toifali shifokor': { uz: 'Oliy toifali shifokor', ru: 'Врач высшей категории' },
  'parodontolog': { uz: 'Parodontolog', ru: 'Пародонтолог' },
  'gnatolog': { uz: 'Gnatolog', ru: 'Гнатолог' },
  'gigiyenist': { uz: 'Gigiyenist', ru: 'Гигиенист' },
  'stomatolog': { uz: 'Stomatolog', ru: 'Стоматолог' },
};

// Common city / address terms dictionary
export const ADDRESS_TERMS: Record<string, { uz: string; ru: string }> = {
  'toshkent': { uz: 'Toshkent', ru: 'Ташкент' },
  'toshkent sh.': { uz: 'Toshkent sh.', ru: 'г. Ташкент' },
  'toshkent shahri': { uz: 'Toshkent shahri', ru: 'город Ташкент' },
  'filial': { uz: 'Filial', ru: 'Филиал' },
  'markaziy': { uz: 'Markaziy', ru: 'Центральный' },
  'chilonzor': { uz: 'Chilonzor', ru: 'Чиланзар' },
  'yunusobod': { uz: 'Yunusobod', ru: 'Юнусабад' },
  'mirzo ulug‘bek': { uz: 'Mirzo Ulug‘bek', ru: 'Мирзо Улугбек' },
  'mirzo ulugbek': { uz: 'Mirzo Ulug‘bek', ru: 'Мирзо Улугбек' },
  'mirobod': { uz: 'Mirobod', ru: 'Мирабад' },
  'sergeli': { uz: 'Sergeli', ru: 'Сергели' },
  'shayxontohur': { uz: 'Shayxontohur', ru: 'Шайхантахур' },
  'olmazor': { uz: 'Olmazor', ru: 'Алмазар' },
  'bektemir': { uz: 'Bektemir', ru: 'Бектемир' },
  'yakkasaroy': { uz: 'Yakkasaroy', ru: 'Яккасарай' },
  'uchtepa': { uz: 'Uchtepa', ru: 'Учтепа' },
  'yashnobod': { uz: 'Yashnobod', ru: 'Яшнабад' },
  'tumani': { uz: 'tumani', ru: 'район' },
  'ko‘chasi': { uz: 'ko‘chasi', ru: 'улица' },
  'kochasi': { uz: 'ko‘chasi', ru: 'улица' },
  'mavzesi': { uz: 'mavzesi', ru: 'массив' },
  'massivi': { uz: 'massivi', ru: 'массив' },
  'uy': { uz: 'uy', ru: 'дом' },
};

// Check if string has Cyrillic characters
export function isCyrillic(str: string): boolean {
  return /[\u0400-\u04FF]/.test(str);
}

// Convert Uzbek Latin to Cyrillic
export function latinToCyrillic(input: string): string {
  if (!input) return '';

  let res = input;

  // Multi-character combinations first (case-sensitive replacements)
  const multiMap: [RegExp, string][] = [
    [/Sh/g, 'Ш'], [/SH/g, 'Ш'], [/sh/g, 'ш'],
    [/Ch/g, 'Ч'], [/CH/g, 'Ч'], [/ch/g, 'ч'],
    [/Yo/g, 'Ё'], [/YO/g, 'Ё'], [/yo/g, 'ё'],
    [/Yu/g, 'Ю'], [/YU/g, 'Ю'], [/yu/g, 'ю'],
    [/Ya/g, 'Я'], [/YA/g, 'Я'], [/ya/g, 'я'],
    [/Ye/g, 'Е'], [/YE/g, 'Е'], [/ye/g, 'е'],
    [/Ts/g, 'Ц'], [/TS/g, 'Ц'], [/ts/g, 'ц'],
    // Apostrophe variants for G' and O'
    [/G[ʻ`'ʼ‘]/g, 'Ғ'], [/g[ʻ`'ʼ‘]/g, 'ғ'],
    [/O[ʻ`'ʼ‘]/g, 'Ў'], [/o[ʻ`'ʼ‘]/g, 'ў'],
  ];

  for (const [regex, replacement] of multiMap) {
    res = res.replace(regex, replacement);
  }

  // Single characters map
  const singleMap: Record<string, string> = {
    'A': 'А', 'a': 'а',
    'B': 'Б', 'b': 'б',
    'D': 'Д', 'd': 'д',
    'E': 'Э', 'e': 'е',
    'F': 'Ф', 'f': 'ф',
    'G': 'Г', 'g': 'г',
    'H': 'Ҳ', 'h': 'ҳ',
    'I': 'И', 'i': 'и',
    'J': 'Ж', 'j': 'ж',
    'K': 'К', 'k': 'к',
    'L': 'Л', 'l': 'л',
    'M': 'М', 'm': 'м',
    'N': 'Н', 'n': 'н',
    'O': 'О', 'o': 'о',
    'P': 'П', 'p': 'п',
    'Q': 'Қ', 'q': 'қ',
    'R': 'Р', 'r': 'р',
    'S': 'С', 's': 'с',
    'T': 'Т', 't': 'т',
    'U': 'У', 'u': 'у',
    'V': 'В', 'v': 'в',
    'X': 'Х', 'x': 'х',
    'Y': 'Й', 'y': 'й',
    'Z': 'З', 'z': 'з',
  };

  let out = '';
  for (let i = 0; i < res.length; i++) {
    const char = res[i];
    out += singleMap[char] !== undefined ? singleMap[char] : char;
  }

  return out;
}

// Convert Cyrillic to Uzbek Latin
export function cyrillicToLatin(input: string): string {
  if (!input) return '';

  let res = input;

  const multiCyr: [RegExp, string][] = [
    [/Ё/g, 'Yo'], [/ё/g, 'yo'],
    [/Ю/g, 'Yu'], [/ю/g, 'yu'],
    [/Я/g, 'Ya'], [/я/g, 'ya'],
    [/Ч/g, 'Ch'], [/ч/g, 'ch'],
    [/Ш/g, 'Sh'], [/ш/g, 'sh'],
    [/Щ/g, 'Sh'], [/щ/g, 'sh'],
    [/Ц/g, 'Ts'], [/ц/g, 'ts'],
    [/Ғ/g, 'G‘'], [/ғ/g, 'g‘'],
    [/Ў/g, 'O‘'], [/ў/g, 'o‘'],
    [/Қ/g, 'Q'], [/қ/g, 'q'],
    [/Ҳ/g, 'H'], [/ҳ/g, 'h'],
  ];

  for (const [regex, replacement] of multiCyr) {
    res = res.replace(regex, replacement);
  }

  const singleCyr: Record<string, string> = {
    'А': 'A', 'а': 'a',
    'Б': 'B', 'б': 'b',
    'В': 'V', 'в': 'v',
    'Г': 'G', 'г': 'g',
    'Д': 'D', 'д': 'd',
    'Е': 'E', 'е': 'e',
    'Ж': 'J', 'ж': 'j',
    'З': 'Z', 'з': 'z',
    'И': 'I', 'и': 'i',
    'Й': 'Y', 'й': 'y',
    'К': 'K', 'к': 'k',
    'Л': 'L', 'l': 'l',
    'М': 'M', 'м': 'm',
    'Н': 'N', 'н': 'n',
    'О': 'O', 'о': 'o',
    'П': 'P', 'п': 'p',
    'Р': 'R', 'р': 'r',
    'С': 'S', 'с': 's',
    'Т': 'T', 't': 't',
    'У': 'U', 'у': 'u',
    'Ф': 'F', 'ф': 'f',
    'Х': 'X', 'х': 'x',
    'Ы': 'I', 'ы': 'i',
    'Э': 'E', 'э': 'e',
    'ь': '', 'Ь': '',
    'ъ': '\'', 'Ъ': '\'',
  };

  let out = '';
  for (let i = 0; i < res.length; i++) {
    const char = res[i];
    out += singleCyr[char] !== undefined ? singleCyr[char] : char;
  }

  return out;
}

/**
 * Bidirectional smart name transliteration / translation:
 * If typed in Latin, translates/transliterates to Cyrillic for Russian.
 * If typed in Cyrillic, translates/transliterates to Latin for Uzbek.
 */
export function translateName(text: string): { uz: string; ru: string } {
  if (!text || !text.trim()) return { uz: '', ru: '' };
  const trimmed = text.trim();
  if (isCyrillic(trimmed)) {
    return {
      uz: cyrillicToLatin(trimmed),
      ru: trimmed,
    };
  } else {
    return {
      uz: trimmed,
      ru: latinToCyrillic(trimmed),
    };
  }
}

/**
 * Smart specialty/title translator:
 * Checks medical dictionary first, falls back to intelligent transliteration.
 */
export function translateSpecialty(text: string): { uz: string; ru: string } {
  if (!text || !text.trim()) return { uz: '', ru: '' };
  const lower = text.trim().toLowerCase();

  for (const [key, val] of Object.entries(SPECIALTY_DICTIONARY)) {
    if (lower === key || lower === val.uz.toLowerCase() || lower === val.ru.toLowerCase()) {
      return val;
    }
  }

  return translateName(text);
}

/**
 * Smart address/branch translator:
 * Checks address term dictionary, falls back to transliteration.
 */
export function translateBranchOrAddress(text: string): { uz: string; ru: string } {
  if (!text || !text.trim()) return { uz: '', ru: '' };
  const lower = text.trim().toLowerCase();

  // Direct match
  if (ADDRESS_TERMS[lower]) {
    return ADDRESS_TERMS[lower];
  }

  // Word-by-word replacement for common components
  let uzText = text.trim();
  let ruText = text.trim();

  if (isCyrillic(text)) {
    uzText = cyrillicToLatin(text);
    // Replace known dictionary terms
    for (const val of Object.values(ADDRESS_TERMS)) {
      const cyrRegex = new RegExp(`\\b${val.ru}\\b`, 'gi');
      uzText = uzText.replace(cyrRegex, val.uz);
    }
  } else {
    ruText = latinToCyrillic(text);
    for (const val of Object.values(ADDRESS_TERMS)) {
      const latRegex = new RegExp(`\\b${val.uz}\\b`, 'gi');
      ruText = ruText.replace(latRegex, val.ru);
    }
  }

  return { uz: uzText, ru: ruText };
}

/**
 * Auto-generate clean doctor slug from name
 */
export function generateDoctorSlug(firstName: string, lastName: string): string {
  const full = `${firstName || ''} ${lastName || ''}`.trim();
  if (!full) return `doctor-${Date.now().toString().slice(-4)}`;

  const latin = isCyrillic(full) ? cyrillicToLatin(full) : full;
  const slug = latin
    .toLowerCase()
    .replace(/[ʻ`'ʼ‘]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug ? `dr-${slug}` : `doctor-${Date.now().toString().slice(-4)}`;
}
