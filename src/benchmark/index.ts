/**
 * Benchmark / Comparative Context Layer — Barrel Export
 */

// Types
export type {
  BenchmarkPosition,
  PropertyBenchmarkPosition,
  BenchmarkMetric,
  BenchmarkPack,
  BenchmarkComparisonRecord,
  PropertyBenchmarkComparison,
  ProjectBaselineComparison,
  BenchmarkSummary,
} from './types';

export {
  BENCHMARK_POSITION_COLORS,
  BENCHMARK_POSITION_LABELS,
  PROPERTY_POSITION_LABELS,
  PROPERTY_POSITION_COLORS,
} from './types';

// Packs
export {
  getAvailablePacks,
  getPackById,
  getPackForSector,
  getDefaultPack,
} from './packs';

// Service
export {
  classifyPosition,
  classifyPropertyPosition,
  compareMetric,
  comparePropertyFindings,
  buildBaselineComparison,
  compareToBenchmark,
  buildBenchmarkSummary,
} from './benchmark-service';
