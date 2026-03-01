/**
 * Severity Scorer
 *
 * Converts raw check findings into scored findings by computing:
 *   rawScore = w₁ × ratioScore + w₂ × severityScore + w₃ × breadthScore
 *
 * With two post-processing adjustments:
 * 1. Complexity floor: if total tables < 20, cap severityScore at 0.6
 *    (small databases shouldn't trigger extreme severity)
 * 2. Zero-row downgrade: tables with 0 rows reduce confidence
 *    (empty schemas shouldn't be treated as production problems)
 */

import type { SchemaData } from '../adapters/types';
import type { Finding } from '../checks/types';

// =============================================================================
// Configurable weights (must sum to 1.0)
// =============================================================================
const W1_RATIO = 0.5;     // How many objects are affected (ratio)
const W2_SEVERITY = 0.3;  // Severity level from the check
const W3_BREADTH = 0.2;   // How many distinct schemas are affected

// =============================================================================
// Severity multipliers
// =============================================================================
const SEVERITY_MULTIPLIERS: Record<string, number> = {
  critical: 1.0,
  major: 0.7,
  minor: 0.4,
  info: 0.1,
};

// =============================================================================
// Complexity floor constant
// =============================================================================
const COMPLEXITY_FLOOR_TABLE_THRESHOLD = 20;
const COMPLEXITY_FLOOR_CAP = 0.6;

// =============================================================================
// Public API
// =============================================================================

export interface ScoredFindings {
  findings: Finding[];
  propertyScores: Map<number, number>;  // property (1–7) → aggregated rawScore 0.0–1.0
  totalTables: number;
  totalRowCount: number;
  zeroRowDowngrade: boolean;
  complexityFloorApplied: boolean;
}

/**
 * Score all findings from the check phase.
 * Mutates each Finding's `rawScore` field in place and returns summary.
 */
export function scoreFindings(
  findings: Finding[],
  schema: SchemaData,
): ScoredFindings {
  const totalTables = schema.tables.filter((t) => t.type === 'table').length;

  // Calculate total row count from statistics
  const totalRowCount = schema.tableStatistics.reduce(
    (sum, ts) => sum + ts.rowCount,
    0,
  );

  const complexityFloorApplied = totalTables < COMPLEXITY_FLOOR_TABLE_THRESHOLD;
  const zeroRowDowngrade = totalRowCount === 0;

  // Count distinct schemas in the database
  const allSchemas = new Set(schema.tables.map((t) => t.schema));
  const totalSchemaCount = allSchemas.size || 1; // Avoid division by zero

  // Score each finding
  for (const finding of findings) {
    // 1. Ratio score: directly from the finding's affected/total ratio
    const ratioScore = Math.min(1.0, Math.max(0, finding.ratio));

    // 2. Severity score: map severity label to numeric multiplier
    let severityScore = SEVERITY_MULTIPLIERS[finding.severity] ?? 0.5;

    // Apply complexity floor: small DB caps severity
    if (complexityFloorApplied) {
      severityScore = Math.min(severityScore, COMPLEXITY_FLOOR_CAP);
    }

    // 3. Breadth score: how many distinct schemas are represented in evidence
    const evidenceSchemas = new Set(
      finding.evidence.map((e) => e.schema),
    );
    const breadthScore = Math.min(
      1.0,
      evidenceSchemas.size / totalSchemaCount,
    );

    // Compute weighted raw score
    let rawScore = W1_RATIO * ratioScore + W2_SEVERITY * severityScore + W3_BREADTH * breadthScore;

    // Apply zero-row downgrade: reduce confidence by 50% if no rows in any table
    if (zeroRowDowngrade) {
      rawScore *= 0.5;
    }

    // Clamp to [0.0, 1.0]
    finding.rawScore = Math.min(1.0, Math.max(0, rawScore));
  }

  // Aggregate per-property scores (max rawScore per property)
  const propertyScores = new Map<number, number>();
  for (const finding of findings) {
    const current = propertyScores.get(finding.property) ?? 0;
    propertyScores.set(finding.property, Math.max(current, finding.rawScore));
  }

  return {
    findings,
    propertyScores,
    totalTables,
    totalRowCount,
    zeroRowDowngrade,
    complexityFloorApplied,
  };
}
