/**
 * Economic Blast-Radius Graph — Service
 *
 * Builds a deterministic bipartite graph showing how findings propagate
 * economic impact from properties (P1–P8) to cost categories.
 * Uses only existing scan data — no external dependencies or simulation.
 */

import type { CostCategory } from '../checks/types';
import type {
  BlastRadiusFindingInput,
  BlastRadiusGraph,
  BlastRadiusNode,
  BlastRadiusEdge,
  BlastRadiusSummary,
  BlastRadiusDetail,
  BlastRadiusHotEdge,
  SeverityDistribution,
} from './types';

// =============================================================================
// Constants
// =============================================================================

const PROPERTY_NAMES: Record<number, string> = {
  1: 'Semantic Identity',
  2: 'Controlled Reference',
  3: 'Domain Ownership',
  4: 'Anti-Corruption',
  5: 'Schema Governance',
  6: 'Quality Measurement',
  7: 'Regulatory Traceability',
  8: 'AI Readiness',
};

const COST_CATEGORY_LABELS: Record<string, string> = {
  firefighting: 'Engineering Firefighting',
  dataQuality: 'Data Quality',
  integration: 'Failed Integration',
  productivity: 'Productivity Drain',
  regulatory: 'Regulatory Exposure',
  aiMlRiskExposure: 'AI/ML Risk Exposure',
};

const ALL_COST_CATEGORIES: CostCategory[] = [
  'firefighting', 'dataQuality', 'integration',
  'productivity', 'regulatory', 'aiMlRiskExposure',
];

// =============================================================================
// Internal helpers
// =============================================================================

function zeroSeverityDist(): SeverityDistribution {
  return { critical: 0, major: 0, minor: 0, info: 0 };
}

function mergeSeverityDist(a: SeverityDistribution, severity: string): void {
  if (severity in a) {
    a[severity as keyof SeverityDistribution]++;
  }
}

function topSeverity(dist: SeverityDistribution): string {
  if (dist.critical > 0) return 'critical';
  if (dist.major > 0) return 'major';
  if (dist.minor > 0) return 'minor';
  return 'info';
}

interface EdgeAccumulator {
  property: number;
  costCategory: CostCategory;
  weightUsd: number;
  findingIds: Set<string>;
  severityDist: SeverityDistribution;
}

// =============================================================================
// Core: Build Graph
// =============================================================================

/**
 * Build the blast-radius bipartite graph from findings and per-category USD totals.
 *
 * @param findings - Parsed findings with costWeights, costCategories, raw_score
 * @param categoryTotalsUsd - USD total per cost category (from DALC finalCosts).
 *   If unavailable, pass null and the service will derive proportional weights
 *   from findings and scale to dalcTotalUsd.
 * @param dalcTotalUsd - Fallback total DALC USD (used when categoryTotalsUsd is null)
 */
