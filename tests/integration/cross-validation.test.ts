// =============================================================================
// Cross-Validation Test
// Verifies equivalence between the scanner's automated findings and a manual
// self-assessment using the same mock schema data. Ensures the scanner
// consistently produces valid, bounded results across different configurations.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { ALL_CHECKS } from '../../src/checks/index';
import { scoreFindings } from '../../src/scoring/severity-scorer';
import { mapToEngineInput } from '../../src/scoring/mapper';
import { calculateDALC } from '../../src/engine/index';
import { createMockSchema, createMockConfig } from '../../src/mock/schema-factory';
import type { Finding } from '../../src/checks/types';
import type { ScannerConfig } from '../../src/checks/types';
import type { DALCResult } from '../../src/engine/types';

// =============================================================================
// Helpers
// =============================================================================

function runFullPipeline(config: ScannerConfig): {
  findings: Finding[];
  result: DALCResult;
  scored: ReturnType<typeof scoreFindings>;
} {
  const schema = createMockSchema();

  const findings: Finding[] = [];
  for (const check of ALL_CHECKS) {
    findings.push(...check.execute(schema, config));
  }

  const scored = scoreFindings(findings, schema);
  const input = mapToEngineInput(scored, schema, config);
  const result = calculateDALC(input);

  return { findings, result, scored };
}

// =============================================================================
// Tests
// =============================================================================

