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

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const { createDatabaseBackup } = require('./backup.cjs');

const SERVER_PORT = parseInt(process.env.OTO_SERVER_PORT || '3001', 10);
/** Veda ekranının ZORUNLU ekranda kalma süresi (ms). */
const SHUTDOWN_MIN_MS = 10_000;
/** Gömülü sunucunun kapanmasını bekleme sınırı (ms). */
const SERVER_STOP_TIMEOUT_MS = 5_000;

let mainWindow = null;
let serverProcess = null;
let isShuttingDown = false;

function getDataDir() {
  return path.join(app.getPath('userData'), 'data');
}

function startEmbeddedServer() {
  const serverPath = path.join(__dirname, '../server/dist/index.js');
  console.log('[ELECTRON] Gömülü sunucu başlatılıyor:', serverPath);

  serverProcess = fork(serverPath, [], {
    env: {
      ...process.env,
      PORT: SERVER_PORT.toString(),
      HOST: '0.0.0.0', // Allow LAN sharing
      DATA_DIR: getDataDir(),
      BACKUP_DIR: path.join(app.getPath('userData'), 'backups')
    }
  });

  serverProcess.on('error', (err) => {
    console.error('[ELECTRON] Sunucu hatası:', err);
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
  mainWindow = new BrowserWindow({
    width: 1300,
    height: 850,
    minWidth: 400,
    minHeight: 600,
    title: 'Oto Servis Yönetim Sistemi',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
      // file:// altında göreli API yolları çalışmadığı için gömülü sunucunun
      // mutlak adresi arayüze aktarılır.
      additionalArguments: [`--oto-api-base=http://localhost:${SERVER_PORT}`]
    },
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
}

app.whenReady().then(() => {
  startEmbeddedServer();
  // Small delay to allow fastify server to bind
  setTimeout(createWindow, 1500);

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
