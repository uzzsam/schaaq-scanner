import { describe, it, expect } from 'vitest';
import {
  getAvailablePacks,
  getPackById,
  getPackForSector,
  getDefaultPack,
  classifyPosition,
  classifyPropertyPosition,
  compareMetric,
  comparePropertyFindings,
  compareToBenchmark,
  buildBaselineComparison,
} from '../../src/benchmark';
import type {
  BenchmarkMetric,
  BenchmarkPack,
  BenchmarkPosition,
  PropertyBenchmarkPosition,
  ScanResultSetRow,
} from '../../src/benchmark';
import type { ScanResultSetRow as DbRow } from '../../src/server/db/scan-result-types';

// =============================================================================
// Helpers
// =============================================================================

function metric(low: number, high: number, lowerIsBetter = true): BenchmarkMetric {
  return { key: 'test', label: 'Test Metric', low, high, unit: 'units', lowerIsBetter };
}

function makeResultSetRow(overrides: Partial<DbRow> = {}): DbRow {
  return {
    id: 'rs-1',
    project_id: 'proj-1',
    scan_id: 'scan-1',
    run_label: 'Test Run',
    adapter_type: 'postgres',
    source_name: 'test-db',
    source_fingerprint: null,
    app_version: '3.7.0',
    ruleset_version: '1.0.0',
    dalc_version: '1.0.0',
    status: 'completed',
    started_at: '2025-12-01T10:00:00Z',
    completed_at: '2025-12-01T10:05:00Z',
    duration_ms: 300_000,
    total_findings: 20,
    critical_count: 3,
    major_count: 5,
    minor_count: 8,
    info_count: 4,
    dalc_total_usd: 50_000,
    dalc_base_usd: 50_000,
    dalc_low_usd: 35_000,
    dalc_high_usd: 70_000,
    amplification_ratio: 1.0,
    derived_approach: null,
    summary_json: '{}',
    criticality_json: null,
    methodology_json: null,
    created_at: '2025-12-01T10:05:00Z',
    ...overrides,
  };
}

// =============================================================================
// Pack Loading
// =============================================================================

describe('Pack Loading', () => {
  it('getAvailablePacks returns at least the 3 bundled packs', () => {
    const packs = getAvailablePacks();
    expect(packs.length).toBeGreaterThanOrEqual(3);
    const ids = packs.map(p => p.id);
    expect(ids).toContain('default-v1');
    expect(ids).toContain('financial-services-v1');
    expect(ids).toContain('healthcare-v1');
  });

  it('getPackById returns correct pack', () => {
    const pack = getPackById('financial-services-v1');
    expect(pack).not.toBeNull();
    expect(pack!.sector).toBe('financial-services');
  });

  it('getPackById returns null for unknown ID', () => {
    expect(getPackById('nonexistent')).toBeNull();
  });

  it('getPackForSector returns sector match', () => {
    const pack = getPackForSector('financial-services');
    expect(pack.id).toBe('financial-services-v1');
  });

  it('getPackForSector normalises input', () => {
    const pack = getPackForSector('Financial Services');
    expect(pack.id).toBe('financial-services-v1');
  });

  it('getPackForSector falls back to default for unknown sector', () => {
    const pack = getPackForSector('aerospace');
    expect(pack.id).toBe('default-v1');
  });

  it('getPackForSector falls back to default for null', () => {
    const pack = getPackForSector(null);
    expect(pack.id).toBe('default-v1');
  });

  it('getDefaultPack returns the cross-sector default', () => {
    const pack = getDefaultPack();
    expect(pack.id).toBe('default-v1');
    expect(pack.sector).toBe('default');
  });

  it('all packs have valid property findings for P1-P8', () => {
    for (const pack of getAvailablePacks()) {
      for (let p = 1; p <= 8; p++) {
        const m = pack.propertyFindings[p];
        expect(m, `${pack.id} missing property ${p}`).toBeDefined();
        expect(m.low).toBeLessThanOrEqual(m.high);
      }
    }
  });
});

// =============================================================================
// Position Classification
// =============================================================================

