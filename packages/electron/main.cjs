'use strict';

/**
 * Oto Servis — Electron (masaüstü) ana süreç.
 *
 * Sorumluluklar:
 *  - Gömülü API sunucusunu başlatmak (kendi veri klasörüyle),
 *  - Arayüzü yüklemek,
 *  - ZORUNLU YEDEKLEME VE GÜVENLİ KAPANIŞ: pencere kapatılmadan önce
 *    (`e.preventDefault()`) veda ekranını göstermek, SQLite veritabanını
 *    Belgelerim/CinarOto_Yedekler klasörüne zaman damgasıyla kopyalamak ve
 *    en az 10 saniye sonra uygulamayı kapatmak (`app.quit()`).
 */

const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { fork, spawn } = require('child_process');
const http = require('http');
const { createDatabaseBackup, backupStamp } = require('./backup.cjs');
const { saveToArchive } = require('./archive.cjs');

// Geliştirme ve paketlenmiş sürüm AYNI veri klasörünü kullansın diye ad
// burada sabitlenir (electron-builder `productName` ile birebir aynı).
app.setName('Oto Servis Yonetimi');

const SERVER_PORT = parseInt(process.env.OTO_SERVER_PORT || '3001', 10);
/** Veda ekranının ZORUNLU ekranda kalma süresi (ms). */
const SHUTDOWN_MIN_MS = 10_000;
/** Gömülü sunucunun kapanmasını bekleme sınırı (ms). */
const SERVER_STOP_TIMEOUT_MS = 5_000;

/** Kurumsal logo (pdfExport.ts ile aynı kaynağa bağlanır: public/logo.png). */
const LOGO_PATH = path.join(__dirname, '../../client/public/logo.png');

/**
 * Yerel duman testi (smoke test) — YALNIZCA geliştirme/doğrulama içindir:
 * pencere görünmeden açılır, bir süre sonra X tuşuna basılmış gibi kapatılır ve
 * kapanış akışının gerçekten çalıştığı (veda ekranı + yedek) konsola yazılır.
 * Üretimde bu bayrak verilmez; davranış hiç değişmez.
 */
const SMOKE_TEST = process.env.OTO_SMOKE_TEST === '1';
const SMOKE_CLOSE_MS = parseInt(process.env.OTO_SMOKE_CLOSE_MS || '6000', 10);

let mainWindow = null;
let serverProcess = null;
let isShuttingDown = false;

// ---------------------------------------------------------------------------
// Otomatik güncelleme (electron-updater / GitHub Releases)
// ---------------------------------------------------------------------------
/** Açılıştan kaç ms sonra sessiz güncelleme kontrolü yapılır. */
const UPDATE_INITIAL_DELAY_MS = 10_000;
/** Uygulama açık kaldığı sürece kaç ms'de bir sessiz kontrol yapılır (4 saat). */
const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
/** macOS imzasız sürümde kullanılan manuel indirme sayfası. */
const RELEASES_URL = 'https://github.com/ozcangok/oto-servis/releases/latest';

let autoUpdater = null;
let updateDownloaded = false;
let lastUpdateStatus = null;
let updateCheckTimer = null;
let isInstallingUpdate = false;
let lastCheckWasSilent = true;
let updaterInitialized = false;

function getDataDir() {
  return path.join(app.getPath('userData'), 'data');
}

/**
 * Gömülü sunucunun ÇALIŞMA DİZİNİ.
 *
 * Sunucu, `process.cwd()`e göre iki yol çözer: yüklenen dosyalar (`uploads/`) ve
 * (varsa) derlenmiş arayüz. Paketlenmiş uygulamada süreç dizini tahmin edilemez
 * olduğundan burayı açıkça kullanıcı veri klasörüne sabitliyoruz; böylece
 * yüklenen dosyalar kullanıcıya ait kalıcı bir konumda tutulur.
 */
function getServerCwd() {
  return app.getPath('userData');
}

// ---------------------------------------------------------------------------
// Otomatik güncelleme yardımcıları
// ---------------------------------------------------------------------------

