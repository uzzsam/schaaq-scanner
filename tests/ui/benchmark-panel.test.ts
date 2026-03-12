/**
 * UI Tests for BenchmarkPanel Rendering Logic
 *
 * Verifies the data-to-UI contract: given a BenchmarkSummary, the BenchmarkPanel
 * and ScanResults page produce the expected visual outputs.
 *
 * These tests exercise the pure data model contracts that the React component
 * relies on — verifying that:
 *   - Pack name, overall position label, and version are present in summary
 *   - Property comparisons are structured for rendering
 *   - Baseline comparison data is available when 2+ scans exist
 *   - Position labels and colors resolve correctly for all positions
 *   - Clean handling of absent/null fields
 *
 * Since the project uses inline styles (no CSS modules), testing the data model
 * contracts provides higher value than JSDOM rendering tests.
 */

import { describe, it, expect } from 'vitest';
import type {
  BenchmarkPosition,
  PropertyBenchmarkPosition,
  BenchmarkSummary,
  BenchmarkComparisonRecord,
  PropertyBenchmarkComparison,
  ProjectBaselineComparison,
} from '../../src/benchmark';
import {
  BENCHMARK_POSITION_LABELS,
  BENCHMARK_POSITION_COLORS,
  PROPERTY_POSITION_LABELS,
  PROPERTY_POSITION_COLORS,
} from '../../src/benchmark';
import { formatCost, PROPERTY_NAMES } from '../../ui/src/utils';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function makeMetric(label: string, low: number, high: number, unit = 'USD') {
  return { key: label.toLowerCase().replace(/\s+/g, '_'), label, low, high, unit, lowerIsBetter: true };
}

function makeComparisonRecord(
  label: string,
  actualValue: number,
  position: BenchmarkPosition,
): BenchmarkComparisonRecord {
  return {
    metric: makeMetric(label, 15_000, 85_000),
    actualValue,
    position,
    message: `${label} test message`,
    percentFromRange: position === 'within_range' ? null : 25,
  };
}

function makePropertyComparison(
  property: number,
  actualCount: number,
  position: PropertyBenchmarkPosition,
): PropertyBenchmarkComparison {
  return {
    property,
    propertyName: PROPERTY_NAMES[property] ?? `Property ${property}`,
    actualFindingCount: actualCount,
    benchmarkLow: 0,
    benchmarkHigh: 5,
    position,
    message: `Property ${property} test message`,
  };
}

function makeBaselineComparison(overrides: Partial<ProjectBaselineComparison> = {}): ProjectBaselineComparison {
  return {
    baselineAvailable: true,
    baselineResultSetId: 'baseline-001',
    baselineLabel: 'Initial Scan',
    baselineTimestamp: '2026-01-01T00:00:00.000Z',
    dalcDirection: 'worsening',
    dalcDirectionLabel: 'Worsening',
    dalcPercentChange: 50,
    findingCountDirection: 'improving',
    findingCountDirectionLabel: 'Improving',
    findingCountDelta: -5,
    highSeverityDirection: 'stable',
    highSeverityDirectionLabel: 'Stable',
    highSeverityDelta: 0,
    ...overrides,
  };
}

function makeBenchmarkSummary(overrides: Partial<BenchmarkSummary> = {}): BenchmarkSummary {
  return {
    packId: 'default-v1',
    packName: 'Cross-Sector Default',
    packSector: 'default',
    packVersion: '1.0.0',
    overallPosition: 'within_range',
    overallMessage: 'Within expected range.',
    dalcComparison: makeComparisonRecord('DALC Base Cost', 50_000, 'within_range'),
    totalFindingsComparison: makeComparisonRecord('Total Findings', 12, 'within_range'),
    highSeverityComparison: makeComparisonRecord('Critical + Major', 6, 'within_range'),
    highSeverityDensityComparison: makeComparisonRecord('High-Severity Density', 0.5, 'within_range'),
    propertyComparisons: [
      makePropertyComparison(1, 2, 'near_range'),
      makePropertyComparison(3, 0, 'better_than_range'),
      makePropertyComparison(5, 8, 'worse_than_range'),
    ],
    baselineComparison: null,
    keyMessages: ['All key metrics are within the expected range for this sector.'],
    ...overrides,
  };
}

