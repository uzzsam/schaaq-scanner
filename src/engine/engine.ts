/**
 * DALC v4 Engine — Calculation Pipeline
 * Engine codename: Archimedes
 *
 * Full pipeline: Layer 1 (Shannon Entropy) -> Layer 1b (Base Costs) ->
 * Layer 1c (Findings Adjustment) -> Layer 2 (Leontief Amplification) ->
 * Sanity Bounds -> Canonical Comparison -> 5-Year Projection -> Property Scores
 *
 * ZERO React/Next.js/DOM dependencies.
 */

import {
  APPROACH_CONFIGS,
  CANONICAL_ANNUAL_GROWTH_RATE,
  DEFAULT_CANONICAL_INVESTMENT,
  ENGINE_VERSION,
  FINDINGS_ADJUSTMENT_CAP,
  NEUMANN_TERMS,
  SANITY_SINGLE_CATEGORY_MAX_REVENUE_FRACTION,
  SANITY_TOTAL_MAX_REVENUE_FRACTION,
  SECTOR_CONFIGS,
  SEVERITY_MULTIPLIERS,
  W_MATRICES,
} from './constants';
import { FINDINGS, getFindingsForSector } from './findings';
import { PROPERTIES } from './properties';
import type {
  CostVector,
  DALCInput,
  DALCResult,
  FindingCostResult,
  PropertyScore,
  WMatrix,
  YearProjection,
} from './types';

// ---------------------------------------------------------------------------
// Helper: create zero cost vector
// ---------------------------------------------------------------------------

function zeroCostVector(): CostVector {
  return {
    firefighting: 0,
    dataQuality: 0,
    integration: 0,
    productivity: 0,
    regulatory: 0,
  };
}

// ---------------------------------------------------------------------------
// Helper: cost vector to array and back
// ---------------------------------------------------------------------------

function costVectorToArray(cv: CostVector): number[] {
  return [
    cv.firefighting,
    cv.dataQuality,
    cv.integration,
    cv.productivity,
    cv.regulatory,
  ];
}

function arrayToCostVector(arr: number[]): CostVector {
  return {
    firefighting: arr[0],
    dataQuality: arr[1],
    integration: arr[2],
    productivity: arr[3],
    regulatory: arr[4],
  };
}

function sumCostVector(cv: CostVector): number {
  return (
    cv.firefighting +
    cv.dataQuality +
    cv.integration +
    cv.productivity +
    cv.regulatory
  );
}

// ---------------------------------------------------------------------------
// Layer 1: Shannon Entropy — Data Disorder Index
// ---------------------------------------------------------------------------

interface ShannonResult {
  baseMaturity: number;
  shannonEntropy: number;
  maxEntropy: number;
  disorderScore: number;
  adjustedMaturity: number;
  firefightingRate: number;
}

function computeShannon(input: DALCInput): ShannonResult {
  const approachConfig = APPROACH_CONFIGS[input.modellingApproach];
  const mBase = approachConfig.mBase;
  const coverage =
    input.primaryCoverage ?? approachConfig.defaultCoverage;
  const S = input.sourceSystems;
  const firefightingRate = approachConfig.firefightingRate;

  // Edge case: single system
  if (S <= 1) {
    return {
      baseMaturity: mBase,
      shannonEntropy: 0,
      maxEntropy: 0,
      disorderScore: 0,
      adjustedMaturity: mBase,
      firefightingRate,
    };
  }

  const C = Math.max(0.001, Math.min(0.999, coverage));
  const pRest = (1 - C) / (S - 1);

  // Shannon Entropy
  const H =
    -C * Math.log2(C) - (1 - C) * Math.log2(pRest);
  const HMax = Math.log2(S);

  const D = HMax > 0 ? H / HMax : 0;
  const mAdj = mBase * (1 - D);

  return {
    baseMaturity: mBase,
    shannonEntropy: H,
    maxEntropy: HMax,
    disorderScore: D,
    adjustedMaturity: mAdj,
    firefightingRate,
  };
}

// ---------------------------------------------------------------------------
// Layer 1b: Base Cost Vector
// ---------------------------------------------------------------------------