describe('classifyPosition', () => {
  it('classifies below range', () => {
    expect(classifyPosition(5, metric(10, 20))).toBe('below_range');
  });

  it('classifies within range (low bound)', () => {
    expect(classifyPosition(10, metric(10, 20))).toBe('within_range');
  });

  it('classifies within range (mid)', () => {
    expect(classifyPosition(15, metric(10, 20))).toBe('within_range');
  });

  it('classifies within range (high bound)', () => {
    expect(classifyPosition(20, metric(10, 20))).toBe('within_range');
  });

  it('classifies above range', () => {
    expect(classifyPosition(25, metric(10, 20))).toBe('above_range');
  });

  it('returns unknown for invalid range', () => {
    expect(classifyPosition(15, metric(20, 10))).toBe('unknown');
  });

  it('handles zero-width range', () => {
    expect(classifyPosition(5, metric(5, 5))).toBe('within_range');
    expect(classifyPosition(4, metric(5, 5))).toBe('below_range');
    expect(classifyPosition(6, metric(5, 5))).toBe('above_range');
  });
});

// =============================================================================
// Property Position Classification
// =============================================================================

describe('classifyPropertyPosition', () => {
  it('classifies better_than_range when below low', () => {
    expect(classifyPropertyPosition(1, metric(3, 8))).toBe('better_than_range');
  });

  it('classifies near_range when within range', () => {
    expect(classifyPropertyPosition(5, metric(3, 8))).toBe('near_range');
  });

  it('classifies near_range at the high bound', () => {
    expect(classifyPropertyPosition(8, metric(3, 8))).toBe('near_range');
  });

  it('classifies near_range just above high within tolerance', () => {
    // range=5, tolerance=max(5*0.2,1)=1, so 9 is <= 8+1=9 → near_range
    expect(classifyPropertyPosition(9, metric(3, 8))).toBe('near_range');
  });

  it('classifies worse_than_range above tolerance', () => {
    // tolerance = 1, so 10 > 9 → worse
    expect(classifyPropertyPosition(10, metric(3, 8))).toBe('worse_than_range');
  });

  it('returns unknown for invalid range', () => {
    expect(classifyPropertyPosition(5, metric(10, 3))).toBe('unknown');
  });

  it('handles zero-width range with minimum tolerance of 1', () => {
    // range=0, tolerance=max(0,1)=1, high+tolerance=6
    expect(classifyPropertyPosition(5, metric(5, 5))).toBe('near_range');
    expect(classifyPropertyPosition(6, metric(5, 5))).toBe('near_range');
    expect(classifyPropertyPosition(7, metric(5, 5))).toBe('worse_than_range');
    expect(classifyPropertyPosition(4, metric(5, 5))).toBe('better_than_range');
  });
});

// =============================================================================
// Metric Comparison
// =============================================================================

describe('compareMetric', () => {
  it('returns within_range with null percentFromRange', () => {
    const result = compareMetric(15, metric(10, 20));
    expect(result.position).toBe('within_range');
    expect(result.percentFromRange).toBeNull();
    expect(result.actualValue).toBe(15);
  });

  it('returns below_range with negative percentFromRange', () => {
    const result = compareMetric(5, metric(10, 20));
    expect(result.position).toBe('below_range');
    expect(result.percentFromRange).toBeLessThan(0);
  });

  it('returns above_range with positive percentFromRange', () => {
    const result = compareMetric(30, metric(10, 20));
    expect(result.position).toBe('above_range');
    expect(result.percentFromRange).toBeGreaterThan(0);
  });

  it('generates appropriate message for lowerIsBetter + below_range', () => {
    const result = compareMetric(5, metric(10, 20, true));
    expect(result.message).toContain('better than expected');
  });

  it('generates appropriate message for lowerIsBetter + above_range', () => {
    const result = compareMetric(30, metric(10, 20, true));
    expect(result.message).toContain('materially worse');
  });

  it('generates appropriate message for !lowerIsBetter + below_range', () => {
    const result = compareMetric(5, metric(10, 20, false));
    expect(result.message).toContain('under-measurement');
  });

  it('generates within_range message', () => {
    const result = compareMetric(15, metric(10, 20));
    expect(result.message).toContain('within the expected range');
  });
});

