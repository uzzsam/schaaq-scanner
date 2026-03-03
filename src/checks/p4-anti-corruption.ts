import type { SchemaData } from '../adapters/types';
import type {
  CostCategory,
  Evidence,
  Finding,
  ScannerCheck,
  ScannerConfig,
} from './types';

// =============================================================================
// CSV / Import indicator patterns
// =============================================================================
const DEFAULT_CSV_PATTERNS: string[] = [
  'import',
  'load',
  'batch',
  'source_file',
  'csv',
  'xlsx',
  'staging',
  'raw',
  'ingest',
  'upload',
  'extract',
  'stg_',
  'tmp_',
  'temp_',
  'external',
  '_backup',
  '_final',
  '_v2',
];

// =============================================================================
// P4-CSV-IMPORT-PATTERN
// Match table and column names against CSV/import indicator patterns.
// =============================================================================

const CSV_IMPORT_COST_WEIGHTS: Record<CostCategory, number> = {
  firefighting: 0.4,
  dataQuality: 0.2,
  integration: 0.3,
  productivity: 0.1,
  regulatory: 0,
};

const CSV_IMPORT_ACTIVE_CATEGORIES: CostCategory[] = [
  'firefighting',
  'dataQuality',
  'integration',
  'productivity',
];

export const p4CsvImportPattern: ScannerCheck = {
  id: 'P4-CSV-IMPORT-PATTERN',
  property: 4,
  name: 'CSV/Import Patterns',
  description:
    'Detect tables and columns whose names suggest ad-hoc CSV imports or staging data that has not been properly integrated.',

  execute(schema: SchemaData, config: ScannerConfig): Finding[] {
    // When source IS CSV, flagging CSV patterns is circular
    if (schema.databaseType === 'csv') return [];

    const patterns = config.thresholds.csvIndicatorPatterns ?? DEFAULT_CSV_PATTERNS;
    const lowerPatterns = patterns.map((p) => p.toLowerCase());

    // Track unique affected tables
    const affectedTables = new Map<
      string,
      { schema: string; table: string; matchedPatterns: string[] }
    >();

    // Check table names
    for (const tbl of schema.tables) {
      const lowerName = tbl.name.toLowerCase();
      for (const pattern of lowerPatterns) {
        if (lowerName.includes(pattern)) {
          const key = `${tbl.schema}.${tbl.name}`.toLowerCase();
          if (!affectedTables.has(key)) {
            affectedTables.set(key, {
              schema: tbl.schema,
              table: tbl.name,
              matchedPatterns: [],
            });
          }
          affectedTables.get(key)!.matchedPatterns.push(pattern);
          break; // One match per table name is enough
        }
      }
    }

    // Check column names — if a column matches, flag its parent table
    for (const col of schema.columns) {
      const lowerColName = col.name.toLowerCase();
      for (const pattern of lowerPatterns) {
        if (lowerColName.includes(pattern)) {
          const key = `${col.schema}.${col.table}`.toLowerCase();
          if (!affectedTables.has(key)) {
            affectedTables.set(key, {
              schema: col.schema,
              table: col.table,
              matchedPatterns: [],
            });
          }
          affectedTables.get(key)!.matchedPatterns.push(`column:${col.name}→${pattern}`);
          break; // One match per column is enough
        }
      }
    }

    if (affectedTables.size === 0) {
      return [];
    }

    const affectedCount = affectedTables.size;
    const totalTables = schema.tables.length;

    // Severity: 10+ tables → critical, 5+ → major, else minor
    let sev: 'critical' | 'major' | 'minor';
    if (affectedCount >= 10) {
      sev = 'critical';
    } else if (affectedCount >= 5) {
      sev = 'major';
    } else {
      sev = 'minor';
    }

    const evidence: Evidence[] = Array.from(affectedTables.values()).map((at) => ({
      schema: at.schema,
      table: at.table,
      detail: `Table "${at.schema}.${at.table}" matches import patterns: [${at.matchedPatterns.join(', ')}]`,
      metadata: { matchedPatterns: at.matchedPatterns },
    }));

    const ratio = totalTables > 0 ? affectedCount / totalTables : 0;

    return [
      {
        checkId: 'P4-CSV-IMPORT-PATTERN',
        property: 4,
        severity: sev,
        rawScore: 0,
        title: `${affectedCount} tables show CSV/import naming patterns`,
        description:
          `${affectedCount} of ${totalTables} tables have names or columns matching ad-hoc import patterns ` +
          `(e.g. staging, raw, csv, tmp). These suggest data pipelines that bypass proper ETL integration.`,
        evidence,
        affectedObjects: affectedCount,
        totalObjects: totalTables,
        ratio,
        remediation:
          'Replace ad-hoc CSV imports with proper ETL pipelines. Migrate staging/temp tables into governed schemas ' +
          'with appropriate naming conventions and lifecycle management.',
        costCategories: CSV_IMPORT_ACTIVE_CATEGORIES,
        costWeights: { ...CSV_IMPORT_COST_WEIGHTS },
      },
    ];
  },
};

