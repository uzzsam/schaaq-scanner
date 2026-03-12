import { describe, it, expect } from 'vitest';
import {
  buildBlastRadiusGraph,
  buildBlastRadiusSummary,
  buildBlastRadiusDetail,
} from '../../src/blast-radius/blast-radius-service';
import type { BlastRadiusFindingInput } from '../../src/blast-radius/types';

// =============================================================================
// Helpers
// =============================================================================

function makeFinding(overrides: Partial<BlastRadiusFindingInput> = {}): BlastRadiusFindingInput {
  return {
    checkId: 'CHK-001',
    property: 1,
    severity: 'major',
    raw_score: 0.8,
    costCategories: ['firefighting'],
    costWeights: { firefighting: 0.5 },
    ...overrides,
  };
}

const CATEGORY_TOTALS: Record<string, number> = {
  firefighting: 100_000,
  dataQuality: 80_000,
  integration: 60_000,
  productivity: 40_000,
  regulatory: 30_000,
  aiMlRiskExposure: 20_000,
};

// =============================================================================
// buildBlastRadiusGraph
// =============================================================================

describe('buildBlastRadiusGraph', () => {
  it('returns empty graph for empty findings', () => {
    const graph = buildBlastRadiusGraph([], CATEGORY_TOTALS);
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
    expect(graph.totalImpactUsd).toBe(0);
    expect(graph.totalEdgeCount).toBe(0);
    expect(graph.totalFindingCount).toBe(0);
  });

  it('creates 1 edge for a single finding with 1 cost category', () => {
    const f = makeFinding({
      property: 1,
      raw_score: 0.8,
      costCategories: ['firefighting'],
      costWeights: { firefighting: 0.5 },
    });
    const graph = buildBlastRadiusGraph([f], CATEGORY_TOTALS);

    expect(graph.edges).toHaveLength(1);
    expect(graph.nodes).toHaveLength(2); // 1 property + 1 category

    const edge = graph.edges[0];
    // weight = 0.8 * 0.5 * 100_000 = 40_000
    expect(edge.weightUsd).toBe(40_000);
    expect(edge.property).toBe(1);
    expect(edge.costCategory).toBe('firefighting');
    expect(edge.findingCount).toBe(1);
    expect(edge.shareOfTotal).toBe(1);
  });

  it('creates N edges for a single finding with N cost categories', () => {
    const f = makeFinding({
      property: 3,
      raw_score: 1.0,
      costCategories: ['firefighting', 'dataQuality', 'integration'],
      costWeights: { firefighting: 0.4, dataQuality: 0.3, integration: 0.2 },
    });
    const graph = buildBlastRadiusGraph([f], CATEGORY_TOTALS);

    expect(graph.edges).toHaveLength(3);
    // 1 property node + 3 category nodes
    expect(graph.nodes).toHaveLength(4);

    // Verify each edge weight
    const ffEdge = graph.edges.find(e => e.costCategory === 'firefighting')!;
    expect(ffEdge.weightUsd).toBe(1.0 * 0.4 * 100_000); // 40_000
    const dqEdge = graph.edges.find(e => e.costCategory === 'dataQuality')!;
    expect(dqEdge.weightUsd).toBe(1.0 * 0.3 * 80_000); // 24_000
    const intEdge = graph.edges.find(e => e.costCategory === 'integration')!;
    expect(intEdge.weightUsd).toBe(1.0 * 0.2 * 60_000); // 12_000
  });

  it('merges edges for multiple findings on same property+category', () => {
    const f1 = makeFinding({
      checkId: 'CHK-001',
      property: 5,
      raw_score: 0.6,
      costCategories: ['firefighting'],
      costWeights: { firefighting: 0.5 },
    });
    const f2 = makeFinding({
      checkId: 'CHK-002',
      property: 5,
      raw_score: 0.4,
      costCategories: ['firefighting'],
      costWeights: { firefighting: 0.3 },
    });
    const graph = buildBlastRadiusGraph([f1, f2], CATEGORY_TOTALS);

    expect(graph.edges).toHaveLength(1);
    const edge = graph.edges[0];
    // (0.6 * 0.5 * 100_000) + (0.4 * 0.3 * 100_000) = 30_000 + 12_000 = 42_000
    expect(edge.weightUsd).toBe(42_000);
    expect(edge.findingCount).toBe(2);
  });

  it('creates separate edges for different properties', () => {
    const findings = [1, 2, 3, 4, 5, 6, 7, 8].map(p =>
      makeFinding({
        checkId: `CHK-${p}`,
        property: p,
        raw_score: 0.5,
        costCategories: ['dataQuality'],
        costWeights: { dataQuality: 1.0 },
      })
    );
    const graph = buildBlastRadiusGraph(findings, CATEGORY_TOTALS);

    expect(graph.edges).toHaveLength(8);
    // 8 property nodes + 1 category node
    const propNodes = graph.nodes.filter(n => n.type === 'property');
    expect(propNodes).toHaveLength(8);
    const catNodes = graph.nodes.filter(n => n.type === 'costCategory');
    expect(catNodes).toHaveLength(1);
  });

  it('skips edges with zero-weight cost categories', () => {
    const f = makeFinding({
      costCategories: ['firefighting', 'regulatory'],
      costWeights: { firefighting: 0.5, regulatory: 0 },
    });
    const graph = buildBlastRadiusGraph([f], CATEGORY_TOTALS);

    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].costCategory).toBe('firefighting');
  });

  it('has shareOfTotal values summing to 1.0', () => {
    const findings = [
      makeFinding({ checkId: 'A', property: 1, costCategories: ['firefighting', 'dataQuality'], costWeights: { firefighting: 0.4, dataQuality: 0.3 } }),
      makeFinding({ checkId: 'B', property: 2, costCategories: ['integration'], costWeights: { integration: 0.6 } }),
      makeFinding({ checkId: 'C', property: 3, costCategories: ['regulatory', 'productivity'], costWeights: { regulatory: 0.2, productivity: 0.5 } }),
    ];
    const graph = buildBlastRadiusGraph(findings, CATEGORY_TOTALS);

    const totalShare = graph.edges.reduce((s, e) => s + e.shareOfTotal, 0);
    expect(totalShare).toBeCloseTo(1.0, 5);
  });

  it('deduplicates finding count per property node', () => {
    // Same finding contributes to 2 edges from same property
    const f = makeFinding({
      checkId: 'CHK-MULTI',
      property: 1,
      costCategories: ['firefighting', 'dataQuality'],
      costWeights: { firefighting: 0.3, dataQuality: 0.4 },
    });
    const graph = buildBlastRadiusGraph([f], CATEGORY_TOTALS);

    const propNode = graph.nodes.find(n => n.id === 'property:1')!;
    expect(propNode.findingCount).toBe(1); // deduplicated, not 2
    expect(graph.totalFindingCount).toBe(1);
  });

  it('produces identical output for identical input (determinism)', () => {
    const findings = [
      makeFinding({ checkId: 'A', property: 1, costCategories: ['firefighting'], costWeights: { firefighting: 0.5 } }),
      makeFinding({ checkId: 'B', property: 2, costCategories: ['dataQuality'], costWeights: { dataQuality: 0.7 } }),
    ];
    const g1 = buildBlastRadiusGraph(findings, CATEGORY_TOTALS);
    const g2 = buildBlastRadiusGraph(findings, CATEGORY_TOTALS);
    expect(JSON.stringify(g1)).toBe(JSON.stringify(g2));
  });

  it('edges are sorted by weightUsd descending', () => {
    const findings = [
      makeFinding({ checkId: 'A', property: 1, raw_score: 0.1, costCategories: ['firefighting'], costWeights: { firefighting: 0.1 } }),
      makeFinding({ checkId: 'B', property: 2, raw_score: 1.0, costCategories: ['firefighting'], costWeights: { firefighting: 1.0 } }),
      makeFinding({ checkId: 'C', property: 3, raw_score: 0.5, costCategories: ['firefighting'], costWeights: { firefighting: 0.5 } }),
    ];
    const graph = buildBlastRadiusGraph(findings, CATEGORY_TOTALS);

    for (let i = 1; i < graph.edges.length; i++) {
      expect(graph.edges[i - 1].weightUsd).toBeGreaterThanOrEqual(graph.edges[i].weightUsd);
    }
  });

  it('uses dalcTotalUsd fallback when categoryTotalsUsd is null', () => {
    const f = makeFinding({
      property: 1,
      raw_score: 1.0,
      costCategories: ['firefighting'],
      costWeights: { firefighting: 1.0 },
    });
    const graph = buildBlastRadiusGraph([f], null, 100_000);

    // With only 1 finding in 1 category, that category gets 100% of dalcTotalUsd
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].weightUsd).toBe(100_000);
  });

  it('tracks severity distributions correctly', () => {
    const findings = [
      makeFinding({ checkId: 'A', property: 1, severity: 'critical', costCategories: ['firefighting'], costWeights: { firefighting: 0.5 } }),
      makeFinding({ checkId: 'B', property: 1, severity: 'major', costCategories: ['firefighting'], costWeights: { firefighting: 0.3 } }),
      makeFinding({ checkId: 'C', property: 1, severity: 'critical', costCategories: ['firefighting'], costWeights: { firefighting: 0.2 } }),
    ];
    const graph = buildBlastRadiusGraph(findings, CATEGORY_TOTALS);

    const edge = graph.edges[0];
    expect(edge.severityDistribution.critical).toBe(2);
    expect(edge.severityDistribution.major).toBe(1);
    expect(edge.severityDistribution.minor).toBe(0);
    expect(edge.severityDistribution.info).toBe(0);
  });
});

