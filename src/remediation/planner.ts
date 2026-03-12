/**
 * Remediation Planner Service
 *
 * Deterministic logic to:
 * 1. Group related findings into remediation action themes
 * 2. Score and rank actions
 * 3. Derive effort bands
 * 4. Estimate DALC-linked impact per action
 * 5. Compute sequencing/dependencies
 *
 * No AI prose — all outputs are derived from finding data and deterministic rules.
 */

import type { ResultFindingRow } from '../server/db/scan-result-types';
import type {
  RemediationAction,
  RemediationPlan,
  ActionTheme,
  EffortBand,
  OwnerType,
  ConfidenceLevel,
  SequenceGroup,
} from './types';
import type { CriticalityAssessmentSummary } from '../criticality/types';
import { CRITICALITY_PRIORITY_MULTIPLIER, getCriticalityForFinding } from '../criticality';

// =============================================================================
// Parsed Finding (ResultFindingRow with JSON fields parsed)
// =============================================================================

export interface ParsedFinding extends ResultFindingRow {
  costCategories: string[];
  costWeights: Record<string, number>;
}

// =============================================================================
// Check-ID → Theme Mapping
// =============================================================================

const CHECK_THEME_MAP: Record<string, ActionTheme> = {
  // P1 — entity integrity
  'P1-SEMANTIC-IDENTITY': 'entity-integrity',

  // P2 — semantic standardisation
  'P2-TYPE-INCONSISTENCY': 'semantic-standardisation',
  'P2-UNCONTROLLED-VOCAB': 'semantic-standardisation',

  // P3 — stewardship / domain ownership
  'P3-DOMAIN-OVERLAP': 'stewardship-assignment',
  'P3-CROSS-SCHEMA-COUPLING': 'stewardship-assignment',

  // P4 — spreadsheet hardening / anti-corruption
  'P4-CSV-IMPORT-PATTERN': 'spreadsheet-hardening',
  'P4-ISLAND-TABLES': 'referential-integrity',
  'P4-WIDE-TABLES': 'schema-documentation',

  // P5 — entity integrity + schema documentation
  'p5-missing-pk': 'entity-integrity',
  'p5-naming-violations': 'semantic-standardisation',
  'p5-undocumented': 'schema-documentation',

  // P6 — data quality monitoring
  'p6-high-null-rate': 'data-quality-monitoring',
  'p6-no-indexes': 'entity-integrity',
  'p6-zscore-outliers': 'data-quality-monitoring',
  'p6-iqr-outliers': 'data-quality-monitoring',
  'p6-null-rate-spike': 'data-quality-monitoring',

  // P7 — regulatory controls
  'p7-missing-audit': 'regulatory-controls',
  'p7-no-constraints': 'referential-integrity',

  // P8 — model input readiness
  'p8-ai-lineage-completeness': 'lineage-documentation',
  'p8-ai-bias-attribute-documentation': 'model-input-readiness',
  'p8-ai-reproducibility': 'model-input-readiness',
};

// =============================================================================
// Theme Metadata
// =============================================================================

interface ThemeMeta {
  title: string;
  description: string;
  rationale: string;
  ownerType: OwnerType;
  sequenceGroup: SequenceGroup;
}

