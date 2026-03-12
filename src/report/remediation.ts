/**
 * Remediation Priority Derivation
 *
 * Deterministic logic to derive a ranked remediation roadmap from findings.
 * No AI prose — effort bands and sequencing come from severity + property dependencies.
 */

import type { ReportData } from './generator';
import type { RemediationPriority, EffortBand } from './types';

// =============================================================================
// Property Dependency Graph
// =============================================================================

/**
 * Maps each property to its prerequisite properties.
 * P1, P2 are foundational (no deps).
 * P3 depends on P1; P4 depends on P3; etc.
 */
const PROPERTY_DEPS: Record<number, number[]> = {
  1: [],
  2: [],
  3: [1],
  4: [3],
  5: [1],
  6: [5],
  7: [5, 6],
  8: [6, 7],
};

// =============================================================================
// Property Names (canonical)
// =============================================================================

const PROPERTY_NAMES: Record<number, string> = {
  1: 'Semantic Identity',
  2: 'Reference Data',
  3: 'Domain Ownership',
  4: 'Anti-Corruption',
  5: 'Schema Governance',
  6: 'Quality Measurement',
  7: 'Regulatory Traceability',
  8: 'AI Readiness',
};

// =============================================================================
// Severity colors
// =============================================================================

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#E74C3C',
  major: '#F39C12',
  minor: '#3498DB',
  info: '#95A5A6',
};

// =============================================================================
// Effort Band Derivation
// =============================================================================

function deriveEffortBand(severity: string, ratio: number): { band: EffortBand; weeks: string } {
  if (severity === 'critical' && ratio > 0.5) return { band: 'Major', weeks: '4-8' };
  if (severity === 'critical')                return { band: 'Medium', weeks: '2-4' };
  if (severity === 'major' && ratio > 0.3)    return { band: 'Medium', weeks: '2-4' };
  return { band: 'Quick Win', weeks: '1-2' };
}

// =============================================================================
// Sequencing Note
// =============================================================================

function deriveSequencingNote(
  property: number,
  propertiesWithIssues: Set<number>,
): string | null {
  const deps = PROPERTY_DEPS[property] ?? [];
  const blockedBy = deps.filter((d) => propertiesWithIssues.has(d));
  if (blockedBy.length === 0) return null;
  const labels = blockedBy.map((p) => `P${p}`).join(', ');
  return `After ${labels} remediation`;
}

// =============================================================================
// Extract first sentence from remediation text
// =============================================================================

function firstSentence(text: string): string {
  if (!text) return '';
  // Split on period followed by space or end-of-string, take first chunk
  const match = text.match(/^[^.!?]*[.!?]/);
  return match ? match[0].trim() : text.trim();
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Derive a ranked list of remediation priorities from report findings.
 * Deterministic: sorted by severity DESC, rawScore DESC. Capped at maxItems.
 */
export function deriveRemediationPriorities(
  findings: ReportData['findings'],
  maxItems = 10,
): RemediationPriority[] {
  // Severity ordering for sort
  const severityOrder: Record<string, number> = { critical: 0, major: 1, minor: 2, info: 3 };

  // Filter to critical + major only
  const actionable = findings.filter(
    (f) => f.severity === 'critical' || f.severity === 'major',
  );

  // Sort: severity DESC, then rawScore DESC
  const sorted = [...actionable].sort((a, b) => {
    const sevDiff = (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3);
    if (sevDiff !== 0) return sevDiff;
    return b.rawScore - a.rawScore;
  });

  // Cap
  const capped = sorted.slice(0, maxItems);

  // Identify which properties have critical/major issues (for sequencing)
  const propertiesWithIssues = new Set(actionable.map((f) => f.property));

  return capped.map((f, idx) => {
    const { band, weeks } = deriveEffortBand(f.severity, f.ratio);
    return {
      rank: idx + 1,
      findingTitle: f.title,
      checkId: f.checkId,
      property: f.property,
      propertyName: PROPERTY_NAMES[f.property] ?? `Property ${f.property}`,
      severity: f.severity,
      severityColor: SEVERITY_COLORS[f.severity] ?? '#95A5A6',
      actionText: firstSentence(f.remediation),
      businessImpact: f.whyItMatters ?? f.description,
      effortBand: band,
      estimatedWeeks: weeks,
      sequencingNote: deriveSequencingNote(f.property, propertiesWithIssues),
    };
  });
}

// =============================================================================
// Method Limits — factual disclaimers about assessment scope
// =============================================================================

export const METHOD_LIMITS: string[] = [
  'Assessment is based on structural metadata analysis only — data content and business logic were not evaluated.',
  'Cost estimates use the DALC v4 Leontief amplification model calibrated to sector benchmarks; actual costs may vary.',
  'DALC low/base/high range reflects parameter uncertainty — it is not a confidence interval.',
  'Scanner checks evaluate schema-level patterns; runtime query performance and ETL pipeline health are out of scope.',
  'Regulatory risk scoring assumes current regulatory posture — future regulatory changes are not modelled.',
  'AI readiness checks assess structural prerequisites only — model accuracy and ML pipeline maturity are not evaluated.',
  'Findings represent point-in-time observations; database changes after the scan are not reflected.',
  'Remediation effort estimates are indicative bands based on finding severity and scope, not engineering estimates.',
];
