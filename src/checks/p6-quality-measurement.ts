import type { SchemaData } from '../adapters/types';
import type { Finding, Evidence, ScannerCheck, ScannerConfig, CostCategory } from './types';
import { getDbContext } from './db-context';

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
    const ctx = getDbContext(schema);
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
      aiMlRiskExposure: 0,
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

    // Sort by null fraction descending for samples
    const sorted = [...highNull].sort((a, b) => (b.nullFraction ?? 0) - (a.nullFraction ?? 0));
    const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

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
        remediation: ctx.remediation.highNullRate,
        costCategories,
        costWeights,
        evidenceInput: {
          asset: {
            type: 'column',
            key: `${sorted[0].schema}.${sorted[0].table}.${sorted[0].column}`,
            name: sorted[0].column,
            schema: sorted[0].schema,
            table: sorted[0].table,
            column: sorted[0].column,
          },
          metric: {
            name: 'high_null_columns',
            observed: affectedObjects,
            unit: 'columns',
            displayText: `${affectedObjects} of ${totalObjects} columns exceed ${pct(threshold)} null rate`,
          },
          threshold: {
            value: threshold,
            operator: 'gt',
            displayText: `Maximum allowed null fraction is ${pct(threshold)}`,
          },
          samples: sorted.slice(0, 10).map(s => ({
            label: `${pct(s.nullFraction ?? 0)} null`,
            value: `${s.schema}.${s.table}.${s.column}`,
            context: { nullFraction: s.nullFraction ?? 0, threshold },
          })),
          explanation: {
            whatWasFound: `${affectedObjects} columns have null fractions exceeding the ${pct(threshold)} threshold`,
            whyItMatters: 'High null rates indicate missing or incomplete data, which degrades analytics accuracy, breaks downstream pipelines, and undermines trust in reporting',
            howDetected: `Compared column-level null fraction statistics against the configured threshold of ${pct(threshold)}`,
          },
        },
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

    const ctx = getDbContext(schema);

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
      aiMlRiskExposure: 0,
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
        remediation: ctx.remediation.noIndexes,
        costCategories,
        costWeights,
        evidenceInput: {
          asset: {
            type: 'table',
            key: `${noIndexTables[0].schema}.${noIndexTables[0].name}`,
            name: noIndexTables[0].name,
            schema: noIndexTables[0].schema,
            table: noIndexTables[0].name,
          },
          relatedAssets: noIndexTables.slice(1).map(t => ({
            type: 'table' as const,
            key: `${t.schema}.${t.name}`,
            name: t.name,
            schema: t.schema,
            table: t.name,
          })),
          samples: noIndexTables.slice(0, 10).map(t => {
            const stats = schema.tableStatistics.find(
              ts => ts.schema === t.schema && ts.table === t.name,
            );
            return {
              label: 'Table without indexes',
              value: `${t.schema}.${t.name}`,
              context: { rowCount: stats?.rowCount ?? 0 },
            };
          }),
          explanation: {
            whatWasFound: `${affectedObjects} of ${totalObjects} tables with >100 rows have no indexes`,
            whyItMatters: 'Tables without indexes force full table scans on every query, degrading performance and increasing resource consumption as data grows',
            howDetected: 'Cross-referenced table statistics (row counts >100) against index metadata to find tables with data but no indexes',
          },
        },
      },
    ];
  },
};
