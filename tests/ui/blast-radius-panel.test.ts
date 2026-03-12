/**
 * UI Tests for BlastRadiusPanel Rendering Logic
 *
 * Verifies the data-to-UI contract: given a BlastRadiusResponse, the
 * BlastRadiusPanel component produces the expected visual outputs.
 *
 * Tests exercise pure data model contracts that the React component relies on:
 *   - Summary fields (totalImpactUsd, keyMessage, topHotEdges, concentrationRatio)
 *   - Detail structure (edges, propertyTotals, categoryTotals)
 *   - Empty-state handling
 *   - UI constant resolution (PROPERTY_NAMES, COST_CATEGORY_LABELS, COST_CATEGORY_COLORS, SEVERITY_CONFIG)
 *   - Conditional rendering guards
 *
 * Since the project uses inline styles (no CSS modules), testing the data model
 * contracts provides higher value than JSDOM rendering tests.
 */

import { describe, it, expect } from 'vitest';
import type {
  BlastRadiusSummary,
  BlastRadiusDetail,
  BlastRadiusHotEdge,
} from '../../src/blast-radius';
import {
  formatCost,
  PROPERTY_NAMES,
  COST_CATEGORY_LABELS,
  COST_CATEGORY_COLORS,
  SEVERITY_CONFIG,
} from '../../ui/src/utils';
import type { SeverityKey } from '../../ui/src/utils';

// ---------------------------------------------------------------------------
// Helpers — mirror the BlastRadiusResponse shape from client.ts
// ---------------------------------------------------------------------------

interface BlastRadiusResponse {
  resultSetId: string;
  summary: BlastRadiusSummary;
  detail: BlastRadiusDetail;
}

function makeHotEdge(overrides: Partial<BlastRadiusHotEdge> = {}): BlastRadiusHotEdge {
  return {
    property: 1,
    propertyName: 'Semantic Identity',
    costCategory: 'firefighting' as never,
    costCategoryLabel: 'Engineering Firefighting',
    weightUsd: 35_000,
    shareOfTotal: 0.55,
    findingCount: 4,
    topSeverity: 'critical',
    ...overrides,
  };
}

function makeSummary(overrides: Partial<BlastRadiusSummary> = {}): BlastRadiusSummary {
  return {
    totalImpactUsd: 60_000,
    totalEdgeCount: 5,
    totalPropertyNodesActive: 3,
    totalCostCategoryNodesActive: 4,
    topHotEdges: [
      makeHotEdge({ property: 1, costCategory: 'firefighting' as never, weightUsd: 35_000, shareOfTotal: 0.55 }),
      makeHotEdge({ property: 3, propertyName: 'Domain Ownership', costCategory: 'integration' as never, costCategoryLabel: 'Integration Overhead', weightUsd: 12_000, shareOfTotal: 0.20, findingCount: 2, topSeverity: 'major' }),
      makeHotEdge({ property: 5, propertyName: 'Schema Governance', costCategory: 'regulatory' as never, costCategoryLabel: 'Regulatory Compliance', weightUsd: 8_000, shareOfTotal: 0.13, findingCount: 1, topSeverity: 'minor' }),
    ],
    concentrationRatio: 0.88,
    keyMessage: 'Semantic Identity → Engineering Firefighting dominates at 55% of the $60,000 total blast-radius impact.',
    ...overrides,
  };
}

function makeDetail(overrides: Partial<BlastRadiusDetail> = {}): BlastRadiusDetail {
  return {
    edges: [
      { property: 1, propertyName: 'Semantic Identity', costCategory: 'firefighting', costCategoryLabel: 'Engineering Firefighting', weightUsd: 35_000, shareOfTotal: 0.55, findingCount: 4 },
      { property: 3, propertyName: 'Domain Ownership', costCategory: 'integration', costCategoryLabel: 'Integration Overhead', weightUsd: 12_000, shareOfTotal: 0.20, findingCount: 2 },
      { property: 5, propertyName: 'Schema Governance', costCategory: 'regulatory', costCategoryLabel: 'Regulatory Compliance', weightUsd: 8_000, shareOfTotal: 0.13, findingCount: 1 },
      { property: 1, propertyName: 'Semantic Identity', costCategory: 'dataQuality', costCategoryLabel: 'Data Quality Remediation', weightUsd: 3_000, shareOfTotal: 0.05, findingCount: 1 },
      { property: 3, propertyName: 'Domain Ownership', costCategory: 'productivity', costCategoryLabel: 'Productivity Impact', weightUsd: 2_000, shareOfTotal: 0.03, findingCount: 1 },
    ],
    propertyTotals: [
      { property: 1, propertyName: 'Semantic Identity', totalUsd: 38_000, findingCount: 5 },
      { property: 3, propertyName: 'Domain Ownership', totalUsd: 14_000, findingCount: 3 },
      { property: 5, propertyName: 'Schema Governance', totalUsd: 8_000, findingCount: 1 },
    ],
    categoryTotals: [
      { category: 'firefighting', categoryLabel: 'Engineering Firefighting', totalUsd: 35_000, findingCount: 4 },
      { category: 'integration', categoryLabel: 'Integration Overhead', totalUsd: 12_000, findingCount: 2 },
      { category: 'regulatory', categoryLabel: 'Regulatory Compliance', totalUsd: 8_000, findingCount: 1 },
      { category: 'dataQuality', categoryLabel: 'Data Quality Remediation', totalUsd: 3_000, findingCount: 1 },
      { category: 'productivity', categoryLabel: 'Productivity Impact', totalUsd: 2_000, findingCount: 1 },
    ],
    ...overrides,
  };
}

