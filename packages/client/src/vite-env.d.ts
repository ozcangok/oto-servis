/// <reference types="vite/client" />

/** Masaüstü (Electron) köprüsü — tarayıcıda tanımsızdır. */
interface OtoDesktopBridge {
  isElectron: boolean;
  /** Gömülü API sunucusunun mutlak adresi (file:// için gereklidir). */
  apiBase: string;
  /** Güvenli kapanış başladığında çağrılır; kaldırma fonksiyonu döner. */
  onShutdown: (callback: () => void) => (() => void) | void;
}

interface Window {
  otoDesktop?: OtoDesktopBridge;
  /** Test/ölçüm: hareketsizlik sınırını (ms) geçici olarak değiştirir. */
  __OTO_IDLE_MS?: number;
  /** Test/ölçüm: açılış ekranının zorunlu kilit süresini (ms) değiştirir. */
  __OTO_SPLASH_LOCK_MS?: number;
}
