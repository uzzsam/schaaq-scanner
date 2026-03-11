// =============================================================================
// DALC Scanner — Engine Smoke Test
// Verifies the Phase 1 engine works standalone after extraction.
//
// Adapted to the actual v4 (Archimedes) engine API:
// - DALCInput requires `findings: FindingSeverity[]` and `avgEngineerSalaryAUD`
// - Sectors: 'mining' | 'environmental' | 'energy'
// - Approaches use hyphens: 'ad-hoc', 'mixed-adhoc', 'mixed-kimball', etc.
// - DALCResult has flat structure (not nested entropy/amplification objects)
// - Engine version: 'v4.0.0'
// =============================================================================

import { describe, it, expect } from 'vitest';
import { calculateDALC } from '../src/engine/index';
import type { DALCInput, DALCResult, FindingSeverity } from '../src/engine/types';

// Reference mining scenario — all findings set to 'pervasive' for maximum cost
const MINING_FINDINGS: FindingSeverity[] = [
  { id: 'P1-M', severity: 'pervasive' },
  { id: 'P2-M', severity: 'pervasive' },
  { id: 'P3-M', severity: 'pervasive' },
  { id: 'P4-M', severity: 'pervasive' },
  { id: 'P5-M', severity: 'pervasive' },
  { id: 'P6-M', severity: 'pervasive' },
  { id: 'P7-M', severity: 'pervasive' },
  { id: 'P8-M', severity: 'pervasive' },
];

const REFERENCE_MINING: DALCInput = {
  sector: 'mining',
  revenueAUD: 500_000_000,
  dataEngineers: 12,
  avgEngineerSalaryAUD: 185_000,
  modellingApproach: 'ad-hoc',
  sourceSystems: 12,
  totalFTE: 2500,
  avgFTESalaryAUD: 125_000,
  csrdInScope: false,
  canonicalInvestmentAUD: 1_350_000,
  primaryCoverage: 0.15,
  findings: MINING_FINDINGS,
};

