/**
 * Criticality Module — Public API
 */

export { assessCriticality, lookupAssetCriticality, getCriticalityForFinding } from './criticality-service';
export type { CriticalityAssessmentInput } from './criticality-service';

export { computeCriticalityScore, scoreTable, scoreAllTables } from './scoring';
export { extractTableMetadata, collectSignals } from './signals';
export { identifyCdeCandidates } from './cde';

export type {
  CriticalityTier,
  CriticalitySignal,
  CriticalitySignalType,
  CdeCandidate,
  CdeReasonType,
  AssetCriticalityRecord,
  CriticalityAssessmentSummary,
} from './types';

export {
  CRITICALITY_TIER_ORDER,
  CRITICALITY_TIER_LABELS,
  CRITICALITY_TIER_COLORS,
  CRITICALITY_TIER_THRESHOLDS,
  CRITICALITY_PRIORITY_MULTIPLIER,
  scoreToCriticalityTier,
} from './types';
