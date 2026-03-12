import type { SchemaData, NormalizedType } from '../adapters/types';
import type {
  CostCategory,
  Evidence,
  Finding,
  ScannerCheck,
  ScannerConfig,
} from './types';
import { getDbContext } from './db-context';

// =============================================================================
// String-like normalized types for uncontrolled vocab detection
// =============================================================================
const STRING_TYPES: Set<NormalizedType> = new Set(['text', 'varchar', 'char']);

// =============================================================================
// P2-TYPE-INCONSISTENCY
// Group columns by name across all tables. For columns appearing in 2+ tables,
// compare normalizedType. Flag groups where same column name has different types.
// =============================================================================

const TYPE_INCONSISTENCY_COST_WEIGHTS: Record<CostCategory, number> = {
  firefighting: 0.2,
  dataQuality: 0.4,
  integration: 0.3,
  productivity: 0.1,
  regulatory: 0,
  aiMlRiskExposure: 0,
};

const TYPE_INCONSISTENCY_ACTIVE_CATEGORIES: CostCategory[] = [
  'firefighting',
  'dataQuality',
  'integration',
  'productivity',
];

export const p2TypeInconsistency: ScannerCheck = {
  id: 'P2-TYPE-INCONSISTENCY',
  property: 2,
  name: 'Column Type Inconsistency',
  description:
    'Detect columns with the same name but different types across tables.',

  execute(schema: SchemaData, _config: ScannerConfig): Finding[] {
    const ctx = getDbContext(schema);

    // Group columns by name
    const columnGroups = new Map<
      string,
      { schema: string; table: string; normalizedType: NormalizedType }[]
    >();

    for (const col of schema.columns) {
      const key = col.name.toLowerCase();
      if (!columnGroups.has(key)) {
        columnGroups.set(key, []);
      }
      columnGroups.get(key)!.push({
        schema: col.schema,
        table: col.table,
        normalizedType: col.normalizedType,
      });
    }

    const findings: Finding[] = [];
    let totalMultiTableColumns = 0;
    let inconsistentColumns = 0;

    for (const [colName, occurrences] of columnGroups) {
      // Only consider columns appearing in 2+ tables
      if (occurrences.length < 2) continue;
      totalMultiTableColumns++;

      const distinctTypes = new Set(occurrences.map((o) => o.normalizedType));
      if (distinctTypes.size < 2) continue;

      inconsistentColumns++;

      const evidence: Evidence[] = occurrences.map((occ) => ({
        schema: occ.schema,
        table: occ.table,
        column: colName,
        detail: `Column "${colName}" has type "${occ.normalizedType}" in ${occ.schema}.${occ.table}`,
      }));

      // Severity: 3+ types → critical, else major
      const sev: 'critical' | 'major' = distinctTypes.size >= 3 ? 'critical' : 'major';

      const ratio =
        totalMultiTableColumns > 0
          ? inconsistentColumns / totalMultiTableColumns
          : 0;

      findings.push({
        checkId: 'P2-TYPE-INCONSISTENCY',
        property: 2,
        severity: sev,
        rawScore: 0,
        title: `Column "${colName}" has ${distinctTypes.size} different types across tables`,
        description:
          `Column "${colName}" appears in ${occurrences.length} tables with ${distinctTypes.size} distinct types: ` +
          `[${Array.from(distinctTypes).join(', ')}]. This causes implicit type coercion, failed joins, and data quality issues.`,
        evidence,
        affectedObjects: occurrences.length,
        totalObjects: occurrences.length,
        ratio: 1,
        remediation: ctx.remediation.typeInconsistency,
        costCategories: TYPE_INCONSISTENCY_ACTIVE_CATEGORIES,
        costWeights: { ...TYPE_INCONSISTENCY_COST_WEIGHTS },
        evidenceInput: {
          asset: {
            type: 'column',
            key: `${occurrences[0].schema}.${occurrences[0].table}.${colName}`,
            name: colName,
            schema: occurrences[0].schema,
            table: occurrences[0].table,
            column: colName,
          },
          metric: {
            name: 'type_count',
            observed: distinctTypes.size,
            unit: 'types',
            displayText: `${distinctTypes.size} distinct types for column "${colName}" across ${occurrences.length} tables`,
          },
          samples: occurrences.slice(0, 10).map(occ => ({
            label: `Type: ${occ.normalizedType}`,
            value: `${occ.schema}.${occ.table}.${colName}`,
            context: { normalizedType: occ.normalizedType },
          })),
          explanation: {
            whatWasFound: `Column "${colName}" has ${distinctTypes.size} different types across ${occurrences.length} tables: [${Array.from(distinctTypes).join(', ')}]`,
            whyItMatters: 'Type inconsistency causes implicit coercion in joins, silent data loss during ETL, and unreliable analytics when the same logical column has different types',
            howDetected: 'Grouped columns by name across all tables and compared their normalized data types',
          },
        },
      });
    }

    // Update ratio on all findings now that we have totals
    for (const f of findings) {
      f.ratio =
        totalMultiTableColumns > 0
          ? inconsistentColumns / totalMultiTableColumns
          : 0;
    }

    return findings;
  },
};

// =============================================================================
// P2-UNCONTROLLED-VOCAB
// Find string columns with distinctCount between 2–50 and no FK constraint.
// These are likely uncontrolled vocabularies.
// =============================================================================