describe('Engine Smoke Test — Standalone Extraction', () => {
  let result: DALCResult;

  it('should execute calculateDALC without errors', () => {
    result = calculateDALC(REFERENCE_MINING);
    expect(result).toBeDefined();
  });

  it('should return correct engine version', () => {
    expect(result.engineVersion).toBe('v4.0.0');
  });

  it('should return the input unchanged', () => {
    expect(result.input).toEqual(REFERENCE_MINING);
  });

  // --- Layer 1: Shannon Entropy ---
  it('should compute disorder score between 0 and 1', () => {
    expect(result.disorderScore).toBeGreaterThan(0);
    expect(result.disorderScore).toBeLessThanOrEqual(1);
  });

  it('should compute adjusted maturity lower than base maturity', () => {
    expect(result.adjustedMaturity).toBeLessThan(result.baseMaturity);
  });

  it('should have base maturity of 0.10 for ad-hoc', () => {
    expect(result.baseMaturity).toBe(0.10);
  });

  // --- Layer 1b: Base Costs ---
  it('should compute positive base costs', () => {
    expect(result.baseTotal).toBeGreaterThan(0);
    expect(result.baseCosts.firefighting).toBeGreaterThan(0);
    expect(result.baseCosts.dataQuality).toBeGreaterThan(0);
    expect(result.baseCosts.integration).toBeGreaterThan(0);
    expect(result.baseCosts.productivity).toBeGreaterThan(0);
    expect(result.baseCosts.regulatory).toBeGreaterThan(0);
    expect(result.baseCosts.aiMlRiskExposure).toBeGreaterThan(0);
  });

  // --- Layer 1c: Findings Adjustment ---
  it('should produce findings adjustment costs', () => {
    const adjTotal =
      result.findingsAdjustment.firefighting +
      result.findingsAdjustment.dataQuality +
      result.findingsAdjustment.integration +
      result.findingsAdjustment.productivity +
      result.findingsAdjustment.regulatory +
      result.findingsAdjustment.aiMlRiskExposure;
    expect(adjTotal).toBeGreaterThan(0);
  });

  it('should have adjusted costs >= base costs in every category', () => {
    expect(result.adjustedCosts.firefighting).toBeGreaterThanOrEqual(result.baseCosts.firefighting);
    expect(result.adjustedCosts.dataQuality).toBeGreaterThanOrEqual(result.baseCosts.dataQuality);
    expect(result.adjustedCosts.integration).toBeGreaterThanOrEqual(result.baseCosts.integration);
    expect(result.adjustedCosts.productivity).toBeGreaterThanOrEqual(result.baseCosts.productivity);
    expect(result.adjustedCosts.regulatory).toBeGreaterThanOrEqual(result.baseCosts.regulatory);
    expect(result.adjustedCosts.aiMlRiskExposure).toBeGreaterThanOrEqual(result.baseCosts.aiMlRiskExposure);
  });

  // --- Layer 2: Amplification ---
  it('should produce amplified total in reasonable range', () => {
    // With pervasive findings on $500M mining, expect significant costs
    expect(result.amplifiedTotal).toBeGreaterThan(5_000_000);
    expect(result.amplifiedTotal).toBeLessThan(100_000_000);
  });

  it('should have amplification ratio >= 1.0', () => {
    expect(result.amplificationRatio).toBeGreaterThanOrEqual(1.0);
  });

  it('should have spectral radius < 1.0 (Leontief stability)', () => {
    expect(result.spectralRadius).toBeLessThan(1.0);
  });

  it('should have amplification ratio < 2.0', () => {
    expect(result.amplificationRatio).toBeLessThan(2.0);
  });

  // --- Sanity Bounds ---
  it('should have final total <= 10% of revenue', () => {
    expect(result.finalTotal).toBeLessThanOrEqual(result.input.revenueAUD * 0.10 + 1);
  });

  it('should have final costs in each category <= 5% of revenue', () => {
    const maxCat = result.input.revenueAUD * 0.05;
    expect(result.finalCosts.firefighting).toBeLessThanOrEqual(maxCat + 1);
    expect(result.finalCosts.dataQuality).toBeLessThanOrEqual(maxCat + 1);
    expect(result.finalCosts.integration).toBeLessThanOrEqual(maxCat + 1);
    expect(result.finalCosts.productivity).toBeLessThanOrEqual(maxCat + 1);
    expect(result.finalCosts.regulatory).toBeLessThanOrEqual(maxCat + 1);
    expect(result.finalCosts.aiMlRiskExposure).toBeLessThanOrEqual(maxCat + 1);
  });

  // --- Canonical Comparison ---
  it('should show mining canonical saving fraction of 0.42', () => {
    expect(result.sectorConfig.canonicalSavingFraction).toBe(0.42);
  });

  it('should have positive annual saving', () => {
    expect(result.annualSaving).toBeGreaterThan(0);
  });

  it('should have payback period under 36 months', () => {
    expect(result.paybackMonths).toBeGreaterThan(0);
    expect(result.paybackMonths).toBeLessThan(36);
  });

  // --- 5-Year Projection ---
  it('should produce 5 projection years', () => {
    expect(result.fiveYearProjection).toHaveLength(5);
  });

  it('should show increasing cumulative savings each year', () => {
    for (let i = 1; i < result.fiveYearProjection.length; i++) {
      expect(result.fiveYearProjection[i].cumulativeSaving)
        .toBeGreaterThan(result.fiveYearProjection[i - 1].cumulativeSaving);
    }
  });

  // --- Property Scores ---
  it('should produce 8 property scores', () => {
    expect(result.propertyScores).toHaveLength(8);
  });

  it('should have overall maturity between 0 and 4', () => {
    expect(result.overallMaturity).toBeGreaterThanOrEqual(0);
    expect(result.overallMaturity).toBeLessThanOrEqual(4);
  });

  // --- All 6 cost categories populated ---
  it('should have all 6 amplified cost categories > 0', () => {
    expect(result.amplifiedCosts.firefighting).toBeGreaterThan(0);
    expect(result.amplifiedCosts.dataQuality).toBeGreaterThan(0);
    expect(result.amplifiedCosts.integration).toBeGreaterThan(0);
    expect(result.amplifiedCosts.productivity).toBeGreaterThan(0);
    expect(result.amplifiedCosts.regulatory).toBeGreaterThan(0);
    expect(result.amplifiedCosts.aiMlRiskExposure).toBeGreaterThan(0);
  });

  it('should have amplified total equal to sum of categories', () => {
    const sum =
      result.amplifiedCosts.firefighting +
      result.amplifiedCosts.dataQuality +
      result.amplifiedCosts.integration +
      result.amplifiedCosts.productivity +
      result.amplifiedCosts.regulatory +
      result.amplifiedCosts.aiMlRiskExposure;
    expect(Math.abs(result.amplifiedTotal - sum)).toBeLessThan(1);
  });

  // --- Finding Results ---
  it('should return 8 finding results for mining', () => {
    expect(result.findingResults).toHaveLength(8);
  });

  it('should have all findings with pervasive severity', () => {
    for (const fr of result.findingResults) {
      expect(fr.severity).toBe('pervasive');
    }
  });
});

