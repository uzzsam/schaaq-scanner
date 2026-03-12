/**
 * Benchmark Comparison Service — Deterministic Comparison Engine
 *
 * Compares a scan result set against a benchmark pack and/or project baseline.
 * Pure computation: no writes, no side-effects.
 *
 * Position classification is conservative — sparse data yields 'unknown'.
 */

import type { ScanResultRepository } from '../server/db/scan-result-repository';
import type { ScanResultSetRow } from '../server/db/scan-result-types';
import type {
  BenchmarkPack,
  BenchmarkMetric,
  BenchmarkPosition,
  PropertyBenchmarkPosition,
  BenchmarkComparisonRecord,
  PropertyBenchmarkComparison,
  ProjectBaselineComparison,
  BenchmarkSummary,
} from './types';
import {
  BENCHMARK_POSITION_LABELS,
  PROPERTY_POSITION_LABELS,
} from './types';
import type { TrendDirection } from '../trend/types';

// =============================================================================
// Property name map (mirrors trend-service.ts)
// =============================================================================

const PROPERTY_NAMES: Record<number, string> = {
  1: 'Semantic Identity',
  2: 'Controlled Reference',
  3: 'Domain Ownership',
  4: 'Anti-Corruption',
  5: 'Schema Governance',
  6: 'Quality Measurement',
  7: 'Regulatory Traceability',
  8: 'AI Readiness',
};

// =============================================================================
// Position Classification
// =============================================================================

/**
 * Classify a value's position relative to a benchmark range.
 * Conservative: returns 'unknown' if metric bounds are invalid.
 */
export function classifyPosition(
  actualValue: number,
  metric: BenchmarkMetric,
): BenchmarkPosition {
  if (metric.low > metric.high) return 'unknown';
  if (actualValue < metric.low) return 'below_range';
  if (actualValue > metric.high) return 'above_range';
  return 'within_range';
}

/**
 * Classify a property-level finding count position.
 * Uses a 20% tolerance band around the range for 'near_range'.
 */
export function classifyPropertyPosition(
  actualCount: number,
  metric: BenchmarkMetric,
): PropertyBenchmarkPosition {
  if (metric.low > metric.high) return 'unknown';

  const range = metric.high - metric.low;
  const tolerance = Math.max(range * 0.2, 1);

  if (actualCount < metric.low) return 'better_than_range';
  if (actualCount > metric.high + tolerance) return 'worse_than_range';
  if (actualCount > metric.high) return 'near_range';
  return 'near_range';  // within range = near range at property level
}

// =============================================================================
// Percent from range
// =============================================================================

function percentFromRange(value: number, metric: BenchmarkMetric): number | null {
  if (value >= metric.low && value <= metric.high) return null; // within range
  if (value < metric.low) {
    return metric.low === 0 ? null : -((metric.low - value) / metric.low) * 100;
  }
  return metric.high === 0 ? null : ((value - metric.high) / metric.high) * 100;
}

// =============================================================================
// Single Metric Comparison
// =============================================================================

export function compareMetric(
  actualValue: number,
  metric: BenchmarkMetric,
): BenchmarkComparisonRecord {
  const position = classifyPosition(actualValue, metric);
  const pctFrom = percentFromRange(actualValue, metric);
  const absPct = pctFrom !== null ? Math.abs(Math.round(pctFrom)) : null;

  let message: string;
  switch (position) {
    case 'below_range':
      if (metric.lowerIsBetter) {
        message = absPct !== null
          ? `${metric.label} is ${absPct}% below the expected range — better than expected.`
          : `${metric.label} is below the expected range.`;
      } else {
        message = absPct !== null
          ? `${metric.label} is ${absPct}% below the expected range — this may indicate under-measurement.`
          : `${metric.label} is below the expected range.`;
      }
      break;
    case 'above_range':
      if (metric.lowerIsBetter) {
        message = absPct !== null
          ? `${metric.label} is ${absPct}% above the expected range — materially worse than expected.`
          : `${metric.label} is above the expected range.`;
      } else {
        message = absPct !== null
          ? `${metric.label} is ${absPct}% above the expected range.`
          : `${metric.label} is above the expected range.`;
      }
      break;
    case 'within_range':
      message = `${metric.label} is within the expected range.`;
      break;
    default:
      message = `${metric.label}: insufficient data for comparison.`;
  }

  return { metric, actualValue, position, message, percentFromRange: pctFrom !== null ? Math.round(pctFrom) : null };
}

// =============================================================================
// Property Comparison
// =============================================================================