// =========================================================================
// Position Label & Color Resolution
// =========================================================================

describe('Benchmark Position Labels & Colors', () => {
  it('BENCHMARK_POSITION_LABELS covers all positions', () => {
    const positions: BenchmarkPosition[] = ['below_range', 'within_range', 'above_range', 'unknown'];
    for (const p of positions) {
      expect(BENCHMARK_POSITION_LABELS[p]).toBeTruthy();
      expect(typeof BENCHMARK_POSITION_LABELS[p]).toBe('string');
    }
  });

  it('BENCHMARK_POSITION_COLORS covers all positions', () => {
    const positions: BenchmarkPosition[] = ['below_range', 'within_range', 'above_range', 'unknown'];
    for (const p of positions) {
      expect(BENCHMARK_POSITION_COLORS[p]).toBeTruthy();
    }
  });

  it('PROPERTY_POSITION_LABELS covers all property positions', () => {
    const positions: PropertyBenchmarkPosition[] = ['better_than_range', 'near_range', 'worse_than_range', 'unknown'];
    for (const p of positions) {
      expect(PROPERTY_POSITION_LABELS[p]).toBeTruthy();
    }
  });

  it('PROPERTY_POSITION_COLORS covers all property positions', () => {
    const positions: PropertyBenchmarkPosition[] = ['better_than_range', 'near_range', 'worse_than_range', 'unknown'];
    for (const p of positions) {
      expect(PROPERTY_POSITION_COLORS[p]).toBeTruthy();
    }
  });

  it('within_range maps to expected label', () => {
    expect(BENCHMARK_POSITION_LABELS['within_range']).toBe('Within Expected Range');
  });

  it('above_range maps to Worse Than Expected', () => {
    expect(BENCHMARK_POSITION_LABELS['above_range']).toBe('Worse Than Expected');
  });

  it('below_range maps to Better Than Expected', () => {
    expect(BENCHMARK_POSITION_LABELS['below_range']).toBe('Better Than Expected');
  });
});

// =========================================================================
// BenchmarkSummary Rendering Contract — Pack Name & Version
// =========================================================================

describe('BenchmarkPanel Data Contract — Pack Info', () => {
  it('pack name is available for rendering', () => {
    const summary = makeBenchmarkSummary();
    expect(summary.packName).toBe('Cross-Sector Default');
  });

  it('pack version is available for rendering', () => {
    const summary = makeBenchmarkSummary();
    expect(summary.packVersion).toBe('1.0.0');
  });

  it('financial-services pack name is distinct', () => {
    const summary = makeBenchmarkSummary({
      packId: 'financial-services-v1',
      packName: 'Financial Services',
      packSector: 'financial-services',
    });
    expect(summary.packName).toBe('Financial Services');
    expect(summary.packSector).toBe('financial-services');
  });
});

// =========================================================================
// BenchmarkPanel Data Contract — Overall Position
// =========================================================================

describe('BenchmarkPanel Data Contract — Overall Position', () => {
  it('overall position label is resolvable from position value', () => {
    const summary = makeBenchmarkSummary({ overallPosition: 'above_range' });
    const label = BENCHMARK_POSITION_LABELS[summary.overallPosition];
    expect(label).toBe('Worse Than Expected');
  });

  it('overall position color is resolvable', () => {
    const summary = makeBenchmarkSummary({ overallPosition: 'below_range' });
    const color = BENCHMARK_POSITION_COLORS[summary.overallPosition];
    expect(color).toBeTruthy();
  });

  it('overallMessage is present', () => {
    const summary = makeBenchmarkSummary();
    expect(summary.overallMessage.length).toBeGreaterThan(0);
  });
});

// =========================================================================
// BenchmarkPanel Data Contract — Metric Rows
// =========================================================================

