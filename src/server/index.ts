import express from 'express';
import cors from 'cors';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import type Database from 'better-sqlite3';
import { initDatabase } from './db/schema';
import { Repository } from './db/repository';
import { ScanRunner, type ScanProgress } from './scan-runner';
import { projectRoutes } from './routes/projects';
import { scanRoutes } from './routes/scans';
import { dashboardRoutes } from './routes/dashboard';

export interface ServerConfig {
  port: number;
  dataDir: string;
  uiDir?: string;      // Path to built React SPA static files
}

export function createServer(config: ServerConfig): {
  app: express.Express;
  db: Database.Database;
  repo: Repository;
  scanRunner: ScanRunner;
} {
  const app = express();

  // Ensure data directory exists
  mkdirSync(config.dataDir, { recursive: true });

  // Initialise database
  const db = initDatabase(config.dataDir);
  const repo = new Repository(db);
  const scanRunner = new ScanRunner(repo);

  // Active SSE connections per scan
  const sseConnections = new Map<string, Set<express.Response>>();

  // Forward scan progress to SSE connections
  scanRunner.on('progress', (event: ScanProgress) => {
    const connections = sseConnections.get(event.scanId);
    if (connections) {
      const data = `data: ${JSON.stringify(event)}\n\n`;
      for (const res of connections) {
        res.write(data);
        if (event.status === 'completed' || event.status === 'failed') {
          res.end();
        }
      }
      if (event.status === 'completed' || event.status === 'failed') {
        sseConnections.delete(event.scanId);
      }
    }
  });

  // Middleware
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (same-origin, curl, Electron, etc.)
      if (!origin) return callback(null, true);
      try {
        const url = new URL(origin);
        if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1') {
          return callback(null, true);
        }
      } catch {
        // invalid origin
      }
      callback(new Error('CORS: origin not allowed'));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: false,
  }));
  app.use(express.json());

  // --- API Routes ---
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', version: '2.0.0', uptime: process.uptime() });
  });

  app.post('/api/shutdown', (req, res) => {
    const ip = req.ip || req.socket.remoteAddress;
    if (ip !== '127.0.0.1' && ip !== '::1' && ip !== '::ffff:127.0.0.1') {
      res.status(403).json({ error: 'Localhost only' });
      return;
    }
    res.json({ status: 'shutting down' });
    setTimeout(() => process.exit(0), 500);
  });

  app.use('/api/dashboard', dashboardRoutes(repo));
  app.use('/api/projects', projectRoutes(repo));
  app.use('/api/scans', scanRoutes(repo, scanRunner, sseConnections));

  // --- SSE endpoint for scan progress ---
  app.get('/api/scans/:scanId/progress', (req, res) => {
    const { scanId } = req.params;

    // Check scan exists
    const scan = repo.getScan(scanId);
    if (!scan) {
      res.status(404).json({ error: 'Scan not found' });
      return;
    }

    // If scan already completed, send the final status and close
    if (scan.status === 'completed' || scan.status === 'failed') {
      res.json({
        scanId,
        status: scan.status,
        progress: scan.status === 'completed' ? 1.0 : 0,
        currentStep: scan.current_step ?? scan.status,
      });
      return;
    }

    // Set up SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Register connection
    if (!sseConnections.has(scanId)) {
      sseConnections.set(scanId, new Set());
    }
    sseConnections.get(scanId)!.add(res);

    // Send current status immediately
    res.write(`data: ${JSON.stringify({
      scanId,
      status: 'running',
      progress: scan.progress,
      currentStep: scan.current_step ?? 'Waiting...',
    })}\n\n`);

    // Clean up on disconnect
    req.on('close', () => {
      const connections = sseConnections.get(scanId);
      if (connections) {
        connections.delete(res);
        if (connections.size === 0) sseConnections.delete(scanId);
      }
    });
  });

  // --- Serve React SPA (if built) ---
  if (config.uiDir && existsSync(config.uiDir)) {
    app.use(express.static(config.uiDir));
    // SPA fallback: all non-API routes serve index.html
    // Express 5 requires named wildcard parameters
    app.get('{*path}', (req, res) => {
      if (!req.path.startsWith('/api/')) {
        res.sendFile(join(config.uiDir!, 'index.html'));
      }
    });
  } else {
    // No UI built yet - show a helpful message
    app.get('/', (req, res) => {
      res.json({
        message: 'schaaq API is running',
        version: '0.1.0',
        docs: 'API available at /api/dashboard, /api/projects, /api/scans',
        ui: 'React UI not built yet. Run "npm run build:ui" first.',
      });
    });
  }

  return { app, db, repo, scanRunner };
}
