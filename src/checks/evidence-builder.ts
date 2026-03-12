/**
 * Evidence Builder — Composable helpers for constructing FindingEvidence.
 *
 * Detectors call `buildFindingEvidence(...)` with simple inputs.
 * Mapper helpers convert common patterns (missing-thing, threshold-violation,
 * count-based, similarity-based) into the 7-layer evidence envelope.
 */

import type {
  FindingEvidence,
  FindingMetricObservation,
  FindingThreshold,
  FindingAssetContext,
  FindingSample,
  FindingConfidence,
  FindingProvenance,
  FindingDetectionMeta,
  FindingDisplayExplanation,
  FindingMethodology,
} from './finding-evidence';
import { getCheckMethodology } from './methodology-register';

// =============================================================================
// Builder Input — everything a detector needs to supply
// =============================================================================

export interface EvidenceBuilderInput {
  /** Check metadata */
  checkId: string;
  property: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  checkName: string;

  /** Severity (used for confidence derivation) */
  severity: 'critical' | 'major' | 'minor' | 'info';

  /** Primary affected asset */
  asset: {
    type: FindingAssetContext['assetType'];
    key: string;
    name: string;
    schema: string;
    table?: string;
    column?: string;
  };

  /** Additional affected assets */
  relatedAssets?: Array<{
    type: FindingAssetContext['assetType'];
    key: string;
    name: string;
    schema: string;
    table?: string;
    column?: string;
  }>;

  /** Metric observation (optional — some checks are boolean) */
  metric?: {
    name: string;
    observed: number;
    unit: string;
    displayText: string;
  };

  /** Threshold (optional — some checks have no numeric threshold) */
  threshold?: {
    value: number;
    operator: FindingThreshold['operator'];
    displayText: string;
  };

  /** Sample evidence — concrete examples (capped at 10) */
  samples?: Array<{
    label: string;
    value: string;
    context?: Record<string, string | number | boolean>;
  }>;

  /** Confidence override (if not provided, derived from severity) */
  confidence?: {
    level: 'high' | 'medium' | 'low';
    score: number;
    reason: string;
  };

  /** Explanation text */
  explanation: {
    whatWasFound: string;
    whyItMatters: string;
    howDetected: string;
  };
}

// =============================================================================
// Scan Context — shared across all findings in a single scan run
// =============================================================================

export interface ScanContext {
  appVersion: string;
  rulesetVersion: string;
  adapterType: string;
  sourceName: string;
  sourceFingerprint?: string;
  /** ISO-8601 timestamp */
  scanStartedAt: string;
}

// =============================================================================
// Builder
// =============================================================================

const MAX_SAMPLES = 10;

/**
 * Build a complete FindingEvidence envelope from detector inputs.
 */
export function buildFindingEvidence(
  input: EvidenceBuilderInput,
  ctx: ScanContext,
): FindingEvidence {
  const detection: FindingDetectionMeta = {
    checkId: input.checkId,
    property: input.property,
    checkName: input.checkName,
    detectedAt: new Date().toISOString(),
    appVersion: ctx.appVersion,
    rulesetVersion: ctx.rulesetVersion,
  };

  const metric: FindingMetricObservation | null = input.metric
    ? {
        metricName: input.metric.name,
        observedValue: input.metric.observed,
        unit: input.metric.unit,
        displayText: input.metric.displayText,
      }
    : null;

  const threshold: FindingThreshold | null = input.threshold
    ? {
        thresholdValue: input.threshold.value,
        operator: input.threshold.operator,
        displayText: input.threshold.displayText,
      }
    : null;

  const asset: FindingAssetContext = {
    assetType: input.asset.type,
    assetKey: input.asset.key,
    assetName: input.asset.name,
    schemaName: input.asset.schema,
    tableName: input.asset.table,
    columnName: input.asset.column,
  };

  const relatedAssets: FindingAssetContext[] = (input.relatedAssets ?? []).map(a => ({
    assetType: a.type,
    assetKey: a.key,
    assetName: a.name,
    schemaName: a.schema,
    tableName: a.table,
    columnName: a.column,
  }));

  const samples: FindingSample[] = (input.samples ?? []).slice(0, MAX_SAMPLES).map(s => ({
    label: s.label,
    value: s.value,
    context: s.context,
  }));

  const confidence: FindingConfidence = input.confidence
    ? { ...input.confidence }
    : deriveConfidence(input.severity, input.checkId);

  const provenance: FindingProvenance = {
    adapterType: ctx.adapterType,
    sourceName: ctx.sourceName,
    sourceFingerprint: ctx.sourceFingerprint,
    extractedAt: ctx.scanStartedAt,
  };

  const explanation: FindingDisplayExplanation = {
    whatWasFound: input.explanation.whatWasFound,
    whyItMatters: input.explanation.whyItMatters,
    howDetected: input.explanation.howDetected,
  };

  // Layer 8: methodology from static register
  const methodologyCard = getCheckMethodology(input.checkId);
  const methodology: FindingMethodology | null = methodologyCard
    ? {
        technique: methodologyCard.technique,
        methodology: methodologyCard.methodology,
        assumptions: methodologyCard.assumptions,
        limitations: methodologyCard.limitations,
        dataInputs: methodologyCard.dataInputs,
        references: methodologyCard.references ?? [],
      }
    : null;

  return {
    schemaVersion: 1,
    detection,
    metric,
    threshold,
    asset,
    relatedAssets,
    samples,
    confidence,
    provenance,
    explanation,
    methodology,
  };
}

// =============================================================================
// Confidence Derivation
// =============================================================================

