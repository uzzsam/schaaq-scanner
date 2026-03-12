/**
 * Finding Evidence Service — Read Model for Evidence-Backed Findings
 *
 * Maps raw DB rows to PersistedFindingRecord and FindingDetailViewModel.
 * All null handling is explicit. No raw row shape leaks to callers.
 */

import type { ResultFindingRow } from '../db/scan-result-types';
import type { ScanResultRepository } from '../db/scan-result-repository';
import { safeJsonParse } from '../../utils/safe-json';
import type {
  PersistedFindingRecord,
  FindingDetailViewModel,
  FindingEvidence,
  FindingSample,
  FindingProvenance,
} from '../../checks/finding-evidence';

// ---------------------------------------------------------------------------
// Row → PersistedFindingRecord
// ---------------------------------------------------------------------------

/**
 * Parse the evidence_json column. It may contain:
 *   - A FindingEvidence envelope (schemaVersion: 1)
 *   - A legacy evidence array (pre-v11 format)
 *   - An empty string / null / malformed JSON
 *
 * Returns { evidence, legacyEvidence } where exactly one is populated.
 */
function parseEvidenceJson(raw: string): {
  evidence: FindingEvidence | null;
  legacyEvidence: unknown[];
} {
  const parsed = safeJsonParse(raw, null, 'result_findings.evidence_json');

  // New envelope format
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && (parsed as Record<string, unknown>).schemaVersion === 1) {
    return { evidence: parsed as FindingEvidence, legacyEvidence: [] };
  }

  // Legacy array format
  if (Array.isArray(parsed)) {
    return { evidence: null, legacyEvidence: parsed };
  }

  return { evidence: null, legacyEvidence: [] };
}

export function mapRowToPersistedRecord(row: ResultFindingRow): PersistedFindingRecord {
  const { evidence, legacyEvidence } = parseEvidenceJson(row.evidence_json);

  return {
    id: row.id,
    resultSetId: row.result_set_id,
    projectId: row.project_id,
    checkId: row.check_id,
    property: row.property,
    severity: row.severity,
    rawScore: row.raw_score,
    title: row.title,
    description: row.description,
    assetType: row.asset_type,
    assetKey: row.asset_key,
    assetName: row.asset_name,
    affectedObjects: row.affected_objects,
    totalObjects: row.total_objects,
    ratio: row.ratio,
    thresholdValue: row.threshold_value,
    observedValue: row.observed_value,
    metricUnit: row.metric_unit,
    remediation: row.remediation,
    evidence,
    legacyEvidence,
    costCategories: safeJsonParse(row.cost_categories_json, [], 'result_findings.cost_categories_json'),
    costWeights: safeJsonParse(row.cost_weights_json, {}, 'result_findings.cost_weights_json'),
    confidenceLevel: row.confidence_level,
    confidenceScore: row.confidence_score,
    explanation: row.explanation,
    whyItMatters: row.why_it_matters,
  };
}

// ---------------------------------------------------------------------------
// PersistedFindingRecord → FindingDetailViewModel
// ---------------------------------------------------------------------------

function formatRatioPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function buildThresholdDisplay(
  observed: number | null,
  threshold: number | null,
  unit: string | null,
): string | null {
  if (observed == null || threshold == null) return null;
  const unitSuffix = unit ? ` (${unit})` : '';
  return `Observed ${observed} > threshold ${threshold}${unitSuffix}`;
}

export function mapToDetailViewModel(record: PersistedFindingRecord): FindingDetailViewModel {
  const ev = record.evidence;

  return {
    // Header
    id: record.id,
    checkId: record.checkId,
    property: record.property,
    severity: record.severity,
    title: record.title,
    description: record.description,

    // Asset
    assetType: record.assetType,
    assetKey: record.assetKey,
    assetName: record.assetName,

    // Metric
    affectedObjects: record.affectedObjects,
    totalObjects: record.totalObjects,
    ratio: record.ratio,
    ratioPercent: formatRatioPercent(record.ratio),

    // Threshold
    thresholdValue: record.thresholdValue,
    observedValue: record.observedValue,
    metricUnit: record.metricUnit,
    thresholdDisplay: buildThresholdDisplay(record.observedValue, record.thresholdValue, record.metricUnit),

    // Explanation — prefer evidence envelope, fall back to top-level columns
    whatWasFound: ev?.explanation?.whatWasFound ?? record.explanation ?? null,
    whyItMatters: ev?.explanation?.whyItMatters ?? record.whyItMatters ?? null,
    howDetected: ev?.explanation?.howDetected ?? null,

    // Confidence — prefer evidence envelope, fall back to top-level columns
    confidenceLevel: ev?.confidence?.level ?? record.confidenceLevel ?? null,
    confidenceScore: ev?.confidence?.score ?? record.confidenceScore ?? null,
    confidenceReason: ev?.confidence?.reason ?? null,

    // Samples
    samples: ev?.samples ?? [],

    // Provenance
    provenance: ev?.provenance ?? null,

    // Remediation
    remediation: record.remediation,

    // Cost
    costCategories: record.costCategories,
    costWeights: record.costWeights,

    // Methodology
    methodology: ev?.methodology ?? null,
  };
}

// ---------------------------------------------------------------------------
// Service Functions (used by routes)
// ---------------------------------------------------------------------------

export function getFindingDetail(
  repo: ScanResultRepository,
  findingId: number,
): FindingDetailViewModel | null {
  const row = repo.getFindingById(findingId);
  if (!row) return null;
  const record = mapRowToPersistedRecord(row);
  return mapToDetailViewModel(record);
}

export function getFindingsForResultSet(
  repo: ScanResultRepository,
  resultSetId: string,
): FindingDetailViewModel[] {
  const rows = repo.getFindingsByResultSetId(resultSetId);
  return rows.map(r => mapToDetailViewModel(mapRowToPersistedRecord(r)));
}
