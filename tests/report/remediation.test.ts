import { describe, it, expect } from 'vitest';
import { deriveRemediationPriorities, METHOD_LIMITS } from '../../src/report/remediation';
import type { ReportData } from '../../src/report/generator';

// =============================================================================
// Helper: create a minimal finding
// =============================================================================

function makeFinding(overrides: Partial<ReportData['findings'][0]> = {}): ReportData['findings'][0] {
  return {
    checkId: 'test-check',
    property: 1,
    severity: 'major',
    severityColor: '#F39C12',
    title: 'Test Finding',
    description: 'Test description',
    ratio: 0.5,
    ratioPercent: '50.0',
    affectedObjects: 5,
    totalObjects: 10,
    remediation: 'Fix the issue. Then verify it.',
    rawScore: 0.7,
    costCategories: ['dataQuality'],
    assetName: null,
    observedValue: null,
    thresholdValue: null,
    metricUnit: null,
    whatWasFound: null,
    whyItMatters: 'This impacts data quality.',
    confidenceLevel: null,
    confidenceScore: null,
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('deriveRemediationPriorities', () => {
  it('returns items sorted by severity then rawScore', () => {
    const findings = [
      makeFinding({ checkId: 'a', severity: 'major', rawScore: 0.9 }),
      makeFinding({ checkId: 'b', severity: 'critical', rawScore: 0.5 }),
      makeFinding({ checkId: 'c', severity: 'critical', rawScore: 0.8 }),
      makeFinding({ checkId: 'd', severity: 'major', rawScore: 0.6 }),
    ];

    const priorities = deriveRemediationPriorities(findings);
    expect(priorities).toHaveLength(4);
    // Critical first (higher rawScore first within same severity)
    expect(priorities[0].checkId).toBe('c');
    expect(priorities[1].checkId).toBe('b');
    // Then major
    expect(priorities[2].checkId).toBe('a');
    expect(priorities[3].checkId).toBe('d');
  });

  it('filters out minor and info findings', () => {
    const findings = [
      makeFinding({ severity: 'critical', rawScore: 0.9 }),
      makeFinding({ severity: 'minor', rawScore: 0.8 }),
      makeFinding({ severity: 'info', rawScore: 0.7 }),
      makeFinding({ severity: 'major', rawScore: 0.6 }),
    ];

    const priorities = deriveRemediationPriorities(findings);
    expect(priorities).toHaveLength(2);
    expect(priorities[0].severity).toBe('critical');
    expect(priorities[1].severity).toBe('major');
  });

  it('caps at maxItems (default 10)', () => {
    const findings = Array.from({ length: 15 }, (_, i) =>
      makeFinding({ checkId: `check-${i}`, severity: 'critical', rawScore: 0.5 + i * 0.01 }),
    );

    const priorities = deriveRemediationPriorities(findings);
    expect(priorities).toHaveLength(10);
  });

  it('caps at custom maxItems', () => {
    const findings = Array.from({ length: 10 }, (_, i) =>
      makeFinding({ checkId: `check-${i}`, severity: 'critical', rawScore: 0.5 }),
    );

    const priorities = deriveRemediationPriorities(findings, 3);
    expect(priorities).toHaveLength(3);
  });

  it('derives correct effort band for critical high ratio', () => {
    const findings = [
      makeFinding({ severity: 'critical', ratio: 0.6 }),
    ];
    const priorities = deriveRemediationPriorities(findings);
    expect(priorities[0].effortBand).toBe('Major');
    expect(priorities[0].estimatedWeeks).toBe('4-8');
  });

  it('derives correct effort band for critical low ratio', () => {
    const findings = [
      makeFinding({ severity: 'critical', ratio: 0.3 }),
    ];
    const priorities = deriveRemediationPriorities(findings);
    expect(priorities[0].effortBand).toBe('Medium');
    expect(priorities[0].estimatedWeeks).toBe('2-4');
  });

  it('derives correct effort band for major high ratio', () => {
    const findings = [
      makeFinding({ severity: 'major', ratio: 0.4 }),
    ];
    const priorities = deriveRemediationPriorities(findings);
    expect(priorities[0].effortBand).toBe('Medium');
    expect(priorities[0].estimatedWeeks).toBe('2-4');
  });

  it('derives correct effort band for major low ratio', () => {
    const findings = [
      makeFinding({ severity: 'major', ratio: 0.2 }),
    ];
    const priorities = deriveRemediationPriorities(findings);
    expect(priorities[0].effortBand).toBe('Quick Win');
    expect(priorities[0].estimatedWeeks).toBe('1-2');
  });

  it('populates sequencing when property dependency exists', () => {
    // P3 depends on P1. Both have critical findings.
    const findings = [
      makeFinding({ checkId: 'p1', severity: 'critical', property: 1, rawScore: 0.9 }),
      makeFinding({ checkId: 'p3', severity: 'critical', property: 3, rawScore: 0.8 }),
    ];

    const priorities = deriveRemediationPriorities(findings);
    const p3Item = priorities.find((p) => p.checkId === 'p3');
    expect(p3Item?.sequencingNote).toBe('After P1 remediation');

    const p1Item = priorities.find((p) => p.checkId === 'p1');
    expect(p1Item?.sequencingNote).toBeNull();
  });

  it('populates multi-dependency sequencing note', () => {
    // P7 depends on P5, P6. Both have issues.
    const findings = [
      makeFinding({ checkId: 'p5', severity: 'critical', property: 5, rawScore: 0.9 }),
      makeFinding({ checkId: 'p6', severity: 'major', property: 6, rawScore: 0.7 }),
      makeFinding({ checkId: 'p7', severity: 'major', property: 7, rawScore: 0.6 }),
    ];

    const priorities = deriveRemediationPriorities(findings);
    const p7Item = priorities.find((p) => p.checkId === 'p7');
    expect(p7Item?.sequencingNote).toBe('After P5, P6 remediation');
  });

  it('returns empty priorities for empty findings', () => {
    const priorities = deriveRemediationPriorities([]);
    expect(priorities).toEqual([]);
  });

  it('returns empty priorities when all findings are minor/info', () => {
    const findings = [
      makeFinding({ severity: 'minor' }),
      makeFinding({ severity: 'info' }),
    ];
    const priorities = deriveRemediationPriorities(findings);
    expect(priorities).toEqual([]);
  });

  it('extracts first sentence as actionText', () => {
    const findings = [
      makeFinding({
        severity: 'critical',
        remediation: 'Implement primary keys on all tables. This will improve data integrity.',
      }),
    ];
    const priorities = deriveRemediationPriorities(findings);
    expect(priorities[0].actionText).toBe('Implement primary keys on all tables.');
  });

  it('uses whyItMatters for businessImpact when available', () => {
    const findings = [
      makeFinding({
        severity: 'critical',
        whyItMatters: 'Increases compliance risk',
        description: 'fallback description',
      }),
    ];
    const priorities = deriveRemediationPriorities(findings);
    expect(priorities[0].businessImpact).toBe('Increases compliance risk');
  });

  it('falls back to description for businessImpact', () => {
    const findings = [
      makeFinding({
        severity: 'critical',
        whyItMatters: null,
        description: 'Missing primary keys detected',
      }),
    ];
    const priorities = deriveRemediationPriorities(findings);
    expect(priorities[0].businessImpact).toBe('Missing primary keys detected');
  });

  it('assigns correct ranks starting from 1', () => {
    const findings = [
      makeFinding({ checkId: 'a', severity: 'critical', rawScore: 0.9 }),
      makeFinding({ checkId: 'b', severity: 'major', rawScore: 0.7 }),
    ];
    const priorities = deriveRemediationPriorities(findings);
    expect(priorities[0].rank).toBe(1);
    expect(priorities[1].rank).toBe(2);
  });

  it('includes propertyName from canonical map', () => {
    const findings = [
      makeFinding({ severity: 'critical', property: 5 }),
    ];
    const priorities = deriveRemediationPriorities(findings);
    expect(priorities[0].propertyName).toBe('Schema Governance');
  });
});

describe('METHOD_LIMITS', () => {
  it('is a non-empty string array', () => {
    expect(METHOD_LIMITS).toBeInstanceOf(Array);
    expect(METHOD_LIMITS.length).toBeGreaterThan(0);
    for (const limit of METHOD_LIMITS) {
      expect(typeof limit).toBe('string');
      expect(limit.length).toBeGreaterThan(0);
    }
  });
});