export function buildBlastRadiusGraph(
  findings: BlastRadiusFindingInput[],
  categoryTotalsUsd: Record<string, number> | null,
  dalcTotalUsd?: number,
): BlastRadiusGraph {
  // If no explicit category totals provided, derive from findings + dalcTotalUsd
  const catTotals = categoryTotalsUsd ?? deriveCategoryTotals(findings, dalcTotalUsd ?? 0);

  // Step 1: Accumulate edges
  const edgeMap = new Map<string, EdgeAccumulator>();

  for (const f of findings) {
    for (const cat of f.costCategories) {
      if (!ALL_COST_CATEGORIES.includes(cat as CostCategory)) continue;
      const weight = f.costWeights[cat] ?? 0;
      if (weight <= 0) continue;

      const catTotal = catTotals[cat] ?? 0;
      if (catTotal <= 0) continue;

      const contribution = f.raw_score * weight * catTotal;
      if (contribution <= 0) continue;

      const edgeKey = `${f.property}->${cat}`;
      let acc = edgeMap.get(edgeKey);
      if (!acc) {
        acc = {
          property: f.property,
          costCategory: cat as CostCategory,
          weightUsd: 0,
          findingIds: new Set(),
          severityDist: zeroSeverityDist(),
        };
        edgeMap.set(edgeKey, acc);
      }
      acc.weightUsd += contribution;
      acc.findingIds.add(f.checkId);
      mergeSeverityDist(acc.severityDist, f.severity);
    }
  }

  // Step 2: Compute total weight
  let totalWeight = 0;
  for (const acc of edgeMap.values()) {
    totalWeight += acc.weightUsd;
  }

  // Step 3: Build edge array
  const edges: BlastRadiusEdge[] = [];
  for (const [, acc] of edgeMap) {
    edges.push({
      id: `edge:${acc.property}->${acc.costCategory}`,
      sourceNodeId: `property:${acc.property}`,
      targetNodeId: `costCategory:${acc.costCategory}`,
      property: acc.property,
      costCategory: acc.costCategory,
      weightUsd: Math.round(acc.weightUsd * 100) / 100,
      findingCount: acc.findingIds.size,
      severityDistribution: { ...acc.severityDist },
      shareOfTotal: totalWeight > 0 ? acc.weightUsd / totalWeight : 0,
    });
  }

  // Sort by weightUsd descending
  edges.sort((a, b) => b.weightUsd - a.weightUsd);

  // Step 4: Build property nodes
  const propertyNodes = new Map<number, { totalUsd: number; findingIds: Set<string>; sevDist: SeverityDistribution }>();
  for (const acc of edgeMap.values()) {
    let pn = propertyNodes.get(acc.property);
    if (!pn) {
      pn = { totalUsd: 0, findingIds: new Set(), sevDist: zeroSeverityDist() };
      propertyNodes.set(acc.property, pn);
    }
    pn.totalUsd += acc.weightUsd;
    for (const fid of acc.findingIds) pn.findingIds.add(fid);
    for (const sev of (['critical', 'major', 'minor', 'info'] as const)) {
      pn.sevDist[sev] += acc.severityDist[sev];
    }
  }

  // Step 5: Build cost category nodes
  const catNodes = new Map<string, { totalUsd: number; findingIds: Set<string>; sevDist: SeverityDistribution }>();
  for (const acc of edgeMap.values()) {
    let cn = catNodes.get(acc.costCategory);
    if (!cn) {
      cn = { totalUsd: 0, findingIds: new Set(), sevDist: zeroSeverityDist() };
      catNodes.set(acc.costCategory, cn);
    }
    cn.totalUsd += acc.weightUsd;
    for (const fid of acc.findingIds) cn.findingIds.add(fid);
    for (const sev of (['critical', 'major', 'minor', 'info'] as const)) {
      cn.sevDist[sev] += acc.severityDist[sev];
    }
  }

  // Step 6: Assemble nodes
  const nodes: BlastRadiusNode[] = [];
  for (const [prop, pn] of propertyNodes) {
    nodes.push({
      id: `property:${prop}`,
      type: 'property',
      label: PROPERTY_NAMES[prop] ?? `Property ${prop}`,
      totalImpactUsd: Math.round(pn.totalUsd * 100) / 100,
      findingCount: pn.findingIds.size,
      severityDistribution: pn.sevDist,
      key: prop,
    });
  }
  for (const [cat, cn] of catNodes) {
    nodes.push({
      id: `costCategory:${cat}`,
      type: 'costCategory',
      label: COST_CATEGORY_LABELS[cat] ?? cat,
      totalImpactUsd: Math.round(cn.totalUsd * 100) / 100,
      findingCount: cn.findingIds.size,
      severityDistribution: cn.sevDist,
      key: cat,
    });
  }

  // Sort nodes: properties first by number, then categories by key
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'property' ? -1 : 1;
    if (typeof a.key === 'number' && typeof b.key === 'number') return a.key - b.key;
    return String(a.key).localeCompare(String(b.key));
  });

  // Deduplicate finding count across all edges
  const allFindingIds = new Set<string>();
  for (const acc of edgeMap.values()) {
    for (const fid of acc.findingIds) allFindingIds.add(fid);
  }

  return {
    nodes,
    edges,
    totalImpactUsd: Math.round(totalWeight * 100) / 100,
    totalEdgeCount: edges.length,
    totalFindingCount: allFindingIds.size,
  };
}

// =============================================================================
// Core: Build Summary
// =============================================================================

