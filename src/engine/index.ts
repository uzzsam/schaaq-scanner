/**
 * DALC v4 Engine — Public API
 * Engine codename: Archimedes
 *
 * Single public export for the Data Architecture Loss Calculator engine.
 * Zero React/Next.js/DOM dependencies.
 */

// Main calculation function
export { calculateDALC } from './engine';

// Types
export type {
  ApproachConfig,
  CategoryWeights,
  CostCategory,
  CostVector,
  DALCInput,
  DALCResult,
  EvidenceCitation,
  EvidenceQuality,
  FindingCostResult,
  FindingDefinition,
  FindingId,
  FindingSeverity,
  MaturityLevel,
  MaturityLevelDescription,
  ModellingApproach,
  PropertyDefinition,
  PropertyId,
  PropertyScore,
  Sector,
  SectorConfig,
  SectorTag,
  Severity,
  WMatrix,
  YearProjection,
} from './types';

// Constants
export {
  APPROACH_CONFIGS,
  CANONICAL_ANNUAL_GROWTH_RATE,
  DEFAULT_CANONICAL_INVESTMENT,
  ENGINE_VERSION,
  ESTIMATED_VALUE_DISCLOSURES,
  EVIDENCE_CITATIONS,
  FINDINGS_ADJUSTMENT_CAP,
  NEUMANN_TERMS,
  SANITY_SINGLE_CATEGORY_MAX_REVENUE_FRACTION,
  SANITY_TOTAL_MAX_REVENUE_FRACTION,
  SECTOR_CONFIGS,
  SEVERITY_MULTIPLIERS,
  W_MATRICES,
} from './constants';

// Properties
export { getProperty, PROPERTIES } from './properties';

// Findings
export {
  FINDINGS,
  getFinding,
  getFindingsForProperty,
  getFindingsForSector,
} from './findings';
