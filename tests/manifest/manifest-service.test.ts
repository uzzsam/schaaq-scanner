// =============================================================================
// Manifest Service — Unit Tests
// =============================================================================

import { describe, it, expect } from 'vitest';
import type { ScanResultSetRow, ResultFindingRow } from '../../src/server/db/scan-result-types';
import {
  buildAssessmentManifest,
  buildVersionInfo,
  buildRunMetadata,
  buildScanCoverage,
  buildComponentAvailability,
  deriveStatusIndicator,
} from '../../src/manifest/manifest-service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<ScanResultSetRow> = {}): ScanResultSetRow {
  return {
    id: 'rs-001',
    project_id: 'proj-001',
    scan_id: 'scan-001',
    run_label: 'Test Run',
    adapter_type: 'postgresql',
    source_name: 'test_db',
    source_fingerprint: 'abc123',
    app_version: '3.7.1',
    ruleset_version: 'v1.0.0',
    dalc_version: 'v4.0.0',
    status: 'completed',
    started_at: '2026-01-15T10:00:00Z',
    completed_at: '2026-01-15T10:00:12Z',
    duration_ms: 12400,
    total_findings: 8,
    critical_count: 1,
    major_count: 3,
    minor_count: 2,
    info_count: 2,
    dalc_total_usd: 1_500_000,
    dalc_base_usd: 1_200_000,
    dalc_low_usd: 900_000,
    dalc_high_usd: 2_100_000,
    amplification_ratio: 1.25,
    derived_approach: 'sector_calibrated',
    summary_json: '{}',
    criticality_json: '{"totalAssetsAssessed":10}',
    methodology_json: '{"approach":"default"}',
    created_at: '2026-01-15T10:00:12Z',
    ...overrides,
  };
}

function makeFinding(overrides: Partial<ResultFindingRow> = {}): ResultFindingRow {
  return {
    id: 1,
    result_set_id: 'rs-001',
    project_id: 'proj-001',
    check_id: 'CHK-001',
    property: 1,
    severity: 'major',
    raw_score: 0.75,
    title: 'Test Finding',
    cost_categories_json: '["firefighting","dataQuality"]',
    cost_weights_json: '{"firefighting":0.6,"dataQuality":0.4}',
    confidence_level: 'high',
    confidence_score: 0.9,
    affected_objects: 5,
    total_objects: 20,
    detail_json: '{}',
    ...overrides,
  } as ResultFindingRow;
}

// ---------------------------------------------------------------------------
// buildVersionInfo
// ---------------------------------------------------------------------------

describe('buildVersionInfo', () => {
  it('maps row fields to version info', () => {
    const row = makeRow();
    const info = buildVersionInfo(row);
    expect(info.appVersion).toBe('3.7.1');
    expect(info.dalcVersion).toBe('v4.0.0');
    expect(info.rulesetVersion).toBe('v1.0.0');
    expect(info.schemaVersion).toBeGreaterThanOrEqual(13);
  });
});

// ---------------------------------------------------------------------------
// buildRunMetadata
// ---------------------------------------------------------------------------

describe('buildRunMetadata', () => {
  it('maps row fields to run metadata', () => {
    const row = makeRow();
    const meta = buildRunMetadata(row);
    expect(meta.resultSetId).toBe('rs-001');
    expect(meta.scanId).toBe('scan-001');
    expect(meta.adapterType).toBe('postgresql');
    expect(meta.status).toBe('completed');
    expect(meta.durationMs).toBe(12400);
    expect(meta.durationLabel).toBe('12.4s');
  });

  it('handles null duration', () => {
    const meta = buildRunMetadata(makeRow({ duration_ms: null }));
    expect(meta.durationMs).toBeNull();
    expect(meta.durationLabel).toBeNull();
  });

  it('formats sub-second durations as ms', () => {
    const meta = buildRunMetadata(makeRow({ duration_ms: 450 }));
    expect(meta.durationLabel).toBe('450ms');
  });

  it('formats minute-scale durations', () => {
    const meta = buildRunMetadata(makeRow({ duration_ms: 125000 }));
    expect(meta.durationLabel).toBe('2m 5s');
  });
});

// ---------------------------------------------------------------------------
// buildScanCoverage
// ---------------------------------------------------------------------------

