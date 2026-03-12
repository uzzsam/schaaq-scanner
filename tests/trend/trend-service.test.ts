import { describe, it, expect } from 'vitest';
import {
  computeFindingDeltas,
  buildRegressionSummary,
  buildDalcTrendSeries,
  buildPropertyTrends,
} from '../../src/trend/trend-service';
import { severityRank, compareSeverity } from '../../src/trend/types';
import type { ScanResultSetRow, ResultFindingRow } from '../../src/server/db/scan-result-types';

// =============================================================================
// Fixtures
// =============================================================================

function makeFinding(overrides: Partial<ResultFindingRow> = {}): ResultFindingRow {
  return {
    id: 1,
    result_set_id: 'rs-1',
    project_id: 'proj-1',
    check_id: 'P1-01',
    property: 1,
    severity: 'major',
    raw_score: 0.7,
    title: 'Test finding',
    description: 'desc',
    asset_type: 'table',
    asset_key: 'public.orders',
    asset_name: 'orders',
    affected_objects: 5,
    total_objects: 10,
    ratio: 0.5,
    threshold_value: 0.3,
    observed_value: 0.5,
    metric_unit: 'ratio',
    remediation: 'Fix it',
    evidence_json: '[]',
    cost_categories_json: '["storage"]',
    cost_weights_json: '{}',
    confidence_level: 'high',
    confidence_score: 0.9,
    explanation: null,
    why_it_matters: null,
    ...overrides,
  };
}

function makeResultSet(overrides: Partial<ScanResultSetRow> = {}): ScanResultSetRow {
  return {
    id: 'rs-1',
    project_id: 'proj-1',
    scan_id: 'scan-1',
    run_label: 'Scan #1',
    adapter_type: 'postgres',
    source_name: 'test-db',
    source_fingerprint: null,
    app_version: '3.7.0',
    ruleset_version: '1.0',
    dalc_version: '2.0',
    status: 'completed',
    started_at: '2025-01-01T00:00:00Z',
    completed_at: '2025-01-01T00:05:00Z',
    duration_ms: 300000,
    total_findings: 5,
    critical_count: 1,
    major_count: 2,
    minor_count: 1,
    info_count: 1,
    dalc_total_usd: 100000,
    dalc_base_usd: 100000,
    dalc_low_usd: 70000,
    dalc_high_usd: 140000,
    amplification_ratio: 1.5,
    derived_approach: null,
    summary_json: '{}',
    criticality_json: null,
    methodology_json: null,
    created_at: '2025-01-01T00:05:00Z',
    ...overrides,
  };
}

// =============================================================================
// Severity Helpers
// =============================================================================

describe('severityRank', () => {
  it('ranks critical > major > minor > info', () => {
    expect(severityRank('critical')).toBe(4);
    expect(severityRank('major')).toBe(3);
    expect(severityRank('minor')).toBe(2);
    expect(severityRank('info')).toBe(1);
  });

  it('returns 0 for unknown severity', () => {
    expect(severityRank('unknown')).toBe(0);
  });
});

describe('compareSeverity', () => {
  it('returns positive when a is higher than b', () => {
    expect(compareSeverity('critical', 'minor')).toBeGreaterThan(0);
  });

  it('returns negative when a is lower than b', () => {
    expect(compareSeverity('info', 'major')).toBeLessThan(0);
  });

  it('returns 0 when equal', () => {
    expect(compareSeverity('major', 'major')).toBe(0);
  });
});

// =============================================================================
// Finding Delta Logic
// =============================================================================

