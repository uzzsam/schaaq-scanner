/**
 * Scan History API Tests
 *
 * Tests the scan-results API endpoints used by the UI scan history panel:
 *  1. Default latest-run selection
 *  2. Historical run selection (load a specific result set by ID)
 *  3. Failed run rendering (failed runs visible and selectable)
 *  4. Empty state (no persisted result sets)
 *  5. Comparison block rendering (latest vs previous)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import request from 'supertest';
import { createServer } from '../../src/server/index';
import { ScanResultRepository } from '../../src/server/db/scan-result-repository';
import { Repository } from '../../src/server/db/repository';
import type { NewResultFindingInput } from '../../src/server/db/scan-result-types';
import type Database from 'better-sqlite3';

describe('Scan History API (UI scenarios)', () => {
  let dataDir: string;
  let app: ReturnType<typeof createServer>['app'];
  let db: Database.Database;
  let repo: Repository;
  let scanResultRepo: ScanResultRepository;
  let projectId: string;
  let scanId: string;

  const validProject = {
    name: 'Test Corp',
    sector: 'mining' as const,
    revenueAUD: 100_000_000,
    totalFTE: 500,
    dataEngineers: 10,
    avgSalaryAUD: 150_000,
    avgFTESalaryAUD: 100_000,
  };

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'dalc-history-api-test-'));
    const server = createServer({ port: 0, dataDir });
    app = server.app;
    db = server.db;
    repo = new Repository(db);
    scanResultRepo = new ScanResultRepository(db);

    const project = repo.createProject(validProject);
    projectId = project.id;
    const scan = repo.createScan(projectId, {}, false);
    scanId = scan.id;
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  // =========================================================================
  // 1. Default Latest-Run Selection
  // =========================================================================

  describe('Default latest-run selection', () => {
    it('GET /history returns newest run first', async () => {
      const scan2 = repo.createScan(projectId, {}, false);
      const scan3 = repo.createScan(projectId, {}, false);

      const id1 = createResultSet({ runLabel: 'Run 1' });
      db.prepare("UPDATE scan_result_sets SET created_at = datetime('now', '-2 hours') WHERE id = ?").run(id1);

      const id2 = createResultSet({ scanId: scan2.id, runLabel: 'Run 2' });
      db.prepare("UPDATE scan_result_sets SET created_at = datetime('now', '-1 hour') WHERE id = ?").run(id2);

      createResultSet({ scanId: scan3.id, runLabel: 'Run 3' });

      const res = await request(app)
        .get(`/api/scan-results/project/${projectId}/history`);

      expect(res.status).toBe(200);
      expect(res.body.items.length).toBe(3);
      // Newest first
      expect(res.body.items[0].runLabel).toBe('Run 3');
      expect(res.body.items[1].runLabel).toBe('Run 2');
      expect(res.body.items[2].runLabel).toBe('Run 1');
    });

    it('GET /by-scan/:scanId resolves the result set for the active scan', async () => {
      const resultSetId = createResultSet({ runLabel: 'Active Run', totalFindings: 12 });

      const res = await request(app)
        .get(`/api/scan-results/by-scan/${scanId}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(resultSetId);
      expect(res.body.run_label).toBe('Active Run');
      expect(res.body.total_findings).toBe(12);
    });

    it('latest result set has correct lifecycle fields', async () => {
      const startedAt = '2026-01-15T10:00:00.000Z';
      const completedAt = '2026-01-15T10:05:00.000Z';
      createResultSet({
        runLabel: 'Latest',
        status: 'completed',
        startedAt,
        completedAt,
        durationMs: 300_000,
      });

      const res = await request(app)
        .get(`/api/scan-results/project/${projectId}/history`);

      expect(res.status).toBe(200);
      const latest = res.body.items[0];
      expect(latest.status).toBe('completed');
      expect(latest.startedAt).toBe(startedAt);
      expect(latest.completedAt).toBe(completedAt);
      expect(latest.durationMs).toBe(300_000);
    });

    it('history items include DALC band fields', async () => {
      createResultSet({
        dalcBaseUsd: 5_000_000,
        dalcLowUsd: 3_000_000,
        dalcHighUsd: 7_000_000,
      });

      const res = await request(app)
        .get(`/api/scan-results/project/${projectId}/history`);

      const item = res.body.items[0];
      expect(item.dalcBaseUsd).toBe(5_000_000);
      expect(item.dalcLowUsd).toBe(3_000_000);
      expect(item.dalcHighUsd).toBe(7_000_000);
    });
  });

  // =========================================================================
  // 2. Historical Run Selection
  // =========================================================================

  describe('Historical run selection', () => {
    it('GET /:id loads a specific result set', async () => {
      const scan2 = repo.createScan(projectId, {}, false);

      const id1 = createResultSet({ runLabel: 'Run 1', totalFindings: 3 });
      db.prepare("UPDATE scan_result_sets SET created_at = datetime('now', '-1 hour') WHERE id = ?").run(id1);

      const id2 = createResultSet({ scanId: scan2.id, runLabel: 'Run 2', totalFindings: 7 });

      // Select the older run explicitly
      const res = await request(app)
        .get(`/api/scan-results/${id1}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(id1);
      expect(res.body.run_label).toBe('Run 1');
      expect(res.body.total_findings).toBe(3);
    });

    it('GET /:id/findings returns findings for a specific result set', async () => {
      const scan2 = repo.createScan(projectId, {}, false);

      const id1 = createResultSet({ runLabel: 'Run 1' });
      scanResultRepo.bulkInsertFindings(id1, projectId, [
        makeFinding({ checkId: 'P1_A', title: 'Finding A' }),
        makeFinding({ checkId: 'P2_B', title: 'Finding B' }),
      ]);

      const id2 = createResultSet({ scanId: scan2.id, runLabel: 'Run 2' });
      scanResultRepo.bulkInsertFindings(id2, projectId, [
        makeFinding({ checkId: 'P3_C', title: 'Finding C' }),
      ]);

      // Load findings for Run 1 (the historical one)
      const res = await request(app)
        .get(`/api/scan-results/${id1}/findings`);

      expect(res.status).toBe(200);
      expect(res.body.resultSetId).toBe(id1);
      expect(res.body.findings.length).toBe(2);
      const titles = res.body.findings.map((f: any) => f.title);
      expect(titles).toContain('Finding A');
      expect(titles).toContain('Finding B');
    });

    it('GET /:id returns 404 for non-existent result set', async () => {
      const res = await request(app)
        .get('/api/scan-results/non-existent-id');

      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });

    it('GET /:id includes parsed summary field', async () => {
      const id = createResultSet({ summary: { schemaTables: 25, customField: 'test' } });

      const res = await request(app)
        .get(`/api/scan-results/${id}`);

      expect(res.status).toBe(200);
      expect(res.body.summary).toBeDefined();
      expect(res.body.summary.schemaTables).toBe(25);
      expect(res.body.summary.customField).toBe('test');
    });
  });

  // =========================================================================
  // 3. Failed Run Rendering
  // =========================================================================

  describe('Failed run rendering', () => {
    it('failed runs appear in history with status=failed and zero findings', async () => {
      const scan2 = repo.createScan(projectId, {}, false);

      const id1 = createResultSet({ runLabel: 'Good Run', status: 'completed' });
      db.prepare("UPDATE scan_result_sets SET created_at = datetime('now', '-1 hour') WHERE id = ?").run(id1);

      createResultSet({
        scanId: scan2.id,
        runLabel: 'Bad Run',
        status: 'failed',
        totalFindings: 0,
        criticalCount: 0,
        majorCount: 0,
        minorCount: 0,
        infoCount: 0,
        dalcTotalUsd: 0,
        amplificationRatio: 0,
      });

      const res = await request(app)
        .get(`/api/scan-results/project/${projectId}/history`);

      expect(res.status).toBe(200);
      expect(res.body.items.length).toBe(2);

      // Newest first — the failed one
      const failedItem = res.body.items[0];
      expect(failedItem.status).toBe('failed');
      expect(failedItem.runLabel).toBe('Bad Run');
      expect(failedItem.totalFindings).toBe(0);
      expect(failedItem.dalcTotalUsd).toBe(0);

      // The completed one
      const completedItem = res.body.items[1];
      expect(completedItem.status).toBe('completed');
      expect(completedItem.runLabel).toBe('Good Run');
    });

    it('failed run is selectable by ID and returns zero findings', async () => {
      const failedId = createResultSet({
        runLabel: 'Failed Scan',
        status: 'failed',
        totalFindings: 0,
        criticalCount: 0,
        majorCount: 0,
        minorCount: 0,
        infoCount: 0,
        dalcTotalUsd: 0,
        amplificationRatio: 0,
        summary: { error: 'Connection timeout' },
      });

      // Load the failed result set
      const resSet = await request(app)
        .get(`/api/scan-results/${failedId}`);

      expect(resSet.status).toBe(200);
      expect(resSet.body.status).toBe('failed');
      expect(resSet.body.total_findings).toBe(0);
      expect(resSet.body.summary.error).toBe('Connection timeout');

      // Load findings — should be empty
      const resFindings = await request(app)
        .get(`/api/scan-results/${failedId}/findings`);

      expect(resFindings.status).toBe(200);
      expect(resFindings.body.findings).toEqual([]);
    });

    it('failed run with null scan_id appears in history', async () => {
      createResultSet({
        scanId: null,
        runLabel: 'Orphan Failed',
        status: 'failed',
        totalFindings: 0,
        criticalCount: 0,
        majorCount: 0,
        minorCount: 0,
        infoCount: 0,
        dalcTotalUsd: 0,
        amplificationRatio: 0,
      });

      const res = await request(app)
        .get(`/api/scan-results/project/${projectId}/history`);

      expect(res.status).toBe(200);
      expect(res.body.items.length).toBe(1);
      expect(res.body.items[0].status).toBe('failed');
      expect(res.body.items[0].scanId).toBeNull();
    });
  });

  // =========================================================================
  // 4. Empty State
  // =========================================================================

  describe('Empty state', () => {
    it('history returns empty array when no result sets exist', async () => {
      const res = await request(app)
        .get(`/api/scan-results/project/${projectId}/history`);

      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    it('history returns empty array for non-existent project', async () => {
      const res = await request(app)
        .get('/api/scan-results/project/non-existent-project/history');

      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
    });

    it('comparison returns 404 when no result sets exist', async () => {
      const res = await request(app)
        .get(`/api/scan-results/project/${projectId}/comparison`);

      expect(res.status).toBe(404);
    });

    it('by-scan returns 404 when no result set for the scan', async () => {
      const res = await request(app)
        .get(`/api/scan-results/by-scan/${scanId}`);

      expect(res.status).toBe(404);
    });
  });

  // =========================================================================
  // 5. Comparison Block Rendering
  // =========================================================================

  describe('Comparison block rendering', () => {
    it('returns comparison with numeric deltas when 2+ completed runs exist', async () => {
      const scan2 = repo.createScan(projectId, {}, false);

      // Previous run: 10 findings, $2M
      const id1 = createResultSet({
        runLabel: 'Previous',
        totalFindings: 10,
        criticalCount: 2,
        majorCount: 3,
        minorCount: 3,
        infoCount: 2,
        dalcTotalUsd: 2_000_000,
        dalcBaseUsd: 2_000_000,
        dalcLowUsd: 1_500_000,
        dalcHighUsd: 2_500_000,
        amplificationRatio: 1.2,
      });
      db.prepare("UPDATE scan_result_sets SET created_at = datetime('now', '-1 hour') WHERE id = ?").run(id1);

      // Latest run: 8 findings, $3M
      createResultSet({
        scanId: scan2.id,
        runLabel: 'Latest',
        totalFindings: 8,
        criticalCount: 1,
        majorCount: 2,
        minorCount: 3,
        infoCount: 2,
        dalcTotalUsd: 3_000_000,
        dalcBaseUsd: 3_000_000,
        dalcLowUsd: 2_000_000,
        dalcHighUsd: 4_000_000,
        amplificationRatio: 1.5,
      });

      const res = await request(app)
        .get(`/api/scan-results/project/${projectId}/comparison`);

      expect(res.status).toBe(200);

      // Latest
      expect(res.body.latest).toBeDefined();
      expect(res.body.latest.runLabel).toBe('Latest');
      expect(res.body.latest.totalFindings).toBe(8);

      // Previous
      expect(res.body.previous).toBeDefined();
      expect(res.body.previous.runLabel).toBe('Previous');

      // Deltas
      expect(res.body.delta).toBeDefined();
      expect(res.body.delta.totalFindings).toBe(-2);    // 8 - 10
      expect(res.body.delta.criticalCount).toBe(-1);    // 1 - 2
      expect(res.body.delta.majorCount).toBe(-1);       // 2 - 3
      expect(res.body.delta.dalcTotalUsd).toBe(1_000_000);
      expect(res.body.delta.dalcBaseUsd).toBe(1_000_000);
      expect(res.body.delta.dalcLowUsd).toBe(500_000);
      expect(res.body.delta.dalcHighUsd).toBe(1_500_000);
    });

    it('returns finding-level diff (added, removed, unchanged)', async () => {
      const scan2 = repo.createScan(projectId, {}, false);

      // Previous run: findings A, B
      const id1 = createResultSet({
        runLabel: 'Previous',
        totalFindings: 2,
        criticalCount: 1,
        majorCount: 1,
      });
      db.prepare("UPDATE scan_result_sets SET created_at = datetime('now', '-1 hour') WHERE id = ?").run(id1);
      scanResultRepo.bulkInsertFindings(id1, projectId, [
        makeFinding({ checkId: 'P1_A', severity: 'major', assetKey: 'users', title: 'Finding A' }),
        makeFinding({ checkId: 'P2_B', severity: 'critical', assetKey: 'orders', title: 'Finding B' }),
      ]);

      // Latest run: findings A (unchanged), C (added); B removed
      const id2 = createResultSet({
        scanId: scan2.id,
        runLabel: 'Latest',
        totalFindings: 2,
        majorCount: 1,
        minorCount: 1,
      });
      scanResultRepo.bulkInsertFindings(id2, projectId, [
        makeFinding({ checkId: 'P1_A', severity: 'major', assetKey: 'users', title: 'Finding A' }),
        makeFinding({ checkId: 'P3_C', severity: 'minor', assetKey: 'products', title: 'Finding C' }),
      ]);

      const res = await request(app)
        .get(`/api/scan-results/project/${projectId}/comparison`);

      expect(res.status).toBe(200);
      expect(res.body.findingsDiff).toBeDefined();

      const diff = res.body.findingsDiff;
      expect(diff.unchanged).toBe(1);
      expect(diff.added.length).toBe(1);
      expect(diff.added[0].checkId).toBe('P3_C');
      expect(diff.removed.length).toBe(1);
      expect(diff.removed[0].checkId).toBe('P2_B');
    });

    it('returns latest only (no delta) when single result set exists', async () => {
      createResultSet({ runLabel: 'Solo Run' });

      const res = await request(app)
        .get(`/api/scan-results/project/${projectId}/comparison`);

      expect(res.status).toBe(200);
      expect(res.body.latest).toBeDefined();
      expect(res.body.latest.runLabel).toBe('Solo Run');
      expect(res.body.previous).toBeNull();
      expect(res.body.delta).toBeNull();
      expect(res.body.findingsDiff).toBeNull();
    });

    it('comparison includes lifecycle fields for both runs', async () => {
      const scan2 = repo.createScan(projectId, {}, false);

      const id1 = createResultSet({
        runLabel: 'Previous',
        status: 'completed',
        startedAt: '2026-01-10T10:00:00Z',
        completedAt: '2026-01-10T10:05:00Z',
        durationMs: 300_000,
      });
      db.prepare("UPDATE scan_result_sets SET created_at = datetime('now', '-1 hour') WHERE id = ?").run(id1);

      createResultSet({
        scanId: scan2.id,
        runLabel: 'Latest',
        status: 'completed',
        startedAt: '2026-01-11T10:00:00Z',
        completedAt: '2026-01-11T10:03:00Z',
        durationMs: 180_000,
      });

      const res = await request(app)
        .get(`/api/scan-results/project/${projectId}/comparison`);

      expect(res.status).toBe(200);
      expect(res.body.latest.status).toBe('completed');
      expect(res.body.latest.durationMs).toBe(180_000);
      expect(res.body.previous.status).toBe('completed');
      expect(res.body.previous.durationMs).toBe(300_000);
    });
  });

  // =========================================================================
  // Helpers
  // =========================================================================

  function createResultSet(overrides: {
    scanId?: string | null;
    runLabel?: string;
    status?: 'completed' | 'failed' | 'partial';
    startedAt?: string;
    completedAt?: string;
    durationMs?: number;
    totalFindings?: number;
    criticalCount?: number;
    majorCount?: number;
    minorCount?: number;
    infoCount?: number;
    dalcTotalUsd?: number;
    dalcBaseUsd?: number;
    dalcLowUsd?: number;
    dalcHighUsd?: number;
    amplificationRatio?: number;
    summary?: Record<string, unknown>;
  } = {}): string {
    return scanResultRepo.createScanResultSet({
      projectId,
      scanId: overrides.scanId !== undefined ? overrides.scanId : scanId,
      runLabel: overrides.runLabel ?? 'Test Run',
      adapterType: 'postgresql',
      appVersion: '3.7.1',
      rulesetVersion: '1.0',
      dalcVersion: 'v4.0.0',
      status: overrides.status ?? 'completed',
      startedAt: overrides.startedAt ?? new Date().toISOString(),
      completedAt: overrides.completedAt ?? new Date().toISOString(),
      durationMs: overrides.durationMs,
      totalFindings: overrides.totalFindings ?? 5,
      criticalCount: overrides.criticalCount ?? 1,
      majorCount: overrides.majorCount ?? 2,
      minorCount: overrides.minorCount ?? 1,
      infoCount: overrides.infoCount ?? 1,
      dalcTotalUsd: overrides.dalcTotalUsd ?? 5_000_000,
      dalcBaseUsd: overrides.dalcBaseUsd ?? 5_000_000,
      dalcLowUsd: overrides.dalcLowUsd,
      dalcHighUsd: overrides.dalcHighUsd,
      amplificationRatio: overrides.amplificationRatio ?? 1.5,
      derivedApproach: 'kimball',
      summary: overrides.summary ?? { schemaTables: 25, schemaColumns: 150 },
    });
  }

  function makeFinding(overrides: Partial<NewResultFindingInput> & { checkId: string; title?: string }): NewResultFindingInput {
    return {
      checkId: overrides.checkId,
      property: overrides.property ?? 1,
      severity: overrides.severity ?? 'major',
      rawScore: overrides.rawScore ?? 0.5,
      title: overrides.title ?? 'Test Finding',
      description: overrides.description ?? 'A test finding',
      assetKey: overrides.assetKey ?? undefined,
      assetName: overrides.assetName ?? undefined,
      affectedObjects: overrides.affectedObjects ?? 10,
      totalObjects: overrides.totalObjects ?? 50,
      ratio: overrides.ratio ?? 0.2,
      remediation: overrides.remediation ?? 'Fix it',
      evidence: overrides.evidence ?? [],
      costCategories: overrides.costCategories ?? ['firefighting'],
      costWeights: overrides.costWeights ?? { firefighting: 1.0 },
    };
  }
});