function computeBaseCosts(
  input: DALCInput,
  M: number,
  firefightingRate: number,
): CostVector {
  const config = SECTOR_CONFIGS[input.sector];

  // F1: Firefighting Overhead
  const canonicalRate = 0.19;
  const f1 =
    input.dataEngineers *
    input.avgEngineerSalaryAUD *
    (firefightingRate - canonicalRate);

  // F2: Data Quality Cost
  const f2 =
    input.revenueAUD *
    config.qualityFraction *
    config.qualitySectorWeight *
    (1 - M);

  // F3: Integration Friction
  const f3 =
    config.integrationBaseCost *
    input.sourceSystems *
    config.integrationFailureProbability *
    (1 - M);

  // F4: Productivity Drain
  const f4 =
    input.totalFTE *
    input.avgFTESalaryAUD *
    0.27 *
    config.productivitySectorWeight *
    (1 - M);

  // F5: Regulatory Exposure
  const regBase = Math.min(
    config.regPenaltyCap,
    input.revenueAUD * config.regRevenueFraction,
  );
  const f5 =
    regBase * config.regProbabilityBase * Math.pow(1 - M, 1.2);

  // CSRD uplift
  const f5Final = input.csrdInScope ? f5 * 2 : f5;

  return {
    firefighting: Math.max(0, f1),
    dataQuality: Math.max(0, f2),
    integration: Math.max(0, f3),
    productivity: Math.max(0, f4),
    regulatory: Math.max(0, f5Final),
  };
}

// ---------------------------------------------------------------------------
// Layer 1c: Findings Adjustment
// ---------------------------------------------------------------------------

interface FindingsAdjustmentResult {
  findingsAdjustment: CostVector;
  adjustedCosts: CostVector;
  findingResults: FindingCostResult[];
}

function computeFindingsAdjustment(
  input: DALCInput,
  baseCosts: CostVector,
): FindingsAdjustmentResult {
  const sectorFindings = getFindingsForSector(input.sector);
  const findingResults: FindingCostResult[] = [];
  const adjustmentTotals = zeroCostVector();

  for (const userFinding of input.findings) {
    const severityMul = SEVERITY_MULTIPLIERS[userFinding.severity] ?? 0;
    if (severityMul === 0) {
      findingResults.push({
        id: userFinding.id,
        severity: userFinding.severity,
        totalCost: 0,
        categoryCosts: zeroCostVector(),
      });
      continue;
    }

    const definition = sectorFindings.find((f) => f.id === userFinding.id);
    if (!definition) {
      findingResults.push({
        id: userFinding.id,
        severity: userFinding.severity,
        totalCost: 0,
        categoryCosts: zeroCostVector(),
      });
      continue;
    }

    const rawCost = definition.costFunction(input) * severityMul;
    const weights = definition.categoryWeights;

    const categoryCosts: CostVector = {
      firefighting: rawCost * weights.firefighting,
      dataQuality: rawCost * weights.dataQuality,
      integration: rawCost * weights.integration,
      productivity: rawCost * weights.productivity,
      regulatory: rawCost * weights.regulatory,
    };

    adjustmentTotals.firefighting += categoryCosts.firefighting;
    adjustmentTotals.dataQuality += categoryCosts.dataQuality;
    adjustmentTotals.integration += categoryCosts.integration;
    adjustmentTotals.productivity += categoryCosts.productivity;
    adjustmentTotals.regulatory += categoryCosts.regulatory;

    findingResults.push({
      id: userFinding.id,
      severity: userFinding.severity,
      totalCost: rawCost,
      categoryCosts,
    });
  }

  // Apply 60% cap per category
  const cappedAdjustments: CostVector = {
    firefighting: Math.min(
      adjustmentTotals.firefighting,
      baseCosts.firefighting * FINDINGS_ADJUSTMENT_CAP,
    ),
    dataQuality: Math.min(
      adjustmentTotals.dataQuality,
      baseCosts.dataQuality * FINDINGS_ADJUSTMENT_CAP,
    ),
    integration: Math.min(
      adjustmentTotals.integration,
      baseCosts.integration * FINDINGS_ADJUSTMENT_CAP,
    ),
    productivity: Math.min(
      adjustmentTotals.productivity,
      baseCosts.productivity * FINDINGS_ADJUSTMENT_CAP,
    ),
    regulatory: Math.min(
      adjustmentTotals.regulatory,
      baseCosts.regulatory * FINDINGS_ADJUSTMENT_CAP,
    ),
  };

  const adjustedCosts: CostVector = {
    firefighting: baseCosts.firefighting + cappedAdjustments.firefighting,
    dataQuality: baseCosts.dataQuality + cappedAdjustments.dataQuality,
    integration: baseCosts.integration + cappedAdjustments.integration,
    productivity: baseCosts.productivity + cappedAdjustments.productivity,
    regulatory: baseCosts.regulatory + cappedAdjustments.regulatory,
  };

  return {
    findingsAdjustment: cappedAdjustments,
    adjustedCosts,
    findingResults,
  };
}

// ---------------------------------------------------------------------------
// Layer 2: Leontief Input-Output Amplification
// ---------------------------------------------------------------------------

