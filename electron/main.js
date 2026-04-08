const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const path = require('path');

if (process.platform === 'win32') {
  app.setAppUserModelId('com.muphy09.pokechamptool');
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on('second-instance', () => {
  const window = BrowserWindow.getAllWindows()[0];
  if (!window) return;
  if (window.isMinimized()) window.restore();
  window.focus();
});

let mainWindow = null;
let autoUpdaterInstance = null;
let updaterReady = false;
let downloadingVersion = null;
let downloadedVersion = null;

function normalizeVersion(value) {
  return String(value || '').replace(/^v/i, '');
}

function isNewerVersion(nextVersion, currentVersion) {
  const nextParts = normalizeVersion(nextVersion)
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
  const currentParts = normalizeVersion(currentVersion)
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(nextParts.length, currentParts.length);

  for (let index = 0; index < length; index += 1) {
    const nextValue = nextParts[index] || 0;
    const currentValue = currentParts[index] || 0;
    if (nextValue > currentValue) return true;
    if (nextValue < currentValue) return false;
  }

  return false;
}

function sendToRenderer(channel, payload) {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
  } catch {}
}

function ensureAutoUpdater() {
  if (autoUpdaterInstance) return autoUpdaterInstance;

  try {
    autoUpdaterInstance = require('electron-updater').autoUpdater;
  } catch {
    autoUpdaterInstance = null;
  }

  return autoUpdaterInstance;
}

function setupAutoUpdates() {
  if (updaterReady) return;

  const updater = ensureAutoUpdater();
  if (!updater) return;

  updaterReady = true;
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;

  updater.on('checking-for-update', () => {
    sendToRenderer('update:checking');
  });

  updater.on('update-available', (info) => {
    const version = normalizeVersion(info?.version);
    downloadingVersion = version || null;
    sendToRenderer('update:available', version);
  });

  updater.on('update-not-available', () => {
    downloadingVersion = null;
    sendToRenderer('update:not-available');
  });

  updater.on('update-downloaded', (info) => {
    const version = normalizeVersion(info?.version);
    downloadingVersion = null;
    downloadedVersion = version || null;
    sendToRenderer('update:downloaded', version);
  });

  updater.on('error', (error) => {
    sendToRenderer('update:error', error?.message || String(error));
  });

  if (!app.isPackaged) return;

  try {
    updater.setFeedURL({
      provider: 'github',
      owner: 'muphy09',
      repo: '3s-pokechamp-tool',
    });
  } catch {}

  setTimeout(() => {
    try {
      updater.checkForUpdates();
    } catch {}
  }, 4000);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#090807',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  Menu.setApplicationMenu(null);

  const devUrl = process.env.VITE_DEV_SERVER_URL || process.env.ELECTRON_START_URL || '';
  const indexFile = path.join(__dirname, '..', 'dist', 'index.html');

  if (devUrl) {
    mainWindow.webContents.once('did-fail-load', () => {
      mainWindow.loadFile(indexFile);
    });
    mainWindow.loadURL(devUrl);
    if (String(process.env.OPEN_DEVTOOLS || '') === '1') {
      try {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
      } catch {}
    }
  } else {
    mainWindow.loadFile(indexFile);
  }

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow?.isDestroyed()) {
      mainWindow.show();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('app:getVersion', () => app.getVersion());

ipcMain.handle('app:checkForUpdates', async () => {
  const updater = ensureAutoUpdater();
  if (!updater) {
    return { status: 'error', message: 'Updater unavailable.' };
  }

  if (!app.isPackaged) {
    return { status: 'current', current: app.getVersion(), message: 'Update checks run in packaged builds.' };
  }

  const currentVersion = app.getVersion();

  if (downloadedVersion && isNewerVersion(downloadedVersion, currentVersion)) {
    return { status: 'downloaded', version: downloadedVersion, current: currentVersion };
  }

  if (downloadingVersion && isNewerVersion(downloadingVersion, currentVersion)) {
    return { status: 'downloading', version: downloadingVersion, current: currentVersion };
  }

  try {
    const result = await updater.checkForUpdates();
    const nextVersion = normalizeVersion(result?.updateInfo?.version);

    if (nextVersion && isNewerVersion(nextVersion, currentVersion)) {
      downloadingVersion = nextVersion;
      try {
        await updater.downloadUpdate();
      } catch {}
      return { status: 'available', version: nextVersion, current: currentVersion };
    }

    return { status: 'uptodate', current: currentVersion };
  } catch (error) {
    return { status: 'error', message: error?.message || String(error) };
  }
});

ipcMain.handle('app:installUpdate', async () => {
  const updater = ensureAutoUpdater();
  if (!updater) {
    throw new Error('Updater unavailable.');
  }

  downloadedVersion = null;
  updater.quitAndInstall();
  return true;
});

app.whenReady().then(() => {
  createMainWindow();
  setupAutoUpdates();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});
