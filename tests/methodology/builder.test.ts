import { describe, it, expect } from 'vitest';
import { buildMethodologySummary } from '../../src/methodology/builder';
import { makeInput, makeDryRunInput, makeSparseInput } from './fixtures';

describe('buildMethodologySummary', () => {
  it('returns a valid MethodologySummary shape', () => {
    const summary = buildMethodologySummary(makeInput());
    expect(summary.version).toBe('1.0.0');
    expect(summary.generatedAt).toBeTruthy();
    expect(new Date(summary.generatedAt).toISOString()).toBe(summary.generatedAt);
  });

  it('includes assumptions array', () => {
    const summary = buildMethodologySummary(makeInput());
    expect(Array.isArray(summary.assumptions)).toBe(true);
    expect(summary.assumptions.length).toBeGreaterThan(0);
  });

  it('includes coverageGaps array', () => {
    const summary = buildMethodologySummary(makeInput());
    expect(Array.isArray(summary.coverageGaps)).toBe(true);
  });

  it('includes 4 confidence assessments', () => {
    const summary = buildMethodologySummary(makeInput());
    expect(summary.confidenceAssessments).toHaveLength(4);
  });

  it('includes overallConfidence and rationale', () => {
    const summary = buildMethodologySummary(makeInput());
    expect(['high', 'medium', 'low', 'very_low']).toContain(summary.overallConfidence);
    expect(summary.overallConfidenceRationale).toBeTruthy();
  });

  it('scanCoverage mirrors input fields', () => {
    const input = makeInput();
    const summary = buildMethodologySummary(input);
    const sc = summary.scanCoverage;
    expect(sc.totalTables).toBe(input.totalTables);
    expect(sc.totalColumns).toBe(input.totalColumns);
    expect(sc.schemaCount).toBe(input.schemaCount);
    expect(sc.checksRun).toBe(input.checksRun);
    expect(sc.checksAvailable).toBe(input.checksAvailable);
    expect(sc.propertiesCovered).toEqual(input.propertiesCovered);
    expect(sc.hasPipelineMapping).toBe(input.hasPipelineMapping);
    expect(sc.hasExternalLineage).toBe(input.hasExternalLineage);
    expect(sc.adapterType).toBe(input.adapterType);
  });

  it('dry-run produces very_low overall confidence', () => {
    const summary = buildMethodologySummary(makeDryRunInput());
    expect(summary.overallConfidence).toBe('very_low');
  });

  it('dry-run has DRY_RUN coverage gap', () => {
    const summary = buildMethodologySummary(makeDryRunInput());
    expect(summary.coverageGaps.some(g => g.id === 'DRY_RUN')).toBe(true);
  });

  it('sparse input produces coverage gaps and lower confidence', () => {
    const summary = buildMethodologySummary(makeSparseInput());
    expect(summary.coverageGaps.length).toBeGreaterThan(0);
    expect(['low', 'very_low']).toContain(summary.overallConfidence);
  });

  it('generatedAt is close to now', () => {
    const before = Date.now();
    const summary = buildMethodologySummary(makeInput());
    const after = Date.now();
    const ts = new Date(summary.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('is deterministic for same input (except generatedAt)', () => {
    const input = makeInput();
    const a = buildMethodologySummary(input);
    const b = buildMethodologySummary(input);
    expect(a.assumptions).toEqual(b.assumptions);
    expect(a.coverageGaps).toEqual(b.coverageGaps);
    expect(a.confidenceAssessments).toEqual(b.confidenceAssessments);
    expect(a.overallConfidence).toBe(b.overallConfidence);
    expect(a.overallConfidenceRationale).toBe(b.overallConfidenceRationale);
  });
});