// =============================================================================
// P4-ISLAND-TABLES
// Find tables with NO FK relationships (neither source nor target).
// Only count actual tables (type === 'table'), exclude views/materialized views.
// =============================================================================

const ISLAND_TABLES_COST_WEIGHTS: Record<CostCategory, number> = {
  firefighting: 0.2,
  dataQuality: 0.3,
  integration: 0.4,
  productivity: 0.1,
  regulatory: 0,
};

const ISLAND_TABLES_ACTIVE_CATEGORIES: CostCategory[] = [
  'firefighting',
  'dataQuality',
  'integration',
  'productivity',
];

export const p4IslandTables: ScannerCheck = {
  id: 'P4-ISLAND-TABLES',
  property: 4,
  name: 'Island Tables',
  description:
    'Detect tables with no foreign key relationships (neither as source nor target), indicating disconnected data islands.',

  execute(schema: SchemaData, _config: ScannerConfig): Finding[] {
    // Only consider actual tables, not views or materialized views
    const actualTables = schema.tables.filter((t) => t.type === 'table');

    if (actualTables.length === 0) {
      return [];
    }

    // Build set of tables that participate in any FK relationship
    const connectedTables = new Set<string>();
    for (const fk of schema.foreignKeys) {
      connectedTables.add(`${fk.schema}.${fk.table}`.toLowerCase());
      connectedTables.add(
        `${fk.referencedSchema}.${fk.referencedTable}`.toLowerCase(),
      );
    }

    // Find island tables
    const islands: { schema: string; table: string }[] = [];
    for (const tbl of actualTables) {
      const key = `${tbl.schema}.${tbl.name}`.toLowerCase();
      if (!connectedTables.has(key)) {
        islands.push({ schema: tbl.schema, table: tbl.name });
      }
    }

    if (islands.length === 0) {
      return [];
    }

    const affectedCount = islands.length;
    const totalCount = actualTables.length;

    // Severity: 20+ → critical, 10+ → major, else minor
    let sev: 'critical' | 'major' | 'minor';
    if (affectedCount >= 20) {
      sev = 'critical';
    } else if (affectedCount >= 10) {
      sev = 'major';
    } else {
      sev = 'minor';
    }

    const evidence: Evidence[] = islands.map((isl) => ({
      schema: isl.schema,
      table: isl.table,
      detail: `Table "${isl.schema}.${isl.table}" has no foreign key relationships`,
    }));

    const ratio = totalCount > 0 ? affectedCount / totalCount : 0;

    return [
      {
        checkId: 'P4-ISLAND-TABLES',
        property: 4,
        severity: sev,
        rawScore: 0,
        title: `${affectedCount} island tables with no FK relationships`,
        description:
          `${affectedCount} of ${totalCount} tables have no foreign key relationships (neither as source nor target). ` +
          `Island tables represent disconnected data that cannot be joined to the rest of the model without ad-hoc logic.`,
        evidence,
        affectedObjects: affectedCount,
        totalObjects: totalCount,
        ratio,
        remediation:
          'Review island tables for missing FK relationships. Add foreign keys where logical relationships exist, ' +
          'or document why tables are intentionally standalone (e.g. configuration, lookup).',
        costCategories: ISLAND_TABLES_ACTIVE_CATEGORIES,
        costWeights: { ...ISLAND_TABLES_COST_WEIGHTS },
      },
    ];
  },
};

