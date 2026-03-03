/**
 * Type declarations for the Schaaq Electron bridge.
 *
 * The preload script (electron/preload.ts) exposes `window.schaaq` via
 * contextBridge.exposeInMainWorld(). This interface describes the shape
 * of that bridge so the React UI can consume it with full type safety.
 *
 * When running outside Electron (plain browser / dev server), `window.schaaq`
 * will be `undefined`.
 */

export interface SchaaqBridge {
  /** Always `true` when running inside Electron. */
  isElectron: true;

  /** Returns the app version from Electron's `app.getVersion()`. */
  getVersion: () => Promise<string>;

  /** Triggers the auto-updater to check for updates. */
  checkForUpdates: () => Promise<unknown>;

  /** Navigate the main window to a local path (e.g. '/projects/new'). */
  navigate: (path: string) => void;

  /** Generate a PDF report via Electron's built-in Chromium (printToPDF). */
  generatePdf: (scanId: string) => Promise<{
    success: boolean;
    filePath?: string;
    reason?: string;
  }>;

  /** Exit fullscreen mode. */
  exitFullscreen: () => void;

  /** Listen for fullscreen state changes. Returns a cleanup function. */
  onFullscreenChange: (callback: (isFullscreen: boolean) => void) => () => void;
}

declare global {
  interface Window {
    schaaq?: SchaaqBridge;
  }
}
