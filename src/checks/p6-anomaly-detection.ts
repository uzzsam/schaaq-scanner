import type { SchemaData, ColumnStatistics } from '../adapters/types';
import type { Finding, Evidence, ScannerCheck, ScannerConfig, CostCategory } from './types';

// =============================================================================
// Helper: group column statistics by table key
// =============================================================================
function groupByTable(stats: ColumnStatistics[]): Map<string, ColumnStatistics[]> {
  const map = new Map<string, ColumnStatistics[]>();
  for (const s of stats) {
    const key = `${s.schema}.${s.table}`;
    const arr = map.get(key);
    if (arr) arr.push(s);
    else map.set(key, [s]);
  }
  return map;
}

// =============================================================================
// Helper: compute mean and standard deviation
// =============================================================================
function meanAndStdDev(values: number[]): { mean: number; stdDev: number } {
  if (values.length === 0) return { mean: 0, stdDev: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  return { mean, stdDev: Math.sqrt(variance) };
}

// =============================================================================
// Helper: compute Q1, Q3, IQR from sorted values
// =============================================================================
function quartiles(sorted: number[]): { q1: number; q3: number; iqr: number } {
  const n = sorted.length;
  if (n === 0) return { q1: 0, q3: 0, iqr: 0 };
  const q1Idx = Math.floor(n * 0.25);
  const q3Idx = Math.floor(n * 0.75);
  const q1 = sorted[q1Idx];
  const q3 = sorted[q3Idx];
  return { q1, q3, iqr: q3 - q1 };
}

// =============================================================================
// p6ZScoreOutliers — Z-score anomaly detection on column statistics
// =============================================================================
export const p6ZScoreOutliers: ScannerCheck = {
  id: 'p6-zscore-outliers',
  property: 6,
  name: 'Z-Score Statistical Outliers',
  description:
    'Detects columns whose null fraction or distinct count deviates significantly from other columns in the same table, using z-score analysis.',

  execute(schema: SchemaData, _config: ScannerConfig): Finding[] {
    const stats = schema.columnStatistics;
    if (!stats || stats.length === 0) return [];

    const byTable = groupByTable(stats);
    const evidence: Evidence[] = [];

    let majorCount = 0;
    let minorCount = 0;

    for (const [, columns] of byTable) {
      // Need at least 3 columns to compute meaningful z-scores
      if (columns.length < 3) continue;

      const nullFracs = columns
        .map((c) => c.nullFraction)
        .filter((v): v is number => v !== null);

      const distinctCounts = columns
        .map((c) => c.distinctCount)
        .filter((v): v is number => v !== null);

      const nullStats = meanAndStdDev(nullFracs);
      const distinctStats = meanAndStdDev(distinctCounts);

      for (const col of columns) {
        let maxZ = 0;
        let metric = '';

        if (col.nullFraction !== null && nullStats.stdDev > 0) {
          const z = Math.abs(col.nullFraction - nullStats.mean) / nullStats.stdDev;
          if (z > maxZ) {
            maxZ = z;
            metric = `nullFraction z-score ${z.toFixed(2)} (value: ${(col.nullFraction * 100).toFixed(1)}%, mean: ${(nullStats.mean * 100).toFixed(1)}%)`;
          }
        }

        if (col.distinctCount !== null && distinctStats.stdDev > 0) {
          const z = Math.abs(col.distinctCount - distinctStats.mean) / distinctStats.stdDev;
          if (z > maxZ) {
            maxZ = z;
            metric = `distinctCount z-score ${z.toFixed(2)} (value: ${col.distinctCount}, mean: ${distinctStats.mean.toFixed(0)})`;
          }
        }

        if (maxZ > 2.5) {
          if (maxZ > 3.0) majorCount++;
          else minorCount++;

          evidence.push({
            schema: col.schema,
            table: col.table,
            column: col.column,
            detail: `Column "${col.schema}"."${col.table}"."${col.column}" is a statistical outlier: ${metric}`,
            metadata: { zScore: maxZ },
          });
        }
      }
    }

    const affectedObjects = evidence.length;
    const totalObjects = stats.length;
    if (affectedObjects === 0) return [];

    const ratio = totalObjects > 0 ? affectedObjects / totalObjects : 0;

    let severity: Finding['severity'];
    if (majorCount > 0) severity = 'major';
    else severity = 'minor';

    const costWeights: Record<CostCategory, number> = {
      firefighting: 0.2,
      dataQuality: 0.5,
      integration: 0.1,
      productivity: 0.1,
      regulatory: 0.1,
      aiMlRiskExposure: 0,
    };

    const costCategories: CostCategory[] = (
      Object.entries(costWeights) as [CostCategory, number][]
    )
      .filter(([, w]) => w > 0)
      .map(([k]) => k);

    // Sort evidence by z-score descending for samples
    const sortedEvidence = [...evidence].sort((a, b) =>
      ((b.metadata as { zScore: number })?.zScore ?? 0) - ((a.metadata as { zScore: number })?.zScore ?? 0)
    );

    return [
      {
        checkId: 'p6-zscore-outliers',
        property: 6,
        severity,
        rawScore: 0,
        title: 'Columns with statistically anomalous values',
        description: `${affectedObjects} of ${totalObjects} columns are statistical outliers within their table (z-score > 2.5).`,
        evidence,
        affectedObjects,
        totalObjects,
        ratio,
        remediation:
          'Investigate flagged columns for data pipeline issues, incorrect defaults, or schema misalignment. Columns that deviate significantly from table peers often indicate broken ETL jobs or misconfigured data sources.',
        costCategories,
        costWeights,
        evidenceInput: {
          asset: {
            type: 'column',
            key: `${sortedEvidence[0].schema}.${sortedEvidence[0].table}.${sortedEvidence[0].column}`,
            name: sortedEvidence[0].column!,
            schema: sortedEvidence[0].schema,
            table: sortedEvidence[0].table,
            column: sortedEvidence[0].column,
          },
          metric: {
            name: 'zscore_outlier_columns',
            observed: affectedObjects,
            unit: 'columns',
            displayText: `${affectedObjects} of ${totalObjects} columns are statistical outliers (z-score > 2.5)`,
          },
          threshold: {
            value: 2.5,
            operator: 'gt',
            displayText: 'Z-score threshold for anomaly detection is 2.5',
          },
          samples: sortedEvidence.slice(0, 10).map(e => ({
            label: `z=${((e.metadata as { zScore: number })?.zScore ?? 0).toFixed(2)}`,
            value: `${e.schema}.${e.table}.${e.column}`,
            context: { zScore: (e.metadata as { zScore: number })?.zScore ?? 0 },
          })),
          explanation: {
            whatWasFound: `${affectedObjects} of ${totalObjects} columns are statistical outliers within their table (z-score > 2.5)`,
            whyItMatters: 'Columns that deviate significantly from table peers often indicate broken ETL jobs, misconfigured data sources, or schema misalignment',
            howDetected: 'Computed z-scores for null fraction and distinct count within each table, flagging columns with z-score > 2.5',
          },
        },
      },
    ];
  },
};

// =============================================================================
// p6IqrOutliers — IQR-based outlier detection on null fractions per table
// =============================================================================
export const p6IqrOutliers: ScannerCheck = {
  id: 'p6-iqr-outliers',
  property: 6,
  name: 'IQR Null-Rate Outliers',
  description:
    'Detects columns whose null fraction is an outlier within their table using interquartile range (IQR) analysis.',

  execute(schema: SchemaData, _config: ScannerConfig): Finding[] {
    const stats = schema.columnStatistics;
    if (!stats || stats.length === 0) return [];

    const byTable = groupByTable(stats);
    const evidence: Evidence[] = [];

    for (const [, columns] of byTable) {
      const withNulls = columns.filter((c) => c.nullFraction !== null);
      // Need at least 4 columns for meaningful IQR
      if (withNulls.length < 4) continue;

      const sorted = withNulls
        .map((c) => c.nullFraction as number)
        .sort((a, b) => a - b);

      const { q1, q3, iqr } = quartiles(sorted);
      const lowerFence = q1 - 1.5 * iqr;
      const upperFence = q3 + 1.5 * iqr;

      for (const col of withNulls) {
        const nf = col.nullFraction as number;
        if (nf < lowerFence || nf > upperFence) {
          evidence.push({
            schema: col.schema,
            table: col.table,
            column: col.column,
            detail: `Column "${col.schema}"."${col.table}"."${col.column}" null rate ${(nf * 100).toFixed(1)}% is outside IQR fences [${(lowerFence * 100).toFixed(1)}%, ${(upperFence * 100).toFixed(1)}%]`,
            metadata: { nullFraction: nf, lowerFence, upperFence },
          });
        }
      }
    }

    const affectedObjects = evidence.length;
    const totalObjects = stats.filter((s) => s.nullFraction !== null).length;
    if (affectedObjects === 0) return [];

    const ratio = totalObjects > 0 ? affectedObjects / totalObjects : 0;

    const costWeights: Record<CostCategory, number> = {
      firefighting: 0.2,
      dataQuality: 0.5,
      integration: 0.1,
      productivity: 0.1,
      regulatory: 0.1,
      aiMlRiskExposure: 0,
    };

    const costCategories: CostCategory[] = (
      Object.entries(costWeights) as [CostCategory, number][]
    )
      .filter(([, w]) => w > 0)
      .map(([k]) => k);

    return [
      {
        checkId: 'p6-iqr-outliers',
        property: 6,
        severity: 'major',
        rawScore: 0,
        title: 'Columns with null rates outside IQR fences',
        description: `${affectedObjects} of ${totalObjects} columns have null fractions that are IQR outliers within their table.`,
        evidence,
        affectedObjects,
        totalObjects,
        ratio,
        remediation:
          'Columns with null rates significantly different from their table peers may indicate selective data loading, broken joins, or ETL failures targeting specific fields. Investigate data source integrity for flagged columns.',
        costCategories,
        costWeights,
        evidenceInput: {
          asset: {
            type: 'column',
            key: `${evidence[0].schema}.${evidence[0].table}.${evidence[0].column}`,
            name: evidence[0].column!,
            schema: evidence[0].schema,
            table: evidence[0].table,
            column: evidence[0].column,
          },
          metric: {
            name: 'iqr_outlier_columns',
            observed: affectedObjects,
            unit: 'columns',
            displayText: `${affectedObjects} of ${totalObjects} columns have null fractions outside IQR fences`,
          },
          samples: evidence.slice(0, 10).map(e => ({
            label: `${(((e.metadata as { nullFraction: number })?.nullFraction ?? 0) * 100).toFixed(1)}% null`,
            value: `${e.schema}.${e.table}.${e.column}`,
            context: {
              nullFraction: (e.metadata as { nullFraction: number })?.nullFraction ?? 0,
              lowerFence: (e.metadata as { lowerFence: number })?.lowerFence ?? 0,
              upperFence: (e.metadata as { upperFence: number })?.upperFence ?? 0,
            },
          })),
          explanation: {
            whatWasFound: `${affectedObjects} of ${totalObjects} columns have null fractions that are IQR outliers within their table`,
            whyItMatters: 'Columns with null rates significantly different from their table peers may indicate selective data loading, broken joins, or ETL failures',
            howDetected: 'Computed IQR fences (Q1 - 1.5×IQR, Q3 + 1.5×IQR) for null fractions within each table and flagged columns outside those fences',
          },
        },
      },
    ];
  },
};

// =============================================================================
// p6NullRateSpike — absolute null rate threshold detection
// =============================================================================
export const p6NullRateSpike: ScannerCheck = {
  id: 'p6-null-rate-spike',
  property: 6,
  name: 'Null Rate Spike Detection',
  description:
    'Flags columns where the null fraction exceeds absolute thresholds (>30% major, >70% critical), indicating potential data quality anomalies.',

  execute(schema: SchemaData, _config: ScannerConfig): Finding[] {
    const stats = schema.columnStatistics;
    if (!stats || stats.length === 0) return [];

    const criticalEvidence: Evidence[] = [];
    const majorEvidence: Evidence[] = [];

    for (const col of stats) {
      if (col.nullFraction === null) continue;

      if (col.nullFraction > 0.7) {
        criticalEvidence.push({
          schema: col.schema,
          table: col.table,
          column: col.column,
          detail: `Column "${col.schema}"."${col.table}"."${col.column}" has ${(col.nullFraction * 100).toFixed(1)}% nulls (critical: >70%)`,
          metadata: { nullFraction: col.nullFraction },
        });
      } else if (col.nullFraction > 0.3) {
        majorEvidence.push({
          schema: col.schema,
          table: col.table,
          column: col.column,
          detail: `Column "${col.schema}"."${col.table}"."${col.column}" has ${(col.nullFraction * 100).toFixed(1)}% nulls (elevated: >30%)`,
          metadata: { nullFraction: col.nullFraction },
        });
      }
    }

    const totalObjects = stats.filter((s) => s.nullFraction !== null).length;
    const findings: Finding[] = [];

    const costWeights: Record<CostCategory, number> = {
      firefighting: 0.3,
      dataQuality: 0.4,
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

    if (criticalEvidence.length > 0) {
      // Sort by null fraction descending for samples
      const sortedCritical = [...criticalEvidence].sort((a, b) =>
        ((b.metadata as { nullFraction: number })?.nullFraction ?? 0) - ((a.metadata as { nullFraction: number })?.nullFraction ?? 0)
      );
      findings.push({
        checkId: 'p6-null-rate-spike',
        property: 6,
        severity: 'critical',
        rawScore: 0,
        title: 'Columns with critical null rates (>70%)',
        description: `${criticalEvidence.length} of ${totalObjects} columns have null fractions exceeding 70%, indicating severely incomplete data.`,
        evidence: criticalEvidence,
        affectedObjects: criticalEvidence.length,
        totalObjects,
        ratio: totalObjects > 0 ? criticalEvidence.length / totalObjects : 0,
        remediation:
          'Columns over 70% null are effectively unusable. Determine if these columns should be removed, backfilled from an authoritative source, or marked as deprecated. Investigate upstream pipelines for data loss.',
        costCategories,
        costWeights,
        evidenceInput: {
          asset: {
            type: 'column',
            key: `${sortedCritical[0].schema}.${sortedCritical[0].table}.${sortedCritical[0].column}`,
            name: sortedCritical[0].column!,
            schema: sortedCritical[0].schema,
            table: sortedCritical[0].table,
            column: sortedCritical[0].column,
          },
          metric: {
            name: 'critical_null_rate_columns',
            observed: criticalEvidence.length,
            unit: 'columns',
            displayText: `${criticalEvidence.length} of ${totalObjects} columns exceed 70% null rate`,
          },
          threshold: {
            value: 0.7,
            operator: 'gt',
            displayText: 'Null fraction above 70% indicates severely incomplete data',
          },
          samples: sortedCritical.slice(0, 10).map(e => ({
            label: `${(((e.metadata as { nullFraction: number })?.nullFraction ?? 0) * 100).toFixed(1)}% null`,
            value: `${e.schema}.${e.table}.${e.column}`,
            context: { nullFraction: (e.metadata as { nullFraction: number })?.nullFraction ?? 0 },
          })),
          explanation: {
            whatWasFound: `${criticalEvidence.length} of ${totalObjects} columns have null fractions exceeding 70%`,
            whyItMatters: 'Columns over 70% null are effectively unusable and indicate severe data loss or pipeline failures',
            howDetected: 'Compared each column\'s null fraction against the absolute threshold of 70%',
          },
        },
      });
    }

    if (majorEvidence.length > 0) {
      const sortedMajor = [...majorEvidence].sort((a, b) =>
        ((b.metadata as { nullFraction: number })?.nullFraction ?? 0) - ((a.metadata as { nullFraction: number })?.nullFraction ?? 0)
      );
      findings.push({
        checkId: 'p6-null-rate-spike',
        property: 6,
        severity: 'major',
        rawScore: 0,
        title: 'Columns with elevated null rates (>30%)',
        description: `${majorEvidence.length} of ${totalObjects} columns have null fractions between 30% and 70%, indicating significant data gaps.`,
        evidence: majorEvidence,
        affectedObjects: majorEvidence.length,
        totalObjects,
        ratio: totalObjects > 0 ? majorEvidence.length / totalObjects : 0,
        remediation:
          'Columns with 30–70% nulls warrant investigation. Check whether nulls represent genuinely optional data or indicate pipeline failures, incorrect defaults, or incomplete migrations.',
        costCategories,
        costWeights,
        evidenceInput: {
          asset: {
            type: 'column',
            key: `${sortedMajor[0].schema}.${sortedMajor[0].table}.${sortedMajor[0].column}`,
            name: sortedMajor[0].column!,
            schema: sortedMajor[0].schema,
            table: sortedMajor[0].table,
            column: sortedMajor[0].column,
          },
          metric: {
            name: 'elevated_null_rate_columns',
            observed: majorEvidence.length,
            unit: 'columns',
            displayText: `${majorEvidence.length} of ${totalObjects} columns have null fractions between 30% and 70%`,
          },
          threshold: {
            value: 0.3,
            operator: 'gt',
            displayText: 'Null fraction above 30% indicates significant data gaps',
          },
          samples: sortedMajor.slice(0, 10).map(e => ({
            label: `${(((e.metadata as { nullFraction: number })?.nullFraction ?? 0) * 100).toFixed(1)}% null`,
            value: `${e.schema}.${e.table}.${e.column}`,
            context: { nullFraction: (e.metadata as { nullFraction: number })?.nullFraction ?? 0 },
          })),
          explanation: {
            whatWasFound: `${majorEvidence.length} of ${totalObjects} columns have null fractions between 30% and 70%`,
            whyItMatters: 'Elevated null rates indicate significant data gaps that degrade analytics accuracy and may signal pipeline failures',
            howDetected: 'Compared each column\'s null fraction against the absolute threshold of 30%',
          },
        },
      });
    }

    return findings;
  },
};
