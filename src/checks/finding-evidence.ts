/**
 * Finding Evidence Model — Rich, structured evidence for every finding.
 *
 * Seven conceptual layers:
 *   1. Detection metadata  — what check ran, when, against what source
 *   2. Metric observation   — the numeric measurement that triggered the finding
 *   3. Rule threshold       — the rule/threshold that was violated
 *   4. Asset context        — which schema object(s) are affected
 *   5. Sample evidence      — concrete rows/values proving the issue
 *   6. Confidence           — how sure the scanner is
 *   7. Provenance           — where the data came from
 *
 * All fields are explicit (no `any`). Evidence is immutable once persisted.
 */

import type { CostCategory } from './types';
import type { CheckMethodology } from './methodology-register';

// =============================================================================
// Layer 1 — Detection Metadata
// =============================================================================

/** Captures what ran, when, and why. Attached to every finding. */
export interface FindingDetectionMeta {
  /** Check ID that produced this finding (e.g. "P5-MISSING-PK") */
  checkId: string;
  /** DALC property number 1–8 */
  property: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  /** Human-readable check name */
  checkName: string;
  /** ISO-8601 timestamp when check executed */
  detectedAt: string;
  /** App version that ran the check */
  appVersion: string;
  /** Ruleset version applied */
  rulesetVersion: string;
}

// =============================================================================
// Layer 2 — Metric Observation
// =============================================================================

/** The numeric measurement that triggered the finding. */
export interface FindingMetricObservation {
  /** What was measured (e.g. "null_fraction", "type_count", "variant_count") */
  metricName: string;
  /** The observed numeric value */
  observedValue: number;
  /** Unit of measurement (e.g. "fraction", "count", "percent") */
  unit: string;
  /** Human description: "45% of rows have NULL values" */
  displayText: string;
}

// =============================================================================
// Layer 3 — Rule / Threshold
// =============================================================================

/** The rule or threshold that was violated. */
export interface FindingThreshold {
  /** Threshold value (e.g. 0.3 for 30% null rate) */
  thresholdValue: number;
  /** Comparison operator used */
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'ne';
  /** Human description: "Maximum allowed null fraction is 30%" */
  displayText: string;
}

// =============================================================================
// Layer 4 — Asset Context
// =============================================================================

/** Affected schema objects. */
export interface FindingAssetContext {
  /** Asset type: table, column, constraint, index, etc. */
  assetType: 'table' | 'column' | 'constraint' | 'index' | 'schema' | 'relationship';
  /** Unique key identifying the asset (e.g. "public.orders.status") */
  assetKey: string;
  /** Human-readable name */
  assetName: string;
  /** Parent schema name */
  schemaName: string;
  /** Parent table name (if applicable) */
  tableName?: string;
  /** Column name (if applicable) */
  columnName?: string;
}

// =============================================================================
// Layer 5 — Sample Evidence
// =============================================================================

/** Concrete rows/values proving the issue exists. */
export interface FindingSample {
  /** What this sample represents */
  label: string;
  /** The sample value or description */
  value: string;
  /** Additional structured data about the sample */
  context?: Record<string, string | number | boolean>;
}

// =============================================================================
// Layer 6 — Confidence
// =============================================================================

/** How sure the scanner is about this finding. */
export interface FindingConfidence {
  /** Confidence level */
  level: 'high' | 'medium' | 'low';
  /**
   * Numeric score 0.0–1.0.
   *   high   = 0.8–1.0: deterministic rule match (missing PK, type mismatch)
   *   medium = 0.5–0.79: heuristic match (naming patterns, similarity)
   *   low    = 0.0–0.49: statistical inference with limited data
   */
  score: number;
  /** Why this confidence level was assigned */
  reason: string;
}

// =============================================================================
// Layer 7 — Provenance
// =============================================================================

/** Where the data came from. */
export interface FindingProvenance {
  /** Source adapter type (e.g. "postgres", "mysql", "csv") */
  adapterType: string;
  /** Source identifier (e.g. database name, file path) */
  sourceName: string;
  /** SHA-256 hash of source if available */
  sourceFingerprint?: string;
  /** ISO-8601 timestamp when source was read */
  extractedAt: string;
}

// =============================================================================
// Layer 8 — Methodology & Assumptions
// =============================================================================

/**
 * Methodology card attached to a finding for auditability.
 * Sourced from the static methodology register at evidence-build time.
 */
export interface FindingMethodology {
  /** Detection technique classification */
  technique: 'deterministic' | 'heuristic' | 'statistical';
  /** Plain-English description of how the check works */
  methodology: string;
  /** Assumptions the check makes */
  assumptions: string[];
  /** Known limitations and edge cases */
  limitations: string[];
  /** What data inputs the check inspects */
  dataInputs: string[];
  /** Academic or industry references (if any) */
  references: string[];
}

