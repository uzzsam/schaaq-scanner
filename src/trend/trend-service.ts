/**
 * Trend Service — Deterministic History Builder
 *
 * Derives trend data from persisted, immutable scan result sets.
 * Pure computation: no writes, no side-effects, no real-time monitoring.
 *
 * Capabilities:
 *   - Finding delta: new / resolved / worsened / improved / unchanged
 *   - Property trends: per-property finding count series & direction
 *   - DALC trends: low/base/high cost series & direction
 *   - Regression summary: latest vs previous, latest vs baseline
 *   - Historical comparison window: multi-scan trend view
 */

import type { ScanResultRepository } from '../server/db/scan-result-repository';
import type { ScanResultSetRow, ResultFindingRow } from '../server/db/scan-result-types';
import {
  compareSeverity,
  severityRank,
  type DalcTrendPoint,
  type DalcTrendSeries,
  type FindingDeltaRecord,
  type FindingDeltaStatus,
  type HistoricalComparisonWindow,
  type PropertyTrendRecord,
  type RegressionSummary,
  type Severity,
  type TrendDirection,
  type TrendPoint,
} from './types';

// ---------------------------------------------------------------------------
// Property name map (server-side — mirrors ui/src/utils.ts)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Finding comparison key
// ---------------------------------------------------------------------------

/** Identity key for a finding — ignores severity so we can detect severity changes. */
function findingIdentityKey(f: { check_id: string; asset_key: string | null }): string {
  return `${f.check_id}|${f.asset_key ?? ''}`;
}

// ---------------------------------------------------------------------------
// Trend direction derivation
// ---------------------------------------------------------------------------

/**
 * Derive trend direction from a numeric series.
 * For finding counts / DALC: "improving" means decreasing, "worsening" means increasing.
 */
function deriveTrendDirection(values: number[]): TrendDirection {
  if (values.length < 2) return 'insufficient_data';

  const first = values[0];
  const last = values[values.length - 1];
  const diff = last - first;

  // Use a 5% threshold to avoid noise
  const magnitude = Math.max(Math.abs(first), 1);
  const pctChange = Math.abs(diff) / magnitude;

  if (pctChange < 0.05) return 'stable';
  // For costs and finding counts, decrease = improvement
  return diff < 0 ? 'improving' : 'worsening';
}

// ---------------------------------------------------------------------------
// Finding Delta Logic
// ---------------------------------------------------------------------------

/**
 * Compute finding deltas between a target (newer) and baseline (older) scan.
 *
 * Classification:
 *   - new:       in target but not baseline (by check_id + asset_key)
 *   - resolved:  in baseline but not target
 *   - worsened:  same identity, severity increased
 *   - improved:  same identity, severity decreased
 *   - unchanged: same identity, same severity
 */