const THEME_META: Record<ActionTheme, ThemeMeta> = {
  'entity-integrity': {
    title: 'Establish Entity Integrity',
    description: 'Add primary keys, unique constraints, and indexes to ensure each record is uniquely identifiable and efficiently retrievable.',
    rationale: 'Without entity integrity, downstream joins, deduplication, and lineage tracking are unreliable — amplifying costs across all other properties.',
    ownerType: 'data-architect',
    sequenceGroup: 1,
  },
  'referential-integrity': {
    title: 'Enforce Referential Integrity',
    description: 'Add foreign key constraints, eliminate orphan records, and connect island tables to establish trusted relationships between entities.',
    rationale: 'Broken references cascade into incorrect aggregations, failed ETL runs, and unreliable reporting — a direct driver of firefighting costs.',
    ownerType: 'data-engineer',
    sequenceGroup: 1,
  },
  'semantic-standardisation': {
    title: 'Standardise Naming and Semantics',
    description: 'Align column naming conventions, resolve type inconsistencies, and control vocabulary drift to create a shared data language.',
    rationale: 'Semantic ambiguity forces manual interpretation, increases integration errors, and blocks automated data discovery.',
    ownerType: 'data-architect',
    sequenceGroup: 2,
  },
  'lineage-documentation': {
    title: 'Document Data Lineage',
    description: 'Trace data flows from source to consumption, documenting transformations, ownership, and dependencies at each stage.',
    rationale: 'Missing lineage prevents root-cause analysis, blocks regulatory audit responses, and undermines AI model reproducibility.',
    ownerType: 'data-engineer',
    sequenceGroup: 2,
  },
  'spreadsheet-hardening': {
    title: 'Harden Spreadsheet-Sourced Data',
    description: 'Replace CSV-import patterns with typed schemas, add validation rules, and establish ingestion pipelines with quality gates.',
    rationale: 'Uncontrolled spreadsheet imports introduce type drift, duplicate records, and ungoverned schema changes — a top source of data quality incidents.',
    ownerType: 'data-engineer',
    sequenceGroup: 2,
  },
  'stewardship-assignment': {
    title: 'Assign Data Stewardship',
    description: 'Define domain ownership boundaries, resolve overlapping schemas, and assign accountable stewards for each data domain.',
    rationale: 'Without clear ownership, data quality issues persist because nobody is accountable for detection, resolution, or prevention.',
    ownerType: 'data-steward',
    sequenceGroup: 2,
  },
  'model-input-readiness': {
    title: 'Prepare Model Input Readiness',
    description: 'Document bias-relevant attributes, establish reproducibility controls, and validate data pipelines feeding ML/AI models.',
    rationale: 'AI models trained on undocumented or biased inputs create regulatory exposure and unpredictable business outcomes.',
    ownerType: 'analytics-engineer',
    sequenceGroup: 3,
  },
  'schema-documentation': {
    title: 'Complete Schema Documentation',
    description: 'Add descriptions to undocumented tables and columns, document wide-table rationale, and maintain a living data dictionary.',
    rationale: 'Undocumented schemas slow onboarding, increase misuse risk, and prevent automated governance tooling from operating effectively.',
    ownerType: 'data-architect',
    sequenceGroup: 2,
  },
  'data-quality-monitoring': {
    title: 'Implement Data Quality Monitoring',
    description: 'Set up null-rate monitoring, outlier detection alerts, and quality dashboards to catch data degradation early.',
    rationale: 'Without proactive monitoring, quality issues surface only when downstream consumers report failures — typically after business impact has occurred.',
    ownerType: 'data-engineer',
    sequenceGroup: 3,
  },
  'regulatory-controls': {
    title: 'Strengthen Regulatory Controls',
    description: 'Add audit trail columns, enforce data constraints, and establish traceability from regulatory requirements to data assets.',
    rationale: 'Missing audit trails and weak constraints create compliance gaps that expose the organisation to regulatory penalties and audit findings.',
    ownerType: 'compliance-officer',
    sequenceGroup: 3,
  },
};

// =============================================================================
// Sequencing Dependencies (theme-level)
// =============================================================================

const THEME_DEPS: Partial<Record<ActionTheme, ActionTheme[]>> = {
  'semantic-standardisation': ['entity-integrity'],
  'lineage-documentation': ['entity-integrity', 'stewardship-assignment'],
  'stewardship-assignment': ['entity-integrity'],
  'model-input-readiness': ['lineage-documentation', 'data-quality-monitoring'],
  'regulatory-controls': ['stewardship-assignment'],
  'data-quality-monitoring': ['entity-integrity'],
};

// =============================================================================
// Severity Weight
// =============================================================================

const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 4,
  major: 3,
  minor: 2,
  info: 1,
};

// =============================================================================
// Grouping
// =============================================================================

export function groupFindingsIntoActions(
  findings: ParsedFinding[],
  resultSetId: string,
): Map<ActionTheme, ParsedFinding[]> {
  const groups = new Map<ActionTheme, ParsedFinding[]>();

  for (const f of findings) {
    // Normalise check_id to handle case differences
    const theme = CHECK_THEME_MAP[f.check_id] ?? CHECK_THEME_MAP[f.check_id.toUpperCase()] ?? null;
    if (!theme) continue; // unmapped checks are excluded

    const list = groups.get(theme) ?? [];
    list.push(f);
    groups.set(theme, list);
  }

  return groups;
}

// =============================================================================
// Effort Band
// =============================================================================

function deriveEffortBand(findingCount: number, totalAffected: number, isStructural: boolean): EffortBand {
  // Structural changes (keys, constraints) are inherently more effort
  if (isStructural && (findingCount > 5 || totalAffected > 50)) return 'L';
  if (findingCount > 8 || totalAffected > 100) return 'L';
  if (findingCount > 3 || totalAffected > 20) return 'M';
  return 'S';
}

const STRUCTURAL_THEMES: Set<ActionTheme> = new Set([
  'entity-integrity',
  'referential-integrity',
  'regulatory-controls',
]);

// =============================================================================
// Impact Estimation
// =============================================================================