// =============================================================================
// Property Findings Comparison
// =============================================================================

describe('comparePropertyFindings', () => {
  it('classifies better_than_range with correct message', () => {
    const result = comparePropertyFindings(1, 0, metric(1, 4));
    expect(result.position).toBe('better_than_range');
    expect(result.propertyName).toBe('Semantic Identity');
    expect(result.message).toContain('fewer than');
  });

  it('classifies worse_than_range with correct message', () => {
    const result = comparePropertyFindings(5, 10, metric(1, 6));
    expect(result.position).toBe('worse_than_range');
    expect(result.propertyName).toBe('Schema Governance');
    expect(result.message).toContain('above the expected range');
  });

  it('classifies near_range for value within range', () => {
    const result = comparePropertyFindings(3, 3, metric(1, 5));
    expect(result.position).toBe('near_range');
    expect(result.propertyName).toBe('Domain Ownership');
  });

  it('uses fallback name for unknown property', () => {
    const result = comparePropertyFindings(99, 5, metric(1, 10));
    expect(result.propertyName).toBe('Property 99');
  });
});

// =============================================================================
// compareToBenchmark (full summary)
// =============================================================================

describe('compareToBenchmark', () => {
  const defaultPack = getDefaultPack();

  it('produces a complete summary with all fields', () => {
    const row = makeResultSetRow();
    const findingCounts: Record<number, number> = { 1: 2, 2: 3, 3: 1, 4: 2, 5: 4, 6: 5, 7: 1, 8: 2 };
    const summary = compareToBenchmark(row, defaultPack, findingCounts, null);

    expect(summary.packId).toBe('default-v1');
    expect(summary.packName).toBe('Cross-Sector Default');
    expect(summary.overallPosition).toBeDefined();
    expect(summary.overallMessage).toBeTruthy();
    expect(summary.dalcComparison).toBeDefined();
    expect(summary.totalFindingsComparison).toBeDefined();
    expect(summary.highSeverityComparison).toBeDefined();
    expect(summary.highSeverityDensityComparison).toBeDefined();
    expect(summary.propertyComparisons.length).toBe(8);
    expect(summary.keyMessages.length).toBeGreaterThanOrEqual(1);
    expect(summary.keyMessages.length).toBeLessThanOrEqual(3);
    expect(summary.baselineComparison).toBeNull();
  });

  it('classifies overall as within_range when all metrics are normal', () => {
    const row = makeResultSetRow({
      dalc_base_usd: 50_000,
      total_findings: 20,
      critical_count: 3,
      major_count: 4,
    });
    const summary = compareToBenchmark(row, defaultPack, {}, null);
    expect(summary.overallPosition).toBe('within_range');
  });

  it('classifies overall as above_range when DALC exceeds high', () => {
    const row = makeResultSetRow({
      dalc_base_usd: 200_000,
      total_findings: 20,
      critical_count: 3,
      major_count: 4,
    });
    const summary = compareToBenchmark(row, defaultPack, {}, null);
    expect(summary.overallPosition).toBe('above_range');
  });

  it('classifies overall as above_range when high-severity exceeds range', () => {
    const row = makeResultSetRow({
      dalc_base_usd: 50_000,
      total_findings: 20,
      critical_count: 10,
      major_count: 10,
    });
    const summary = compareToBenchmark(row, defaultPack, {}, null);
    expect(summary.overallPosition).toBe('above_range');
  });

  it('classifies overall as below_range when DALC is very low', () => {
    const row = makeResultSetRow({
      dalc_base_usd: 5_000,
      total_findings: 5,
      critical_count: 0,
      major_count: 1,
    });
    const summary = compareToBenchmark(row, defaultPack, {}, null);
    expect(summary.overallPosition).toBe('below_range');
  });

  it('uses dalc_total_usd when dalc_base_usd is null', () => {
    const row = makeResultSetRow({
      dalc_base_usd: null,
      dalc_total_usd: 50_000,
    });
    const summary = compareToBenchmark(row, defaultPack, {}, null);
    expect(summary.dalcComparison.actualValue).toBe(50_000);
  });

  it('includes baseline comparison when provided', () => {
    const row = makeResultSetRow();
    const baseline = {
      baselineAvailable: true as const,
      baselineResultSetId: 'rs-0',
      baselineLabel: 'First Scan',
      baselineTimestamp: '2025-01-01T00:00:00Z',
      dalcDirection: 'improving' as const,
      dalcDirectionLabel: 'Improving',
      dalcPercentChange: -15.5,
      findingCountDirection: 'stable' as const,
      findingCountDirectionLabel: 'Stable',
      findingCountDelta: 0,
      highSeverityDirection: 'improving' as const,
      highSeverityDirectionLabel: 'Improving',
      highSeverityDelta: -2,
    };
    const summary = compareToBenchmark(row, defaultPack, {}, baseline);
    expect(summary.baselineComparison).not.toBeNull();
    expect(summary.baselineComparison!.dalcDirection).toBe('improving');
    // Baseline direction should appear in key messages
    expect(summary.keyMessages.some(m => m.includes('decreased'))).toBe(true);
  });
});