/**
 * electron-updater'ı tembel yükler. Geliştirme ortamında modül yoksa uygulama
 * yine de açılır; yalnızca güncelleme özelliği devre dışı kalır.
 */
function getAutoUpdater() {
  if (autoUpdater) return autoUpdater;
  try {
    autoUpdater = require('electron-updater').autoUpdater;
    return autoUpdater;
  } catch (err) {
    console.error('[UPDATE] electron-updater yüklenemedi:', err);
    return null;
  }
}

/** Güncelleme durumunu arayüze ve son durum belleğine yazar. */
function sendUpdateStatus(status) {
  const payload = {
    ...status,
    currentVersion: app.getVersion(),
    at: new Date().toISOString()
  };
  lastUpdateStatus = payload;

  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:status', payload);
    }
  } catch (err) {
    console.error('[UPDATE] Durum arayüze iletilemedi:', err);
  }
  return payload;
}

/**
 * GitHub Releases üzerinden güncelleme kontrolü.
 * `silent=true` iken hata/güncel durumu arayüzde rahatsız etmez.
 */
async function checkForUpdatesNow(silent = false) {
  lastCheckWasSilent = silent;
  const updater = getAutoUpdater();
  if (!updater) {
    const message = 'Güncelleme modülü yüklü değil.';
    if (!silent) sendUpdateStatus({ state: 'error', message, silent });
    return { ok: false, error: message };
  }

  // electron-updater paketlenmiş uygulama bekler. Geliştirme sırasında
  // OTO_FORCE_UPDATE=1 ile (dev-app-update.yml varsa) denenebilir.
  if (!app.isPackaged && process.env.OTO_FORCE_UPDATE !== '1') {
    const message = 'Geliştirme sürümünde otomatik güncelleme kapalı.';
    if (!silent) sendUpdateStatus({ state: 'dev', message, silent });
    return { ok: false, dev: true, message };
  }

  try {
    sendUpdateStatus({ state: 'checking', silent });
    const result = await updater.checkForUpdates();
    return { ok: true, version: result?.updateInfo?.version || null };
  } catch (err) {
    const message = String((err && err.message) || err);
    console.error('[UPDATE] Kontrol hatası:', err);
    sendUpdateStatus({ state: 'error', message, silent });
    return { ok: false, error: message };
  }
}

/**
 * İndirilen güncellemeyi kurar.
 *
 * Normal kapanış akışından farkı: gömülü sunucu durdurulur, veritabanı
 * yedeklenir ve `autoUpdater.quitAndInstall()` çağrılır. `isShuttingDown`
 * önceden true yapıldığı için `before-quit` normal 10 saniyelik veda akışını
 * tekrar başlatmaz.
 */
async function installUpdate() {
  const updater = getAutoUpdater();
  if (!updater) return { ok: false, error: 'Güncelleme modülü yüklü değil.' };
  if (!updateDownloaded) return { ok: false, error: 'Güncelleme henüz indirilmedi.' };
  if (isInstallingUpdate) return { ok: true };

  isInstallingUpdate = true;
  isShuttingDown = true;
  sendUpdateStatus({ state: 'installing' });

  try {
    await stopEmbeddedServer();

    try {
      const result = createDatabaseBackup({
        dataDir: getDataDir(),
        documentsDir: app.getPath('documents'),
        now: new Date()
      });
      if (result.ok) {
        console.log(`[UPDATE] Güncelleme öncesi yedek alındı → ${result.main}`);
      } else {
        console.warn(`[UPDATE] Güncelleme öncesi yedek alınamadı (${result.reason}): ${result.source}`);
      }
    } catch (err) {
      console.error('[UPDATE] Güncelleme öncesi yedekleme hatası:', err);
    }

    // Arayüzün "Güncelleme yükleniyor" ekranını çizmesi için kısa nefes.
    await new Promise((resolve) => setTimeout(resolve, 900));

    // Sessiz kurulum + yeniden başlat.
    updater.quitAndInstall(true, true);
    return { ok: true };
  } catch (err) {
    const message = String((err && err.message) || err);
    console.error('[UPDATE] Kurulum hatası:', err);
    isInstallingUpdate = false;
    isShuttingDown = false;
    sendUpdateStatus({ state: 'error', message });

    // Sunucu durdurulduysa arayüzün çalışmaya devam edebilmesi için tekrar başlat.
    try {
      startEmbeddedServer();
    } catch (restartErr) {
      console.error('[UPDATE] Sunucu yeniden başlatılamadı:', restartErr);
    }
    return { ok: false, error: message };
  }
}

