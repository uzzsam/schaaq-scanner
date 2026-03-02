import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('schaaq', {
  isElectron: true,

  // App version (from package.json via Electron)
  getVersion: () => ipcRenderer.invoke('app:getVersion'),

  // Auto-updater controls
  checkForUpdates: () => ipcRenderer.invoke('updater:checkForUpdates'),
});
