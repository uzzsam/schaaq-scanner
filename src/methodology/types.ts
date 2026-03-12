/**
 * Result-Set Level Methodology Summary — Type Definitions
 *
 * Each completed scan produces exactly one MethodologySummary describing:
 *  - what assumptions the system made (AssumptionRecord[])
 *  - what the scan could NOT assess (CoverageGapRecord[])
 *  - how confident the system is across 4 areas (ConfidenceAssessmentRecord[])
 *  - what the scan actually covered (ScanCoverageSummary)
 */

// ---------------------------------------------------------------------------
// Enums / Unions
// ---------------------------------------------------------------------------

export type AssumptionSourceType =
  | 'empirical'
  | 'expert_estimated'
  | 'client_configured'
  | 'inferred'
  | 'system_default';

export type MaterialityLevel = 'high' | 'medium' | 'low';

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'very_low';

export type ConfidenceArea = 'detection' | 'coverage' | 'economic' | 'criticality';

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export interface AssumptionRecord {
  /** Stable identifier, e.g. 'DALC_CANONICAL_INVESTMENT' */
  id: string;
  /** Grouping category, e.g. 'economic_model', 'detection_thresholds' */
  category: string;
  /** Human-readable description of the assumption */
  assumption: string;
  /** How the assumption value was determined */
  sourceType: AssumptionSourceType;
  /** How much this assumption affects the final outputs */
  materialityLevel: MaterialityLevel;
  /** Stringified current value, e.g. '1800000' or '0.7' */
  currentValue: string;
  /** Which outputs are affected, e.g. ['dalcTotalUsd', 'dalcHighUsd'] */
  affectedOutputs: string[];
}

export interface CoverageGapRecord {
  /** Stable identifier, e.g. 'NO_BI_ASSETS' */
  id: string;
  /** Grouping category, e.g. 'asset_coverage', 'data_flow' */
  category: string;
  /** What the gap is */
  description: string;
  /** What the gap means for the result */
  impact: string;
  /** What the user can do to close the gap */
  mitigationHint: string;
}

export interface ConfidenceAssessmentRecord {
  /** Which assessment area */
  area: ConfidenceArea;
  /** Derived confidence level */
  confidenceLevel: ConfidenceLevel;
  /** Plain-language rationale */
  rationale: string;
  /** Key factors that drove this assessment */
  keyDrivers: string[];
}

// ---------------------------------------------------------------------------
// Scan Coverage
// ---------------------------------------------------------------------------

export interface ScanCoverageSummary {
  totalTables: number;
  totalColumns: number;
  schemaCount: number;
  checksRun: number;
  checksAvailable: number;
  propertiesCovered: number[];
  hasPipelineMapping: boolean;
  hasExternalLineage: boolean;
  adapterType: string;
}

// ---------------------------------------------------------------------------
// Top-level Summary
// ---------------------------------------------------------------------------

export interface MethodologySummary {
  /** Schema version for forward compatibility */
  version: string;
  /** ISO timestamp when this summary was generated */
  generatedAt: string;
  /** Classified assumptions underlying the scan results */
  assumptions: AssumptionRecord[];
  /** What the scan could NOT assess */
  coverageGaps: CoverageGapRecord[];
  /** Confidence across 4 assessment areas */
  confidenceAssessments: ConfidenceAssessmentRecord[];
  /** What the scan actually covered */
  scanCoverage: ScanCoverageSummary;
  /** Overall confidence = min of all 4 areas */
  overallConfidence: ConfidenceLevel;
  /** Plain-language rationale for overall confidence */
  overallConfidenceRationale: string;
}

// ---------------------------------------------------------------------------
// Builder Input (aggregated from scan context)
// ---------------------------------------------------------------------------

export interface MethodologyBuilderInput {
  /** How many checks were executed */
  checksRun: number;
  /** How many checks are available in ALL_CHECKS */
  checksAvailable: number;
  /** Which properties (1-8) had at least one check run */
  propertiesCovered: number[];
  /** Total tables in extracted schema */
  totalTables: number;
  /** Total columns in extracted schema */
  totalColumns: number;
  /** Number of distinct schemas */
  schemaCount: number;
  /** Adapter type used for this scan */
  adapterType: string;
  /** Whether pipeline mapping was provided */
  hasPipelineMapping: boolean;
  /** Whether external lineage artifacts exist */
  hasExternalLineage: boolean;
  /** Whether this was a dry-run (mock data) */
  isDryRun: boolean;
  /** Total findings produced */
  totalFindings: number;
  /** Severity breakdown */
  severityCounts: { critical: number; major: number; minor: number; info: number };
  /** How many high-severity findings have structured evidence */
  highSeverityWithEvidence: number;
  /** Total high-severity findings (critical + major) */
  totalHighSeverity: number;
  /** Derived modelling approach from engine */
  derivedApproach: string;
  /** Scanner config thresholds (to detect client overrides) */
  configuredThresholds: {
    entitySimilarityThreshold?: number;
    nullRateThreshold?: number;
    canonicalInvestmentAUD?: number;
  };
  /** Criticality assessment context */
  criticalityContext: {
    wasRun: boolean;
    totalAssetsAssessed: number;
    signalTypesUsed: number;
    cdeIdentificationMethod: string;
    tierDistribution: Record<string, number>;
  };
}
