/**
 * Asset Criticality / CDE Weighting — Type Definitions
 *
 * Strict types for the deterministic criticality model.
 * No ML, no opaque heuristics — every score is explainable.
 */

// =============================================================================
// Criticality Tier
// =============================================================================

/** Four-tier criticality classification. */
export type CriticalityTier = 'low' | 'medium' | 'high' | 'critical';

export const CRITICALITY_TIER_ORDER: Record<CriticalityTier, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export const CRITICALITY_TIER_LABELS: Record<CriticalityTier, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export const CRITICALITY_TIER_COLORS: Record<CriticalityTier, string> = {
  low: '#6b7280',      // gray-500
  medium: '#f59e0b',   // amber-500
  high: '#f97316',     // orange-500
  critical: '#ef4444', // red-500
};

// =============================================================================
// Criticality Signal
// =============================================================================

/**
 * Signal types that contribute to criticality scoring.
 * Each signal is a deterministic observation from schema metadata.
 */
export type CriticalitySignalType =
  | 'naming-convention'       // table/column name matches known critical patterns
  | 'constraint-density'      // FK count, unique constraints, check constraints
  | 'reference-target'        // how many other tables reference this table via FK
  | 'column-count'            // wide tables often hold core entities
  | 'index-coverage'          // high index coverage suggests operational importance
  | 'pii-pattern'             // column names suggesting PII (email, ssn, phone, etc.)
  | 'financial-pattern'       // column names suggesting financial data (amount, price, balance)
  | 'audit-pattern'           // presence of audit columns (created_at, updated_at, etc.)
  | 'soft-delete-pattern'     // presence of soft-delete columns (deleted_at, is_deleted)
  | 'junction-table'          // M:N junction table (high relational importance)
  | 'enum-lookup'             // small lookup/enum table (low criticality)
  | 'null-ratio'              // low null ratio on key columns = well-maintained
  | 'finding-severity-load'   // aggregate severity of findings on this asset
  | 'relationship-centrality' // number of direct relationships (in + out)
  | 'schema-position';        // in public/dbo schema vs auxiliary schemas

/**
 * A single observed signal contributing to an asset's criticality score.
 */
export interface CriticalitySignal {
  /** Which signal type this represents */
  signalType: CriticalitySignalType;

  /** Human-readable label for display */
  signalLabel: string;

  /** Weight of this signal in the scoring formula (0–1, sums to ~1 across active signals) */
  weight: number;

  /** Normalised signal value (0–1) */
  value: number;

  /** Human-readable evidence supporting this signal */
  evidence: string;
}

// =============================================================================
// CDE Candidate
// =============================================================================

/** Reason a column was flagged as a CDE candidate. */
export type CdeReasonType =
  | 'pii-name-match'
  | 'financial-name-match'
  | 'regulatory-name-match'
  | 'high-uniqueness'
  | 'fk-target-column'
  | 'primary-key'
  | 'low-null-high-use';

/**
 * A column-level Critical Data Element candidate.
 * Identified deterministically from schema metadata + naming patterns.
 */
export interface CdeCandidate {
  /** Fully qualified column key: schema.table.column */
  columnKey: string;

  /** Column name */
  columnName: string;

  /** Parent table key: schema.table */
  tableKey: string;

  /** Parent table name */
  tableName: string;

  /** Schema name */
  schemaName: string;

  /** Reasons this column was flagged */
  reasons: CdeReasonType[];

  /** Human-readable rationale */
  rationale: string;

  /** Confidence in the CDE classification */
  confidenceLevel: 'high' | 'medium' | 'low';
}

// =============================================================================
// Asset Criticality Record
// =============================================================================

/**
 * The criticality assessment for a single asset (table or schema).
 * Column-level assets inherit their parent table's criticality.
 */
export interface AssetCriticalityRecord {
  /** Unique asset key: schema.table or schema */
  assetKey: string;

  /** Human-readable asset name */
  assetName: string;

  /** Asset type — criticality is computed at table and schema level */
  assetType: 'table' | 'schema';

  /** Source system / database name */
  sourceSystem: string;

  /** Computed criticality score (0–100) */
  criticalityScore: number;

  /** Derived tier based on score thresholds */
  criticalityTier: CriticalityTier;

  /** Whether this asset contains CDE candidate columns */
  cdeCandidate: boolean;

  /** CDE candidate columns within this asset (if any) */
  cdeCandidates: CdeCandidate[];

  /** Signals that contributed to the score */
  signals: CriticalitySignal[];

  /** Human-readable explanation of the score derivation */
  rationale: string;

  /** Confidence in the overall assessment */
  confidenceLevel: 'high' | 'medium' | 'low';
}

// =============================================================================
// Criticality Assessment Summary
// =============================================================================

/**
 * Aggregate summary of a criticality assessment for a scan result set.
 */
export interface CriticalityAssessmentSummary {
  /** The result set this assessment belongs to */
  resultSetId: string;

  /** ISO timestamp of when the assessment was generated */
  assessedAt: string;

  /** Total assets assessed */
  totalAssetsAssessed: number;

  /** Breakdown by tier */
  tierDistribution: Record<CriticalityTier, number>;

  /** Total CDE candidates identified */
  totalCdeCandidates: number;

  /** Top critical assets (sorted by score desc, max 10) */
  topCriticalAssets: AssetCriticalityRecord[];

  /** All asset records (for persistence and detailed views) */
  allAssets: AssetCriticalityRecord[];

  /** All CDE candidates across all assets */
  allCdeCandidates: CdeCandidate[];

  /** Average criticality score across all assets */
  averageCriticalityScore: number;

  /** Method description for audit trail */
  methodDescription: string;
}

// =============================================================================
// Score Thresholds
// =============================================================================

/** Score thresholds for tier classification. */
export const CRITICALITY_TIER_THRESHOLDS: Record<CriticalityTier, { min: number; max: number }> = {
  low:      { min: 0,  max: 24 },
  medium:   { min: 25, max: 49 },
  high:     { min: 50, max: 74 },
  critical: { min: 75, max: 100 },
};

/** Map a 0–100 score to a CriticalityTier. */
export function scoreToCriticalityTier(score: number): CriticalityTier {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

// =============================================================================
// Criticality Multiplier (for remediation/DALC integration)
// =============================================================================

/**
 * Multiplier applied to remediation priority and DALC presentation
 * when a finding's asset has a known criticality tier.
 */
export const CRITICALITY_PRIORITY_MULTIPLIER: Record<CriticalityTier, number> = {
  low: 1.0,
  medium: 1.1,
  high: 1.3,
  critical: 1.5,
};
