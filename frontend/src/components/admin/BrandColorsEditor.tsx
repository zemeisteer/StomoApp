'use client';

import React from 'react';
import { Palette, CheckCircle2, AlertTriangle, RotateCcw } from 'lucide-react';
import { BRAND_PRESETS, DEFAULT_BRAND, describeContrast, isValidHex, normalizeHex } from '../../lib/brandTheme';

export type BrandColorValues = {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
};

type Props = {
  value: BrandColorValues;
  onChange: (next: BrandColorValues) => void;
  isRu?: boolean;
};

const FIELDS: Array<{ key: keyof BrandColorValues; uz: string; ru: string; hintUz: string; hintRu: string }> = [
  {
    key: 'primaryColor',
    uz: 'Asosiy rang',
    ru: 'Основной цвет',
    hintUz: 'Tugmalar, havolalar, faol menyu',
    hintRu: 'Кнопки, ссылки, активное меню',
  },
  {
    key: 'secondaryColor',
    uz: 'Ikkinchi rang',
    ru: 'Дополнительный цвет',
    hintUz: 'Gradiyentlar, belgilar',
    hintRu: 'Градиенты, значки',
  },
  {
    key: 'accentColor',
    uz: 'Urg‘u rangi',
    ru: 'Акцентный цвет',
    hintUz: 'Kichik urg‘ular, reyting',
    hintRu: 'Мелкие акценты, рейтинг',
  },
];

function ColorField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);

  return (
    <label className="block rounded-2xl border border-line bg-white p-3 hover:border-line-strong transition-colors">
      <span className="block text-xs font-semibold text-ink">{label}</span>
      <span className="block text-[11px] text-ink-subtle mb-2">{hint}</span>
      <span className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-line bg-white p-0.5"
          aria-label={label}
        />
        <input
          type="text"
          value={draft}
          maxLength={7}
          spellCheck={false}
          onChange={(e) => {
            const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
            setDraft(v);
            if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v.toUpperCase());
          }}
          onBlur={() => setDraft(value)}
          className="w-full rounded-xl border border-line px-3 py-2 font-mono text-xs uppercase text-ink focus:ring-2 focus:ring-brand-600"
        />
      </span>
    </label>
  );
}

export function BrandColorsEditor({ value, onChange, isRu }: Props) {
  const primary = isValidHex(value.primaryColor) ? normalizeHex(value.primaryColor, DEFAULT_BRAND.primaryColor) : DEFAULT_BRAND.primaryColor;
  const contrast = describeContrast(primary);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
            <Palette className="h-4 w-4 text-brand-600" />
            {isRu ? 'Цвета бренда' : 'Brend ranglari'}
          </h3>
          <p className="text-xs text-ink-muted">
            {isRu
              ? 'Применяются к сайту и панели. Изменения видны сразу, сохраняются кнопкой «Сохранить».'
              : 'Sayt va panelga qo‘llanadi. O‘zgarish darhol ko‘rinadi, «Saqlash» tugmasi bilan saqlanadi.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChange({ ...DEFAULT_BRAND })}
          className="inline-flex items-center gap-1.5 self-start rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-ink-muted hover:bg-canvas hover:text-ink"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {isRu ? 'По умолчанию' : 'Standart'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2" role="list" aria-label={isRu ? 'Готовые темы' : 'Tayyor mavzular'}>
        {BRAND_PRESETS.map((p) => {
          const active = p.primary.toUpperCase() === primary;
          return (
            <button
              key={p.name}
              type="button"
              role="listitem"
              onClick={() => onChange({ primaryColor: p.primary, secondaryColor: p.secondary, accentColor: p.accent })}
              className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-[11px] font-semibold transition-colors ${
                active ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-line bg-white text-ink-muted hover:border-line-strong'
              }`}
            >
              <span className="flex -space-x-1">
                {[p.primary, p.secondary, p.accent].map((c) => (
                  <span key={c} className="h-5 w-5 rounded-full border-2 border-white" style={{ backgroundColor: c }} />
                ))}
              </span>
              {p.name}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {FIELDS.map((f) => (
          <ColorField
            key={f.key}
            label={isRu ? f.ru : f.uz}
            hint={isRu ? f.hintRu : f.hintUz}
            value={value[f.key]}
            onChange={(v) => onChange({ ...value, [f.key]: v })}
          />
        ))}
      </div>

      <div
        className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs ${
          contrast.passes ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'
        }`}
      >
        {contrast.passes ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
        <span>
          {contrast.passes
            ? isRu
              ? `Контраст с белым текстом ${contrast.ratio.toFixed(1)}:1 — хорошо читается (WCAG AA).`
              : `Oq matn bilan kontrast ${contrast.ratio.toFixed(1)}:1 — yaxshi o‘qiladi (WCAG AA).`
            : isRu
              ? `Цвет слишком светлый для белого текста (${contrast.ratio.toFixed(1)}:1). Для кнопок автоматически используется более тёмный оттенок ${contrast.adjusted}.`
              : `Rang oq matn uchun juda och (${contrast.ratio.toFixed(1)}:1). Tugmalar uchun avtomatik to‘qroq ${contrast.adjusted} tusi ishlatiladi.`}
        </span>
      </div>

      {/* Live preview built from the same tokens the site uses */}
      <div className="grid grid-cols-1 gap-3 rounded-2xl border border-line bg-canvas p-3 sm:grid-cols-[180px_1fr]">
        <div className="rounded-xl bg-brand-950 p-3 text-white">
          <div className="mb-3 h-2 w-16 rounded bg-white/30" />
          {['Dashboard', isRu ? 'Календарь' : 'Kalendar', isRu ? 'Пациенты' : 'Bemorlar'].map((item, i) => (
            <div
              key={item}
              className={`mb-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium ${i === 0 ? 'bg-brand-600 text-white' : 'text-white/70'}`}
            >
              {item}
            </div>
          ))}
        </div>
        <div className="space-y-3 rounded-xl bg-white p-4 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-ink">{isRu ? 'Запись на приём' : 'Qabulga yozilish'}</span>
            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-800">
              {isRu ? 'Новая' : 'Yangi'}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-brand-50">
            <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-brand-600 to-secondary-500" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-xl bg-brand-600 px-3 py-2 text-xs font-semibold text-white">
              {isRu ? 'Записаться' : 'Yozilish'}
            </span>
            <span className="rounded-xl border border-brand-200 px-3 py-2 text-xs font-semibold text-brand-700">
              {isRu ? 'Подробнее' : 'Batafsil'}
            </span>
            <span className="text-xs font-semibold text-accent-700">★ 4.9</span>
          </div>
        </div>
      </div>
    </div>
  );
}
