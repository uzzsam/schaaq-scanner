/**
 * Benchmark / Comparative Context Layer — Type Definitions
 *
 * Local-only benchmark packs that provide "expected range" context
 * for DALC costs, finding counts, severity density, and property scores.
 *
 * No cloud, no telemetry — all data is bundled locally.
 */

import type { TrendDirection } from '../trend/types';

// =============================================================================
// Position Classification
// =============================================================================

/** Overall position relative to a benchmark range. */
export type BenchmarkPosition =
  | 'below_range'   // better than the expected range (fewer findings / lower cost)
  | 'within_range'  // inside the expected range
  | 'above_range'   // worse than the expected range (more findings / higher cost)
  | 'unknown';      // insufficient data to classify

/** Property-level position relative to benchmark. */
export type PropertyBenchmarkPosition =
  | 'better_than_range'
  | 'near_range'
  | 'worse_than_range'
  | 'unknown';

// =============================================================================
// Benchmark Metric (single metric within a pack)
// =============================================================================

/**
 * A single benchmark metric defining an expected range.
 * All ranges are inclusive: [low, high].
 */
export interface BenchmarkMetric {
  /** Unique metric key. */
  key: string;
  /** Human-readable label. */
  label: string;
  /** Low end of the expected range. */
  low: number;
  /** High end of the expected range. */
  high: number;
  /** Unit for display. */
  unit: string;
  /** Lower is better (e.g. finding count, DALC cost). */
  lowerIsBetter: boolean;
}

// =============================================================================
// Benchmark Pack
// =============================================================================

/**
 * A self-contained benchmark reference pack.
 * Provides expected ranges for key data architecture health metrics.
 */
export interface BenchmarkPack {
  /** Unique pack identifier. */
  id: string;
  /** Human-readable name (e.g. "Cross-Sector Default"). */
  name: string;
  /** Description of what this pack represents. */
  description: string;
  /** Sector code: 'default' | 'financial-services' | 'healthcare' | 'retail' | etc. */
  sector: string;
  /** Pack version for traceability. */
  version: string;
  /** ISO date the pack data was last calibrated. */
  calibratedAt: string;

  // --- Metric ranges ---

  /** DALC base cost expected range (USD). */
  dalcBaseUsd: BenchmarkMetric;
  /** Total finding count expected range. */
  totalFindings: BenchmarkMetric;
  /** Critical + major finding count expected range. */
  highSeverityFindings: BenchmarkMetric;
  /** High-severity density: (critical+major) / total_findings ratio. */
  highSeverityDensity: BenchmarkMetric;

  /** Per-property finding count expected ranges. Keyed by property number (1-8). */
  propertyFindings: Record<number, BenchmarkMetric>;

  /** Methodology note — how the ranges were derived. */
  methodNote: string;
}

// =============================================================================
// Benchmark Comparison Record (single metric result)
// =============================================================================

export interface BenchmarkComparisonRecord {
  /** The metric compared. */
  metric: BenchmarkMetric;
  /** Actual observed value from the scan. */
  actualValue: number;
  /** Position classification. */
  position: BenchmarkPosition;
  /** Human-readable summary (e.g. "Your DALC is 20% below the expected range"). */
  message: string;
  /** Percentage distance from nearest range bound. Null if within range or unknown. */
  percentFromRange: number | null;
}

// =============================================================================
// Property Benchmark Comparison
// =============================================================================

export interface PropertyBenchmarkComparison {
  property: number;
  propertyName: string;
  actualFindingCount: number;
  benchmarkLow: number;
  benchmarkHigh: number;
  position: PropertyBenchmarkPosition;
  message: string;
}

// =============================================================================
// Project Baseline Comparison
// =============================================================================

export interface ProjectBaselineComparison {
  /** Was a baseline (first completed scan) available? */
  baselineAvailable: boolean;
  /** Baseline result set ID. */
  baselineResultSetId: string | null;
  /** Baseline run label. */
  baselineLabel: string | null;
  /** Baseline timestamp. */
  baselineTimestamp: string | null;
  /** DALC direction: latest vs baseline. */
  dalcDirection: TrendDirection;
  dalcDirectionLabel: string;
  /** DALC % change. */
  dalcPercentChange: number | null;
  /** Finding count direction. */
  findingCountDirection: TrendDirection;
  findingCountDirectionLabel: string;
  /** Finding count delta. */
  findingCountDelta: number | null;
  /** High-severity count direction. */
  highSeverityDirection: TrendDirection;
  highSeverityDirectionLabel: string;
  highSeverityDelta: number | null;
}

// =============================================================================
// Benchmark Summary (aggregate for UI / reports)
// =============================================================================

export interface BenchmarkSummary {
  /** Pack used for comparison. */
  packId: string;
  packName: string;
  packSector: string;
  packVersion: string;

  /** Overall position (derived from the most impactful metric). */
  overallPosition: BenchmarkPosition;
  /** Human-readable overall message (1-2 sentences for board pack). */
  overallMessage: string;

  /** Key metric comparisons. */
  dalcComparison: BenchmarkComparisonRecord;
  totalFindingsComparison: BenchmarkComparisonRecord;
  highSeverityComparison: BenchmarkComparisonRecord;
  highSeverityDensityComparison: BenchmarkComparisonRecord;

  /** Property-level comparisons. */
  propertyComparisons: PropertyBenchmarkComparison[];

  /** Project baseline comparison (null if first scan). */
  baselineComparison: ProjectBaselineComparison | null;

  /** Key messages for executive summary (max 3). */
  keyMessages: string[];
}

// =============================================================================
// Position colors and labels (for UI / reports)
// =============================================================================

export const BENCHMARK_POSITION_COLORS: Record<BenchmarkPosition, string> = {
  below_range: '#27AE60',  // green — better than expected
  within_range: '#3498DB', // blue — on track
  above_range: '#E74C3C',  // red — worse than expected
  unknown: '#95A5A6',      // gray
};

export const BENCHMARK_POSITION_LABELS: Record<BenchmarkPosition, string> = {
  below_range: 'Better Than Expected',
  within_range: 'Within Expected Range',
  above_range: 'Worse Than Expected',
  unknown: 'Insufficient Data',
};

export const PROPERTY_POSITION_LABELS: Record<PropertyBenchmarkPosition, string> = {
  better_than_range: 'Better',
  near_range: 'Near Expected',
  worse_than_range: 'Worse',
  unknown: 'Unknown',
};

export const PROPERTY_POSITION_COLORS: Record<PropertyBenchmarkPosition, string> = {
  better_than_range: '#27AE60',
  near_range: '#3498DB',
  worse_than_range: '#E74C3C',
  unknown: '#95A5A6',
};
