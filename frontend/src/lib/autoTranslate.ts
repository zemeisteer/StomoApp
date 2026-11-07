import { api } from './api';

export type Lang = 'uz' | 'ru';

/** Translates admin text between Uzbek and Russian. Returns '' when the service is unavailable. */
export async function autoTranslate(text: string, from: Lang, to: Lang): Promise<string> {
  const clean = (text || '').trim();
  if (!clean) return '';
  try {
    const res = await api.translate(clean, from, to);
    return res?.text || '';
  } catch {
    return '';
  }
}

/**
 * Fills the other-language field when it is still empty. `get` reads the latest form value at
 * the moment the translation returns, so a value the admin typed meanwhile is never overwritten.
 */
export async function fillIfEmpty(
  text: string,
  from: Lang,
  to: Lang,
  get: () => string,
  set: (value: string) => void,
): Promise<void> {
  if (!text.trim() || get().trim()) return;
  const out = await autoTranslate(text, from, to);
  if (out && !get().trim()) set(out);
}