// =============================================================================
// Display / Explanation
// =============================================================================

/** Pre-rendered explanation text for the UI. */
export interface FindingDisplayExplanation {
  /** One-line summary: "45% of rows in orders.status are NULL" */
  whatWasFound: string;
  /** Why this matters to the organization */
  whyItMatters: string;
  /** How the finding was detected (plain English) */
  howDetected: string;
}

// =============================================================================
// Composite Evidence Envelope
// =============================================================================

/**
 * The complete evidence package for a single finding.
 * Built by the evidence builder and persisted as JSON in result_findings.
 */
export interface FindingEvidence {
  /** Schema version for forward-compat deserialization */
  schemaVersion: 1;

  /** Layer 1: detection metadata */
  detection: FindingDetectionMeta;

  /** Layer 2: metric observation (null if check is boolean/presence-based) */
  metric: FindingMetricObservation | null;

  /** Layer 3: rule threshold (null if no numeric threshold applies) */
  threshold: FindingThreshold | null;

  /** Layer 4: primary affected asset */
  asset: FindingAssetContext;

  /** Layer 4b: additional affected assets (e.g. multiple tables with same column name) */
  relatedAssets: FindingAssetContext[];

  /** Layer 5: sample evidence (capped to first N rows/values) */
  samples: FindingSample[];

  /** Layer 6: confidence assessment */
  confidence: FindingConfidence;

  /** Layer 7: provenance */
  provenance: FindingProvenance;

  /** Pre-rendered explanation for UI display */
  explanation: FindingDisplayExplanation;

  /** Layer 8: methodology & assumptions (from static register) */
  methodology: FindingMethodology | null;
}

// =============================================================================
// Persisted Finding Record (extends DB row with parsed evidence)
// =============================================================================

/**
 * A fully-hydrated finding record with parsed evidence.
 * Used in the read model / service layer.
 */
export interface PersistedFindingRecord {
  /** Auto-increment row ID */
  id: number;
  /** FK to scan_result_sets.id */
  resultSetId: string;
  /** FK to projects.id */
  projectId: string;

  // --- Core finding fields ---
  checkId: string;
  property: number;
  severity: string;
  rawScore: number;
  title: string;
  description: string | null;

  // --- Asset (top-level queryable) ---
  assetType: string | null;
  assetKey: string | null;
  assetName: string | null;

  // --- Metric (top-level queryable) ---
  affectedObjects: number;
  totalObjects: number;
  ratio: number;
  thresholdValue: number | null;
  observedValue: number | null;
  metricUnit: string | null;

  // --- Remediation ---
  remediation: string | null;

  // --- Parsed JSON blobs ---
  evidence: FindingEvidence | null;
  legacyEvidence: unknown[];
  costCategories: string[];
  costWeights: Record<string, number>;

  // --- Evidence top-level columns (queryable) ---
  confidenceLevel: string | null;
  confidenceScore: number | null;
  explanation: string | null;
  whyItMatters: string | null;
}

// =============================================================================
// View Model for UI Detail Panel
// =============================================================================

/**
 * Everything the Finding Detail panel needs in a single object.
 * Mapped from PersistedFindingRecord by the service layer.
 */
export interface FindingDetailViewModel {
  // --- Header ---
  id: number;
  checkId: string;
  property: number;
  severity: string;
  title: string;
  description: string | null;

  // --- Asset ---
  assetType: string | null;
  assetKey: string | null;
  assetName: string | null;

  // --- Metric ---
  affectedObjects: number;
  totalObjects: number;
  ratio: number;
  ratioPercent: string; // pre-formatted "45.2%"

  // --- Threshold ---
  thresholdValue: number | null;
  observedValue: number | null;
  metricUnit: string | null;
  thresholdDisplay: string | null; // "Observed 0.45 > threshold 0.30 (fraction)"

  // --- Explanation ---
  whatWasFound: string | null;
  whyItMatters: string | null;
  howDetected: string | null;

  // --- Confidence ---
  confidenceLevel: string | null;
  confidenceScore: number | null;
  confidenceReason: string | null;

  // --- Samples ---
  samples: FindingSample[];

  // --- Provenance ---
  provenance: FindingProvenance | null;

  // --- Remediation ---
  remediation: string | null;

  // --- Cost ---
  costCategories: string[];
  costWeights: Record<string, number>;

  // --- Methodology ---
  methodology: FindingMethodology | null;
}
