// =============================================================================
// P4-LINEAGE-GAPS — Cross-reference pipeline mappings against SchemaData
// =============================================================================
//
// Checks for:
//   1. Coverage ratio — what fraction of schema columns are documented in the
//      pipeline mapping? Low coverage signals lineage gaps.
//   2. Orphan columns — schema columns with no corresponding pipeline mapping
//      (they exist in the target DB but no pipeline claims to produce them).
//   3. Phantom targets — pipeline mappings that reference target tables/columns
//      not found in the schema (the mapping says it writes there, but the
//      table/column doesn't exist).
//
// Dual-mode:
//   - Pipeline-only: if no SchemaData, only basic stats are returned (no findings).
//   - Cross-reference: SchemaData + PipelineMapping → full findings.
// =============================================================================

import type { SchemaData } from '../adapters/types';
import type { PipelineMapping } from '../types/pipeline';
import type { PipelineFinding, PipelineEvidence } from './p1-mapping-drift';

// ---------------------------------------------------------------------------
// Cost weights
// ---------------------------------------------------------------------------

const COST_WEIGHTS = {
  firefighting: 0.2,
  dataQuality: 0.2,
  integration: 0.3,
  productivity: 0.2,
  regulatory: 0.1,
};

const COST_CATEGORIES = ['firefighting', 'dataQuality', 'integration', 'productivity', 'regulatory'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise a table name for comparison (lowercase, strip schema prefix, strip brackets/quotes) */
function normTable(t: string): string {
  return t.toLowerCase()
    .replace(/[\[\]"`]/g, '')
    .split('.').pop()!  // take last segment after dots
    .trim();
}

/** Normalise a column name for comparison */
function normCol(c: string): string {
  return c.toLowerCase().replace(/[\[\]"`]/g, '').trim();
}

// ---------------------------------------------------------------------------
// Check implementation
// ---------------------------------------------------------------------------

/**
 * Execute the P4-LINEAGE-GAPS check.
 *
 * @param pm   Pipeline mapping (required)
 * @param sd   Schema data (optional — if absent, runs in pipeline-only mode)
 * @returns    Array of pipeline findings
 */
export function checkLineageGaps(
  pm: PipelineMapping,
  sd?: SchemaData | null,
): PipelineFinding[] {
  if (!sd || sd.tables.length === 0) {
    // Pipeline-only mode — no schema to cross-reference
    return [];
  }

  const findings: PipelineFinding[] = [];

  // Build schema column set: "normTable::normCol"
  const schemaColumns = new Set<string>();
  const schemaTableSet = new Set<string>();
  for (const col of sd.columns) {
    const nt = normTable(col.table);
    schemaColumns.add(`${nt}::${normCol(col.name)}`);
    schemaTableSet.add(nt);
  }
  for (const t of sd.tables) {
    schemaTableSet.add(normTable(t.name));
  }

  // Build pipeline target set: "normTable::normCol"
  const pipelineTargets = new Set<string>();
  const pipelineTargetTables = new Set<string>();
  for (const m of pm.mappings) {
    const nt = normTable(m.targetTable);
    pipelineTargets.add(`${nt}::${normCol(m.targetColumn)}`);
    pipelineTargetTables.add(nt);
  }

  // --- 1. Coverage ratio ---
  const totalSchemaColumns = schemaColumns.size;
  if (totalSchemaColumns > 0) {
    let coveredCount = 0;
    for (const sc of schemaColumns) {
      if (pipelineTargets.has(sc)) coveredCount++;
    }
    const coverageRatio = coveredCount / totalSchemaColumns;
    const uncoveredCount = totalSchemaColumns - coveredCount;

    if (coverageRatio < 0.9) {
      findings.push({
        checkId: 'P4-LINEAGE-GAPS',
        category: 'ontological-break',
        severity: coverageRatio < 0.3 ? 'critical'
          : coverageRatio < 0.5 ? 'major'
          : coverageRatio < 0.7 ? 'minor'
          : 'info',
        title: `Pipeline coverage: ${(coverageRatio * 100).toFixed(0)}% of schema columns documented`,
        description:
          `Only ${coveredCount} of ${totalSchemaColumns} schema columns (${(coverageRatio * 100).toFixed(1)}%) ` +
          `have a corresponding pipeline mapping. ${uncoveredCount} column(s) have no known lineage, ` +
          `making impact analysis and root-cause debugging difficult.`,
        affectedMappings: uncoveredCount,
        totalMappings: totalSchemaColumns,
        ratio: 1 - coverageRatio,
        remediation:
          'Expand pipeline documentation to cover all target columns. ' +
          'Even identity/pass-through mappings should be documented for full lineage.',
        evidence: [],
        costCategories: COST_CATEGORIES,
        costWeights: { ...COST_WEIGHTS },
      });
    }
  }

  // --- 2. Orphan columns ---
  const orphanEvidence: PipelineEvidence[] = [];
  for (const col of sd.columns) {
    const key = `${normTable(col.table)}::${normCol(col.name)}`;
    // Only consider columns in tables that the pipeline touches
    if (pipelineTargetTables.has(normTable(col.table)) && !pipelineTargets.has(key)) {
      orphanEvidence.push({
        sourceTable: '[unknown]',
        sourceColumn: '[unknown]',
        targetTable: col.table,
        targetColumn: col.name,
        detail: `Column '${col.name}' in table '${col.table}' has no pipeline mapping (orphan)`,
        metadata: { schema: col.schema, dataType: col.dataType },
      });
    }
  }

  if (orphanEvidence.length > 0) {
    const ratio = orphanEvidence.length / totalSchemaColumns;
    findings.push({
      checkId: 'P4-LINEAGE-GAPS',
      category: 'ontological-break',
      severity: orphanEvidence.length > 20 ? 'major'
        : orphanEvidence.length > 5 ? 'minor'
        : 'info',
      title: `${orphanEvidence.length} orphan column(s) in pipeline-targeted tables`,
      description:
        `${orphanEvidence.length} column(s) exist in schema tables that the pipeline writes to, ` +
        `but no pipeline mapping claims to produce them. These columns may be populated by ` +
        `undocumented processes, manual inserts, or legacy logic.`,
      affectedMappings: orphanEvidence.length,
      totalMappings: totalSchemaColumns,
      ratio,
      remediation:
        'Investigate each orphan column. Either add it to the pipeline mapping document, ' +
        'mark it as deprecated, or confirm it is populated by an out-of-scope process.',
      evidence: orphanEvidence,
      costCategories: COST_CATEGORIES,
      costWeights: { ...COST_WEIGHTS },
    });
  }

  // --- 3. Phantom targets ---
  const phantomEvidence: PipelineEvidence[] = [];
  for (const m of pm.mappings) {
    const nt = normTable(m.targetTable);
    const key = `${nt}::${normCol(m.targetColumn)}`;

    // Only flag if the table exists in schema but the column doesn't
    if (schemaTableSet.has(nt) && !schemaColumns.has(key)) {
      phantomEvidence.push({
        sourceTable: m.sourceTable,
        sourceColumn: m.sourceColumn,
        targetTable: m.targetTable,
        targetColumn: m.targetColumn,
        detail: `Pipeline maps to '${m.targetTable}.${m.targetColumn}' but column not found in schema`,
        metadata: { transformType: m.transformType },
      });
    }
  }

  if (phantomEvidence.length > 0) {
    const ratio = phantomEvidence.length / (pm.mappings.length || 1);
    findings.push({
      checkId: 'P4-LINEAGE-GAPS',
      category: 'ontological-break',
      severity: phantomEvidence.length > 10 ? 'major'
        : phantomEvidence.length > 3 ? 'minor'
        : 'info',
      title: `${phantomEvidence.length} phantom target(s) in pipeline mapping`,
      description:
        `${phantomEvidence.length} pipeline mapping(s) reference target columns that do not exist ` +
        `in the current schema. The mapping document may be outdated, or columns may have been ` +
        `renamed or dropped since the mapping was written.`,
      affectedMappings: phantomEvidence.length,
      totalMappings: pm.mappings.length,
      ratio,
      remediation:
        'Update the pipeline mapping to reflect the current schema. Remove references to ' +
        'dropped columns and update renamed columns.',
      evidence: phantomEvidence,
      costCategories: COST_CATEGORIES,
      costWeights: { ...COST_WEIGHTS },
    });
  }

  return findings;
}