describe('computeFindingDeltas', () => {
  it('detects new findings (present in target, absent in baseline)', () => {
    const target = [makeFinding({ check_id: 'P1-01', asset_key: 'public.orders' })];
    const baseline: ResultFindingRow[] = [];

    const deltas = computeFindingDeltas(target, baseline);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].status).toBe('new');
    expect(deltas[0].previousSeverity).toBeNull();
  });

  it('detects resolved findings (absent in target, present in baseline)', () => {
    const target: ResultFindingRow[] = [];
    const baseline = [makeFinding({ check_id: 'P1-01', asset_key: 'public.orders' })];

    const deltas = computeFindingDeltas(target, baseline);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].status).toBe('resolved');
  });

  it('detects worsened findings (severity increased)', () => {
    const target = [makeFinding({ check_id: 'P1-01', asset_key: 'public.orders', severity: 'critical' })];
    const baseline = [makeFinding({ check_id: 'P1-01', asset_key: 'public.orders', severity: 'minor' })];

    const deltas = computeFindingDeltas(target, baseline);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].status).toBe('worsened');
    expect(deltas[0].currentSeverity).toBe('critical');
    expect(deltas[0].previousSeverity).toBe('minor');
  });

  it('detects improved findings (severity decreased)', () => {
    const target = [makeFinding({ check_id: 'P1-01', asset_key: 'public.orders', severity: 'info' })];
    const baseline = [makeFinding({ check_id: 'P1-01', asset_key: 'public.orders', severity: 'major' })];

    const deltas = computeFindingDeltas(target, baseline);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].status).toBe('improved');
  });

  it('detects unchanged findings (same severity)', () => {
    const target = [makeFinding({ check_id: 'P1-01', asset_key: 'public.orders', severity: 'major' })];
    const baseline = [makeFinding({ check_id: 'P1-01', asset_key: 'public.orders', severity: 'major' })];

    const deltas = computeFindingDeltas(target, baseline);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].status).toBe('unchanged');
  });

  it('uses composite key (check_id + asset_key) for identity', () => {
    const target = [
      makeFinding({ check_id: 'P1-01', asset_key: 'public.orders' }),
      makeFinding({ check_id: 'P1-01', asset_key: 'public.customers' }),
    ];
    const baseline = [
      makeFinding({ check_id: 'P1-01', asset_key: 'public.orders' }),
    ];

    const deltas = computeFindingDeltas(target, baseline);
    expect(deltas).toHaveLength(2);
    const statuses = deltas.map(d => d.status).sort();
    expect(statuses).toEqual(['new', 'unchanged']);
  });

  it('handles null asset_key correctly', () => {
    const target = [makeFinding({ check_id: 'P1-01', asset_key: null })];
    const baseline = [makeFinding({ check_id: 'P1-01', asset_key: null })];

    const deltas = computeFindingDeltas(target, baseline);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].status).toBe('unchanged');
  });

  it('handles mixed scenario with all delta types', () => {
    const target = [
      makeFinding({ check_id: 'P1-01', asset_key: 'a', severity: 'critical' }), // worsened (was minor)
      makeFinding({ check_id: 'P2-01', asset_key: 'b', severity: 'info' }),      // improved (was major)
      makeFinding({ check_id: 'P3-01', asset_key: 'c', severity: 'major' }),     // new
      makeFinding({ check_id: 'P5-01', asset_key: 'e', severity: 'minor' }),     // unchanged
    ];
    const baseline = [
      makeFinding({ check_id: 'P1-01', asset_key: 'a', severity: 'minor' }),     // worsened
      makeFinding({ check_id: 'P2-01', asset_key: 'b', severity: 'major' }),     // improved
      makeFinding({ check_id: 'P4-01', asset_key: 'd', severity: 'major' }),     // resolved
      makeFinding({ check_id: 'P5-01', asset_key: 'e', severity: 'minor' }),     // unchanged
    ];

    const deltas = computeFindingDeltas(target, baseline);
    expect(deltas).toHaveLength(5);

    const byStatus = new Map<string, number>();
    for (const d of deltas) byStatus.set(d.status, (byStatus.get(d.status) ?? 0) + 1);
    expect(byStatus.get('new')).toBe(1);
    expect(byStatus.get('resolved')).toBe(1);
    expect(byStatus.get('worsened')).toBe(1);
    expect(byStatus.get('improved')).toBe(1);
    expect(byStatus.get('unchanged')).toBe(1);
  });

  it('keeps highest severity when duplicate identity keys exist', () => {
    const target = [
      makeFinding({ check_id: 'P1-01', asset_key: 'a', severity: 'minor', raw_score: 0.3 }),
      makeFinding({ check_id: 'P1-01', asset_key: 'a', severity: 'critical', raw_score: 0.9 }),
    ];
    const baseline: ResultFindingRow[] = [];

    const deltas = computeFindingDeltas(target, baseline);
    expect(deltas).toHaveLength(1);
    expect(deltas[0].currentSeverity).toBe('critical');
  });
});

// =============================================================================
// DALC Trend Series
// =============================================================================

