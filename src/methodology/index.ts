/**
 * Methodology Module — Barrel Export
 */

export { buildMethodologySummary } from './builder';
export { classifyAssumptions } from './assumptions';
export { deriveCoverageGaps } from './coverage-gaps';
export { assessConfidence } from './confidence';

export type {
  MethodologySummary,
  MethodologyBuilderInput,
  AssumptionRecord,
  CoverageGapRecord,
  ConfidenceAssessmentRecord,
  ScanCoverageSummary,
  AssumptionSourceType,
  MaterialityLevel,
  ConfidenceLevel,
  ConfidenceArea,
} from './types';
