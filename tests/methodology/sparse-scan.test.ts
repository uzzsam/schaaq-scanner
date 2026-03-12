import { describe, it, expect } from 'vitest';
import { buildMethodologySummary } from '../../src/methodology/builder';
import { classifyAssumptions } from '../../src/methodology/assumptions';
import { deriveCoverageGaps } from '../../src/methodology/coverage-gaps';
import { assessConfidence } from '../../src/methodology/confidence';
import { makeDryRunInput, makeSparseInput, makeInput } from './fixtures';

describe('sparse / partial / dry-run scans', () => {
  // --- Dry-run ---
  describe('dry-run scan', () => {
    const input = makeDryRunInput();

    it('produces DRY_RUN coverage gap', () => {
      const gaps = deriveCoverageGaps(input);
      expect(gaps.some(g => g.id === 'DRY_RUN')).toBe(true);
    });

    it('produces DRY_RUN_MOCK_DATA assumption', () => {
      const assumptions = classifyAssumptions(input);
      expect(assumptions.some(a => a.id === 'DRY_RUN_MOCK_DATA')).toBe(true);
    });

    it('all 4 confidence areas are very_low', () => {
      const { assessments } = assessConfidence(input);
      for (const a of assessments) {
        expect(a.confidenceLevel).toBe('very_low');
      }
    });

    it('overall confidence is very_low', () => {
      const summary = buildMethodologySummary(input);
      expect(summary.overallConfidence).toBe('very_low');
    });

    it('rationale mentions dry-run, mock, illustrative, or not performed', () => {
      const { assessments } = assessConfidence(input);
      for (const a of assessments) {
        expect(a.rationale.toLowerCase()).toMatch(/dry.run|mock|illustrative|not performed/);
      }
    });
  });

  // --- Sparse scan ---
  describe('sparse scan (few checks, few properties, no pipeline)', () => {
    const input = makeSparseInput();

    it('produces SPARSE_EVIDENCE gap when evidence ratio < 0.8', () => {
      const gaps = deriveCoverageGaps(input);
      expect(gaps.some(g => g.id === 'SPARSE_EVIDENCE')).toBe(true);
    });

    it('produces LIMITED_CROSS_SYSTEM gap', () => {
      const gaps = deriveCoverageGaps(input);
      expect(gaps.some(g => g.id === 'LIMITED_CROSS_SYSTEM')).toBe(true);
    });

    it('detection confidence is not high', () => {
      const { assessments } = assessConfidence(input);
      const det = assessments.find(a => a.area === 'detection')!;
      expect(det.confidenceLevel).not.toBe('high');
    });

    it('coverage confidence is not high', () => {
      const { assessments } = assessConfidence(input);
      const cov = assessments.find(a => a.area === 'coverage')!;
      expect(cov.confidenceLevel).not.toBe('high');
    });

    it('overall confidence is low or very_low', () => {
      const summary = buildMethodologySummary(input);
      expect(['low', 'very_low']).toContain(summary.overallConfidence);
    });
  });

  // --- Small schema ---
  describe('small schema (< 10 tables)', () => {
    const input = makeInput({ totalTables: 5, checksRun: 21, checksAvailable: 21 });

    it('produces SMALL_SCHEMA gap', () => {
      const gaps = deriveCoverageGaps(input);
      expect(gaps.some(g => g.id === 'SMALL_SCHEMA')).toBe(true);
    });

    it('detection confidence degrades', () => {
      const { assessments } = assessConfidence(input);
      const det = assessments.find(a => a.area === 'detection')!;
      expect(['medium', 'low']).toContain(det.confidenceLevel);
    });
  });

  // --- No criticality ---
  describe('criticality not run', () => {
    const input = makeInput({
      criticalityContext: {
        wasRun: false,
        totalAssetsAssessed: 0,
        signalTypesUsed: 0,
        cdeIdentificationMethod: 'none',
        tierDistribution: {},
      },
    });

    it('produces NO_CRITICALITY gap', () => {
      const gaps = deriveCoverageGaps(input);
      expect(gaps.some(g => g.id === 'NO_CRITICALITY')).toBe(true);
    });

    it('criticality confidence is very_low', () => {
      const { assessments } = assessConfidence(input);
      const crit = assessments.find(a => a.area === 'criticality')!;
      expect(crit.confidenceLevel).toBe('very_low');
    });
  });

  // --- Partial scan ---
  describe('partial scan (some checks produced no findings)', () => {
    const input = makeInput({
      totalTables: 50,
      checksRun: 15,
      checksAvailable: 21,
    });

    it('detection confidence is not high', () => {
      const { assessments } = assessConfidence(input);
      const det = assessments.find(a => a.area === 'detection')!;
      expect(det.confidenceLevel).not.toBe('high');
    });
  });
});
