// OB-4: Fan-Out Join Risk
// Detects when multiple source columns feed a single target column through
// different mappings, creating potential fan-out/duplication risk.

import type { TransformCheck, TransformData, TransformFinding, TransformEvidence, TransformCostCategory } from '../types';

const COST_WEIGHTS: Record<TransformCostCategory, number> = {
  firefighting: 0.3,
  dataQuality: 0.3,
  integration: 0.2,
  productivity: 0.1,
  regulatory: 0.1,
};

const COST_CATEGORIES: TransformCostCategory[] = [
  'firefighting', 'dataQuality', 'integration',
];

export const ob4FanoutJoinCheck: TransformCheck = {
  id: 'OB-4',
  name: 'Fan-Out Join Risk',
  category: 'ontological-break',
  description:
    'Detects when a single target column receives data from multiple source columns across different source tables — indicating a many-to-one join that risks row duplication and inflated aggregates.',

  evaluate(data: TransformData): TransformFinding[] {
    const evidence: TransformEvidence[] = [];
    let affected = 0;

    // Find target columns fed by multiple source tables
    for (const [tgtKey, mappings] of data.targetToSources) {
      const distinctSourceTables = new Set(mappings.map((m) => m.sourceTable.toLowerCase()));

      if (distinctSourceTables.size >= 2) {
        affected++;
        const sourceList = Array.from(distinctSourceTables).sort();
        const [tgtTable, tgtCol] = tgtKey.split('.');

        evidence.push({
          sourceTable: sourceList.join(', '),
          sourceColumn: mappings.map((m) => m.sourceColumn).join(', '),
          targetTable: tgtTable,
          targetColumn: tgtCol,
          detail: `Target "${tgtKey}" fed by ${distinctSourceTables.size} source tables: [${sourceList.join(', ')}] — potential fan-out join`,
          metadata: { sourceTables: sourceList, sourceCount: distinctSourceTables.size },
        });
      }
    }

    if (affected === 0) return [];

    const totalTargetCols = data.targetToSources.size;
    const ratio = totalTargetCols > 0 ? affected / totalTargetCols : 0;

    let severity: 'critical' | 'major' | 'minor';
    if (affected >= 5 || ratio > 0.15) severity = 'critical';
    else if (affected >= 3 || ratio > 0.08) severity = 'major';
    else severity = 'minor';

    return [{
      checkId: 'OB-4',
      category: 'ontological-break',
      severity,
      title: `${affected} target columns receive data from multiple source tables`,
      description:
        `${affected} target columns are fed by 2+ source tables each. Many-to-one column mappings ` +
        `from different entities indicate joins that may produce row duplication (fan-out). ` +
        `A single fan-out join can inflate every downstream SUM, COUNT, and AVG — ` +
        `the error propagates invisibly through every report and dashboard.`,
      evidence,
      affectedMappings: affected,
      totalMappings: data.totalMappings,
      ratio,
      remediation:
        'Document the join logic and cardinality for every multi-source target column. ' +
        'Add DISTINCT or de-duplication logic where fan-out is possible. ' +
        'Consider intermediate staging tables that resolve the many-to-one relationship ' +
        'before loading the target.',
      costCategories: COST_CATEGORIES,
      costWeights: { ...COST_WEIGHTS },
    }];
  },
};
