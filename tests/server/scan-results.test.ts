import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { initDatabase } from '../../src/server/db/schema';
import { Repository } from '../../src/server/db/repository';
import { ScanResultRepository } from '../../src/server/db/scan-result-repository';
import type { NewResultFindingInput } from '../../src/server/db/scan-result-types';
import type Database from 'better-sqlite3';

describe('Scan Result Storage', () => {
  let dataDir: string;
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
    dataDir = mkdtempSync(join(tmpdir(), 'dalc-scan-results-test-'));
    db = initDatabase(dataDir);
    repo = new Repository(db);
    scanResultRepo = new ScanResultRepository(db);

    // Create a project and scan for FK references
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
  // Schema / Migration
  // =========================================================================

  describe('Schema', () => {
    it('creates scan_result_sets and result_findings tables', () => {
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      ).all() as { name: string }[];
      const names = tables.map(t => t.name);

      expect(names).toContain('scan_result_sets');
      expect(names).toContain('result_findings');
    });

    it('creates indexes on scan_result_sets', () => {
      const indexes = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='scan_result_sets'"
      ).all() as { name: string }[];
      const names = indexes.map(i => i.name);

      expect(names).toContain('idx_result_sets_project');
      expect(names).toContain('idx_result_sets_scan');
      expect(names).toContain('idx_result_sets_created');
      expect(names).toContain('idx_result_sets_status');
    });

    it('creates indexes on result_findings', () => {
      const indexes = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='result_findings'"
      ).all() as { name: string }[];
      const names = indexes.map(i => i.name);

      expect(names).toContain('idx_result_findings_set');
      expect(names).toContain('idx_result_findings_project');
      expect(names).toContain('idx_result_findings_severity');
      expect(names).toContain('idx_result_findings_check');
    });

    it('schema version is current', () => {
      const row = db.prepare('SELECT MAX(version) as version FROM schema_version').get() as { version: number };
      expect(row.version).toBeGreaterThanOrEqual(13);
      expect(Number.isInteger(row.version)).toBe(true);
    });

    it('migration is idempotent (calling initDatabase again does not error)', () => {
      const db2 = initDatabase(dataDir);
      const row = db2.prepare('SELECT MAX(version) as version FROM schema_version').get() as { version: number };
      expect(row.version).toBeGreaterThanOrEqual(13);
      db2.close();
    });

    it('scan_result_sets has lifecycle and dalc band columns', () => {
      const cols = db.prepare("PRAGMA table_info('scan_result_sets')").all() as { name: string }[];
      const colNames = cols.map(c => c.name);

      expect(colNames).toContain('status');
      expect(colNames).toContain('started_at');
      expect(colNames).toContain('completed_at');
      expect(colNames).toContain('duration_ms');
      expect(colNames).toContain('dalc_base_usd');
      expect(colNames).toContain('dalc_low_usd');
      expect(colNames).toContain('dalc_high_usd');
    });

    it('scan_id column is nullable (no NOT NULL constraint)', () => {
      const cols = db.prepare("PRAGMA table_info('scan_result_sets')").all() as { name: string; notnull: number }[];
      const scanIdCol = cols.find(c => c.name === 'scan_id');
      expect(scanIdCol).toBeDefined();
      expect(scanIdCol!.notnull).toBe(0); // 0 = nullable
    });
  });

  // =========================================================================
  // Foreign Key Enforcement
  // =========================================================================

  describe('Foreign Key Enforcement', () => {
    it('rejects result set with non-existent project_id', () => {
      expect(() => {
        createResultSet({ projectIdOverride: 'non-existent-project' });
      }).toThrow();
    });

    it('rejects result set with non-existent scan_id', () => {
      expect(() => {
        createResultSet({ scanId: 'non-existent-scan' });
      }).toThrow();
    });

    it('allows null scan_id', () => {
      const id = createResultSet({ scanId: null });
      const row = scanResultRepo.getResultSetById(id);
      expect(row).toBeDefined();
      expect(row!.scan_id).toBeNull();
    });

    it('rejects finding with non-existent result_set_id', () => {
      expect(() => {
        scanResultRepo.bulkInsertFindings('non-existent-result-set', projectId, [
          makeFinding({ checkId: 'P1_TEST', title: 'Test' }),
        ]);
      }).toThrow();
    });
  });

  // =========================================================================
  // Lifecycle Fields
  // =========================================================================

  describe('Lifecycle Fields', () => {
    it('stores and retrieves status, started_at, completed_at, duration_ms', () => {
      const startedAt = '2026-01-15T10:00:00.000Z';
      const completedAt = '2026-01-15T10:05:00.000Z';
      const id = createResultSet({
        status: 'completed',
        startedAt,
        completedAt,
        durationMs: 300_000,
      });

      const row = scanResultRepo.getResultSetById(id);
      expect(row).toBeDefined();
      expect(row!.status).toBe('completed');
      expect(row!.started_at).toBe(startedAt);
      expect(row!.completed_at).toBe(completedAt);
      expect(row!.duration_ms).toBe(300_000);
    });

    it('stores failed status with zero findings', () => {
      const id = createResultSet({
        status: 'failed',
        totalFindings: 0,
        criticalCount: 0,
        majorCount: 0,
        minorCount: 0,
        infoCount: 0,
        dalcTotalUsd: 0,
        amplificationRatio: 0,
      });

      const row = scanResultRepo.getResultSetById(id);
      expect(row!.status).toBe('failed');
      expect(row!.total_findings).toBe(0);
      expect(row!.dalc_total_usd).toBe(0);
    });

    it('lifecycle fields appear in history list items', () => {
      createResultSet({ status: 'completed', durationMs: 12345 });
      const history = scanResultRepo.getScanHistoryForProject(projectId);
      expect(history.length).toBe(1);
      expect(history[0].status).toBe('completed');
      expect(history[0].durationMs).toBe(12345);
      expect(history[0].startedAt).toBeDefined();
    });
  });

  // =========================================================================
  // DALC Low/Base/High
  // =========================================================================

  describe('DALC Bands', () => {
    it('stores and retrieves dalc_base_usd', () => {
      const id = createResultSet({ dalcBaseUsd: 4_500_000 });
      const row = scanResultRepo.getResultSetById(id);
      expect(row!.dalc_base_usd).toBe(4_500_000);
    });

    it('stores and retrieves dalc_low_usd and dalc_high_usd', () => {
      const id = createResultSet({ dalcLowUsd: 3_000_000, dalcHighUsd: 7_000_000 });
      const row = scanResultRepo.getResultSetById(id);
      expect(row!.dalc_low_usd).toBe(3_000_000);
      expect(row!.dalc_high_usd).toBe(7_000_000);
    });

    it('dalc bands default to null when not provided', () => {
      const id = createResultSet();
      const row = scanResultRepo.getResultSetById(id);
      expect(row!.dalc_low_usd).toBeNull();
      expect(row!.dalc_high_usd).toBeNull();
    });

    it('dalc bands appear in history list items', () => {
      createResultSet({ dalcBaseUsd: 5_000_000, dalcLowUsd: 3_000_000, dalcHighUsd: 7_000_000 });
      const history = scanResultRepo.getScanHistoryForProject(projectId);
      expect(history[0].dalcBaseUsd).toBe(5_000_000);
      expect(history[0].dalcLowUsd).toBe(3_000_000);
      expect(history[0].dalcHighUsd).toBe(7_000_000);
    });

    it('comparison includes dalc band deltas', () => {
      const scan2 = repo.createScan(projectId, {}, false);

      const id1 = createResultSet({
        runLabel: 'Previous',
        dalcTotalUsd: 2_000_000,
        dalcBaseUsd: 2_000_000,
        dalcLowUsd: 1_500_000,
        dalcHighUsd: 2_500_000,
      });
      db.prepare("UPDATE scan_result_sets SET created_at = datetime('now', '-1 hour') WHERE id = ?").run(id1);

      createResultSet({
        scanId: scan2.id,
        runLabel: 'Latest',
        dalcTotalUsd: 3_000_000,
        dalcBaseUsd: 3_000_000,
        dalcLowUsd: 2_000_000,
        dalcHighUsd: 4_000_000,
      });

      const comparison = scanResultRepo.compareLatestToPrevious(projectId);
      expect(comparison!.delta!.dalcBaseUsd).toBe(1_000_000);
      expect(comparison!.delta!.dalcLowUsd).toBe(500_000);
      expect(comparison!.delta!.dalcHighUsd).toBe(1_500_000);
    });

    it('comparison returns null dalc band deltas when bands are null', () => {
      const scan2 = repo.createScan(projectId, {}, false);

      const id1 = createResultSet({ runLabel: 'Previous' });
      db.prepare("UPDATE scan_result_sets SET created_at = datetime('now', '-1 hour') WHERE id = ?").run(id1);

      createResultSet({ scanId: scan2.id, runLabel: 'Latest' });

      const comparison = scanResultRepo.compareLatestToPrevious(projectId);
      // dalcBaseUsd is set to dalcTotalUsd (5M) by default helper, so delta should be 0
      expect(comparison!.delta!.dalcBaseUsd).toBe(0);
      expect(comparison!.delta!.dalcLowUsd).toBeNull();
      expect(comparison!.delta!.dalcHighUsd).toBeNull();
    });
  });

  // =========================================================================
  // scan_id FK Durability — result sets survive scan deletion
  // =========================================================================

  describe('scan_id FK Durability', () => {
    it('result set survives when parent scan is deleted (scan_id becomes NULL)', () => {
      const resultSetId = createResultSet();

      // Verify result set exists with scan_id
      let row = scanResultRepo.getResultSetById(resultSetId);
      expect(row!.scan_id).toBe(scanId);

      // Delete the scan via raw SQL
      db.prepare('DELETE FROM scans WHERE id = ?').run(scanId);

      // Result set should still exist, scan_id should be NULL
      row = scanResultRepo.getResultSetById(resultSetId);
      expect(row).toBeDefined();
      expect(row!.scan_id).toBeNull();
    });

    it('findings survive when parent scan is deleted', () => {
      const resultSetId = createResultSet();
      scanResultRepo.bulkInsertFindings(resultSetId, projectId, [
        makeFinding({ checkId: 'P1_A', title: 'Finding A' }),
      ]);

      db.prepare('DELETE FROM scans WHERE id = ?').run(scanId);

      // Findings should still be accessible
      const findings = scanResultRepo.getFindingsByResultSetId(resultSetId);
      expect(findings.length).toBe(1);
      expect(findings[0].check_id).toBe('P1_A');
    });
  });

  // =========================================================================
  // CRUD — Create & Read
  // =========================================================================

  describe('CRUD', () => {
    it('creates a result set and retrieves it by ID', () => {
      const id = createResultSet();
      const row = scanResultRepo.getResultSetById(id);

      expect(row).toBeDefined();
      expect(row!.id).toBe(id);
      expect(row!.project_id).toBe(projectId);
      expect(row!.scan_id).toBe(scanId);
      expect(row!.run_label).toBe('Test Run');
      expect(row!.adapter_type).toBe('postgresql');
      expect(row!.app_version).toBe('3.7.1');
      expect(row!.dalc_version).toBe('v4.0.0');
      expect(row!.status).toBe('completed');
      expect(row!.total_findings).toBe(5);
      expect(row!.critical_count).toBe(1);
      expect(row!.major_count).toBe(2);
      expect(row!.minor_count).toBe(1);
      expect(row!.info_count).toBe(1);
      expect(row!.dalc_total_usd).toBe(5_000_000);
      expect(row!.dalc_base_usd).toBe(5_000_000);
      expect(row!.amplification_ratio).toBe(1.5);
      expect(row!.derived_approach).toBe('kimball');
    });

    it('retrieves a result set by scan ID', () => {
      const id = createResultSet();
      const row = scanResultRepo.getResultSetByScanId(scanId);

      expect(row).toBeDefined();
      expect(row!.id).toBe(id);
    });

    it('returns undefined for non-existent result set', () => {
      expect(scanResultRepo.getResultSetById('non-existent')).toBeUndefined();
    });

    it('returns undefined for non-existent scan ID', () => {
      expect(scanResultRepo.getResultSetByScanId('non-existent')).toBeUndefined();
    });

    it('bulk inserts findings and retrieves them', () => {
      const resultSetId = createResultSet();

      const findings: NewResultFindingInput[] = [
        makeFinding({ checkId: 'P1_SEM', severity: 'major', rawScore: 0.75, title: 'Semantic Issue' }),
        makeFinding({ checkId: 'P2_TYPE', severity: 'critical', rawScore: 0.9, title: 'Type Mismatch' }),
        makeFinding({ checkId: 'P3_NULL', severity: 'minor', rawScore: 0.3, title: 'Null Rate' }),
      ];

      scanResultRepo.bulkInsertFindings(resultSetId, projectId, findings);

      const rows = scanResultRepo.getFindingsByResultSetId(resultSetId);
      expect(rows.length).toBe(3);
      // Ordered by raw_score DESC
      expect(rows[0].check_id).toBe('P2_TYPE');
      expect(rows[0].raw_score).toBe(0.9);
      expect(rows[1].check_id).toBe('P1_SEM');
      expect(rows[2].check_id).toBe('P3_NULL');
    });

    it('parses JSON fields in findings', () => {
      const resultSetId = createResultSet();
      scanResultRepo.bulkInsertFindings(resultSetId, projectId, [
        makeFinding({
          checkId: 'P1_TEST',
          evidence: [{ schema: 'public', table: 'users', detail: 'issue' }],
          costCategories: ['firefighting', 'productivity'],
          costWeights: { firefighting: 0.6, productivity: 0.4 },
        }),
      ]);

      const parsed = scanResultRepo.getFindingsParsed(resultSetId);
      expect(parsed.length).toBe(1);
      expect(parsed[0].evidence).toEqual([{ schema: 'public', table: 'users', detail: 'issue' }]);
      expect(parsed[0].costCategories).toEqual(['firefighting', 'productivity']);
      expect(parsed[0].costWeights).toEqual({ firefighting: 0.6, productivity: 0.4 });
    });

    it('stores and retrieves summary_json', () => {
      const id = createResultSet({ summary: { schemaTables: 25, schemaColumns: 150 } });
      const row = scanResultRepo.getResultSetById(id);
      const summary = JSON.parse(row!.summary_json);
      expect(summary.schemaTables).toBe(25);
      expect(summary.schemaColumns).toBe(150);
    });
  });

  // =========================================================================
  // History Ordering
  // =========================================================================

  describe('History Ordering', () => {
    it('returns scan history newest first', () => {
      // Create multiple scans and result sets with staggered created_at
      const scan1 = repo.createScan(projectId, {}, false);
      const scan2 = repo.createScan(projectId, {}, false);
      const scan3 = repo.createScan(projectId, {}, false);

      const id1 = createResultSet({ scanId: scan1.id, runLabel: 'Run 1' });
      // Force different created_at timestamps by direct SQL
      db.prepare("UPDATE scan_result_sets SET created_at = datetime('now', '-2 hours') WHERE id = ?").run(id1);

      const id2 = createResultSet({ scanId: scan2.id, runLabel: 'Run 2' });
      db.prepare("UPDATE scan_result_sets SET created_at = datetime('now', '-1 hour') WHERE id = ?").run(id2);

      const id3 = createResultSet({ scanId: scan3.id, runLabel: 'Run 3' });
      // id3 has the default (now) so it's the newest

      const history = scanResultRepo.getScanHistoryForProject(projectId);
      expect(history.length).toBe(3);
      expect(history[0].runLabel).toBe('Run 3');
      expect(history[1].runLabel).toBe('Run 2');
      expect(history[2].runLabel).toBe('Run 1');
    });

    it('respects limit parameter', () => {
      const scan1 = repo.createScan(projectId, {}, false);
      const scan2 = repo.createScan(projectId, {}, false);
      const scan3 = repo.createScan(projectId, {}, false);

      createResultSet({ scanId: scan1.id, runLabel: 'Run 1' });
      createResultSet({ scanId: scan2.id, runLabel: 'Run 2' });
      createResultSet({ scanId: scan3.id, runLabel: 'Run 3' });

      const history = scanResultRepo.getScanHistoryForProject(projectId, 2);
      expect(history.length).toBe(2);
    });

    it('returns empty array for project with no result sets', () => {
      const history = scanResultRepo.getScanHistoryForProject('non-existent');
      expect(history).toEqual([]);
    });

    it('getLatestResultSetForProject returns the most recent', () => {
      const scan2 = repo.createScan(projectId, {}, false);

      const id1 = createResultSet({ runLabel: 'Older' });
      db.prepare("UPDATE scan_result_sets SET created_at = datetime('now', '-1 hour') WHERE id = ?").run(id1);

      createResultSet({ scanId: scan2.id, runLabel: 'Newer' });

      const latest = scanResultRepo.getLatestResultSetForProject(projectId);
      expect(latest).toBeDefined();
      expect(latest!.run_label).toBe('Newer');
    });

    it('getPreviousResultSetForProject returns the second most recent', () => {
      const scan2 = repo.createScan(projectId, {}, false);

      const id1 = createResultSet({ runLabel: 'Older' });
      db.prepare("UPDATE scan_result_sets SET created_at = datetime('now', '-1 hour') WHERE id = ?").run(id1);

      createResultSet({ scanId: scan2.id, runLabel: 'Newer' });

      const previous = scanResultRepo.getPreviousResultSetForProject(projectId);
      expect(previous).toBeDefined();
      expect(previous!.run_label).toBe('Older');
    });

    it('latest run is loaded by default (no explicit selection needed)', () => {
      const scan2 = repo.createScan(projectId, {}, false);

      const id1 = createResultSet({ runLabel: 'Run 1', totalFindings: 3 });
      db.prepare("UPDATE scan_result_sets SET created_at = datetime('now', '-1 hour') WHERE id = ?").run(id1);

      createResultSet({ scanId: scan2.id, runLabel: 'Run 2', totalFindings: 7 });

      const latest = scanResultRepo.getLatestResultSetForProject(projectId);
      expect(latest!.total_findings).toBe(7);
      expect(latest!.run_label).toBe('Run 2');
    });
  });

  // =========================================================================
  // Comparison / Diff
  // =========================================================================

  describe('Comparison', () => {
    it('returns null when no result sets exist', () => {
      const comparison = scanResultRepo.compareLatestToPrevious('non-existent');
      expect(comparison).toBeNull();
    });

    it('returns latest only (previous=null) when single result set exists', () => {
      createResultSet();

      const comparison = scanResultRepo.compareLatestToPrevious(projectId);
      expect(comparison).not.toBeNull();
      expect(comparison!.latest).toBeDefined();
      expect(comparison!.previous).toBeNull();
      expect(comparison!.delta).toBeNull();
      expect(comparison!.findingsDiff).toBeNull();
    });

    it('computes numeric deltas between latest and previous', () => {
      const scan2 = repo.createScan(projectId, {}, false);

      // Previous: 10 findings, $2M
      const id1 = createResultSet({
        runLabel: 'Previous',
        totalFindings: 10,
        criticalCount: 2,
        majorCount: 3,
        minorCount: 3,
        infoCount: 2,
        dalcTotalUsd: 2_000_000,
        amplificationRatio: 1.2,
      });
      db.prepare("UPDATE scan_result_sets SET created_at = datetime('now', '-1 hour') WHERE id = ?").run(id1);

      // Latest: 8 findings, $3M
      createResultSet({
        scanId: scan2.id,
        runLabel: 'Latest',
        totalFindings: 8,
        criticalCount: 1,
        majorCount: 2,
        minorCount: 3,
        infoCount: 2,
        dalcTotalUsd: 3_000_000,
        amplificationRatio: 1.5,
      });

      const comparison = scanResultRepo.compareLatestToPrevious(projectId);
      expect(comparison).not.toBeNull();
      expect(comparison!.delta).not.toBeNull();
      expect(comparison!.delta!.totalFindings).toBe(-2);    // 8 - 10
      expect(comparison!.delta!.criticalCount).toBe(-1);    // 1 - 2
      expect(comparison!.delta!.dalcTotalUsd).toBe(1_000_000); // 3M - 2M
    });

    it('computes finding-level diff by (check_id, asset_key, severity) tuple', () => {
      const scan2 = repo.createScan(projectId, {}, false);

      // Previous run: findings A, B, C
      const id1 = createResultSet({ runLabel: 'Previous', totalFindings: 3, criticalCount: 1, majorCount: 1, minorCount: 1 });
      db.prepare("UPDATE scan_result_sets SET created_at = datetime('now', '-1 hour') WHERE id = ?").run(id1);
      scanResultRepo.bulkInsertFindings(id1, projectId, [
        makeFinding({ checkId: 'P1_A', severity: 'major', assetKey: 'users', title: 'Finding A' }),
        makeFinding({ checkId: 'P2_B', severity: 'critical', assetKey: 'orders', title: 'Finding B' }),
        makeFinding({ checkId: 'P3_C', severity: 'minor', assetKey: 'products', title: 'Finding C' }),
      ]);

      // Latest run: findings A (unchanged), D (added); B and C removed
      const id2 = createResultSet({ scanId: scan2.id, runLabel: 'Latest', totalFindings: 2, majorCount: 1, minorCount: 1 });
      scanResultRepo.bulkInsertFindings(id2, projectId, [
        makeFinding({ checkId: 'P1_A', severity: 'major', assetKey: 'users', title: 'Finding A' }),
        makeFinding({ checkId: 'P4_D', severity: 'minor', assetKey: 'inventory', title: 'Finding D' }),
      ]);

      const comparison = scanResultRepo.compareLatestToPrevious(projectId);
      expect(comparison).not.toBeNull();
      expect(comparison!.findingsDiff).not.toBeNull();

      const diff = comparison!.findingsDiff!;
      expect(diff.unchanged).toBe(1); // A
      expect(diff.added.length).toBe(1);
      expect(diff.added[0].checkId).toBe('P4_D');
      expect(diff.removed.length).toBe(2);
      const removedIds = diff.removed.map(r => r.checkId).sort();
      expect(removedIds).toEqual(['P2_B', 'P3_C']);
    });

    it('comparison works from persisted runs with lifecycle fields', () => {
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

      const comparison = scanResultRepo.compareLatestToPrevious(projectId);
      expect(comparison).not.toBeNull();
      expect(comparison!.latest.status).toBe('completed');
      expect(comparison!.latest.durationMs).toBe(180_000);
      expect(comparison!.previous!.status).toBe('completed');
      expect(comparison!.previous!.durationMs).toBe(300_000);
    });
  });

  // =========================================================================
  // Cascade Delete
  // =========================================================================

  describe('Cascade Delete', () => {
    it('deletes a result set and its findings', () => {
      const resultSetId = createResultSet();
      scanResultRepo.bulkInsertFindings(resultSetId, projectId, [
        makeFinding({ checkId: 'P1_A', title: 'Finding A' }),
        makeFinding({ checkId: 'P2_B', title: 'Finding B' }),
      ]);

      // Verify findings exist
      expect(scanResultRepo.getFindingsByResultSetId(resultSetId).length).toBe(2);

      // Delete
      const deleted = scanResultRepo.deleteResultSet(resultSetId);
      expect(deleted).toBe(true);

      // Verify result set gone
      expect(scanResultRepo.getResultSetById(resultSetId)).toBeUndefined();

      // Verify findings cascade-deleted
      expect(scanResultRepo.getFindingsByResultSetId(resultSetId).length).toBe(0);
    });

    it('returns false when deleting non-existent result set', () => {
      expect(scanResultRepo.deleteResultSet('non-existent')).toBe(false);
    });

    it('cascade-deletes result sets when parent project is deleted', () => {
      const resultSetId = createResultSet();
      scanResultRepo.bulkInsertFindings(resultSetId, projectId, [
        makeFinding({ checkId: 'P1_A', title: 'Finding A' }),
      ]);

      // Delete the project via raw SQL (repo.archiveProject is soft-delete)
      db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);

      // Result set and findings should be cascade-deleted
      expect(scanResultRepo.getResultSetById(resultSetId)).toBeUndefined();
      expect(scanResultRepo.getFindingsByResultSetId(resultSetId).length).toBe(0);
    });
  });

  // =========================================================================
  // Immutability (never overwrites)
  // =========================================================================

  describe('Immutability', () => {
    it('multiple scans create separate result sets, never overwrite', () => {
      const scan2 = repo.createScan(projectId, {}, false);
      const scan3 = repo.createScan(projectId, {}, false);

      const id1 = createResultSet({ runLabel: 'Run 1' });
      const id2 = createResultSet({ scanId: scan2.id, runLabel: 'Run 2' });
      const id3 = createResultSet({ scanId: scan3.id, runLabel: 'Run 3' });

      // All three exist independently
      expect(scanResultRepo.getResultSetById(id1)).toBeDefined();
      expect(scanResultRepo.getResultSetById(id2)).toBeDefined();
      expect(scanResultRepo.getResultSetById(id3)).toBeDefined();

      // History contains all three
      const history = scanResultRepo.getScanHistoryForProject(projectId);
      expect(history.length).toBe(3);
    });
  });

  // =========================================================================
  // Failed Run Persistence
  // =========================================================================

  describe('Failed Run Persistence', () => {
    it('can create a failed result set with zero findings', () => {
      const id = createResultSet({
        status: 'failed',
        runLabel: 'Failed Run',
        totalFindings: 0,
        criticalCount: 0,
        majorCount: 0,
        minorCount: 0,
        infoCount: 0,
        dalcTotalUsd: 0,
        amplificationRatio: 0,
        summary: { error: 'Connection refused' },
      });

      const row = scanResultRepo.getResultSetById(id);
      expect(row).toBeDefined();
      expect(row!.status).toBe('failed');
      expect(row!.total_findings).toBe(0);

      const summary = JSON.parse(row!.summary_json);
      expect(summary.error).toBe('Connection refused');
    });

    it('failed runs appear in history alongside completed runs', () => {
      const scan2 = repo.createScan(projectId, {}, false);

      const id1 = createResultSet({ runLabel: 'Completed Run', status: 'completed' });
      db.prepare("UPDATE scan_result_sets SET created_at = datetime('now', '-1 hour') WHERE id = ?").run(id1);

      createResultSet({
        scanId: scan2.id,
        runLabel: 'Failed Run',
        status: 'failed',
        totalFindings: 0,
        criticalCount: 0,
        majorCount: 0,
        minorCount: 0,
        infoCount: 0,
        dalcTotalUsd: 0,
        amplificationRatio: 0,
      });

      const history = scanResultRepo.getScanHistoryForProject(projectId);
      expect(history.length).toBe(2);
      expect(history[0].status).toBe('failed');
      expect(history[1].status).toBe('completed');
    });

    it('failed result set with null scan_id persists correctly', () => {
      const id = createResultSet({
        scanId: null,
        status: 'failed',
        runLabel: 'Orphan Failed Run',
        totalFindings: 0,
        criticalCount: 0,
        majorCount: 0,
        minorCount: 0,
        infoCount: 0,
        dalcTotalUsd: 0,
        amplificationRatio: 0,
      });

      const row = scanResultRepo.getResultSetById(id);
      expect(row).toBeDefined();
      expect(row!.status).toBe('failed');
      expect(row!.scan_id).toBeNull();
    });
  });

  // =========================================================================
  // Helpers
  // =========================================================================

  function createResultSet(overrides: {
    projectIdOverride?: string;
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
      projectId: overrides.projectIdOverride ?? projectId,
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
