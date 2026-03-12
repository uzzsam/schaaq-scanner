import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { initDatabase } from '../../src/server/db/schema';
import { Repository } from '../../src/server/db/repository';
import { ScanRunner, type ScanProgress } from '../../src/server/scan-runner';
import { createMockConfig } from '../../src/mock/schema-factory';
import type Database from 'better-sqlite3';

describe('ScanRunner', () => {
  let dataDir: string;
  let db: Database.Database;
  let repo: Repository;
  let runner: ScanRunner;
  let projectId: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'dalc-runner-test-'));
    db = initDatabase(dataDir);
    repo = new Repository(db);
    runner = new ScanRunner(repo);

    // Create a test project
    const project = repo.createProject({
      name: 'Test Mining Corp',
      sector: 'mining',
      revenueAUD: 250_000_000,
      totalFTE: 1200,
      dataEngineers: 15,
      avgSalaryAUD: 160_000,
      avgFTESalaryAUD: 110_000,
      csrdInScope: true,
      canonicalInvestmentAUD: 2_000_000,
    });
    projectId = project.id;
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('completes a dry-run scan successfully', async () => {
    const config = createMockConfig();
    const scan = repo.createScan(projectId, config, true);

    await runner.run(scan.id, config, null, true);

    const completed = repo.getScan(scan.id)!;
    expect(completed.status).toBe('completed');
    expect(completed.progress).toBe(1.0);
    expect(completed.total_findings).toBeGreaterThan(0);
    expect(completed.total_cost).toBeGreaterThan(0);
  });

  it('emits progress events in correct order', async () => {
    const config = createMockConfig();
    const scan = repo.createScan(projectId, config, true);

    const events: ScanProgress[] = [];
    runner.on('progress', (event: ScanProgress) => {
      events.push(event);
    });

    await runner.run(scan.id, config, null, true);

    // Should have multiple progress events
    expect(events.length).toBeGreaterThan(5);

    // First event starts at 0
    expect(events[0].progress).toBe(0);
    expect(events[0].status).toBe('running');

    // Last event is completed at 1.0
    const lastEvent = events[events.length - 1];
    expect(lastEvent.progress).toBe(1);
    expect(lastEvent.status).toBe('completed');

    // Progress should be monotonically non-decreasing
    for (let i = 1; i < events.length; i++) {
      expect(events[i].progress).toBeGreaterThanOrEqual(events[i - 1].progress);
    }
  });

  it('emits events with correct step names', async () => {
    const config = createMockConfig();
    const scan = repo.createScan(projectId, config, true);

    const steps: string[] = [];
    runner.on('progress', (event: ScanProgress) => {
      steps.push(event.currentStep);
    });

    await runner.run(scan.id, config, null, true);

    expect(steps).toContain('Initialising');
    expect(steps).toContain('Extracting Schema');
    expect(steps).toContain('Schema Extracted');
    expect(steps).toContain('Scoring');
    expect(steps).toContain('Mapping');
    expect(steps).toContain('Calculating');
    expect(steps).toContain('Saving');
    expect(steps).toContain('Complete');
  });

  it('persists findings in SQLite', async () => {
    const config = createMockConfig();
    const scan = repo.createScan(projectId, config, true);

    await runner.run(scan.id, config, null, true);

    const findings = repo.getFindings(scan.id);
    expect(findings.length).toBeGreaterThan(0);

    // Each finding has expected fields
    for (const f of findings) {
      expect(f.check_id).toBeTruthy();
      expect(f.property).toBeGreaterThanOrEqual(1);
      expect(f.property).toBeLessThanOrEqual(8); // P1–P8 (AI Readiness added)
      expect(['critical', 'major', 'minor', 'info']).toContain(f.severity);
      expect(f.raw_score).toBeGreaterThanOrEqual(0);
      expect(f.raw_score).toBeLessThanOrEqual(1);
      expect(f.title).toBeTruthy();
    }
  });

  it('stores cost and amplification ratio correctly', async () => {
    const config = createMockConfig();
    const scan = repo.createScan(projectId, config, true);

    await runner.run(scan.id, config, null, true);

    const completed = repo.getScan(scan.id)!;
    expect(completed.total_cost).toBeGreaterThan(0);
    expect(completed.amplification_ratio).toBeGreaterThan(0);
    expect(completed.derived_approach).toBeTruthy();

    // Engine result JSON should be parseable
    const engineResult = JSON.parse(completed.engine_result_json!);
    expect(engineResult.finalTotal).toBe(completed.total_cost);
    expect(engineResult.amplificationRatio).toBe(completed.amplification_ratio);
  });

  it('stores schema metadata', async () => {
    const config = createMockConfig();
    const scan = repo.createScan(projectId, config, true);

    await runner.run(scan.id, config, null, true);

    const completed = repo.getScan(scan.id)!;
    expect(completed.schema_tables).toBeGreaterThan(0);
    expect(completed.schema_columns).toBeGreaterThan(0);
    expect(completed.schema_count).toBeGreaterThan(0);
    expect(completed.db_version).toBe('16.0'); // Mock schema version
  });

  it('stores severity counts correctly', async () => {
    const config = createMockConfig();
    const scan = repo.createScan(projectId, config, true);

    await runner.run(scan.id, config, null, true);

    const completed = repo.getScan(scan.id)!;
    const total = completed.critical_count + completed.major_count +
                  completed.minor_count + completed.info_count;
    expect(total).toBe(completed.total_findings);
  });

  it('handles failed scan and records error', async () => {
    const config = createMockConfig();
    const scan = repo.createScan(projectId, config, false);

    // Create a mock adapter that throws
    const failingAdapter = {
      connect: async () => { throw new Error('Connection refused'); },
      disconnect: async () => {},
      extractSchema: async () => { throw new Error('Should not reach'); },
      checkStatsFreshness: async () => ({ stale: false, oldestAnalyze: null, warning: null }),
    };

    const events: ScanProgress[] = [];
    runner.on('progress', (event: ScanProgress) => {
      events.push(event);
    });

    await expect(
      runner.run(scan.id, config, failingAdapter as any, false)
    ).rejects.toThrow('Connection refused');

    const failed = repo.getScan(scan.id)!;
    expect(failed.status).toBe('failed');
    expect(failed.error_message).toBe('Connection refused');

    // Should have emitted a failed event
    const failEvent = events.find(e => e.status === 'failed');
    expect(failEvent).toBeDefined();
  });

  it('stores engine input JSON', async () => {
    const config = createMockConfig();
    const scan = repo.createScan(projectId, config, true);

    await runner.run(scan.id, config, null, true);

    const completed = repo.getScan(scan.id)!;
    const engineInput = JSON.parse(completed.engine_input_json!);
    expect(engineInput.sector).toBe('mining');
    expect(engineInput.findings).toBeDefined();
    expect(engineInput.findings.length).toBe(8); // One per property (P1–P8)
  });
});
