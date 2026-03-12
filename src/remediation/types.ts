/**
 * Remediation Planner — Type Definitions
 *
 * Strict types for the remediation action model.
 * Actions group related findings into actionable remediation themes.
 */

// =============================================================================
// Effort Band
// =============================================================================

/** S = small (< 2 weeks), M = medium (2-6 weeks), L = large (6+ weeks) */
export type EffortBand = 'S' | 'M' | 'L';

export const EFFORT_BAND_LABELS: Record<EffortBand, string> = {
  S: 'Small (< 2 weeks)',
  M: 'Medium (2–6 weeks)',
  L: 'Large (6+ weeks)',
};

// =============================================================================
// Owner Type
// =============================================================================

export type OwnerType =
  | 'data-engineer'
  | 'data-architect'
  | 'data-steward'
  | 'dba'
  | 'analytics-engineer'
  | 'compliance-officer';

// =============================================================================
// Confidence Level
// =============================================================================

export type ConfidenceLevel = 'high' | 'medium' | 'low';

// =============================================================================
// Sequence Group
// =============================================================================

/**
 * Logical phase in which the action should execute.
 * Phase 1 = foundational, Phase 2 = structural, Phase 3 = governance/readiness.
 */
export type SequenceGroup = 1 | 2 | 3;

// =============================================================================
// Action Theme
// =============================================================================

/** Canonical remediation themes that findings group into. */
export type ActionTheme =
  | 'entity-integrity'
  | 'referential-integrity'
  | 'semantic-standardisation'
  | 'lineage-documentation'
  | 'spreadsheet-hardening'
  | 'stewardship-assignment'
  | 'model-input-readiness'
  | 'schema-documentation'
  | 'data-quality-monitoring'
  | 'regulatory-controls';

// =============================================================================
// Remediation Action
// =============================================================================

export interface RemediationAction {
  /** Deterministic ID: `action-<theme>` */
  id: string;

  /** The result set this plan belongs to */
  resultSetId: string;

  /** Human-readable action title */
  title: string;

  /** One-paragraph description of what to do */
  description: string;

  /** Why this action matters — business rationale */
  rationale: string;

  /** Theme this action belongs to */
  theme: ActionTheme;

  /** IDs of the findings grouped into this action (from result_findings table) */
  relatedFindingIds: string[];

  /** Check codes of related findings (e.g. 'p5-missing-pk') */
  relatedFindingCodes: string[];

  /** Count of distinct affected assets (tables/columns) */
  affectedAssets: number;

  /** 1-based rank after scoring */
  priorityRank: number;

  /** Composite priority score (0–100, higher = more urgent) */
  priorityScore: number;

  /** Severity weight: max severity among grouped findings (critical=4, major=3, minor=2, info=1) */
  severityWeight: number;

  /** DALC-linked impact estimate per action */
  estimatedImpactUsd: {
    low: number;
    base: number;
    high: number;
  };

  /** Effort band */
  effortBand: EffortBand;

  /** Likely responsible role */
  likelyOwnerType: OwnerType;

  /** Execution phase (1=foundational, 2=structural, 3=governance) */
  sequenceGroup: SequenceGroup;

  /** Action IDs that must complete before this one */
  blockedByActionIds: string[];

  /** True if effort = S and severity >= major */
  quickWin: boolean;

  /** Confidence in the estimate */
  confidenceLevel: ConfidenceLevel;

  /** Short explanation of how priority was calculated */
  explanation: string;
}

// =============================================================================
// Remediation Plan (aggregate)
// =============================================================================

export interface RemediationPlan {
  resultSetId: string;
  generatedAt: string; // ISO timestamp
  actions: RemediationAction[];
  totalEstimatedImpactUsd: {
    low: number;
    base: number;
    high: number;
  };
  quickWinCount: number;
  sequenceGroups: Array<{
    group: SequenceGroup;
    label: string;
    actionIds: string[];
  }>;
}
