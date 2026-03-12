/**
 * Scan Result Storage — Type Definitions
 *
 * Immutable result sets: each completed scan produces exactly one result set.
 * Prior runs are never overwritten. This enables trend analysis, diffing,
 * and defensible audit trails.
 */

// ---------------------------------------------------------------------------
// Database Row Types (match SQLite columns 1:1)
// ---------------------------------------------------------------------------

export interface ScanResultSetRow {
  id: string;
  project_id: string;
  scan_id: string | null;
  run_label: string;
  adapter_type: string;
  source_name: string | null;
  source_fingerprint: string | null;
  app_version: string;
  ruleset_version: string;
  dalc_version: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  total_findings: number;
  critical_count: number;
  major_count: number;
  minor_count: number;
  info_count: number;
  dalc_total_usd: number;
  dalc_base_usd: number | null;
  dalc_low_usd: number | null;
  dalc_high_usd: number | null;
  amplification_ratio: number;
  derived_approach: string | null;
  summary_json: string;
  criticality_json: string | null;
  methodology_json: string | null;
  created_at: string;
}

export interface ResultFindingRow {
  id: number;
  result_set_id: string;
  project_id: string;
  check_id: string;
  property: number;
  severity: string;
  raw_score: number;
  title: string;
  description: string | null;
  asset_type: string | null;
  asset_key: string | null;
  asset_name: string | null;
  affected_objects: number;
  total_objects: number;
  ratio: number;
  threshold_value: number | null;
  observed_value: number | null;
  metric_unit: string | null;
  remediation: string | null;
  evidence_json: string;
  cost_categories_json: string;
  cost_weights_json: string;
  confidence_level: string | null;
  confidence_score: number | null;
  explanation: string | null;
  why_it_matters: string | null;
}

// ---------------------------------------------------------------------------
// Input Types (for creating new records)
// ---------------------------------------------------------------------------

export interface NewScanResultSetInput {
  projectId: string;
  scanId: string | null;
  runLabel: string;
  adapterType: string;
  sourceName?: string;
  sourceFingerprint?: string;
  appVersion: string;
  rulesetVersion: string;
  dalcVersion: string;
  status?: 'completed' | 'failed' | 'partial';
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  totalFindings: number;
  criticalCount: number;
  majorCount: number;
  minorCount: number;
  infoCount: number;
  dalcTotalUsd: number;
  dalcBaseUsd?: number;
  dalcLowUsd?: number;
  dalcHighUsd?: number;
  amplificationRatio: number;
  derivedApproach?: string;
  summary: Record<string, unknown>;
}

export interface NewResultFindingInput {
  checkId: string;
  property: number;
  severity: string;
  rawScore: number;
  title: string;
  description?: string;
  assetType?: string;
  assetKey?: string;
  assetName?: string;
  affectedObjects: number;
  totalObjects: number;
  ratio: number;
  thresholdValue?: number;
  observedValue?: number;
  metricUnit?: string;
  remediation?: string;
  evidence: unknown[];
  costCategories: string[];
  costWeights: Record<string, number>;
  confidenceLevel?: string;
  confidenceScore?: number;
  explanation?: string;
  whyItMatters?: string;
}

// ---------------------------------------------------------------------------
// API / Display Types
// ---------------------------------------------------------------------------

/** Lightweight list item for the scan history sidebar/table */
export interface ScanHistoryListItem {
  resultSetId: string;
  scanId: string | null;
  projectId: string;
  runLabel: string;
  adapterType: string;
  sourceName: string | null;
  appVersion: string;
  dalcVersion: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  totalFindings: number;
  criticalCount: number;
  majorCount: number;
  minorCount: number;
  infoCount: number;
  dalcTotalUsd: number;
  dalcBaseUsd: number | null;
  dalcLowUsd: number | null;
  dalcHighUsd: number | null;
  amplificationRatio: number;
  derivedApproach: string | null;
  createdAt: string;
}

/** Comparison between latest and previous scan */
export interface ScanSummaryComparison {
  latest: ScanHistoryListItem;
  previous: ScanHistoryListItem | null;
  delta: {
    totalFindings: number;
    criticalCount: number;
    majorCount: number;
    minorCount: number;
    infoCount: number;
    dalcTotalUsd: number;
    dalcBaseUsd: number | null;
    dalcLowUsd: number | null;
    dalcHighUsd: number | null;
    amplificationRatio: number;
  } | null;
  findingsDiff: {
    added: FindingDiffEntry[];
    removed: FindingDiffEntry[];
    unchanged: number;
  } | null;
}

export interface FindingDiffEntry {
  checkId: string;
  severity: string;
  assetKey: string | null;
  title: string;
}
