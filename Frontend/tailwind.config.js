/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: '#0B0D0F',
        graphite: '#171A1D',
        smoky: '#F5F5F2',
        ivory: '#FAF9F6',
        sage: '#6F806A',
        forest: '#26382D',
        gold: '#C8A96B',
        brandSuccess: '#3F8F68',
        brandError: '#C75C5C',
        brandWarning: '#B8893D',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        heading: ['"Plus Jakarta Sans"', 'sans-serif'],
      },
      boxShadow: {
        premium: '0 10px 30px -10px rgba(0, 0, 0, 0.5)',
        goldGlow: '0 0 20px rgba(200, 169, 107, 0.2)',
      },
    },
  },
  plugins: [],
};
