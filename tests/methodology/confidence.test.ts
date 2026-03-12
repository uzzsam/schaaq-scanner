import { describe, it, expect } from 'vitest';
import { assessConfidence } from '../../src/methodology/confidence';
import { makeInput, makeDryRunInput } from './fixtures';
import type { ConfidenceLevel } from '../../src/methodology/types';

describe('assessConfidence', () => {
  it('returns 4 area assessments', () => {
    const { assessments } = assessConfidence(makeInput());
    expect(assessments).toHaveLength(4);
    const areas = assessments.map(a => a.area);
    expect(areas).toContain('detection');
    expect(areas).toContain('coverage');
    expect(areas).toContain('economic');
    expect(areas).toContain('criticality');
  });

  it('every assessment has required fields', () => {
    const { assessments } = assessConfidence(makeInput());
    for (const a of assessments) {
      expect(a.area).toBeTruthy();
      expect(['high', 'medium', 'low', 'very_low']).toContain(a.confidenceLevel);
      expect(a.rationale).toBeTruthy();
      expect(Array.isArray(a.keyDrivers)).toBe(true);
      expect(a.keyDrivers.length).toBeGreaterThan(0);
    }
  });

  it('returns overall confidence level and rationale', () => {
    const { overallConfidence, overallConfidenceRationale } = assessConfidence(makeInput());
    expect(['high', 'medium', 'low', 'very_low']).toContain(overallConfidence);
    expect(overallConfidenceRationale).toBeTruthy();
  });

  it('overall confidence is the minimum of all areas', () => {
    const { assessments, overallConfidence } = assessConfidence(makeInput());
    const order: Record<ConfidenceLevel, number> = { very_low: 0, low: 1, medium: 2, high: 3 };
    const minLevel = assessments.reduce(
      (min, a) => order[a.confidenceLevel] < order[min] ? a.confidenceLevel : min,
      'high' as ConfidenceLevel,
    );
    expect(overallConfidence).toBe(minLevel);
  });

  // --- Detection ---
  it('detection: high confidence with 90%+ check coverage', () => {
    const input = makeInput({ checksRun: 21, checksAvailable: 21, totalTables: 50 });
    const { assessments } = assessConfidence(input);
    const det = assessments.find(a => a.area === 'detection')!;
    expect(det.confidenceLevel).toBe('high');
  });

  it('detection: degrades with low check coverage', () => {
    const input = makeInput({ checksRun: 10, checksAvailable: 21 });
    const { assessments } = assessConfidence(input);
    const det = assessments.find(a => a.area === 'detection')!;
    expect(['medium', 'low']).toContain(det.confidenceLevel);
  });

  it('detection: very_low for dry runs', () => {
    const { assessments } = assessConfidence(makeDryRunInput());
    const det = assessments.find(a => a.area === 'detection')!;
    expect(det.confidenceLevel).toBe('very_low');
  });

  it('detection: degrades for small schema', () => {
    const input = makeInput({ totalTables: 5, checksRun: 21, checksAvailable: 21 });
    const { assessments } = assessConfidence(input);
    const det = assessments.find(a => a.area === 'detection')!;
    expect(['medium', 'low']).toContain(det.confidenceLevel);
  });

  // --- Coverage ---
  it('coverage: medium when pipeline is missing', () => {
    const input = makeInput({ hasPipelineMapping: false });
    const { assessments } = assessConfidence(input);
    const cov = assessments.find(a => a.area === 'coverage')!;
    expect(['medium', 'low']).toContain(cov.confidenceLevel);
  });

  it('coverage: degrades with fewer properties', () => {
    const input = makeInput({ propertiesCovered: [1, 2, 3] });
    const { assessments } = assessConfidence(input);
    const cov = assessments.find(a => a.area === 'coverage')!;
    expect(cov.confidenceLevel).toBe('low');
  });

  it('coverage: very_low for dry runs', () => {
    const { assessments } = assessConfidence(makeDryRunInput());
    const cov = assessments.find(a => a.area === 'coverage')!;
    expect(cov.confidenceLevel).toBe('very_low');
  });

  // --- Economic ---
  it('economic: base level is medium due to W matrix estimation', () => {
    const { assessments } = assessConfidence(makeInput());
    const econ = assessments.find(a => a.area === 'economic')!;
    expect(econ.confidenceLevel).toBe('medium');
  });

  it('economic: very_low for dry runs', () => {
    const { assessments } = assessConfidence(makeDryRunInput());
    const econ = assessments.find(a => a.area === 'economic')!;
    expect(econ.confidenceLevel).toBe('very_low');
  });

  it('economic: mentions client overrides when present', () => {
    const input = makeInput({ configuredThresholds: { canonicalInvestmentAUD: 2_000_000 } });
    const { assessments } = assessConfidence(input);
    const econ = assessments.find(a => a.area === 'economic')!;
    expect(econ.keyDrivers.some(d => d.includes('canonical investment'))).toBe(true);
  });

  // --- Criticality ---
  it('criticality: very_low when not run', () => {
    const input = makeInput({
      criticalityContext: {
        wasRun: false, totalAssetsAssessed: 0, signalTypesUsed: 0,
        cdeIdentificationMethod: 'none', tierDistribution: {},
      },
    });
    const { assessments } = assessConfidence(input);
    const crit = assessments.find(a => a.area === 'criticality')!;
    expect(crit.confidenceLevel).toBe('very_low');
  });

  it('criticality: degrades with low signal diversity', () => {
    const input = makeInput({
      criticalityContext: {
        ...makeInput().criticalityContext,
        signalTypesUsed: 2,
      },
    });
    const { assessments } = assessConfidence(input);
    const crit = assessments.find(a => a.area === 'criticality')!;
    expect(crit.confidenceLevel).toBe('low');
  });

  it('criticality: degrades when all assets in single tier', () => {
    const input = makeInput({
      criticalityContext: {
        ...makeInput().criticalityContext,
        signalTypesUsed: 10,
        tierDistribution: { medium: 50 },
      },
    });
    const { assessments } = assessConfidence(input);
    const crit = assessments.find(a => a.area === 'criticality')!;
    expect(['medium', 'low']).toContain(crit.confidenceLevel);
  });

  // --- Overall ---
  it('all dry-run areas are very_low, so overall is very_low', () => {
    const { overallConfidence } = assessConfidence(makeDryRunInput());
    expect(overallConfidence).toBe('very_low');
  });

  it('overall rationale mentions constraining areas when not high', () => {
    const { overallConfidence, overallConfidenceRationale } = assessConfidence(makeInput());
    if (overallConfidence !== 'high') {
      expect(overallConfidenceRationale).toMatch(/constrained by/);
    }
  });
});