export function computeFindingDeltas(
  targetFindings: ResultFindingRow[],
  baselineFindings: ResultFindingRow[],
): FindingDeltaRecord[] {
  const baselineMap = new Map<string, ResultFindingRow>();
  for (const f of baselineFindings) {
    const key = findingIdentityKey(f);
    // If multiple findings share the same identity, keep the highest severity
    const existing = baselineMap.get(key);
    if (!existing || compareSeverity(f.severity, existing.severity) > 0) {
      baselineMap.set(key, f);
    }
  }

  const targetMap = new Map<string, ResultFindingRow>();
  for (const f of targetFindings) {
    const key = findingIdentityKey(f);
    const existing = targetMap.get(key);
    if (!existing || compareSeverity(f.severity, existing.severity) > 0) {
      targetMap.set(key, f);
    }
  }

  const deltas: FindingDeltaRecord[] = [];
  const processedBaselineKeys = new Set<string>();

  // Walk target findings
  for (const [key, tf] of targetMap) {
    const bf = baselineMap.get(key);
    processedBaselineKeys.add(key);

    if (!bf) {
      // New finding — not in baseline
      deltas.push({
        status: 'new',
        checkId: tf.check_id,
        assetKey: tf.asset_key,
        title: tf.title,
        property: tf.property,
        currentSeverity: tf.severity,
        previousSeverity: null,
        currentRawScore: tf.raw_score,
        previousRawScore: null,
      });
    } else {
      // Existed in baseline — compare severity
      const sevDiff = compareSeverity(tf.severity, bf.severity);
      let status: FindingDeltaStatus;
      if (sevDiff > 0) status = 'worsened';
      else if (sevDiff < 0) status = 'improved';
      else status = 'unchanged';

      deltas.push({
        status,
        checkId: tf.check_id,
        assetKey: tf.asset_key,
        title: tf.title,
        property: tf.property,
        currentSeverity: tf.severity,
        previousSeverity: bf.severity,
        currentRawScore: tf.raw_score,
        previousRawScore: bf.raw_score,
      });
    }
  }

  // Walk baseline findings not in target = resolved
  for (const [key, bf] of baselineMap) {
    if (!processedBaselineKeys.has(key)) {
      deltas.push({
        status: 'resolved',
        checkId: bf.check_id,
        assetKey: bf.asset_key,
        title: bf.title,
        property: bf.property,
        currentSeverity: bf.severity,
        previousSeverity: bf.severity,
        currentRawScore: bf.raw_score,
        previousRawScore: bf.raw_score,
      });
    }
  }

  return deltas;
}

// ---------------------------------------------------------------------------
// Regression Summary Builder
// ---------------------------------------------------------------------------

export function buildRegressionSummary(
  target: ScanResultSetRow,
  baseline: ScanResultSetRow,
  targetFindings: ResultFindingRow[],
  baselineFindings: ResultFindingRow[],
): RegressionSummary {
  const deltas = computeFindingDeltas(targetFindings, baselineFindings);

  const counts = { new: 0, resolved: 0, worsened: 0, improved: 0, unchanged: 0, total: deltas.length };
  for (const d of deltas) counts[d.status]++;

  // Sort regressions/improvements by severity descending
  const sortBySeverityDesc = (a: FindingDeltaRecord, b: FindingDeltaRecord): number =>
    severityRank(b.currentSeverity) - severityRank(a.currentSeverity);

  const topRegressions = deltas
    .filter(d => d.status === 'new' || d.status === 'worsened')
    .sort(sortBySeverityDesc)
    .slice(0, 10);

  const topImprovements = deltas
    .filter(d => d.status === 'resolved' || d.status === 'improved')
    .sort(sortBySeverityDesc)
    .slice(0, 10);

  // DALC delta
  const tLow = target.dalc_low_usd ?? target.dalc_total_usd * 0.7;
  const tBase = target.dalc_base_usd ?? target.dalc_total_usd;
  const tHigh = target.dalc_high_usd ?? target.dalc_total_usd * 1.4;
  const bLow = baseline.dalc_low_usd ?? baseline.dalc_total_usd * 0.7;
  const bBase = baseline.dalc_base_usd ?? baseline.dalc_total_usd;
  const bHigh = baseline.dalc_high_usd ?? baseline.dalc_total_usd * 1.4;

  const dalcDelta = {
    baselineLowUsd: bLow,
    baselineBaseUsd: bBase,
    baselineHighUsd: bHigh,
    targetLowUsd: tLow,
    targetBaseUsd: tBase,
    targetHighUsd: tHigh,
    changeLowUsd: tLow - bLow,
    changeBaseUsd: tBase - bBase,
    changeHighUsd: tHigh - bHigh,
    percentChange: bBase !== 0 ? ((tBase - bBase) / bBase) * 100 : null,
  };

  // Overall direction: weight regressions vs improvements
  let overallDirection: TrendDirection;
  const regressionWeight = counts.new * 2 + counts.worsened;
  const improvementWeight = counts.resolved * 2 + counts.improved;
  if (deltas.length === 0) {
    overallDirection = 'insufficient_data';
  } else if (regressionWeight === 0 && improvementWeight === 0) {
    overallDirection = 'stable';
  } else if (regressionWeight > improvementWeight) {
    overallDirection = 'worsening';
  } else if (improvementWeight > regressionWeight) {
    overallDirection = 'improving';
  } else {
    overallDirection = 'stable';
  }

  return {
    targetResultSetId: target.id,
    baselineResultSetId: baseline.id,
    targetLabel: target.run_label,
    baselineLabel: baseline.run_label,
    targetTimestamp: target.completed_at ?? target.started_at,
    baselineTimestamp: baseline.completed_at ?? baseline.started_at,
    counts,
    deltas,
    topRegressions,
    topImprovements,
    dalcDelta,
    overallDirection,
  };
}

