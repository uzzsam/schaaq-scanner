// OB-2: Entity Splitting
// Detects when a single source table maps to multiple target tables,
// splitting a coherent entity across tables and forcing joins for reconstruction.

import type { TransformCheck, TransformData, TransformFinding, TransformEvidence, TransformCostCategory } from '../types';

const COST_WEIGHTS: Record<TransformCostCategory, number> = {
  firefighting: 0.1,
  dataQuality: 0.2,
  integration: 0.4,
  productivity: 0.2,
  regulatory: 0.1,
};

const COST_CATEGORIES: TransformCostCategory[] = [
  'dataQuality', 'integration', 'productivity',
];

export const ob2EntitySplittingCheck: TransformCheck = {
  id: 'OB-2',
  name: 'Entity Splitting',
  category: 'ontological-break',
  description:
    'Detects when a single source table maps to multiple target tables, splitting a coherent entity into fragments that require joins to reconstruct — adding permanent complexity for every downstream consumer.',

  evaluate(data: TransformData): TransformFinding[] {
    // Group by source table → target tables
    const sourceTableTargets = new Map<string, Set<string>>();

    for (const m of data.mappings) {
      if (!m.sourceTable || !m.targetTable) continue;
      const src = m.sourceTable.toLowerCase();
      if (!sourceTableTargets.has(src)) sourceTableTargets.set(src, new Set());
      sourceTableTargets.get(src)!.add(m.targetTable.toLowerCase());
    }

    // Find source tables that feed 3+ target tables (2 is normal normalisation)
    const splits: { sourceTable: string; targetTables: string[] }[] = [];
    for (const [src, tgts] of sourceTableTargets) {
      if (tgts.size >= 3) {
        splits.push({ sourceTable: src, targetTables: Array.from(tgts).sort() });
      }
    }

    if (splits.length === 0) return [];

    const evidence: TransformEvidence[] = splits.map((split) => ({
      sourceTable: split.sourceTable,
      sourceColumn: '*',
      targetTable: split.targetTables.join(', '),
      targetColumn: '*',
      detail: `"${split.sourceTable}" splits into ${split.targetTables.length} target tables: ${split.targetTables.join(', ')}`,
      metadata: { targetTables: split.targetTables, targetCount: split.targetTables.length },
    }));

    const affected = splits.length;
    const totalSources = data.sourceTables.length;
    const ratio = totalSources > 0 ? affected / totalSources : 0;
    const totalTargetsSplit = splits.reduce((s, sp) => s + sp.targetTables.length, 0);

    let severity: 'critical' | 'major' | 'minor';
    if (totalTargetsSplit >= 10 || affected >= 3) severity = 'critical';
    else if (totalTargetsSplit >= 6 || affected >= 2) severity = 'major';
    else severity = 'minor';

    return [{
      checkId: 'OB-2',
      category: 'ontological-break',
      severity,
      title: `${affected} source entities split across ${totalTargetsSplit} target tables`,
      description:
        `${affected} source tables are each split into 3+ target tables (${totalTargetsSplit} total). ` +
        `Entity splitting forces every downstream consumer to join fragments back together — ` +
        `a permanent complexity tax. If the split follows normalisation principles, document it. ` +
        `If it doesn't, it's an architectural defect.`,
      evidence,
      affectedMappings: affected,
      totalMappings: data.totalMappings,
      ratio,
      remediation:
        'Review whether entity splitting follows normalisation principles (1NF/2NF/3NF). ' +
        'If it does, document the relationships and provide convenience views that reconstruct ' +
        'the entity. If it doesn\'t, consolidate related attributes into fewer tables.',
      costCategories: COST_CATEGORIES,
      costWeights: { ...COST_WEIGHTS },
    }];
  },
};
