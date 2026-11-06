import React from 'react';
import { TONE_CLASSES } from '../../lib/clinicFormat';

type Props = {
  map: Record<string, { uz: string; ru: string; tone: keyof typeof TONE_CLASSES }>;
  value: string;
  lang?: string;
  className?: string;
};

export function StatusBadge({ map, value, lang = 'uz', className = '' }: Props) {
  const meta = map[value] || { uz: value, ru: value, tone: 'neutral' as const };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${TONE_CLASSES[meta.tone]} ${className}`}
    >
      {lang === 'ru' ? meta.ru : meta.uz}
    </span>
  );
}