export function comparePropertyFindings(
  property: number,
  actualCount: number,
  metric: BenchmarkMetric,
): PropertyBenchmarkComparison {
  const position = classifyPropertyPosition(actualCount, metric);
  const propertyName = PROPERTY_NAMES[property] ?? `Property ${property}`;

  let message: string;
  switch (position) {
    case 'better_than_range':
      message = `${propertyName}: ${actualCount} finding(s) — fewer than the expected range (${metric.low}–${metric.high}).`;
      break;
    case 'worse_than_range':
      message = `${propertyName}: ${actualCount} finding(s) — above the expected range (${metric.low}–${metric.high}).`;
      break;
    case 'near_range':
      message = `${propertyName}: ${actualCount} finding(s) — near the expected range (${metric.low}–${metric.high}).`;
      break;
    default:
      message = `${propertyName}: insufficient data for comparison.`;
  }

  return {
    property,
    propertyName,
    actualFindingCount: actualCount,
    benchmarkLow: metric.low,
    benchmarkHigh: metric.high,
    position,
    message,
  };
}

// =============================================================================
// Trend Direction Helpers
// =============================================================================

function deriveTrendDirectionFromDelta(delta: number, base: number): TrendDirection {
  if (base === 0) return delta === 0 ? 'stable' : (delta > 0 ? 'worsening' : 'improving');
  const pct = Math.abs(delta / base);
  if (pct < 0.05) return 'stable';
  return delta < 0 ? 'improving' : 'worsening';
}

const DIRECTION_LABELS: Record<TrendDirection, string> = {
  improving: 'Improving',
  worsening: 'Worsening',
  stable: 'Stable',
  insufficient_data: 'Insufficient Data',
};

// =============================================================================
// Project Baseline Comparison
// =============================================================================

/**
 * Compare the latest result set to the project baseline (first completed scan).
 * Reuses the existing scan-result-repository to find oldest and newest scans.
 */
export function buildBaselineComparison(
  repo: ScanResultRepository,
  projectId: string,
): ProjectBaselineComparison | null {
  const history = repo.getScanHistoryForProject(projectId, 200);
  if (history.length < 2) return null;

  // Latest = first in list (newest first), baseline = last (oldest)
  const latestItem = history[0];
  const baselineItem = history[history.length - 1];

  const latest = repo.getResultSetById(latestItem.resultSetId);
  const baseline = repo.getResultSetById(baselineItem.resultSetId);
  if (!latest || !baseline) return null;

  const latestDalc = latest.dalc_base_usd ?? latest.dalc_total_usd;
  const baselineDalc = baseline.dalc_base_usd ?? baseline.dalc_total_usd;
  const dalcDelta = latestDalc - baselineDalc;
  const dalcDirection = deriveTrendDirectionFromDelta(dalcDelta, baselineDalc);
  const dalcPctChange = baselineDalc !== 0 ? (dalcDelta / baselineDalc) * 100 : null;

  const findingDelta = latest.total_findings - baseline.total_findings;
  const findingDirection = deriveTrendDirectionFromDelta(findingDelta, baseline.total_findings);

  const latestHigh = latest.critical_count + latest.major_count;
  const baselineHigh = baseline.critical_count + baseline.major_count;
  const highDelta = latestHigh - baselineHigh;
  const highDirection = deriveTrendDirectionFromDelta(highDelta, baselineHigh);

  return {
    baselineAvailable: true,
    baselineResultSetId: baseline.id,
    baselineLabel: baseline.run_label,
    baselineTimestamp: baseline.completed_at ?? baseline.started_at,
    dalcDirection,
    dalcDirectionLabel: DIRECTION_LABELS[dalcDirection],
    dalcPercentChange: dalcPctChange !== null ? Math.round(dalcPctChange * 10) / 10 : null,
    findingCountDirection: findingDirection,
    findingCountDirectionLabel: DIRECTION_LABELS[findingDirection],
    findingCountDelta: findingDelta,
    highSeverityDirection: highDirection,
    highSeverityDirectionLabel: DIRECTION_LABELS[highDirection],
    highSeverityDelta: highDelta,
  };
}

// =============================================================================
// Overall Position Derivation
// =============================================================================

function deriveOverallPosition(
  dalc: BenchmarkComparisonRecord,
  totalFindings: BenchmarkComparisonRecord,
  highSeverity: BenchmarkComparisonRecord,
): BenchmarkPosition {
  // If any key metric is above_range, overall is above_range
  if (dalc.position === 'above_range' || highSeverity.position === 'above_range') {
    return 'above_range';
  }
  // If any key metric is below_range and none above, overall is below_range
  if (dalc.position === 'below_range' && totalFindings.position !== 'above_range') {
    return 'below_range';
  }
  // If all within range
  if (dalc.position === 'within_range' && totalFindings.position === 'within_range' && highSeverity.position === 'within_range') {
    return 'within_range';
  }
  // Mixed or unknown
  if (dalc.position === 'unknown' && totalFindings.position === 'unknown') {
    return 'unknown';
  }
  return 'within_range';
}

// =============================================================================
// Key Messages
// =============================================================================

