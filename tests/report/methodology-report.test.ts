import { describe, it, expect } from 'vitest';
import { buildMethodologySummary } from '../../src/methodology/builder';
import { makeInput, makeDryRunInput } from '../methodology/fixtures';
import type { MethodologySummary } from '../../src/methodology/types';

/**
 * Tests that methodology data shapes correctly for report integration.
 * Does not test full report rendering (that requires DALCResult etc),
 * but verifies the MethodologySummary is suitable for template consumption.
 */
describe('Methodology report data shaping', () => {
  // --- Executive (summary view) ---
  describe('executive report suitability', () => {
    it('has overall confidence level for badge rendering', () => {
      const summary = buildMethodologySummary(makeInput());
      expect(['high', 'medium', 'low', 'very_low']).toContain(summary.overallConfidence);
    });

    it('has overall rationale for narrative text', () => {
      const summary = buildMethodologySummary(makeInput());
      expect(summary.overallConfidenceRationale.length).toBeGreaterThan(10);
    });

    it('has high-materiality assumptions for executive highlights', () => {
      const summary = buildMethodologySummary(makeInput());
      const highMat = summary.assumptions.filter(a => a.materialityLevel === 'high');
      expect(highMat.length).toBeGreaterThan(0);
    });

    it('has coverage gap count for executive summary', () => {
      const summary = buildMethodologySummary(makeDryRunInput());
      expect(summary.coverageGaps.length).toBeGreaterThan(0);
    });
  });

  // --- Technical (full detail) ---
  describe('technical appendix suitability', () => {
    it('assumptions have all fields for table rendering', () => {
      const summary = buildMethodologySummary(makeInput());
      for (const a of summary.assumptions) {
        expect(a.id).toBeTruthy();
        expect(a.category).toBeTruthy();
        expect(a.assumption).toBeTruthy();
        expect(a.sourceType).toBeTruthy();
        expect(a.materialityLevel).toBeTruthy();
        expect(a.currentValue).toBeTruthy();
        expect(Array.isArray(a.affectedOutputs)).toBe(true);
      }
    });

    it('coverage gaps have all fields for list rendering', () => {
      const summary = buildMethodologySummary(makeDryRunInput());
      for (const g of summary.coverageGaps) {
        expect(g.id).toBeTruthy();
        expect(g.category).toBeTruthy();
        expect(g.description).toBeTruthy();
        expect(g.impact).toBeTruthy();
        expect(g.mitigationHint).toBeTruthy();
      }
    });

    it('confidence assessments have all fields for card rendering', () => {
      const summary = buildMethodologySummary(makeInput());
      for (const ca of summary.confidenceAssessments) {
        expect(ca.area).toBeTruthy();
        expect(['high', 'medium', 'low', 'very_low']).toContain(ca.confidenceLevel);
        expect(ca.rationale).toBeTruthy();
        expect(ca.keyDrivers.length).toBeGreaterThan(0);
      }
    });

    it('scan coverage has all fields for metadata section', () => {
      const summary = buildMethodologySummary(makeInput());
      const sc = summary.scanCoverage;
      expect(sc.totalTables).toBeGreaterThan(0);
      expect(sc.totalColumns).toBeGreaterThan(0);
      expect(sc.schemaCount).toBeGreaterThan(0);
      expect(sc.checksRun).toBeGreaterThan(0);
      expect(sc.checksAvailable).toBeGreaterThan(0);
      expect(sc.propertiesCovered.length).toBeGreaterThan(0);
      expect(typeof sc.hasPipelineMapping).toBe('boolean');
      expect(typeof sc.hasExternalLineage).toBe('boolean');
      expect(sc.adapterType).toBeTruthy();
    });

    it('version stamp present for audit trail', () => {
      const summary = buildMethodologySummary(makeInput());
      expect(summary.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('generatedAt is ISO timestamp for audit trail', () => {
      const summary = buildMethodologySummary(makeInput());
      expect(summary.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  // --- JSON serialization (for template helpers) ---
  describe('JSON serialization', () => {
    it('full summary survives JSON round-trip', () => {
      const summary = buildMethodologySummary(makeInput());
      const json = JSON.stringify(summary);
      const parsed = JSON.parse(json) as MethodologySummary;
      expect(parsed.version).toBe(summary.version);
      expect(parsed.assumptions.length).toBe(summary.assumptions.length);
      expect(parsed.overallConfidence).toBe(summary.overallConfidence);
    });
  });
});
