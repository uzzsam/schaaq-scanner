// OB-3: Category Flattening
// Detects when source columns that encode categorical/type distinctions are dropped
// or absent in the target — flattening meaningful hierarchies.

import type { TransformCheck, TransformData, TransformFinding, TransformEvidence, TransformCostCategory } from '../types';

const COST_WEIGHTS: Record<TransformCostCategory, number> = {
  firefighting: 0.2,
  dataQuality: 0.3,
  integration: 0.2,
  productivity: 0.2,
  regulatory: 0.1,
};

const COST_CATEGORIES: TransformCostCategory[] = [
  'firefighting', 'dataQuality', 'integration', 'productivity',
];

// Column name patterns that typically carry categorical information
const CATEGORY_PATTERNS = [
  /type$/i, /category$/i, /class$/i, /status$/i, /level$/i,
  /tier$/i, /grade$/i, /rank$/i, /group$/i, /kind$/i,
  /classification$/i, /segment$/i, /bucket$/i, /band$/i,
  /_type$/i, /_category$/i, /_class$/i, /_status$/i,
  /_level$/i, /_tier$/i, /_grade$/i, /_rank$/i, /_group$/i,
];

function isCategoryColumn(name: string): boolean {
  return CATEGORY_PATTERNS.some((re) => re.test(name));
}

export const ob3CategoryFlatteningCheck: TransformCheck = {
  id: 'OB-3',
  name: 'Category Flattening',
  category: 'ontological-break',
  description:
    'Detects when source columns carrying categorical distinctions (type, status, category, grade) ' +
    'are present in source tables but absent from their target mappings — flattening meaningful hierarchies.',

  evaluate(data: TransformData): TransformFinding[] {
    const evidence: TransformEvidence[] = [];

    // Group mappings by source table
    const sourceTableMappings = new Map<string, TransformData['mappings']>();
    for (const m of data.mappings) {
      const key = m.sourceTable.toLowerCase();
      if (!sourceTableMappings.has(key)) sourceTableMappings.set(key, []);
      sourceTableMappings.get(key)!.push(m);
    }

    // For each source table, find category columns that are mapped
    // and check if any category columns from the same table are NOT mapped
    let affected = 0;

    for (const [srcTable, mappings] of sourceTableMappings) {
      const mappedSourceCols = new Set(mappings.map((m) => m.sourceColumn.toLowerCase()));
      const categoryColsMapped = Array.from(mappedSourceCols).filter(isCategoryColumn);
      const allSourceCols = mappings.map((m) => m.sourceColumn);

      // Look for category columns that appear in source column names but are NOT mapped
      // We detect this by checking if a source table has non-category columns mapped
      // but its category columns are absent (i.e. no mapping row for them)
      for (const m of mappings) {
        // Check: does the source column look like a category column?
        if (isCategoryColumn(m.sourceColumn)) {
          // Is the target column name generic or different enough to suggest flattening?
          // e.g. source has "product_type" but target drops it entirely
          // We detect "dropping" when a category column maps to nothing meaningful
          // For now, focus on detecting category columns in source that have no mapping
          continue; // This column IS mapped, so it's fine
        }
      }

      // Alternative approach: find target tables that receive data from this source
      // but don't receive any category columns
      const targetTables = new Set(mappings.map((m) => m.targetTable.toLowerCase()));
      for (const tgtTable of targetTables) {
        const tgtMappings = mappings.filter((m) => m.targetTable.toLowerCase() === tgtTable);
        const tgtMappedSrcCols = new Set(tgtMappings.map((m) => m.sourceColumn.toLowerCase()));

        // Find category columns from ALL source cols of this table that are NOT in this target mapping
        const allSourceColsForTable = Array.from(mappedSourceCols);
        const categoryCols = allSourceColsForTable.filter(isCategoryColumn);
        const unmappedCategoryCols = categoryCols.filter((c) => !tgtMappedSrcCols.has(c));

        if (unmappedCategoryCols.length > 0 && tgtMappings.length >= 2) {
          affected++;
          evidence.push({
            sourceTable: srcTable,
            sourceColumn: unmappedCategoryCols.join(', '),
            targetTable: tgtTable,
            targetColumn: '(missing)',
            detail: `Category columns [${unmappedCategoryCols.join(', ')}] from "${srcTable}" are dropped in target "${tgtTable}" — flattening categorical distinctions`,
            metadata: { droppedColumns: unmappedCategoryCols },
          });
        }
      }
    }

    if (affected === 0) return [];

    const ratio = data.totalMappings > 0 ? affected / data.totalMappings : 0;

    let severity: 'critical' | 'major' | 'minor';
    if (affected >= 5) severity = 'critical';
    else if (affected >= 3) severity = 'major';
    else severity = 'minor';

    return [{
      checkId: 'OB-3',
      category: 'ontological-break',
      severity,
      title: `${affected} category columns dropped during transformation`,
      description:
        `${affected} categorical columns (type, status, category, grade, etc.) are present in source tables ` +
        `but absent from their target mappings. Dropping category columns flattens meaningful ` +
        `business hierarchies — every downstream consumer loses the ability to filter, group, ` +
        `or report by these dimensions without re-engineering the data.`,
      evidence,
      affectedMappings: affected,
      totalMappings: data.totalMappings,
      ratio,
      remediation:
        'Preserve category columns in the target schema. If intentionally dropped, document ' +
        'why the categorical distinction is not needed downstream. If the target uses a different ' +
        'classification system, map the values explicitly rather than dropping them.',
      costCategories: COST_CATEGORIES,
      costWeights: { ...COST_WEIGHTS },
    }];
  },
};