describe('buildDalcTrendSeries', () => {
  it('builds a chronological series from newest-first result sets', () => {
    const sets = [
      makeResultSet({ id: 'rs-3', dalc_base_usd: 120000, completed_at: '2025-03-01T00:00:00Z' }),
      makeResultSet({ id: 'rs-2', dalc_base_usd: 110000, completed_at: '2025-02-01T00:00:00Z' }),
      makeResultSet({ id: 'rs-1', dalc_base_usd: 100000, completed_at: '2025-01-01T00:00:00Z' }),
    ];

    const series = buildDalcTrendSeries(sets);
    // Points should be chronological (oldest first)
    expect(series.points[0].baseUsd).toBe(100000);
    expect(series.points[2].baseUsd).toBe(120000);
    expect(series.earliestBaseUsd).toBe(100000);
    expect(series.latestBaseUsd).toBe(120000);
  });

  it('detects worsening DALC (costs increasing >5%)', () => {
    const sets = [
      makeResultSet({ id: 'rs-2', dalc_base_usd: 200000, completed_at: '2025-02-01T00:00:00Z' }),
      makeResultSet({ id: 'rs-1', dalc_base_usd: 100000, completed_at: '2025-01-01T00:00:00Z' }),
    ];

    const series = buildDalcTrendSeries(sets);
    expect(series.direction).toBe('worsening');
    expect(series.percentChange).toBe(100);
  });

  it('detects improving DALC (costs decreasing >5%)', () => {
    const sets = [
      makeResultSet({ id: 'rs-2', dalc_base_usd: 50000, completed_at: '2025-02-01T00:00:00Z' }),
      makeResultSet({ id: 'rs-1', dalc_base_usd: 100000, completed_at: '2025-01-01T00:00:00Z' }),
    ];

    const series = buildDalcTrendSeries(sets);
    expect(series.direction).toBe('improving');
    expect(series.percentChange).toBe(-50);
  });

  it('reports stable when change is <5%', () => {
    const sets = [
      makeResultSet({ id: 'rs-2', dalc_base_usd: 102000, completed_at: '2025-02-01T00:00:00Z' }),
      makeResultSet({ id: 'rs-1', dalc_base_usd: 100000, completed_at: '2025-01-01T00:00:00Z' }),
    ];

    const series = buildDalcTrendSeries(sets);
    expect(series.direction).toBe('stable');
  });

  it('returns insufficient_data for single result set', () => {
    const sets = [
      makeResultSet({ id: 'rs-1', dalc_base_usd: 100000, completed_at: '2025-01-01T00:00:00Z' }),
    ];

    const series = buildDalcTrendSeries(sets);
    expect(series.direction).toBe('insufficient_data');
    expect(series.points).toHaveLength(1);
  });

  it('falls back to dalc_total_usd when dalc_base_usd is null', () => {
    const sets = [
      makeResultSet({ id: 'rs-2', dalc_base_usd: null, dalc_total_usd: 90000, completed_at: '2025-02-01T00:00:00Z' }),
      makeResultSet({ id: 'rs-1', dalc_base_usd: null, dalc_total_usd: 100000, completed_at: '2025-01-01T00:00:00Z' }),
    ];

    const series = buildDalcTrendSeries(sets);
    expect(series.points[0].baseUsd).toBe(100000);
    expect(series.points[1].baseUsd).toBe(90000);
  });

  it('defaults low/high to total * 0.7 / 1.4 when null', () => {
    const sets = [
      makeResultSet({
        id: 'rs-1',
        dalc_base_usd: null,
        dalc_low_usd: null,
        dalc_high_usd: null,
        dalc_total_usd: 100000,
        completed_at: '2025-01-01T00:00:00Z',
      }),
    ];

    const series = buildDalcTrendSeries(sets);
    expect(series.points[0].lowUsd).toBe(70000);
    expect(series.points[0].highUsd).toBe(140000);
  });
});

// =============================================================================
// Property Trends
// =============================================================================

