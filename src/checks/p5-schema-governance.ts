import type { SchemaData } from '../adapters/types';
import type { Finding, Evidence, ScannerCheck, ScannerConfig, CostCategory } from './types';
import { getDbContext } from './db-context';

// =============================================================================
// Naming style detection
// =============================================================================
type NamingStyle = 'snake_case' | 'camelCase' | 'PascalCase' | 'UPPER_SNAKE' | 'mixed';

const SNAKE_CASE_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;
const CAMEL_CASE_RE = /^[a-z][a-zA-Z0-9]*$/;
const PASCAL_CASE_RE = /^[A-Z][a-zA-Z0-9]*$/;
const UPPER_SNAKE_RE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

function detectStyle(name: string): NamingStyle {
  if (SNAKE_CASE_RE.test(name)) return 'snake_case';
  if (UPPER_SNAKE_RE.test(name)) return 'UPPER_SNAKE';
  if (CAMEL_CASE_RE.test(name) && /[A-Z]/.test(name)) return 'camelCase';
  if (PASCAL_CASE_RE.test(name)) return 'PascalCase';
  return 'mixed';
}

// =============================================================================
// p5NamingViolations
// =============================================================================
export const p5NamingViolations: ScannerCheck = {
  id: 'p5-naming-violations',
  property: 5,
  name: 'Naming Convention Violations',
  description:
    'Detects columns that deviate from the dominant naming convention used across the schema.',

  execute(schema: SchemaData, _config: ScannerConfig): Finding[] {
    const ctx = getDbContext(schema);
    const columns = schema.columns;
    if (columns.length === 0) return [];

    // Classify every column name
    const styleCounts: Record<NamingStyle, number> = {
      snake_case: 0,
      camelCase: 0,
      PascalCase: 0,
      UPPER_SNAKE: 0,
      mixed: 0,
    };

    const columnStyles: { col: typeof columns[number]; style: NamingStyle }[] = [];

    for (const col of columns) {
      const style = detectStyle(col.name);
      styleCounts[style]++;
      columnStyles.push({ col, style });
    }

    // Determine dominant style
    let dominant: NamingStyle = 'snake_case';
    let maxCount = 0;
    for (const [style, count] of Object.entries(styleCounts) as [NamingStyle, number][]) {
      if (count > maxCount) {
        maxCount = count;
        dominant = style;
      }
    }

    // Collect violations (columns not matching dominant style)
    const violations = columnStyles.filter((cs) => cs.style !== dominant);
    const totalObjects = columns.length;
    const affectedObjects = violations.length;

    if (affectedObjects === 0) return [];

    const ratio = totalObjects > 0 ? affectedObjects / totalObjects : 0;

    // Severity based on violation percentage
    let severity: Finding['severity'];
    if (ratio >= 0.3) severity = 'critical';
    else if (ratio >= 0.15) severity = 'major';
    else severity = 'minor';

    const costWeights: Record<CostCategory, number> = {
      firefighting: 0.3,
      dataQuality: 0.1,
      integration: 0.1,
      productivity: 0.5,
      regulatory: 0,
      aiMlRiskExposure: 0,
    };

    const costCategories: CostCategory[] = (
      Object.entries(costWeights) as [CostCategory, number][]
    )
      .filter(([, w]) => w > 0)
      .map(([k]) => k);

    const evidence: Evidence[] = violations.map((v) => ({
      schema: v.col.schema,
      table: v.col.table,
      column: v.col.name,
      detail: `Column "${v.col.name}" uses ${v.style} style (dominant is ${dominant})`,
    }));

    return [
      {
        checkId: 'p5-naming-violations',
        property: 5,
        severity,
        rawScore: 0,
        title: `Naming convention violations (dominant: ${dominant})`,
        description: `${affectedObjects} of ${totalObjects} columns (${(ratio * 100).toFixed(1)}%) deviate from the dominant naming convention "${dominant}".`,
        evidence,
        affectedObjects,
        totalObjects,
        ratio,
        remediation: ctx.remediation.namingViolations,
        costCategories,
        costWeights,
      },
    ];
  },
};

