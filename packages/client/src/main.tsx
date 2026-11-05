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
//
// GELİŞTİRME (vite): kayıtlı TÜM service worker'lar ve TÜM önbellekler temizlenir.
// Aksi halde aynı kökende (localhost) kalmış eski/yabancı bir SW ya da önbellek
// bayat bir arayüz (hatta başka bir projenin ekranı) sunar ve sayfa her
// yenilendiğinde farklı görünür. Sayfa hâlâ bir SW tarafından denetleniyorsa
// bayat kabuktan kurtulmak için BİR KEZ sunucudan yeniden yüklenir.
if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    // Yeni sürüm devraldığında sayfayı bir kez tazele → en güncel arayüz.
    // (İlk kurulumda yenileme yapılmaz: sayfa önceden denetlenmiyorsa dokunmayız.)
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      window.location.reload();
    });

    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .catch(() => {});
    });
  } else {
    const temizle = async () => {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
      } catch {
        /* yoksay */
      }
    };

    void temizle();

    window.addEventListener('load', () => {
      void (async () => {
        await temizle();
        // Bayat kabuk hâlâ ekrandaysa: ağdan yeniden yükle. Eski (yabancı) SW
        // kaydı silinse bile bir sonraki gezinmeye kadar sayfayı denetlemeye devam
        // edebilir; bu yüzden en fazla 3 kez denenir (sonsuz döngü koruması).
        try {
          const deneme = Number(sessionStorage.getItem('oto_sw_reloaded') || '0');
          if (navigator.serviceWorker.controller && deneme < 3) {
            sessionStorage.setItem('oto_sw_reloaded', String(deneme + 1));
            window.location.reload();
          }
        } catch {
          /* yoksay */
        }
      })();
    });
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
