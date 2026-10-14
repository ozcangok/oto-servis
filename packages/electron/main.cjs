const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let mainWindow = null;
let serverProcess = null;

const SERVER_PORT = 3001;

function startEmbeddedServer() {
  const serverPath = path.join(__dirname, '../server/dist/index.js');
  console.log('[ELECTRON] Gömülü sunucu başlatılıyor:', serverPath);

  serverProcess = fork(serverPath, [], {
    env: {
      ...process.env,
      PORT: SERVER_PORT.toString(),
      HOST: '0.0.0.0', // Allow LAN sharing
      DATA_DIR: path.join(app.getPath('userData'), 'data'),
      BACKUP_DIR: path.join(app.getPath('userData'), 'backups')
    }
  });

  serverProcess.on('error', (err) => {
    console.error('[ELECTRON] Sunucu hatası:', err);
  });
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
      contextIsolation: true
    },
    autoHideMenuBar: false
  });

  const clientDist = path.join(__dirname, '../client/dist/index.html');

  // Load client
  if (app.isPackaged) {
    mainWindow.loadFile(clientDist);
  } else {
    mainWindow.loadURL(`http://localhost:3000`);
  }

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

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