// =============================================================================
// buildBaselineComparison (with mock repository)
// =============================================================================

describe('buildBaselineComparison', () => {
  function makeMockRepo(rows: DbRow[]) {
    return {
      getScanHistoryForProject: (_pid: string, _limit: number) =>
        rows.map(r => ({
          resultSetId: r.id,
          runLabel: r.run_label,
          status: r.status,
          startedAt: r.started_at,
          completedAt: r.completed_at,
          totalFindings: r.total_findings,
          dalcTotalUsd: r.dalc_total_usd,
        })),
      getResultSetById: (id: string) => rows.find(r => r.id === id) ?? null,
    } as unknown as import('../../src/server/db/scan-result-repository').ScanResultRepository;
  }

  it('returns null when fewer than 2 scans', () => {
    const repo = makeMockRepo([makeResultSetRow()]);
    expect(buildBaselineComparison(repo, 'proj-1')).toBeNull();
  });

  it('computes improving direction when DALC decreased', () => {
    const baseline = makeResultSetRow({
      id: 'rs-old',
      dalc_base_usd: 80_000,
      dalc_total_usd: 80_000,
      total_findings: 30,
      critical_count: 5,
      major_count: 8,
      started_at: '2025-01-01T00:00:00Z',
    });
    const latest = makeResultSetRow({
      id: 'rs-new',
      dalc_base_usd: 50_000,
      dalc_total_usd: 50_000,
      total_findings: 20,
      critical_count: 3,
      major_count: 5,
      started_at: '2025-12-01T00:00:00Z',
    });
    // History returns newest first
    const repo = makeMockRepo([latest, baseline]);
    const result = buildBaselineComparison(repo, 'proj-1');

    expect(result).not.toBeNull();
    expect(result!.baselineAvailable).toBe(true);
    expect(result!.dalcDirection).toBe('improving');
    expect(result!.dalcPercentChange).toBeLessThan(0);
    expect(result!.findingCountDirection).toBe('improving');
    expect(result!.findingCountDelta).toBe(-10);
    expect(result!.highSeverityDirection).toBe('improving');
    expect(result!.highSeverityDelta).toBe(-5);
  });

  it('computes worsening direction when DALC increased', () => {
    const baseline = makeResultSetRow({
      id: 'rs-old',
      dalc_base_usd: 30_000,
      dalc_total_usd: 30_000,
      total_findings: 10,
      critical_count: 1,
      major_count: 2,
    });
    const latest = makeResultSetRow({
      id: 'rs-new',
      dalc_base_usd: 60_000,
      dalc_total_usd: 60_000,
      total_findings: 25,
      critical_count: 5,
      major_count: 8,
    });
    const repo = makeMockRepo([latest, baseline]);
    const result = buildBaselineComparison(repo, 'proj-1');

    expect(result!.dalcDirection).toBe('worsening');
    expect(result!.dalcPercentChange).toBeGreaterThan(0);
    expect(result!.findingCountDirection).toBe('worsening');
  });

  it('computes stable when values barely changed', () => {
    const baseline = makeResultSetRow({
      id: 'rs-old',
      dalc_base_usd: 50_000,
      dalc_total_usd: 50_000,
      total_findings: 20,
      critical_count: 3,
      major_count: 5,
    });
    const latest = makeResultSetRow({
      id: 'rs-new',
      dalc_base_usd: 51_000,
      dalc_total_usd: 51_000,
      total_findings: 20,
      critical_count: 3,
      major_count: 5,
    });
    const repo = makeMockRepo([latest, baseline]);
    const result = buildBaselineComparison(repo, 'proj-1');

    expect(result!.dalcDirection).toBe('stable');
    expect(result!.findingCountDirection).toBe('stable');
    expect(result!.highSeverityDirection).toBe('stable');
  });
});

