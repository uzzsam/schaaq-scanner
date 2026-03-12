/**
 * Route / Read-Model Tests for Manifest Endpoint
 *
 * Verifies the manifest API route:
 *   GET /api/scan-results/:id/manifest
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
import { buildAssessmentManifest } from '../../src/manifest';

describe('Manifest Route Read-Model', () => {
  let dataDir: string;
  let db: Database.Database;
  let repo: Repository;
  let scanResultRepo: ScanResultRepository;
  let projectId: string;
  let scanId: string;

  const validProject = {
    name: 'Manifest Corp',
    sector: 'mining' as const,
    revenueAUD: 100_000_000,
    totalFTE: 500,
    dataEngineers: 10,
    avgSalaryAUD: 150_000,
    avgFTESalaryAUD: 100_000,
  };

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'dalc-manifest-routes-test-'));
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

  function createResultSet(): string {
    return scanResultRepo.createScanResultSet({
      projectId,
      scanId,
      runLabel: 'Manifest Test Run',
      adapterType: 'postgresql',
      appVersion: '3.7.1',
      rulesetVersion: 'v1.0.0',
      dalcVersion: 'v4.0.0',
      status: 'completed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 8000,
      totalFindings: 3,
      criticalCount: 1,
      majorCount: 1,
      minorCount: 1,
      infoCount: 0,
      dalcTotalUsd: 200_000,
      dalcBaseUsd: 180_000,
      amplificationRatio: 1.11,
      derivedApproach: 'sector_calibrated',
      summary: { schemaTables: 15, schemaColumns: 80 },
    });
  }

  function makeFinding(checkId: string, property: number): NewResultFindingInput {
    return {
      checkId,
      property,
      severity: 'major',
      rawScore: 0.6,
      title: `Finding ${checkId}`,
      description: 'A test finding',
      affectedObjects: 5,
      totalObjects: 20,
      ratio: 0.25,
      remediation: 'Fix it',
      evidence: [],
      costCategories: ['firefighting', 'dataQuality'],
      costWeights: { firefighting: 0.7, dataQuality: 0.3 },
    };
  }

  /** Simulate the route handler logic */
  function simulateManifestRoute(resultSetId: string) {
    const row = scanResultRepo.getResultSetById(resultSetId);
    if (!row) return null;
    const findings = scanResultRepo.getFindingsByResultSetId(resultSetId);
    const history = scanResultRepo.getScanHistoryForProject(row.project_id, 200);
    const completedCount = history.filter(h => h.status === 'completed').length;
    return buildAssessmentManifest(row, findings, completedCount);
  }

  // =========================================================================
  // GET /:id/manifest — full integration from DB through service
  // =========================================================================

  describe('Manifest (read-model for GET /:id/manifest)', () => {
    it('returns a complete manifest for a result set with findings', () => {
      const rsId = createResultSet();
      scanResultRepo.bulkInsertFindings(rsId, projectId, [
        makeFinding('P1_IDENTITY_01', 1),
        makeFinding('P3_OWNERSHIP_01', 3),
        makeFinding('P5_GOVERNANCE_01', 5),
      ]);

      const manifest = simulateManifestRoute(rsId);
      expect(manifest).not.toBeNull();
      expect(manifest!.manifestVersion).toBe('1.0.0');
      expect(manifest!.versions.appVersion).toBe('3.7.1');
      expect(manifest!.versions.dalcVersion).toBe('v4.0.0');
      expect(manifest!.run.resultSetId).toBe(rsId);
      expect(manifest!.run.adapterType).toBe('postgresql');
      expect(manifest!.run.status).toBe('completed');
      expect(manifest!.coverage.totalFindings).toBe(3);
      expect(manifest!.coverage.propertiesCovered).toBe(3);
      expect(manifest!.coverage.dalcTotalUsd).toBe(200_000);
      expect(manifest!.components.coreFindings).toBe(true);
      expect(manifest!.components.benchmarkAvailable).toBe(true);
    });

    it('returns manifest with empty findings', () => {
      const rsId = createResultSet();
      const manifest = simulateManifestRoute(rsId);
      expect(manifest).not.toBeNull();
      expect(manifest!.coverage.propertiesCovered).toBe(0);
      // coreFindings is false because no findings in DB (row has count but no rows)
      expect(manifest!.components.coreFindings).toBe(false);
    });

    it('manifest is deterministic across repeated calls', () => {
      const rsId = createResultSet();
      scanResultRepo.bulkInsertFindings(rsId, projectId, [
        makeFinding('P2_REF_01', 2),
      ]);

      const m1 = simulateManifestRoute(rsId);
      const m2 = simulateManifestRoute(rsId);
      expect(m1!.versions).toEqual(m2!.versions);
      expect(m1!.run.resultSetId).toBe(m2!.run.resultSetId);
      expect(m1!.coverage.propertiesCovered).toBe(m2!.coverage.propertiesCovered);
      expect(m1!.components).toEqual(m2!.components);
    });
  });
});
