/**
 * Schaaq Scanner — Electron Main Process
 *
 * Starts the Express server in-process and loads the UI in a BrowserWindow.
 * Includes auto-updater, structured logging (electron-log), and Sentry
 * error tracking for production builds.
 *
 * The compiled server code uses extensionless ESM imports (e.g. './db/schema')
 * which require a custom resolve hook. We register it before importing
 * any server modules.
 */

import { register } from 'node:module';
// Register custom ESM resolve hook so extensionless imports (e.g. './db/schema')
// resolve correctly. The compiled server code omits .js extensions.
register('./esm-resolve-hook.js', import.meta.url);

import { app, BrowserWindow, shell, Tray, Menu, nativeImage, dialog } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import log from 'electron-log';
import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;

// @sentry/electron is ESM-native but must run inside Electron (imports 'electron')
// Using dynamic import so TypeScript doesn't complain about top-level await
let Sentry: typeof import('@sentry/electron/main') | null = null;

// ---------------------------------------------------------------------------
// Logging setup (electron-log)
// ---------------------------------------------------------------------------

log.transports.file.level = 'info';
log.transports.console.level = 'debug';
log.transports.file.maxSize = 5 * 1024 * 1024; // 5 MB

// Redirect console to electron-log in production
if (app.isPackaged) {
  Object.assign(console, log.functions);
}

// ---------------------------------------------------------------------------
// Sentry error tracking (production only)
// ---------------------------------------------------------------------------

async function initSentry(): Promise<void> {
  const dsn = process.env['SENTRY_DSN'] ?? '';

  if (!app.isPackaged || !dsn) {
    log.info('[sentry] Skipped — not packaged or no DSN configured');
    return;
  }

  try {
    Sentry = await import('@sentry/electron/main');
    Sentry.init({
      dsn,
      release: `schaaq-scanner@${app.getVersion()}`,
      environment: 'production',
      sendDefaultPii: false,
    });
    log.info('[sentry] Initialised error tracking');
  } catch (err) {
    log.warn('[sentry] Failed to initialise:', err);
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PORT = 23847; // High port to avoid conflicts

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let expressServer: Server | null = null;

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function getAppBasePath(): string {
  // In dev: project root (where package.json lives)
  // In packaged (asar:false): resources/app/
  return app.getAppPath();
}

function getDataPath(): string {
  // Store data in user's AppData (persists across updates)
  // e.g. C:\Users\<user>\AppData\Roaming\Schaaq Scanner\data
  return path.join(app.getPath('userData'), 'data');
}

// ---------------------------------------------------------------------------
// Auto-updater (electron-updater)
// ---------------------------------------------------------------------------

function setupAutoUpdater(): void {
  // Only check for updates in packaged builds
  if (!app.isPackaged) {
    log.info('[updater] Skipping — running in dev mode');
    return;
  }

  autoUpdater.logger = log;
  autoUpdater.autoDownload = false; // Ask user before downloading
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    log.info('[updater] Checking for updates…');
  });

  autoUpdater.on('update-available', (info) => {
    log.info('[updater] Update available:', info.version);
    dialog
      .showMessageBox(mainWindow!, {
        type: 'info',
        title: 'Update Available',
        message: `Schaaq Scanner v${info.version} is available. Download now?`,
        buttons: ['Download', 'Later'],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.downloadUpdate();
        }
      });
  });

  autoUpdater.on('update-not-available', () => {
    log.info('[updater] No updates available');
  });

  autoUpdater.on('download-progress', (progress) => {
    log.info(`[updater] Download progress: ${progress.percent.toFixed(1)}%`);
    mainWindow?.setProgressBar(progress.percent / 100);
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('[updater] Update downloaded:', info.version);
    mainWindow?.setProgressBar(-1); // Remove progress bar
    dialog
      .showMessageBox(mainWindow!, {
        type: 'info',
        title: 'Update Ready',
        message: `Schaaq Scanner v${info.version} has been downloaded. Restart to apply the update?`,
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
  });

  autoUpdater.on('error', (err) => {
    log.error('[updater] Error:', err.message);
  });

  // Check for updates after a short delay
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      log.warn('[updater] Failed to check for updates:', err.message);
    });
  }, 5_000);
}

// ---------------------------------------------------------------------------
// Express server (in-process)
// ---------------------------------------------------------------------------