// ---------------------------------------------------------------------------
// DALC Trend Series Builder
// ---------------------------------------------------------------------------

/** Build a DALC cost trend series from result sets (newest first). */
export function buildDalcTrendSeries(resultSets: ScanResultSetRow[]): DalcTrendSeries {
  // Reverse to chronological (oldest first) for direction derivation
  const chronological = [...resultSets].reverse();

  const points: DalcTrendPoint[] = chronological.map(rs => ({
    resultSetId: rs.id,
    runLabel: rs.run_label,
    timestamp: rs.completed_at ?? rs.started_at,
    value: rs.dalc_base_usd ?? rs.dalc_total_usd,
    lowUsd: rs.dalc_low_usd ?? rs.dalc_total_usd * 0.7,
    baseUsd: rs.dalc_base_usd ?? rs.dalc_total_usd,
    highUsd: rs.dalc_high_usd ?? rs.dalc_total_usd * 1.4,
  }));

  const baseValues = points.map(p => p.baseUsd);
  const direction = deriveTrendDirection(baseValues);
  const latestBaseUsd = points.length > 0 ? points[points.length - 1].baseUsd : 0;
  const earliestBaseUsd = points.length > 0 ? points[0].baseUsd : 0;
  const percentChange = earliestBaseUsd !== 0
    ? ((latestBaseUsd - earliestBaseUsd) / earliestBaseUsd) * 100
    : null;

  return { points, direction, latestBaseUsd, earliestBaseUsd, percentChange };
}

// ---------------------------------------------------------------------------
// Property Trend Builder
// ---------------------------------------------------------------------------

/** Build property-level trend records from a window of result sets. */
export function buildPropertyTrends(
  resultSets: ScanResultSetRow[],
  findingsByResultSet: Map<string, ResultFindingRow[]>,
): PropertyTrendRecord[] {
  const chronological = [...resultSets].reverse();
  const properties = [1, 2, 3, 4, 5, 6, 7, 8];

  return properties.map(prop => {
    const series: TrendPoint[] = chronological.map(rs => {
      const findings = findingsByResultSet.get(rs.id) ?? [];
      const propFindings = findings.filter(f => f.property === prop);
      return {
        resultSetId: rs.id,
        runLabel: rs.run_label,
        timestamp: rs.completed_at ?? rs.started_at,
        value: propFindings.length,
      };
    });

    const values = series.map(s => s.value);
    const direction = deriveTrendDirection(values);
    const latestFindingCount = values.length > 0 ? values[values.length - 1] : 0;
    const previousFindingCount = values.length > 1 ? values[values.length - 2] : null;

    // Latest severity breakdown
    const latestBySeverity: Record<Severity, number> = { critical: 0, major: 0, minor: 0, info: 0 };
    if (chronological.length > 0) {
      const latestRs = chronological[chronological.length - 1];
      const latestFindings = findingsByResultSet.get(latestRs.id) ?? [];
      for (const f of latestFindings) {
        if (f.property === prop && f.severity in latestBySeverity) {
          latestBySeverity[f.severity as Severity]++;
        }
      }
    }

    return {
      property: prop,
      propertyName: PROPERTY_NAMES[prop] ?? `Property ${prop}`,
      series,
      direction,
      latestFindingCount,
      previousFindingCount,
      latestBySeverity,
    };
  });
}

