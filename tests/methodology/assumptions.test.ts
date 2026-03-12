import { describe, it, expect } from 'vitest';
import { classifyAssumptions } from '../../src/methodology/assumptions';
import { makeInput, makeDryRunInput } from './fixtures';

describe('classifyAssumptions', () => {
  it('returns a non-empty array for a standard scan', () => {
    const result = classifyAssumptions(makeInput());
    expect(result.length).toBeGreaterThan(10);
  });

  it('every record has required fields', () => {
    const result = classifyAssumptions(makeInput());
    for (const r of result) {
      expect(r.id).toBeTruthy();
      expect(r.category).toBeTruthy();
      expect(r.assumption).toBeTruthy();
      expect(['empirical', 'expert_estimated', 'client_configured', 'inferred', 'system_default']).toContain(r.sourceType);
      expect(['high', 'medium', 'low']).toContain(r.materialityLevel);
      expect(r.currentValue).toBeDefined();
      expect(Array.isArray(r.affectedOutputs)).toBe(true);
    }
  });

  it('has unique IDs', () => {
    const result = classifyAssumptions(makeInput());
    const ids = result.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('includes DALC assumptions', () => {
    const result = classifyAssumptions(makeInput());
    const dalcIds = result.filter(r => r.id.startsWith('DALC_'));
    expect(dalcIds.length).toBeGreaterThanOrEqual(5);
  });

  it('includes W matrix assumptions', () => {
    const result = classifyAssumptions(makeInput());
    expect(result.some(r => r.id === 'W_MATRIX_SOURCING')).toBe(true);
    expect(result.some(r => r.id === 'W_MATRIX_SECTOR_DEFAULT')).toBe(true);
  });

  it('includes detection threshold assumptions', () => {
    const result = classifyAssumptions(makeInput());
    expect(result.some(r => r.id === 'THRESHOLD_ENTITY_SIMILARITY')).toBe(true);
    expect(result.some(r => r.id === 'THRESHOLD_NULL_RATE')).toBe(true);
  });

  it('includes criticality assumptions when criticality was run', () => {
    const result = classifyAssumptions(makeInput());
    expect(result.some(r => r.id === 'CRITICALITY_TIER_THRESHOLDS')).toBe(true);
    expect(result.some(r => r.id === 'CRITICALITY_SIGNAL_TYPES')).toBe(true);
  });

  it('excludes criticality assumptions when criticality was NOT run', () => {
    const input = makeInput({
      criticalityContext: {
        wasRun: false, totalAssetsAssessed: 0, signalTypesUsed: 0,
        cdeIdentificationMethod: 'none', tierDistribution: {},
      },
    });
    const result = classifyAssumptions(input);
    expect(result.some(r => r.id === 'CRITICALITY_TIER_THRESHOLDS')).toBe(false);
  });

  it('marks DALC canonical investment as client_configured when overridden', () => {
    const input = makeInput({
      configuredThresholds: { canonicalInvestmentAUD: 2_500_000 },
    });
    const result = classifyAssumptions(input);
    const dalc = result.find(r => r.id === 'DALC_CANONICAL_INVESTMENT')!;
    expect(dalc.sourceType).toBe('client_configured');
    expect(dalc.currentValue).toBe('2500000');
  });

  it('marks thresholds as system_default when NOT overridden', () => {
    const result = classifyAssumptions(makeInput());
    const ent = result.find(r => r.id === 'THRESHOLD_ENTITY_SIMILARITY')!;
    expect(ent.sourceType).toBe('system_default');
  });

  it('adds DRY_RUN_MOCK_DATA assumption for dry runs', () => {
    const result = classifyAssumptions(makeDryRunInput());
    const mock = result.find(r => r.id === 'DRY_RUN_MOCK_DATA');
    expect(mock).toBeDefined();
    expect(mock!.materialityLevel).toBe('high');
  });

  it('adds NO_PIPELINE_MAPPING assumption when pipeline missing', () => {
    const input = makeInput({ hasPipelineMapping: false });
    const result = classifyAssumptions(input);
    expect(result.some(r => r.id === 'NO_PIPELINE_MAPPING')).toBe(true);
  });

  it('does NOT add NO_PIPELINE_MAPPING when pipeline is present', () => {
    const result = classifyAssumptions(makeInput());
    expect(result.some(r => r.id === 'NO_PIPELINE_MAPPING')).toBe(false);
  });

  it('includes remediation assumptions', () => {
    const result = classifyAssumptions(makeInput());
    expect(result.some(r => r.id === 'REMEDIATION_PRIORITY_WEIGHTS')).toBe(true);
    expect(result.some(r => r.id === 'REMEDIATION_EFFORT_BANDS')).toBe(true);
  });

  it('has at least one high-materiality assumption', () => {
    const result = classifyAssumptions(makeInput());
    expect(result.some(r => r.materialityLevel === 'high')).toBe(true);
  });

  it('categories include expected groups', () => {
    const result = classifyAssumptions(makeInput());
    const cats = new Set(result.map(r => r.category));
    expect(cats.has('economic_model')).toBe(true);
    expect(cats.has('detection_thresholds')).toBe(true);
    expect(cats.has('criticality')).toBe(true);
    expect(cats.has('remediation')).toBe(true);
  });
});
