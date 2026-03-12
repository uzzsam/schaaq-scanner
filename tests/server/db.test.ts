import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { initDatabase } from '../../src/server/db/schema';
import { Repository } from '../../src/server/db/repository';
import type Database from 'better-sqlite3';

describe('SQLite Database', () => {
  let dataDir: string;
  let db: Database.Database;
  let repo: Repository;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'dalc-test-'));
    db = initDatabase(dataDir);
    repo = new Repository(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  // =========================================================================
  // Schema initialisation
  // =========================================================================

  describe('initDatabase', () => {
    it('creates all required tables', () => {
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
      ).all() as { name: string }[];
      const names = tables.map(t => t.name);

      expect(names).toContain('projects');
      expect(names).toContain('scans');
      expect(names).toContain('scan_findings');
      expect(names).toContain('transform_findings');
      expect(names).toContain('settings');
      expect(names).toContain('schema_version');
    });

    it('sets WAL journal mode', () => {
      const result = db.pragma('journal_mode') as { journal_mode: string }[];
      expect(result[0].journal_mode).toBe('wal');
    });

    it('has foreign keys enabled', () => {
      const result = db.pragma('foreign_keys') as { foreign_keys: number }[];
      expect(result[0].foreign_keys).toBe(1);
    });

    it('records schema version', () => {
      const row = db.prepare('SELECT MAX(version) as version FROM schema_version').get() as { version: number };
      // Schema version advances as migrations are added; verify it's at least the minimum
      // known version and that the value is a positive integer.
      expect(row.version).toBeGreaterThanOrEqual(13);
      expect(Number.isInteger(row.version)).toBe(true);
    });

    it('is idempotent (calling again does not error)', () => {
      const db2 = initDatabase(dataDir);
      const row = db2.prepare('SELECT MAX(version) as version FROM schema_version').get() as { version: number };
      expect(row.version).toBeGreaterThanOrEqual(13);
      db2.close();
    });
  });

  // =========================================================================
  // Projects CRUD
  // =========================================================================

  describe('Projects', () => {
    const validProject = {
      name: 'Acme Mining Corp',
      sector: 'mining' as const,
      revenueAUD: 250_000_000,
      totalFTE: 1200,
      dataEngineers: 15,
      avgSalaryAUD: 160_000,
      avgFTESalaryAUD: 110_000,
    };

    it('creates a project and returns it', () => {
      const project = repo.createProject(validProject);

      expect(project.id).toBeTruthy();
      expect(project.name).toBe('Acme Mining Corp');
      expect(project.sector).toBe('mining');
      expect(project.revenue_aud).toBe(250_000_000);
      expect(project.total_fte).toBe(1200);
      expect(project.data_engineers).toBe(15);
      expect(project.avg_salary_aud).toBe(160_000);
      expect(project.avg_fte_salary_aud).toBe(110_000);
      expect(project.archived).toBe(0);
    });

    it('assigns default AI budget as 0.5% of revenue', () => {
      const project = repo.createProject(validProject);
      expect(project.ai_budget_aud).toBe(250_000_000 * 0.005);
    });

    it('uses custom AI budget when provided', () => {
      const project = repo.createProject({ ...validProject, aiBudgetAUD: 500_000 });
      expect(project.ai_budget_aud).toBe(500_000);
    });

    it('assigns default canonical investment', () => {
      const project = repo.createProject(validProject);
      expect(project.canonical_investment_aud).toBe(1_350_000);
    });

    it('retrieves a project by id', () => {
      const created = repo.createProject(validProject);
      const fetched = repo.getProject(created.id);
      expect(fetched).toBeDefined();
      expect(fetched!.id).toBe(created.id);
      expect(fetched!.name).toBe('Acme Mining Corp');
    });

    it('returns undefined for non-existent project', () => {
      const fetched = repo.getProject('non-existent-id');
      expect(fetched).toBeUndefined();
    });

    it('lists all non-archived projects', () => {
      repo.createProject({ ...validProject, name: 'First' });
      repo.createProject({ ...validProject, name: 'Second' });

      const projects = repo.listProjects();
      expect(projects.length).toBe(2);
      const names = projects.map(p => p.name);
      expect(names).toContain('First');
      expect(names).toContain('Second');
    });

    it('updates a project with partial fields', () => {
      const created = repo.createProject(validProject);
      const updated = repo.updateProject(created.id, { name: 'New Name', revenueAUD: 500_000_000 });

      expect(updated).toBeDefined();
      expect(updated!.name).toBe('New Name');
      expect(updated!.revenue_aud).toBe(500_000_000);
      // Unchanged fields preserved
      expect(updated!.sector).toBe('mining');
      expect(updated!.total_fte).toBe(1200);
    });

    it('updates database connection fields', () => {
      const created = repo.createProject(validProject);
      const updated = repo.updateProject(created.id, {
        database: { type: 'postgresql', host: 'db.example.com', port: 5433 },
      });

      expect(updated!.db_host).toBe('db.example.com');
      expect(updated!.db_port).toBe(5433);
    });

    it('updates thresholds JSON', () => {
      const created = repo.createProject(validProject);
      const updated = repo.updateProject(created.id, {
        thresholds: { entitySimilarityThreshold: 0.8, nullRateThreshold: 0.5 },
      });

      const parsed = JSON.parse(updated!.thresholds_json);
      expect(parsed.entitySimilarityThreshold).toBe(0.8);
      expect(parsed.nullRateThreshold).toBe(0.5);
    });

    it('archives a project (soft delete)', () => {
      const created = repo.createProject(validProject);
      repo.archiveProject(created.id);

      // getProject excludes archived
      const fetched = repo.getProject(created.id);
      expect(fetched).toBeUndefined();

      // But it still exists in the database
      const raw = db.prepare('SELECT * FROM projects WHERE id = ?').get(created.id) as any;
      expect(raw.archived).toBe(1);
    });

    it('archived projects are excluded from list', () => {
      const p1 = repo.createProject({ ...validProject, name: 'Active' });
      const p2 = repo.createProject({ ...validProject, name: 'Archived' });
      repo.archiveProject(p2.id);

      const projects = repo.listProjects();
      expect(projects.length).toBe(1);
      expect(projects[0].name).toBe('Active');
    });

    it('stores database config with schemas as JSON', () => {
      const project = repo.createProject({
        ...validProject,
        database: {
          type: 'postgresql',
          host: 'localhost',
          port: 5432,
          schemas: ['public', 'mining', 'environmental'],
        },
      });

      const schemas = JSON.parse(project.db_schemas);
      expect(schemas).toEqual(['public', 'mining', 'environmental']);
    });
  });

  // =========================================================================
  // Scans
  // =========================================================================

  describe('Scans', () => {
    let projectId: string;

    beforeEach(() => {
      const project = repo.createProject({
        name: 'Test Corp',
        sector: 'mining',
        revenueAUD: 100_000_000,
        totalFTE: 500,
        dataEngineers: 10,
        avgSalaryAUD: 150_000,
        avgFTESalaryAUD: 100_000,
      });
      projectId = project.id;
    });

    it('creates a scan with pending status', () => {
      const scan = repo.createScan(projectId, { test: true }, false);

      expect(scan.id).toBeTruthy();
      expect(scan.project_id).toBe(projectId);
      expect(scan.status).toBe('pending');
      expect(scan.progress).toBe(0);
      expect(scan.is_dry_run).toBe(0);
    });

    it('creates a dry-run scan', () => {
      const scan = repo.createScan(projectId, { test: true }, true);
      expect(scan.is_dry_run).toBe(1);
    });

    it('stores config snapshot as JSON', () => {
      const config = { organisation: { name: 'Test' }, thresholds: { foo: 'bar' } };
      const scan = repo.createScan(projectId, config, false);
      expect(JSON.parse(scan.config_snapshot)).toEqual(config);
    });

    it('retrieves a scan by id', () => {
      const created = repo.createScan(projectId, {}, false);
      const fetched = repo.getScan(created.id);
      expect(fetched).toBeDefined();
      expect(fetched!.id).toBe(created.id);
    });

    it('returns undefined for non-existent scan', () => {
      expect(repo.getScan('non-existent')).toBeUndefined();
    });

    it('lists scans for a project', () => {
      repo.createScan(projectId, {}, false);
      repo.createScan(projectId, {}, true);

      const scans = repo.listScans(projectId);
      expect(scans.length).toBe(2);
    });

    it('updates scan status and progress', () => {
      const scan = repo.createScan(projectId, {}, false);
      repo.updateScanStatus(scan.id, {
        status: 'running',
        progress: 0.5,
        currentStep: 'Running checks',
        startedAt: '2024-01-01T00:00:00Z',
      });

      const updated = repo.getScan(scan.id)!;
      expect(updated.status).toBe('running');
      expect(updated.progress).toBe(0.5);
      expect(updated.current_step).toBe('Running checks');
      expect(updated.started_at).toBe('2024-01-01T00:00:00Z');
    });

    it('completes a scan with results', () => {
      const scan = repo.createScan(projectId, {}, false);
      repo.completeScan(scan.id, {
        engineInput: { sector: 'mining' },
        engineResult: { finalTotal: 5_000_000 },
        totalFindings: 15,
        criticalCount: 2,
        majorCount: 5,
        minorCount: 6,
        infoCount: 2,
        totalCost: 5_000_000,
        amplificationRatio: 1.5,
        derivedApproach: 'mixed-kimball',
        schemaTables: 25,
        schemaColumns: 150,
        schemaCount: 3,
        dbVersion: 'PostgreSQL 16.0',
      });

      const completed = repo.getScan(scan.id)!;
      expect(completed.status).toBe('completed');
      expect(completed.progress).toBe(1.0);
      expect(completed.total_findings).toBe(15);
      expect(completed.critical_count).toBe(2);
      expect(completed.major_count).toBe(5);
      expect(completed.minor_count).toBe(6);
      expect(completed.info_count).toBe(2);
      expect(completed.total_cost).toBe(5_000_000);
      expect(completed.amplification_ratio).toBe(1.5);
      expect(completed.derived_approach).toBe('mixed-kimball');
      expect(completed.schema_tables).toBe(25);
      expect(completed.schema_columns).toBe(150);
      expect(completed.schema_count).toBe(3);
      expect(completed.db_version).toBe('PostgreSQL 16.0');
      expect(completed.current_step).toBe('Complete');

      // JSON blobs parseable
      expect(JSON.parse(completed.engine_input_json!)).toEqual({ sector: 'mining' });
      expect(JSON.parse(completed.engine_result_json!)).toEqual({ finalTotal: 5_000_000 });
    });

    it('fails a scan with error message', () => {
      const scan = repo.createScan(projectId, {}, false);
      repo.failScan(scan.id, 'Connection refused');

      const failed = repo.getScan(scan.id)!;
      expect(failed.status).toBe('failed');
      expect(failed.error_message).toBe('Connection refused');
      expect(failed.current_step).toBe('Failed');
    });
  });

  // =========================================================================
  // Findings
  // =========================================================================

  describe('Findings', () => {
    let projectId: string;
    let scanId: string;

    beforeEach(() => {
      const project = repo.createProject({
        name: 'Test Corp',
        sector: 'mining',
        revenueAUD: 100_000_000,
        totalFTE: 500,
        dataEngineers: 10,
        avgSalaryAUD: 150_000,
        avgFTESalaryAUD: 100_000,
      });
      projectId = project.id;
      const scan = repo.createScan(projectId, {}, false);
      scanId = scan.id;
    });

    it('inserts and retrieves findings', () => {
      const findings = [
        {
          checkId: 'P1_SEMANTIC',
          property: 1,
          severity: 'major',
          rawScore: 0.75,
          title: 'Semantic Identity Issues',
          description: 'Similar column names across schemas',
          affectedObjects: 10,
          totalObjects: 50,
          ratio: 0.2,
          remediation: 'Standardise column naming',
          evidence: [{ schema: 'public', table: 'users', detail: 'test' }],
          costCategories: ['firefighting', 'dataQuality'],
          costWeights: { firefighting: 0.5, dataQuality: 0.5 },
        },
        {
          checkId: 'P2_TYPE',
          property: 2,
          severity: 'critical',
          rawScore: 0.9,
          title: 'Type Inconsistency',
          description: 'Status column has different types',
          affectedObjects: 3,
          totalObjects: 3,
          ratio: 1.0,
          remediation: 'Align types',
          evidence: [],
          costCategories: ['integration'],
          costWeights: { integration: 1.0 },
        },
      ];

      repo.insertFindings(scanId, findings);
      const retrieved = repo.getFindings(scanId);

      expect(retrieved.length).toBe(2);
      // Ordered by raw_score DESC
      expect(retrieved[0].check_id).toBe('P2_TYPE');
      expect(retrieved[0].raw_score).toBe(0.9);
      expect(retrieved[1].check_id).toBe('P1_SEMANTIC');
    });

    it('deserialises JSON fields on retrieval', () => {
      repo.insertFindings(scanId, [{
        checkId: 'P1_TEST',
        property: 1,
        severity: 'minor',
        rawScore: 0.3,
        title: 'Test Finding',
        evidence: [{ schema: 'public', table: 'users', detail: 'found issue' }],
        costCategories: ['firefighting', 'productivity'],
        costWeights: { firefighting: 0.6, productivity: 0.4 },
      }]);

      const findings = repo.getFindings(scanId);
      expect(findings[0].evidence).toEqual([{ schema: 'public', table: 'users', detail: 'found issue' }]);
      expect(findings[0].costCategories).toEqual(['firefighting', 'productivity']);
      expect(findings[0].costWeights).toEqual({ firefighting: 0.6, productivity: 0.4 });
    });

    it('filters findings by property', () => {
      repo.insertFindings(scanId, [
        { checkId: 'P1_A', property: 1, severity: 'major', rawScore: 0.5, title: 'P1 finding' },
        { checkId: 'P2_A', property: 2, severity: 'minor', rawScore: 0.3, title: 'P2 finding' },
        { checkId: 'P1_B', property: 1, severity: 'info', rawScore: 0.1, title: 'P1 another' },
      ]);

      const p1Findings = repo.getFindingsByProperty(scanId, 1);
      expect(p1Findings.length).toBe(2);
      expect(p1Findings.every((f: any) => f.property === 1)).toBe(true);

      const p2Findings = repo.getFindingsByProperty(scanId, 2);
      expect(p2Findings.length).toBe(1);
    });

    it('returns empty array for scan with no findings', () => {
      const findings = repo.getFindings(scanId);
      expect(findings).toEqual([]);
    });
  });

  // =========================================================================
  // Transform Findings
  // =========================================================================

  describe('Transform Findings', () => {
    let projectId: string;
    let scanId: string;

    beforeEach(() => {
      const project = repo.createProject({
        name: 'Test Corp',
        sector: 'mining',
        revenueAUD: 100_000_000,
        totalFTE: 500,
        dataEngineers: 10,
        avgSalaryAUD: 150_000,
        avgFTESalaryAUD: 100_000,
      });
      projectId = project.id;
      const scan = repo.createScan(projectId, {}, false);
      scanId = scan.id;
    });

    it('inserts and retrieves transform findings', () => {
      const findings = [
        {
          checkId: 'SD-1',
          category: 'semantic-drift',
          severity: 'major',
          title: 'Alias Misalignment',
          description: 'Revenue vs Income naming conflict',
          affectedMappings: 5,
          totalMappings: 50,
          ratio: 0.1,
          remediation: 'Standardise to revenue',
          evidence: [{ sourceTable: 'orders', sourceColumn: 'revenue', targetTable: 'fact_orders', targetColumn: 'income', detail: 'revenue/income conflict' }],
          costCategories: ['dataQuality', 'firefighting'],
          costWeights: { dataQuality: 0.4, firefighting: 0.2 },
        },
        {
          checkId: 'OB-1',
          category: 'ontological-break',
          severity: 'critical',
          title: 'Entity Merging',
          description: 'Multiple source tables merged into one target',
          affectedMappings: 12,
          totalMappings: 50,
          ratio: 0.24,
          remediation: 'Document entity resolution logic',
          evidence: [],
          costCategories: ['integration'],
          costWeights: { integration: 0.5 },
        },
      ];

      repo.insertTransformFindings(scanId, findings);
      const retrieved = repo.getTransformFindings(scanId);

      expect(retrieved.length).toBe(2);
      expect(retrieved.some((f: any) => f.check_id === 'SD-1')).toBe(true);
      expect(retrieved.some((f: any) => f.check_id === 'OB-1')).toBe(true);
    });

    it('deserialises JSON fields on retrieval', () => {
      repo.insertTransformFindings(scanId, [{
        checkId: 'SD-2',
        category: 'semantic-drift',
        severity: 'minor',
        title: 'Type Coercion',
        evidence: [{ sourceTable: 's', sourceColumn: 'c', targetTable: 't', targetColumn: 'c', detail: 'timestamp to date' }],
        costCategories: ['dataQuality'],
        costWeights: { dataQuality: 0.3 },
      }]);

      const findings = repo.getTransformFindings(scanId);
      expect(findings[0].evidence).toEqual([{ sourceTable: 's', sourceColumn: 'c', targetTable: 't', targetColumn: 'c', detail: 'timestamp to date' }]);
      expect(findings[0].costCategories).toEqual(['dataQuality']);
      expect(findings[0].costWeights).toEqual({ dataQuality: 0.3 });
    });

    it('filters transform findings by category', () => {
      repo.insertTransformFindings(scanId, [
        { checkId: 'SD-1', category: 'semantic-drift', severity: 'major', title: 'SD finding' },
        { checkId: 'OB-1', category: 'ontological-break', severity: 'minor', title: 'OB finding' },
        { checkId: 'SD-2', category: 'semantic-drift', severity: 'minor', title: 'SD finding 2' },
      ]);

      const sdFindings = repo.getTransformFindingsByCategory(scanId, 'semantic-drift');
      expect(sdFindings.length).toBe(2);
      expect(sdFindings.every((f: any) => f.category === 'semantic-drift')).toBe(true);

      const obFindings = repo.getTransformFindingsByCategory(scanId, 'ontological-break');
      expect(obFindings.length).toBe(1);
    });

    it('updates scan transform summary', () => {
      repo.updateScanTransformSummary(scanId, {
        transformTotal: 7,
        transformSdCount: 4,
        transformObCount: 3,
        transformCritical: 1,
        transformMajor: 3,
        transformMinor: 3,
        transformMappings: 85,
      });

      const scan = repo.getScan(scanId)!;
      expect(scan.transform_total).toBe(7);
      expect(scan.transform_sd_count).toBe(4);
      expect(scan.transform_ob_count).toBe(3);
      expect(scan.transform_critical).toBe(1);
      expect(scan.transform_major).toBe(3);
      expect(scan.transform_minor).toBe(3);
      expect(scan.transform_mappings).toBe(85);
    });

    it('returns empty array for scan with no transform findings', () => {
      const findings = repo.getTransformFindings(scanId);
      expect(findings).toEqual([]);
    });
  });

  // =========================================================================
  // Dashboard Stats
  // =========================================================================

  describe('Dashboard Stats', () => {
    it('returns zeros when database is empty', () => {
      const stats = repo.getDashboardStats();
      expect(stats.totalProjects).toBe(0);
      expect(stats.totalScans).toBe(0);
      expect(stats.recentScans).toEqual([]);
      expect(stats.averageCost).toBeNull();
    });

    it('counts projects and completed scans', () => {
      const p = repo.createProject({
        name: 'Test',
        sector: 'mining',
        revenueAUD: 100_000_000,
        totalFTE: 500,
        dataEngineers: 10,
        avgSalaryAUD: 150_000,
        avgFTESalaryAUD: 100_000,
      });

      const s1 = repo.createScan(p.id, {}, false);
      repo.completeScan(s1.id, {
        engineInput: {},
        engineResult: {},
        totalFindings: 5,
        criticalCount: 1,
        majorCount: 2,
        minorCount: 1,
        infoCount: 1,
        totalCost: 2_000_000,
        amplificationRatio: 1.3,
        derivedApproach: 'kimball',
        schemaTables: 10,
        schemaColumns: 50,
        schemaCount: 1,
      });

      const s2 = repo.createScan(p.id, {}, false);
      repo.completeScan(s2.id, {
        engineInput: {},
        engineResult: {},
        totalFindings: 8,
        criticalCount: 0,
        majorCount: 3,
        minorCount: 3,
        infoCount: 2,
        totalCost: 4_000_000,
        amplificationRatio: 1.5,
        derivedApproach: 'mixed-kimball',
        schemaTables: 20,
        schemaColumns: 100,
        schemaCount: 2,
      });

      // Also create a failed scan (should not count)
      const s3 = repo.createScan(p.id, {}, false);
      repo.failScan(s3.id, 'some error');

      const stats = repo.getDashboardStats();
      expect(stats.totalProjects).toBe(1);
      expect(stats.totalScans).toBe(2);  // Only completed
      expect(stats.recentScans.length).toBe(2);
      expect(stats.averageCost).toBe(3_000_000);  // Average of 2M and 4M
    });
  });
});
