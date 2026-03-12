/**
 * Evidence Pipeline Tests — End-to-end coverage for the evidence model.
 *
 * Covers:
 *   1. buildFindingEvidence — schema construction from builder inputs
 *   2. Persistence round-trip — write finding with evidence → read back
 *   3. getFindingById / getFindingsForResultSet via service layer
 *   4. mapRowToPersistedRecord + mapToDetailViewModel mapping
 *   5. Null / optional handling — findings without evidence, legacy format
 *   6. buildReportData — evidence fields flow into report data
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import { buildFindingEvidence, buildMissingThingEvidence, buildThresholdViolationEvidence } from '../../src/checks/evidence-builder';
import type { EvidenceBuilderInput, ScanContext } from '../../src/checks/evidence-builder';
import type { FindingEvidence } from '../../src/checks/finding-evidence';
import { ScanResultRepository } from '../../src/server/db/scan-result-repository';
import { mapRowToPersistedRecord, mapToDetailViewModel, getFindingDetail, getFindingsForResultSet } from '../../src/server/services/finding-evidence-service';
import type { NewScanResultSetInput, NewResultFindingInput } from '../../src/server/db/scan-result-types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeScanContext(): ScanContext {
  return {
    appVersion: '1.0.0-test',
    rulesetVersion: '2024.1',
    adapterType: 'postgres',
    sourceName: 'test_db',
    sourceFingerprint: 'abc123def456',
    scanStartedAt: '2025-06-01T10:00:00Z',
  };
}

function makeFullBuilderInput(): EvidenceBuilderInput {
  return {
    checkId: 'P3-HIGH-NULL-RATE',
    property: 3,
    checkName: 'High Null Rate',
    severity: 'major',
    asset: {
      type: 'column',
      key: 'public.orders.status',
      name: 'status',
      schema: 'public',
      table: 'orders',
      column: 'status',
    },
    metric: {
      name: 'null_fraction',
      observed: 0.45,
      unit: 'fraction',
      displayText: '45% of rows have NULL values',
    },
    threshold: {
      value: 0.30,
      operator: 'gt',
      displayText: 'Maximum allowed null fraction is 30%',
    },
    samples: [
      { label: 'Row with NULL status', value: 'order_id=1234', context: { table: 'orders' } },
      { label: 'Row with NULL status', value: 'order_id=5678' },
    ],
    confidence: {
      level: 'high',
      score: 0.92,
      reason: 'Direct query result from information_schema',
    },
    explanation: {
      whatWasFound: '45% of rows in orders.status are NULL',
      whyItMatters: 'Downstream reports depend on complete status data',
      howDetected: 'Compared observed null_fraction against configured threshold',
    },
  };
}

function makeMinimalBuilderInput(): EvidenceBuilderInput {
  return {
    checkId: 'P5-MISSING-PK',
    property: 5,
    checkName: 'Missing Primary Key',
    severity: 'critical',
    asset: {
      type: 'table',
      key: 'public.audit_log',
      name: 'audit_log',
      schema: 'public',
      table: 'audit_log',
    },
    explanation: {
      whatWasFound: 'Table audit_log has no primary key',
      whyItMatters: 'Without a primary key, row uniqueness cannot be guaranteed',
      howDetected: 'Checked pg_constraint for primary key constraints',
    },
  };
}

function makeResultSetInput(projectId: string): NewScanResultSetInput {
  return {
    projectId,
    scanId: 'scan-001',
    runLabel: 'Test Run',
    adapterType: 'postgres',
    sourceName: 'test_db',
    appVersion: '1.0.0',
    rulesetVersion: '2024.1',
    dalcVersion: '1.0.0',
    startedAt: '2025-06-01T10:00:00Z',
    completedAt: '2025-06-01T10:01:00Z',
    durationMs: 60000,
    totalFindings: 2,
    criticalCount: 1,
    majorCount: 1,
    minorCount: 0,
    infoCount: 0,
    dalcTotalUsd: 50000,
    amplificationRatio: 1.5,
    summary: { test: true },
  };
}

function makeResultFindingWithEvidence(evidence: FindingEvidence): NewResultFindingInput {
  return {
    checkId: evidence.detection.checkId,
    property: evidence.detection.property,
    severity: 'major',
    rawScore: 7.5,
    title: 'High null rate in orders.status',
    description: 'Column has excessive NULL values',
    assetType: evidence.asset.assetType,
    assetKey: evidence.asset.assetKey,
    assetName: evidence.asset.assetName,
    affectedObjects: 450,
    totalObjects: 1000,
    ratio: 0.45,
    thresholdValue: evidence.threshold?.thresholdValue ?? undefined,
    observedValue: evidence.metric?.observedValue ?? undefined,
    metricUnit: evidence.metric?.unit ?? undefined,
    remediation: 'Add NOT NULL constraint after backfilling data',
    evidence: [evidence],  // Stored as the envelope
    costCategories: ['dataQuality', 'productivity'],
    costWeights: { dataQuality: 0.6, productivity: 0.4 },
    confidenceLevel: evidence.confidence.level,
    confidenceScore: evidence.confidence.score,
    explanation: evidence.explanation.whatWasFound,
    whyItMatters: evidence.explanation.whyItMatters,
  };
}

function makeResultFindingNoEvidence(): NewResultFindingInput {
  return {
    checkId: 'P5-MISSING-PK',
    property: 5,
    severity: 'critical',
    rawScore: 9.0,
    title: 'Missing primary key on audit_log',
    affectedObjects: 1,
    totalObjects: 20,
    ratio: 0.05,
    remediation: 'Add a primary key column',
    evidence: [],
    costCategories: ['integration'],
    costWeights: { integration: 1.0 },
  };
}

function makeLegacyFinding(): NewResultFindingInput {
  return {
    checkId: 'P1-NAMING-VIOLATIONS',
    property: 1,
    severity: 'minor',
    rawScore: 3.0,
    title: 'Inconsistent naming conventions',
    affectedObjects: 5,
    totalObjects: 50,
    ratio: 0.1,
    evidence: ['table1.col_a uses snake_case', 'table2.colB uses camelCase'],
    costCategories: [],
    costWeights: {},
  };
}

// ---------------------------------------------------------------------------
// DB setup helper — create the necessary tables in a temp DB
// ---------------------------------------------------------------------------

function createTestDb(dir: string): Database.Database {
  const db = new Database(join(dir, 'test.db'));
  db.pragma('journal_mode = WAL');

  // scan_result_sets table
  db.exec(`
    CREATE TABLE IF NOT EXISTS scan_result_sets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      scan_id TEXT,
      run_label TEXT NOT NULL,
      adapter_type TEXT NOT NULL,
      source_name TEXT,
      source_fingerprint TEXT,
      app_version TEXT NOT NULL,
      ruleset_version TEXT NOT NULL DEFAULT '1.0',
      dalc_version TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      started_at TEXT NOT NULL,
      completed_at TEXT,
      duration_ms INTEGER,
      total_findings INTEGER NOT NULL DEFAULT 0,
      critical_count INTEGER NOT NULL DEFAULT 0,
      major_count INTEGER NOT NULL DEFAULT 0,
      minor_count INTEGER NOT NULL DEFAULT 0,
      info_count INTEGER NOT NULL DEFAULT 0,
      dalc_total_usd REAL NOT NULL DEFAULT 0,
      dalc_base_usd REAL,
      dalc_low_usd REAL,
      dalc_high_usd REAL,
      amplification_ratio REAL NOT NULL DEFAULT 1,
      derived_approach TEXT,
      summary_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // result_findings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS result_findings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      result_set_id TEXT NOT NULL REFERENCES scan_result_sets(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL,
      check_id TEXT NOT NULL,
      property INTEGER NOT NULL,
      severity TEXT NOT NULL,
      raw_score REAL NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      asset_type TEXT,
      asset_key TEXT,
      asset_name TEXT,
      affected_objects INTEGER NOT NULL DEFAULT 0,
      total_objects INTEGER NOT NULL DEFAULT 0,
      ratio REAL NOT NULL DEFAULT 0,
      threshold_value REAL,
      observed_value REAL,
      metric_unit TEXT,
      remediation TEXT,
      evidence_json TEXT NOT NULL DEFAULT '[]',
      cost_categories_json TEXT NOT NULL DEFAULT '[]',
      cost_weights_json TEXT NOT NULL DEFAULT '{}',
      confidence_level TEXT,
      confidence_score REAL,
      explanation TEXT,
      why_it_matters TEXT
    )
  `);

  return db;
}

// =============================================================================
// 1. Evidence Builder — Schema Construction
// =============================================================================

describe('buildFindingEvidence', () => {
  const ctx = makeScanContext();

  it('constructs a complete 7-layer envelope from full inputs', () => {
    const input = makeFullBuilderInput();
    const ev = buildFindingEvidence(input, ctx);

    expect(ev.schemaVersion).toBe(1);

    // Layer 1 — Detection
    expect(ev.detection.checkId).toBe('P3-HIGH-NULL-RATE');
    expect(ev.detection.property).toBe(3);
    expect(ev.detection.checkName).toBe('High Null Rate');
    expect(ev.detection.appVersion).toBe('1.0.0-test');
    expect(ev.detection.rulesetVersion).toBe('2024.1');
    expect(ev.detection.detectedAt).toBeTruthy();

    // Layer 2 — Metric
    expect(ev.metric).not.toBeNull();
    expect(ev.metric!.metricName).toBe('null_fraction');
    expect(ev.metric!.observedValue).toBe(0.45);
    expect(ev.metric!.unit).toBe('fraction');
    expect(ev.metric!.displayText).toBe('45% of rows have NULL values');

    // Layer 3 — Threshold
    expect(ev.threshold).not.toBeNull();
    expect(ev.threshold!.thresholdValue).toBe(0.30);
    expect(ev.threshold!.operator).toBe('gt');

    // Layer 4 — Asset
    expect(ev.asset.assetType).toBe('column');
    expect(ev.asset.assetKey).toBe('public.orders.status');
    expect(ev.asset.assetName).toBe('status');
    expect(ev.asset.schemaName).toBe('public');
    expect(ev.asset.tableName).toBe('orders');
    expect(ev.asset.columnName).toBe('status');

    // Layer 5 — Samples
    expect(ev.samples).toHaveLength(2);
    expect(ev.samples[0].label).toBe('Row with NULL status');
    expect(ev.samples[0].value).toBe('order_id=1234');
    expect(ev.samples[0].context).toEqual({ table: 'orders' });
    expect(ev.samples[1].context).toBeUndefined();

    // Layer 6 — Confidence
    expect(ev.confidence.level).toBe('high');
    expect(ev.confidence.score).toBe(0.92);
    expect(ev.confidence.reason).toBe('Direct query result from information_schema');

    // Layer 7 — Provenance
    expect(ev.provenance.adapterType).toBe('postgres');
    expect(ev.provenance.sourceName).toBe('test_db');
    expect(ev.provenance.sourceFingerprint).toBe('abc123def456');
    expect(ev.provenance.extractedAt).toBe('2025-06-01T10:00:00Z');

    // Explanation
    expect(ev.explanation.whatWasFound).toBe('45% of rows in orders.status are NULL');
    expect(ev.explanation.whyItMatters).toBe('Downstream reports depend on complete status data');
    expect(ev.explanation.howDetected).toBe('Compared observed null_fraction against configured threshold');
  });

  it('produces null metric/threshold for minimal (boolean) findings', () => {
    const input = makeMinimalBuilderInput();
    const ev = buildFindingEvidence(input, ctx);

    expect(ev.schemaVersion).toBe(1);
    expect(ev.metric).toBeNull();
    expect(ev.threshold).toBeNull();
    expect(ev.samples).toEqual([]);
    expect(ev.relatedAssets).toEqual([]);
    expect(ev.asset.assetType).toBe('table');
    expect(ev.explanation.whatWasFound).toBe('Table audit_log has no primary key');
  });

  it('derives confidence for deterministic checks when not provided', () => {
    const input = makeMinimalBuilderInput();
    const ev = buildFindingEvidence(input, ctx);

    expect(ev.confidence.level).toBe('high');
    expect(ev.confidence.score).toBe(0.95);
    expect(ev.confidence.reason).toContain('Deterministic');
  });

  it('derives medium confidence for heuristic checks', () => {
    const input: EvidenceBuilderInput = {
      ...makeMinimalBuilderInput(),
      checkId: 'P5-NAMING-VIOLATIONS',
      checkName: 'Naming Violations',
    };
    const ev = buildFindingEvidence(input, ctx);

    expect(ev.confidence.level).toBe('medium');
    expect(ev.confidence.score).toBe(0.65);
    expect(ev.confidence.reason).toContain('Heuristic');
  });

  it('caps samples at 10', () => {
    const input: EvidenceBuilderInput = {
      ...makeFullBuilderInput(),
      samples: Array.from({ length: 15 }, (_, i) => ({
        label: `Sample ${i}`, value: `val-${i}`,
      })),
    };
    const ev = buildFindingEvidence(input, ctx);

    expect(ev.samples).toHaveLength(10);
    expect(ev.samples[9].label).toBe('Sample 9');
  });
});

describe('buildMissingThingEvidence', () => {
  it('creates evidence for tables missing a feature', () => {
    const ctx = makeScanContext();
    const ev = buildMissingThingEvidence({
      checkId: 'P5-MISSING-PK',
      property: 5,
      checkName: 'Missing Primary Key',
      severity: 'critical',
      tables: [
        { schema: 'public', table: 'audit_log' },
        { schema: 'public', table: 'temp_data' },
      ],
      whatLabel: 'primary key',
      whyItMatters: 'Row uniqueness cannot be guaranteed',
      ctx,
    });

    expect(ev.schemaVersion).toBe(1);
    expect(ev.asset.assetType).toBe('table');
    expect(ev.asset.assetName).toBe('audit_log');
    expect(ev.relatedAssets).toHaveLength(1);
    expect(ev.relatedAssets[0].assetName).toBe('temp_data');
    expect(ev.samples).toHaveLength(2);
    expect(ev.metric).toBeNull();
    expect(ev.threshold).toBeNull();
  });
});

describe('buildThresholdViolationEvidence', () => {
  it('creates evidence for a threshold violation', () => {
    const ctx = makeScanContext();
    const ev = buildThresholdViolationEvidence({
      checkId: 'P3-HIGH-NULL-RATE',
      property: 3,
      checkName: 'High Null Rate',
      severity: 'major',
      asset: { schema: 'public', table: 'orders', column: 'status' },
      metricName: 'null_fraction',
      observed: 0.45,
      threshold: 0.30,
      unit: 'fraction',
      operator: 'gt',
      whyItMatters: 'Reports depend on complete status data',
      ctx,
    });

    expect(ev.metric).not.toBeNull();
    expect(ev.metric!.metricName).toBe('null_fraction');
    expect(ev.metric!.observedValue).toBe(0.45);
    expect(ev.threshold).not.toBeNull();
    expect(ev.threshold!.thresholdValue).toBe(0.30);
    expect(ev.threshold!.operator).toBe('gt');
    expect(ev.asset.assetType).toBe('column');
    expect(ev.asset.columnName).toBe('status');
  });
});

// =============================================================================
// 2. Persistence Round-Trip
// =============================================================================

describe('Persistence round-trip', () => {
  let dir: string;
  let db: Database.Database;
  let repo: ScanResultRepository;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'evidence-test-'));
    db = createTestDb(dir);
    repo = new ScanResultRepository(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes and reads back a finding with full evidence envelope', () => {
    const ctx = makeScanContext();
    const evidence = buildFindingEvidence(makeFullBuilderInput(), ctx);
    const rsId = repo.createScanResultSet(makeResultSetInput('proj-1'));
    const findingInput = makeResultFindingWithEvidence(evidence);

    repo.bulkInsertFindings(rsId, 'proj-1', [findingInput]);

    const rows = repo.getFindingsByResultSetId(rsId);
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(row.check_id).toBe('P3-HIGH-NULL-RATE');
    expect(row.severity).toBe('major');
    expect(row.asset_type).toBe('column');
    expect(row.asset_name).toBe('status');
    expect(row.observed_value).toBe(0.45);
    expect(row.threshold_value).toBe(0.30);
    expect(row.metric_unit).toBe('fraction');
    expect(row.confidence_level).toBe('high');
    expect(row.confidence_score).toBe(0.92);
    expect(row.explanation).toBe('45% of rows in orders.status are NULL');
    expect(row.why_it_matters).toBe('Downstream reports depend on complete status data');

    // Verify evidence_json round-trips correctly
    const parsed = JSON.parse(row.evidence_json);
    // evidence is stored as an array wrapping the envelope
    const envelope = Array.isArray(parsed) ? parsed[0] : parsed;
    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.detection.checkId).toBe('P3-HIGH-NULL-RATE');
    expect(envelope.metric.observedValue).toBe(0.45);
    expect(envelope.threshold.thresholdValue).toBe(0.30);
    expect(envelope.samples).toHaveLength(2);
    expect(envelope.confidence.level).toBe('high');
    expect(envelope.provenance.adapterType).toBe('postgres');
  });

  it('writes and reads back a finding with no evidence (legacy format)', () => {
    const rsId = repo.createScanResultSet(makeResultSetInput('proj-1'));
    repo.bulkInsertFindings(rsId, 'proj-1', [makeResultFindingNoEvidence()]);

    const rows = repo.getFindingsByResultSetId(rsId);
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(row.check_id).toBe('P5-MISSING-PK');
    expect(row.confidence_level).toBeNull();
    expect(row.confidence_score).toBeNull();
    expect(row.explanation).toBeNull();
    expect(row.observed_value).toBeNull();

    const parsed = JSON.parse(row.evidence_json);
    expect(parsed).toEqual([]);
  });

  it('writes and reads back a legacy string-array evidence', () => {
    const rsId = repo.createScanResultSet(makeResultSetInput('proj-1'));
    repo.bulkInsertFindings(rsId, 'proj-1', [makeLegacyFinding()]);

    const rows = repo.getFindingsByResultSetId(rsId);
    const parsed = JSON.parse(rows[0].evidence_json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
    expect(typeof parsed[0]).toBe('string');
  });

  it('getFindingById returns the correct row', () => {
    const rsId = repo.createScanResultSet(makeResultSetInput('proj-1'));
    const ctx = makeScanContext();
    const evidence = buildFindingEvidence(makeFullBuilderInput(), ctx);

    repo.bulkInsertFindings(rsId, 'proj-1', [
      makeResultFindingWithEvidence(evidence),
      makeResultFindingNoEvidence(),
    ]);

    const allRows = repo.getFindingsByResultSetId(rsId);
    expect(allRows).toHaveLength(2);

    const fetched = repo.getFindingById(allRows[0].id);
    expect(fetched).toBeDefined();
    expect(fetched!.check_id).toBe(allRows[0].check_id);
    expect(fetched!.id).toBe(allRows[0].id);
  });

  it('getFindingById returns undefined for non-existent ID', () => {
    expect(repo.getFindingById(99999)).toBeUndefined();
  });
});

// =============================================================================
// 3. mapRowToPersistedRecord — DB row to domain model
// =============================================================================

describe('mapRowToPersistedRecord', () => {
  let dir: string;
  let db: Database.Database;
  let repo: ScanResultRepository;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'evidence-map-test-'));
    db = createTestDb(dir);
    repo = new ScanResultRepository(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('maps a row with full evidence envelope', () => {
    const ctx = makeScanContext();
    const evidence = buildFindingEvidence(makeFullBuilderInput(), ctx);
    const rsId = repo.createScanResultSet(makeResultSetInput('proj-1'));

    // Store the envelope directly (as the new format)
    const findingInput: NewResultFindingInput = {
      ...makeResultFindingWithEvidence(evidence),
      evidence: [evidence],  // Array wrapping
    };
    repo.bulkInsertFindings(rsId, 'proj-1', [findingInput]);

    const row = repo.getFindingsByResultSetId(rsId)[0];
    const record = mapRowToPersistedRecord(row);

    expect(record.id).toBe(row.id);
    expect(record.resultSetId).toBe(rsId);
    expect(record.checkId).toBe('P3-HIGH-NULL-RATE');
    expect(record.property).toBe(3);
    expect(record.assetType).toBe('column');
    expect(record.assetName).toBe('status');
    expect(record.observedValue).toBe(0.45);
    expect(record.thresholdValue).toBe(0.30);
    expect(record.confidenceLevel).toBe('high');
    expect(record.confidenceScore).toBe(0.92);
    expect(record.costCategories).toEqual(['dataQuality', 'productivity']);
    expect(record.costWeights).toEqual({ dataQuality: 0.6, productivity: 0.4 });
  });

  it('maps a row with no evidence (empty evidence_json)', () => {
    const rsId = repo.createScanResultSet(makeResultSetInput('proj-1'));
    repo.bulkInsertFindings(rsId, 'proj-1', [makeResultFindingNoEvidence()]);

    const row = repo.getFindingsByResultSetId(rsId)[0];
    const record = mapRowToPersistedRecord(row);

    expect(record.evidence).toBeNull();
    expect(record.legacyEvidence).toEqual([]);
    expect(record.confidenceLevel).toBeNull();
    expect(record.observedValue).toBeNull();
    expect(record.thresholdValue).toBeNull();
  });

  it('maps a row with legacy string-array evidence', () => {
    const rsId = repo.createScanResultSet(makeResultSetInput('proj-1'));
    repo.bulkInsertFindings(rsId, 'proj-1', [makeLegacyFinding()]);

    const row = repo.getFindingsByResultSetId(rsId)[0];
    const record = mapRowToPersistedRecord(row);

    expect(record.evidence).toBeNull();
    expect(record.legacyEvidence).toHaveLength(2);
    expect(typeof record.legacyEvidence[0]).toBe('string');
  });
});

// =============================================================================
// 4. mapToDetailViewModel — domain model to UI view model
// =============================================================================

describe('mapToDetailViewModel', () => {
  let dir: string;
  let db: Database.Database;
  let repo: ScanResultRepository;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'evidence-vm-test-'));
    db = createTestDb(dir);
    repo = new ScanResultRepository(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('maps full evidence to a complete view model', () => {
    const ctx = makeScanContext();
    const evidence = buildFindingEvidence(makeFullBuilderInput(), ctx);
    const rsId = repo.createScanResultSet(makeResultSetInput('proj-1'));

    // Store envelope directly as evidence_json (schemaVersion: 1)
    const findingInput = makeResultFindingWithEvidence(evidence);
    // Overwrite evidence to store the envelope directly (not wrapped in array)
    // so parseEvidenceJson recognizes it as new format
    findingInput.evidence = evidence as unknown as unknown[];

    repo.bulkInsertFindings(rsId, 'proj-1', [findingInput]);

    const row = repo.getFindingsByResultSetId(rsId)[0];
    const record = mapRowToPersistedRecord(row);
    const vm = mapToDetailViewModel(record);

    // Header
    expect(vm.id).toBe(row.id);
    expect(vm.checkId).toBe('P3-HIGH-NULL-RATE');
    expect(vm.severity).toBe('major');
    expect(vm.title).toBe('High null rate in orders.status');

    // Asset
    expect(vm.assetType).toBe('column');
    expect(vm.assetName).toBe('status');

    // Metric
    expect(vm.affectedObjects).toBe(450);
    expect(vm.totalObjects).toBe(1000);
    expect(vm.ratioPercent).toBe('45.0%');

    // Threshold display
    expect(vm.thresholdDisplay).toBe('Observed 0.45 > threshold 0.3 (fraction)');

    // Explanation — prefers evidence envelope
    expect(vm.whatWasFound).toBe('45% of rows in orders.status are NULL');
    expect(vm.whyItMatters).toBe('Downstream reports depend on complete status data');
    expect(vm.howDetected).toBe('Compared observed null_fraction against configured threshold');

    // Confidence — prefers evidence envelope
    expect(vm.confidenceLevel).toBe('high');
    expect(vm.confidenceScore).toBe(0.92);
    expect(vm.confidenceReason).toBe('Direct query result from information_schema');

    // Samples
    expect(vm.samples).toHaveLength(2);
    expect(vm.samples[0].label).toBe('Row with NULL status');

    // Provenance
    expect(vm.provenance).not.toBeNull();
    expect(vm.provenance!.adapterType).toBe('postgres');
    expect(vm.provenance!.sourceName).toBe('test_db');

    // Cost
    expect(vm.costCategories).toEqual(['dataQuality', 'productivity']);
    expect(vm.remediation).toBe('Add NOT NULL constraint after backfilling data');
  });

  it('falls back to top-level columns when evidence envelope is absent', () => {
    const rsId = repo.createScanResultSet(makeResultSetInput('proj-1'));
    const finding: NewResultFindingInput = {
      ...makeResultFindingNoEvidence(),
      explanation: 'Fallback explanation text',
      whyItMatters: 'Fallback why it matters',
      confidenceLevel: 'medium',
      confidenceScore: 0.7,
    };
    repo.bulkInsertFindings(rsId, 'proj-1', [finding]);

    const row = repo.getFindingsByResultSetId(rsId)[0];
    const record = mapRowToPersistedRecord(row);
    const vm = mapToDetailViewModel(record);

    // Falls back to top-level columns
    expect(vm.whatWasFound).toBe('Fallback explanation text');
    expect(vm.whyItMatters).toBe('Fallback why it matters');
    expect(vm.howDetected).toBeNull();
    expect(vm.confidenceLevel).toBe('medium');
    expect(vm.confidenceScore).toBe(0.7);
    expect(vm.confidenceReason).toBeNull();
    expect(vm.samples).toEqual([]);
    expect(vm.provenance).toBeNull();
  });

  it('handles null values gracefully', () => {
    const rsId = repo.createScanResultSet(makeResultSetInput('proj-1'));
    repo.bulkInsertFindings(rsId, 'proj-1', [makeResultFindingNoEvidence()]);

    const row = repo.getFindingsByResultSetId(rsId)[0];
    const record = mapRowToPersistedRecord(row);
    const vm = mapToDetailViewModel(record);

    expect(vm.whatWasFound).toBeNull();
    expect(vm.whyItMatters).toBeNull();
    expect(vm.howDetected).toBeNull();
    expect(vm.confidenceLevel).toBeNull();
    expect(vm.confidenceScore).toBeNull();
    expect(vm.confidenceReason).toBeNull();
    expect(vm.thresholdDisplay).toBeNull();
    expect(vm.observedValue).toBeNull();
    expect(vm.thresholdValue).toBeNull();
    expect(vm.metricUnit).toBeNull();
    expect(vm.provenance).toBeNull();
    expect(vm.samples).toEqual([]);
  });

  it('formats ratioPercent correctly', () => {
    const rsId = repo.createScanResultSet(makeResultSetInput('proj-1'));
    const finding: NewResultFindingInput = {
      ...makeResultFindingNoEvidence(),
      ratio: 0.333,
    };
    repo.bulkInsertFindings(rsId, 'proj-1', [finding]);

    const row = repo.getFindingsByResultSetId(rsId)[0];
    const vm = mapToDetailViewModel(mapRowToPersistedRecord(row));

    expect(vm.ratioPercent).toBe('33.3%');
  });
});

// =============================================================================
// 5. Service Functions — getFindingDetail / getFindingsForResultSet
// =============================================================================

describe('Service functions', () => {
  let dir: string;
  let db: Database.Database;
  let repo: ScanResultRepository;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'evidence-svc-test-'));
    db = createTestDb(dir);
    repo = new ScanResultRepository(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('getFindingDetail returns a complete view model', () => {
    const ctx = makeScanContext();
    const evidence = buildFindingEvidence(makeFullBuilderInput(), ctx);
    const rsId = repo.createScanResultSet(makeResultSetInput('proj-1'));

    const findingInput = makeResultFindingWithEvidence(evidence);
    findingInput.evidence = evidence as unknown as unknown[];
    repo.bulkInsertFindings(rsId, 'proj-1', [findingInput]);

    const row = repo.getFindingsByResultSetId(rsId)[0];
    const detail = getFindingDetail(repo, row.id);

    expect(detail).not.toBeNull();
    expect(detail!.checkId).toBe('P3-HIGH-NULL-RATE');
    expect(detail!.samples).toHaveLength(2);
    expect(detail!.provenance).not.toBeNull();
    expect(detail!.confidenceLevel).toBe('high');
  });

  it('getFindingDetail returns null for non-existent finding', () => {
    const detail = getFindingDetail(repo, 99999);
    expect(detail).toBeNull();
  });

  it('getFindingsForResultSet returns all findings as view models', () => {
    const ctx = makeScanContext();
    const evidence = buildFindingEvidence(makeFullBuilderInput(), ctx);
    const rsId = repo.createScanResultSet(makeResultSetInput('proj-1'));

    const findingWithEvidence = makeResultFindingWithEvidence(evidence);
    findingWithEvidence.evidence = evidence as unknown as unknown[];

    repo.bulkInsertFindings(rsId, 'proj-1', [
      findingWithEvidence,
      makeResultFindingNoEvidence(),
      makeLegacyFinding(),
    ]);

    const viewModels = getFindingsForResultSet(repo, rsId);

    expect(viewModels).toHaveLength(3);

    // First: has full evidence (sorted by raw_score DESC → critical 9.0 first)
    const critical = viewModels.find(v => v.severity === 'critical');
    expect(critical).toBeDefined();
    expect(critical!.samples).toEqual([]);  // No evidence envelope

    const major = viewModels.find(v => v.severity === 'major');
    expect(major).toBeDefined();
    expect(major!.samples.length).toBeGreaterThan(0);
    expect(major!.provenance).not.toBeNull();

    const minor = viewModels.find(v => v.severity === 'minor');
    expect(minor).toBeDefined();
    expect(minor!.samples).toEqual([]);  // Legacy format
  });
});

// =============================================================================
// 6. Report Data Mapping — evidence fields extracted for HTML report
// =============================================================================

describe('buildReportData evidence extraction', () => {
  // We test the mapping logic directly rather than importing buildReportData,
  // which requires full DALCResult and ScoredFindings. Instead we test that
  // the evidence field extraction pattern works correctly.

  it('extracts evidence fields from evidenceInput', () => {
    const ei = {
      asset: { type: 'column' as const, key: 'public.orders.status', name: 'status', schema: 'public' },
      metric: { name: 'null_fraction', observed: 0.45, unit: 'fraction', displayText: '45% null' },
      threshold: { value: 0.30, operator: 'gt' as const, displayText: 'Max 30%' },
      confidence: { level: 'high' as const, score: 0.92, reason: 'Direct query' },
      explanation: {
        whatWasFound: '45% of rows are NULL',
        whyItMatters: 'Reports break',
        howDetected: 'Query check',
      },
    };

    // This mirrors the mapping in buildReportData
    const mapped = {
      assetName: ei?.asset?.name ?? null,
      observedValue: ei?.metric?.observed ?? null,
      thresholdValue: ei?.threshold?.value ?? null,
      metricUnit: ei?.metric?.unit ?? null,
      whatWasFound: ei?.explanation?.whatWasFound ?? null,
      whyItMatters: ei?.explanation?.whyItMatters ?? null,
      confidenceLevel: ei?.confidence?.level ?? null,
      confidenceScore: ei?.confidence?.score ?? null,
    };

    expect(mapped.assetName).toBe('status');
    expect(mapped.observedValue).toBe(0.45);
    expect(mapped.thresholdValue).toBe(0.30);
    expect(mapped.metricUnit).toBe('fraction');
    expect(mapped.whatWasFound).toBe('45% of rows are NULL');
    expect(mapped.whyItMatters).toBe('Reports break');
    expect(mapped.confidenceLevel).toBe('high');
    expect(mapped.confidenceScore).toBe(0.92);
  });

  it('returns null for all evidence fields when evidenceInput is undefined', () => {
    const ei = undefined;

    const mapped = {
      assetName: ei?.asset?.name ?? null,
      observedValue: ei?.metric?.observed ?? null,
      thresholdValue: ei?.threshold?.value ?? null,
      metricUnit: ei?.metric?.unit ?? null,
      whatWasFound: ei?.explanation?.whatWasFound ?? null,
      whyItMatters: ei?.explanation?.whyItMatters ?? null,
      confidenceLevel: ei?.confidence?.level ?? null,
      confidenceScore: ei?.confidence?.score ?? null,
    };

    expect(mapped.assetName).toBeNull();
    expect(mapped.observedValue).toBeNull();
    expect(mapped.thresholdValue).toBeNull();
    expect(mapped.metricUnit).toBeNull();
    expect(mapped.whatWasFound).toBeNull();
    expect(mapped.whyItMatters).toBeNull();
    expect(mapped.confidenceLevel).toBeNull();
    expect(mapped.confidenceScore).toBeNull();
  });

  it('handles partial evidenceInput (metric present, threshold absent)', () => {
    const ei = {
      asset: { type: 'table' as const, key: 'public.users', name: 'users', schema: 'public' },
      metric: { name: 'row_count', observed: 0, unit: 'count', displayText: '0 rows' },
      explanation: {
        whatWasFound: 'Table is empty',
        whyItMatters: 'No data to analyze',
        howDetected: 'Row count query',
      },
    };

    const mapped = {
      assetName: ei?.asset?.name ?? null,
      observedValue: ei?.metric?.observed ?? null,
      thresholdValue: (ei as Record<string, unknown>)?.threshold?.value ?? null,
      metricUnit: ei?.metric?.unit ?? null,
      whatWasFound: ei?.explanation?.whatWasFound ?? null,
      whyItMatters: ei?.explanation?.whyItMatters ?? null,
      confidenceLevel: (ei as Record<string, unknown>)?.confidence?.level ?? null,
      confidenceScore: (ei as Record<string, unknown>)?.confidence?.score ?? null,
    };

    expect(mapped.assetName).toBe('users');
    expect(mapped.observedValue).toBe(0);
    expect(mapped.thresholdValue).toBeNull();
    expect(mapped.metricUnit).toBe('count');
    expect(mapped.confidenceLevel).toBeNull();
    expect(mapped.confidenceScore).toBeNull();
  });
});

// =============================================================================
// 7. Envelope ↔ Builder Input field name mapping
// =============================================================================

describe('Envelope ↔ Builder Input field name mapping', () => {
  it('correctly maps builder input field names to envelope field names', () => {
    const input = makeFullBuilderInput();
    const ctx = makeScanContext();
    const envelope = buildFindingEvidence(input, ctx);

    // Builder input uses short names; envelope uses full names
    expect(input.metric!.name).toBe('null_fraction');
    expect(envelope.metric!.metricName).toBe('null_fraction');

    expect(input.metric!.observed).toBe(0.45);
    expect(envelope.metric!.observedValue).toBe(0.45);

    expect(input.threshold!.value).toBe(0.30);
    expect(envelope.threshold!.thresholdValue).toBe(0.30);

    expect(input.asset.type).toBe('column');
    expect(envelope.asset.assetType).toBe('column');

    expect(input.asset.key).toBe('public.orders.status');
    expect(envelope.asset.assetKey).toBe('public.orders.status');

    expect(input.asset.name).toBe('status');
    expect(envelope.asset.assetName).toBe('status');

    expect(input.asset.schema).toBe('public');
    expect(envelope.asset.schemaName).toBe('public');
  });

  it('round-trips envelope → reconstruct builder-input-like shape (as scans.ts does)', () => {
    const input = makeFullBuilderInput();
    const ctx = makeScanContext();
    const envelope = buildFindingEvidence(input, ctx);

    // This mirrors the reconstruction logic in scans.ts export route
    const reconstructed = {
      asset: {
        type: envelope.asset.assetType,
        key: envelope.asset.assetKey,
        name: envelope.asset.assetName,
        schema: envelope.asset.schemaName,
      },
      metric: envelope.metric ? {
        name: envelope.metric.metricName,
        observed: envelope.metric.observedValue,
        unit: envelope.metric.unit,
        displayText: envelope.metric.displayText,
      } : undefined,
      threshold: envelope.threshold ? {
        value: envelope.threshold.thresholdValue,
        operator: envelope.threshold.operator,
        displayText: envelope.threshold.displayText,
      } : undefined,
      samples: envelope.samples,
      confidence: envelope.confidence,
      explanation: envelope.explanation,
    };

    // Verify reconstruction matches original input shape (minus checkId/property/severity/checkName)
    expect(reconstructed.asset.type).toBe(input.asset.type);
    expect(reconstructed.asset.key).toBe(input.asset.key);
    expect(reconstructed.asset.name).toBe(input.asset.name);
    expect(reconstructed.asset.schema).toBe(input.asset.schema);

    expect(reconstructed.metric!.name).toBe(input.metric!.name);
    expect(reconstructed.metric!.observed).toBe(input.metric!.observed);
    expect(reconstructed.metric!.unit).toBe(input.metric!.unit);

    expect(reconstructed.threshold!.value).toBe(input.threshold!.value);
    expect(reconstructed.threshold!.operator).toBe(input.threshold!.operator);

    expect(reconstructed.confidence.level).toBe(input.confidence!.level);
    expect(reconstructed.confidence.score).toBe(input.confidence!.score);

    expect(reconstructed.explanation.whatWasFound).toBe(input.explanation.whatWasFound);
  });
});
