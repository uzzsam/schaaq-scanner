/**
 * Assumption Classifier — Surface Implicit System Assumptions
 *
 * Deterministic function that inspects the scan context and produces
 * a classified list of every material assumption embedded in the
 * scanner, DALC engine, criticality engine, and remediation logic.
 *
 * All values are read from existing constants/config — no new configuration.
 */

import type {
  AssumptionRecord,
  AssumptionSourceType,
  MaterialityLevel,
  MethodologyBuilderInput,
} from './types';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function a(
  id: string,
  category: string,
  assumption: string,
  sourceType: AssumptionSourceType,
  materialityLevel: MaterialityLevel,
  currentValue: string,
  affectedOutputs: string[],
): AssumptionRecord {
  return { id, category, assumption, sourceType, materialityLevel, currentValue, affectedOutputs };
}

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

/**
 * Classify all implicit assumptions that underlie the scan results.
 * Returns a stable, deterministic list — order is guaranteed.
 */
export function classifyAssumptions(input: MethodologyBuilderInput): AssumptionRecord[] {
  const assumptions: AssumptionRecord[] = [];

  // =========================================================================
  // DALC Engine — Economic Model
  // =========================================================================

  assumptions.push(a(
    'DALC_CANONICAL_INVESTMENT',
    'economic_model',
    'Canonical annual data investment is AUD $1,800,000 (≈ USD $1.17M). This anchors the absolute cost estimates.',
    input.configuredThresholds.canonicalInvestmentAUD != null
      ? 'client_configured'
      : 'expert_estimated',
    'high',
    String(input.configuredThresholds.canonicalInvestmentAUD ?? 1_800_000),
    ['dalcTotalUsd', 'dalcBaseUsd', 'dalcLowUsd', 'dalcHighUsd'],
  ));

  assumptions.push(a(
    'DALC_SEVERITY_MULTIPLIERS',
    'economic_model',
    'Severity levels map to multipliers: none=0.0, some=0.5, pervasive=1.0. These convert finding severity to proportional cost impact.',
    'expert_estimated',
    'high',
    'none:0.0, some:0.5, pervasive:1.0',
    ['dalcTotalUsd', 'dalcBaseUsd'],
  ));

  assumptions.push(a(
    'DALC_LEONTIEF_NEUMANN_TERMS',
    'economic_model',
    'The Leontief inverse is approximated using a 12-term Neumann series (I + W + W² + … + W¹¹). Higher terms capture indirect/cascading costs.',
    'empirical',
    'medium',
    '12',
    ['amplificationRatio', 'dalcHighUsd'],
  ));

  assumptions.push(a(
    'DALC_SANITY_SINGLE_CATEGORY',
    'economic_model',
    'No single cost category may exceed 5% of canonical investment. Prevents any one dimension from dominating.',
    'expert_estimated',
    'medium',
    '0.05',
    ['dalcBaseUsd', 'dalcTotalUsd'],
  ));

  assumptions.push(a(
    'DALC_SANITY_TOTAL',
    'economic_model',
    'Total DALC may not exceed 10% of canonical investment. Acts as a reasonableness upper bound.',
    'expert_estimated',
    'high',
    '0.10',
    ['dalcTotalUsd', 'dalcBaseUsd'],
  ));

  assumptions.push(a(
    'DALC_FINDINGS_ADJUSTMENT_CAP',
    'economic_model',
    'Finding-driven cost adjustments are capped at 60% of the category base. Prevents extreme outlier schemas from producing unbounded costs.',
    'expert_estimated',
    'medium',
    '0.60',
    ['dalcTotalUsd', 'dalcBaseUsd', 'dalcLowUsd'],
  ));

  // =========================================================================
  // W Matrix — Inter-Dependency Model
  // =========================================================================

  assumptions.push(a(
    'W_MATRIX_SOURCING',
    'economic_model',
    'The 6×6 inter-dependency (W) matrix is 87% expert-estimated and 13% empirically sourced. Cascading cost amplification depends on these coefficients.',
    'expert_estimated',
    'high',
    '87% estimated, 13% sourced',
    ['amplificationRatio', 'dalcHighUsd'],
  ));

  assumptions.push(a(
    'W_MATRIX_SECTOR_DEFAULT',
    'economic_model',
    `Sector-specific W matrix coefficients are used. Derived approach: "${input.derivedApproach}".`,
    'inferred',
    'medium',
    input.derivedApproach,
    ['amplificationRatio', 'dalcHighUsd'],
  ));

  // =========================================================================
  // Detection Thresholds
  // =========================================================================

  assumptions.push(a(
    'THRESHOLD_ENTITY_SIMILARITY',
    'detection_thresholds',
    'Entity name similarity threshold for semantic identity checks. Names scoring above this are flagged as potential duplicates.',
    input.configuredThresholds.entitySimilarityThreshold != null
      ? 'client_configured'
      : 'system_default',
    'medium',
    String(input.configuredThresholds.entitySimilarityThreshold ?? 0.7),
    ['findingCount_P1'],
  ));

  assumptions.push(a(
    'THRESHOLD_NULL_RATE',
    'detection_thresholds',
    'Null-rate threshold for quality measurement checks. Columns exceeding this ratio are flagged.',
    input.configuredThresholds.nullRateThreshold != null
      ? 'client_configured'
      : 'system_default',
    'medium',
    String(input.configuredThresholds.nullRateThreshold ?? 0.3),
    ['findingCount_P6'],
  ));

  assumptions.push(a(
    'THRESHOLD_NAMING_CONVENTION',
    'detection_thresholds',
    'Naming convention violations are detected using regex patterns for snake_case, camelCase, and PascalCase. Non-conforming names are flagged.',
    'system_default',
    'low',
    'snake_case|camelCase|PascalCase regex',
    ['findingCount_P5'],
  ));

  // =========================================================================
  // Criticality Engine
  // =========================================================================

  if (input.criticalityContext.wasRun) {
    assumptions.push(a(
      'CRITICALITY_TIER_THRESHOLDS',
      'criticality',
      'Criticality tiers are assigned by score bands: low 0–24, medium 25–49, high 50–74, critical 75–100.',
      'expert_estimated',
      'medium',
      'low:0-24, medium:25-49, high:50-74, critical:75-100',
      ['criticalityTierDistribution', 'remediationPriority'],
    ));

    assumptions.push(a(
      'CRITICALITY_SIGNAL_TYPES',
      'criticality',
      `Criticality scoring uses ${input.criticalityContext.signalTypesUsed} of 15 available signal types. Unused signals reduce scoring precision.`,
      'expert_estimated',
      'medium',
      `${input.criticalityContext.signalTypesUsed}/15 signal types`,
      ['criticalityTierDistribution'],
    ));

    assumptions.push(a(
      'CRITICALITY_CDE_IDENTIFICATION',
      'criticality',
      `Critical Data Elements (CDEs) are identified via "${input.criticalityContext.cdeIdentificationMethod}". CDE status amplifies criticality scoring.`,
      input.criticalityContext.cdeIdentificationMethod === 'naming-heuristic'
        ? 'inferred'
        : 'client_configured',
      'medium',
      input.criticalityContext.cdeIdentificationMethod,
      ['criticalityTierDistribution', 'cdeCandidates'],
    ));
  }

  // =========================================================================
  // Remediation Model
  // =========================================================================

  assumptions.push(a(
    'REMEDIATION_PRIORITY_WEIGHTS',
    'remediation',
    'Remediation priority score uses weighted formula: severity 40%, criticality 25%, cost-impact 20%, blast-radius 10%, quick-win 5%.',
    'expert_estimated',
    'medium',
    '40/25/20/10/5',
    ['remediationPriority', 'remediationSequence'],
  ));

  assumptions.push(a(
    'REMEDIATION_EFFORT_BANDS',
    'remediation',
    'Effort estimates use three bands: Small (<2 weeks), Medium (2–6 weeks), Large (6+ weeks). Actual effort varies by team and tooling.',
    'expert_estimated',
    'low',
    'S:<2wk, M:2-6wk, L:6+wk',
    ['remediationEffort'],
  ));

  // =========================================================================
  // Missing-Source Fallbacks
  // =========================================================================

  if (input.isDryRun) {
    assumptions.push(a(
      'DRY_RUN_MOCK_DATA',
      'data_source',
      'Scan used synthetic mock schema data. All findings and costs are illustrative only and do not reflect real database conditions.',
      'system_default',
      'high',
      'mock_schema',
      ['dalcTotalUsd', 'dalcBaseUsd', 'dalcLowUsd', 'dalcHighUsd', 'findingCount_all'],
    ));
  }

  if (!input.hasPipelineMapping) {
    assumptions.push(a(
      'NO_PIPELINE_MAPPING',
      'data_source',
      'No pipeline mapping was provided. Data flow integrity and mapping drift checks could not be assessed.',
      'system_default',
      'medium',
      'absent',
      ['findingCount_P4', 'coverageGaps'],
    ));
  }

  return assumptions;
}
