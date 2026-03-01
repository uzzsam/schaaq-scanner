// =============================================================================
// PipelineMapping — Normalised ETL/ELT pipeline representation
// Sits alongside SchemaData; consumed by pipeline checks (P1-MAPPING-DRIFT,
// P4-LINEAGE-GAPS) and optionally cross-referenced with SchemaData.
// =============================================================================

/**
 * Classified transform type for a column mapping.
 * Ordered from safest (identity) to most complex (derive).
 */
export type TransformType =
  | 'identity'      // Column passes through unchanged
  | 'rename'        // Only the name changes
  | 'cast'          // Type conversion (e.g. VARCHAR -> INT)
  | 'aggregate'     // Aggregation function (SUM, COUNT, AVG, etc.)
  | 'derive'        // Computed / calculated from multiple inputs
  | 'conditional'   // CASE/IF logic
  | 'unknown';      // Cannot classify

/**
 * A single column-level mapping from source to target.
 */
export interface ColumnMapping {
  /** Source table (schema.table or just table name) */
  sourceTable: string;
  /** Source column name */
  sourceColumn: string;
  /** Target table (schema.table or just table name) */
  targetTable: string;
  /** Target column name */
  targetColumn: string;
  /** Classified transform type */
  transformType: TransformType;
  /** Raw transform logic / expression / SQL (if available) */
  transformLogic: string | null;
  /** Source data type (if available) */
  sourceType: string | null;
  /** Target data type (if available) */
  targetType: string | null;
  /** Pipeline/job name this mapping belongs to */
  pipelineName: string | null;
}

/**
 * Top-level pipeline mapping container.
 * Produced by STM, dbt, and OpenLineage adapters.
 */
export interface PipelineMapping {
  /** Origin format: 'stm' | 'dbt' | 'openlineage' */
  sourceFormat: 'stm' | 'dbt' | 'openlineage';
  /** ISO 8601 timestamp of when mapping was parsed */
  extractedAt: string;
  /** All column-level mappings */
  mappings: ColumnMapping[];
  /** Metadata about the mapping source */
  metadata: {
    fileName?: string;
    dbtProjectName?: string;
    totalModels?: number;
    totalJobs?: number;
    [key: string]: unknown;
  };
}

/**
 * Summary statistics for a PipelineMapping.
 */
export interface MappingStats {
  totalMappings: number;
  byTransformType: Record<TransformType, number>;
  uniqueSourceTables: number;
  uniqueTargetTables: number;
  uniquePipelines: number;
}

/**
 * Compute summary statistics for a PipelineMapping.
 */
export function computeMappingStats(pm: PipelineMapping): MappingStats {
  const byType: Record<TransformType, number> = {
    identity: 0, rename: 0, cast: 0, aggregate: 0,
    derive: 0, conditional: 0, unknown: 0,
  };

  const sourceTables = new Set<string>();
  const targetTables = new Set<string>();
  const pipelines = new Set<string>();

  for (const m of pm.mappings) {
    byType[m.transformType]++;
    sourceTables.add(m.sourceTable);
    targetTables.add(m.targetTable);
    if (m.pipelineName) pipelines.add(m.pipelineName);
  }

  return {
    totalMappings: pm.mappings.length,
    byTransformType: byType,
    uniqueSourceTables: sourceTables.size,
    uniqueTargetTables: targetTables.size,
    uniquePipelines: pipelines.size,
  };
}
