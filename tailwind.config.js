/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './components/**/*.{ts,tsx}',
    './contexts/**/*.{ts,tsx}',
    './config/**/*.{ts,tsx}',
    './constants/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
  ],
  theme: {
    /*
      Redéclaré en entier, et non via `extend` : Tailwind range les écrans ajoutés
      par `extend` à la FIN de la liste, quelle que soit leur valeur. Un `tab:`
      déclaré ainsi serait émis après `xl:` et l'emporterait dans la cascade sur
      les grands écrans. Les valeurs par défaut sont donc recopiées telles quelles,
      ce qui préserve à l'identique les `sm:`/`md:`/`lg:` déjà écrits partout.

      `tab` vaut 720px et non 768px (le `md` par défaut) parce que l'iPad mini en
      portrait fait 744px : il tombe dans la bande `sm` et resterait au rendu
      téléphone. 720 passe au-dessus de la plus large fenêtre Split View (694px),
      qui doit elle rester en rendu téléphone.
    */
    screens: {
      sm: '640px',
      tab: '720px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        cream: '#FDFCF8',
        sand: '#F2EFE9',
        charcoal: '#1A1A1A',
        forest: '#3E5238',
        burnt: '#D97706',
        'bitter-lime': '#D9FF00',
      },
      fontFamily: {
        sans: ['"Inter"', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2.5rem',
        '5xl': '3.5rem',
      },
      boxShadow: {
        soft: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
      },
    },
  },
  plugins: [],
};