const UNCONTROLLED_VOCAB_COST_WEIGHTS: Record<CostCategory, number> = {
  firefighting: 0.1,
  dataQuality: 0.5,
  integration: 0.3,
  productivity: 0.1,
  regulatory: 0,
  aiMlRiskExposure: 0,
};

const UNCONTROLLED_VOCAB_ACTIVE_CATEGORIES: CostCategory[] = [
  'firefighting',
  'dataQuality',
  'integration',
  'productivity',
];

export const p2UncontrolledVocab: ScannerCheck = {
  id: 'P2-UNCONTROLLED-VOCAB',
  property: 2,
  name: 'Uncontrolled Vocabularies',
  description:
    'Detect string columns with low-to-moderate cardinality that lack FK constraints, suggesting uncontrolled vocabularies.',

  execute(schema: SchemaData, _config: ScannerConfig): Finding[] {
    // Build a set of columns that have FK constraints (as source)
    const fkColumns = new Set<string>();
    for (const fk of schema.foreignKeys) {
      fkColumns.add(`${fk.schema}.${fk.table}.${fk.column}`.toLowerCase());
    }

    // Build a stats lookup: "schema.table.column" → ColumnStatistics
    const statsMap = new Map<string, { distinctCount: number | null }>();
    for (const stat of schema.columnStatistics) {
      const key = `${stat.schema}.${stat.table}.${stat.column}`.toLowerCase();
      statsMap.set(key, { distinctCount: stat.distinctCount });
    }

    // Find string columns matching criteria
    const uncontrolledColumns: {
      schema: string;
      table: string;
      column: string;
      distinctCount: number;
    }[] = [];

    const totalStringColumns: Set<string> = new Set();

    for (const col of schema.columns) {
      if (!STRING_TYPES.has(col.normalizedType)) continue;

      const colKey = `${col.schema}.${col.table}.${col.name}`.toLowerCase();
      totalStringColumns.add(colKey);

      // Check if column has a FK constraint
      if (fkColumns.has(colKey)) continue;

      // Check distinctCount from statistics
      const stats = statsMap.get(colKey);
      if (!stats || stats.distinctCount === null) continue;

      if (stats.distinctCount >= 2 && stats.distinctCount <= 50) {
        uncontrolledColumns.push({
          schema: col.schema,
          table: col.table,
          column: col.name,
          distinctCount: stats.distinctCount,
        });
      }
    }

    if (uncontrolledColumns.length === 0) {
      return [];
    }

    const affectedCount = uncontrolledColumns.length;
    const totalCount = totalStringColumns.size;

    // Severity: 20+ → critical, 10+ → major, else minor
    let sev: 'critical' | 'major' | 'minor';
    if (affectedCount >= 20) {
      sev = 'critical';
    } else if (affectedCount >= 10) {
      sev = 'major';
    } else {
      sev = 'minor';
    }

    const evidence: Evidence[] = uncontrolledColumns.map((uc) => ({
      schema: uc.schema,
      table: uc.table,
      column: uc.column,
      detail: `String column "${uc.column}" has ${uc.distinctCount} distinct values with no FK constraint`,
      metadata: { distinctCount: uc.distinctCount },
    }));

    const ratio = totalCount > 0 ? affectedCount / totalCount : 0;

    return [
      {
        checkId: 'P2-UNCONTROLLED-VOCAB',
        property: 2,
        severity: sev,
        rawScore: 0,
        title: `${affectedCount} string columns detected as uncontrolled vocabularies`,
        description:
          `${affectedCount} string columns have between 2–50 distinct values and no foreign key constraint. ` +
          `These are likely uncontrolled vocabularies that should be replaced with reference tables.`,
        evidence,
        affectedObjects: affectedCount,
        totalObjects: totalCount,
        ratio,
        remediation:
          'Create reference/lookup tables for columns with controlled value sets. Add FK constraints to enforce referential integrity.',
        costCategories: UNCONTROLLED_VOCAB_ACTIVE_CATEGORIES,
        costWeights: { ...UNCONTROLLED_VOCAB_COST_WEIGHTS },
        evidenceInput: {
          asset: {
            type: 'column',
            key: `${uncontrolledColumns[0].schema}.${uncontrolledColumns[0].table}.${uncontrolledColumns[0].column}`,
            name: uncontrolledColumns[0].column,
            schema: uncontrolledColumns[0].schema,
            table: uncontrolledColumns[0].table,
            column: uncontrolledColumns[0].column,
          },
          metric: {
            name: 'uncontrolled_vocab_columns',
            observed: affectedCount,
            unit: 'columns',
            displayText: `${affectedCount} of ${totalCount} string columns are likely uncontrolled vocabularies`,
          },
          samples: uncontrolledColumns.slice(0, 10).map(uc => ({
            label: `${uc.distinctCount} distinct values, no FK`,
            value: `${uc.schema}.${uc.table}.${uc.column}`,
            context: { distinctCount: uc.distinctCount },
          })),
          explanation: {
            whatWasFound: `${affectedCount} string columns have 2–50 distinct values with no foreign key constraint`,
            whyItMatters: 'Uncontrolled vocabularies allow data entry inconsistencies (typos, casing, synonyms) that corrupt analytics and reporting',
            howDetected: 'Identified string columns with low-to-moderate cardinality (2–50 distinct values) that lack foreign key constraints to a reference table',
          },
        },
      },
    ];
  },
};
