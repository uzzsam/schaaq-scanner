/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        schaaq: {
          bg: '#0d1117',
          card: '#151c2c',
          border: '#1e3a3a',
          'border-hover': '#2a5a5a',
          sidebar: '#0a0e17',
          input: '#1a2332',
          'input-border': '#2d3748',
        },
        navy: {
          50: '#f0f4f8',
          100: '#d9e2ec',
          200: '#bcccdc',
          300: '#9fb3c8',
          400: '#829ab1',
          500: '#627d98',
          600: '#486581',
          700: '#334e68',
          800: '#243b53',
          900: '#102a43',
          950: '#0a1929',
        },
        teal: {
          300: '#48d1b5',
          400: '#1abc9c',
          500: '#16a085',
          600: '#128a72',
          700: '#0e6e5b',
        },
      },
      fontFamily: {
        sans: [
          'Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont',
          'Segoe UI', 'Roboto', 'sans-serif',
        ],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
