import { describe, it, expect } from 'vitest';
import { deriveCoverageGaps } from '../../src/methodology/coverage-gaps';
import { makeInput, makeDryRunInput } from './fixtures';

describe('deriveCoverageGaps', () => {
  it('returns an array of coverage gaps', () => {
    const result = deriveCoverageGaps(makeInput());
    expect(Array.isArray(result)).toBe(true);
  });

  it('every record has required fields', () => {
    const result = deriveCoverageGaps(makeDryRunInput());
    for (const g of result) {
      expect(g.id).toBeTruthy();
      expect(g.category).toBeTruthy();
      expect(g.description).toBeTruthy();
      expect(g.impact).toBeTruthy();
      expect(g.mitigationHint).toBeTruthy();
    }
  });

  it('has unique IDs', () => {
    const result = deriveCoverageGaps(makeDryRunInput());
    const ids = result.map(g => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // --- DRY_RUN ---
  it('fires DRY_RUN gap for dry-run scans', () => {
    const result = deriveCoverageGaps(makeDryRunInput());
    expect(result.some(g => g.id === 'DRY_RUN')).toBe(true);
  });

  it('does NOT fire DRY_RUN for real scans', () => {
    const result = deriveCoverageGaps(makeInput());
    expect(result.some(g => g.id === 'DRY_RUN')).toBe(false);
  });

  // --- NO_LINEAGE ---
  it('fires NO_LINEAGE when pipeline mapping is absent', () => {
    const input = makeInput({ hasPipelineMapping: false });
    const result = deriveCoverageGaps(input);
    expect(result.some(g => g.id === 'NO_LINEAGE')).toBe(true);
  });

  it('does NOT fire NO_LINEAGE when pipeline mapping is present', () => {
    const result = deriveCoverageGaps(makeInput());
    expect(result.some(g => g.id === 'NO_LINEAGE')).toBe(false);
  });

  // --- NO_EXTERNAL_LINEAGE ---
  it('fires NO_EXTERNAL_LINEAGE when external lineage is absent', () => {
    const result = deriveCoverageGaps(makeInput({ hasExternalLineage: false }));
    expect(result.some(g => g.id === 'NO_EXTERNAL_LINEAGE')).toBe(true);
  });

  it('does NOT fire NO_EXTERNAL_LINEAGE when external lineage is present', () => {
    const result = deriveCoverageGaps(makeInput({ hasExternalLineage: true }));
    expect(result.some(g => g.id === 'NO_EXTERNAL_LINEAGE')).toBe(false);
  });

  // --- PARTIAL_SCAN ---
  it('fires PARTIAL_SCAN when some checks were not run on non-trivial schema', () => {
    const input = makeInput({ checksRun: 15, checksAvailable: 21, totalTables: 50 });
    const result = deriveCoverageGaps(input);
    expect(result.some(g => g.id === 'PARTIAL_SCAN')).toBe(true);
  });

  it('does NOT fire PARTIAL_SCAN when all checks ran', () => {
    const input = makeInput({ checksRun: 21, checksAvailable: 21 });
    const result = deriveCoverageGaps(input);
    expect(result.some(g => g.id === 'PARTIAL_SCAN')).toBe(false);
  });

  it('does NOT fire PARTIAL_SCAN on small schemas (<10 tables)', () => {
    const input = makeInput({ checksRun: 10, checksAvailable: 21, totalTables: 5 });
    const result = deriveCoverageGaps(input);
    expect(result.some(g => g.id === 'PARTIAL_SCAN')).toBe(false);
  });

  // --- SPARSE_EVIDENCE ---
  it('fires SPARSE_EVIDENCE when evidence ratio is below 80%', () => {
    const input = makeInput({ totalHighSeverity: 10, highSeverityWithEvidence: 5 });
    const result = deriveCoverageGaps(input);
    expect(result.some(g => g.id === 'SPARSE_EVIDENCE')).toBe(true);
  });

  it('does NOT fire SPARSE_EVIDENCE when evidence ratio is >= 80%', () => {
    const input = makeInput({ totalHighSeverity: 10, highSeverityWithEvidence: 9 });
    const result = deriveCoverageGaps(input);
    expect(result.some(g => g.id === 'SPARSE_EVIDENCE')).toBe(false);
  });

  it('does NOT fire SPARSE_EVIDENCE when there are no high-severity findings', () => {
    const input = makeInput({ totalHighSeverity: 0, highSeverityWithEvidence: 0 });
    const result = deriveCoverageGaps(input);
    expect(result.some(g => g.id === 'SPARSE_EVIDENCE')).toBe(false);
  });

  // --- NAMING_HEURISTICS ---
  it('fires NAMING_HEURISTICS when CDE uses naming-heuristic', () => {
    const result = deriveCoverageGaps(makeInput()); // fixture uses naming-heuristic
    expect(result.some(g => g.id === 'NAMING_HEURISTICS')).toBe(true);
  });

  it('does NOT fire NAMING_HEURISTICS when CDE uses client-registry', () => {
    const input = makeInput({
      criticalityContext: {
        ...makeInput().criticalityContext,
        cdeIdentificationMethod: 'client-registry',
      },
    });
    const result = deriveCoverageGaps(input);
    expect(result.some(g => g.id === 'NAMING_HEURISTICS')).toBe(false);
  });

  // --- LIMITED_CROSS_SYSTEM ---
  it('fires LIMITED_CROSS_SYSTEM when no pipeline and no external lineage', () => {
    const input = makeInput({ hasPipelineMapping: false, hasExternalLineage: false });
    const result = deriveCoverageGaps(input);
    expect(result.some(g => g.id === 'LIMITED_CROSS_SYSTEM')).toBe(true);
  });

  it('does NOT fire LIMITED_CROSS_SYSTEM when pipeline is present', () => {
    const result = deriveCoverageGaps(makeInput());
    expect(result.some(g => g.id === 'LIMITED_CROSS_SYSTEM')).toBe(false);
  });

  // --- SMALL_SCHEMA ---
  it('fires SMALL_SCHEMA for < 10 tables', () => {
    const input = makeInput({ totalTables: 5 });
    const result = deriveCoverageGaps(input);
    expect(result.some(g => g.id === 'SMALL_SCHEMA')).toBe(true);
  });

  it('does NOT fire SMALL_SCHEMA for >= 10 tables', () => {
    const result = deriveCoverageGaps(makeInput());
    expect(result.some(g => g.id === 'SMALL_SCHEMA')).toBe(false);
  });

  // --- NO_CRITICALITY ---
  it('fires NO_CRITICALITY when criticality was not run', () => {
    const input = makeInput({
      criticalityContext: {
        wasRun: false, totalAssetsAssessed: 0, signalTypesUsed: 0,
        cdeIdentificationMethod: 'none', tierDistribution: {},
      },
    });
    const result = deriveCoverageGaps(input);
    expect(result.some(g => g.id === 'NO_CRITICALITY')).toBe(true);
  });

  it('does NOT fire NO_CRITICALITY when criticality was run', () => {
    const result = deriveCoverageGaps(makeInput());
    expect(result.some(g => g.id === 'NO_CRITICALITY')).toBe(false);
  });
});
