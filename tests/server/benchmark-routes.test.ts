/**
 * Route / Read-Model Tests for Benchmark Endpoints
 *
 * Verifies the three benchmark-related API routes:
 *   GET /api/scan-results/benchmark-packs
 *   GET /api/scan-results/:id/benchmark-comparison
 *   GET /api/scan-results/:id/baseline-comparison
 *
 * Uses the same db + repository infrastructure as scan-results.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { initDatabase } from '../../src/server/db/schema';
import { Repository } from '../../src/server/db/repository';
import { ScanResultRepository } from '../../src/server/db/scan-result-repository';
import type { NewResultFindingInput } from '../../src/server/db/scan-result-types';
import type Database from 'better-sqlite3';
import {
  getAvailablePacks,
  getPackById,
  getPackForSector,
  getDefaultPack,
  buildBenchmarkSummary,
  buildBaselineComparison,
} from '../../src/benchmark';

describe('Benchmark Route Read-Model', () => {
  let dataDir: string;
  let db: Database.Database;
  let repo: Repository;
  let scanResultRepo: ScanResultRepository;
  let projectId: string;
  let scanId: string;

  const validProject = {
    name: 'Benchmark Corp',
    sector: 'mining' as const,
    revenueAUD: 100_000_000,
    totalFTE: 500,
    dataEngineers: 10,
    avgSalaryAUD: 150_000,
    avgFTESalaryAUD: 100_000,
  };

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'dalc-benchmark-routes-test-'));
    db = initDatabase(dataDir);
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

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function createResultSet(overrides: {
    scanId?: string | null;
    runLabel?: string;
    status?: 'completed' | 'failed' | 'partial';
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
  } = {}): string {
    return scanResultRepo.createScanResultSet({
      projectId,
      scanId: overrides.scanId !== undefined ? overrides.scanId : scanId,
      runLabel: overrides.runLabel ?? 'Benchmark Test Run',
      adapterType: 'postgresql',
      appVersion: '3.7.1',
      rulesetVersion: '1.0',
      dalcVersion: 'v4.0.0',
      status: overrides.status ?? 'completed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 5000,
      totalFindings: overrides.totalFindings ?? 12,
      criticalCount: overrides.criticalCount ?? 2,
      majorCount: overrides.majorCount ?? 4,
      minorCount: overrides.minorCount ?? 3,
      infoCount: overrides.infoCount ?? 3,
      dalcTotalUsd: overrides.dalcTotalUsd ?? 50_000,
      dalcBaseUsd: overrides.dalcBaseUsd ?? 50_000,
      dalcLowUsd: overrides.dalcLowUsd,
      dalcHighUsd: overrides.dalcHighUsd,
      amplificationRatio: overrides.amplificationRatio ?? 1.5,
      derivedApproach: 'kimball',
      summary: { schemaTables: 25, schemaColumns: 150 },
    });
  }

  function makeFinding(overrides: Partial<NewResultFindingInput> & { checkId: string }): NewResultFindingInput {
    return {
      checkId: overrides.checkId,
      property: overrides.property ?? 1,
      severity: overrides.severity ?? 'major',
      rawScore: overrides.rawScore ?? 0.5,
      title: overrides.title ?? 'Test Finding',
      description: overrides.description ?? 'A test finding',
      affectedObjects: overrides.affectedObjects ?? 10,
      totalObjects: overrides.totalObjects ?? 50,
      ratio: overrides.ratio ?? 0.2,
      remediation: overrides.remediation ?? 'Fix it',
      evidence: overrides.evidence ?? [],
      costCategories: overrides.costCategories ?? ['firefighting'],
      costWeights: overrides.costWeights ?? { firefighting: 1.0 },
    };
  }

  // =========================================================================
  // GET /benchmark-packs — List available benchmark packs
  // =========================================================================

  describe('Benchmark Packs (read-model for GET /benchmark-packs)', () => {
    it('returns at least 3 packs', () => {
      const packs = getAvailablePacks();
      expect(packs.length).toBeGreaterThanOrEqual(3);
    });

    it('each pack has required fields', () => {
      const packs = getAvailablePacks();
      for (const pack of packs) {
        expect(pack.id).toBeTruthy();
        expect(pack.name).toBeTruthy();
        expect(pack.sector).toBeTruthy();
        expect(pack.version).toBeTruthy();
        expect(pack.dalcBaseUsd).toBeDefined();
        expect(pack.totalFindings).toBeDefined();
        expect(pack.highSeverityFindings).toBeDefined();
        expect(pack.highSeverityDensity).toBeDefined();
        expect(pack.propertyFindings).toBeDefined();
      }
    });

    it('default pack is present and retrievable by id', () => {
      const defaultPack = getDefaultPack();
      const byId = getPackById(defaultPack.id);
      expect(byId).not.toBeNull();
      expect(byId!.id).toBe(defaultPack.id);
      expect(byId!.name).toBe(defaultPack.name);
    });

    it('financial-services pack is resolvable by sector', () => {
      const pack = getPackForSector('financial-services');
      expect(pack.sector).toBe('financial-services');
    });

    it('healthcare pack is resolvable by sector', () => {
      const pack = getPackForSector('healthcare');
      expect(pack.sector).toBe('healthcare');
    });

    it('unknown sector falls back to default', () => {
      const defaultPack = getDefaultPack();
      const pack = getPackForSector('underwater-basket-weaving');
      expect(pack.id).toBe(defaultPack.id);
    });

    it('null sector falls back to default', () => {
      const defaultPack = getDefaultPack();
      const pack = getPackForSector(null);
      expect(pack.id).toBe(defaultPack.id);
    });
  });

  // =========================================================================
  // GET /:id/benchmark-comparison — Benchmark comparison for a result set
  // =========================================================================

  describe('Benchmark Comparison (read-model for GET /:id/benchmark-comparison)', () => {
    it('returns null for non-existent result set', () => {
      const pack = getDefaultPack();
      const summary = buildBenchmarkSummary(scanResultRepo, 'non-existent-id', pack);
      expect(summary).toBeNull();
    });

    it('returns BenchmarkSummary with default pack for valid result set', () => {
      const rsId = createResultSet();
      scanResultRepo.bulkInsertFindings(rsId, projectId, [
        makeFinding({ checkId: 'p1-test', property: 1 }),
        makeFinding({ checkId: 'p2-test', property: 2 }),
        makeFinding({ checkId: 'p5-test', property: 5 }),
      ]);

      const pack = getDefaultPack();
      const summary = buildBenchmarkSummary(scanResultRepo, rsId, pack);

      expect(summary).not.toBeNull();
      expect(summary!.packId).toBe(pack.id);
      expect(summary!.packName).toBe(pack.name);
      expect(summary!.packVersion).toBe(pack.version);
    });

    it('includes overall position classification', () => {
      const rsId = createResultSet({ dalcBaseUsd: 50_000, totalFindings: 12, criticalCount: 2, majorCount: 4 });
      const pack = getDefaultPack();
      const summary = buildBenchmarkSummary(scanResultRepo, rsId, pack)!;

      expect(['below_range', 'within_range', 'above_range', 'unknown']).toContain(summary.overallPosition);
      expect(summary.overallMessage).toBeTruthy();
    });

    it('includes DALC, totalFindings, highSeverity, density metric comparisons', () => {
      const rsId = createResultSet();
      const pack = getDefaultPack();
      const summary = buildBenchmarkSummary(scanResultRepo, rsId, pack)!;

      // Each metric comparison has expected structure
      for (const record of [
        summary.dalcComparison,
        summary.totalFindingsComparison,
        summary.highSeverityComparison,
        summary.highSeverityDensityComparison,
      ]) {
        expect(record.metric).toBeDefined();
        expect(record.metric.label).toBeTruthy();
        expect(record.metric.low).toBeDefined();
        expect(record.metric.high).toBeDefined();
        expect(typeof record.actualValue).toBe('number');
        expect(['below_range', 'within_range', 'above_range', 'unknown']).toContain(record.position);
        expect(record.message).toBeTruthy();
      }
    });

    it('includes property-level comparisons with correct structure', () => {
      const rsId = createResultSet({ totalFindings: 5 });
      scanResultRepo.bulkInsertFindings(rsId, projectId, [
        makeFinding({ checkId: 'p1-a', property: 1 }),
        makeFinding({ checkId: 'p1-b', property: 1 }),
        makeFinding({ checkId: 'p3-a', property: 3 }),
        makeFinding({ checkId: 'p5-a', property: 5 }),
        makeFinding({ checkId: 'p6-a', property: 6 }),
      ]);

      const pack = getDefaultPack();
      const summary = buildBenchmarkSummary(scanResultRepo, rsId, pack)!;

      expect(summary.propertyComparisons.length).toBeGreaterThan(0);
      for (const pc of summary.propertyComparisons) {
        expect(pc.property).toBeGreaterThanOrEqual(1);
        expect(pc.property).toBeLessThanOrEqual(8);
        expect(pc.propertyName).toBeTruthy();
        expect(typeof pc.actualFindingCount).toBe('number');
        expect(typeof pc.benchmarkLow).toBe('number');
        expect(typeof pc.benchmarkHigh).toBe('number');
        expect(['better_than_range', 'near_range', 'worse_than_range', 'unknown']).toContain(pc.position);
      }
    });

    it('uses explicit pack when packId is provided (financial-services)', () => {
      const rsId = createResultSet({ dalcBaseUsd: 200_000 });
      const fsPack = getPackForSector('financial-services');
      const summary = buildBenchmarkSummary(scanResultRepo, rsId, fsPack)!;

      expect(summary.packId).toBe(fsPack.id);
      expect(summary.packSector).toBe('financial-services');
    });

    it('includes key messages (1-3)', () => {
      const rsId = createResultSet();
      const pack = getDefaultPack();
      const summary = buildBenchmarkSummary(scanResultRepo, rsId, pack)!;

      expect(summary.keyMessages.length).toBeGreaterThanOrEqual(1);
      expect(summary.keyMessages.length).toBeLessThanOrEqual(3);
      for (const msg of summary.keyMessages) {
        expect(typeof msg).toBe('string');
        expect(msg.length).toBeGreaterThan(0);
      }
    });

    it('DALC within default range classifies as within_range', () => {
      // Default pack: DALC range $15K–$85K
      const rsId = createResultSet({ dalcBaseUsd: 50_000, dalcTotalUsd: 50_000 });
      const pack = getDefaultPack();
      const summary = buildBenchmarkSummary(scanResultRepo, rsId, pack)!;

      expect(summary.dalcComparison.position).toBe('within_range');
    });

    it('DALC above default range classifies as above_range', () => {
      // Default pack: DALC range $15K–$85K
      const rsId = createResultSet({ dalcBaseUsd: 200_000, dalcTotalUsd: 200_000 });
      const pack = getDefaultPack();
      const summary = buildBenchmarkSummary(scanResultRepo, rsId, pack)!;

      expect(summary.dalcComparison.position).toBe('above_range');
    });

    it('DALC below default range classifies as below_range', () => {
      // Default pack: DALC range $15K–$85K
      const rsId = createResultSet({ dalcBaseUsd: 5_000, dalcTotalUsd: 5_000 });
      const pack = getDefaultPack();
      const summary = buildBenchmarkSummary(scanResultRepo, rsId, pack)!;

      expect(summary.dalcComparison.position).toBe('below_range');
    });
  });

  // =========================================================================
  // GET /:id/baseline-comparison — Project baseline comparison
  // =========================================================================

  describe('Baseline Comparison (read-model for GET /:id/baseline-comparison)', () => {
    it('returns null when only 1 scan exists', () => {
      createResultSet();
      const baseline = buildBaselineComparison(scanResultRepo, projectId);
      expect(baseline).toBeNull();
    });

    it('returns baseline comparison when 2+ scans exist', () => {
      const scan2 = repo.createScan(projectId, {}, false);

      // Baseline (older)
      const id1 = createResultSet({
        runLabel: 'Baseline',
        dalcBaseUsd: 40_000,
        dalcTotalUsd: 40_000,
        totalFindings: 10,
        criticalCount: 1,
        majorCount: 3,
      });
      db.prepare("UPDATE scan_result_sets SET created_at = datetime('now', '-1 hour') WHERE id = ?").run(id1);

      // Latest (newer)
      createResultSet({
        scanId: scan2.id,
        runLabel: 'Latest',
        dalcBaseUsd: 60_000,
        dalcTotalUsd: 60_000,
        totalFindings: 15,
        criticalCount: 2,
        majorCount: 5,
      });

      const baseline = buildBaselineComparison(scanResultRepo, projectId);
      expect(baseline).not.toBeNull();
      expect(baseline!.baselineAvailable).toBe(true);
      expect(baseline!.baselineLabel).toBe('Baseline');
    });

    it('includes DALC direction and percent change', () => {
      const scan2 = repo.createScan(projectId, {}, false);

      const id1 = createResultSet({
        runLabel: 'Baseline',
        dalcBaseUsd: 40_000,
        dalcTotalUsd: 40_000,
      });
      db.prepare("UPDATE scan_result_sets SET created_at = datetime('now', '-1 hour') WHERE id = ?").run(id1);

      createResultSet({
        scanId: scan2.id,
        runLabel: 'Latest',
        dalcBaseUsd: 60_000,
        dalcTotalUsd: 60_000,
      });

      const baseline = buildBaselineComparison(scanResultRepo, projectId)!;

      expect(baseline.dalcDirection).toBe('worsening');
      expect(baseline.dalcDirectionLabel).toBe('Worsening');
      expect(baseline.dalcPercentChange).toBe(50); // (60K - 40K) / 40K * 100
    });

    it('includes finding count direction and delta', () => {
      const scan2 = repo.createScan(projectId, {}, false);

      const id1 = createResultSet({
        runLabel: 'Baseline',
        totalFindings: 20,
      });
      db.prepare("UPDATE scan_result_sets SET created_at = datetime('now', '-1 hour') WHERE id = ?").run(id1);

      createResultSet({
        scanId: scan2.id,
        runLabel: 'Latest',
        totalFindings: 10,
      });

      const baseline = buildBaselineComparison(scanResultRepo, projectId)!;

      expect(baseline.findingCountDirection).toBe('improving');
      expect(baseline.findingCountDirectionLabel).toBe('Improving');
      expect(baseline.findingCountDelta).toBe(-10);
    });

    it('includes high severity direction', () => {
      const scan2 = repo.createScan(projectId, {}, false);

      const id1 = createResultSet({
        runLabel: 'Baseline',
        criticalCount: 3,
        majorCount: 5,
      });
      db.prepare("UPDATE scan_result_sets SET created_at = datetime('now', '-1 hour') WHERE id = ?").run(id1);

      createResultSet({
        scanId: scan2.id,
        runLabel: 'Latest',
        criticalCount: 3,
        majorCount: 5,
      });

      const baseline = buildBaselineComparison(scanResultRepo, projectId)!;

      expect(baseline.highSeverityDirection).toBe('stable');
      expect(baseline.highSeverityDirectionLabel).toBe('Stable');
      expect(baseline.highSeverityDelta).toBe(0);
    });

    it('benchmark summary includes baseline when 2+ scans exist', () => {
      const scan2 = repo.createScan(projectId, {}, false);

      const id1 = createResultSet({
        runLabel: 'Baseline',
        dalcBaseUsd: 40_000,
        dalcTotalUsd: 40_000,
      });
      db.prepare("UPDATE scan_result_sets SET created_at = datetime('now', '-1 hour') WHERE id = ?").run(id1);

      const rsId = createResultSet({
        scanId: scan2.id,
        runLabel: 'Latest',
        dalcBaseUsd: 60_000,
        dalcTotalUsd: 60_000,
      });

      const pack = getDefaultPack();
      const summary = buildBenchmarkSummary(scanResultRepo, rsId, pack)!;

      expect(summary.baselineComparison).not.toBeNull();
      expect(summary.baselineComparison!.baselineAvailable).toBe(true);
    });

    it('benchmark summary has null baseline when only 1 scan exists', () => {
      const rsId = createResultSet();
      const pack = getDefaultPack();
      const summary = buildBenchmarkSummary(scanResultRepo, rsId, pack)!;

      expect(summary.baselineComparison).toBeNull();
    });
  });
});