// =============================================================================
// buildBlastRadiusSummary
// =============================================================================

describe('buildBlastRadiusSummary', () => {
  it('returns empty summary for empty graph', () => {
    const graph = buildBlastRadiusGraph([], CATEGORY_TOTALS);
    const summary = buildBlastRadiusSummary(graph);

    expect(summary.totalImpactUsd).toBe(0);
    expect(summary.totalEdgeCount).toBe(0);
    expect(summary.topHotEdges).toHaveLength(0);
    expect(summary.concentrationRatio).toBe(0);
    expect(summary.keyMessage).toContain('No economic blast-radius');
  });

  it('returns top 3 hot edges sorted by weight', () => {
    const findings = [
      makeFinding({ checkId: 'A', property: 1, raw_score: 1.0, costCategories: ['firefighting'], costWeights: { firefighting: 1.0 } }),
      makeFinding({ checkId: 'B', property: 2, raw_score: 0.5, costCategories: ['dataQuality'], costWeights: { dataQuality: 1.0 } }),
      makeFinding({ checkId: 'C', property: 3, raw_score: 0.3, costCategories: ['integration'], costWeights: { integration: 1.0 } }),
      makeFinding({ checkId: 'D', property: 4, raw_score: 0.1, costCategories: ['productivity'], costWeights: { productivity: 1.0 } }),
    ];
    const graph = buildBlastRadiusGraph(findings, CATEGORY_TOTALS);
    const summary = buildBlastRadiusSummary(graph);

    expect(summary.topHotEdges).toHaveLength(3);
    // Top 1 should be firefighting (1.0 * 1.0 * 100K = 100K)
    expect(summary.topHotEdges[0].costCategory).toBe('firefighting');
    expect(summary.topHotEdges[0].weightUsd).toBe(100_000);
  });

  it('computes concentration ratio correctly', () => {
    const findings = [
      makeFinding({ checkId: 'A', property: 1, raw_score: 1.0, costCategories: ['firefighting'], costWeights: { firefighting: 1.0 } }),
      makeFinding({ checkId: 'B', property: 2, raw_score: 1.0, costCategories: ['dataQuality'], costWeights: { dataQuality: 1.0 } }),
    ];
    const graph = buildBlastRadiusGraph(findings, CATEGORY_TOTALS);
    const summary = buildBlastRadiusSummary(graph);

    // Only 2 edges total, both in top 3
    // Total = 100K + 80K = 180K, top3 = 180K
    expect(summary.concentrationRatio).toBe(1.0);
  });

  it('includes property and category names in hot edges', () => {
    const f = makeFinding({
      property: 5,
      costCategories: ['regulatory'],
      costWeights: { regulatory: 0.8 },
    });
    const graph = buildBlastRadiusGraph([f], CATEGORY_TOTALS);
    const summary = buildBlastRadiusSummary(graph);

    expect(summary.topHotEdges[0].propertyName).toBe('Schema Governance');
    expect(summary.topHotEdges[0].costCategoryLabel).toBe('Regulatory Exposure');
  });

  it('keyMessage includes pathway descriptions', () => {
    const f = makeFinding({
      property: 1,
      costCategories: ['firefighting'],
      costWeights: { firefighting: 0.5 },
    });
    const graph = buildBlastRadiusGraph([f], CATEGORY_TOTALS);
    const summary = buildBlastRadiusSummary(graph);

    expect(summary.keyMessage).toContain('Semantic Identity');
    expect(summary.keyMessage).toContain('Engineering Firefighting');
    expect(summary.keyMessage).toContain('concentrated');
  });
});

