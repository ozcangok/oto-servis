import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
// Tipografi: IBM Plex Sans (gövde) + IBM Plex Sans Condensed (yalnızca plaka).
// Kendi barındırılan (self-host) fontlar; Türkçe karakterler için latin-ext dahil.
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/ibm-plex-sans-condensed/600.css';
import '@fontsource/ibm-plex-sans-condensed/700.css';
import './styles/index.css';

// Service Worker yalnızca üretim derlemesinde (PROD) kaydedilir.
// Geliştirme modunda (vite) başıboş kalmış eski SW'ler temizlenir,
// yoksa bayat arayüz sunup API isteklerini keserler.
if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  } else {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister().catch(() => {}));
    }).catch(() => {});
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
