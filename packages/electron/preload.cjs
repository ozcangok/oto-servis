'use strict';

/**
 * Electron ön-yüz köprüsü (contextIsolation: true).
 *
 * Ana süreçten gelen güvenli kapanış sinyalini sayfaya iki yoldan ulaştırır:
 *  1) `otoDesktop.onShutdown(cb)` köprüsü (masaüstü uygulaması),
 *  2) `oto:shutdown` DOM olayı (arayüz her ortamda aynı kodu dinler).
 */

const { contextBridge, ipcRenderer } = require('electron');

const SHUTDOWN_CHANNEL = 'app:shutdown-start';
const API_BASE_ARG = '--oto-api-base=';

/** Gömülü sunucunun adresi ana süreçten komut satırı argümanıyla gelir. */
function resolveApiBase() {
  const arg = process.argv.find((value) => value.startsWith(API_BASE_ARG));
  return arg ? arg.slice(API_BASE_ARG.length) : 'http://127.0.0.1:3001';
}

contextBridge.exposeInMainWorld('otoDesktop', {
  isElectron: true,
  apiBase: resolveApiBase(),
  onShutdown: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = () => {
      try {
        callback();
      } catch (err) {
        console.error('[PRELOAD] Kapanış geri çağrısı hatası:', err);
      }
    };
    ipcRenderer.on(SHUTDOWN_CHANNEL, listener);
    return () => ipcRenderer.removeListener(SHUTDOWN_CHANNEL, listener);
  }
});

// Arayüz tek bir dinleyici kullansın diye DOM olayı da yayınlanır.
ipcRenderer.on(SHUTDOWN_CHANNEL, () => {
  try {
    window.dispatchEvent(new CustomEvent('oto:shutdown'));
  } catch (err) {
    console.error('[PRELOAD] oto:shutdown olayı yayınlanamadı:', err);
  }
});