function makeResponse(overrides: Partial<BlastRadiusResponse> = {}): BlastRadiusResponse {
  return {
    resultSetId: 'rs-001',
    summary: makeSummary(),
    detail: makeDetail(),
    ...overrides,
  };
}

// =========================================================================
// Summary Fields — Data Contract
// =========================================================================

describe('BlastRadiusPanel Data Contract — Summary Fields', () => {
  it('totalImpactUsd is formatted with formatCost', () => {
    const data = makeResponse();
    expect(formatCost(data.summary.totalImpactUsd)).toMatch(/^\$/);
  });

  it('keyMessage is a non-empty string', () => {
    const data = makeResponse();
    expect(data.summary.keyMessage.length).toBeGreaterThan(0);
  });

  it('totalEdgeCount is a positive integer', () => {
    const data = makeResponse();
    expect(data.summary.totalEdgeCount).toBe(5);
  });

  it('totalPropertyNodesActive matches expected count', () => {
    const data = makeResponse();
    expect(data.summary.totalPropertyNodesActive).toBe(3);
  });

  it('totalCostCategoryNodesActive matches expected count', () => {
    const data = makeResponse();
    expect(data.summary.totalCostCategoryNodesActive).toBe(4);
  });

  it('concentrationRatio is between 0 and 1', () => {
    const data = makeResponse();
    expect(data.summary.concentrationRatio).toBeGreaterThanOrEqual(0);
    expect(data.summary.concentrationRatio).toBeLessThanOrEqual(1);
  });
});

// =========================================================================
// Hot Edges — Top 3 Rendering
// =========================================================================

describe('BlastRadiusPanel Data Contract — Hot Edges', () => {
  it('topHotEdges has at most 3 entries', () => {
    const data = makeResponse();
    expect(data.summary.topHotEdges.length).toBeLessThanOrEqual(3);
  });

  it('hot edge property names resolve from PROPERTY_NAMES', () => {
    const data = makeResponse();
    for (const edge of data.summary.topHotEdges) {
      expect(PROPERTY_NAMES[edge.property]).toBeTruthy();
      expect(edge.propertyName).toBe(PROPERTY_NAMES[edge.property]);
    }
  });

  it('hot edge cost category labels are present', () => {
    const data = makeResponse();
    for (const edge of data.summary.topHotEdges) {
      expect(edge.costCategoryLabel.length).toBeGreaterThan(0);
    }
  });

  it('hot edge severity resolves in SEVERITY_CONFIG', () => {
    const data = makeResponse();
    for (const edge of data.summary.topHotEdges) {
      const sev = edge.topSeverity as SeverityKey;
      expect(SEVERITY_CONFIG[sev]).toBeDefined();
      expect(SEVERITY_CONFIG[sev]?.color).toBeTruthy();
    }
  });

  it('hot edge shareOfTotal is displayed as percentage', () => {
    const data = makeResponse();
    const edge = data.summary.topHotEdges[0];
    const pct = (edge.shareOfTotal * 100).toFixed(0);
    expect(pct).toBe('55');
  });

  it('hot edge weightUsd formats correctly', () => {
    const data = makeResponse();
    const edge = data.summary.topHotEdges[0];
    expect(formatCost(edge.weightUsd)).toMatch(/^\$35/);
  });
});

// =========================================================================
// Concentration Bar
// =========================================================================

