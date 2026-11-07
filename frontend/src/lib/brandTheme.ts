/**
 * Clinic white-label theme.
 *
 * Each clinic stores a primary, secondary and accent color (ClinicSettings). This module turns
 * them into full 50–950 palettes exposed as CSS variables of space-separated RGB channels, so
 * Tailwind classes such as `bg-brand-600/20` keep working with opacity modifiers.
 *
 * Accessibility: the primary 600 shade carries white text (buttons, active nav), so it is
 * darkened until it reaches WCAG AA contrast (4.5:1) against white, whatever color the owner
 * picks. Status colors (success / warning / danger) are deliberately NOT derived from the brand.
 */

export const DEFAULT_BRAND = {
  primaryColor: '#167B78',
  secondaryColor: '#2BB49C',
  accentColor: '#C29D59',
} as const;

export type BrandColors = {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
};

type RGB = [number, number, number];

const HEX_RE = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;

export function isValidHex(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value.trim());
}

export function normalizeHex(value: unknown, fallback: string): string {
  if (!isValidHex(value)) return fallback.toUpperCase();
  let hex = value.trim().replace('#', '');
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  return `#${hex.toUpperCase()}`;
}

export function hexToRgb(hex: string): RGB {
  const h = normalizeHex(hex, '#000000').slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function mix(a: RGB, b: RGB, amount: number): RGB {
  return [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * amount) as RGB;
}

function channel(v: number) {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(rgb: RGB): number {
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}

export function contrastRatio(a: string | RGB, b: string | RGB): number {
  const la = luminance(typeof a === 'string' ? hexToRgb(a) : a);
  const lb = luminance(typeof b === 'string' ? hexToRgb(b) : b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];
const INK: RGB = [15, 23, 32];

/** Darkens `base` (towards black) until white text on it meets `target` contrast. */
export function ensureContrastWithWhite(base: RGB, target = 4.5): RGB {
  let color = base;
  for (let step = 0; step < 40 && contrastRatio(color, WHITE) < target; step += 1) {
    color = mix(color, BLACK, 0.06);
  }
  return color;
}

export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type Shade = (typeof SHADES)[number];

/** Builds a palette where 600 is the (contrast-safe) brand color itself. */
export function buildPalette(hex: string, { safe600 = true } = {}): Record<Shade, RGB> {
  const raw = hexToRgb(hex);
  const base = safe600 ? ensureContrastWithWhite(raw) : raw;
  return {
    50: mix(base, WHITE, 0.94),
    100: mix(base, WHITE, 0.87),
    200: mix(base, WHITE, 0.74),
    300: mix(base, WHITE, 0.56),
    400: mix(base, WHITE, 0.32),
    500: mix(base, WHITE, 0.12),
    600: base,
    700: mix(base, BLACK, 0.16),
    800: mix(base, BLACK, 0.32),
    900: mix(base, BLACK, 0.48),
    950: mix(base, INK, 0.7),
  };
}

const triplet = (rgb: RGB) => rgb.map((v) => Math.round(v)).join(' ');

export function brandCssVariables(colors: BrandColors = {}): Record<string, string> {
  const primary = normalizeHex(colors.primaryColor, DEFAULT_BRAND.primaryColor);
  const secondary = normalizeHex(colors.secondaryColor, DEFAULT_BRAND.secondaryColor);
  const accent = normalizeHex(colors.accentColor, DEFAULT_BRAND.accentColor);

  const vars: Record<string, string> = {};
  const groups: Array<[string, Record<Shade, RGB>]> = [
    ['brand', buildPalette(primary)],
    ['secondary', buildPalette(secondary, { safe600: false })],
    ['accent', buildPalette(accent, { safe600: false })],
  ];
  for (const [name, palette] of groups) {
    for (const shade of SHADES) vars[`--${name}-${shade}`] = triplet(palette[shade]);
  }
  return vars;
}

/** CSS text for a <style> tag: applied on the server so the page never flashes default colors. */
export function brandCssText(colors: BrandColors = {}): string {
  const body = Object.entries(brandCssVariables(colors))
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
  return `:root{${body}}`;
}

/** Applies a theme at runtime (admin live preview / after saving settings). */
export function applyBrandToDocument(colors: BrandColors) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(brandCssVariables(colors))) root.style.setProperty(k, v);
}

export function describeContrast(hex: string) {
  const raw = hexToRgb(hex);
  const ratio = contrastRatio(raw, WHITE);
  const adjusted = rgbToHex(ensureContrastWithWhite(raw));
  return {
    ratio,
    passes: ratio >= 4.5,
    adjusted,
    wasAdjusted: adjusted !== normalizeHex(hex, hex),
  };
}

export const BRAND_PRESETS: Array<{ name: string; primary: string; secondary: string; accent: string }> = [
  { name: 'Teal', primary: '#167B78', secondary: '#2BB49C', accent: '#C29D59' },
  { name: 'Ocean', primary: '#1D5FD1', secondary: '#38BDF8', accent: '#F59E0B' },
  { name: 'Indigo', primary: '#4F46E5', secondary: '#A78BFA', accent: '#F472B6' },
  { name: 'Emerald', primary: '#047857', secondary: '#34D399', accent: '#FBBF24' },
  { name: 'Ruby', primary: '#B4233C', secondary: '#FB7185', accent: '#D4A373' },
  { name: 'Graphite', primary: '#334155', secondary: '#64748B', accent: '#0EA5E9' },
];