describe('buildPropertyTrends', () => {
  it('builds trends for all 8 properties', () => {
    const sets = [makeResultSet({ id: 'rs-1' })];
    const findingsMap = new Map<string, ResultFindingRow[]>();
    findingsMap.set('rs-1', []);

    const trends = buildPropertyTrends(sets, findingsMap);
    expect(trends).toHaveLength(8);
    expect(trends[0].property).toBe(1);
    expect(trends[7].property).toBe(8);
  });

  it('counts findings per property per scan', () => {
    const rs1 = makeResultSet({ id: 'rs-1', completed_at: '2025-01-01T00:00:00Z' });
    const rs2 = makeResultSet({ id: 'rs-2', completed_at: '2025-02-01T00:00:00Z' });
    const sets = [rs2, rs1]; // newest first

    const findingsMap = new Map<string, ResultFindingRow[]>();
    findingsMap.set('rs-1', [
      makeFinding({ result_set_id: 'rs-1', property: 1, check_id: 'P1-01' }),
      makeFinding({ result_set_id: 'rs-1', property: 1, check_id: 'P1-02' }),
      makeFinding({ result_set_id: 'rs-1', property: 2, check_id: 'P2-01' }),
    ]);
    findingsMap.set('rs-2', [
      makeFinding({ result_set_id: 'rs-2', property: 1, check_id: 'P1-01' }),
    ]);

    const trends = buildPropertyTrends(sets, findingsMap);
    const p1 = trends.find(t => t.property === 1)!;
    // Chronological: rs-1 had 2 findings, rs-2 had 1
    expect(p1.series[0].value).toBe(2); // rs-1 (oldest)
    expect(p1.series[1].value).toBe(1); // rs-2 (latest)
    expect(p1.latestFindingCount).toBe(1);
    expect(p1.previousFindingCount).toBe(2);
  });

  it('derives improving direction when finding count decreases >5%', () => {
    const sets = [
      makeResultSet({ id: 'rs-2', completed_at: '2025-02-01T00:00:00Z' }),
      makeResultSet({ id: 'rs-1', completed_at: '2025-01-01T00:00:00Z' }),
    ];

    const findingsMap = new Map<string, ResultFindingRow[]>();
    findingsMap.set('rs-1', Array.from({ length: 10 }, (_, i) =>
      makeFinding({ result_set_id: 'rs-1', property: 1, check_id: `P1-${i}`, asset_key: `t${i}` }),
    ));
    findingsMap.set('rs-2', Array.from({ length: 3 }, (_, i) =>
      makeFinding({ result_set_id: 'rs-2', property: 1, check_id: `P1-${i}`, asset_key: `t${i}` }),
    ));

    const trends = buildPropertyTrends(sets, findingsMap);
    const p1 = trends.find(t => t.property === 1)!;
    expect(p1.direction).toBe('improving');
  });

  it('computes latest severity breakdown', () => {
    const sets = [makeResultSet({ id: 'rs-1' })];
    const findingsMap = new Map<string, ResultFindingRow[]>();
    findingsMap.set('rs-1', [
      makeFinding({ property: 3, severity: 'critical', check_id: 'P3-01', asset_key: 'a' }),
      makeFinding({ property: 3, severity: 'minor', check_id: 'P3-02', asset_key: 'b' }),
      makeFinding({ property: 3, severity: 'minor', check_id: 'P3-03', asset_key: 'c' }),
    ]);

    const trends = buildPropertyTrends(sets, findingsMap);
    const p3 = trends.find(t => t.property === 3)!;
    expect(p3.latestBySeverity.critical).toBe(1);
    expect(p3.latestBySeverity.minor).toBe(2);
    expect(p3.latestBySeverity.major).toBe(0);
  });
});

// =============================================================================
// Regression Summary
// =============================================================================