describe('buildScanCoverage', () => {
  it('counts distinct properties from findings', () => {
    const findings = [
      makeFinding({ property: 1 }),
      makeFinding({ property: 1 }),
      makeFinding({ property: 3 }),
      makeFinding({ property: 5 }),
    ];
    const cov = buildScanCoverage(makeRow(), findings);
    expect(cov.propertiesCovered).toBe(3);
    expect(cov.totalProperties).toBe(8);
    expect(cov.totalFindings).toBe(8); // from row, not findings.length
    expect(cov.dalcTotalUsd).toBe(1_500_000);
    expect(cov.amplificationRatio).toBe(1.25);
  });

  it('handles zero findings', () => {
    const cov = buildScanCoverage(makeRow({ total_findings: 0 }), []);
    expect(cov.propertiesCovered).toBe(0);
    expect(cov.totalFindings).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildComponentAvailability
// ---------------------------------------------------------------------------

describe('buildComponentAvailability', () => {
  it('returns all true for completed scan with rich data and multiple scans', () => {
    const findings = [makeFinding()];
    const avail = buildComponentAvailability(makeRow(), findings, 3);
    expect(avail.coreFindings).toBe(true);
    expect(avail.criticalityAssessment).toBe(true);
    expect(avail.methodologySummary).toBe(true);
    expect(avail.trendDataAvailable).toBe(true);
    expect(avail.benchmarkAvailable).toBe(true);
    expect(avail.blastRadiusAvailable).toBe(true);
    expect(avail.remediationAvailable).toBe(true);
  });

  it('marks trend unavailable for first scan', () => {
    const avail = buildComponentAvailability(makeRow(), [makeFinding()], 1);
    expect(avail.trendDataAvailable).toBe(false);
  });

  it('marks criticality unavailable when json is null', () => {
    const avail = buildComponentAvailability(
      makeRow({ criticality_json: null }),
      [makeFinding()],
      3,
    );
    expect(avail.criticalityAssessment).toBe(false);
  });

  it('marks criticality unavailable when json is empty object', () => {
    const avail = buildComponentAvailability(
      makeRow({ criticality_json: '{}' }),
      [makeFinding()],
      3,
    );
    expect(avail.criticalityAssessment).toBe(false);
  });

  it('marks blast-radius unavailable when findings lack cost weights', () => {
    const findings = [makeFinding({ cost_weights_json: '{}' })];
    const avail = buildComponentAvailability(makeRow(), findings, 3);
    expect(avail.blastRadiusAvailable).toBe(false);
  });

  it('marks core components unavailable for failed scan with no findings', () => {
    const avail = buildComponentAvailability(
      makeRow({ status: 'failed' }),
      [],
      3,
    );
    expect(avail.coreFindings).toBe(false);
    expect(avail.benchmarkAvailable).toBe(false);
    expect(avail.remediationAvailable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildAssessmentManifest
// ---------------------------------------------------------------------------

describe('buildAssessmentManifest', () => {
  it('produces a complete manifest with all sections', () => {
    const manifest = buildAssessmentManifest(makeRow(), [makeFinding()], 3);
    expect(manifest.manifestVersion).toBe('1.0.0');
    expect(manifest.generatedAt).toBeTruthy();
    expect(manifest.versions.appVersion).toBe('3.7.1');
    expect(manifest.run.resultSetId).toBe('rs-001');
    expect(manifest.coverage.totalFindings).toBe(8);
    expect(manifest.components.coreFindings).toBe(true);
  });

  it('generatedAt is a valid ISO timestamp', () => {
    const manifest = buildAssessmentManifest(makeRow(), [makeFinding()], 1);
    const parsed = new Date(manifest.generatedAt);
    expect(parsed.getTime()).not.toBeNaN();
  });
});

// ---------------------------------------------------------------------------
// deriveStatusIndicator
// ---------------------------------------------------------------------------

describe('deriveStatusIndicator', () => {
  it('returns complete for completed scan with findings + cost', () => {
    expect(deriveStatusIndicator(makeRow())).toBe('complete');
  });

  it('returns partial for completed scan with zero findings', () => {
    expect(deriveStatusIndicator(makeRow({ total_findings: 0 }))).toBe('partial');
  });

  it('returns partial for completed scan with zero cost', () => {
    expect(deriveStatusIndicator(makeRow({ dalc_total_usd: 0 }))).toBe('partial');
  });

  it('returns failed for failed status', () => {
    expect(deriveStatusIndicator(makeRow({ status: 'failed' }))).toBe('failed');
  });

  it('returns unavailable for null row', () => {
    expect(deriveStatusIndicator(null)).toBe('unavailable');
    expect(deriveStatusIndicator(undefined)).toBe('unavailable');
  });
});
