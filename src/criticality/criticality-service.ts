/**
 * Criticality Service — Public API
 *
 * Orchestrates signal extraction → scoring → CDE identification → summary.
 * Deterministic: same inputs always produce same outputs.
 */

import type { ResultFindingRow } from '../server/db/scan-result-types';
import type {
  AssetCriticalityRecord,
  CriticalityAssessmentSummary,
  CriticalityTier,
  CdeCandidate,
} from './types';
import { CRITICALITY_TIER_ORDER } from './types';
import { extractTableMetadata } from './signals';
import { scoreAllTables } from './scoring';

// =============================================================================
// Public API
// =============================================================================

export interface CriticalityAssessmentInput {
  resultSetId: string;
  findings: ResultFindingRow[];
  sourceSystem: string;
}

/**
 * Run a full criticality assessment over a set of findings.
 *
 * Pipeline:
 *   1. Extract table metadata from findings
 *   2. Score each table (signals → score → tier)
 *   3. Identify CDE candidates per table
 *   4. Aggregate into summary
 */
export function assessCriticality(input: CriticalityAssessmentInput): CriticalityAssessmentSummary {
  const { resultSetId, findings, sourceSystem } = input;

  // 1. Extract table metadata from findings
  const tableMeta = extractTableMetadata(findings, sourceSystem);

  // 2-3. Score all tables (includes CDE identification)
  const allAssets = scoreAllTables(tableMeta, sourceSystem);

  // 4. Aggregate
  const tierDistribution: Record<CriticalityTier, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  let totalScore = 0;
  const allCdeCandidates: CdeCandidate[] = [];

  for (const asset of allAssets) {
    tierDistribution[asset.criticalityTier]++;
    totalScore += asset.criticalityScore;
    allCdeCandidates.push(...asset.cdeCandidates);
  }

  // Top critical assets: sorted by score desc, max 10
  const topCriticalAssets = [...allAssets]
    .sort((a, b) => {
      const tierDiff = CRITICALITY_TIER_ORDER[b.criticalityTier] - CRITICALITY_TIER_ORDER[a.criticalityTier];
      if (tierDiff !== 0) return tierDiff;
      return b.criticalityScore - a.criticalityScore;
    })
    .slice(0, 10);

  const averageCriticalityScore = allAssets.length > 0
    ? Math.round(totalScore / allAssets.length)
    : 0;

  return {
    resultSetId,
    assessedAt: new Date().toISOString(),
    totalAssetsAssessed: allAssets.length,
    tierDistribution,
    totalCdeCandidates: allCdeCandidates.length,
    topCriticalAssets,
    allAssets,
    allCdeCandidates,
    averageCriticalityScore,
    methodDescription:
      'Deterministic criticality assessment using weighted signal scoring. ' +
      'Signals derived from schema naming patterns, structural characteristics, ' +
      'PII/financial column detection, finding severity load, and relationship centrality. ' +
      'CDE candidates identified via column-level naming pattern matching.',
  };
}

/**
 * Look up the criticality record for a specific asset key.
 * Returns undefined if no record exists (asset not in assessment).
 */
export function lookupAssetCriticality(
  summary: CriticalityAssessmentSummary,
  assetKey: string,
): AssetCriticalityRecord | undefined {
  // Direct match
  const direct = summary.allAssets.find(a => a.assetKey === assetKey);
  if (direct) return direct;

  // Column-level: look up parent table
  const parts = assetKey.split('.');
  if (parts.length >= 3) {
    const tableKey = `${parts[0]}.${parts[1]}`;
    return summary.allAssets.find(a => a.assetKey === tableKey);
  }

  return undefined;
}

/**
 * Get the criticality tier for a finding's asset.
 * Falls back to 'medium' if the asset is not in the assessment.
 */
export function getCriticalityForFinding(
  summary: CriticalityAssessmentSummary,
  assetKey: string | null,
): CriticalityTier {
  if (!assetKey) return 'medium';
  const record = lookupAssetCriticality(summary, assetKey);
  return record?.criticalityTier ?? 'medium';
}
