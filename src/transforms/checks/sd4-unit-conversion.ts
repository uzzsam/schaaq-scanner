// SD-4: Unit Conversion Gap
// Detects column mappings where source and target names contain different unit
// suffixes from the same measurement family but the transform rule doesn't
// contain conversion logic.

import type { TransformCheck, TransformData, TransformFinding, TransformEvidence, TransformCostCategory } from '../types';
import { detectUnit } from '../dictionaries';

const COST_WEIGHTS: Record<TransformCostCategory, number> = {
  firefighting: 0.3,
  dataQuality: 0.4,
  integration: 0.1,
  productivity: 0.1,
  regulatory: 0.1,
};

const COST_CATEGORIES: TransformCostCategory[] = [
  'firefighting', 'dataQuality', 'regulatory',
];

// Keywords that suggest the rule contains conversion logic
const CONVERSION_KEYWORDS = [
  'convert', 'multiply', 'divide', 'factor', 'ratio', 'scale',
  '* ', '/ ', 'cast', 'transform',
];

function ruleContainsConversion(rule: string): boolean {
  const lower = rule.toLowerCase();
  return CONVERSION_KEYWORDS.some((kw) => lower.includes(kw));
}

export const sd4UnitConversionCheck: TransformCheck = {
  id: 'SD-4',
  name: 'Unit Conversion Gap',
  category: 'semantic-drift',
  description:
    'Detects column mappings where source and target names imply different measurement units (e.g. weight_kg → weight_lb) but the transform rule contains no conversion logic.',

  evaluate(data: TransformData): TransformFinding[] {
    const evidence: TransformEvidence[] = [];
    let affected = 0;

    for (const m of data.mappings) {
      const srcUnit = detectUnit(m.sourceColumn);
      const tgtUnit = detectUnit(m.targetColumn);

      if (!srcUnit || !tgtUnit) continue;

      // Same family, different unit, no conversion in rule
      if (srcUnit.family === tgtUnit.family && srcUnit.unit !== tgtUnit.unit) {
        const hasConversion = m.transformRule && ruleContainsConversion(m.transformRule);
        if (!hasConversion) {
          affected++;
          evidence.push({
            sourceTable: m.sourceTable,
            sourceColumn: m.sourceColumn,
            targetTable: m.targetTable,
            targetColumn: m.targetColumn,
            detail: `Unit mismatch: "${srcUnit.unit}" → "${tgtUnit.unit}" (${srcUnit.family}) with no conversion in rule "${m.transformRule || '(empty)'}"`,
            metadata: {
              sourceUnit: srcUnit.unit, targetUnit: tgtUnit.unit,
              family: srcUnit.family, rule: m.transformRule,
            },
          });
        }
      }
    }

    if (affected === 0) return [];

    const ratio = data.totalMappings > 0 ? affected / data.totalMappings : 0;

    let severity: 'critical' | 'major' | 'minor';
    if (affected >= 5 || ratio > 0.10) severity = 'critical';
    else if (affected >= 2) severity = 'major';
    else severity = 'minor';

    return [{
      checkId: 'SD-4',
      category: 'semantic-drift',
      severity,
      title: `${affected} mappings change measurement units without conversion`,
      description:
        `${affected} of ${data.totalMappings} mappings appear to change measurement units ` +
        `(e.g. kg → lb, celsius → fahrenheit) without any conversion logic in the transform rule. ` +
        `Unconverted unit changes produce silently wrong numbers — a single missing conversion ` +
        `factor can invalidate every downstream calculation, report, and decision.`,
      evidence,
      affectedMappings: affected,
      totalMappings: data.totalMappings,
      ratio,
      remediation:
        'Add explicit unit conversion logic to the transform rule for every unit change. ' +
        'Document the conversion factor and its source. Consider standardising all measurements ' +
        'to SI/metric units in the target schema to eliminate conversion requirements.',
      costCategories: COST_CATEGORIES,
      costWeights: { ...COST_WEIGHTS },
    }];
  },
};