/**
 * Estimate the DALC-linked impact for a group of findings.
 * Uses a conservative proportional share model:
 *   action_share = sum(costWeights for action's findings) / sum(all costWeights)
 *   impact = dalc_total * action_share
 *
 * No double-counting: each finding's costWeight is used exactly once.
 */
function estimateImpact(
  actionFindings: ParsedFinding[],
  allFindings: ParsedFinding[],
  dalcLow: number,
  dalcBase: number,
  dalcHigh: number,
): { low: number; base: number; high: number } {
  // Sum total weight across all findings
  const totalWeight = allFindings.reduce((sum, f) => {
    const w = f.costWeights;
    return sum + Object.values(w).reduce((s, v) => s + v, 0);
  }, 0);

  if (totalWeight === 0) return { low: 0, base: 0, high: 0 };

  // Sum weight for this action's findings
  const actionWeight = actionFindings.reduce((sum, f) => {
    const w = f.costWeights;
    return sum + Object.values(w).reduce((s, v) => s + v, 0);
  }, 0);

  const share = actionWeight / totalWeight;

  return {
    low: Math.round(dalcLow * share),
    base: Math.round(dalcBase * share),
    high: Math.round(dalcHigh * share),
  };
}

// =============================================================================
// Confidence
// =============================================================================

function deriveConfidence(findings: ParsedFinding[]): ConfidenceLevel {
  // If most findings have confidence data, use the minimum
  const withConf = findings.filter(f => f.confidence_level != null);
  if (withConf.length === 0) return 'medium'; // default when no confidence data

  const levels = withConf.map(f => f.confidence_level as string);
  if (levels.includes('low')) return 'low';
  if (levels.includes('medium')) return 'medium';
  return 'high';
}

// =============================================================================
// Ranking
// =============================================================================

/**
 * Composite priority score (0–100):
 *   40% severity weight (max severity in group, scaled to 0-100)
 *   25% DALC contribution (share of total DALC, scaled to 0-100)
 *   20% asset coverage (ratio of affected assets, scaled to 0-100)
 *   10% quick-win bonus (effort=S → +10)
 *   5%  confidence bonus (high → +5)
 */
function computePriorityScore(
  maxSeverityWeight: number,
  dalcShare: number,
  assetRatio: number,
  effortBand: EffortBand,
  confidence: ConfidenceLevel,
  criticalityMultiplier: number = 1.0,
): number {
  const severityComponent = (maxSeverityWeight / 4) * 40;
  const dalcComponent = Math.min(dalcShare * 100, 100) * 0.25;
  const assetComponent = Math.min(assetRatio, 1) * 20;
  const quickWinBonus = effortBand === 'S' ? 10 : 0;
  const confBonus = confidence === 'high' ? 5 : confidence === 'medium' ? 2.5 : 0;

  const raw = severityComponent + dalcComponent + assetComponent + quickWinBonus + confBonus;
  return Math.round(Math.min(raw * criticalityMultiplier, 100));
}

// =============================================================================
// Public API: rankRemediationActions
// =============================================================================

export function rankRemediationActions(actions: RemediationAction[]): RemediationAction[] {
  const sorted = [...actions].sort((a, b) => {
    // Primary: priority score descending
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    // Secondary: severity weight descending
    if (b.severityWeight !== a.severityWeight) return b.severityWeight - a.severityWeight;
    // Tertiary: affected assets descending
    return b.affectedAssets - a.affectedAssets;
  });

  return sorted.map((action, idx) => ({
    ...action,
    priorityRank: idx + 1,
  }));
}

// =============================================================================
// Public API: buildRemediationPlan
// =============================================================================

export interface PlanInput {
  resultSetId: string;
  findings: ParsedFinding[];
  dalcLowUsd: number;
  dalcBaseUsd: number;
  dalcHighUsd: number;
  criticalityAssessment?: CriticalityAssessmentSummary;
  benchmarkSummary?: { overallPosition: string; dalcComparison?: { position: string } };
}

