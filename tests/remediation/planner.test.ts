import { describe, it, expect } from 'vitest';
import {
  buildRemediationPlan,
  rankRemediationActions,
  groupFindingsIntoActions,
} from '../../src/remediation/planner';
import type { ParsedFinding } from '../../src/remediation/planner';
import type { RemediationAction } from '../../src/remediation/types';

// =============================================================================
// Helper: create a minimal ParsedFinding
// =============================================================================

function makeParsedFinding(overrides: Partial<ParsedFinding> = {}): ParsedFinding {
  return {
    id: 1,
    result_set_id: 'rs-test',
    project_id: 'proj-test',
    check_id: 'p5-missing-pk',
    property: 5,
    severity: 'major',
    raw_score: 0.7,
    title: 'Missing Primary Keys',
    description: 'Tables lack primary keys',
    asset_type: 'table',
    asset_key: 'public.orders',
    asset_name: 'orders',
    affected_objects: 5,
    total_objects: 20,
    ratio: 0.25,
    threshold_value: null,
    observed_value: null,
    metric_unit: null,
    remediation: 'Add primary keys to all tables.',
    evidence_json: '[]',
    cost_categories_json: '["dataQuality","firefighting"]',
    cost_weights_json: '{"dataQuality":0.5,"firefighting":0.5}',
    confidence_level: 'high',
    confidence_score: 0.9,
    explanation: null,
    why_it_matters: 'PK absence breaks deduplication',
    costCategories: ['dataQuality', 'firefighting'],
    costWeights: { dataQuality: 0.5, firefighting: 0.5 },
    ...overrides,
  };
}

function makePlanInput(findings: ParsedFinding[]) {
  return {
    resultSetId: 'rs-test',
    findings,
    dalcLowUsd: 70_000,
    dalcBaseUsd: 100_000,
    dalcHighUsd: 140_000,
  };
}

// =============================================================================
// groupFindingsIntoActions
// =============================================================================

describe('groupFindingsIntoActions', () => {
  it('groups findings by their theme mapping', () => {
    const findings = [
      makeParsedFinding({ id: 1, check_id: 'p5-missing-pk' }),        // entity-integrity
      makeParsedFinding({ id: 2, check_id: 'p5-naming-violations' }), // semantic-standardisation
      makeParsedFinding({ id: 3, check_id: 'p6-no-indexes' }),        // entity-integrity
    ];

    const groups = groupFindingsIntoActions(findings, 'rs-test');
    expect(groups.size).toBe(2);
    expect(groups.get('entity-integrity')?.length).toBe(2);
    expect(groups.get('semantic-standardisation')?.length).toBe(1);
  });

  it('skips findings with unmapped check IDs', () => {
    const findings = [
      makeParsedFinding({ check_id: 'UNKNOWN-CHECK' }),
    ];

    const groups = groupFindingsIntoActions(findings, 'rs-test');
    expect(groups.size).toBe(0);
  });

  it('handles case-insensitive check ID matching', () => {
    const findings = [
      makeParsedFinding({ check_id: 'P1-SEMANTIC-IDENTITY' }),
      makeParsedFinding({ check_id: 'p1-semantic-identity' }),
    ];

    const groups = groupFindingsIntoActions(findings, 'rs-test');
    // P1-SEMANTIC-IDENTITY maps to entity-integrity; lowercase also matches via .toUpperCase()
    expect(groups.get('entity-integrity')?.length).toBe(2);
  });

  it('returns empty map for empty findings', () => {
    const groups = groupFindingsIntoActions([], 'rs-test');
    expect(groups.size).toBe(0);
  });
});

// =============================================================================
// rankRemediationActions
// =============================================================================