// ---------------------------------------------------------------------------
// Historical Comparison Window Builder
// ---------------------------------------------------------------------------

/**
 * Build a full historical comparison window for a project.
 *
 * @param repo         Scan result repository
 * @param projectId    Project to analyse
 * @param windowSize   Number of recent scans to include (default 10)
 */
export function buildHistoricalComparisonWindow(
  repo: ScanResultRepository,
  projectId: string,
  windowSize: number = 10,
): HistoricalComparisonWindow | null {
  const history = repo.getScanHistoryForProject(projectId, windowSize);
  if (history.length === 0) return null;

  // Get full result set rows (needed for DALC fields and regression summaries)
  const resultSets: ScanResultSetRow[] = [];
  const findingsByResultSet = new Map<string, ResultFindingRow[]>();

  for (const item of history) {
    const row = repo.getResultSetById(item.resultSetId);
    if (row) {
      resultSets.push(row);
      findingsByResultSet.set(row.id, repo.getFindingsByResultSetId(row.id));
    }
  }

  if (resultSets.length === 0) return null;

  // Build overview entries (newest first, matching history order)
  const resultSetEntries = resultSets.map(rs => ({
    resultSetId: rs.id,
    runLabel: rs.run_label,
    timestamp: rs.completed_at ?? rs.started_at,
    totalFindings: rs.total_findings,
    criticalCount: rs.critical_count,
    majorCount: rs.major_count,
    dalcBaseUsd: rs.dalc_base_usd ?? rs.dalc_total_usd,
    dalcLowUsd: rs.dalc_low_usd ?? rs.dalc_total_usd * 0.7,
    dalcHighUsd: rs.dalc_high_usd ?? rs.dalc_total_usd * 1.4,
  }));

  // DALC trend
  const dalcTrend = buildDalcTrendSeries(resultSets);

  // Property trends
  const propertyTrends = buildPropertyTrends(resultSets, findingsByResultSet);

  // Regression: latest vs baseline (oldest in window)
  let regressionVsBaseline: RegressionSummary | null = null;
  if (resultSets.length >= 2) {
    const latest = resultSets[0]; // newest first
    const baseline = resultSets[resultSets.length - 1]; // oldest
    regressionVsBaseline = buildRegressionSummary(
      latest,
      baseline,
      findingsByResultSet.get(latest.id) ?? [],
      findingsByResultSet.get(baseline.id) ?? [],
    );
  }

  // Regression: latest vs previous
  let regressionVsPrevious: RegressionSummary | null = null;
  if (resultSets.length >= 2) {
    const latest = resultSets[0];
    const previous = resultSets[1];
    regressionVsPrevious = buildRegressionSummary(
      latest,
      previous,
      findingsByResultSet.get(latest.id) ?? [],
      findingsByResultSet.get(previous.id) ?? [],
    );
  }

  return {
    projectId,
    windowSize: resultSets.length,
    resultSets: resultSetEntries,
    dalcTrend,
    propertyTrends,
    regressionVsBaseline,
    regressionVsPrevious,
  };
}

/**
 * Build a regression summary comparing two specific result sets.
 * Convenience for "latest vs selected baseline" use case.
 */
export function buildRegressionBetween(
  repo: ScanResultRepository,
  targetResultSetId: string,
  baselineResultSetId: string,
): RegressionSummary | null {
  const target = repo.getResultSetById(targetResultSetId);
  const baseline = repo.getResultSetById(baselineResultSetId);
  if (!target || !baseline) return null;

  const targetFindings = repo.getFindingsByResultSetId(targetResultSetId);
  const baselineFindings = repo.getFindingsByResultSetId(baselineResultSetId);

  return buildRegressionSummary(target, baseline, targetFindings, baselineFindings);
}