// =============================================================================
// Report Rendering / Output Path Tests
// =============================================================================

import { ALL_CHECKS } from '../../src/checks/index';
import { scoreFindings } from '../../src/scoring/severity-scorer';
import { mapToEngineInput } from '../../src/scoring/mapper';
import { calculateDALC } from '../../src/engine/index';
import { createMockSchema, createMockConfig } from '../../src/mock/schema-factory';
import {
  buildExecutiveReportData,
  buildTechnicalAppendixData,
  generateExecutiveReport,
  generateTechnicalReport,
} from '../../src/report/generator';
import type { Finding } from '../../src/checks/types';
import type { BenchmarkSummary, BenchmarkComparisonRecord, PropertyBenchmarkComparison } from '../../src/benchmark';

function runPipeline() {
  const schema = createMockSchema();
  const config = createMockConfig();
  const findings: Finding[] = [];
  for (const check of ALL_CHECKS) {
    findings.push(...check.execute(schema, config));
  }
  const scored = scoreFindings(findings, schema);
  const engineInput = mapToEngineInput(scored, schema, config);
  const result = calculateDALC(engineInput);
  return { schema, config, scored, result };
}

function makeBenchmarkSummary(overrides: Partial<BenchmarkSummary> = {}): BenchmarkSummary {
  const defaultMetric: BenchmarkMetric = { key: 'test', label: 'Test', low: 10, high: 50, unit: 'USD', lowerIsBetter: true };
  const makeComparison = (label: string, value: number, position: BenchmarkPosition): BenchmarkComparisonRecord => ({
    metric: { ...defaultMetric, key: label.toLowerCase().replace(/\s+/g, '_'), label },
    actualValue: value,
    position,
    message: `${label} is ${position === 'within_range' ? 'within' : position === 'above_range' ? 'above' : 'below'} the expected range.`,
    percentFromRange: position === 'within_range' ? null : 15,
  });

  return {
    packId: 'default-v1',
    packName: 'Cross-Sector Default',
    packSector: 'default',
    packVersion: '1.0.0',
    overallPosition: 'within_range',
    overallMessage: 'Compared to the Cross-Sector Default benchmark, this data estate is within the expected range for key metrics.',
    dalcComparison: makeComparison('DALC Base Cost', 45000, 'within_range'),
    totalFindingsComparison: makeComparison('Total Findings', 20, 'within_range'),
    highSeverityComparison: makeComparison('Critical + Major Findings', 6, 'within_range'),
    highSeverityDensityComparison: makeComparison('High-Severity Density', 0.30, 'within_range'),
    propertyComparisons: [
      { property: 1, propertyName: 'Semantic Identity', actualFindingCount: 2, benchmarkLow: 0, benchmarkHigh: 4, position: 'near_range' as PropertyBenchmarkPosition, message: 'Semantic Identity: 2 finding(s) — near the expected range (0–4).' },
      { property: 5, propertyName: 'Schema Governance', actualFindingCount: 7, benchmarkLow: 1, benchmarkHigh: 6, position: 'worse_than_range' as PropertyBenchmarkPosition, message: 'Schema Governance: 7 finding(s) — above the expected range (1–6).' },
    ],
    baselineComparison: null,
    keyMessages: ['All key metrics are within the expected range for this sector.'],
    ...overrides,
  };
}