export function buildRemediationPlan(input: PlanInput): RemediationPlan {
  const { resultSetId, findings, dalcLowUsd, dalcBaseUsd, dalcHighUsd, criticalityAssessment, benchmarkSummary } = input;

  // 1. Group findings into action themes
  const groups = groupFindingsIntoActions(findings, resultSetId);

  // 2. Compute total weight for share calculation
  const totalWeight = findings.reduce((sum, f) => {
    return sum + Object.values(f.costWeights).reduce((s, v) => s + v, 0);
  }, 0);

  // 3. Build action objects
  const activeThemes = new Set(groups.keys());
  const actions: RemediationAction[] = [];

  for (const [theme, themeFindings] of groups) {
    const meta = THEME_META[theme];
    if (!meta) continue;

    // Max severity in group
    const maxSev = Math.max(...themeFindings.map(f => SEVERITY_WEIGHT[f.severity] ?? 1));

    // Affected assets (distinct asset_key values)
    const assetKeys = new Set(themeFindings.map(f => f.asset_key).filter(Boolean));
    const affectedAssets = assetKeys.size || themeFindings.length;

    // Total objects across findings (for asset ratio)
    const totalObjects = Math.max(
      1,
      ...themeFindings.map(f => f.total_objects),
    );
    const assetRatio = affectedAssets / totalObjects;

    // Effort band
    const isStructural = STRUCTURAL_THEMES.has(theme);
    const effortBand = deriveEffortBand(themeFindings.length, affectedAssets, isStructural);

    // Impact estimation
    const impact = estimateImpact(themeFindings, findings, dalcLowUsd, dalcBaseUsd, dalcHighUsd);

    // DALC share for scoring
    const actionWeight = themeFindings.reduce((sum, f) => {
      return sum + Object.values(f.costWeights).reduce((s, v) => s + v, 0);
    }, 0);
    const dalcShare = totalWeight > 0 ? actionWeight / totalWeight : 0;

    // Confidence
    const confidence = deriveConfidence(themeFindings);

    // Quick win
    const quickWin = effortBand === 'S' && maxSev >= 3;

    // Criticality multiplier: use the max criticality tier across the action's findings
    let critMultiplier = 1.0;
    if (criticalityAssessment) {
      for (const f of themeFindings) {
        const tier = getCriticalityForFinding(criticalityAssessment, f.asset_key);
        const m = CRITICALITY_PRIORITY_MULTIPLIER[tier];
        if (m > critMultiplier) critMultiplier = m;
      }
    }

    // Priority score
    const priorityScore = computePriorityScore(maxSev, dalcShare, assetRatio, effortBand, confidence, critMultiplier);

    // Sequencing: blocked by
    const deps = THEME_DEPS[theme] ?? [];
    const blockedByActionIds = deps
      .filter(dep => activeThemes.has(dep))
      .map(dep => `action-${dep}`);

    // Explanation
    const severityLabel = maxSev === 4 ? 'critical' : maxSev === 3 ? 'major' : 'minor';
    const critNote = critMultiplier > 1.0
      ? ` Priority boosted ${Math.round((critMultiplier - 1) * 100)}% due to asset criticality.`
      : '';
    const benchNote = benchmarkSummary?.overallPosition === 'above_range' || benchmarkSummary?.dalcComparison?.position === 'above_range'
      ? ' Results are materially worse than expected range for comparable organisations.'
      : '';
    const explanation = `${themeFindings.length} finding(s) at ${severityLabel} severity affecting ${affectedAssets} asset(s). ` +
      `Estimated ${Math.round(dalcShare * 100)}% of total DALC impact.${critNote}${benchNote}`;

    actions.push({
      id: `action-${theme}`,
      resultSetId,
      title: meta.title,
      description: meta.description,
      rationale: meta.rationale,
      theme,
      relatedFindingIds: themeFindings.map(f => String(f.id)),
      relatedFindingCodes: [...new Set(themeFindings.map(f => f.check_id))],
      affectedAssets,
      priorityRank: 0, // set after ranking
      priorityScore,
      severityWeight: maxSev,
      estimatedImpactUsd: impact,
      effortBand,
      likelyOwnerType: meta.ownerType,
      sequenceGroup: meta.sequenceGroup,
      blockedByActionIds,
      quickWin,
      confidenceLevel: confidence,
      explanation,
    });
  }

  // 4. Rank
  const ranked = rankRemediationActions(actions);

  // 5. Aggregate totals
  const totalImpact = ranked.reduce(
    (acc, a) => ({
      low: acc.low + a.estimatedImpactUsd.low,
      base: acc.base + a.estimatedImpactUsd.base,
      high: acc.high + a.estimatedImpactUsd.high,
    }),
    { low: 0, base: 0, high: 0 },
  );

  // 6. Sequence groups
  const groupLabels: Record<SequenceGroup, string> = {
    1: 'Phase 1: Foundations',
    2: 'Phase 2: Structural Improvements',
    3: 'Phase 3: Governance & Readiness',
  };

  const sequenceGroups = ([1, 2, 3] as SequenceGroup[]).map(g => ({
    group: g,
    label: groupLabels[g],
    actionIds: ranked.filter(a => a.sequenceGroup === g).map(a => a.id),
  })).filter(g => g.actionIds.length > 0);

  return {
    resultSetId,
    generatedAt: new Date().toISOString(),
    actions: ranked,
    totalEstimatedImpactUsd: totalImpact,
    quickWinCount: ranked.filter(a => a.quickWin).length,
    sequenceGroups,
  };
}
