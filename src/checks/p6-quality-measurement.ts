import type { SchemaData } from '../adapters/types';
import type { Finding, Evidence, ScannerCheck, ScannerConfig, CostCategory } from './types';

// =============================================================================
// p6HighNullRate
// =============================================================================
export const p6HighNullRate: ScannerCheck = {
  id: 'p6-high-null-rate',
  property: 6,
  name: 'High Null Rate Columns',
  description:
    'Identifies columns with a null fraction exceeding the configured threshold, indicating potential data quality issues.',

  execute(schema: SchemaData, config: ScannerConfig): Finding[] {
    const stats = schema.columnStatistics;
    if (!stats || stats.length === 0) return [];

    const isCsvSource = schema.databaseType === 'csv';
    const threshold = isCsvSource
      ? (config.thresholds.nullRateThreshold ?? 0.7)
      : (config.thresholds.nullRateThreshold ?? 0.3);

    const highNull = stats.filter((s) => {
      if (s.nullFraction === null) return false;
      if (s.nullFraction <= threshold) return false;
      // For CSV: skip nearly-empty columns (clearly optional/unused fields)
      if (isCsvSource && s.nullFraction >= 0.95) return false;
      return true;
    });

    const affectedObjects = highNull.length;
    const totalObjects = stats.length;

    if (affectedObjects === 0) return [];

    const ratio = totalObjects > 0 ? affectedObjects / totalObjects : 0;

    let severity: Finding['severity'];
    if (affectedObjects >= 50) severity = 'critical';
    else if (affectedObjects >= 20) severity = 'major';
    else severity = 'minor';

    // CSV sources get downgraded severity — high nulls in optional fields are normal
    if (isCsvSource) {
      if (severity === 'critical') severity = 'major';
      else if (severity === 'major') severity = 'minor';
      else severity = 'info';
    }

    const costWeights: Record<CostCategory, number> = {
      firefighting: 0.2,
      dataQuality: 0.5,
      integration: 0,
      productivity: 0.1,
      regulatory: 0.2,
    };

    const costCategories: CostCategory[] = (
      Object.entries(costWeights) as [CostCategory, number][]
    )
      .filter(([, w]) => w > 0)
      .map(([k]) => k);

    const evidence: Evidence[] = highNull.map((s) => ({
      schema: s.schema,
      table: s.table,
      column: s.column,
      detail: `Column "${s.schema}"."${s.table}"."${s.column}" has ${((s.nullFraction ?? 0) * 100).toFixed(1)}% null values (threshold: ${(threshold * 100).toFixed(1)}%)`,
    }));

    return [
      {
        checkId: 'p6-high-null-rate',
        property: 6,
        severity,
        rawScore: 0,
        title: 'Columns with high null rates',
        description: `${affectedObjects} of ${totalObjects} columns have null fractions exceeding ${(threshold * 100).toFixed(1)}%.`,
        evidence,
        affectedObjects,
        totalObjects,
        ratio,
        remediation:
          'Investigate high-null columns for missing data pipelines, incorrect NULL defaults, or unused columns that should be removed.',
        costCategories,
        costWeights,
      },
    ];
  },
};

// =============================================================================
// p6NoIndexes
// =============================================================================
export const p6NoIndexes: ScannerCheck = {
  id: 'p6-no-indexes',
  property: 6,
  name: 'Tables Without Indexes',
  description:
    'Finds tables with significant data (>100 rows) that have no indexes, leading to full table scans.',

  execute(schema: SchemaData, _config: ScannerConfig): Finding[] {
    // CSV/Excel uploads have no indexes by definition — skip this check
    if (schema.databaseType === 'csv') return [];

    const tables = schema.tables.filter((t) => t.type === 'table');
    if (tables.length === 0) return [];

    // Build a set of tables that have significant data
    const tablesWithData = new Set<string>();
    for (const ts of schema.tableStatistics) {
      if (ts.rowCount > 100) {
        tablesWithData.add(`${ts.schema}.${ts.table}`);
      }
    }

    // Build a set of tables that have at least one index
    const tablesWithIndexes = new Set<string>();
    for (const idx of schema.indexes) {
      tablesWithIndexes.add(`${idx.schema}.${idx.table}`);
    }

    // Tables with data but no indexes
    const noIndexTables = tables.filter((t) => {
      const key = `${t.schema}.${t.name}`;
      return tablesWithData.has(key) && !tablesWithIndexes.has(key);
    });

    const affectedObjects = noIndexTables.length;
    const totalObjects = tables.filter((t) =>
      tablesWithData.has(`${t.schema}.${t.name}`),
    ).length;

    if (affectedObjects === 0) return [];

    const ratio = totalObjects > 0 ? affectedObjects / totalObjects : 0;

    let severity: Finding['severity'];
    if (affectedObjects >= 10) severity = 'major';
    else severity = 'minor';

    const costWeights: Record<CostCategory, number> = {
      firefighting: 0.3,
      dataQuality: 0.1,
      integration: 0,
      productivity: 0.6,
      regulatory: 0,
    };

    const costCategories: CostCategory[] = (
      Object.entries(costWeights) as [CostCategory, number][]
    )
      .filter(([, w]) => w > 0)
      .map(([k]) => k);

    const evidence: Evidence[] = noIndexTables.map((t) => {
      const stats = schema.tableStatistics.find(
        (ts) => ts.schema === t.schema && ts.table === t.name,
      );
      return {
        schema: t.schema,
        table: t.name,
        detail: `Table "${t.schema}"."${t.name}" has ${stats?.rowCount ?? 'unknown'} rows but no indexes`,
      };
    });

    return [
      {
        checkId: 'p6-no-indexes',
        property: 6,
        severity,
        rawScore: 0,
        title: 'Tables with data but no indexes',
        description: `${affectedObjects} of ${totalObjects} tables with >100 rows have no indexes, causing full table scans on every query.`,
        evidence,
        affectedObjects,
        totalObjects,
        ratio,
        remediation:
          'Add appropriate indexes based on query patterns. At minimum, ensure primary key indexes exist and consider indexes on frequently filtered or joined columns.',
        costCategories,
        costWeights,
      },
    ];
  },
};
