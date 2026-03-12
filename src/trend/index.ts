/**
 * Trend & Regression Detection — Public API
 */

export type {
  TrendPoint,
  TrendDirection,
  Severity,
  DalcTrendPoint,
  DalcTrendSeries,
  PropertyTrendRecord,
  FindingDeltaRecord,
  FindingDeltaStatus,
  RegressionSummary,
  HistoricalComparisonWindow,
} from './types';

export {
  severityRank,
  compareSeverity,
} from './types';

export {
  computeFindingDeltas,
  buildRegressionSummary,
  buildDalcTrendSeries,
  buildPropertyTrends,
  buildHistoricalComparisonWindow,
  buildRegressionBetween,
} from './trend-service';
