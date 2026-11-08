/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Microsoft YaHei', 'PingFang SC', 'system-ui', 'sans-serif'],
        display: ['Rajdhani', 'Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        dv: {
          bg:     'var(--dv-bg)',
          deep:   'var(--dv-bg-deep)',
          accent: 'var(--dv-accent)',
        },
        navy: {
          50:  '#eef2ff',
          100: '#dbe4ff',
          200: '#b8c9ff',
          300: '#8ba5ff',
          400: '#5c7bf5',
          500: '#3b5fe8',
          600: '#2b44c9',
          700: '#2436a3',
          800: '#1e2d82',
          900: '#0f1f3a',
          950: '#0a1628',
        },
      },
      borderRadius: {
        dv: 'var(--dv-radius)',
      },
      animation: {
        'fade-in': 'dv-fade-in 0.4s ease-out both',
        'slide-up': 'dv-slide-up 0.5s ease-out both',
        'pulse-dot': 'dv-pulse-dot 2s ease-in-out infinite',
        'shimmer': 'dv-shimmer 2s linear infinite',
      },
    },
  },
  plugins: [],
}