describe('Report Rendering — Benchmark in Executive Report', () => {
  it('executive report data includes benchmarkSummary when provided', () => {
    const { scored, result } = runPipeline();
    const summary = makeBenchmarkSummary();
    const data = buildExecutiveReportData(result, scored, 'Bench Corp', undefined, { benchmarkSummary: summary });

    expect(data.benchmarkSummary).toBeDefined();
    expect(data.benchmarkSummary!.packId).toBe('default-v1');
    expect(data.benchmarkSummary!.overallPosition).toBe('within_range');
  });

  it('executive report data omits benchmarkSummary when not provided', () => {
    const { scored, result } = runPipeline();
    const data = buildExecutiveReportData(result, scored, 'Bench Corp');

    expect(data.benchmarkSummary).toBeUndefined();
  });

  it('executive HTML contains benchmark section when summary is provided', () => {
    const { scored, result } = runPipeline();
    const summary = makeBenchmarkSummary();
    const data = buildExecutiveReportData(result, scored, 'Bench Corp', undefined, { benchmarkSummary: summary });
    const html = generateExecutiveReport(data);

    expect(html).toContain('Benchmark Comparison');
    expect(html).toContain('Cross-Sector Default');
    expect(html).toContain('Within Expected Range');
  });

  it('executive HTML omits benchmark section when no summary', () => {
    const { scored, result } = runPipeline();
    const data = buildExecutiveReportData(result, scored, 'Bench Corp');
    const html = generateExecutiveReport(data);

    // The HTML comment always exists; assert on the actual heading tag
    expect(html).not.toContain('<h2>Benchmark Comparison</h2>');
  });

  it('executive HTML shows key messages', () => {
    const { scored, result } = runPipeline();
    const summary = makeBenchmarkSummary({
      keyMessages: ['DALC is 20% above the expected range.', 'High-severity findings exceed the benchmark.'],
    });
    const data = buildExecutiveReportData(result, scored, 'Bench Corp', undefined, { benchmarkSummary: summary });
    const html = generateExecutiveReport(data);

    expect(html).toContain('DALC is 20% above the expected range.');
    expect(html).toContain('High-severity findings exceed the benchmark.');
  });

  it('executive HTML shows above_range position correctly', () => {
    const { scored, result } = runPipeline();
    const summary = makeBenchmarkSummary({ overallPosition: 'above_range', overallMessage: 'One or more metrics are materially worse than expected.' });
    const data = buildExecutiveReportData(result, scored, 'Bench Corp', undefined, { benchmarkSummary: summary });
    const html = generateExecutiveReport(data);

    expect(html).toContain('Worse Than Expected');
  });

  it('executive HTML renders baseline comparison when present', () => {
    const { scored, result } = runPipeline();
    const summary = makeBenchmarkSummary({
      baselineComparison: {
        baselineAvailable: true,
        baselineResultSetId: 'rs-baseline',
        baselineLabel: 'First Scan',
        baselineTimestamp: '2025-06-01T10:00:00Z',
        dalcDirection: 'improving',
        dalcDirectionLabel: 'Improving',
        dalcPercentChange: -12.5,
        findingCountDirection: 'stable',
        findingCountDirectionLabel: 'Stable',
        findingCountDelta: 0,
        highSeverityDirection: 'improving',
        highSeverityDirectionLabel: 'Improving',
        highSeverityDelta: -2,
      },
    });
    const data = buildExecutiveReportData(result, scored, 'Bench Corp', undefined, { benchmarkSummary: summary });

    expect(data.benchmarkSummary!.baselineComparison).toBeDefined();
    expect(data.benchmarkSummary!.baselineComparison!.dalcDirection).toBe('improving');
  });
});

