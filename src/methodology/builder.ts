/**
 * Methodology Summary Builder
 *
 * Assembles a complete MethodologySummary from scan context.
 * Calls assumptions → coverage gaps → confidence → assembles.
 */

import type { MethodologySummary, MethodologyBuilderInput, ScanCoverageSummary } from './types';
import { classifyAssumptions } from './assumptions';
import { deriveCoverageGaps } from './coverage-gaps';
import { assessConfidence } from './confidence';

const METHODOLOGY_VERSION = '1.0.0';

/**
 * Build a complete, deterministic MethodologySummary for a scan result set.
 *
 * All inputs should be available at scan completion time in scan-runner.ts.
 */
export function buildMethodologySummary(input: MethodologyBuilderInput): MethodologySummary {
  const assumptions = classifyAssumptions(input);
  const coverageGaps = deriveCoverageGaps(input);
  const { assessments, overallConfidence, overallConfidenceRationale } = assessConfidence(input);

  const scanCoverage: ScanCoverageSummary = {
    totalTables: input.totalTables,
    totalColumns: input.totalColumns,
    schemaCount: input.schemaCount,
    checksRun: input.checksRun,
    checksAvailable: input.checksAvailable,
    propertiesCovered: input.propertiesCovered,
    hasPipelineMapping: input.hasPipelineMapping,
    hasExternalLineage: input.hasExternalLineage,
    adapterType: input.adapterType,
  };

  return {
    version: METHODOLOGY_VERSION,
    generatedAt: new Date().toISOString(),
    assumptions,
    coverageGaps,
    confidenceAssessments: assessments,
    scanCoverage,
    overallConfidence,
    overallConfidenceRationale,
  };
}
