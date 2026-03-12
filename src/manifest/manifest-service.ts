/**
 * Assessment Manifest — Builder Service
 *
 * Derives a deterministic audit/reproducibility manifest from existing
 * persisted result-set data. No new data is collected — this is a pure
 * read-model transformation.
 */

import type { ScanResultSetRow, ResultFindingRow } from '../server/db/scan-result-types';
import type {
  AssessmentManifest,
  ManifestVersionInfo,
  ManifestRunMetadata,
  ManifestScanCoverage,
  ManifestComponentAvailability,
} from './types';

// Schema version imported at build time — single source of truth
// We read it from the module rather than coupling to the DB init code
import { SCHEMA_VERSION } from './constants';

// =============================================================================
// Duration formatting
// =============================================================================

function formatDuration(ms: number | null): string | null {
  if (ms === null || ms === undefined) return null;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

// =============================================================================
// Manifest Building
// =============================================================================

/**
 * Build a complete assessment manifest from a result set row.
 *
 * @param row - The scan result set row (from SQLite).
 * @param findings - The findings for this result set (used for property coverage).
 * @param projectScanCount - Number of completed scans for the project (for trend availability).
 */
export function buildAssessmentManifest(
  row: ScanResultSetRow,
  findings: ResultFindingRow[],
  projectScanCount: number,
): AssessmentManifest {
  return {
    manifestVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    versions: buildVersionInfo(row),
    run: buildRunMetadata(row),
    coverage: buildScanCoverage(row, findings),
    components: buildComponentAvailability(row, findings, projectScanCount),
  };
}

/**
 * Build version info from a result set row.
 */
export function buildVersionInfo(row: ScanResultSetRow): ManifestVersionInfo {
  return {
    appVersion: row.app_version,
    dalcVersion: row.dalc_version,
    rulesetVersion: row.ruleset_version,
    schemaVersion: SCHEMA_VERSION,
  };
}

/**
 * Build run metadata from a result set row.
 */
export function buildRunMetadata(row: ScanResultSetRow): ManifestRunMetadata {
  return {
    resultSetId: row.id,
    scanId: row.scan_id,
    runLabel: row.run_label,
    adapterType: row.adapter_type,
    sourceName: row.source_name,
    sourceFingerprint: row.source_fingerprint,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
    durationLabel: formatDuration(row.duration_ms),
  };
}

/**
 * Build scan coverage from a result set row + findings.
 */
export function buildScanCoverage(
  row: ScanResultSetRow,
  findings: ResultFindingRow[],
): ManifestScanCoverage {
  // Count distinct properties with at least one finding
  const propertiesWithFindings = new Set(findings.map(f => f.property));

  return {
    totalFindings: row.total_findings,
    criticalCount: row.critical_count,
    majorCount: row.major_count,
    minorCount: row.minor_count,
    infoCount: row.info_count,
    propertiesCovered: propertiesWithFindings.size,
    totalProperties: 8, // P1–P8 in current ruleset
    dalcTotalUsd: row.dalc_total_usd,
    dalcBaseUsd: row.dalc_base_usd,
    dalcLowUsd: row.dalc_low_usd,
    dalcHighUsd: row.dalc_high_usd,
    amplificationRatio: row.amplification_ratio,
    derivedApproach: row.derived_approach,
  };
}

/**
 * Build component availability flags from persisted state.
 */
export function buildComponentAvailability(
  row: ScanResultSetRow,
  findings: ResultFindingRow[],
  projectScanCount: number,
): ManifestComponentAvailability {
  const isCompleted = row.status === 'completed';
  const hasFindings = findings.length > 0;

  // Check if cost weights are present in findings (needed for blast-radius)
  const hasCostWeights = findings.some(f => {
    try {
      const weights = JSON.parse(f.cost_weights_json);
      return Object.keys(weights).length > 0;
    } catch {
      return false;
    }
  });

  return {
    coreFindings: isCompleted && hasFindings,
    criticalityAssessment: row.criticality_json !== null && row.criticality_json !== '{}',
    methodologySummary: row.methodology_json !== null && row.methodology_json !== '{}',
    trendDataAvailable: projectScanCount >= 2,
    benchmarkAvailable: isCompleted && hasFindings,
    blastRadiusAvailable: isCompleted && hasFindings && hasCostWeights,
    remediationAvailable: isCompleted && hasFindings,
  };
}

/**
 * Derive a status indicator for a result set.
 * Used by the UI to choose badge color.
 */
export function deriveStatusIndicator(
  row: ScanResultSetRow | null | undefined,
): 'complete' | 'partial' | 'failed' | 'unavailable' {
  if (!row) return 'unavailable';
  if (row.status === 'completed') {
    // Check if all expected data is present
    if (row.total_findings > 0 && row.dalc_total_usd > 0) {
      return 'complete';
    }
    return 'partial';
  }
  if (row.status === 'failed') return 'failed';
  if (row.status === 'partial') return 'partial';
  return 'unavailable';
}