// --- Cross-Sector Sanity ---
describe('Cross-Sector Sanity', () => {
  const SECTORS: Array<'mining' | 'environmental' | 'energy'> = [
    'mining',
    'environmental',
    'energy',
  ];

  const SECTOR_FINDINGS: Record<string, FindingSeverity[]> = {
    mining: [
      { id: 'P1-M', severity: 'some' },
      { id: 'P2-M', severity: 'some' },
      { id: 'P3-M', severity: 'some' },
      { id: 'P4-M', severity: 'some' },
      { id: 'P5-M', severity: 'some' },
      { id: 'P6-M', severity: 'some' },
      { id: 'P7-M', severity: 'some' },
      { id: 'P8-M', severity: 'some' },
    ],
    environmental: [
      { id: 'P1-E', severity: 'some' },
      { id: 'P2-E', severity: 'some' },
      { id: 'P3-E', severity: 'some' },
      { id: 'P4-E', severity: 'some' },
      { id: 'P5-E', severity: 'some' },
      { id: 'P6-E', severity: 'some' },
      { id: 'P7-E', severity: 'some' },
      { id: 'P8-E', severity: 'some' },
    ],
    energy: [
      { id: 'P1-U', severity: 'some' },
      { id: 'P2-U', severity: 'some' },
      { id: 'P3-U', severity: 'some' },
      { id: 'P4-U', severity: 'some' },
      { id: 'P5-U', severity: 'some' },
      { id: 'P6-U', severity: 'some' },
      { id: 'P7-U', severity: 'some' },
      { id: 'P8-U', severity: 'some' },
    ],
  };

  for (const sector of SECTORS) {
    it(`should produce valid results for ${sector}`, () => {
      const input: DALCInput = {
        sector,
        revenueAUD: 200_000_000,
        dataEngineers: 8,
        avgEngineerSalaryAUD: 170_000,
        modellingApproach: 'mixed-adhoc',
        sourceSystems: 8,
        totalFTE: 1000,
        avgFTESalaryAUD: 110_000,
        csrdInScope: false,
        canonicalInvestmentAUD: 1_350_000,
        primaryCoverage: 0.40,
        findings: SECTOR_FINDINGS[sector],
      };
      const result = calculateDALC(input);
      expect(result.finalTotal).toBeGreaterThan(1_000_000);
      expect(result.finalTotal).toBeLessThan(50_000_000);
      expect(result.amplificationRatio).toBeGreaterThanOrEqual(1.0);
      expect(result.amplificationRatio).toBeLessThan(2.0);
      expect(result.spectralRadius).toBeLessThan(1.0);
    });
  }
});

// --- Determinism ---
describe('Determinism', () => {
  it('should produce identical results for identical inputs', () => {
    const r1 = calculateDALC(REFERENCE_MINING);
    const r2 = calculateDALC(REFERENCE_MINING);
    expect(r1.amplifiedTotal).toBe(r2.amplifiedTotal);
    expect(r1.finalTotal).toBe(r2.finalTotal);
    expect(r1.annualSaving).toBe(r2.annualSaving);
  });
});

// --- No-Findings Baseline ---
describe('No-Findings Baseline', () => {
  it('should produce results with zero findings adjustment when all findings are none', () => {
    const input: DALCInput = {
      ...REFERENCE_MINING,
      findings: MINING_FINDINGS.map((f) => ({ ...f, severity: 'none' as const })),
    };
    const result = calculateDALC(input);
    expect(result.findingsAdjustment.firefighting).toBe(0);
    expect(result.findingsAdjustment.dataQuality).toBe(0);
    expect(result.findingsAdjustment.integration).toBe(0);
    expect(result.findingsAdjustment.productivity).toBe(0);
    expect(result.findingsAdjustment.regulatory).toBe(0);
    expect(result.findingsAdjustment.aiMlRiskExposure).toBe(0);
    // Base costs should still be positive
    expect(result.baseTotal).toBeGreaterThan(0);
  });
});