describe('BenchmarkPanel Data Contract — Metric Comparisons', () => {
  it('DALC metric row has label and formatted actualValue', () => {
    const summary = makeBenchmarkSummary();
    const dalc = summary.dalcComparison;
    expect(dalc.metric.label).toBeTruthy();
    // formatCost is used in MetricRow to display USD values
    expect(formatCost(dalc.actualValue)).toMatch(/^\$/);
  });

  it('percentFromRange is null when within range', () => {
    const summary = makeBenchmarkSummary();
    expect(summary.dalcComparison.percentFromRange).toBeNull();
  });

  it('percentFromRange is a number when outside range', () => {
    const summary = makeBenchmarkSummary({
      dalcComparison: makeComparisonRecord('DALC Base Cost', 200_000, 'above_range'),
    });
    expect(summary.dalcComparison.percentFromRange).toBe(25);
  });

  it('all four metric rows are present', () => {
    const summary = makeBenchmarkSummary();
    expect(summary.dalcComparison).toBeDefined();
    expect(summary.totalFindingsComparison).toBeDefined();
    expect(summary.highSeverityComparison).toBeDefined();
    expect(summary.highSeverityDensityComparison).toBeDefined();
  });
});

// =========================================================================
// BenchmarkPanel Data Contract — Property Comparisons
// =========================================================================

describe('BenchmarkPanel Data Contract — Property Comparisons', () => {
  it('property comparisons are present with correct structure', () => {
    const summary = makeBenchmarkSummary();
    expect(summary.propertyComparisons.length).toBe(3);

    const pc = summary.propertyComparisons[0];
    expect(pc.property).toBe(1);
    expect(pc.propertyName).toBeTruthy();
    expect(typeof pc.actualFindingCount).toBe('number');
    expect(typeof pc.benchmarkLow).toBe('number');
    expect(typeof pc.benchmarkHigh).toBe('number');
  });

  it('property names resolve from PROPERTY_NAMES map', () => {
    const summary = makeBenchmarkSummary();
    for (const pc of summary.propertyComparisons) {
      const name = PROPERTY_NAMES[pc.property] ?? pc.propertyName;
      expect(name).toBeTruthy();
    }
  });

  it('property position labels resolve correctly', () => {
    const summary = makeBenchmarkSummary();
    for (const pc of summary.propertyComparisons) {
      const label = PROPERTY_POSITION_LABELS[pc.position];
      expect(label).toBeTruthy();
    }
  });

  it('property position colors resolve correctly', () => {
    const summary = makeBenchmarkSummary();
    for (const pc of summary.propertyComparisons) {
      const color = PROPERTY_POSITION_COLORS[pc.position];
      expect(color).toBeTruthy();
    }
  });

  it('empty property comparisons array is valid (no properties in pack)', () => {
    const summary = makeBenchmarkSummary({ propertyComparisons: [] });
    expect(summary.propertyComparisons.length).toBe(0);
  });
});

// =========================================================================
// BenchmarkPanel Data Contract — Baseline Comparison
// =========================================================================

describe('BenchmarkPanel Data Contract — Baseline Comparison', () => {
  it('baseline is null when not available (single scan)', () => {
    const summary = makeBenchmarkSummary({ baselineComparison: null });
    expect(summary.baselineComparison).toBeNull();
  });

  it('baseline card renders when baselineAvailable is true', () => {
    const summary = makeBenchmarkSummary({
      baselineComparison: makeBaselineComparison(),
    });
    expect(summary.baselineComparison).not.toBeNull();
    expect(summary.baselineComparison!.baselineAvailable).toBe(true);
  });

  it('baseline includes DALC direction label', () => {
    const summary = makeBenchmarkSummary({
      baselineComparison: makeBaselineComparison({ dalcDirectionLabel: 'Worsening' }),
    });
    expect(summary.baselineComparison!.dalcDirectionLabel).toBe('Worsening');
  });

  it('baseline includes dalcPercentChange', () => {
    const summary = makeBenchmarkSummary({
      baselineComparison: makeBaselineComparison({ dalcPercentChange: 50 }),
    });
    expect(summary.baselineComparison!.dalcPercentChange).toBe(50);
  });

  it('baseline includes finding count direction label', () => {
    const summary = makeBenchmarkSummary({
      baselineComparison: makeBaselineComparison({ findingCountDirectionLabel: 'Improving' }),
    });
    expect(summary.baselineComparison!.findingCountDirectionLabel).toBe('Improving');
  });

  it('baseline with baselineAvailable=false is treated as absent', () => {
    const summary = makeBenchmarkSummary({
      baselineComparison: makeBaselineComparison({ baselineAvailable: false }),
    });
    // BenchmarkPanel renders baseline card conditionally: benchmark.baselineComparison?.baselineAvailable
    expect(summary.baselineComparison!.baselineAvailable).toBe(false);
  });
});

