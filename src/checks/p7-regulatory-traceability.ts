import type { SchemaData } from '../adapters/types';
import type { Finding, Evidence, ScannerCheck, ScannerConfig, CostCategory } from './types';

// =============================================================================
// Audit column pattern groups
// =============================================================================
const CREATED_PATTERNS = [
  'created_at',
  'create_date',
  'created_date',
  'created_by',
];

const UPDATED_PATTERNS = [
  'updated_at',
  'update_date',
  'modified_date',
  'modified_by',
  'updated_by',
  'last_modified',
  'modify_date',
  'audit_timestamp',
];

function hasMatchingColumn(
  columnNames: string[],
  patterns: string[],
): boolean {
  return columnNames.some((colName) => {
    const lower = colName.toLowerCase();
    return patterns.some((pattern) => lower === pattern);
  });
}

// =============================================================================
// p7MissingAudit
// =============================================================================
export const p7MissingAudit: ScannerCheck = {
  id: 'p7-missing-audit',
  property: 7,
  name: 'Tables Missing Audit Columns',
  description:
    'Identifies tables that lack standard audit columns (created/updated timestamps or user tracking).',

  execute(schema: SchemaData, _config: ScannerConfig): Finding[] {
    const tables = schema.tables.filter((t) => t.type === 'table');
    if (tables.length === 0) return [];

    // Group columns by table
    const columnsByTable = new Map<string, string[]>();
    for (const col of schema.columns) {
      const key = `${col.schema}.${col.table}`;
      if (!columnsByTable.has(key)) {
        columnsByTable.set(key, []);
      }
      columnsByTable.get(key)!.push(col.name);
    }

    const missingAudit: typeof tables = [];

    for (const table of tables) {
      const key = `${table.schema}.${table.name}`;
      const colNames = columnsByTable.get(key) ?? [];

      const hasCreated = hasMatchingColumn(colNames, CREATED_PATTERNS);
      const hasUpdated = hasMatchingColumn(colNames, UPDATED_PATTERNS);

      if (!hasCreated || !hasUpdated) {
        missingAudit.push(table);
      }
    }

    const affectedObjects = missingAudit.length;
    const totalObjects = tables.length;

    if (affectedObjects === 0) return [];

    const ratio = totalObjects > 0 ? affectedObjects / totalObjects : 0;

    let severity: Finding['severity'];
    if (ratio >= 0.5) severity = 'critical';
    else if (ratio >= 0.25) severity = 'major';
    else severity = 'minor';

    const costWeights: Record<CostCategory, number> = {
      firefighting: 0.2,
      dataQuality: 0.1,
      integration: 0,
      productivity: 0.1,
      regulatory: 0.6,
    };

    const costCategories: CostCategory[] = (
      Object.entries(costWeights) as [CostCategory, number][]
    )
      .filter(([, w]) => w > 0)
      .map(([k]) => k);

    const evidence: Evidence[] = missingAudit.map((t) => {
      const key = `${t.schema}.${t.name}`;
      const colNames = columnsByTable.get(key) ?? [];
      const hasCreated = hasMatchingColumn(colNames, CREATED_PATTERNS);
      const hasUpdated = hasMatchingColumn(colNames, UPDATED_PATTERNS);

      const missing: string[] = [];
      if (!hasCreated) missing.push('created');
      if (!hasUpdated) missing.push('updated/modified');

      return {
        schema: t.schema,
        table: t.name,
        detail: `Table "${t.schema}"."${t.name}" is missing ${missing.join(' and ')} audit columns`,
      };
    });

    return [
      {
        checkId: 'p7-missing-audit',
        property: 7,
        severity,
        rawScore: 0,
        title: 'Tables missing audit columns',
        description: `${affectedObjects} of ${totalObjects} tables (${(ratio * 100).toFixed(1)}%) lack standard audit columns for tracking record creation and modification.`,
        evidence,
        affectedObjects,
        totalObjects,
        ratio,
        remediation:
          'Add created_at/updated_at timestamp columns and optionally created_by/updated_by user-tracking columns to all tables to support audit and compliance requirements.',
        costCategories,
        costWeights,
      },
    ];
  },
};

// =============================================================================
// p7NoConstraints
// =============================================================================
export const p7NoConstraints: ScannerCheck = {
  id: 'p7-no-constraints',
  property: 7,
  name: 'Tables With No Constraints',
  description:
    'Finds tables that have zero constraints of any type (no PK, FK, CHECK, or UNIQUE), indicating lack of data integrity enforcement.',

  execute(schema: SchemaData, _config: ScannerConfig): Finding[] {
    const tables = schema.tables.filter((t) => t.type === 'table');
    if (tables.length === 0) return [];

    // Build a set of tables that have at least one constraint
    const tablesWithConstraints = new Set<string>();
    for (const c of schema.constraints) {
      tablesWithConstraints.add(`${c.schema}.${c.table}`);
    }

    const noConstraintTables = tables.filter(
      (t) => !tablesWithConstraints.has(`${t.schema}.${t.name}`),
    );

    const affectedObjects = noConstraintTables.length;
    const totalObjects = tables.length;

    if (affectedObjects === 0) return [];

    const ratio = totalObjects > 0 ? affectedObjects / totalObjects : 0;

    let severity: Finding['severity'];
    if (affectedObjects >= 15) severity = 'critical';
    else if (affectedObjects >= 5) severity = 'major';
    else severity = 'minor';

    const costWeights: Record<CostCategory, number> = {
      firefighting: 0.1,
      dataQuality: 0.3,
      integration: 0.1,
      productivity: 0.1,
      regulatory: 0.4,
    };

    const costCategories: CostCategory[] = (
      Object.entries(costWeights) as [CostCategory, number][]
    )
      .filter(([, w]) => w > 0)
      .map(([k]) => k);

    const evidence: Evidence[] = noConstraintTables.map((t) => ({
      schema: t.schema,
      table: t.name,
      detail: `Table "${t.schema}"."${t.name}" has no constraints (no PK, FK, CHECK, or UNIQUE)`,
    }));

    return [
      {
        checkId: 'p7-no-constraints',
        property: 7,
        severity,
        rawScore: 0,
        title: 'Tables with no constraints',
        description: `${affectedObjects} of ${totalObjects} tables have zero constraints, meaning no database-level data integrity enforcement.`,
        evidence,
        affectedObjects,
        totalObjects,
        ratio,
        remediation:
          'Add appropriate constraints (primary keys, foreign keys, check constraints, unique constraints) to enforce data integrity at the database level.',
        costCategories,
        costWeights,
      },
    ];
  },
};