/** electron-updater olaylarını bağlar ve periyodik sessiz kontrolü kurar. */
function setupAutoUpdater() {
  if (updaterInitialized) return;
  updaterInitialized = true;

  const updater = getAutoUpdater();
  if (!updater) return;

  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.allowPrerelease = false;
  updater.logger = {
    info: (...args) => console.log('[UPDATE]', ...args),
    warn: (...args) => console.warn('[UPDATE]', ...args),
    error: (...args) => console.error('[UPDATE]', ...args),
    debug: (...args) => console.log('[UPDATE]', ...args)
  };

  updater.on('checking-for-update', () => {
    sendUpdateStatus({ state: 'checking', silent: lastCheckWasSilent });
  });
  updater.on('update-available', (info) => {
    sendUpdateStatus({ state: 'available', version: info?.version, silent: lastCheckWasSilent });
  });
  updater.on('update-not-available', (info) => {
    sendUpdateStatus({ state: 'not-available', version: info?.version, silent: lastCheckWasSilent });
  });
  updater.on('download-progress', (progress) => {
    sendUpdateStatus({
      state: 'downloading',
      percent: Math.max(0, Math.min(100, Math.round(Number(progress?.percent) || 0))),
      bytesPerSecond: progress?.bytesPerSecond,
      transferred: progress?.transferred,
      total: progress?.total
    });
  });
  updater.on('update-downloaded', (info) => {
    updateDownloaded = true;
    sendUpdateStatus({ state: 'downloaded', version: info?.version });
    // Menüde "Güncelle ve Yeniden Başlat" öğesi görünsün.
    buildApplicationMenu();
  });
  updater.on('update-cancelled', (info) => {
    sendUpdateStatus({ state: 'cancelled', version: info?.version });
  });
  updater.on('error', (err) => {
    console.error('[UPDATE] Hata:', err);
    // Kurulum sırasında oluşan hata (örn. macOS imzasız sürüm): sunucuyu
    // yeniden başlatıp arayüzün normal çalışmasına dönmesini sağla.
    if (isInstallingUpdate) {
      isInstallingUpdate = false;
      isShuttingDown = false;
      try {
        startEmbeddedServer();
      } catch (restartErr) {
        console.error('[UPDATE] Sunucu yeniden başlatılamadı:', restartErr);
      }
    }
    sendUpdateStatus({
      state: 'error',
      message: String((err && err.message) || err),
      silent: lastCheckWasSilent
    });
  });

  if (app.isPackaged && !SMOKE_TEST) {
    setTimeout(() => {
      void checkForUpdatesNow(true);
    }, UPDATE_INITIAL_DELAY_MS);

    updateCheckTimer = setInterval(() => {
      void checkForUpdatesNow(true);
    }, UPDATE_CHECK_INTERVAL_MS);
    if (updateCheckTimer.unref) updateCheckTimer.unref();
  }
}

/** SQLite metin değeri için güvenli tırnaklama. */
function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Veritabanını kullanıcının seçtiği konuma TEK DOSYA olarak dışa aktarır.
 *
 * `VACUUM INTO` kullanılır: gömülü sunucu çalışırken bile TUTARLI (WAL dahil)
 * bir anlık görüntü üretir; böylece dışa aktarılan `.sqlite` dosyası eksiksizdir.
 *
 * Not: `better-sqlite3` yerel (native) modülü yalnızca paketlenmiş uygulamada
 * Electron ABI'siyle derlendiği için tembel (lazy) yüklenir.
 */
