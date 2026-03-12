/**
 * Trend & Regression Detection — Type Definitions
 *
 * Deterministic analysis layer over persisted scan result sets.
 * Answers: is the latest result better or worse? Which findings are
 * new / resolved / worsened / improved? Which properties are trending?
 * How has DALC changed? Are remediation efforts reducing risk?
 */

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

export type Severity = 'critical' | 'major' | 'minor' | 'info';

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4,
  major: 3,
  minor: 2,
  info: 1,
};

export function severityRank(s: string): number {
  return SEVERITY_RANK[s as Severity] ?? 0;
}

export function compareSeverity(a: string, b: string): number {
  return severityRank(a) - severityRank(b);
}

// ---------------------------------------------------------------------------
// Core: TrendPoint
// ---------------------------------------------------------------------------

/** A single observation on a time series (one scan). */
export interface TrendPoint {
  resultSetId: string;
  runLabel: string;
  timestamp: string;           // ISO — completed_at or started_at
  value: number;
}

// ---------------------------------------------------------------------------
// Trend direction
// ---------------------------------------------------------------------------

export type TrendDirection = 'improving' | 'worsening' | 'stable' | 'insufficient_data';

// ---------------------------------------------------------------------------
// DALC Trend Series
// ---------------------------------------------------------------------------

export interface DalcTrendPoint extends TrendPoint {
  lowUsd: number;
  baseUsd: number;
  highUsd: number;
}

export interface DalcTrendSeries {
  points: DalcTrendPoint[];
  direction: TrendDirection;
  latestBaseUsd: number;
  earliestBaseUsd: number;
  /** Percentage change from earliest to latest base. Null if earliest is 0. */
  percentChange: number | null;
}

// ---------------------------------------------------------------------------
// Property Trend Record
// ---------------------------------------------------------------------------

export interface PropertyTrendRecord {
  property: number;
  propertyName: string;
  /** Per-scan finding counts for this property. */
  series: TrendPoint[];
  direction: TrendDirection;
  latestFindingCount: number;
  previousFindingCount: number | null;
  /** Per-severity counts at latest point. */
  latestBySeverity: Record<Severity, number>;
}

// ---------------------------------------------------------------------------
// Finding Delta Record
// ---------------------------------------------------------------------------

export type FindingDeltaStatus =
  | 'new'          // present in target, absent in baseline
  | 'resolved'     // absent in target, present in baseline
  | 'worsened'     // same check+asset, severity increased
  | 'improved'     // same check+asset, severity decreased
  | 'unchanged';   // same check+asset+severity

export interface FindingDeltaRecord {
  status: FindingDeltaStatus;
  checkId: string;
  assetKey: string | null;
  title: string;
  property: number;
  /** Current severity (or previous severity if resolved). */
  currentSeverity: string;
  /** Previous severity. Null for new findings. */
  previousSeverity: string | null;
  /** Current raw score (or previous raw score if resolved). */
  currentRawScore: number;
  /** Previous raw score. Null for new findings. */
  previousRawScore: number | null;
}

// ---------------------------------------------------------------------------
// Regression Summary
// ---------------------------------------------------------------------------

export interface RegressionSummary {
  /** The two result sets being compared. */
  targetResultSetId: string;
  baselineResultSetId: string;
  targetLabel: string;
  baselineLabel: string;
  targetTimestamp: string;
  baselineTimestamp: string;

  /** Finding delta counts. */
  counts: {
    new: number;
    resolved: number;
    worsened: number;
    improved: number;
    unchanged: number;
    total: number;
  };

  /** All deltas — consumers filter by status as needed. */
  deltas: FindingDeltaRecord[];

  /** Top regressions: new + worsened, sorted by severity descending. */
  topRegressions: FindingDeltaRecord[];

  /** Top improvements: resolved + improved, sorted by severity descending. */
  topImprovements: FindingDeltaRecord[];

  /** DALC change. */
  dalcDelta: {
    baselineLowUsd: number;
    baselineBaseUsd: number;
    baselineHighUsd: number;
    targetLowUsd: number;
    targetBaseUsd: number;
    targetHighUsd: number;
    changeLowUsd: number;
    changeBaseUsd: number;
    changeHighUsd: number;
    percentChange: number | null;
  };

  /** Overall direction assessment. */
  overallDirection: TrendDirection;
}

// ---------------------------------------------------------------------------
// Historical Comparison Window
// ---------------------------------------------------------------------------

export interface HistoricalComparisonWindow {
  projectId: string;
  /** The window of result sets used (newest first). */
  windowSize: number;
  resultSets: Array<{
    resultSetId: string;
    runLabel: string;
    timestamp: string;
    totalFindings: number;
    criticalCount: number;
    majorCount: number;
    dalcBaseUsd: number;
    dalcLowUsd: number;
    dalcHighUsd: number;
  }>;

  /** DALC trend across the window. */
  dalcTrend: DalcTrendSeries;

  /** Per-property trend across the window. */
  propertyTrends: PropertyTrendRecord[];

  /** Regression summary: latest vs first in window (oldest baseline). */
  regressionVsBaseline: RegressionSummary | null;

  /** Regression summary: latest vs immediately previous. */
  regressionVsPrevious: RegressionSummary | null;
}
