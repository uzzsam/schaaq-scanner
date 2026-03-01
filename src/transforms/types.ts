// =============================================================================
// Transform Clarity Checks — Type Definitions
//
// Types for source-to-target mapping analysis. These checks detect semantic
// drift and ontological breaks in data transformation pipelines.
// =============================================================================

/**
 * A single row from a source-to-target mapping CSV/Excel file.
 */
export interface TransformMapping {
  sourceTable: string;
  sourceColumn: string;
  sourceType: string;
  targetTable: string;
  targetColumn: string;
  targetType: string;
  transformRule: string;        // e.g. 'CAST', 'COALESCE', 'SUM', 'CONCAT', 'direct', ''
  notes: string;                // free-text description/notes
}

/**
 * Parsed transform data with computed statistics, ready for check evaluation.
 */
export interface TransformData {
  mappings: TransformMapping[];
  sourceTables: string[];
  targetTables: string[];
  totalMappings: number;

  /** Lookup: target column → list of source columns feeding it */
  targetToSources: Map<string, TransformMapping[]>;
  /** Lookup: source column → list of target columns it feeds */
  sourceToTargets: Map<string, TransformMapping[]>;
}

/**
 * Severity levels for transform findings.
 */
export type TransformSeverity = 'critical' | 'major' | 'minor' | 'info';

/**
 * Cost categories matching the engine's 5-category model.
 */
export type TransformCostCategory =
  | 'firefighting'
  | 'dataQuality'
  | 'integration'
  | 'productivity'
  | 'regulatory';

/**
 * Evidence for a transform finding — references specific mapping rows.
 */
export interface TransformEvidence {
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  detail: string;
  metadata?: Record<string, unknown>;
}

/**
 * A finding produced by a transform check.
 */
export interface TransformFinding {
  checkId: string;
  category: 'semantic-drift' | 'ontological-break';
  severity: TransformSeverity;
  title: string;
  description: string;
  evidence: TransformEvidence[];
  affectedMappings: number;
  totalMappings: number;
  ratio: number;
  remediation: string;
  costCategories: TransformCostCategory[];
  costWeights: Record<TransformCostCategory, number>;
}

/**
 * A transform check — pure function that evaluates TransformData.
 */
export interface TransformCheck {
  id: string;
  name: string;
  category: 'semantic-drift' | 'ontological-break';
  description: string;
  evaluate(data: TransformData): TransformFinding[];
}
