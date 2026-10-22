import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        teal: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
          950: '#042f2e',
        },
        clinic: {
          teal: '#0e4d58',
          'teal-dark': '#09363e',
          'teal-light': '#176b7b',
          mint: '#e6f7f3',
          'mint-dark': '#2bb49c',
          cream: '#faf9f5',
          gold: '#c29d59',
        },
        stomo: {
          bg: '#f3f8f7',
          surface: '#ffffff',
          'surface-soft': '#eaf5f2',
          'surface-hover': '#f0f7f5',
          text: '#152f34',
          'text-muted': '#52696e',
          primary: '#167b78',
          'primary-hover': '#116460',
          'primary-soft': '#e0f2ed',
          sidebar: '#12353b',
          'sidebar-active': '#245158',
          'sidebar-text': '#e8f3f2',
          'sidebar-muted': '#b2c9ca',
          border: '#d8e5e2',
          focus: '#147d88',
          danger: '#b42338',
        },
      },
      borderRadius: {
        control: '12px',
        card: '18px',
        panel: '24px',
      },
      boxShadow: {
        card: '0 4px 20px rgba(18, 53, 59, 0.05)',
        popover: '0 12px 36px rgba(18, 53, 59, 0.14)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      gridTemplateColumns: {
        '16': 'repeat(16, minmax(0, 1fr))',
      },
    },
  },
  plugins: [],
};
export default config;
