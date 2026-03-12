/**
 * Confidence Assessment — Derived Confidence Across 4 Areas
 *
 * Each area produces a ConfidenceLevel + rationale + keyDrivers.
 * Overall confidence = min(all areas).
 */

import type {
  ConfidenceAssessmentRecord,
  ConfidenceLevel,
  ConfidenceArea,
  MethodologyBuilderInput,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function record(
  area: ConfidenceArea,
  confidenceLevel: ConfidenceLevel,
  rationale: string,
  keyDrivers: string[],
): ConfidenceAssessmentRecord {
  return { area, confidenceLevel, rationale, keyDrivers };
}

const LEVEL_ORDER: Record<ConfidenceLevel, number> = {
  very_low: 0,
  low: 1,
  medium: 2,
  high: 3,
};

function minLevel(levels: ConfidenceLevel[]): ConfidenceLevel {
  let min: ConfidenceLevel = 'high';
  for (const l of levels) {
    if (LEVEL_ORDER[l] < LEVEL_ORDER[min]) min = l;
  }
  return min;
}

// ---------------------------------------------------------------------------
// Area Assessors
// ---------------------------------------------------------------------------

function assessDetection(input: MethodologyBuilderInput): ConfidenceAssessmentRecord {
  const drivers: string[] = [];
  let level: ConfidenceLevel = 'high';

  // Check coverage ratio
  const checkRatio = input.checksAvailable > 0
    ? input.checksRun / input.checksAvailable
    : 0;

  if (checkRatio >= 0.9) {
    drivers.push(`${input.checksRun}/${input.checksAvailable} checks executed (${Math.round(checkRatio * 100)}%)`);
  } else if (checkRatio >= 0.7) {
    level = 'medium';
    drivers.push(`Only ${input.checksRun}/${input.checksAvailable} checks executed (${Math.round(checkRatio * 100)}%)`);
  } else {
    level = 'low';
    drivers.push(`Only ${input.checksRun}/${input.checksAvailable} checks executed (${Math.round(checkRatio * 100)}%)`);
  }

  // Evidence coverage on high-severity findings
  if (input.totalHighSeverity > 0) {
    const evidenceRatio = input.highSeverityWithEvidence / input.totalHighSeverity;
    if (evidenceRatio >= 0.8) {
      drivers.push(`${Math.round(evidenceRatio * 100)}% of high-severity findings have structured evidence`);
    } else {
      level = minLevel([level, 'medium']);
      drivers.push(`Only ${Math.round(evidenceRatio * 100)}% of high-severity findings have structured evidence`);
    }
  }

  // Schema size effect
  if (input.totalTables < 10) {
    level = minLevel([level, 'low']);
    drivers.push(`Small schema (${input.totalTables} tables) limits statistical reliability`);
  } else if (input.totalTables >= 50) {
    drivers.push(`Substantial schema (${input.totalTables} tables) supports robust detection`);
  }

  // Dry run override
  if (input.isDryRun) {
    level = 'very_low';
    drivers.push('Dry-run mode — mock data, findings are illustrative only');
  }

  const rationale = level === 'high'
    ? 'High check coverage with strong evidence support across findings.'
    : level === 'medium'
      ? 'Adequate check coverage but some gaps in evidence or check execution.'
      : level === 'low'
        ? 'Limited check coverage or evidence gaps reduce detection reliability.'
        : 'Detection confidence is minimal — results are illustrative only.';

  return record('detection', level, rationale, drivers);
}

function assessCoverage(input: MethodologyBuilderInput): ConfidenceAssessmentRecord {
  const drivers: string[] = [];
  let level: ConfidenceLevel = 'high';

  // Property coverage
  const propertyCoverage = input.propertiesCovered.length;
  if (propertyCoverage >= 7) {
    drivers.push(`${propertyCoverage}/8 data quality properties assessed`);
  } else if (propertyCoverage >= 5) {
    level = 'medium';
    drivers.push(`Only ${propertyCoverage}/8 data quality properties assessed`);
  } else {
    level = 'low';
    drivers.push(`Only ${propertyCoverage}/8 data quality properties assessed`);
  }

  // Pipeline mapping
  if (input.hasPipelineMapping) {
    drivers.push('Pipeline mapping provided — data flow checks included');
  } else {
    level = minLevel([level, 'medium']);
    drivers.push('No pipeline mapping — data flow integrity not assessed');
  }

  // External lineage
  if (input.hasExternalLineage) {
    drivers.push('External lineage artifacts available');
  }

  // Adapter type
  drivers.push(`Adapter: ${input.adapterType}`);

  // Dry run override
  if (input.isDryRun) {
    level = 'very_low';
    drivers.push('Dry-run mode — mock data only');
  }

  const rationale = level === 'high'
    ? 'Broad property coverage with pipeline mapping support.'
    : level === 'medium'
      ? 'Most properties covered but some data flow dimensions missing.'
      : level === 'low'
        ? 'Significant property gaps limit the scope of assessment.'
        : 'Coverage is minimal — results are illustrative only.';

  return record('coverage', level, rationale, drivers);
}

function assessEconomic(input: MethodologyBuilderInput): ConfidenceAssessmentRecord {
  const drivers: string[] = [];
  let level: ConfidenceLevel = 'medium'; // Base is medium — W matrix is 87% estimated

  // W matrix sourcing is a permanent medium-confidence driver
  drivers.push('W matrix inter-dependency coefficients are 87% expert-estimated');

  // Approach completeness
  if (input.derivedApproach && input.derivedApproach !== 'unknown') {
    drivers.push(`Modelling approach: ${input.derivedApproach}`);
  } else {
    level = minLevel([level, 'low']);
    drivers.push('Modelling approach could not be determined');
  }

  // Client-configured thresholds raise confidence slightly
  const clientOverrides: string[] = [];
  if (input.configuredThresholds.canonicalInvestmentAUD != null) {
    clientOverrides.push('canonical investment');
  }
  if (input.configuredThresholds.entitySimilarityThreshold != null) {
    clientOverrides.push('entity similarity');
  }
  if (input.configuredThresholds.nullRateThreshold != null) {
    clientOverrides.push('null rate');
  }
  if (clientOverrides.length > 0) {
    drivers.push(`Client-configured thresholds: ${clientOverrides.join(', ')}`);
  }

  // Dry run
  if (input.isDryRun) {
    level = 'very_low';
    drivers.push('Dry-run mode — economic estimates are illustrative only');
  }

  const rationale = level === 'high'
    ? 'Economic model is well-calibrated with client-configured inputs.'
    : level === 'medium'
      ? 'Economic model relies on expert-estimated inter-dependency coefficients. Results are directionally sound but approximate.'
      : level === 'low'
        ? 'Economic model has significant estimation gaps.'
        : 'Economic estimates are illustrative only.';

  return record('economic', level, rationale, drivers);
}

function assessCriticalityConfidence(input: MethodologyBuilderInput): ConfidenceAssessmentRecord {
  const drivers: string[] = [];
  let level: ConfidenceLevel;

  if (!input.criticalityContext.wasRun) {
    return record(
      'criticality',
      'very_low',
      'Criticality assessment was not performed. Remediation prioritisation lacks business context.',
      ['Criticality engine was not run'],
    );
  }

  // Signal diversity
  const signalRatio = input.criticalityContext.signalTypesUsed / 15;
  if (signalRatio >= 0.6) {
    level = 'high';
    drivers.push(`${input.criticalityContext.signalTypesUsed}/15 signal types contributed to scoring`);
  } else if (signalRatio >= 0.3) {
    level = 'medium';
    drivers.push(`Only ${input.criticalityContext.signalTypesUsed}/15 signal types contributed`);
  } else {
    level = 'low';
    drivers.push(`Only ${input.criticalityContext.signalTypesUsed}/15 signal types contributed`);
  }

  // CDE identification method
  if (input.criticalityContext.cdeIdentificationMethod === 'naming-heuristic') {
    level = minLevel([level, 'medium']);
    drivers.push('CDE identification relies on naming heuristics');
  } else if (input.criticalityContext.cdeIdentificationMethod === 'client-registry') {
    drivers.push('CDE identification uses client-provided registry');
  } else {
    drivers.push(`CDE method: ${input.criticalityContext.cdeIdentificationMethod}`);
  }

  // Tier distribution balance
  const tierCount = Object.keys(input.criticalityContext.tierDistribution).length;
  if (tierCount >= 3) {
    drivers.push(`Tier distribution spans ${tierCount} tiers`);
  } else if (tierCount <= 1) {
    level = minLevel([level, 'low']);
    drivers.push('All assets clustered in a single criticality tier');
  }

  // Assets assessed
  drivers.push(`${input.criticalityContext.totalAssetsAssessed} assets assessed`);

  const rationale = level === 'high'
    ? 'Criticality assessment uses diverse signals with good tier distribution.'
    : level === 'medium'
      ? 'Criticality assessment has adequate signal diversity but relies on some heuristics.'
      : level === 'low'
        ? 'Criticality assessment has limited signal diversity or poor tier distribution.'
        : 'Criticality confidence is minimal.';

  return record('criticality', level, rationale, drivers);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ConfidenceResult {
  assessments: ConfidenceAssessmentRecord[];
  overallConfidence: ConfidenceLevel;
  overallConfidenceRationale: string;
}

/**
 * Assess confidence across all 4 areas and derive overall confidence.
 */
export function assessConfidence(input: MethodologyBuilderInput): ConfidenceResult {
  const assessments = [
    assessDetection(input),
    assessCoverage(input),
    assessEconomic(input),
    assessCriticalityConfidence(input),
  ];

  const overallConfidence = minLevel(assessments.map(a => a.confidenceLevel));

  const lowestAreas = assessments
    .filter(a => a.confidenceLevel === overallConfidence)
    .map(a => a.area);

  const overallConfidenceRationale = overallConfidence === 'high'
    ? 'All four assessment areas report high confidence.'
    : `Overall confidence is constrained by: ${lowestAreas.join(', ')}. ${assessments.find(a => a.confidenceLevel === overallConfidence)?.rationale ?? ''}`;

  return { assessments, overallConfidence, overallConfidenceRationale };
}
