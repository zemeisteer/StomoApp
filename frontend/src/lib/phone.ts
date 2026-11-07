/**
 * Canonical Uzbekistan Phone Utility
 *
 * Normalizes, validates, and formats Uzbekistan phone numbers (+998 followed by 9 digits).
 * Strictly prevents silent truncation of invalid pasted digits.
 */

export interface PhoneValidationResult {
  raw: string;
  normalized: string; // Canonical +998XXXXXXXXX format if valid, or best normalized attempt
  isValid: boolean;
  errorKey?: 'too_short' | 'too_long' | 'invalid_format' | 'required';
  errorMessageUz?: string;
  errorMessageRu?: string;
}

/**
 * Normalizes input string to canonical +998XXXXXXXXX
 */
export function normalizeUzPhone(input: string, isRequired = false): PhoneValidationResult {
  const raw = input || '';
  const trimmed = raw.trim();

  if (!trimmed) {
    if (isRequired) {
      return {
        raw,
        normalized: '',
        isValid: false,
        errorKey: 'required',
        errorMessageUz: 'Telefon raqamini kiritish shart',
        errorMessageRu: 'Номер телефона обязателен',
      };
    }
    return {
      raw,
      normalized: '',
      isValid: true,
    };
  }

  // Extract all digits
  const digits = trimmed.replace(/\D/g, '');

  let nationalDigits = '';

  if (digits.startsWith('998')) {
    nationalDigits = digits.slice(3);
  } else if (digits.length === 9) {
    nationalDigits = digits;
  } else if (digits.length === 10 && digits.startsWith('8')) {
    // Legacy Russian style 8XXXXXXXXX
    nationalDigits = digits.slice(1);
  } else if (digits.length > 9) {
    // User pasted too many digits! DO NOT silently truncate!
    return {
      raw,
      normalized: `+${digits}`,
      isValid: false,
      errorKey: 'too_long',
      errorMessageUz: "Telefon raqami juda uzun (O'zbekiston kodi + 9 ta raqam bo'lishi kerak)",
      errorMessageRu: 'Номер телефона слишком длинный (код Узбекистана + 9 цифр)',
    };
  } else {
    // Too short
    nationalDigits = digits;
  }

  if (nationalDigits.length < 9) {
    return {
      raw,
      normalized: `+998${nationalDigits}`,
      isValid: false,
      errorKey: 'too_short',
      errorMessageUz: "Telefon raqami to'liq emas (9 ta raqam kerak)",
      errorMessageRu: 'Номер телефона неполный (требуется 9 цифр)',
    };
  }

  if (nationalDigits.length > 9) {
    return {
      raw,
      normalized: `+998${nationalDigits}`,
      isValid: false,
      errorKey: 'too_long',
      errorMessageUz: "Telefon raqami 9 ta raqamdan oshmasligi kerak",
      errorMessageRu: 'Номер телефона не должен превышать 9 цифр',
    };
  }

  const normalized = `+998${nationalDigits}`;
  const isValid = /^\+998\d{9}$/.test(normalized);

  return {
    raw,
    normalized,
    isValid,
    errorMessageUz: isValid ? undefined : "Noto'g'ri telefon raqami formati",
    errorMessageRu: isValid ? undefined : 'Неверный формат номера телефона',
  };
}

/**
 * Formats a canonical or partial phone number for human-readable display: +998 (XX) XXX-XX-XX
 */
export function formatUzPhoneDisplay(input: string): string {
  if (!input) return '';
  const digits = input.replace(/\D/g, '');
  let localDigits = digits;
  if (digits.startsWith('998')) {
    localDigits = digits.slice(3);
  }

  let res = '+998';
  if (localDigits.length > 0) {
    res += ' (' + localDigits.slice(0, 2);
  }
  if (localDigits.length >= 2) {
    res += ') ' + localDigits.slice(2, 5);
  }
  if (localDigits.length >= 5) {
    res += '-' + localDigits.slice(5, 7);
  }
  if (localDigits.length >= 7) {
    res += '-' + localDigits.slice(7, 9);
  }
  if (localDigits.length > 9) {
    res += localDigits.slice(9);
  }
  return res;
}