describe('Report Rendering — Benchmark in Technical Report', () => {
  it('technical report data includes benchmarkSummary when provided', () => {
    const { scored, result } = runPipeline();
    const summary = makeBenchmarkSummary();
    const data = buildTechnicalAppendixData(result, scored, 'Bench Corp', undefined, { benchmarkSummary: summary });

    expect(data.benchmarkSummary).toBeDefined();
    expect(data.benchmarkSummary!.packId).toBe('default-v1');
  });

  it('technical HTML contains benchmark section with metric table', () => {
    const { scored, result } = runPipeline();
    const summary = makeBenchmarkSummary();
    const data = buildTechnicalAppendixData(result, scored, 'Bench Corp', undefined, { benchmarkSummary: summary });
    const html = generateTechnicalReport(data);

    expect(html).toContain('Benchmark Comparison');
    expect(html).toContain('Cross-Sector Default');
    // Metric table headers
    expect(html).toContain('Actual');
    expect(html).toContain('Expected Range');
    expect(html).toContain('Position');
  });

  it('technical HTML renders metric.low and metric.high correctly (not rangeLow/rangeHigh)', () => {
    const { scored, result } = runPipeline();
    const summary = makeBenchmarkSummary({
      dalcComparison: {
        metric: { key: 'dalc_base_usd', label: 'DALC Base Cost', low: 15000, high: 85000, unit: 'USD', lowerIsBetter: true },
        actualValue: 45000,
        position: 'within_range',
        message: 'DALC Base Cost is within the expected range.',
        percentFromRange: null,
      },
    });
    const data = buildTechnicalAppendixData(result, scored, 'Bench Corp', undefined, { benchmarkSummary: summary });
    const html = generateTechnicalReport(data);

    // currency helper formats 15000 → "$15K", 85000 → "$85K"
    expect(html).toContain('$15K');
    expect(html).toContain('$85K');
  });

  it('technical HTML omits benchmark section when no summary', () => {
    const { scored, result } = runPipeline();
    const data = buildTechnicalAppendixData(result, scored, 'Bench Corp');
    const html = generateTechnicalReport(data);

    // The HTML comment always exists; assert on the actual heading tag
    expect(html).not.toContain('<h3 style="margin-bottom:8px;">Benchmark Comparison</h3>');
  });

  it('technical HTML shows property breakdown', () => {
    const { scored, result } = runPipeline();
    const summary = makeBenchmarkSummary();
    const data = buildTechnicalAppendixData(result, scored, 'Bench Corp', undefined, { benchmarkSummary: summary });
    const html = generateTechnicalReport(data);

    expect(html).toContain('Semantic Identity');
    expect(html).toContain('Schema Governance');
  });
});

// =============================================================================
// Remediation Wording with Comparative Context
// =============================================================================

import { buildRemediationPlan } from '../../src/remediation/planner';
import type { ParsedFinding } from '../../src/remediation/planner';

function makeParsedFinding(overrides: Partial<ParsedFinding> = {}): ParsedFinding {
  return {
    id: 1,
    result_set_id: 'rs-1',
    project_id: 'proj-1',
    check_id: 'p5-missing-pk',
    property: 5,
    severity: 'major',
    raw_score: 75,
    title: 'No naming standard',
    description: 'Tables lack consistent naming convention.',
    asset_type: 'schema',
    asset_key: 'public',
    asset_name: 'public',
    affected_objects: 10,
    total_objects: 20,
    ratio: 0.5,
    threshold_value: null,
    observed_value: null,
    metric_unit: null,
    remediation: 'Adopt a naming standard for all tables.',
    evidence_json: '[]',
    cost_categories_json: '["Unplanned Rework"]',
    cost_weights_json: '{"Unplanned Rework":1}',
    confidence_level: 'high',
    confidence_score: 0.9,
    explanation: null,
    why_it_matters: null,
    costCategories: ['Unplanned Rework'],
    costWeights: { 'Unplanned Rework': 1 },
    ...overrides,
  };
}

