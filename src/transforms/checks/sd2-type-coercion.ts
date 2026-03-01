// SD-2: Type Coercion Risk
// Detects mappings where the target type has lower precision than the source type,
// indicating lossy type casting that silently discards information.

import type { TransformCheck, TransformData, TransformFinding, TransformEvidence, TransformCostCategory } from '../types';
import { isLossyCast, normaliseTypeName, TYPE_PRECISION_RANK } from '../dictionaries';

const COST_WEIGHTS: Record<TransformCostCategory, number> = {
  firefighting: 0.3,
  dataQuality: 0.4,
  integration: 0.1,
  productivity: 0.1,
  regulatory: 0.1,
};

const COST_CATEGORIES: TransformCostCategory[] = [
  'firefighting', 'dataQuality', 'integration', 'regulatory',
];

export const sd2TypeCoercionCheck: TransformCheck = {
  id: 'SD-2',
  name: 'Type Coercion Risk',
  category: 'semantic-drift',
  description:
    'Detects mappings where the target type has lower precision than the source type — a lossy cast that silently discards information (e.g. TIMESTAMP → DATE loses time, DECIMAL → INTEGER truncates).',

  evaluate(data: TransformData): TransformFinding[] {
    const evidence: TransformEvidence[] = [];
    let affected = 0;

    for (const m of data.mappings) {
      if (!m.sourceType || !m.targetType) continue;

      if (isLossyCast(m.sourceType, m.targetType)) {
        affected++;
        const srcNorm = normaliseTypeName(m.sourceType);
        const tgtNorm = normaliseTypeName(m.targetType);
        const srcRank = TYPE_PRECISION_RANK[srcNorm] ?? '?';
        const tgtRank = TYPE_PRECISION_RANK[tgtNorm] ?? '?';

        evidence.push({
          sourceTable: m.sourceTable,
          sourceColumn: m.sourceColumn,
          targetTable: m.targetTable,
          targetColumn: m.targetColumn,
          detail: `${m.sourceType} (precision ${srcRank}) → ${m.targetType} (precision ${tgtRank}) — lossy cast`,
          metadata: { sourceType: m.sourceType, targetType: m.targetType, sourceRank: srcRank, targetRank: tgtRank },
        });
      }
    }

    if (affected === 0) return [];

    const ratio = data.totalMappings > 0 ? affected / data.totalMappings : 0;

    // Severity: 5+ or >10% → critical, 3+ → major, else minor
    let severity: 'critical' | 'major' | 'minor';
    if (affected >= 5 || ratio > 0.10) severity = 'critical';
    else if (affected >= 3) severity = 'major';
    else severity = 'minor';

    return [{
      checkId: 'SD-2',
      category: 'semantic-drift',
      severity,
      title: `${affected} mappings cast to lower-precision types`,
      description:
        `${affected} of ${data.totalMappings} column mappings cast from a higher-precision source type ` +
        `to a lower-precision target type. Each lossy cast silently discards data — ` +
        `timestamps lose time components, decimals lose fractional parts, bigints overflow. ` +
        `The business cost is not the cast itself but the decisions made on truncated data.`,
      evidence,
      affectedMappings: affected,
      totalMappings: data.totalMappings,
      ratio,
      remediation:
        'Preserve source type precision in the target schema. If precision reduction is intentional ' +
        '(e.g. reporting only needs DATE not TIMESTAMP), document the business justification in the ' +
        'mapping notes. Add data quality checks that alert when truncation affects business values.',
      costCategories: COST_CATEGORIES,
      costWeights: { ...COST_WEIGHTS },
    }];
  },
};