describe('rankRemediationActions', () => {
  function makeAction(overrides: Partial<RemediationAction> = {}): RemediationAction {
    return {
      id: 'action-test',
      resultSetId: 'rs-test',
      title: 'Test Action',
      description: 'desc',
      rationale: 'rationale',
      theme: 'entity-integrity',
      relatedFindingIds: ['1'],
      relatedFindingCodes: ['p5-missing-pk'],
      affectedAssets: 5,
      priorityRank: 0,
      priorityScore: 50,
      severityWeight: 3,
      estimatedImpactUsd: { low: 7000, base: 10000, high: 14000 },
      effortBand: 'M',
      likelyOwnerType: 'data-architect',
      sequenceGroup: 1,
      blockedByActionIds: [],
      quickWin: false,
      confidenceLevel: 'medium',
      explanation: 'test',
      ...overrides,
    };
  }

  it('ranks by priorityScore descending', () => {
    const actions = [
      makeAction({ id: 'a', priorityScore: 30 }),
      makeAction({ id: 'b', priorityScore: 80 }),
      makeAction({ id: 'c', priorityScore: 50 }),
    ];

    const ranked = rankRemediationActions(actions);
    expect(ranked[0].id).toBe('b');
    expect(ranked[1].id).toBe('c');
    expect(ranked[2].id).toBe('a');
  });

  it('assigns ranks 1..N', () => {
    const actions = [
      makeAction({ id: 'x', priorityScore: 20 }),
      makeAction({ id: 'y', priorityScore: 40 }),
    ];

    const ranked = rankRemediationActions(actions);
    expect(ranked[0].priorityRank).toBe(1);
    expect(ranked[1].priorityRank).toBe(2);
  });

  it('breaks ties by severityWeight then affectedAssets', () => {
    const actions = [
      makeAction({ id: 'a', priorityScore: 50, severityWeight: 3, affectedAssets: 10 }),
      makeAction({ id: 'b', priorityScore: 50, severityWeight: 4, affectedAssets: 5 }),
      makeAction({ id: 'c', priorityScore: 50, severityWeight: 3, affectedAssets: 20 }),
    ];

    const ranked = rankRemediationActions(actions);
    expect(ranked[0].id).toBe('b'); // higher severity
    expect(ranked[1].id).toBe('c'); // same severity, more assets
    expect(ranked[2].id).toBe('a');
  });

  it('returns empty array for empty input', () => {
    expect(rankRemediationActions([])).toEqual([]);
  });

  it('is stable for deterministic ranking', () => {
    const actions = [
      makeAction({ id: 'a', priorityScore: 70 }),
      makeAction({ id: 'b', priorityScore: 30 }),
      makeAction({ id: 'c', priorityScore: 90 }),
    ];

    const run1 = rankRemediationActions(actions);
    const run2 = rankRemediationActions(actions);
    expect(run1.map(a => a.id)).toEqual(run2.map(a => a.id));
  });
});

// =============================================================================
// buildRemediationPlan
// =============================================================================

