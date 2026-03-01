/**
 * Schaaq Scanner — Electron Main Process
 *
 * Starts the Express server in-process and loads the UI in a BrowserWindow.
 * Uses dynamic import() to load the ESM server module.
 *
 * The compiled server code uses extensionless ESM imports (e.g. './db/schema')
 * which require tsx's loader to resolve. We register it before importing
 * any server modules.
 */

import { register } from 'node:module';
// Register custom ESM resolve hook so extensionless imports (e.g. './db/schema')
// resolve correctly. The compiled server code omits .js extensions.
register('./esm-resolve-hook.js', import.meta.url);

import { app, BrowserWindow, shell, Tray, Menu, nativeImage } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync, mkdirSync } from 'node:fs';
import type { Server } from 'node:http';

const PORT = 23847; // High port to avoid conflicts

let mainWindow: BrowserWindow | null = null;
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
// Express server (in-process)
// ---------------------------------------------------------------------------

async function startServer(): Promise<void> {
  const basePath = getAppBasePath();
  const serverModulePath = path.join(basePath, 'dist', 'server', 'index.js');
  const uiDir = path.join(basePath, 'ui', 'dist');
  const dataDir = getDataPath();

  // Ensure data directory exists
  mkdirSync(dataDir, { recursive: true });

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
        console.log(`[schaaq] Express server started on port ${PORT}`);
        console.log(`[schaaq] Data directory: ${dataDir}`);
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
  createWindow();
  createTray();

  try {
    await startServer();
    mainWindow?.loadURL(`http://localhost:${PORT}`);
    mainWindow?.show();
  } catch (error: any) {
    console.error('[schaaq] Failed to start server:', error);
    const errorHtml = `data:text/html;charset=utf-8,
      <html>
      <body style="background:#0a0f1a;color:#e2e8f0;font-family:system-ui;padding:40px;">
        <h2 style="color:#f87171;">Failed to start Schaaq Scanner</h2>
        <p>${error.message ?? 'Unknown error'}</p>
        <p style="color:#94a3b8;margin-top:20px;">Please restart the application. If the problem persists, check that port ${PORT} is not in use.</p>
      </body>
      </html>`;
    mainWindow?.loadURL(errorHtml);
    mainWindow?.show();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', () => {
  // Gracefully close the Express server
  if (expressServer) {
    expressServer.close();
    expressServer = null;
  }
});