describe('buildRegressionSummary', () => {
  it('builds a complete regression summary between two result sets', () => {
    const target = makeResultSet({
      id: 'rs-2',
      run_label: 'Scan #2',
      dalc_base_usd: 120000,
      dalc_low_usd: 84000,
      dalc_high_usd: 168000,
      completed_at: '2025-02-01T00:00:00Z',
    });
    const baseline = makeResultSet({
      id: 'rs-1',
      run_label: 'Scan #1',
      dalc_base_usd: 100000,
      dalc_low_usd: 70000,
      dalc_high_usd: 140000,
      completed_at: '2025-01-01T00:00:00Z',
    });

    const targetFindings = [
      makeFinding({ check_id: 'P1-01', asset_key: 'a', severity: 'critical' }), // worsened
      makeFinding({ check_id: 'P3-01', asset_key: 'c', severity: 'major' }),    // new
    ];
    const baselineFindings = [
      makeFinding({ check_id: 'P1-01', asset_key: 'a', severity: 'minor' }),    // worsened
      makeFinding({ check_id: 'P2-01', asset_key: 'b', severity: 'info' }),     // resolved
    ];

    const summary = buildRegressionSummary(target, baseline, targetFindings, baselineFindings);

    expect(summary.targetLabel).toBe('Scan #2');
    expect(summary.baselineLabel).toBe('Scan #1');
    expect(summary.counts.new).toBe(1);
    expect(summary.counts.resolved).toBe(1);
    expect(summary.counts.worsened).toBe(1);
    expect(summary.counts.total).toBe(3);
  });

  it('computes correct DALC delta', () => {
    const target = makeResultSet({ id: 'rs-2', dalc_base_usd: 150000 });
    const baseline = makeResultSet({ id: 'rs-1', dalc_base_usd: 100000 });

    const summary = buildRegressionSummary(target, baseline, [], []);
    expect(summary.dalcDelta.changeBaseUsd).toBe(50000);
    expect(summary.dalcDelta.percentChange).toBe(50);
  });

  it('determines worsening when regressions outweigh improvements', () => {
    const target = makeResultSet({ id: 'rs-2' });
    const baseline = makeResultSet({ id: 'rs-1' });

    const targetFindings = [
      makeFinding({ check_id: 'P1-01', asset_key: 'a' }), // new (weight 2)
      makeFinding({ check_id: 'P1-02', asset_key: 'b' }), // new (weight 2)
    ];
    const baselineFindings: ResultFindingRow[] = [];

    const summary = buildRegressionSummary(target, baseline, targetFindings, baselineFindings);
    expect(summary.overallDirection).toBe('worsening');
  });

  it('determines improving when improvements outweigh regressions', () => {
    const target = makeResultSet({ id: 'rs-2' });
    const baseline = makeResultSet({ id: 'rs-1' });

    const targetFindings: ResultFindingRow[] = [];
    const baselineFindings = [
      makeFinding({ check_id: 'P1-01', asset_key: 'a' }), // resolved (weight 2)
      makeFinding({ check_id: 'P1-02', asset_key: 'b' }), // resolved (weight 2)
    ];

    const summary = buildRegressionSummary(target, baseline, targetFindings, baselineFindings);
    expect(summary.overallDirection).toBe('improving');
  });

  it('determines stable when weights are equal', () => {
    const target = makeResultSet({ id: 'rs-2' });
    const baseline = makeResultSet({ id: 'rs-1' });

    // 1 new (weight 2) vs 1 resolved (weight 2) = stable
    const targetFindings = [
      makeFinding({ check_id: 'P1-01', asset_key: 'a' }),
      makeFinding({ check_id: 'P2-01', asset_key: 'b', severity: 'minor' }), // unchanged
    ];
    const baselineFindings = [
      makeFinding({ check_id: 'P3-01', asset_key: 'c' }), // resolved
      makeFinding({ check_id: 'P2-01', asset_key: 'b', severity: 'minor' }), // unchanged
    ];

    const summary = buildRegressionSummary(target, baseline, targetFindings, baselineFindings);
    expect(summary.overallDirection).toBe('stable');
  });

  it('returns insufficient_data when no findings in either set', () => {
    const target = makeResultSet({ id: 'rs-2' });
    const baseline = makeResultSet({ id: 'rs-1' });

    const summary = buildRegressionSummary(target, baseline, [], []);
    expect(summary.overallDirection).toBe('insufficient_data');
  });

  it('caps topRegressions and topImprovements at 10', () => {
    const target = makeResultSet({ id: 'rs-2' });
    const baseline = makeResultSet({ id: 'rs-1' });

    // 15 new findings
    const targetFindings = Array.from({ length: 15 }, (_, i) =>
      makeFinding({ check_id: `P1-${i}`, asset_key: `t${i}` }),
    );

    const summary = buildRegressionSummary(target, baseline, targetFindings, []);
    expect(summary.topRegressions.length).toBeLessThanOrEqual(10);
  });

  it('sorts topRegressions by severity descending', () => {
    const target = makeResultSet({ id: 'rs-2' });
    const baseline = makeResultSet({ id: 'rs-1' });

    const targetFindings = [
      makeFinding({ check_id: 'P1-01', asset_key: 'a', severity: 'info' }),
      makeFinding({ check_id: 'P1-02', asset_key: 'b', severity: 'critical' }),
      makeFinding({ check_id: 'P1-03', asset_key: 'c', severity: 'major' }),
    ];

    const summary = buildRegressionSummary(target, baseline, targetFindings, []);
    expect(summary.topRegressions[0].currentSeverity).toBe('critical');
    expect(summary.topRegressions[1].currentSeverity).toBe('major');
    expect(summary.topRegressions[2].currentSeverity).toBe('info');
  });
});
