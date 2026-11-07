import type { Config } from 'tailwindcss';

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const scale = (name: string) =>
  Object.fromEntries(SHADES.map((shade) => [shade, `rgb(var(--${name}-${shade}) / <alpha-value>)`]));

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // White-label palettes: values come from CSS variables generated per clinic
        // (src/lib/brandTheme.ts). `teal` is kept as an alias so existing classes follow the brand.
        brand: scale('brand'),
        teal: scale('brand'),
        secondary: scale('secondary'),
        accent: scale('accent'),
        // Brand-neutral base (text, borders, backgrounds) so any clinic color fits on top.
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          muted: 'rgb(var(--ink-muted) / <alpha-value>)',
          subtle: 'rgb(var(--ink-subtle) / <alpha-value>)',
        },
        line: {
          DEFAULT: 'rgb(var(--line) / <alpha-value>)',
          strong: 'rgb(var(--line-strong) / <alpha-value>)',
        },
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        clinic: {
          teal: 'rgb(var(--brand-800) / <alpha-value>)',
          'teal-dark': 'rgb(var(--brand-900) / <alpha-value>)',
          'teal-light': 'rgb(var(--brand-700) / <alpha-value>)',
          mint: 'rgb(var(--brand-50) / <alpha-value>)',
          'mint-dark': 'rgb(var(--secondary-600) / <alpha-value>)',
          cream: '#faf9f5',
          gold: '#c29d59',
        },
        stomo: {
          bg: 'rgb(var(--canvas) / <alpha-value>)',
          surface: '#ffffff',
          'surface-soft': 'rgb(var(--brand-50) / <alpha-value>)',
          'surface-hover': 'rgb(var(--brand-50) / <alpha-value>)',
          text: 'rgb(var(--ink) / <alpha-value>)',
          'text-muted': 'rgb(var(--ink-muted) / <alpha-value>)',
          primary: 'rgb(var(--brand-600) / <alpha-value>)',
          'primary-hover': 'rgb(var(--brand-700) / <alpha-value>)',
          'primary-soft': 'rgb(var(--brand-100) / <alpha-value>)',
          sidebar: 'rgb(var(--brand-950) / <alpha-value>)',
          'sidebar-active': 'rgb(var(--brand-800) / <alpha-value>)',
          'sidebar-text': '#f1f5f5',
          'sidebar-muted': 'rgb(var(--brand-200) / <alpha-value>)',
          border: 'rgb(var(--line) / <alpha-value>)',
          focus: 'rgb(var(--brand-600) / <alpha-value>)',
          danger: '#b42338',
        },
      },
      borderRadius: {
        control: '12px',
        card: '18px',
        panel: '24px',
      },
      boxShadow: {
        card: '0 1px 2px rgb(16 24 40 / 0.04), 0 4px 16px rgb(16 24 40 / 0.05)',
        soft: '0 1px 2px rgb(16 24 40 / 0.05)',
        popover: '0 12px 36px rgb(16 24 40 / 0.14)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
      },
      gridTemplateColumns: {
        '16': 'repeat(16, minmax(0, 1fr))',
      },
    },
  },
  plugins: [],
};
export default config;