// =============================================================================
// P4-WIDE-TABLES
// Tables with 30+ columns.
// =============================================================================

const WIDE_TABLES_COST_WEIGHTS: Record<CostCategory, number> = {
  firefighting: 0.1,
  dataQuality: 0.4,
  integration: 0.1,
  productivity: 0.4,
  regulatory: 0,
};

const WIDE_TABLES_ACTIVE_CATEGORIES: CostCategory[] = [
  'firefighting',
  'dataQuality',
  'integration',
  'productivity',
];

export const p4WideTables: ScannerCheck = {
  id: 'P4-WIDE-TABLES',
  property: 4,
  name: 'Wide Tables',
  description:
    'Detect tables with 30 or more columns, which often indicate denormalized or poorly modelled entities.',

  execute(schema: SchemaData, _config: ScannerConfig): Finding[] {
    // Count columns per table
    const columnCounts = new Map<string, { schema: string; table: string; count: number }>();
    for (const col of schema.columns) {
      const key = `${col.schema}.${col.table}`.toLowerCase();
      if (!columnCounts.has(key)) {
        columnCounts.set(key, { schema: col.schema, table: col.table, count: 0 });
      }
      columnCounts.get(key)!.count++;
    }

    // Find wide tables (30+ columns)
    const wideTables: { schema: string; table: string; columnCount: number }[] = [];
    for (const [, info] of columnCounts) {
      if (info.count >= 30) {
        wideTables.push({
          schema: info.schema,
          table: info.table,
          columnCount: info.count,
        });
      }
    }

    if (wideTables.length === 0) {
      return [];
    }

    // Sort by column count descending for evidence readability
    wideTables.sort((a, b) => b.columnCount - a.columnCount);

    const affectedCount = wideTables.length;
    const totalTables = schema.tables.length;

    // Severity: 5+ tables → major, else minor
    let sev: 'major' | 'minor';
    if (affectedCount >= 5) {
      sev = 'major';
    } else {
      sev = 'minor';
    }

    const evidence: Evidence[] = wideTables.map((wt) => ({
      schema: wt.schema,
      table: wt.table,
      detail: `Table "${wt.schema}.${wt.table}" has ${wt.columnCount} columns`,
      metadata: { columnCount: wt.columnCount },
    }));

    const ratio = totalTables > 0 ? affectedCount / totalTables : 0;

    return [
      {
        checkId: 'P4-WIDE-TABLES',
        property: 4,
        severity: sev,
        rawScore: 0,
        title: `${affectedCount} tables have 30+ columns`,
        description:
          `${affectedCount} of ${totalTables} tables have 30 or more columns. Wide tables typically indicate ` +
          `denormalized "god tables" that conflate multiple concerns, making them harder to maintain and query.`,
        evidence,
        affectedObjects: affectedCount,
        totalObjects: totalTables,
        ratio,
        remediation:
          'Decompose wide tables into normalised entities with clear single responsibilities. ' +
          'Extract repeated column groups into child tables with FK relationships.',
        costCategories: WIDE_TABLES_ACTIVE_CATEGORIES,
        costWeights: { ...WIDE_TABLES_COST_WEIGHTS },
      },
    ];
  },
};
