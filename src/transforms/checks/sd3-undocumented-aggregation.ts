// SD-3: Undocumented Aggregation
// Detects transform rules that contain aggregation functions (SUM, AVG, COUNT, etc.)
// but have empty or missing notes/description — hiding cardinality reduction.

import type { TransformCheck, TransformData, TransformFinding, TransformEvidence, TransformCostCategory } from '../types';
import { containsAggregation } from '../dictionaries';

const COST_WEIGHTS: Record<TransformCostCategory, number> = {
  firefighting: 0.1,
  dataQuality: 0.3,
  integration: 0.1,
  productivity: 0.3,
  regulatory: 0.2,
};

const COST_CATEGORIES: TransformCostCategory[] = [
  'dataQuality', 'productivity', 'regulatory',
];

export const sd3AggregationCheck: TransformCheck = {
  id: 'SD-3',
  name: 'Undocumented Aggregation',
  category: 'semantic-drift',
  description:
    'Detects transform rules that aggregate data (SUM, AVG, COUNT, GROUP BY, etc.) without documenting what is lost — hiding cardinality reduction from downstream consumers.',

  evaluate(data: TransformData): TransformFinding[] {
    const evidence: TransformEvidence[] = [];
    let affected = 0;

    for (const m of data.mappings) {
      if (!m.transformRule) continue;

      if (containsAggregation(m.transformRule)) {
        // Check if notes/description explains the aggregation
        const hasDocumentation = m.notes && m.notes.trim().length > 10;
        if (!hasDocumentation) {
          affected++;
          evidence.push({
            sourceTable: m.sourceTable,
            sourceColumn: m.sourceColumn,
            targetTable: m.targetTable,
            targetColumn: m.targetColumn,
            detail: `Rule "${m.transformRule}" aggregates data but has no documentation explaining what detail is lost`,
            metadata: { rule: m.transformRule, notes: m.notes },
          });
        }
      }
    }

    if (affected === 0) return [];

    const ratio = data.totalMappings > 0 ? affected / data.totalMappings : 0;

    let severity: 'critical' | 'major' | 'minor';
    if (affected >= 8 || ratio > 0.15) severity = 'critical';
    else if (affected >= 4 || ratio > 0.08) severity = 'major';
    else severity = 'minor';

    return [{
      checkId: 'SD-3',
      category: 'semantic-drift',
      severity,
      title: `${affected} aggregations hide cardinality loss without documentation`,
      description:
        `${affected} of ${data.totalMappings} mappings aggregate data (SUM, AVG, COUNT, GROUP BY, etc.) ` +
        `without documenting what detail is discarded. Undocumented aggregation is a silent ` +
        `business risk — downstream consumers don't know they're seeing summarised data and may ` +
        `make decisions assuming row-level granularity that no longer exists.`,
      evidence,
      affectedMappings: affected,
      totalMappings: data.totalMappings,
      ratio,
      remediation:
        'Add mapping notes for every aggregation explaining: (1) what grain is lost, ' +
        '(2) what business question this aggregation serves, and (3) whether the original detail ' +
        'is preserved elsewhere. Auditors and downstream teams need this to trust the numbers.',
      costCategories: COST_CATEGORIES,
      costWeights: { ...COST_WEIGHTS },
    }];
  },
};
