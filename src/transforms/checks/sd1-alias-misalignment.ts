// SD-1: Alias Misalignment
// Detects source→target column mappings where column names contain different
// terms from the same business conflict group (e.g. revenue → income).

import type { TransformCheck, TransformData, TransformFinding, TransformEvidence, TransformCostCategory } from '../types';
import { TERM_CONFLICT_GROUPS } from '../dictionaries';

const COST_WEIGHTS: Record<TransformCostCategory, number> = {
  firefighting: 0.2,
  dataQuality: 0.4,
  integration: 0.2,
  productivity: 0.1,
  regulatory: 0.1,
};

const COST_CATEGORIES: TransformCostCategory[] = [
  'firefighting', 'dataQuality', 'integration', 'productivity', 'regulatory',
];

/**
 * Extract tokens from a column name by splitting on underscores, camelCase, etc.
 */
function tokenize(name: string): string[] {
  return name
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[_\s.-]+/)
    .filter((t) => t.length > 1);
}

export const sd1AliasCheck: TransformCheck = {
  id: 'SD-1',
  name: 'Alias Misalignment',
  category: 'semantic-drift',
  description:
    'Detects mappings where source and target column names use different terms from the same business concept group — a silent meaning change that creates downstream interpretation risk.',

  evaluate(data: TransformData): TransformFinding[] {
    const evidence: TransformEvidence[] = [];
    let affected = 0;

    for (const m of data.mappings) {
      const srcTokens = tokenize(m.sourceColumn);
      const tgtTokens = tokenize(m.targetColumn);

      for (const group of TERM_CONFLICT_GROUPS) {
        const srcMatch = srcTokens.find((t) => group.terms.includes(t));
        const tgtMatch = tgtTokens.find((t) => group.terms.includes(t));

        if (srcMatch && tgtMatch && srcMatch !== tgtMatch) {
          affected++;
          evidence.push({
            sourceTable: m.sourceTable,
            sourceColumn: m.sourceColumn,
            targetTable: m.targetTable,
            targetColumn: m.targetColumn,
            detail: `"${srcMatch}" mapped to "${tgtMatch}" — both in [${group.label}] group but semantically distinct`,
            metadata: { group: group.label, sourceTerm: srcMatch, targetTerm: tgtMatch },
          });
          break; // one match per mapping
        }
      }
    }

    if (affected === 0) return [];

    const ratio = data.totalMappings > 0 ? affected / data.totalMappings : 0;

    // Severity: 10+ or >15% → critical, 5+ or >8% → major, else minor
    let severity: 'critical' | 'major' | 'minor';
    if (affected >= 10 || ratio > 0.15) severity = 'critical';
    else if (affected >= 5 || ratio > 0.08) severity = 'major';
    else severity = 'minor';

    return [{
      checkId: 'SD-1',
      category: 'semantic-drift',
      severity,
      title: `${affected} mappings silently rename business concepts`,
      description:
        `${affected} of ${data.totalMappings} column mappings use different terms from the same ` +
        `business concept group (e.g. "revenue" mapped to "income"). These are not synonyms — ` +
        `they carry different accounting, legal, and regulatory meanings. Every renamed concept ` +
        `is an interpretation risk that compounds downstream.`,
      evidence,
      affectedMappings: affected,
      totalMappings: data.totalMappings,
      ratio,
      remediation:
        'Standardise column naming to use a single canonical term per business concept. ' +
        'Document alias decisions in a business glossary. If the rename is intentional, ' +
        'add explicit mapping notes explaining the semantic equivalence.',
      costCategories: COST_CATEGORIES,
      costWeights: { ...COST_WEIGHTS },
    }];
  },
};
