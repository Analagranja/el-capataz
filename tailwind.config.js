/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        capataz: {
          forest: '#14532d',
          'forest-deep': '#0f2418',
          'forest-light': '#1a4d2e',
          mint: '#a7f3d0',
          'mint-soft': '#d1fae5',
          leaf: '#22c55e',
          'leaf-bright': '#4ade80',
        },
      },
    },
  },
  plugins: [],
};
