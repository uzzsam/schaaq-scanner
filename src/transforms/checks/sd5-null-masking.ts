// SD-5: Null Masking
// Detects transform rules that replace NULL with sentinel values (COALESCE, ISNULL,
// NVL, etc.) without documentation — hiding missing data from downstream consumers.

import type { TransformCheck, TransformData, TransformFinding, TransformEvidence, TransformCostCategory } from '../types';
import { containsNullMasking } from '../dictionaries';

const COST_WEIGHTS: Record<TransformCostCategory, number> = {
  firefighting: 0.2,
  dataQuality: 0.4,
  integration: 0.1,
  productivity: 0.1,
  regulatory: 0.2,
};

const COST_CATEGORIES: TransformCostCategory[] = [
  'firefighting', 'dataQuality', 'regulatory',
];

export const sd5NullMaskingCheck: TransformCheck = {
  id: 'SD-5',
  name: 'Null Masking',
  category: 'semantic-drift',
  description:
    'Detects transform rules that replace NULL with sentinel/default values (COALESCE, ISNULL, NVL) without documentation — hiding missing data from downstream consumers who then make decisions on fabricated values.',

  evaluate(data: TransformData): TransformFinding[] {
    const evidence: TransformEvidence[] = [];
    let affected = 0;

    for (const m of data.mappings) {
      if (!m.transformRule) continue;

      if (containsNullMasking(m.transformRule)) {
        const hasDocumentation = m.notes && m.notes.trim().length > 10;
        if (!hasDocumentation) {
          affected++;
          evidence.push({
            sourceTable: m.sourceTable,
            sourceColumn: m.sourceColumn,
            targetTable: m.targetTable,
            targetColumn: m.targetColumn,
            detail: `Rule "${m.transformRule}" replaces NULLs with default values but has no documentation explaining the business impact`,
            metadata: { rule: m.transformRule },
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
      checkId: 'SD-5',
      category: 'semantic-drift',
      severity,
      title: `${affected} mappings mask NULL values without documentation`,
      description:
        `${affected} of ${data.totalMappings} mappings replace NULL with default/sentinel values ` +
        `(COALESCE, ISNULL, NVL, etc.) without documenting why. Undocumented null masking is a ` +
        `data integrity risk — downstream consumers cannot distinguish real data from fabricated ` +
        `defaults. A "0" that was actually NULL changes the meaning of every aggregate that includes it.`,
      evidence,
      affectedMappings: affected,
      totalMappings: data.totalMappings,
      ratio,
      remediation:
        'Document every NULL replacement with: (1) the business reason for the default value, ' +
        '(2) the chosen sentinel/default and why, (3) whether downstream consumers need to know. ' +
        'Consider preserving NULL semantics and adding a companion flag column (e.g. is_estimated) ' +
        'instead of masking.',
      costCategories: COST_CATEGORIES,
      costWeights: { ...COST_WEIGHTS },
    }];
  },
};