// =============================================================================
// buildBlastRadiusDetail
// =============================================================================

describe('buildBlastRadiusDetail', () => {
  it('includes all edges with labels', () => {
    const findings = [
      makeFinding({ checkId: 'A', property: 1, costCategories: ['firefighting', 'dataQuality'], costWeights: { firefighting: 0.3, dataQuality: 0.4 } }),
      makeFinding({ checkId: 'B', property: 2, costCategories: ['integration'], costWeights: { integration: 0.6 } }),
    ];
    const graph = buildBlastRadiusGraph(findings, CATEGORY_TOTALS);
    const detail = buildBlastRadiusDetail(graph);

    expect(detail.edges).toHaveLength(3);
    expect(detail.edges[0].propertyName).toBeTruthy();
    expect(detail.edges[0].costCategoryLabel).toBeTruthy();
  });

  it('includes property totals and category totals', () => {
    const findings = [
      makeFinding({ checkId: 'A', property: 1, costCategories: ['firefighting'], costWeights: { firefighting: 1.0 } }),
      makeFinding({ checkId: 'B', property: 2, costCategories: ['firefighting'], costWeights: { firefighting: 0.5 } }),
    ];
    const graph = buildBlastRadiusGraph(findings, CATEGORY_TOTALS);
    const detail = buildBlastRadiusDetail(graph);

    expect(detail.propertyTotals).toHaveLength(2);
    expect(detail.categoryTotals).toHaveLength(1); // only firefighting
    expect(detail.categoryTotals[0].category).toBe('firefighting');
  });
});