async function exportDatabase() {
  const dbPath = path.join(getDataDir(), 'oto-servis.sqlite');
  if (!fs.existsSync(dbPath)) {
    dialog.showErrorBox('Veritabanı bulunamadı', `Veritabanı dosyası bulunamadı:\n${dbPath}`);
    return;
  }

  const stamp = backupStamp(new Date());
  const chosen = await dialog.showSaveDialog(mainWindow, {
    title: 'Veritabanını Dışa Aktar',
    defaultPath: path.join(app.getPath('documents'), `oto-servis-${stamp}.sqlite`),
    filters: [{ name: 'SQLite Veritabanı', extensions: ['sqlite'] }]
  });
  if (chosen.canceled || !chosen.filePath) return;

  const target = chosen.filePath;
  try {
    if (fs.existsSync(target)) fs.unlinkSync(target);

    const Database = require('better-sqlite3');
    const db = new Database(dbPath);
    try {
      db.exec(`VACUUM INTO ${sqlString(target)}`);
    } finally {
      db.close();
    }

    await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Dışa Aktarma Tamamlandı',
      message: 'Veritabanı başarıyla dışa aktarıldı.',
      detail: target,
      buttons: ['Tamam']
    });
  } catch (err) {
    dialog.showErrorBox(
      'Dışa Aktarma Hatası',
      `Veritabanı dışa aktarılamadı:\n${String((err && err.message) || err)}`
    );
  }
}