export function buildBlastRadiusSummary(graph: BlastRadiusGraph): BlastRadiusSummary {
  const propertyNodesActive = graph.nodes.filter(n => n.type === 'property').length;
  const catNodesActive = graph.nodes.filter(n => n.type === 'costCategory').length;

  const top3 = graph.edges.slice(0, 3);
  const top3Weight = top3.reduce((s, e) => s + e.weightUsd, 0);
  const concentrationRatio = graph.totalImpactUsd > 0
    ? Math.round((top3Weight / graph.totalImpactUsd) * 1000) / 1000
    : 0;

  const hotEdges: BlastRadiusHotEdge[] = top3.map(e => ({
    property: e.property,
    propertyName: PROPERTY_NAMES[e.property] ?? `P${e.property}`,
    costCategory: e.costCategory,
    costCategoryLabel: COST_CATEGORY_LABELS[e.costCategory] ?? e.costCategory,
    weightUsd: e.weightUsd,
    shareOfTotal: Math.round(e.shareOfTotal * 1000) / 1000,
    findingCount: e.findingCount,
    topSeverity: topSeverity(e.severityDistribution),
  }));

  const keyMessage = buildKeyMessage(graph, hotEdges, concentrationRatio);

  return {
    totalImpactUsd: graph.totalImpactUsd,
    totalEdgeCount: graph.totalEdgeCount,
    totalPropertyNodesActive: propertyNodesActive,
    totalCostCategoryNodesActive: catNodesActive,
    topHotEdges: hotEdges,
    concentrationRatio,
    keyMessage,
  };
}

// =============================================================================
// Core: Build Detail (for technical report)
// =============================================================================

export function buildBlastRadiusDetail(graph: BlastRadiusGraph): BlastRadiusDetail {
  const edges = graph.edges.map(e => ({
    property: e.property,
    propertyName: PROPERTY_NAMES[e.property] ?? `P${e.property}`,
    costCategory: e.costCategory,
    costCategoryLabel: COST_CATEGORY_LABELS[e.costCategory] ?? e.costCategory,
    weightUsd: e.weightUsd,
    shareOfTotal: Math.round(e.shareOfTotal * 1000) / 1000,
    findingCount: e.findingCount,
  }));

  const propertyTotals = graph.nodes
    .filter(n => n.type === 'property')
    .map(n => ({
      property: n.key as number,
      propertyName: n.label,
      totalUsd: n.totalImpactUsd,
      findingCount: n.findingCount,
    }));

  const categoryTotals = graph.nodes
    .filter(n => n.type === 'costCategory')
    .map(n => ({
      category: n.key as string,
      categoryLabel: n.label,
      totalUsd: n.totalImpactUsd,
      findingCount: n.findingCount,
    }));

  return { edges, propertyTotals, categoryTotals };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Derive per-category USD totals from findings when the DALC CostVector is
 * not directly available. Uses findings' cost weights to distribute the
 * total DALC value proportionally across categories.
 */
function deriveCategoryTotals(
  findings: BlastRadiusFindingInput[],
  dalcTotalUsd: number,
): Record<string, number> {
  const rawWeights: Record<string, number> = {};
  for (const cat of ALL_COST_CATEGORIES) rawWeights[cat] = 0;

  for (const f of findings) {
    for (const cat of f.costCategories) {
      const w = f.costWeights[cat] ?? 0;
      rawWeights[cat] = (rawWeights[cat] ?? 0) + f.raw_score * w;
    }
  }

  const totalRaw = Object.values(rawWeights).reduce((s, v) => s + v, 0);
  if (totalRaw <= 0) return rawWeights;

  const result: Record<string, number> = {};
  for (const cat of ALL_COST_CATEGORIES) {
    result[cat] = (rawWeights[cat] / totalRaw) * dalcTotalUsd;
  }
  return result;
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function buildKeyMessage(
  graph: BlastRadiusGraph,
  hotEdges: BlastRadiusHotEdge[],
  concentrationRatio: number,
): string {
  if (graph.totalEdgeCount === 0) {
    return 'No economic blast-radius pathways detected — no findings with cost impact.';
  }

  const pct = Math.round(concentrationRatio * 100);
  const pathways = hotEdges
    .map(e => `${e.propertyName} → ${e.costCategoryLabel} (${formatUsd(e.weightUsd)})`)
    .join(', ');

  if (hotEdges.length === 0) {
    return `${graph.totalEdgeCount} cost pathways detected across ${graph.totalFindingCount} findings.`;
  }

  return `${pct}% of economic impact is concentrated in ${hotEdges.length} pathway${hotEdges.length > 1 ? 's' : ''}: ${pathways}.`;
}