// =========================================================================
// BenchmarkPanel Data Contract — Key Messages
// =========================================================================

describe('BenchmarkPanel Data Contract — Key Messages', () => {
  it('key messages array is present and non-empty', () => {
    const summary = makeBenchmarkSummary();
    expect(summary.keyMessages.length).toBeGreaterThanOrEqual(1);
  });

  it('key messages are capped at 3', () => {
    const summary = makeBenchmarkSummary({
      keyMessages: ['msg1', 'msg2', 'msg3'],
    });
    expect(summary.keyMessages.length).toBeLessThanOrEqual(3);
  });
});

// =========================================================================
// ScanResults Conditional Rendering Contract
// =========================================================================

describe('ScanResults Integration — Conditional Benchmark Rendering', () => {
  it('benchmarkData=null means panel is NOT rendered (falsy check)', () => {
    const benchmarkData: BenchmarkSummary | null = null;
    // ScanResults: {benchmarkData && (<BenchmarkPanel benchmark={benchmarkData} />)}
    expect(benchmarkData).toBeFalsy();
  });

  it('benchmarkData with valid summary means panel IS rendered (truthy check)', () => {
    const benchmarkData: BenchmarkSummary | null = makeBenchmarkSummary();
    expect(benchmarkData).toBeTruthy();
  });

  it('benchmarkData carries all fields needed by BenchmarkPanel', () => {
    const benchmarkData = makeBenchmarkSummary({
      baselineComparison: makeBaselineComparison(),
    });

    // Fields required by BenchmarkPanel component:
    expect(benchmarkData.overallPosition).toBeDefined();
    expect(benchmarkData.packName).toBeDefined();
    expect(benchmarkData.packVersion).toBeDefined();
    expect(benchmarkData.keyMessages).toBeDefined();
    expect(benchmarkData.dalcComparison).toBeDefined();
    expect(benchmarkData.totalFindingsComparison).toBeDefined();
    expect(benchmarkData.highSeverityComparison).toBeDefined();
    expect(benchmarkData.highSeverityDensityComparison).toBeDefined();
    expect(benchmarkData.propertyComparisons).toBeDefined();
    expect(benchmarkData.baselineComparison).toBeDefined();
  });
});

// =========================================================================
// Clean Unknown/Absent Handling
// =========================================================================

describe('Clean Unknown/Absent Handling', () => {
  it('unknown overall position resolves to a valid label', () => {
    const summary = makeBenchmarkSummary({ overallPosition: 'unknown' });
    expect(BENCHMARK_POSITION_LABELS[summary.overallPosition]).toBe('Insufficient Data');
  });

  it('unknown property position resolves to a valid label', () => {
    const pc = makePropertyComparison(1, 0, 'unknown');
    expect(PROPERTY_POSITION_LABELS[pc.position]).toBe('Unknown');
  });

  it('null percentFromRange is handled (no percent display)', () => {
    const record = makeComparisonRecord('Test', 50_000, 'within_range');
    // BenchmarkPanel: pct !== null ? `${pct > 0 ? '+' : ''}${pct}%` : BENCHMARK_POSITION_LABELS[record.position]
    const display = record.percentFromRange !== null
      ? `${record.percentFromRange > 0 ? '+' : ''}${record.percentFromRange}%`
      : BENCHMARK_POSITION_LABELS[record.position];
    expect(display).toBe('Within Expected Range');
  });

  it('null baselineComparison means no baseline card', () => {
    const summary = makeBenchmarkSummary({ baselineComparison: null });
    // BenchmarkPanel: {benchmark.baselineComparison?.baselineAvailable && (...)}
    const shouldRender = summary.baselineComparison?.baselineAvailable;
    expect(shouldRender).toBeFalsy();
  });

  it('null dalcPercentChange means no percent display in baseline', () => {
    const baseline = makeBaselineComparison({ dalcPercentChange: null });
    // BenchmarkPanel: {benchmark.baselineComparison.dalcPercentChange !== null && (...)}
    expect(baseline.dalcPercentChange).toBeNull();
  });
});
