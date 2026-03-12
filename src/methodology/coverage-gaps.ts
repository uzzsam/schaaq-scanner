/**
 * Coverage-Gap Derivation — What the Scan Could NOT Assess
 *
 * Deterministic rules that fire based on scan context.
 * Each gap documents a limitation, its impact, and a mitigation hint.
 */

import type { CoverageGapRecord, MethodologyBuilderInput } from './types';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function gap(
  id: string,
  category: string,
  description: string,
  impact: string,
  mitigationHint: string,
): CoverageGapRecord {
  return { id, category, description, impact, mitigationHint };
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

/**
 * Derive coverage gaps from the scan context.
 * Returns only gaps whose trigger condition is true.
 */
export function deriveCoverageGaps(input: MethodologyBuilderInput): CoverageGapRecord[] {
  const gaps: CoverageGapRecord[] = [];

  // --- DRY_RUN: Mock data used ---
  if (input.isDryRun) {
    gaps.push(gap(
      'DRY_RUN',
      'data_source',
      'Scan used synthetic mock data instead of a real database.',
      'All findings and cost estimates are illustrative only. They do not reflect actual database conditions.',
      'Connect a real database adapter and re-run the scan.',
    ));
  }

  // --- NO_LINEAGE: No pipeline mapping provided ---
  if (!input.hasPipelineMapping) {
    gaps.push(gap(
      'NO_LINEAGE',
      'data_flow',
      'No pipeline mapping was provided.',
      'Data flow integrity, mapping drift, and lineage gap checks could not be assessed (P4 partial).',
      'Provide a pipeline mapping file (JSON or CSV) describing source-to-target field mappings.',
    ));
  }

  // --- NO_EXTERNAL_LINEAGE: No external lineage artifacts ---
  if (!input.hasExternalLineage) {
    gaps.push(gap(
      'NO_EXTERNAL_LINEAGE',
      'data_flow',
      'No external lineage artifacts (e.g. dbt, Airflow) were provided.',
      'Cross-system lineage verification could not be performed.',
      'Export lineage metadata from your orchestration tool and include it in the scan configuration.',
    ));
  }

  // --- PARTIAL_SCAN: Some checks ran but produced no findings on a non-trivial schema ---
  if (input.totalTables >= 10) {
    const checksWithNoFindings = input.checksAvailable - input.checksRun;
    if (checksWithNoFindings > 0) {
      gaps.push(gap(
        'PARTIAL_SCAN',
        'detection',
        `${checksWithNoFindings} of ${input.checksAvailable} available checks were not executed.`,
        'Some data quality dimensions were not assessed, reducing overall detection coverage.',
        'Review scanner configuration to ensure all relevant checks are enabled.',
      ));
    }
  }

  // --- SPARSE_EVIDENCE: High-severity findings lack structured evidence ---
  if (input.totalHighSeverity > 0) {
    const evidenceRatio = input.highSeverityWithEvidence / input.totalHighSeverity;
    if (evidenceRatio < 0.8) {
      const pct = Math.round((1 - evidenceRatio) * 100);
      gaps.push(gap(
        'SPARSE_EVIDENCE',
        'detection',
        `${pct}% of high-severity findings (critical + major) lack structured evidence envelopes.`,
        'Confidence in severity assignment is reduced for findings without supporting evidence.',
        'This is typically resolved by scanner upgrades that add evidence builders to older checks.',
      ));
    }
  }

  // --- NAMING_HEURISTICS: Criticality relies on naming patterns ---
  if (
    input.criticalityContext.wasRun &&
    input.criticalityContext.cdeIdentificationMethod === 'naming-heuristic'
  ) {
    gaps.push(gap(
      'NAMING_HEURISTICS',
      'criticality',
      'Critical Data Element (CDE) identification relies on table/column naming heuristics.',
      'Tables with non-standard names may be misclassified. Actual business criticality may differ.',
      'Provide an explicit CDE registry or tag critical tables in the scanner configuration.',
    ));
  }

  // --- LIMITED_CROSS_SYSTEM: Single adapter, no cross-system mapping ---
  if (!input.hasPipelineMapping && !input.hasExternalLineage) {
    gaps.push(gap(
      'LIMITED_CROSS_SYSTEM',
      'asset_coverage',
      'Scan assessed a single data source with no cross-system mapping.',
      'Integration quality, cross-system consistency, and data flow risks cannot be evaluated.',
      'Include pipeline mappings or connect additional data sources for a holistic assessment.',
    ));
  }

  // --- SMALL_SCHEMA: Very few tables limit statistical reliability ---
  if (input.totalTables < 10) {
    gaps.push(gap(
      'SMALL_SCHEMA',
      'detection',
      `Schema contains only ${input.totalTables} table(s). Statistical checks have limited sample size.`,
      'Anomaly detection and pattern-based checks may produce less reliable results.',
      'For small schemas, focus on deterministic checks (naming, constraints, documentation) rather than statistical ones.',
    ));
  }

  // --- NO_CRITICALITY: Criticality engine was not run ---
  if (!input.criticalityContext.wasRun) {
    gaps.push(gap(
      'NO_CRITICALITY',
      'criticality',
      'Criticality assessment was not performed.',
      'Remediation prioritisation cannot account for asset business criticality.',
      'Ensure the criticality engine is enabled in the scanner configuration.',
    ));
  }

  return gaps;
}
