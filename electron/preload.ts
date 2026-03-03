import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('schaaq', {
  isElectron: true,

  // App version (from package.json via Electron)
  getVersion: () => ipcRenderer.invoke('app:getVersion'),

  // Auto-updater controls
  checkForUpdates: () => ipcRenderer.invoke('updater:checkForUpdates'),

  // Navigation (used by menu shortcuts from renderer)
  navigate: (path: string) => ipcRenderer.send('app:navigate', path),

  // PDF generation via Electron's built-in Chromium
  generatePdf: (scanId: string) =>
    ipcRenderer.invoke('schaaq:generate-pdf', scanId) as Promise<{
      success: boolean;
      filePath?: string;
      reason?: string;
    }>,

  // Fullscreen controls
  exitFullscreen: () => ipcRenderer.send('window:exitFullscreen'),
  onFullscreenChange: (callback: (isFullscreen: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: boolean) => callback(value);
    ipcRenderer.on('window:fullscreenChanged', handler);
    // Return cleanup function
    return () => ipcRenderer.removeListener('window:fullscreenChanged', handler);
  },
});