describe('Remediation Wording — Benchmark Context', () => {
  it('appends benchmark note when overallPosition is above_range', () => {
    const findings = [makeParsedFinding()];
    const plan = buildRemediationPlan({
      resultSetId: 'rs-1',
      findings,
      dalcLowUsd: 35_000,
      dalcBaseUsd: 50_000,
      dalcHighUsd: 70_000,
      benchmarkSummary: { overallPosition: 'above_range' },
    });

    const actionWithBenchNote = plan.actions.find(a => a.explanation.includes('materially worse than expected range'));
    expect(actionWithBenchNote).toBeDefined();
  });

  it('appends benchmark note when dalcComparison.position is above_range', () => {
    const findings = [makeParsedFinding()];
    const plan = buildRemediationPlan({
      resultSetId: 'rs-1',
      findings,
      dalcLowUsd: 35_000,
      dalcBaseUsd: 50_000,
      dalcHighUsd: 70_000,
      benchmarkSummary: { overallPosition: 'within_range', dalcComparison: { position: 'above_range' } },
    });

    const actionWithBenchNote = plan.actions.find(a => a.explanation.includes('materially worse than expected range'));
    expect(actionWithBenchNote).toBeDefined();
  });

  it('does NOT append benchmark note when position is within_range', () => {
    const findings = [makeParsedFinding()];
    const plan = buildRemediationPlan({
      resultSetId: 'rs-1',
      findings,
      dalcLowUsd: 35_000,
      dalcBaseUsd: 50_000,
      dalcHighUsd: 70_000,
      benchmarkSummary: { overallPosition: 'within_range' },
    });

    const actionWithBenchNote = plan.actions.find(a => a.explanation.includes('materially worse than expected range'));
    expect(actionWithBenchNote).toBeUndefined();
  });

  it('does NOT append benchmark note when no benchmarkSummary', () => {
    const findings = [makeParsedFinding()];
    const plan = buildRemediationPlan({
      resultSetId: 'rs-1',
      findings,
      dalcLowUsd: 35_000,
      dalcBaseUsd: 50_000,
      dalcHighUsd: 70_000,
    });

    const actionWithBenchNote = plan.actions.find(a => a.explanation.includes('materially worse than expected range'));
    expect(actionWithBenchNote).toBeUndefined();
  });
});

// =============================================================================
// Deterministic Pack Behaviour End-to-End
// =============================================================================

describe('Deterministic Pack Behaviour', () => {
  it('default pack is used when no sector specified', () => {
    const pack = getPackForSector(null);
    expect(pack.id).toBe('default-v1');

    const row = makeResultSetRow({ dalc_base_usd: 45_000, total_findings: 20, critical_count: 3, major_count: 5 });
    const summary = compareToBenchmark(row, pack, { 1: 2, 2: 3, 3: 1, 4: 2, 5: 4, 6: 5, 7: 1, 8: 1 }, null);

    expect(summary.packId).toBe('default-v1');
    expect(summary.packName).toBe('Cross-Sector Default');
    expect(summary.overallPosition).toBeDefined();
  });

  it('financial-services pack is selected for matching sector', () => {
    const pack = getPackForSector('financial-services');
    expect(pack.id).toBe('financial-services-v1');

    const row = makeResultSetRow({ dalc_base_usd: 130_000, total_findings: 45, critical_count: 10, major_count: 8 });
    const summary = compareToBenchmark(row, pack, { 1: 3, 2: 4, 3: 2, 4: 2, 5: 5, 6: 8, 7: 4, 8: 3 }, null);

    expect(summary.packId).toBe('financial-services-v1');
    expect(summary.dalcComparison.position).toBe('above_range');
  });

  it('healthcare pack is selected for matching sector', () => {
    const pack = getPackForSector('healthcare');
    expect(pack.id).toBe('healthcare-v1');
  });

  it('unknown sector falls back to default', () => {
    const pack = getPackForSector('agriculture');
    expect(pack.id).toBe('default-v1');
  });

  it('same inputs always produce the same output (determinism)', () => {
    const pack = getDefaultPack();
    const row = makeResultSetRow();
    const counts = { 1: 2, 2: 3, 3: 1, 4: 2, 5: 4, 6: 5, 7: 1, 8: 1 };

    const summary1 = compareToBenchmark(row, pack, counts, null);
    const summary2 = compareToBenchmark(row, pack, counts, null);

    expect(summary1.overallPosition).toBe(summary2.overallPosition);
    expect(summary1.overallMessage).toBe(summary2.overallMessage);
    expect(summary1.dalcComparison.position).toBe(summary2.dalcComparison.position);
    expect(summary1.dalcComparison.percentFromRange).toBe(summary2.dalcComparison.percentFromRange);
    expect(summary1.propertyComparisons).toEqual(summary2.propertyComparisons);
    expect(summary1.keyMessages).toEqual(summary2.keyMessages);
  });
});
