/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Mevcut özel CSS tasarım sistemini bozmamak için Tailwind preflight kapalı.
  // Yalnızca yardımcı sınıflar (utilities) üretilir; Panel kendi kapsamlı
  // sıfırlamasını styles/panel.css içinde yapar.
  corePlugins: {
    preflight: false
  },
  theme: {
    extend: {
      fontFamily: {
        panel: ['Inter', 'IBM Plex Sans', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};
