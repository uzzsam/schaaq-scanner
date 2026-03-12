/**
 * Economic Blast-Radius Graph — Type Definitions
 *
 * A deterministic bipartite directed graph showing how economic impact
 * spreads from Data Properties (P1–P8) to Cost Categories (6 types).
 * Derived entirely from existing findings and DALC cost data.
 */

import type { CostCategory } from '../checks/types';

// =============================================================================
// Node Types
// =============================================================================

export type BlastRadiusNodeType = 'property' | 'costCategory';

export type SeverityDistribution = Record<'critical' | 'major' | 'minor' | 'info', number>;

export interface BlastRadiusNode {
  /** Unique node ID: 'property:1' or 'costCategory:firefighting' */
  id: string;
  type: BlastRadiusNodeType;
  /** Human-readable label: 'Semantic Identity' or 'Engineering Firefighting' */
  label: string;
  /** Sum of all edge weights touching this node (USD). */
  totalImpactUsd: number;
  /** Number of distinct findings contributing to this node. */
  findingCount: number;
  severityDistribution: SeverityDistribution;
  /** For property nodes: property number (1-8). For cost category nodes: the category key. */
  key: string | number;
}

// =============================================================================
// Edge Types
// =============================================================================

export interface BlastRadiusEdge {
  /** Unique edge ID: 'edge:1->firefighting' */
  id: string;
  /** Source node (property). */
  sourceNodeId: string;
  /** Target node (cost category). */
  targetNodeId: string;
  /** Property number (1-8). */
  property: number;
  /** Cost category key. */
  costCategory: CostCategory;
  /** Deterministic USD contribution for this pathway. */
  weightUsd: number;
  /** Number of findings driving this edge. */
  findingCount: number;
  severityDistribution: SeverityDistribution;
  /** Share of this edge relative to total graph weight (0–1). */
  shareOfTotal: number;
}

// =============================================================================
// Graph
// =============================================================================

export interface BlastRadiusGraph {
  nodes: BlastRadiusNode[];
  edges: BlastRadiusEdge[];
  totalImpactUsd: number;
  totalEdgeCount: number;
  totalFindingCount: number;
}

// =============================================================================
// Summary (executive-level)
// =============================================================================

export interface BlastRadiusHotEdge {
  property: number;
  propertyName: string;
  costCategory: CostCategory;
  costCategoryLabel: string;
  weightUsd: number;
  shareOfTotal: number;
  findingCount: number;
  topSeverity: string;
}

export interface BlastRadiusSummary {
  totalImpactUsd: number;
  totalEdgeCount: number;
  /** Number of property nodes with at least one edge. */
  totalPropertyNodesActive: number;
  /** Number of cost category nodes with at least one edge. */
  totalCostCategoryNodesActive: number;
  /** Top 3 edges by USD weight. */
  topHotEdges: BlastRadiusHotEdge[];
  /** Sum of top-3 edge weights / total weight (0–1). */
  concentrationRatio: number;
  /** Executive-ready 1-sentence summary. */
  keyMessage: string;
}

// =============================================================================
// Technical Detail (for report appendix)
// =============================================================================

export interface BlastRadiusDetail {
  edges: Array<{
    property: number;
    propertyName: string;
    costCategory: string;
    costCategoryLabel: string;
    weightUsd: number;
    shareOfTotal: number;
    findingCount: number;
  }>;
  propertyTotals: Array<{
    property: number;
    propertyName: string;
    totalUsd: number;
    findingCount: number;
  }>;
  categoryTotals: Array<{
    category: string;
    categoryLabel: string;
    totalUsd: number;
    findingCount: number;
  }>;
}

// =============================================================================
// Input shape (parsed finding subset needed by the service)
// =============================================================================

export interface BlastRadiusFindingInput {
  checkId: string;
  property: number;
  severity: string;
  raw_score: number;
  costCategories: string[];
  costWeights: Record<string, number>;
}
