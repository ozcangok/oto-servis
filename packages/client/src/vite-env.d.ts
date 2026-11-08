/// <reference types="vite/client" />

/** Otomatik güncelleme durumları (electron-updater → preload → React). */
type OtoUpdateState =
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'not-available'
  | 'cancelled'
  | 'installing'
  | 'error'
  | 'dev';

interface OtoUpdateStatus {
  state: OtoUpdateState;
  version?: string;
  percent?: number;
  bytesPerSecond?: number;
  transferred?: number;
  total?: number;
  message?: string;
  silent?: boolean;
  currentVersion?: string;
  at?: string;
}

interface OtoUpdateResult {
  ok: boolean;
  dev?: boolean;
  version?: string | null;
  error?: string;
  message?: string;
}

/** Dijital arşive kaydedilecek belge yükü. */
interface ArchivePayload {
  type: 'pdf' | 'work-order';
  fileName: string;
  /** PDF için base64 içerik. */
  contentBase64?: string;
  /** İş emri için JSON nesnesi. */
  json?: any;
  customerName?: string;
  plate?: string;
  date?: string;
}

interface ArchiveResult {
  ok: boolean;
  path?: string;
  type?: string;
  fileName?: string;
  error?: string;
}

/** Masaüstü (Electron) köprüsü — tarayıcıda tanımsızdır. */
interface OtoDesktopBridge {
  isElectron: boolean;
  /** Gömülü API sunucusunun mutlak adresi (file:// için gereklidir). */
  apiBase: string;
  /** Güvenli kapanış başladığında çağrılır; kaldırma fonksiyonu döner. */
  onShutdown: (callback: () => void) => (() => void) | void;

  /** Otomatik güncelleme köprüsü. */
  getAppVersion: () => Promise<string>;
  getUpdateStatus: () => Promise<OtoUpdateStatus | null>;
  checkForUpdates: () => Promise<OtoUpdateResult>;
  downloadUpdate: () => Promise<OtoUpdateResult>;
  installUpdate: () => Promise<OtoUpdateResult>;
  openReleasePage: () => Promise<OtoUpdateResult>;
  onUpdateStatus: (callback: (status: OtoUpdateStatus) => void) => (() => void) | void;

  /** Dijital arşiv köprüsü. */
  archiveSave: (payload: ArchivePayload) => Promise<ArchiveResult>;
}

interface Window {
  otoDesktop?: OtoDesktopBridge;
  /** Test/ölçüm: hareketsizlik sınırını (ms) geçici olarak değiştirir. */
  __OTO_IDLE_MS?: number;
  /** Test/ölçüm: açılış ekranının zorunlu kilit süresini (ms) değiştirir. */
  __OTO_SPLASH_LOCK_MS?: number;
}