interface LeontiefResult {
  amplifiedCosts: CostVector;
  amplifiedTotal: number;
  amplificationRatio: number;
  spectralRadius: number;
}

/**
 * Build the dynamic A(M, S) matrix from W weights and scaling functions.
 * Blueprint §4 Layer 2 topology.
 */
function buildAMatrix(
  W: WMatrix,
  M: number,
  S: number,
): number[][] {
  // Scaling functions
  const f1 = 1 - M; // linear decay
  const f2 = S / (S + 10); // system saturation
  const f3 = 1 / (1 + Math.exp(8 * (M - 0.4))); // regulatory sigmoid

  // Build 5x5 A matrix with specified topology
  const A: number[][] = [
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
  ];

  // Row 0 (Firefighting):
  A[0][1] = W[0][1] * f1; // Quality → Firefighting
  A[0][2] = W[0][2] * f1 * f2; // Integration → Firefighting
  A[0][4] = W[0][4] * f3; // Regulatory → Firefighting

  // Row 1 (Quality):
  A[1][2] = W[1][2] * f1 * f2; // Integration → Quality
  A[1][3] = W[1][3] * f1; // Productivity → Quality

  // Row 2 (Integration):
  A[2][0] = W[2][0] * f1; // Firefighting → Integration

  // Row 3 (Productivity):
  A[3][1] = W[3][1] * f1; // Quality → Productivity
  A[3][2] = W[3][2] * f1 * f2; // Integration → Productivity

  // Row 4 (Regulatory):
  A[4][1] = W[4][1] * f3; // Quality → Regulatory
  A[4][2] = W[4][2] * f1; // Integration → Regulatory

  return A;
}

/**
 * Compute spectral radius approximation via power iteration.
 */
function estimateSpectralRadius(A: number[][]): number {
  const n = A.length;
  let x = new Array(n).fill(1 / Math.sqrt(n));
  let eigenvalue = 0;

  for (let iter = 0; iter < 100; iter++) {
    // Matrix-vector multiply
    const y = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        y[i] += A[i][j] * x[j];
      }
    }

    // Find max absolute value
    let maxVal = 0;
    for (let i = 0; i < n; i++) {
      maxVal = Math.max(maxVal, Math.abs(y[i]));
    }

    if (maxVal === 0) return 0;

    eigenvalue = maxVal;

    // Normalise
    for (let i = 0; i < n; i++) {
      x[i] = y[i] / maxVal;
    }
  }

  return eigenvalue;
}

/**
 * Compute (I - A)^{-1} × B via Neumann series: sum_{k=0}^{N} A^k × B
 */
function neumannInversion(
  A: number[][],
  B: number[],
  terms: number,
): number[] {
  const n = B.length;
  const result = [...B]; // k=0 term: I × B = B
  let currentPower = [...B]; // A^0 × B = B, then A^1 × B, etc.

  for (let k = 1; k < terms; k++) {
    // Multiply A × currentPower
    const next = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        next[i] += A[i][j] * currentPower[j];
      }
    }
    // Accumulate
    for (let i = 0; i < n; i++) {
      result[i] += next[i];
    }
    currentPower = next;
  }

  return result;
}

function computeLeontief(
  adjustedCosts: CostVector,
  M: number,
  S: number,
  sector: string,
): LeontiefResult {
  const W = W_MATRICES[sector];
  if (!W) {
    // Fallback: no amplification
    const total = sumCostVector(adjustedCosts);
    return {
      amplifiedCosts: { ...adjustedCosts },
      amplifiedTotal: total,
      amplificationRatio: 1.0,
      spectralRadius: 0,
    };
  }

  const A = buildAMatrix(W, M, S);
  const spectralRadius = estimateSpectralRadius(A);
  const B = costVectorToArray(adjustedCosts);
  const amplified = neumannInversion(A, B, NEUMANN_TERMS);
  const amplifiedCosts = arrayToCostVector(amplified);
  const amplifiedTotal = sumCostVector(amplifiedCosts);
  const adjustedTotal = sumCostVector(adjustedCosts);
  const amplificationRatio =
    adjustedTotal > 0 ? amplifiedTotal / adjustedTotal : 1.0;

  return {
    amplifiedCosts,
    amplifiedTotal,
    amplificationRatio,
    spectralRadius,
  };
}

// ---------------------------------------------------------------------------
// Sanity Bounds
// ---------------------------------------------------------------------------

interface SanityResult {
  finalCosts: CostVector;
  finalTotal: number;
  capped: boolean;
}

