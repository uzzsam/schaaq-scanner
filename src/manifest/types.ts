/**
 * Assessment Manifest — Type Definitions
 *
 * Deterministic audit/reproducibility manifest derived from existing
 * persisted result-set data. Provides a single-read snapshot of:
 * - Version traceability (app, engine, ruleset, schema)
 * - Run metadata (timing, adapter, source)
 * - Scan coverage (schemas, tables, properties, severity counts)
 * - Component availability (which enrichment layers produced data)
 *
 * No new data is collected — this is a pure read-model over
 * existing ScanResultSetRow + related persisted state.
 */

// =============================================================================
// Version Information
// =============================================================================

export interface ManifestVersionInfo {
  /** Application version (e.g. '3.7.1'). */
  appVersion: string;
  /** DALC engine version (e.g. 'v4.0.0'). */
  dalcVersion: string;
  /** Ruleset version (e.g. 'v1.0.0'). */
  rulesetVersion: string;
  /** Database schema version (integer). */
  schemaVersion: number;
}

// =============================================================================
// Run Metadata
// =============================================================================

export interface ManifestRunMetadata {
  /** Result set ID (UUID). */
  resultSetId: string;
  /** Associated scan ID (null for dry-run imports). */
  scanId: string | null;
  /** Human-readable run label. */
  runLabel: string;
  /** Adapter type used (e.g. 'postgresql', 'mock'). */
  adapterType: string;
  /** Source name (e.g. database name or file). */
  sourceName: string | null;
  /** Source fingerprint hash (null if unavailable). */
  sourceFingerprint: string | null;
  /** Completion status. */
  status: string;
  /** ISO timestamp — scan started. */
  startedAt: string;
  /** ISO timestamp — scan completed (null if failed/running). */
  completedAt: string | null;
  /** Duration in milliseconds (null if incomplete). */
  durationMs: number | null;
  /** Human-readable duration string (e.g. '12.4s'). */
  durationLabel: string | null;
}

// =============================================================================
// Scan Coverage
// =============================================================================

export interface ManifestScanCoverage {
  /** Total findings produced. */
  totalFindings: number;
  /** Severity breakdown. */
  criticalCount: number;
  majorCount: number;
  minorCount: number;
  infoCount: number;
  /** Number of distinct properties (P1–P8) with at least one finding. */
  propertiesCovered: number;
  /** Total properties assessed (always 8 for current ruleset). */
  totalProperties: number;
  /** DALC cost band (USD). */
  dalcTotalUsd: number;
  dalcBaseUsd: number | null;
  dalcLowUsd: number | null;
  dalcHighUsd: number | null;
  /** Amplification ratio from DALC engine. */
  amplificationRatio: number;
  /** Derived modelling approach (e.g. 'sector_calibrated'). */
  derivedApproach: string | null;
}

// =============================================================================
// Component Availability
// =============================================================================

/**
 * Which optional enrichment components produced data for this result set.
 * Each flag indicates whether the corresponding data exists in the
 * persisted result — not whether the module is installed.
 */
export interface ManifestComponentAvailability {
  /** Core findings + DALC scoring (always true for completed scans). */
  coreFindings: boolean;
  /** Criticality assessment was saved. */
  criticalityAssessment: boolean;
  /** Methodology summary was saved. */
  methodologySummary: boolean;
  /** Trend data available (project has >=2 completed scans). */
  trendDataAvailable: boolean;
  /** Benchmark comparison can be produced. */
  benchmarkAvailable: boolean;
  /** Blast-radius graph can be derived. */
  blastRadiusAvailable: boolean;
  /** Remediation plan can be generated. */
  remediationAvailable: boolean;
}

// =============================================================================
// Assessment Manifest (top-level aggregate)
// =============================================================================

export interface AssessmentManifest {
  /** Manifest schema version for forward compatibility. */
  manifestVersion: '1.0.0';
  /** ISO timestamp when this manifest was derived. */
  generatedAt: string;
  /** Version traceability. */
  versions: ManifestVersionInfo;
  /** Run metadata. */
  run: ManifestRunMetadata;
  /** Scan coverage summary. */
  coverage: ManifestScanCoverage;
  /** Component availability flags. */
  components: ManifestComponentAvailability;
}

// =============================================================================
// Status indicator types (for UI)
// =============================================================================

export type ManifestStatusIndicator = 'complete' | 'partial' | 'failed' | 'unavailable';

export const MANIFEST_STATUS_COLORS: Record<ManifestStatusIndicator, string> = {
  complete: '#27AE60',
  partial: '#F39C12',
  failed: '#E74C3C',
  unavailable: '#95A5A6',
};

export const MANIFEST_STATUS_LABELS: Record<ManifestStatusIndicator, string> = {
  complete: 'Complete',
  partial: 'Partial',
  failed: 'Failed',
  unavailable: 'Unavailable',
};
