import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import request from 'supertest';
import { createServer } from '../../src/server/index';
import type Database from 'better-sqlite3';

describe('API Routes', () => {
  let dataDir: string;
  let app: ReturnType<typeof createServer>['app'];
  let db: Database.Database;

  const validProject = {
    name: 'Acme Mining Corp',
    sector: 'mining',
    revenueAUD: 250_000_000,
    totalFTE: 1200,
    dataEngineers: 15,
    avgSalaryAUD: 160_000,
    avgFTESalaryAUD: 110_000,
  };

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'dalc-api-test-'));
    const server = createServer({ port: 0, dataDir });
    app = server.app;
    db = server.db;
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  // =========================================================================
  // Dashboard
  // =========================================================================

  describe('GET /api/dashboard', () => {
    it('returns dashboard stats', async () => {
      const res = await request(app).get('/api/dashboard');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalProjects');
      expect(res.body).toHaveProperty('totalScans');
      expect(res.body).toHaveProperty('recentScans');
      expect(res.body).toHaveProperty('averageCost');
    });
  });

  // =========================================================================
  // Projects
  // =========================================================================

  describe('POST /api/projects', () => {
    it('creates a project', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send(validProject);

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Acme Mining Corp');
      expect(res.body.sector).toBe('mining');
      expect(res.body.id).toBeTruthy();
    });

    it('returns 400 for invalid input', async () => {
      const res = await request(app)
        .post('/api/projects')
        .send({ name: 'Bad', sector: 'invalid_sector' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('GET /api/projects', () => {
    it('lists all projects', async () => {
      await request(app).post('/api/projects').send(validProject);
      await request(app).post('/api/projects').send({ ...validProject, name: 'Second Corp' });

      const res = await request(app).get('/api/projects');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
    });

    it('returns empty array when no projects', async () => {
      const res = await request(app).get('/api/projects');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('GET /api/projects/:id', () => {
    it('returns a single project', async () => {
      const createRes = await request(app).post('/api/projects').send(validProject);
      const id = createRes.body.id;

      const res = await request(app).get(`/api/projects/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Acme Mining Corp');
    });

    it('returns 404 for non-existent project', async () => {
      const res = await request(app).get('/api/projects/non-existent');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Project not found');
    });
  });

  describe('PATCH /api/projects/:id', () => {
    it('updates project fields', async () => {
      const createRes = await request(app).post('/api/projects').send(validProject);
      const id = createRes.body.id;

      const res = await request(app)
        .patch(`/api/projects/${id}`)
        .send({ name: 'Updated Name', revenueAUD: 500_000_000 });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Name');
      expect(res.body.revenue_aud).toBe(500_000_000);
      // Unchanged fields preserved
      expect(res.body.sector).toBe('mining');
    });

    it('returns 404 for non-existent project', async () => {
      const res = await request(app)
        .patch('/api/projects/non-existent')
        .send({ name: 'Test' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/projects/:id', () => {
    it('archives a project (soft delete)', async () => {
      const createRes = await request(app).post('/api/projects').send(validProject);
      const id = createRes.body.id;

      const deleteRes = await request(app).delete(`/api/projects/${id}`);
      expect(deleteRes.status).toBe(204);

      // Project no longer visible
      const getRes = await request(app).get(`/api/projects/${id}`);
      expect(getRes.status).toBe(404);
    });
  });

  describe('GET /api/projects/:id/scans', () => {
    it('lists scans for a project', async () => {
      const createRes = await request(app).post('/api/projects').send(validProject);
      const id = createRes.body.id;

      const res = await request(app).get(`/api/projects/${id}/scans`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  // =========================================================================
  // Scans
  // =========================================================================

  describe('POST /api/scans', () => {
    it('triggers a dry-run scan and returns scan ID', async () => {
      const createRes = await request(app).post('/api/projects').send(validProject);
      const projectId = createRes.body.id;

      const res = await request(app)
        .post('/api/scans')
        .send({ projectId, dryRun: true });

      expect(res.status).toBe(201);
      expect(res.body.scanId).toBeTruthy();
      expect(res.body.status).toBe('pending');
    });

    it('returns 404 for non-existent project', async () => {
      const res = await request(app)
        .post('/api/scans')
        .send({ projectId: 'non-existent', dryRun: true });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Project not found');
    });
  });

  describe('GET /api/scans/:id', () => {
    it('returns scan details', async () => {
      const createRes = await request(app).post('/api/projects').send(validProject);
      const projectId = createRes.body.id;

      const scanRes = await request(app)
        .post('/api/scans')
        .send({ projectId, dryRun: true });
      const scanId = scanRes.body.scanId;

      const res = await request(app).get(`/api/scans/${scanId}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(scanId);
      expect(res.body.project_id).toBe(projectId);
    });

    it('returns 404 for non-existent scan', async () => {
      const res = await request(app).get('/api/scans/non-existent');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/scans/:id/findings', () => {
    it('returns findings array (may be populated if scan completed)', async () => {
      const createRes = await request(app).post('/api/projects').send(validProject);
      const projectId = createRes.body.id;

      const scanRes = await request(app)
        .post('/api/scans')
        .send({ projectId, dryRun: true });
      const scanId = scanRes.body.scanId;

      const res = await request(app).get(`/api/scans/${scanId}/findings`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/scans/:id/result', () => {
    it('returns 404 for non-existent scan', async () => {
      const res = await request(app).get('/api/scans/non-existent/result');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Scan not found');
    });
  });

  // =========================================================================
  // Dry-run scan end-to-end
  // =========================================================================

  describe('Dry-run scan lifecycle', () => {
    it('completes a dry-run scan and returns results', async () => {
      // Create project
      const createRes = await request(app).post('/api/projects').send(validProject);
      const projectId = createRes.body.id;

      // Trigger scan
      const scanRes = await request(app)
        .post('/api/scans')
        .send({ projectId, dryRun: true });
      const scanId = scanRes.body.scanId;

      // Wait for async scan to complete (poll with timeout)
      let scan;
      for (let i = 0; i < 50; i++) {
        await new Promise(r => setTimeout(r, 200));
        const statusRes = await request(app).get(`/api/scans/${scanId}`);
        scan = statusRes.body;
        if (scan.status === 'completed' || scan.status === 'failed') break;
      }

      expect(scan.status).toBe('completed');
      expect(scan.total_findings).toBeGreaterThan(0);
      expect(scan.total_cost).toBeGreaterThan(0);
      expect(scan.amplification_ratio).toBeGreaterThan(0);
      expect(scan.derived_approach).toBeTruthy();
      expect(scan.schema_tables).toBeGreaterThan(0);
      expect(scan.schema_columns).toBeGreaterThan(0);

      // Findings available
      const findingsRes = await request(app).get(`/api/scans/${scanId}/findings`);
      expect(findingsRes.status).toBe(200);
      expect(findingsRes.body.length).toBeGreaterThan(0);

      // Engine result available
      const resultRes = await request(app).get(`/api/scans/${scanId}/result`);
      expect(resultRes.status).toBe(200);
      expect(resultRes.body).toHaveProperty('finalTotal');
      expect(resultRes.body).toHaveProperty('amplificationRatio');

      // Findings can be filtered by property
      const p1Res = await request(app).get(`/api/scans/${scanId}/findings?property=1`);
      expect(p1Res.status).toBe(200);
      for (const f of p1Res.body) {
        expect(f.property).toBe(1);
      }

      // HTML export works
      const htmlRes = await request(app).get(`/api/scans/${scanId}/export/html`);
      expect(htmlRes.status).toBe(200);
      expect(htmlRes.headers['content-type']).toContain('text/html');
      expect(htmlRes.text).toContain('DALC');
    }, 30_000);
  });

  // =========================================================================
  // SSE Progress
  // =========================================================================

  describe('GET /api/scans/:scanId/progress', () => {
    it('returns 404 for non-existent scan', async () => {
      const res = await request(app).get('/api/scans/non-existent/progress');
      expect(res.status).toBe(404);
    });

    it('returns JSON status for completed scan', async () => {
      // Create and complete a scan
      const createRes = await request(app).post('/api/projects').send(validProject);
      const projectId = createRes.body.id;

      const scanRes = await request(app)
        .post('/api/scans')
        .send({ projectId, dryRun: true });
      const scanId = scanRes.body.scanId;

      // Wait for completion
      for (let i = 0; i < 50; i++) {
        await new Promise(r => setTimeout(r, 200));
        const statusRes = await request(app).get(`/api/scans/${scanId}`);
        if (statusRes.body.status === 'completed') break;
      }

      const res = await request(app).get(`/api/scans/${scanId}/progress`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('completed');
      expect(res.body.progress).toBe(1.0);
    }, 30_000);
  });

  // =========================================================================
  // HTML Export
  // =========================================================================

  describe('GET /api/scans/:id/export/html', () => {
    it('returns 404 for non-existent scan', async () => {
      const res = await request(app).get('/api/scans/non-existent/export/html');
      expect(res.status).toBe(404);
    });

    it('returns 404 for non-existent scan', async () => {
      const res = await request(app).get('/api/scans/non-existent/export/html');
      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // Root endpoint
  // =========================================================================

  describe('GET /', () => {
    it('returns API info message', async () => {
      const res = await request(app).get('/');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('schaaq API is running');
    });
  });
});