function applySanityBounds(
  costs: CostVector,
  revenue: number,
): SanityResult {
  const maxPerCategory = revenue * SANITY_SINGLE_CATEGORY_MAX_REVENUE_FRACTION;
  const maxTotal = revenue * SANITY_TOTAL_MAX_REVENUE_FRACTION;

  let capped = false;

  // Cap individual categories
  const cappedCosts: CostVector = {
    firefighting: Math.min(costs.firefighting, maxPerCategory),
    dataQuality: Math.min(costs.dataQuality, maxPerCategory),
    integration: Math.min(costs.integration, maxPerCategory),
    productivity: Math.min(costs.productivity, maxPerCategory),
    regulatory: Math.min(costs.regulatory, maxPerCategory),
  };

  if (
    cappedCosts.firefighting < costs.firefighting ||
    cappedCosts.dataQuality < costs.dataQuality ||
    cappedCosts.integration < costs.integration ||
    cappedCosts.productivity < costs.productivity ||
    cappedCosts.regulatory < costs.regulatory
  ) {
    capped = true;
  }

  // Check total cap
  let total = sumCostVector(cappedCosts);
  if (total > maxTotal) {
    capped = true;
    const scaleFactor = maxTotal / total;
    cappedCosts.firefighting *= scaleFactor;
    cappedCosts.dataQuality *= scaleFactor;
    cappedCosts.integration *= scaleFactor;
    cappedCosts.productivity *= scaleFactor;
    cappedCosts.regulatory *= scaleFactor;
    total = maxTotal;
  }

  return {
    finalCosts: cappedCosts,
    finalTotal: total,
    capped,
  };
}

// ---------------------------------------------------------------------------
// Canonical Comparison
// ---------------------------------------------------------------------------

interface CanonicalResult {
  canonicalInvestment: number;
  withCanonicalTotal: number;
  annualSaving: number;
  paybackMonths: number;
}

function computeCanonicalComparison(
  amplifiedTotal: number,
  sector: string,
  canonicalInvestment: number,
): CanonicalResult {
  const config = SECTOR_CONFIGS[sector];
  const withCanonical =
    amplifiedTotal * (1 - config.canonicalSavingFraction);
  const annualSaving = amplifiedTotal - withCanonical;
  const paybackMonths =
    annualSaving > 0
      ? (canonicalInvestment / annualSaving) * 12
      : Infinity;

  return {
    canonicalInvestment,
    withCanonicalTotal: withCanonical,
    annualSaving,
    paybackMonths,
  };
}

// ---------------------------------------------------------------------------
// 5-Year Projection
// ---------------------------------------------------------------------------

function computeFiveYearProjection(
  currentTotal: number,
  sector: string,
  canonicalComparison: CanonicalResult,
): { projection: YearProjection[]; cumulativeSaving: number } {
  const config = SECTOR_CONFIGS[sector];
  const projection: YearProjection[] = [];
  let cumulativeSaving = 0;

  for (let year = 1; year <= 5; year++) {
    // "Do nothing" compounds via system growth, tech debt, reg tightening
    const compoundRate =
      1 +
      config.systemGrowthRate +
      config.techDebtRate +
      config.regTighteningRate;
    const doNothingCost = currentTotal * Math.pow(compoundRate, year - 1);

    // "With canonical" grows at 3% annually
    const withCanonicalCost =
      canonicalComparison.withCanonicalTotal *
      Math.pow(1 + CANONICAL_ANNUAL_GROWTH_RATE, year - 1);

    const yearSaving = doNothingCost - withCanonicalCost;
    cumulativeSaving += yearSaving;

    projection.push({
      year,
      doNothingCost,
      withCanonicalCost,
      cumulativeSaving,
    });
  }

  return { projection, cumulativeSaving };
}

// ---------------------------------------------------------------------------
// Property Scores
// ---------------------------------------------------------------------------

