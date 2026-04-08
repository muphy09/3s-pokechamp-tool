const fs = require('fs');
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
let updateCheckPromise = null;
const UPDATE_CHECK_DELAY_MS = 4000;
const LATEST_RELEASE_MESSAGE = 'You are on the latest release.';
let updateSnapshot = {
  status: 'idle',
  version: null,
  message: '',
};

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

function getCurrentVersion() {
  return normalizeVersion(app.getVersion());
}

function getUpdateSnapshot() {
  return {
    status: updateSnapshot.status,
    current: getCurrentVersion(),
    version: updateSnapshot.version,
    message: updateSnapshot.message,
  };
}

function setUpdateSnapshot(nextSnapshot) {
  updateSnapshot = {
    status: nextSnapshot.status ?? updateSnapshot.status,
    version: Object.prototype.hasOwnProperty.call(nextSnapshot, 'version')
      ? normalizeVersion(nextSnapshot.version) || null
      : updateSnapshot.version,
    message: Object.prototype.hasOwnProperty.call(nextSnapshot, 'message')
      ? String(nextSnapshot.message || '')
      : updateSnapshot.message,
  };

  return getUpdateSnapshot();
}

function getDownloadingMessage(version) {
  return version ? `Update ${version} is downloading.` : 'Update is downloading.';
}

function getDownloadedMessage(version) {
  return version ? `Update ${version} is ready to install.` : 'An update is ready to install.';
}

async function runUpdateCheck() {
  const updater = ensureAutoUpdater();
  if (!updater) {
    return setUpdateSnapshot({ status: 'error', version: null, message: 'Updater unavailable.' });
  }

  if (!app.isPackaged) {
    return setUpdateSnapshot({ status: 'idle', version: null, message: '' });
  }

  const currentVersion = getCurrentVersion();

  if (downloadedVersion && isNewerVersion(downloadedVersion, currentVersion)) {
    return setUpdateSnapshot({
      status: 'downloaded',
      version: downloadedVersion,
      message: getDownloadedMessage(downloadedVersion),
    });
  }

  if (updateCheckPromise) {
    return updateCheckPromise;
  }

  if (downloadingVersion && isNewerVersion(downloadingVersion, currentVersion)) {
    return setUpdateSnapshot({
      status: 'downloading',
      version: downloadingVersion,
      message: getDownloadingMessage(downloadingVersion),
    });
  }

  setUpdateSnapshot({ status: 'checking', version: null, message: 'Checking updates...' });

  updateCheckPromise = (async () => {
    try {
      const result = await updater.checkForUpdates();
      const nextVersion = normalizeVersion(result?.updateInfo?.version);

      if (downloadedVersion && isNewerVersion(downloadedVersion, currentVersion)) {
        return setUpdateSnapshot({
          status: 'downloaded',
          version: downloadedVersion,
          message: getDownloadedMessage(downloadedVersion),
        });
      }

      if (downloadingVersion && isNewerVersion(downloadingVersion, currentVersion)) {
        return setUpdateSnapshot({
          status: 'downloading',
          version: downloadingVersion,
          message: getDownloadingMessage(downloadingVersion),
        });
      }

      if (nextVersion && isNewerVersion(nextVersion, currentVersion)) {
        downloadingVersion = nextVersion;
        return setUpdateSnapshot({
          status: 'downloading',
          version: nextVersion,
          message: getDownloadingMessage(nextVersion),
        });
      }

      return setUpdateSnapshot({ status: 'current', version: null, message: LATEST_RELEASE_MESSAGE });
    } catch (error) {
      downloadingVersion = null;
      return setUpdateSnapshot({
        status: 'error',
        version: downloadedVersion || null,
        message: error?.message || String(error),
      });
    } finally {
      updateCheckPromise = null;
    }
  })();

  return updateCheckPromise;
}

function setupAutoUpdates() {
  if (updaterReady) return;

  const updater = ensureAutoUpdater();
  if (!updater) return;

  updaterReady = true;
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;

  updater.on('checking-for-update', () => {
    setUpdateSnapshot({ status: 'checking', version: null, message: 'Checking updates...' });
    sendToRenderer('update:checking', getUpdateSnapshot());
  });

  updater.on('update-available', (info) => {
    const version = normalizeVersion(info?.version);
    downloadingVersion = version || null;
    downloadedVersion = null;
    setUpdateSnapshot({
      status: 'downloading',
      version,
      message: getDownloadingMessage(version),
    });
    sendToRenderer('update:available', version);
  });

  updater.on('update-not-available', () => {
    downloadingVersion = null;
    setUpdateSnapshot({ status: 'current', version: null, message: LATEST_RELEASE_MESSAGE });
    sendToRenderer('update:not-available', getUpdateSnapshot());
  });

  updater.on('update-downloaded', (info) => {
    const version = normalizeVersion(info?.version);
    downloadingVersion = null;
    downloadedVersion = version || null;
    setUpdateSnapshot({
      status: 'downloaded',
      version,
      message: getDownloadedMessage(version),
    });
    sendToRenderer('update:downloaded', version);
  });

  updater.on('error', (error) => {
    downloadingVersion = null;
    const message = error?.message || String(error);
    setUpdateSnapshot({
      status: 'error',
      version: downloadedVersion || null,
      message,
    });
    sendToRenderer('update:error', message);
  });

  if (!app.isPackaged) {
    setUpdateSnapshot({ status: 'idle', version: null, message: '' });
    return;
  }

  setTimeout(() => {
    void runUpdateCheck();
  }, UPDATE_CHECK_DELAY_MS);
}

function getWindowIconPath() {
  const iconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  const iconPath = path.join(__dirname, '..', 'resources', iconName);
  return fs.existsSync(iconPath) ? iconPath : undefined;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#090807',
    icon: getWindowIconPath(),
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
ipcMain.handle('app:getUpdateState', () => getUpdateSnapshot());

ipcMain.handle('app:checkForUpdates', async () => runUpdateCheck());

ipcMain.handle('app:installUpdate', async () => {
  const updater = ensureAutoUpdater();
  if (!updater) {
    throw new Error('Updater unavailable.');
  }

  if (!downloadedVersion) {
    throw new Error('No downloaded update is ready to install.');
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