async function startServer(): Promise<void> {
  const basePath = getAppBasePath();
  const serverModulePath = path.join(basePath, 'dist', 'server', 'index.js');
  const uiDir = path.join(basePath, 'ui', 'dist');
  const dataDir = getDataPath();

  // Ensure data directory exists
  mkdirSync(dataDir, { recursive: true });

  log.info(`[server] Base path: ${basePath}`);
  log.info(`[server] Server module: ${serverModulePath}`);
  log.info(`[server] Data directory: ${dataDir}`);
  log.info(`[server] UI directory: ${uiDir} (exists: ${existsSync(uiDir)})`);

  // Dynamic import of the ESM server module
  const moduleUrl = pathToFileURL(serverModulePath).href;
  const { createServer } = await import(moduleUrl);

  const { app: expressApp } = createServer({
    port: PORT,
    dataDir,
    uiDir: existsSync(uiDir) ? uiDir : undefined,
  });

  return new Promise<void>((resolve, reject) => {
    try {
      expressServer = expressApp.listen(PORT, () => {
        log.info(`[server] Express server started on port ${PORT}`);
        resolve();
      });

      expressServer!.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error(`Port ${PORT} is already in use. Close the other application and try again.`));
        } else {
          reject(err);
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

// ---------------------------------------------------------------------------
// Splash screen
// ---------------------------------------------------------------------------

function createSplashWindow(): BrowserWindow {
  const basePath = getAppBasePath();
  const splashPath = path.join(basePath, 'dist-electron', 'splash.html');

  const splash = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    center: true,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Read splash HTML, inject the real version, and load as data URI
  try {
    const html = readFileSync(splashPath, 'utf-8')
      .replace('{{VERSION}}', app.getVersion());
    splash.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  } catch (err) {
    log.warn('[splash] Failed to load splash screen:', err);
    // Non-fatal — splash is cosmetic, app will continue booting
  }

  splash.on('closed', () => {
    splashWindow = null;
  });

  return splash;
}

function closeSplash(): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

// ---------------------------------------------------------------------------
// BrowserWindow
// ---------------------------------------------------------------------------

function createWindow(): void {
  const basePath = getAppBasePath();

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Schaaq Scanner',
    icon: path.join(basePath, 'schaaq.ico'),
    backgroundColor: '#0a0f1a',
    show: false, // Show after server is ready
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(basePath, 'dist-electron', 'preload.js'),
    },
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// System tray
// ---------------------------------------------------------------------------

function createTray(): void {
  const basePath = getAppBasePath();
  const iconPath = path.join(basePath, 'schaaq.ico');

  if (!existsSync(iconPath)) return;

  tray = new Tray(nativeImage.createFromPath(iconPath));
  tray.setToolTip('Schaaq Scanner');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Schaaq',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Check for Updates',
      click: () => {
        if (app.isPackaged) {
          autoUpdater.checkForUpdates().catch((err) => {
            log.warn('[updater] Manual check failed:', err.message);
          });
        } else {
          dialog.showMessageBox({ message: 'Updates are only available in packaged builds.' });
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        tray?.destroy();
        tray = null;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  log.info(`[app] Schaaq Scanner v${app.getVersion()} starting…`);
  log.info(`[app] Packaged: ${app.isPackaged}`);
  log.info(`[app] Platform: ${process.platform} ${process.arch}`);

  await initSentry();

  // 1. Show splash immediately — visible while server boots
  splashWindow = createSplashWindow();

  // 2. Create main window (hidden) and tray
  createWindow();
  createTray();
  setupAutoUpdater();

  // 3. Safety timeout — if server takes >30s, assume failure
  const startupTimeout = setTimeout(() => {
    log.error('[app] Server startup timed out after 30 seconds');
    closeSplash();

    const errorHtml = `data:text/html;charset=utf-8,${encodeURIComponent(`<html>
      <body style="background:#0a0f1a;color:#e2e8f0;font-family:system-ui;padding:40px;">
        <h2 style="color:#f87171;">Startup timed out</h2>
        <p>The server failed to start within 30 seconds.</p>
        <p style="color:#94a3b8;margin-top:20px;">Please restart the application. If the problem persists, check that port ${PORT} is not in use.</p>
      </body>
      </html>`)}`;
    mainWindow?.loadURL(errorHtml);
    mainWindow?.show();
  }, 30_000);

  try {
    // 4. Start the Express server (splash is visible during this)
    await startServer();
    clearTimeout(startupTimeout);

    // 5. Load the UI in the main window
    mainWindow?.loadURL(`http://localhost:${PORT}`);

    // 6. When the page finishes loading, close splash and show main window
    mainWindow?.webContents.once('did-finish-load', () => {
      closeSplash();
      mainWindow?.show();
    });
  } catch (error: any) {
    clearTimeout(startupTimeout);
    log.error('[app] Failed to start server:', error);
    Sentry?.captureException(error);
    closeSplash();

    const errorHtml = `data:text/html;charset=utf-8,${encodeURIComponent(`<html>
      <body style="background:#0a0f1a;color:#e2e8f0;font-family:system-ui;padding:40px;">
        <h2 style="color:#f87171;">Failed to start Schaaq Scanner</h2>
        <p>${error.message ?? 'Unknown error'}</p>
        <p style="color:#94a3b8;margin-top:20px;">Please restart the application. If the problem persists, check that port ${PORT} is not in use.</p>
      </body>
      </html>`)}`;
    mainWindow?.loadURL(errorHtml);
    mainWindow?.show();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  log.info('[app] Shutting down…');
  // Gracefully close the Express server
  if (expressServer) {
    expressServer.close();
    expressServer = null;
  }
});