function computePropertyScores(
  input: DALCInput,
  findingResults: FindingCostResult[],
): { scores: PropertyScore[]; overallMaturity: number } {
  const sectorFindings = getFindingsForSector(input.sector);
  const scores: PropertyScore[] = [];

  for (const property of PROPERTIES) {
    // Find all findings for this property in the current sector
    const propertyFindings = sectorFindings.filter(
      (f) => f.propertyId === property.id,
    );

    if (propertyFindings.length === 0) {
      scores.push({
        propertyId: property.id,
        name: property.name,
        score: 4, // No findings = fully optimised
        maturityLabel: 'Optimised',
        totalCost: 0,
        findingCosts: [],
      });
      continue;
    }

    // Compute average severity for property
    let totalSeverity = 0;
    let count = 0;
    const propFindingResults: FindingCostResult[] = [];

    for (const pf of propertyFindings) {
      const userFinding = input.findings.find((uf) => uf.id === pf.id);
      const severity = userFinding?.severity ?? 'none';
      totalSeverity += SEVERITY_MULTIPLIERS[severity] ?? 0;
      count++;

      const result = findingResults.find((fr) => fr.id === pf.id);
      if (result) {
        propFindingResults.push(result);
      }
    }

    const avgSeverity = count > 0 ? totalSeverity / count : 0;
    const score = 4 * (1 - avgSeverity);

    // Map score to maturity label
    const maturityLabel = getMaturityLabel(score);

    // Total cost for this property
    const totalCost = propFindingResults.reduce(
      (sum, fr) => sum + fr.totalCost,
      0,
    );

    scores.push({
      propertyId: property.id,
      name: property.name,
      score,
      maturityLabel,
      totalCost,
      findingCosts: propFindingResults,
    });
  }

  // Weighted average maturity
  const validScores = scores.filter((s) => s.score < 4 || scores.length === PROPERTIES.length);
  const overallMaturity =
    validScores.length > 0
      ? validScores.reduce((sum, s) => sum + s.score, 0) / validScores.length
      : 4;

  return { scores, overallMaturity };
}

function getMaturityLabel(score: number): string {
  if (score >= 3.5) return 'Optimised';
  if (score >= 2.5) return 'Managed';
  if (score >= 1.5) return 'Defined';
  if (score >= 0.5) return 'Recognised';
  return 'Absent';
}

// ---------------------------------------------------------------------------
// Main Calculation Pipeline
// ---------------------------------------------------------------------------

export function calculateDALC(input: DALCInput): DALCResult {
  const sectorConfig = SECTOR_CONFIGS[input.sector];
  const canonicalInvestment =
    input.canonicalInvestmentAUD ?? DEFAULT_CANONICAL_INVESTMENT;

  // Layer 1: Shannon Entropy
  const shannon = computeShannon(input);

  // Layer 1b: Base Costs
  const baseCosts = computeBaseCosts(
    input,
    shannon.adjustedMaturity,
    shannon.firefightingRate,
  );
  const baseTotal = sumCostVector(baseCosts);

  // Layer 1c: Findings Adjustment
  const findingsResult = computeFindingsAdjustment(input, baseCosts);

  // Layer 2: Leontief Amplification
  const leontief = computeLeontief(
    findingsResult.adjustedCosts,
    shannon.adjustedMaturity,
    input.sourceSystems,
    input.sector,
  );

  // Sanity Bounds
  const sanity = applySanityBounds(
    leontief.amplifiedCosts,
    input.revenueAUD,
  );

  // Property Scores
  const { scores: propertyScores, overallMaturity } = computePropertyScores(
    input,
    findingsResult.findingResults,
  );

  // Canonical Comparison
  const canonical = computeCanonicalComparison(
    sanity.finalTotal,
    input.sector,
    canonicalInvestment,
  );

  // 5-Year Projection
  const { projection, cumulativeSaving } = computeFiveYearProjection(
    sanity.finalTotal,
    input.sector,
    canonical,
  );

  return {
    engineVersion: ENGINE_VERSION,

    // Layer 1
    baseMaturity: shannon.baseMaturity,
    disorderScore: shannon.disorderScore,
    adjustedMaturity: shannon.adjustedMaturity,
    shannonEntropy: shannon.shannonEntropy,
    maxEntropy: shannon.maxEntropy,

    // Layer 1b
    baseCosts,
    baseTotal,

    // Layer 1c
    findingsAdjustment: findingsResult.findingsAdjustment,
    adjustedCosts: findingsResult.adjustedCosts,
    adjustedTotal: sumCostVector(findingsResult.adjustedCosts),

    // Layer 2
    amplifiedCosts: leontief.amplifiedCosts,
    amplifiedTotal: leontief.amplifiedTotal,
    amplificationRatio: leontief.amplificationRatio,
    spectralRadius: leontief.spectralRadius,

    // Sanity
    sanityCapped: sanity.capped,
    finalCosts: sanity.finalCosts,
    finalTotal: sanity.finalTotal,

    // Property Scores
    propertyScores,
    overallMaturity,

    // Canonical
    canonicalInvestment: canonical.canonicalInvestment,
    withCanonicalTotal: canonical.withCanonicalTotal,
    annualSaving: canonical.annualSaving,
    paybackMonths: canonical.paybackMonths,

    // 5-Year
    fiveYearProjection: projection,
    fiveYearCumulativeSaving: cumulativeSaving,

    // Detail
    findingResults: findingsResult.findingResults,

    // Echo
    input,
    sectorConfig,
  };
}