/** Uygulama menüsü — "Veritabanını Dışa Aktar…" buradan erişilir. */
function buildApplicationMenu() {
  const isMac = process.platform === 'darwin';
  const exportItem = {
    label: 'Veritabanını Dışa Aktar…',
    accelerator: 'CommandOrControl+Shift+E',
    click: () => {
      void exportDatabase();
    }
  };

  const updateItem = {
    label: 'Güncellemeleri Kontrol Et…',
    click: async () => {
      const result = await checkForUpdatesNow(false);
      if (result.dev) {
        await dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'Güncelleme',
          message: 'Geliştirme sürümü',
          detail: 'Otomatik güncelleme yalnızca paketlenmiş masaüstü uygulamasında çalışır.',
          buttons: ['Tamam']
        });
      } else if (result.error) {
        await dialog.showMessageBox(mainWindow, {
          type: 'error',
          title: 'Güncelleme Hatası',
          message: 'Güncelleme kontrol edilemedi.',
          detail: result.error,
          buttons: ['Tamam']
        });
      }
    }
  };

  const installItem = updateDownloaded
    ? {
        label: 'Güncelle ve Yeniden Başlat',
        click: () => {
          void installUpdate();
        }
      }
    : null;

  const template = [];

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about', label: 'Hakkında' },
        { type: 'separator' },
        exportItem,
        updateItem,
        ...(installItem ? [installItem] : []),
        { type: 'separator' },
        { role: 'hide', label: 'Gizle' },
        { role: 'hideOthers', label: 'Diğerlerini Gizle' },
        { role: 'unhide', label: 'Tümünü Göster' },
        { type: 'separator' },
        { role: 'quit', label: 'Çıkış' }
      ]
    });
  } else {
    template.push({
      label: 'Dosya',
      submenu: [
        exportItem,
        updateItem,
        ...(installItem ? [installItem] : []),
        { type: 'separator' },
        { role: 'quit', label: 'Çıkış' }
      ]
    });
  }

  template.push(
    {
      label: 'Düzen',
      submenu: [
        { role: 'undo', label: 'Geri Al' },
        { role: 'redo', label: 'Yinele' },
        { type: 'separator' },
        { role: 'cut', label: 'Kes' },
        { role: 'copy', label: 'Kopyala' },
        { role: 'paste', label: 'Yapıştır' },
        { role: 'selectAll', label: 'Tümünü Seç' }
      ]
    },
    {
      label: 'Görünüm',
      submenu: [
        { role: 'reload', label: 'Yenile' },
        { role: 'forceReload', label: 'Zorla Yenile' },
        { role: 'toggleDevTools', label: 'Geliştirici Araçları' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Normal Boyut' },
        { role: 'zoomIn', label: 'Yakınlaştır' },
        { role: 'zoomOut', label: 'Uzaklaştır' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Tam Ekran' }
      ]
    },
    {
      label: 'Pencere',
      submenu: [
        { role: 'minimize', label: 'Küçült' },
        { role: 'close', label: 'Kapat' }
      ]
    }
  );

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function startEmbeddedServer() {
  const serverPath = path.join(__dirname, '../server/dist/index.js');
  const env = {
    ...process.env,
    PORT: SERVER_PORT.toString(),
    HOST: '0.0.0.0', // Allow LAN sharing
    DATA_DIR: getDataDir(),
    BACKUP_DIR: path.join(app.getPath('userData'), 'backups')
  };

  // `fork()` Electron altında sunucuyu ELECTRON'un Node'u ile çalıştırır
  // (ELECTRON_RUN_AS_NODE=1). Bu, better-sqlite3 gibi YEREL (native) modüllerin
  // Electron ABI'siyle derlenmiş olmasını gerektirir — paketlenmiş uygulamada
  // electron-builder bunu kendisi yapar.
  //
  // Geliştirme/deneme (OTO_USE_DIST=1) sırasında ise depodaki yerel modüller
  // sistem Node'u ile derlidir; bu yüzden sunucu SİSTEM Node'uyla başlatılır.
  // Böylece masaüstü denemesi ile birim/E2E testleri aynı ikiliyi kullanır.
  const useElectronNode = app.isPackaged || process.env.OTO_SERVER_WITH_ELECTRON_NODE === '1';

  if (useElectronNode) {
    console.log('[ELECTRON] Gömülü sunucu (Electron Node) başlatılıyor:', serverPath);
    serverProcess = fork(serverPath, [], { env, cwd: getServerCwd() });
  } else {
    const nodeBin = process.env.OTO_NODE_BIN || 'node';
    console.log(`[ELECTRON] Gömülü sunucu (${nodeBin}) başlatılıyor:`, serverPath);
    try {
      serverProcess = spawn(nodeBin, [serverPath], {
        env,
        cwd: getServerCwd(),
        stdio: ['ignore', 'inherit', 'inherit', 'ipc']
      });
    } catch (err) {
      console.error('[ELECTRON] Sistem Node başlatılamadı, Electron Node deneniyor:', err);
      serverProcess = fork(serverPath, [], { env, cwd: getServerCwd() });
    }
  }

  serverProcess.on('error', (err) => {
    console.error('[ELECTRON] Sunucu hatası:', err);
    // Sistem Node bulunamadıysa Electron Node'una düş (paketlenmiş davranış).
    if (!useElectronNode && err && err.code === 'ENOENT') {
      console.warn('[ELECTRON] Sistem Node bulunamadı; Electron Node ile yeniden deneniyor.');
      serverProcess = fork(serverPath, [], { env, cwd: getServerCwd() });
      serverProcess.on('error', (e2) => console.error('[ELECTRON] Sunucu hatası:', e2));
    }
  });
}

/** Gömülü sunucuyu nazikçe kapatır (SQLite WAL düzgün checkpoint edilir). */
function stopEmbeddedServer() {
  return new Promise((resolve) => {
    if (!serverProcess || serverProcess.killed || serverProcess.exitCode !== null) {
      resolve();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    serverProcess.once('exit', finish);
    try {
      serverProcess.kill('SIGTERM');
    } catch (err) {
      console.error('[ELECTRON] Sunucu durdurulamadı:', err);
      finish();
      return;
    }

    setTimeout(() => {
      try {
        if (!settled && serverProcess && !serverProcess.killed) serverProcess.kill('SIGKILL');
      } catch {}
      finish();
    }, SERVER_STOP_TIMEOUT_MS);
  });
}

/**
 * Zorunlu yedekleme + güvenli kapanış akışı.
 * Hem pencere kapatma (X) hem de uygulamadan çıkma (Cmd+Q) için geçerlidir.
 */
async function beginGracefulShutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  const startedAt = Date.now();

  // 1) Veda + yedekleme ekranını arayüze bildir
  try {
    mainWindow?.webContents.send('app:shutdown-start');
  } catch (err) {
    console.error('[ELECTRON] Kapanış ekranı bildirilemedi:', err);
  }

  // 2) Sunucuyu durdur, ardından veritabanını yedekle
  try {
    await stopEmbeddedServer();
    const result = createDatabaseBackup({
      dataDir: getDataDir(),
      documentsDir: app.getPath('documents'),
      now: new Date()
    });
    if (result.ok) {
      console.log(`[ELECTRON] Yedek alındı → ${result.main}`);
    } else {
      console.warn(`[ELECTRON] Yedek alınamadı (${result.reason}): ${result.source}`);
    }
  } catch (err) {
    console.error('[ELECTRON] Yedekleme hatası:', err);
  }

  // 3) Veda ekranı EN AZ 10 saniye ekranda kalır, sonra güvenle kapan
  const remaining = Math.max(0, SHUTDOWN_MIN_MS - (Date.now() - startedAt));
  setTimeout(() => {
    console.log('[ELECTRON] Güvenli kapanış tamamlandı.');
    app.quit();
  }, remaining);
}

function createWindow() {
  const webPreferences = {
    nodeIntegration: false,
    contextIsolation: true,
    preload: path.join(__dirname, 'preload.cjs'),
    // file:// altında göreli API yolları çalışmadığı için gömülü sunucunun
    // mutlak adresi arayüze aktarılır. IPv4 (127.0.0.1) sabitlenir: gömülü
    // sunucu IPv4 dinler, oysa "localhost" bazı sistemlerde IPv6 (::1) çözülür.
    additionalArguments: [`--oto-api-base=http://127.0.0.1:${SERVER_PORT}`]
  };
  // Duman testinde pencere görünmez; arka plan kısıtlaması kapatılır ki arayüz
  // gerçek kullanıcıdaki gibi çizilsin.
  if (SMOKE_TEST) webPreferences.backgroundThrottling = false;

  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 400,
    minHeight: 600,
    title: 'Oto Servis Yönetim Sistemi',
    show: !SMOKE_TEST,
    icon: LOGO_PATH,
    webPreferences,
    autoHideMenuBar: false
  });

  const clientDist = path.join(__dirname, '../client/dist/index.html');

  // Load client
  // - Paketlenmiş uygulama: derlenmiş arayüz (file://)
  // - `OTO_USE_DIST=1`: paketleme yapmadan üretim çıktısıyla masaüstü denemesi
  // - Aksi halde: Vite dev sunucusu (hot reload)
  if (app.isPackaged || process.env.OTO_USE_DIST === '1') {
    mainWindow.loadFile(clientDist);
  } else {
    // Geliştirme: arayüz Vite dev sunucusunda çalışır (varsayılan 5173).
    const devClientUrl = process.env.CLIENT_DEV_URL || `http://localhost:${process.env.CLIENT_PORT || '5173'}`;
    mainWindow.loadURL(devClientUrl);
  }

  // X (kapat) tuşu: ANİDEN KAPANMA YOK — önce veda + yedekleme ekranı.
  mainWindow.on('close', (event) => {
    if (isShuttingDown) return; // gerçek kapanışa izin ver
    event.preventDefault();
    beginGracefulShutdown();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (SMOKE_TEST) runSmokeTest();
}

/**
 * Duman testi: arayüz yüklendikten sonra X tuşu simüle edilir ve kapanış
 * akışı gözlemlenir. Ekran görüntüsü alınamayan ortamlarda masaüstü
 * davranışını (veda ekranı render'ı + yedek + temiz çıkış) uçtan uca doğrular.
 */
function runSmokeTest() {
  console.log('[SMOKE] Pencere gizli açıldı (OTO_SMOKE_TEST=1).');
  mainWindow.webContents.once('did-finish-load', () => {
    console.log('[SMOKE] Arayüz yüklendi.');
    setTimeout(async () => {
      // 1) Gömülü sunucu ayakta mı? (yerel modüller/DB yolu doğru mu?)
      //    Not: global `fetch` Node 18+ ile geldi; Electron 22 (Node 16, Windows 7
      //    destekli son sürüm) altında bulunmadığı için `http` kullanılır.
      try {
        const status = await new Promise((resolve, reject) => {
          const req = http.get(
            { host: '127.0.0.1', port: SERVER_PORT, path: '/api/health', timeout: 5000 },
            (res) => {
              res.resume();
              resolve(res.statusCode);
            }
          );
          req.on('timeout', () => req.destroy(new Error('zaman aşımı')));
          req.on('error', reject);
        });
        console.log(`[SMOKE] Gömülü sunucu sağlık yanıtı: HTTP ${status}`);
        if (status !== 200) process.exitCode = 1;
      } catch (err) {
        console.log('[SMOKE] Gömülü sunucuya ulaşılamadı:', err && err.message);
        process.exitCode = 1;
      }

      // 2) Veritabanı dosyası oluştu mu?
      const dbFile = path.join(getDataDir(), 'oto-servis.sqlite');
      try {
        const st = require('fs').statSync(dbFile);
        console.log(`[SMOKE] Veritabanı hazır: ${dbFile} (${st.size} bayt)`);
      } catch {
        console.log(`[SMOKE] Veritabanı dosyası YOK: ${dbFile}`);
        process.exitCode = 1;
      }

      // 3) X tuşu simülasyonu → güvenli kapanış akışı
      console.log('[SMOKE] X tuşu simüle ediliyor → mainWindow.close()');
      mainWindow?.close();

      // Kapanış akışı sürerken arayüzün veda ekranını çizdiğini doğrula
      await new Promise((resolve) => setTimeout(resolve, 3000));
      try {
        const sawShutdown = await mainWindow?.webContents.executeJavaScript(
          "!!document.querySelector('[data-testid=shutdown]')"
        );
        const text = await mainWindow?.webContents.executeJavaScript(
          "(document.querySelector('[data-testid=shutdown-text]')||{}).textContent || ''"
        );
        console.log(`[SMOKE] Veda ekranı göründü: ${sawShutdown ? 'EVET' : 'HAYIR'}`);
        console.log(`[SMOKE] Veda metni: ${text}`);
        if (!sawShutdown) process.exitCode = 1;
      } catch (err) {
        console.log('[SMOKE] Arayüz denetlenemedi:', err && err.message);
        process.exitCode = 1;
      }
    }, SMOKE_CLOSE_MS);
  });
}

// ---------------------------------------------------------------------------
// Güncelleme IPC köprüsü (preload → main)
// ---------------------------------------------------------------------------
ipcMain.handle('update:check', async () => checkForUpdatesNow(false));

ipcMain.handle('update:download', async () => {
  const updater = getAutoUpdater();
  if (!updater) return { ok: false, error: 'Güncelleme modülü yüklü değil.' };
  try {
    await updater.downloadUpdate();
    return { ok: true };
  } catch (err) {
    const message = String((err && err.message) || err);
    console.error('[UPDATE] İndirme hatası:', err);
    sendUpdateStatus({ state: 'error', message });
    return { ok: false, error: message };
  }
});

ipcMain.handle('update:install', async () => installUpdate());

ipcMain.handle('update:get-version', () => app.getVersion());

ipcMain.handle('update:get-status', () => lastUpdateStatus);

ipcMain.handle('update:open-release', async () => {
  try {
    await shell.openExternal(RELEASES_URL);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

/** Dijital arşiv: PDF / iş emri dosyasını masaüstündeki Çınar_Otomotiv_Arsiv'e yazar. */
ipcMain.handle('archive:save', async (_event, payload) => saveToArchive(payload));

app.whenReady().then(() => {
  buildApplicationMenu();
  startEmbeddedServer();
  // Small delay to allow fastify server to bind
  setTimeout(createWindow, 1500);
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Cmd+Q / menüden çıkış da aynı güvenli kapanış akışından geçer.
app.on('before-quit', (event) => {
  if (isShuttingDown) return;
  event.preventDefault();
  beginGracefulShutdown();
});

app.on('will-quit', () => {
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
    updateCheckTimer = null;
  }
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Gömülü sunucu bir IPC kanalı açtıysa (gelecekte) temiz kapatma için hazırlık.
ipcMain.on('app:shutdown-complete', () => {
  console.log('[ELECTRON] Arayüz kapanış ekranını tamamladı.');
});
