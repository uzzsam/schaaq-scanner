import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { initDatabase } from '../../src/server/db/schema';
import { Repository } from '../../src/server/db/repository';
import { ScanResultRepository } from '../../src/server/db/scan-result-repository';
import { buildMethodologySummary } from '../../src/methodology/builder';
import { makeInput, makeDryRunInput } from '../methodology/fixtures';
import type { MethodologySummary } from '../../src/methodology/types';
import type Database from 'better-sqlite3';

describe('Methodology persistence (round-trip)', () => {
  let dataDir: string;
  let db: Database.Database;
  let scanResultRepo: ScanResultRepository;
  let resultSetId: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'meth-test-'));
    db = initDatabase(dataDir);
    const repo = new Repository(db);
    scanResultRepo = new ScanResultRepository(db);

    // Create parent project + scan for FK references
    const project = repo.createProject({
      name: 'Test Corp', sector: 'mining' as const,
      revenueAUD: 100_000_000, totalFTE: 500, dataEngineers: 10,
      avgSalaryAUD: 150_000, avgFTESalaryAUD: 100_000,
    });
    const scan = repo.createScan(project.id, {}, false);

    // Insert a result set row
    resultSetId = 'test-rs-' + Date.now();
    db.prepare(`
      INSERT INTO scan_result_sets (id, scan_id, project_id, run_label, adapter_type,
        source_name, app_version, dalc_version, status, started_at)
      VALUES (?, ?, ?, 'test run', 'postgres',
        'test_db', '3.7.0', 'v4.0.0', 'completed', datetime('now'))
    `).run(resultSetId, scan.id, project.id);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('returns null when no methodology has been saved', () => {
    const result = scanResultRepo.getMethodologySummary(resultSetId);
    expect(result).toBeNull();
  });

  it('round-trips a full methodology summary', () => {
    const summary = buildMethodologySummary(makeInput());
    scanResultRepo.saveMethodologySummary(resultSetId, summary);

    const loaded = scanResultRepo.getMethodologySummary(resultSetId);
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(summary.version);
    expect(loaded!.overallConfidence).toBe(summary.overallConfidence);
    expect(loaded!.assumptions.length).toBe(summary.assumptions.length);
    expect(loaded!.coverageGaps.length).toBe(summary.coverageGaps.length);
    expect(loaded!.confidenceAssessments.length).toBe(summary.confidenceAssessments.length);
    expect(loaded!.scanCoverage.totalTables).toBe(summary.scanCoverage.totalTables);
  });

  it('round-trips a dry-run methodology summary', () => {
    const summary = buildMethodologySummary(makeDryRunInput());
    scanResultRepo.saveMethodologySummary(resultSetId, summary);

    const loaded = scanResultRepo.getMethodologySummary(resultSetId);
    expect(loaded).not.toBeNull();
    expect(loaded!.overallConfidence).toBe('very_low');
    expect(loaded!.coverageGaps.some(g => g.id === 'DRY_RUN')).toBe(true);
  });

  it('overwrites previous methodology on re-save', () => {
    const first = buildMethodologySummary(makeInput());
    scanResultRepo.saveMethodologySummary(resultSetId, first);

    const second = buildMethodologySummary(makeDryRunInput());
    scanResultRepo.saveMethodologySummary(resultSetId, second);

    const loaded = scanResultRepo.getMethodologySummary(resultSetId);
    expect(loaded!.overallConfidence).toBe('very_low');
  });

  it('returns null for non-existent result set', () => {
    const result = scanResultRepo.getMethodologySummary('does-not-exist');
    expect(result).toBeNull();
  });

  it('preserves assumption details through serialization', () => {
    const summary = buildMethodologySummary(makeInput());
    scanResultRepo.saveMethodologySummary(resultSetId, summary);

    const loaded = scanResultRepo.getMethodologySummary(resultSetId)!;
    const dalcAssumption = loaded.assumptions.find(a => a.id === 'DALC_CANONICAL_INVESTMENT');
    expect(dalcAssumption).toBeDefined();
    expect(dalcAssumption!.category).toBe('economic_model');
    expect(dalcAssumption!.sourceType).toBeTruthy();
    expect(dalcAssumption!.materialityLevel).toBeTruthy();
    expect(dalcAssumption!.affectedOutputs.length).toBeGreaterThan(0);
  });

  it('preserves confidence key drivers through serialization', () => {
    const summary = buildMethodologySummary(makeInput());
    scanResultRepo.saveMethodologySummary(resultSetId, summary);

    const loaded = scanResultRepo.getMethodologySummary(resultSetId)!;
    for (const ca of loaded.confidenceAssessments) {
      expect(Array.isArray(ca.keyDrivers)).toBe(true);
      expect(ca.keyDrivers.length).toBeGreaterThan(0);
    }
  });
});