// =============================================================================
// p5MissingPk
// =============================================================================
export const p5MissingPk: ScannerCheck = {
  id: 'p5-missing-pk',
  property: 5,
  name: 'Tables Missing Primary Keys',
  description: 'Identifies tables that lack a primary key constraint.',

  execute(schema: SchemaData, _config: ScannerConfig): Finding[] {
    const ctx = getDbContext(schema);
    const isCsvSource = schema.databaseType === 'csv';

    const tables = schema.tables.filter((t) => t.type === 'table');
    if (tables.length === 0) return [];

    // Build a set of tables that have a primary_key constraint
    const tablesWithPk = new Set<string>();
    for (const c of schema.constraints) {
      if (c.type === 'primary_key') {
        tablesWithPk.add(`${c.schema}.${c.table}`);
      }
    }

    const missing = tables.filter((t) => !tablesWithPk.has(`${t.schema}.${t.name}`));
    const affectedObjects = missing.length;
    const totalObjects = tables.length;

    if (affectedObjects === 0) return [];

    const ratio = totalObjects > 0 ? affectedObjects / totalObjects : 0;

    let severity: Finding['severity'];
    if (affectedObjects >= 10) severity = 'critical';
    else if (affectedObjects >= 5) severity = 'major';
    else severity = 'minor';

    // CSV sources get downgraded severity — heuristic PK detection is best-effort
    if (isCsvSource) {
      if (severity === 'critical') severity = 'major';
      else if (severity === 'major') severity = 'minor';
      else severity = 'info';
    }

    const costWeights: Record<CostCategory, number> = {
      firefighting: 0.2,
      dataQuality: 0.3,
      integration: 0.2,
      productivity: 0.1,
      regulatory: 0.2,
      aiMlRiskExposure: 0,
    };

    const costCategories: CostCategory[] = (
      Object.entries(costWeights) as [CostCategory, number][]
    )
      .filter(([, w]) => w > 0)
      .map(([k]) => k);

    const evidence: Evidence[] = missing.map((t) => ({
      schema: t.schema,
      table: t.name,
      detail: `Table "${t.schema}"."${t.name}" has no primary key constraint`,
    }));

    return [
      {
        checkId: 'p5-missing-pk',
        property: 5,
        severity,
        rawScore: 0,
        title: 'Tables missing primary keys',
        description: `${affectedObjects} of ${totalObjects} tables have no primary key constraint defined.`,
        evidence,
        affectedObjects,
        totalObjects,
        ratio,
        remediation: ctx.remediation.missingPk,
        costCategories,
        costWeights,
      },
    ];
  },
};

// =============================================================================
// p5Undocumented
// =============================================================================
export const p5Undocumented: ScannerCheck = {
  id: 'p5-undocumented',
  property: 5,
  name: 'Undocumented Tables',
  description:
    'Detects tables that lack comments/documentation. Only runs when the database supports and provides comment metadata.',

  execute(schema: SchemaData, _config: ScannerConfig): Finding[] {
    const ctx = getDbContext(schema);
    // Skip if comments metadata is not available
    if (!schema.comments || schema.comments.length === 0) return [];

    const tables = schema.tables.filter((t) => t.type === 'table');
    if (tables.length === 0) return [];

    // Build set of documented tables from comments
    const documentedTables = new Set<string>();
    for (const c of schema.comments) {
      if (c.objectType === 'table') {
        documentedTables.add(`${c.schema}.${c.objectName}`);
      }
    }

    const undocumented = tables.filter(
      (t) => !documentedTables.has(`${t.schema}.${t.name}`),
    );

    const affectedObjects = undocumented.length;
    const totalObjects = tables.length;

    if (affectedObjects === 0) return [];

    const ratio = totalObjects > 0 ? affectedObjects / totalObjects : 0;

    let severity: Finding['severity'];
    if (ratio >= 0.5) severity = 'major';
    else severity = 'minor';

    const costWeights: Record<CostCategory, number> = {
      firefighting: 0.2,
      dataQuality: 0.1,
      integration: 0.1,
      productivity: 0.6,
      regulatory: 0,
      aiMlRiskExposure: 0,
    };

    const costCategories: CostCategory[] = (
      Object.entries(costWeights) as [CostCategory, number][]
    )
      .filter(([, w]) => w > 0)
      .map(([k]) => k);

    const evidence: Evidence[] = undocumented.map((t) => ({
      schema: t.schema,
      table: t.name,
      detail: `Table "${t.schema}"."${t.name}" has no comment/documentation`,
    }));

    return [
      {
        checkId: 'p5-undocumented',
        property: 5,
        severity,
        rawScore: 0,
        title: 'Undocumented tables',
        description: `${affectedObjects} of ${totalObjects} tables (${(ratio * 100).toFixed(1)}%) have no documentation comments.`,
        evidence,
        affectedObjects,
        totalObjects,
        ratio,
        remediation: ctx.remediation.undocumented,
        costCategories,
        costWeights,
      },
    ];
  },
};