describe('buildRemediationPlan', () => {
  it('produces a valid plan from typical findings', () => {
    const findings = [
      makeParsedFinding({ id: 1, check_id: 'p5-missing-pk', severity: 'critical' }),
      makeParsedFinding({ id: 2, check_id: 'p5-naming-violations', severity: 'major' }),
      makeParsedFinding({ id: 3, check_id: 'p6-high-null-rate', severity: 'major' }),
      makeParsedFinding({ id: 4, check_id: 'p7-missing-audit', severity: 'critical' }),
    ];

    const plan = buildRemediationPlan(makePlanInput(findings));

    expect(plan.resultSetId).toBe('rs-test');
    expect(plan.generatedAt).toBeTruthy();
    expect(plan.actions.length).toBeGreaterThan(0);
    expect(plan.totalEstimatedImpactUsd.base).toBeGreaterThan(0);
    expect(plan.sequenceGroups.length).toBeGreaterThan(0);
  });

  it('groups related findings into the same action', () => {
    // Both p5-missing-pk and p6-no-indexes → entity-integrity
    const findings = [
      makeParsedFinding({ id: 1, check_id: 'p5-missing-pk', asset_key: 'public.a' }),
      makeParsedFinding({ id: 2, check_id: 'p6-no-indexes', asset_key: 'public.b' }),
    ];

    const plan = buildRemediationPlan(makePlanInput(findings));
    const entityAction = plan.actions.find(a => a.theme === 'entity-integrity');
    expect(entityAction).toBeDefined();
    expect(entityAction!.relatedFindingCodes).toContain('p5-missing-pk');
    expect(entityAction!.relatedFindingCodes).toContain('p6-no-indexes');
    expect(entityAction!.relatedFindingIds).toHaveLength(2);
  });

  it('all actions have rank >= 1', () => {
    const findings = [
      makeParsedFinding({ id: 1, check_id: 'p5-missing-pk' }),
      makeParsedFinding({ id: 2, check_id: 'p5-naming-violations' }),
    ];

    const plan = buildRemediationPlan(makePlanInput(findings));
    for (const action of plan.actions) {
      expect(action.priorityRank).toBeGreaterThanOrEqual(1);
    }
  });

  it('assigns deterministic action IDs based on theme', () => {
    const findings = [
      makeParsedFinding({ check_id: 'p5-missing-pk' }),
    ];

    const plan = buildRemediationPlan(makePlanInput(findings));
    expect(plan.actions[0].id).toBe('action-entity-integrity');
  });

  it('effort band S for small finding count and few assets', () => {
    const findings = [
      makeParsedFinding({
        check_id: 'p5-naming-violations', // semantic-standardisation (not structural)
        affected_objects: 2,
        asset_key: 'public.x',
      }),
    ];

    const plan = buildRemediationPlan(makePlanInput(findings));
    const action = plan.actions.find(a => a.theme === 'semantic-standardisation');
    expect(action?.effortBand).toBe('S');
  });

  it('effort band L for many findings with structural theme', () => {
    // entity-integrity is structural, > 5 findings → L
    const findings = Array.from({ length: 8 }, (_, i) =>
      makeParsedFinding({
        id: i + 1,
        check_id: 'p5-missing-pk',
        asset_key: `public.table_${i}`,
        affected_objects: 10,
      }),
    );

    const plan = buildRemediationPlan(makePlanInput(findings));
    const action = plan.actions.find(a => a.theme === 'entity-integrity');
    expect(action?.effortBand).toBe('L');
  });

  it('marks quick wins when effort is S and severity >= major', () => {
    const findings = [
      makeParsedFinding({
        check_id: 'p5-naming-violations', // non-structural → likely S
        severity: 'major',
        affected_objects: 1,
        asset_key: 'public.x',
      }),
    ];

    const plan = buildRemediationPlan(makePlanInput(findings));
    const action = plan.actions.find(a => a.theme === 'semantic-standardisation');
    expect(action?.effortBand).toBe('S');
    expect(action?.quickWin).toBe(true);
  });

  it('does not mark quick wins for info severity', () => {
    const findings = [
      makeParsedFinding({
        check_id: 'p5-naming-violations',
        severity: 'info',
        affected_objects: 1,
        asset_key: 'public.x',
      }),
    ];

    const plan = buildRemediationPlan(makePlanInput(findings));
    const action = plan.actions.find(a => a.theme === 'semantic-standardisation');
    expect(action?.quickWin).toBe(false);
  });

  it('impact estimates sum to approximately total DALC', () => {
    const findings = [
      makeParsedFinding({ id: 1, check_id: 'p5-missing-pk', costWeights: { dataQuality: 0.5 } }),
      makeParsedFinding({ id: 2, check_id: 'p5-naming-violations', costWeights: { integration: 0.3 } }),
      makeParsedFinding({ id: 3, check_id: 'p6-high-null-rate', costWeights: { dataQuality: 0.2 } }),
    ];

    const plan = buildRemediationPlan(makePlanInput(findings));
    const sumBase = plan.actions.reduce((s, a) => s + a.estimatedImpactUsd.base, 0);
    // Should equal dalcBaseUsd (100,000) due to proportional share
    expect(sumBase).toBe(100_000);
  });

  it('impact low < base < high for each action', () => {
    const findings = [
      makeParsedFinding({ check_id: 'p5-missing-pk' }),
    ];

    const plan = buildRemediationPlan(makePlanInput(findings));
    for (const a of plan.actions) {
      expect(a.estimatedImpactUsd.low).toBeLessThanOrEqual(a.estimatedImpactUsd.base);
      expect(a.estimatedImpactUsd.base).toBeLessThanOrEqual(a.estimatedImpactUsd.high);
    }
  });

  it('sets blockedByActionIds when dependency themes are present', () => {
    // semantic-standardisation depends on entity-integrity
    const findings = [
      makeParsedFinding({ id: 1, check_id: 'p5-missing-pk' }),          // entity-integrity
      makeParsedFinding({ id: 2, check_id: 'p5-naming-violations' }),   // semantic-standardisation
    ];

    const plan = buildRemediationPlan(makePlanInput(findings));
    const semAction = plan.actions.find(a => a.theme === 'semantic-standardisation');
    expect(semAction?.blockedByActionIds).toContain('action-entity-integrity');
  });

  it('does not set blockedByActionIds when dependency theme is absent', () => {
    // semantic-standardisation depends on entity-integrity, but entity-integrity not present
    const findings = [
      makeParsedFinding({ check_id: 'p5-naming-violations' }), // semantic-standardisation only
    ];

    const plan = buildRemediationPlan(makePlanInput(findings));
    const semAction = plan.actions.find(a => a.theme === 'semantic-standardisation');
    expect(semAction?.blockedByActionIds).toEqual([]);
  });

  it('assigns correct sequence groups', () => {
    const findings = [
      makeParsedFinding({ id: 1, check_id: 'p5-missing-pk' }),          // entity-integrity → phase 1
      makeParsedFinding({ id: 2, check_id: 'p5-naming-violations' }),   // semantic-standardisation → phase 2
      makeParsedFinding({ id: 3, check_id: 'p6-high-null-rate' }),      // data-quality-monitoring → phase 3
    ];

    const plan = buildRemediationPlan(makePlanInput(findings));
    const entity = plan.actions.find(a => a.theme === 'entity-integrity');
    const naming = plan.actions.find(a => a.theme === 'semantic-standardisation');
    const quality = plan.actions.find(a => a.theme === 'data-quality-monitoring');

    expect(entity?.sequenceGroup).toBe(1);
    expect(naming?.sequenceGroup).toBe(2);
    expect(quality?.sequenceGroup).toBe(3);
  });

  it('populates sequenceGroups array in plan', () => {
    const findings = [
      makeParsedFinding({ id: 1, check_id: 'p5-missing-pk' }),       // phase 1
      makeParsedFinding({ id: 2, check_id: 'p6-high-null-rate' }),   // phase 3
    ];

    const plan = buildRemediationPlan(makePlanInput(findings));
    expect(plan.sequenceGroups.length).toBe(2);
    expect(plan.sequenceGroups.find(g => g.group === 1)).toBeDefined();
    expect(plan.sequenceGroups.find(g => g.group === 3)).toBeDefined();
    // Phase 2 should be absent since no phase-2 themes
    expect(plan.sequenceGroups.find(g => g.group === 2)).toBeUndefined();
  });

  it('counts quickWinCount correctly', () => {
    const findings = [
      makeParsedFinding({
        id: 1,
        check_id: 'p5-naming-violations',
        severity: 'critical',
        affected_objects: 1,
        asset_key: 'public.a',
      }),
      makeParsedFinding({
        id: 2,
        check_id: 'p5-missing-pk',
        severity: 'minor',
        affected_objects: 1,
        asset_key: 'public.b',
      }),
    ];

    const plan = buildRemediationPlan(makePlanInput(findings));
    // semantic-standardisation with critical + S effort = quick win
    // entity-integrity with minor + S effort = NOT quick win (severity < major)
    const semAction = plan.actions.find(a => a.theme === 'semantic-standardisation');
    const entityAction = plan.actions.find(a => a.theme === 'entity-integrity');
    expect(semAction?.quickWin).toBe(true);
    expect(entityAction?.quickWin).toBe(false);
  });

  it('handles empty findings gracefully', () => {
    const plan = buildRemediationPlan(makePlanInput([]));
    expect(plan.actions).toEqual([]);
    expect(plan.totalEstimatedImpactUsd).toEqual({ low: 0, base: 0, high: 0 });
    expect(plan.quickWinCount).toBe(0);
    expect(plan.sequenceGroups).toEqual([]);
  });

  it('handles findings with zero cost weights', () => {
    const findings = [
      makeParsedFinding({
        check_id: 'p5-missing-pk',
        costWeights: {},
        costCategories: [],
      }),
    ];

    const plan = buildRemediationPlan(makePlanInput(findings));
    // Should still produce an action, but with zero impact
    expect(plan.actions.length).toBe(1);
    expect(plan.actions[0].estimatedImpactUsd.base).toBe(0);
  });

  it('produces unique relatedFindingCodes (deduped)', () => {
    const findings = [
      makeParsedFinding({ id: 1, check_id: 'p5-missing-pk', asset_key: 'a' }),
      makeParsedFinding({ id: 2, check_id: 'p5-missing-pk', asset_key: 'b' }),
    ];

    const plan = buildRemediationPlan(makePlanInput(findings));
    const action = plan.actions.find(a => a.theme === 'entity-integrity');
    // Two findings with same check_id → only one code listed
    expect(action?.relatedFindingCodes).toEqual(['p5-missing-pk']);
  });

  it('produces JSON-serializable output', () => {
    const findings = [
      makeParsedFinding({ check_id: 'p5-missing-pk' }),
      makeParsedFinding({ id: 2, check_id: 'p7-missing-audit' }),
    ];

    const plan = buildRemediationPlan(makePlanInput(findings));
    const json = JSON.stringify(plan);
    const parsed = JSON.parse(json);
    expect(parsed.resultSetId).toBe('rs-test');
    expect(parsed.actions.length).toBe(plan.actions.length);
  });

  it('prioritises critical findings higher than major', () => {
    const findings = [
      makeParsedFinding({
        id: 1,
        check_id: 'p5-naming-violations', // semantic-standardisation
        severity: 'critical',
        costWeights: { integration: 0.5 },
      }),
      makeParsedFinding({
        id: 2,
        check_id: 'p6-high-null-rate', // data-quality-monitoring
        severity: 'minor',
        costWeights: { dataQuality: 0.5 },
      }),
    ];

    const plan = buildRemediationPlan(makePlanInput(findings));
    const semAction = plan.actions.find(a => a.theme === 'semantic-standardisation');
    const qualAction = plan.actions.find(a => a.theme === 'data-quality-monitoring');
    expect(semAction!.priorityRank).toBeLessThan(qualAction!.priorityRank);
  });

  it('maps all known check IDs to themes', () => {
    // Test representative check IDs from each property
    const checkIds = [
      'P1-SEMANTIC-IDENTITY',
      'P2-TYPE-INCONSISTENCY',
      'P3-DOMAIN-OVERLAP',
      'P4-CSV-IMPORT-PATTERN',
      'p5-missing-pk',
      'p6-high-null-rate',
      'p7-missing-audit',
      'p8-ai-bias-attribute-documentation',
    ];

    const findings = checkIds.map((id, idx) =>
      makeParsedFinding({ id: idx + 1, check_id: id, asset_key: `asset-${idx}` }),
    );

    const plan = buildRemediationPlan(makePlanInput(findings));
    // Should have at least 5 distinct themes
    const themes = new Set(plan.actions.map(a => a.theme));
    expect(themes.size).toBeGreaterThanOrEqual(5);
  });

  it('derives confidence from findings', () => {
    const findings = [
      makeParsedFinding({ id: 1, check_id: 'p5-missing-pk', confidence_level: 'low' }),
      makeParsedFinding({ id: 2, check_id: 'p6-no-indexes', confidence_level: 'high' }),
    ];

    const plan = buildRemediationPlan(makePlanInput(findings));
    const action = plan.actions.find(a => a.theme === 'entity-integrity');
    // Should be 'low' since one finding has low confidence
    expect(action?.confidenceLevel).toBe('low');
  });

  it('defaults confidence to medium when no confidence data', () => {
    const findings = [
      makeParsedFinding({ check_id: 'p5-missing-pk', confidence_level: null }),
    ];

    const plan = buildRemediationPlan(makePlanInput(findings));
    expect(plan.actions[0].confidenceLevel).toBe('medium');
  });
});