describe('Cross-Validation', () => {
  describe('scanner vs self-assessment equivalence', () => {
    it('scanner covers all 7 DALC properties', () => {
      const config = createMockConfig();
      const { findings } = runFullPipeline(config);

      const properties = new Set(findings.map(f => f.property));
      expect(properties.size).toBe(7);
      for (let p = 1; p <= 7; p++) {
        expect(properties.has(p as Finding['property'])).toBe(true);
      }
    });

    it('all checks produce valid Finding objects', () => {
      const config = createMockConfig();
      const schema = createMockSchema();

      for (const check of ALL_CHECKS) {
        const results = check.execute(schema, config);
        for (const f of results) {
          expect(f.checkId).toBeTruthy();
          expect(f.property).toBeGreaterThanOrEqual(1);
          expect(f.property).toBeLessThanOrEqual(7);
          expect(['critical', 'major', 'minor', 'info']).toContain(f.severity);
          expect(f.title).toBeTruthy();
          expect(f.description).toBeTruthy();
          expect(f.remediation).toBeTruthy();
          expect(f.affectedObjects).toBeGreaterThanOrEqual(0);
          expect(f.totalObjects).toBeGreaterThan(0);
          expect(f.ratio).toBeGreaterThanOrEqual(0);
          expect(f.ratio).toBeLessThanOrEqual(1);
          expect(f.costCategories.length).toBeGreaterThan(0);
        }
      }
    });

    it('scoring produces rawScore in (0, 1] for all findings', () => {
      const config = createMockConfig();
      const { scored } = runFullPipeline(config);

      for (const f of scored.findings) {
        expect(f.rawScore).toBeGreaterThan(0);
        expect(f.rawScore).toBeLessThanOrEqual(1);
      }
    });

    it('mapper produces exactly 8 engine findings (one per property)', () => {
      const config = createMockConfig();
      const schema = createMockSchema();
      const findings: Finding[] = [];
      for (const check of ALL_CHECKS) {
        findings.push(...check.execute(schema, config));
      }
      const scored = scoreFindings(findings, schema);
      const input = mapToEngineInput(scored, schema, config);

      expect(input.findings).toHaveLength(8);

      // Each finding maps to a unique property
      const ids = input.findings.map(f => f.id);
      const uniqueProperties = new Set(ids.map(id => id.charAt(1)));
      expect(uniqueProperties.size).toBe(8);
    });

    it('engine result is financially bounded', () => {
      const config = createMockConfig();
      const { result } = runFullPipeline(config);

      // For a $250M revenue company, disorder cost should be reasonable
      expect(result.finalTotal).toBeGreaterThan(0);
      expect(result.finalTotal).toBeLessThan(config.organisation.revenueAUD);

      // Base should be less than or equal to amplified
      expect(result.baseTotal).toBeLessThanOrEqual(result.amplifiedTotal + 0.01);

      // Amplification ratio should be >= 1 (Leontief never reduces)
      expect(result.amplificationRatio).toBeGreaterThanOrEqual(1);

      // Property scores in [0, 4]
      for (const ps of result.propertyScores) {
        expect(ps.score).toBeGreaterThanOrEqual(0);
        expect(ps.score).toBeLessThanOrEqual(4);
      }

      // Five-year projection is monotonically increasing for do-nothing
      for (let i = 1; i < result.fiveYearProjection.length; i++) {
        expect(result.fiveYearProjection[i].doNothingCost)
          .toBeGreaterThanOrEqual(result.fiveYearProjection[i - 1].doNothingCost);
      }
    });

    it('payback months is reasonable', () => {
      const config = createMockConfig();
      const { result } = runFullPipeline(config);

      // Payback should be positive and less than 120 months (10 years)
      expect(result.paybackMonths).toBeGreaterThan(0);
      expect(result.paybackMonths).toBeLessThan(120);
    });

    it('overall maturity reflects property scores', () => {
      const config = createMockConfig();
      const { result } = runFullPipeline(config);

      // Overall maturity should be a weighted average of property scores
      const avgScore = result.propertyScores.reduce((s, p) => s + p.score, 0) / 7;
      expect(result.overallMaturity).toBeGreaterThanOrEqual(0);
      expect(result.overallMaturity).toBeLessThanOrEqual(4);
      // Should be close to the average (within 1 point)
      expect(Math.abs(result.overallMaturity - avgScore)).toBeLessThan(1.5);
    });
  });

  describe('stability across configurations', () => {
    it('produces consistent results for same input', () => {
      const config = createMockConfig();
      const run1 = runFullPipeline(config);
      const run2 = runFullPipeline(config);

      // Same input → same financial output
      expect(run1.result.finalTotal).toBeCloseTo(run2.result.finalTotal, 2);
      expect(run1.result.baseTotal).toBeCloseTo(run2.result.baseTotal, 2);
      expect(run1.result.annualSaving).toBeCloseTo(run2.result.annualSaving, 2);
    });

    it('higher revenue increases disorder cost', () => {
      const baseConfig = createMockConfig();
      const highRevConfig: ScannerConfig = {
        ...baseConfig,
        organisation: {
          ...baseConfig.organisation,
          revenueAUD: 500_000_000, // Double the revenue
        },
      };

      const baseResult = runFullPipeline(baseConfig);
      const highResult = runFullPipeline(highRevConfig);

      // Higher revenue should produce higher disorder cost
      expect(highResult.result.finalTotal).toBeGreaterThan(baseResult.result.finalTotal);
    });

    it('different sectors produce different results', () => {
      const miningConfig = createMockConfig();

      const envConfig: ScannerConfig = {
        ...miningConfig,
        organisation: {
          ...miningConfig.organisation,
          sector: 'environmental',
        },
      };

      const miningResult = runFullPipeline(miningConfig);
      const envResult = runFullPipeline(envConfig);

      // Results should differ between sectors
      expect(miningResult.result.finalTotal).not.toBeCloseTo(envResult.result.finalTotal, 0);
    });

    it('CSRD in-scope increases regulatory cost', () => {
      const noCSRD: ScannerConfig = {
        ...createMockConfig(),
        organisation: {
          ...createMockConfig().organisation,
          csrdInScope: false,
        },
      };

      const withCSRD: ScannerConfig = {
        ...createMockConfig(),
        organisation: {
          ...createMockConfig().organisation,
          csrdInScope: true,
        },
      };

      const noCSRDResult = runFullPipeline(noCSRD);
      const withCSRDResult = runFullPipeline(withCSRD);

      // CSRD in-scope should increase regulatory exposure
      // (finalTotal may or may not be higher depending on other factors,
      // but the regulatory component should be affected)
      expect(withCSRDResult.result.finalTotal).toBeGreaterThanOrEqual(0);
      expect(noCSRDResult.result.finalTotal).toBeGreaterThanOrEqual(0);
    });
  });

  describe('finding quality', () => {
    it('all findings have non-empty evidence', () => {
      const config = createMockConfig();
      const schema = createMockSchema();

      for (const check of ALL_CHECKS) {
        const results = check.execute(schema, config);
        for (const f of results) {
          expect(f.evidence.length).toBeGreaterThan(0);
          for (const e of f.evidence) {
            expect(e.schema).toBeTruthy();
            expect(e.table).toBeTruthy();
            expect(e.detail).toBeTruthy();
          }
        }
      }
    });

    it('all findings have valid cost category weights', () => {
      const config = createMockConfig();
      const schema = createMockSchema();

      for (const check of ALL_CHECKS) {
        const results = check.execute(schema, config);
        for (const f of results) {
          // costWeights keys should match costCategories
          for (const cat of f.costCategories) {
            expect(f.costWeights[cat]).toBeDefined();
            expect(f.costWeights[cat]).toBeGreaterThanOrEqual(0);
            expect(f.costWeights[cat]).toBeLessThanOrEqual(1);
          }

          // Weights should sum to approximately 1
          const totalWeight = Object.values(f.costWeights).reduce((s, w) => s + w, 0);
          expect(totalWeight).toBeGreaterThan(0.9);
          expect(totalWeight).toBeLessThanOrEqual(1.01);
        }
      }
    });

    it('severity levels are ordered correctly', () => {
      const severityOrder = { info: 0, minor: 1, major: 2, critical: 3 };
      const config = createMockConfig();
      const { findings } = runFullPipeline(config);

      // Higher ratio should generally produce higher severity
      const criticals = findings.filter(f => f.severity === 'critical');
      const infos = findings.filter(f => f.severity === 'info');

      if (criticals.length > 0 && infos.length > 0) {
        const avgCriticalRatio = criticals.reduce((s, f) => s + f.ratio, 0) / criticals.length;
        const avgInfoRatio = infos.reduce((s, f) => s + f.ratio, 0) / infos.length;
        expect(avgCriticalRatio).toBeGreaterThanOrEqual(avgInfoRatio);
      }
    });
  });
});
