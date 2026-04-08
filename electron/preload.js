const { contextBridge, ipcRenderer, shell } = require('electron');

function invoke(channel, payload) {
  return ipcRenderer.invoke(channel, payload);
}

function subscribe(channel, callback) {
  const handler = (_event, payload) => {
    try {
      callback?.(payload);
    } catch {}
  };

  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

contextBridge.exposeInMainWorld('app', {
  getVersion: () => invoke('app:getVersion'),
  getUpdateState: () => invoke('app:getUpdateState'),
  checkForUpdates: () => invoke('app:checkForUpdates'),
  installUpdate: () => invoke('app:installUpdate'),
  openExternal: async (url) => {
    if (!url) return false;
    await shell.openExternal(url);
    return true;
  },
  onCheckingForUpdate: (callback) => subscribe('update:checking', callback),
  onUpdateAvailable: (callback) => subscribe('update:available', callback),
  onUpdateNotAvailable: (callback) => subscribe('update:not-available', callback),
  onUpdateDownloaded: (callback) => subscribe('update:downloaded', callback),
  onUpdateError: (callback) => subscribe('update:error', callback),
});
