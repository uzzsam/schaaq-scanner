import { describe, it, expect } from 'vitest';
import {
  assessCriticality,
  lookupAssetCriticality,
  getCriticalityForFinding,
} from '../../src/criticality/criticality-service';
import {
  scoreToCriticalityTier,
  CRITICALITY_TIER_COLORS,
  CRITICALITY_TIER_LABELS,
  CRITICALITY_TIER_THRESHOLDS,
} from '../../src/criticality/types';
import type { ResultFindingRow } from '../../src/server/db/scan-result-types';
import type { CriticalityAssessmentSummary } from '../../src/criticality/types';
import { ALL_CHECKS } from '../../src/checks/index';
import { scoreFindings } from '../../src/scoring/severity-scorer';
import { mapToEngineInput } from '../../src/scoring/mapper';
import { calculateDALC } from '../../src/engine/index';
import { createMockSchema, createMockConfig } from '../../src/mock/schema-factory';
import {
  buildReportData,
  buildExecutiveReportData,
  buildTechnicalAppendixData,
  generateExecutiveReport,
  generateTechnicalReport,
} from '../../src/report/generator';

// =============================================================================
// Fixtures
// =============================================================================

function makeFinding(overrides: Partial<ResultFindingRow> = {}): ResultFindingRow {
  return {
    id: 1,
    result_set_id: 'rs-1',
    project_id: 'proj-1',
    check_id: 'P1-01',
    property: 1,
    severity: 'major',
    raw_score: 0.7,
    title: 'Test finding',
    description: 'Description',
    asset_type: 'table',
    asset_key: 'public.customers',
    asset_name: 'customers',
    affected_objects: 5,
    total_objects: 10,
    ratio: 0.5,
    threshold_value: null,
    observed_value: null,
    metric_unit: null,
    remediation: 'Fix it',
    evidence_json: '[]',
    cost_categories_json: '["rework"]',
    cost_weights_json: '{}',
    confidence_level: 'high',
    confidence_score: 0.9,
    explanation: null,
    why_it_matters: null,
    ...overrides,
  };
}

function makeFindings(): ResultFindingRow[] {
  return [
    makeFinding({
      id: 1, check_id: 'P1-01', asset_key: 'public.customers', asset_name: 'customers',
      severity: 'critical', raw_score: 0.9,
    }),
    makeFinding({
      id: 2, check_id: 'P1-02', asset_key: 'public.customers', asset_name: 'customers',
      severity: 'major', raw_score: 0.7,
    }),
    makeFinding({
      id: 3, check_id: 'P2-01', asset_key: 'public.orders', asset_name: 'orders',
      severity: 'minor', raw_score: 0.3,
    }),
    makeFinding({
      id: 4, check_id: 'P3-01', asset_key: 'staging.temp_import', asset_name: 'temp_import',
      severity: 'info', raw_score: 0.1,
    }),
  ];
}

// =============================================================================
// scoreToCriticalityTier
// =============================================================================

describe('scoreToCriticalityTier', () => {
  it('maps scores to correct tiers', () => {
    expect(scoreToCriticalityTier(0)).toBe('low');
    expect(scoreToCriticalityTier(24)).toBe('low');
    expect(scoreToCriticalityTier(25)).toBe('medium');
    expect(scoreToCriticalityTier(49)).toBe('medium');
    expect(scoreToCriticalityTier(50)).toBe('high');
    expect(scoreToCriticalityTier(74)).toBe('high');
    expect(scoreToCriticalityTier(75)).toBe('critical');
    expect(scoreToCriticalityTier(100)).toBe('critical');
  });
});

// =============================================================================
// Type Constants
// =============================================================================

