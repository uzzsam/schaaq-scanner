/**
 * Criticality Scoring — Weighted formula: signals → score → tier
 *
 * Deterministic, explainable scoring. Each asset's criticality score
 * is a weighted sum of normalised signals, mapped to a tier.
 */

import type { CriticalitySignal, CriticalityTier, AssetCriticalityRecord } from './types';
import { scoreToCriticalityTier } from './types';
import type { TableMetadata } from './signals';
import { collectSignals } from './signals';
import { identifyCdeCandidates } from './cde';

/**
 * Compute a criticality score from a set of signals.
 *
 * 1. Filter out signals with zero weight
 * 2. Normalise weights so they sum to 1.0
 * 3. Weighted sum of signal values (clamped to 0–1)
 * 4. Scale to 0–100
 */
export function computeCriticalityScore(signals: CriticalitySignal[]): number {
  const active = signals.filter(s => s.weight !== 0);
  if (active.length === 0) return 0;

  // Total absolute weight for normalisation
  const totalAbsWeight = active.reduce((sum, s) => sum + Math.abs(s.weight), 0);
  if (totalAbsWeight === 0) return 0;

  let score = 0;
  for (const s of active) {
    const normWeight = s.weight / totalAbsWeight;
    // Clamp value to [-1, 1] (negative signals like enum-lookup can reduce score)
    const clampedValue = Math.max(-1, Math.min(1, s.value));
    score += normWeight * clampedValue;
  }

  // Scale to 0–100, clamp
  return Math.round(Math.max(0, Math.min(100, score * 100)));
}

/**
 * Derive confidence level from signal coverage.
 * More active (non-zero-value) signals = higher confidence.
 */
function deriveConfidence(signals: CriticalitySignal[]): 'high' | 'medium' | 'low' {
  const activeCount = signals.filter(s => s.value !== 0).length;
  if (activeCount >= 5) return 'high';
  if (activeCount >= 3) return 'medium';
  return 'low';
}

/**
 * Build a human-readable rationale from the top contributing signals.
 */
function buildRationale(signals: CriticalitySignal[], tier: CriticalityTier): string {
  const contributing = signals
    .filter(s => s.value > 0)
    .sort((a, b) => (b.value * b.weight) - (a.value * a.weight))
    .slice(0, 3);

  if (contributing.length === 0) {
    return `Classified as ${tier}: no significant criticality signals detected.`;
  }

  const factors = contributing.map(s => s.signalLabel.toLowerCase()).join(', ');
  return `Classified as ${tier} based on: ${factors}.`;
}

/**
 * Score a single table and produce an AssetCriticalityRecord.
 */
export function scoreTable(
  meta: TableMetadata,
  allMeta: TableMetadata[],
  sourceSystem: string,
): AssetCriticalityRecord {
  const signals = collectSignals(meta, allMeta);
  const criticalityScore = computeCriticalityScore(signals);
  const criticalityTier = scoreToCriticalityTier(criticalityScore);
  const confidence = deriveConfidence(signals);
  const rationale = buildRationale(signals, criticalityTier);

  // Identify CDE candidates for this table
  const cdeCandidates = identifyCdeCandidates(meta);

  return {
    assetKey: meta.tableKey,
    assetName: meta.tableName,
    assetType: 'table',
    sourceSystem,
    criticalityScore,
    criticalityTier,
    cdeCandidate: cdeCandidates.length > 0,
    cdeCandidates,
    signals,
    rationale,
    confidenceLevel: confidence,
  };
}

/**
 * Score all tables and produce AssetCriticalityRecord[].
 */
export function scoreAllTables(
  allMeta: TableMetadata[],
  sourceSystem: string,
): AssetCriticalityRecord[] {
  return allMeta.map(meta => scoreTable(meta, allMeta, sourceSystem));
}