function buildKeyMessages(
  dalc: BenchmarkComparisonRecord,
  totalFindings: BenchmarkComparisonRecord,
  highSeverity: BenchmarkComparisonRecord,
  baseline: ProjectBaselineComparison | null,
): string[] {
  const messages: string[] = [];

  // DALC message
  if (dalc.position === 'above_range') {
    messages.push(dalc.message);
  } else if (dalc.position === 'below_range') {
    messages.push(dalc.message);
  }

  // High severity message (only if notable)
  if (highSeverity.position === 'above_range') {
    messages.push(highSeverity.message);
  }

  // Baseline direction (if available and notable)
  if (baseline?.baselineAvailable && baseline.dalcDirection !== 'stable' && baseline.dalcDirection !== 'insufficient_data') {
    const dirWord = baseline.dalcDirection === 'improving' ? 'decreased' : 'increased';
    const pctStr = baseline.dalcPercentChange !== null ? ` by ${Math.abs(baseline.dalcPercentChange)}%` : '';
    messages.push(`DALC cost has ${dirWord}${pctStr} since the project baseline.`);
  }

  // If nothing notable, add a neutral message
  if (messages.length === 0) {
    messages.push('All key metrics are within the expected range for this sector.');
  }

  return messages.slice(0, 3);
}

// =============================================================================
// Overall Message
// =============================================================================

function buildOverallMessage(position: BenchmarkPosition, packName: string): string {
  switch (position) {
    case 'below_range':
      return `Compared to the ${packName} benchmark, this data estate is performing better than expected across key metrics.`;
    case 'within_range':
      return `Compared to the ${packName} benchmark, this data estate is within the expected range for key metrics.`;
    case 'above_range':
      return `Compared to the ${packName} benchmark, one or more key metrics are materially worse than expected — prioritise the remediation plan.`;
    default:
      return `Insufficient data to compare against the ${packName} benchmark.`;
  }
}

// =============================================================================
// Public API: compareToBenchmark
// =============================================================================

/**
 * Compare a result set to a benchmark pack.
 * Optionally includes project baseline comparison.
 *
 * @param resultSet       The scan result set to compare
 * @param pack            The benchmark pack to compare against
 * @param findingCounts   Per-property finding counts (keyed by property number)
 * @param baseline        Optional project baseline comparison (pass null if not available)
 */
export function compareToBenchmark(
  resultSet: ScanResultSetRow,
  pack: BenchmarkPack,
  findingCounts: Record<number, number>,
  baseline: ProjectBaselineComparison | null,
): BenchmarkSummary {
  const dalcBase = resultSet.dalc_base_usd ?? resultSet.dalc_total_usd;
  const totalFindings = resultSet.total_findings;
  const highSeverityCount = resultSet.critical_count + resultSet.major_count;
  const highSeverityDensity = totalFindings > 0
    ? highSeverityCount / totalFindings
    : 0;

  // Core metric comparisons
  const dalcComparison = compareMetric(dalcBase, pack.dalcBaseUsd);
  const totalFindingsComparison = compareMetric(totalFindings, pack.totalFindings);
  const highSeverityComparison = compareMetric(highSeverityCount, pack.highSeverityFindings);
  const highSeverityDensityComparison = compareMetric(
    Math.round(highSeverityDensity * 100) / 100,
    pack.highSeverityDensity,
  );

  // Property comparisons
  const propertyComparisons: PropertyBenchmarkComparison[] = [];
  for (const prop of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const propMetric = pack.propertyFindings[prop];
    if (!propMetric) continue;
    const count = findingCounts[prop] ?? 0;
    propertyComparisons.push(comparePropertyFindings(prop, count, propMetric));
  }

  // Overall position
  const overallPosition = deriveOverallPosition(dalcComparison, totalFindingsComparison, highSeverityComparison);
  const overallMessage = buildOverallMessage(overallPosition, pack.name);

  // Key messages
  const keyMessages = buildKeyMessages(dalcComparison, totalFindingsComparison, highSeverityComparison, baseline);

  return {
    packId: pack.id,
    packName: pack.name,
    packSector: pack.sector,
    packVersion: pack.version,
    overallPosition,
    overallMessage,
    dalcComparison,
    totalFindingsComparison,
    highSeverityComparison,
    highSeverityDensityComparison,
    propertyComparisons,
    baselineComparison: baseline,
    keyMessages,
  };
}

// =============================================================================
// Convenience: buildBenchmarkSummary (repo-aware)
// =============================================================================

/**
 * Build a full benchmark summary for a result set, using the repository
 * to load findings and baseline data.
 */
export function buildBenchmarkSummary(
  repo: ScanResultRepository,
  resultSetId: string,
  pack: BenchmarkPack,
): BenchmarkSummary | null {
  const resultSet = repo.getResultSetById(resultSetId);
  if (!resultSet) return null;

  // Build per-property finding counts
  const findings = repo.getFindingsByResultSetId(resultSetId);
  const findingCounts: Record<number, number> = {};
  for (const f of findings) {
    findingCounts[f.property] = (findingCounts[f.property] ?? 0) + 1;
  }

  // Build baseline comparison
  const baseline = buildBaselineComparison(repo, resultSet.project_id);

  return compareToBenchmark(resultSet, pack, findingCounts, baseline);
}