/** Deterministic checks (presence-based) get high confidence; heuristic ones get medium. */
const HEURISTIC_CHECKS = new Set([
  'P1-SEMANTIC-IDENTITY',
  'P5-NAMING-VIOLATIONS',
  'P2-UNCONTROLLED-VOCAB',
]);

function deriveConfidence(
  severity: string,
  checkId: string,
): FindingConfidence {
  if (HEURISTIC_CHECKS.has(checkId)) {
    return {
      level: 'medium',
      score: 0.65,
      reason: 'Heuristic-based detection using pattern matching or similarity analysis',
    };
  }

  // Deterministic rule match
  return {
    level: 'high',
    score: 0.95,
    reason: 'Deterministic rule match against schema metadata',
  };
}

// =============================================================================
// Convenience Mappers — common finding patterns
// =============================================================================

/**
 * For "missing thing" findings (missing PK, missing audit columns, no constraints).
 * Creates evidence with no metric/threshold — the absence IS the finding.
 */
export function buildMissingThingEvidence(opts: {
  checkId: string;
  property: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  checkName: string;
  severity: 'critical' | 'major' | 'minor' | 'info';
  tables: Array<{ schema: string; table: string }>;
  whatLabel: string; // e.g. "primary key", "audit columns"
  whyItMatters: string;
  ctx: ScanContext;
}): FindingEvidence {
  const primary = opts.tables[0];
  return buildFindingEvidence({
    checkId: opts.checkId,
    property: opts.property,
    checkName: opts.checkName,
    severity: opts.severity,
    asset: {
      type: 'table',
      key: `${primary.schema}.${primary.table}`,
      name: primary.table,
      schema: primary.schema,
      table: primary.table,
    },
    relatedAssets: opts.tables.slice(1).map(t => ({
      type: 'table' as const,
      key: `${t.schema}.${t.table}`,
      name: t.table,
      schema: t.schema,
      table: t.table,
    })),
    samples: opts.tables.slice(0, MAX_SAMPLES).map(t => ({
      label: `Table missing ${opts.whatLabel}`,
      value: `${t.schema}.${t.table}`,
    })),
    explanation: {
      whatWasFound: `${opts.tables.length} table(s) are missing ${opts.whatLabel}`,
      whyItMatters: opts.whyItMatters,
      howDetected: `Checked schema metadata for ${opts.whatLabel} definitions`,
    },
  }, opts.ctx);
}

/**
 * For threshold-violation findings (high null rate, etc.).
 * Creates evidence with metric + threshold layers.
 */
export function buildThresholdViolationEvidence(opts: {
  checkId: string;
  property: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  checkName: string;
  severity: 'critical' | 'major' | 'minor' | 'info';
  asset: { schema: string; table: string; column: string };
  metricName: string;
  observed: number;
  threshold: number;
  unit: string;
  operator: FindingThreshold['operator'];
  whyItMatters: string;
  ctx: ScanContext;
}): FindingEvidence {
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  return buildFindingEvidence({
    checkId: opts.checkId,
    property: opts.property,
    checkName: opts.checkName,
    severity: opts.severity,
    asset: {
      type: 'column',
      key: `${opts.asset.schema}.${opts.asset.table}.${opts.asset.column}`,
      name: opts.asset.column,
      schema: opts.asset.schema,
      table: opts.asset.table,
      column: opts.asset.column,
    },
    metric: {
      name: opts.metricName,
      observed: opts.observed,
      unit: opts.unit,
      displayText: opts.unit === 'fraction'
        ? `${pct(opts.observed)} observed`
        : `${opts.observed} ${opts.unit} observed`,
    },
    threshold: {
      value: opts.threshold,
      operator: opts.operator,
      displayText: opts.unit === 'fraction'
        ? `Maximum allowed is ${pct(opts.threshold)}`
        : `Maximum allowed is ${opts.threshold} ${opts.unit}`,
    },
    explanation: {
      whatWasFound: `${opts.asset.schema}.${opts.asset.table}.${opts.asset.column} has ${opts.metricName} of ${
        opts.unit === 'fraction' ? pct(opts.observed) : opts.observed
      }`,
      whyItMatters: opts.whyItMatters,
      howDetected: `Compared observed ${opts.metricName} against configured threshold`,
    },
  }, opts.ctx);
}

/**
 * For count-based aggregate findings (type inconsistency, uncontrolled vocab).
 */
export function buildCountBasedEvidence(opts: {
  checkId: string;
  property: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  checkName: string;
  severity: 'critical' | 'major' | 'minor' | 'info';
  primaryAsset: { type: FindingAssetContext['assetType']; schema: string; key: string; name: string; table?: string; column?: string };
  count: number;
  total: number;
  unit: string; // e.g. "columns", "tables"
  samples: Array<{ label: string; value: string; context?: Record<string, string | number | boolean> }>;
  whatWasFound: string;
  whyItMatters: string;
  howDetected: string;
  ctx: ScanContext;
}): FindingEvidence {
  return buildFindingEvidence({
    checkId: opts.checkId,
    property: opts.property,
    checkName: opts.checkName,
    severity: opts.severity,
    asset: {
      type: opts.primaryAsset.type,
      key: opts.primaryAsset.key,
      name: opts.primaryAsset.name,
      schema: opts.primaryAsset.schema,
      table: opts.primaryAsset.table,
      column: opts.primaryAsset.column,
    },
    metric: {
      name: `affected_${opts.unit}`,
      observed: opts.count,
      unit: opts.unit,
      displayText: `${opts.count} of ${opts.total} ${opts.unit} affected`,
    },
    samples: opts.samples,
    explanation: {
      whatWasFound: opts.whatWasFound,
      whyItMatters: opts.whyItMatters,
      howDetected: opts.howDetected,
    },
  }, opts.ctx);
}