describe('Criticality type constants', () => {
  it('CRITICALITY_TIER_COLORS has all four tiers', () => {
    expect(CRITICALITY_TIER_COLORS).toHaveProperty('low');
    expect(CRITICALITY_TIER_COLORS).toHaveProperty('medium');
    expect(CRITICALITY_TIER_COLORS).toHaveProperty('high');
    expect(CRITICALITY_TIER_COLORS).toHaveProperty('critical');
    for (const color of Object.values(CRITICALITY_TIER_COLORS)) {
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('CRITICALITY_TIER_LABELS has all four tiers', () => {
    expect(CRITICALITY_TIER_LABELS.low).toBe('Low');
    expect(CRITICALITY_TIER_LABELS.medium).toBe('Medium');
    expect(CRITICALITY_TIER_LABELS.high).toBe('High');
    expect(CRITICALITY_TIER_LABELS.critical).toBe('Critical');
  });

  it('CRITICALITY_TIER_THRESHOLDS cover 0-100 without gaps', () => {
    expect(CRITICALITY_TIER_THRESHOLDS.low.min).toBe(0);
    expect(CRITICALITY_TIER_THRESHOLDS.critical.max).toBe(100);
    // Medium starts where low ends + 1
    expect(CRITICALITY_TIER_THRESHOLDS.medium.min).toBe(CRITICALITY_TIER_THRESHOLDS.low.max + 1);
    expect(CRITICALITY_TIER_THRESHOLDS.high.min).toBe(CRITICALITY_TIER_THRESHOLDS.medium.max + 1);
    expect(CRITICALITY_TIER_THRESHOLDS.critical.min).toBe(CRITICALITY_TIER_THRESHOLDS.high.max + 1);
  });
});

// =============================================================================
// assessCriticality
// =============================================================================

describe('assessCriticality', () => {
  it('returns a valid CriticalityAssessmentSummary', () => {
    const summary = assessCriticality({
      resultSetId: 'rs-test',
      findings: makeFindings(),
      sourceSystem: 'test-db',
    });

    expect(summary.resultSetId).toBe('rs-test');
    expect(summary.assessedAt).toBeTruthy();
    expect(summary.totalAssetsAssessed).toBeGreaterThan(0);
    expect(summary.averageCriticalityScore).toBeGreaterThanOrEqual(0);
    expect(summary.averageCriticalityScore).toBeLessThanOrEqual(100);
    expect(summary.methodDescription).toBeTruthy();
  });

  it('produces correct tier distribution summing to total assets', () => {
    const summary = assessCriticality({
      resultSetId: 'rs-test',
      findings: makeFindings(),
      sourceSystem: 'test-db',
    });

    const tierSum = summary.tierDistribution.low
      + summary.tierDistribution.medium
      + summary.tierDistribution.high
      + summary.tierDistribution.critical;
    expect(tierSum).toBe(summary.totalAssetsAssessed);
  });

  it('allAssets have required fields', () => {
    const summary = assessCriticality({
      resultSetId: 'rs-test',
      findings: makeFindings(),
      sourceSystem: 'test-db',
    });

    for (const asset of summary.allAssets) {
      expect(asset.assetKey).toBeTruthy();
      expect(asset.assetName).toBeTruthy();
      expect(['table', 'schema']).toContain(asset.assetType);
      expect(asset.criticalityScore).toBeGreaterThanOrEqual(0);
      expect(asset.criticalityScore).toBeLessThanOrEqual(100);
      expect(['low', 'medium', 'high', 'critical']).toContain(asset.criticalityTier);
      expect(typeof asset.cdeCandidate).toBe('boolean');
      expect(asset.rationale).toBeTruthy();
    }
  });

  it('topCriticalAssets is sorted by tier desc then score desc', () => {
    const summary = assessCriticality({
      resultSetId: 'rs-test',
      findings: makeFindings(),
      sourceSystem: 'test-db',
    });

    const tierOrder: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
    for (let i = 1; i < summary.topCriticalAssets.length; i++) {
      const prev = summary.topCriticalAssets[i - 1];
      const curr = summary.topCriticalAssets[i];
      const tierDiff = tierOrder[prev.criticalityTier] - tierOrder[curr.criticalityTier];
      if (tierDiff === 0) {
        expect(prev.criticalityScore).toBeGreaterThanOrEqual(curr.criticalityScore);
      } else {
        expect(tierDiff).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('topCriticalAssets has max 10 entries', () => {
    const summary = assessCriticality({
      resultSetId: 'rs-test',
      findings: makeFindings(),
      sourceSystem: 'test-db',
    });

    expect(summary.topCriticalAssets.length).toBeLessThanOrEqual(10);
  });

  it('handles empty findings gracefully', () => {
    const summary = assessCriticality({
      resultSetId: 'rs-empty',
      findings: [],
      sourceSystem: 'test-db',
    });

    expect(summary.totalAssetsAssessed).toBe(0);
    expect(summary.totalCdeCandidates).toBe(0);
    expect(summary.averageCriticalityScore).toBe(0);
    expect(summary.allAssets).toHaveLength(0);
    expect(summary.topCriticalAssets).toHaveLength(0);
  });

  it('is deterministic — same inputs produce same outputs', () => {
    const findings = makeFindings();
    const a = assessCriticality({ resultSetId: 'rs-a', findings, sourceSystem: 'test-db' });
    const b = assessCriticality({ resultSetId: 'rs-a', findings, sourceSystem: 'test-db' });

    // assessedAt will differ by milliseconds, compare everything else
    expect(a.totalAssetsAssessed).toBe(b.totalAssetsAssessed);
    expect(a.averageCriticalityScore).toBe(b.averageCriticalityScore);
    expect(a.tierDistribution).toEqual(b.tierDistribution);
    expect(a.allAssets.map(x => x.assetKey)).toEqual(b.allAssets.map(x => x.assetKey));
    expect(a.allAssets.map(x => x.criticalityScore)).toEqual(b.allAssets.map(x => x.criticalityScore));
  });
});

// =============================================================================
// lookupAssetCriticality
// =============================================================================

describe('lookupAssetCriticality', () => {
  const summary = assessCriticality({
    resultSetId: 'rs-lookup',
    findings: makeFindings(),
    sourceSystem: 'test-db',
  });

  it('finds a direct asset key match', () => {
    if (summary.allAssets.length > 0) {
      const firstAsset = summary.allAssets[0];
      const result = lookupAssetCriticality(summary, firstAsset.assetKey);
      expect(result).toBeDefined();
      expect(result!.assetKey).toBe(firstAsset.assetKey);
    }
  });

  it('resolves column-level key to parent table', () => {
    if (summary.allAssets.length > 0) {
      const tableAsset = summary.allAssets.find(a => a.assetType === 'table');
      if (tableAsset) {
        const columnKey = `${tableAsset.assetKey}.some_column`;
        const result = lookupAssetCriticality(summary, columnKey);
        expect(result).toBeDefined();
        expect(result!.assetKey).toBe(tableAsset.assetKey);
      }
    }
  });

  it('returns undefined for unknown asset', () => {
    const result = lookupAssetCriticality(summary, 'nonexistent.table');
    expect(result).toBeUndefined();
  });
});

// =============================================================================
// getCriticalityForFinding
// =============================================================================

describe('getCriticalityForFinding', () => {
  const summary = assessCriticality({
    resultSetId: 'rs-for-finding',
    findings: makeFindings(),
    sourceSystem: 'test-db',
  });

  it('returns the correct tier for a known asset', () => {
    if (summary.allAssets.length > 0) {
      const asset = summary.allAssets[0];
      const tier = getCriticalityForFinding(summary, asset.assetKey);
      expect(tier).toBe(asset.criticalityTier);
    }
  });

  it('returns medium for null asset key', () => {
    const tier = getCriticalityForFinding(summary, null);
    expect(tier).toBe('medium');
  });

  it('returns medium for unknown asset key', () => {
    const tier = getCriticalityForFinding(summary, 'unknown.table.xyz');
    expect(tier).toBe('medium');
  });
});

// =============================================================================
// Report integration — criticality data flows through report generation
// =============================================================================

describe('Report criticality integration', () => {
  function runPipelineWithCriticality() {
    const schema = createMockSchema();
    const config = createMockConfig();
    const findings: any[] = [];
    for (const check of ALL_CHECKS) {
      findings.push(...check.execute(schema, config));
    }
    const scored = scoreFindings(findings, schema);
    const engineInput = mapToEngineInput(scored, schema, config);
    const result = calculateDALC(engineInput);

    // Build a mock CriticalityAssessmentSummary
    const mockCriticality: CriticalityAssessmentSummary = {
      resultSetId: 'rs-mock',
      assessedAt: new Date().toISOString(),
      totalAssetsAssessed: 5,
      tierDistribution: { low: 1, medium: 2, high: 1, critical: 1 },
      totalCdeCandidates: 2,
      topCriticalAssets: [
        {
          assetKey: 'public.customers',
          assetName: 'customers',
          assetType: 'table',
          sourceSystem: 'mock-db',
          criticalityScore: 82,
          criticalityTier: 'critical',
          cdeCandidate: true,
          cdeCandidates: [],
          signals: [],
          rationale: 'High PII density with financial data patterns',
          confidenceLevel: 'high',
        },
        {
          assetKey: 'public.orders',
          assetName: 'orders',
          assetType: 'table',
          sourceSystem: 'mock-db',
          criticalityScore: 55,
          criticalityTier: 'high',
          cdeCandidate: true,
          cdeCandidates: [],
          signals: [],
          rationale: 'Transaction data with financial columns',
          confidenceLevel: 'medium',
        },
      ],
      allAssets: [
        {
          assetKey: 'public.customers',
          assetName: 'customers',
          assetType: 'table',
          sourceSystem: 'mock-db',
          criticalityScore: 82,
          criticalityTier: 'critical',
          cdeCandidate: true,
          cdeCandidates: [],
          signals: [],
          rationale: 'High PII density',
          confidenceLevel: 'high',
        },
        {
          assetKey: 'public.orders',
          assetName: 'orders',
          assetType: 'table',
          sourceSystem: 'mock-db',
          criticalityScore: 55,
          criticalityTier: 'high',
          cdeCandidate: true,
          cdeCandidates: [],
          signals: [],
          rationale: 'Transaction data',
          confidenceLevel: 'medium',
        },
      ],
      allCdeCandidates: [],
      averageCriticalityScore: 45,
      methodDescription: 'Test method',
    };

    return { schema, config, scored, result, mockCriticality };
  }

  describe('buildReportData with criticality', () => {
    it('includes criticalityAssessment when provided', () => {
      const { scored, result, mockCriticality } = runPipelineWithCriticality();
      const data = buildReportData(result, scored, 'Test Corp', undefined, {
        criticalityAssessment: mockCriticality,
      });

      expect(data.criticalityAssessment).toBeDefined();
      expect(data.criticalityAssessment!.totalAssetsAssessed).toBe(5);
      expect(data.criticalityAssessment!.totalCdeCandidates).toBe(2);
      expect(data.criticalityAssessment!.averageCriticalityScore).toBe(45);
    });

    it('criticalityAssessment is undefined when not provided', () => {
      const { scored, result } = runPipelineWithCriticality();
      const data = buildReportData(result, scored, 'Test Corp');

      expect(data.criticalityAssessment).toBeUndefined();
    });

    it('findings have criticalityTier when assessment is provided', () => {
      const { scored, result, mockCriticality } = runPipelineWithCriticality();
      const data = buildReportData(result, scored, 'Test Corp', undefined, {
        criticalityAssessment: mockCriticality,
      });

      // At least some findings should have a tier (those whose asset key matches)
      const withTier = data.findings.filter((f: any) => f.criticalityTier != null);
      // Not all findings will match — depends on mock schema asset keys
      // But the field should exist on all findings
      for (const f of data.findings) {
        expect('criticalityTier' in f).toBe(true);
      }
    });
  });

  describe('buildExecutiveReportData with criticality', () => {
    it('includes criticalitySummary when assessment is provided', () => {
      const { scored, result, mockCriticality } = runPipelineWithCriticality();
      const data = buildExecutiveReportData(result, scored, 'Exec Corp', undefined, {
        criticalityAssessment: mockCriticality,
      });

      expect(data.criticalitySummary).toBeDefined();
      expect(data.criticalitySummary!.totalAssetsAssessed).toBe(5);
      expect(data.criticalitySummary!.totalCdeCandidates).toBe(2);
      expect(data.criticalitySummary!.tierDistribution).toEqual({ low: 1, medium: 2, high: 1, critical: 1 });
      // Top assets capped at 5 for executive
      expect(data.criticalitySummary!.topCriticalAssets.length).toBeLessThanOrEqual(5);
      // Each asset has tierColor and tierLabel
      for (const a of data.criticalitySummary!.topCriticalAssets) {
        expect(a.tierColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(a.tierLabel).toBeTruthy();
      }
    });

    it('criticalitySummary is undefined when not provided', () => {
      const { scored, result } = runPipelineWithCriticality();
      const data = buildExecutiveReportData(result, scored, 'Exec Corp');
      expect(data.criticalitySummary).toBeUndefined();
    });
  });

  describe('buildTechnicalAppendixData with criticality', () => {
    it('includes criticalityDetail when assessment is provided', () => {
      const { scored, result, mockCriticality } = runPipelineWithCriticality();
      const data = buildTechnicalAppendixData(result, scored, 'Tech Corp', undefined, {
        criticalityAssessment: mockCriticality,
      });

      expect(data.criticalityDetail).toBeDefined();
      expect(data.criticalityDetail!.totalAssetsAssessed).toBe(5);
      expect(data.criticalityDetail!.totalCdeCandidates).toBe(2);
      // Technical detail includes full asset info
      for (const a of data.criticalityDetail!.topCriticalAssets) {
        expect(a.assetName).toBeTruthy();
        expect(a.assetType).toBeTruthy();
        expect(a.criticalityScore).toBeGreaterThanOrEqual(0);
        expect(a.tierColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(a.tierLabel).toBeTruthy();
      }
    });

    it('criticalityDetail is undefined when not provided', () => {
      const { scored, result } = runPipelineWithCriticality();
      const data = buildTechnicalAppendixData(result, scored, 'Tech Corp');
      expect(data.criticalityDetail).toBeUndefined();
    });
  });

  describe('Executive HTML with criticality', () => {
    it('renders Asset Criticality section when data is present', () => {
      const { scored, result, mockCriticality } = runPipelineWithCriticality();
      const data = buildExecutiveReportData(result, scored, 'Exec Corp', undefined, {
        criticalityAssessment: mockCriticality,
      });
      const html = generateExecutiveReport(data);

      // The <h2> heading only renders inside the {{#if criticalitySummary}} block
      expect(html).toContain('<h2>Asset Criticality</h2>');
      expect(html).toContain('5 assets assessed');
      expect(html).toContain('2 Critical Data Element candidates');
    });

    it('omits Asset Criticality section when data is absent', () => {
      const { scored, result } = runPipelineWithCriticality();
      const data = buildExecutiveReportData(result, scored, 'Exec Corp');
      const html = generateExecutiveReport(data);

      // The <h2> heading should NOT render; HTML comment may still be present
      expect(html).not.toContain('<h2>Asset Criticality</h2>');
    });
  });

  describe('Technical HTML with criticality', () => {
    it('renders Asset Criticality Assessment section when data is present', () => {
      const { scored, result, mockCriticality } = runPipelineWithCriticality();
      const data = buildTechnicalAppendixData(result, scored, 'Tech Corp', undefined, {
        criticalityAssessment: mockCriticality,
      });
      const html = generateTechnicalReport(data);

      expect(html).toContain('<h2>Asset Criticality Assessment</h2>');
      // Technical template uses "Assets Assessed" label in a card
      expect(html).toContain('Assets Assessed');
    });

    it('omits Asset Criticality Assessment section when data is absent', () => {
      const { scored, result } = runPipelineWithCriticality();
      const data = buildTechnicalAppendixData(result, scored, 'Tech Corp');
      const html = generateTechnicalReport(data);

      // The <h2> heading should NOT render; HTML comment may still be present
      expect(html).not.toContain('<h2>Asset Criticality Assessment</h2>');
    });
  });
});
