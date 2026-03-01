// OB-1: Entity Merging
// Detects when multiple distinct source tables map into a single target table,
// which may merge semantically distinct entities into one (e.g. customers + suppliers → parties).

import type { TransformCheck, TransformData, TransformFinding, TransformEvidence, TransformCostCategory } from '../types';

const COST_WEIGHTS: Record<TransformCostCategory, number> = {
  firefighting: 0.2,
  dataQuality: 0.3,
  integration: 0.3,
  productivity: 0.1,
  regulatory: 0.1,
};

const COST_CATEGORIES: TransformCostCategory[] = [
  'firefighting', 'dataQuality', 'integration', 'regulatory',
];

export const ob1EntityMergingCheck: TransformCheck = {
  id: 'OB-1',
  name: 'Entity Merging',
  category: 'ontological-break',
  description:
    'Detects when multiple source tables feed into a single target table, potentially merging semantically distinct entities (e.g. customers + suppliers → parties) and losing domain-specific attributes.',

  evaluate(data: TransformData): TransformFinding[] {
    // Group mappings by target table
    const targetTableSources = new Map<string, Set<string>>();

    for (const m of data.mappings) {
      if (!m.targetTable || !m.sourceTable) continue;
      const tgt = m.targetTable.toLowerCase();
      if (!targetTableSources.has(tgt)) targetTableSources.set(tgt, new Set());
      targetTableSources.get(tgt)!.add(m.sourceTable.toLowerCase());
    }

    // Find target tables fed by 2+ source tables
    const merges: { targetTable: string; sourceTables: string[] }[] = [];
    for (const [tgt, srcs] of targetTableSources) {
      if (srcs.size >= 2) {
        merges.push({ targetTable: tgt, sourceTables: Array.from(srcs).sort() });
      }
    }

    if (merges.length === 0) return [];

    const evidence: TransformEvidence[] = merges.map((merge) => ({
      sourceTable: merge.sourceTables.join(', '),
      sourceColumn: '*',
      targetTable: merge.targetTable,
      targetColumn: '*',
      detail: `${merge.sourceTables.length} source tables (${merge.sourceTables.join(', ')}) merge into "${merge.targetTable}"`,
      metadata: { sourceTables: merge.sourceTables, sourceCount: merge.sourceTables.length },
    }));

    const affected = merges.length;
    const totalTargets = data.targetTables.length;
    const ratio = totalTargets > 0 ? affected / totalTargets : 0;

    // Total source tables involved in merges
    const totalSourcesMerged = merges.reduce((s, m) => s + m.sourceTables.length, 0);

    let severity: 'critical' | 'major' | 'minor';
    if (totalSourcesMerged >= 6 || affected >= 3) severity = 'critical';
    else if (totalSourcesMerged >= 4 || affected >= 2) severity = 'major';
    else severity = 'minor';

    return [{
      checkId: 'OB-1',
      category: 'ontological-break',
      severity,
      title: `${affected} target tables merge multiple source entities`,
      description:
        `${affected} target tables receive data from ${totalSourcesMerged} source tables total. ` +
        `Entity merging loses domain-specific attributes and conflates distinct business concepts. ` +
        `When "customers" and "suppliers" become "parties", every downstream query must ` +
        `reverse-engineer the entity type — a permanent integration tax on every consumer.`,
      evidence,
      affectedMappings: affected,
      totalMappings: data.totalMappings,
      ratio,
      remediation:
        'Preserve source entity boundaries in the target schema. If merging is intentional ' +
        '(e.g. Party model), add a discriminator column (entity_type) and document which source-specific ' +
        'attributes are dropped. Ensure downstream consumers can filter by entity type.',
      costCategories: COST_CATEGORIES,
      costWeights: { ...COST_WEIGHTS },
    }];
  },
};