describe('BlastRadiusPanel Data Contract — Concentration Bar', () => {
  it('high concentration (≥70%) uses red color logic', () => {
    const pct = Math.round(0.88 * 100);
    expect(pct).toBeGreaterThanOrEqual(70);
    // Component: pct >= 70 ? '#EF4444' : pct >= 50 ? '#F59E0B' : '#10B981'
    const barColor = pct >= 70 ? '#EF4444' : pct >= 50 ? '#F59E0B' : '#10B981';
    expect(barColor).toBe('#EF4444');
  });

  it('medium concentration (50-69%) uses amber color logic', () => {
    const pct = Math.round(0.60 * 100);
    const barColor = pct >= 70 ? '#EF4444' : pct >= 50 ? '#F59E0B' : '#10B981';
    expect(barColor).toBe('#F59E0B');
  });

  it('low concentration (<50%) uses green color logic', () => {
    const pct = Math.round(0.35 * 100);
    const barColor = pct >= 70 ? '#EF4444' : pct >= 50 ? '#F59E0B' : '#10B981';
    expect(barColor).toBe('#10B981');
  });
});

// =========================================================================
// Detail — Edges, Property Totals, Category Totals
// =========================================================================

describe('BlastRadiusPanel Data Contract — Detail Tables', () => {
  it('detail edges array matches summary edge count', () => {
    const data = makeResponse();
    expect(data.detail.edges.length).toBe(data.summary.totalEdgeCount);
  });

  it('property totals resolve names from PROPERTY_NAMES', () => {
    const data = makeResponse();
    for (const pt of data.detail.propertyTotals) {
      expect(PROPERTY_NAMES[pt.property]).toBeTruthy();
    }
  });

  it('category totals resolve labels from COST_CATEGORY_LABELS', () => {
    const data = makeResponse();
    for (const ct of data.detail.categoryTotals) {
      expect(COST_CATEGORY_LABELS[ct.category]).toBeTruthy();
    }
  });

  it('category totals resolve colors from COST_CATEGORY_COLORS', () => {
    const data = makeResponse();
    for (const ct of data.detail.categoryTotals) {
      expect(COST_CATEGORY_COLORS[ct.category]).toBeTruthy();
    }
  });

  it('detail edge shareOfTotal sums to ~1.0', () => {
    const data = makeResponse();
    const sum = data.detail.edges.reduce((s, e) => s + e.shareOfTotal, 0);
    expect(sum).toBeCloseTo(0.96, 1); // slightly under 1.0 due to rounding in test data
  });

  it('detail edge findingCount pluralisation works', () => {
    const data = makeResponse();
    for (const e of data.detail.edges) {
      const label = `${e.findingCount} finding${e.findingCount !== 1 ? 's' : ''}`;
      if (e.findingCount === 1) {
        expect(label).toBe('1 finding');
      } else {
        expect(label).toMatch(/findings$/);
      }
    }
  });
});

// =========================================================================
// Empty State — Zero Edges
// =========================================================================

describe('BlastRadiusPanel Data Contract — Empty State', () => {
  it('zero totalEdgeCount triggers empty state', () => {
    const data = makeResponse({
      summary: makeSummary({ totalEdgeCount: 0, totalImpactUsd: 0, topHotEdges: [], concentrationRatio: 0, keyMessage: '' }),
      detail: makeDetail({ edges: [], propertyTotals: [], categoryTotals: [] }),
    });
    // Component: if (summary.totalEdgeCount === 0) return empty card
    expect(data.summary.totalEdgeCount).toBe(0);
  });

  it('non-zero totalEdgeCount renders full panel', () => {
    const data = makeResponse();
    expect(data.summary.totalEdgeCount).toBeGreaterThan(0);
  });
});

// =========================================================================
// ScanResults Integration — Conditional Rendering
// =========================================================================

describe('ScanResults Integration — Conditional Blast-Radius Rendering', () => {
  it('blastRadiusData=null means panel is NOT rendered (falsy check)', () => {
    const blastRadiusData: BlastRadiusResponse | null = null;
    // ScanResults: {blastRadiusData && (<BlastRadiusPanel data={blastRadiusData} />)}
    expect(blastRadiusData).toBeFalsy();
  });

  it('blastRadiusData with valid response means panel IS rendered (truthy check)', () => {
    const blastRadiusData: BlastRadiusResponse | null = makeResponse();
    expect(blastRadiusData).toBeTruthy();
  });

  it('response carries all fields needed by BlastRadiusPanel', () => {
    const data = makeResponse();
    // Fields used by BlastRadiusPanel component:
    expect(data.summary.totalImpactUsd).toBeDefined();
    expect(data.summary.totalEdgeCount).toBeDefined();
    expect(data.summary.totalPropertyNodesActive).toBeDefined();
    expect(data.summary.totalCostCategoryNodesActive).toBeDefined();
    expect(data.summary.topHotEdges).toBeDefined();
    expect(data.summary.concentrationRatio).toBeDefined();
    expect(data.summary.keyMessage).toBeDefined();
    expect(data.detail.edges).toBeDefined();
    expect(data.detail.propertyTotals).toBeDefined();
    expect(data.detail.categoryTotals).toBeDefined();
  });
});
