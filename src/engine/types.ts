/**
 * DALC v4 Engine — Type Definitions
 * Engine codename: Archimedes
 *
 * All interfaces for the Data Architecture Loss Calculator.
 * Zero React/Next.js/DOM dependencies.
 */

// ---------------------------------------------------------------------------
// Enums & Literals
// ---------------------------------------------------------------------------

export type Sector = 'mining' | 'environmental' | 'energy';

export type SectorTag = 'M&R' | 'E&S' | 'E&U';

export type ModellingApproach =
  | 'ad-hoc'
  | 'one-big-table'
  | 'mixed-adhoc'
  | 'mixed-kimball'
  | 'kimball'
  | 'data-vault'
  | 'event-driven'
  | 'canonical';

export type Severity = 'none' | 'some' | 'pervasive';

export type CostCategory =
  | 'firefighting'
  | 'dataQuality'
  | 'integration'
  | 'productivity'
  | 'regulatory';

export type PropertyId =
  | 'semanticIdentity'
  | 'controlledReference'
  | 'domainOwnership'
  | 'antiCorruption'
  | 'schemaGovernance'
  | 'continuousQuality'
  | 'regulatoryTraceability';

export type FindingId =
  | 'P1-M' | 'P1-E' | 'P1-U'
  | 'P2-M' | 'P2-E' | 'P2-U'
  | 'P3-M' | 'P3-E' | 'P3-U'
  | 'P4-M' | 'P4-E' | 'P4-U'
  | 'P5-M' | 'P5-E' | 'P5-U'
  | 'P6-M' | 'P6-E' | 'P6-U'
  | 'P7-M' | 'P7-E' | 'P7-U';

export type EvidenceQuality = 'Strong' | 'Moderate' | 'Estimated';

export type MaturityLevel = 0 | 1 | 2 | 3 | 4;

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface FindingSeverity {
  id: FindingId;
  severity: Severity;
}

export interface DALCInput {
  sector: Sector;
  revenueAUD: number;
  totalFTE: number;
  avgFTESalaryAUD: number;
  dataEngineers: number;
  avgEngineerSalaryAUD: number;
  sourceSystems: number;
  modellingApproach: ModellingApproach;
  primaryCoverage?: number; // overrides default from approach
  csrdInScope: boolean;
  canonicalInvestmentAUD?: number; // default $1,800,000
  findings: FindingSeverity[];
}

// ---------------------------------------------------------------------------
// Sector Configuration
// ---------------------------------------------------------------------------

export interface SectorConfig {
  sector: Sector;
  tag: SectorTag;
  qualityFraction: number;
  qualitySectorWeight: number;
  integrationBaseCost: number;
  integrationFailureProbability: number;
  productivitySectorWeight: number;
  regPenaltyCap: number;
  regRevenueFraction: number;
  regProbabilityBase: number;
  canonicalSavingFraction: number;
  systemGrowthRate: number;
  regTighteningRate: number;
  techDebtRate: number;
  enforcementMultiplier: number;
}

// ---------------------------------------------------------------------------
// Maturity / Approach Lookup
// ---------------------------------------------------------------------------

export interface ApproachConfig {
  label: string;
  mBase: number;
  defaultCoverage: number;
  firefightingRate: number;
}

// ---------------------------------------------------------------------------
// W Matrix
// ---------------------------------------------------------------------------

/** 5x5 matrix — indices: 0=Firefighting, 1=Quality, 2=Integration, 3=Productivity, 4=Regulatory */
export type WMatrix = [
  [number, number, number, number, number],
  [number, number, number, number, number],
  [number, number, number, number, number],
  [number, number, number, number, number],
  [number, number, number, number, number],
];

// ---------------------------------------------------------------------------
// Finding Definition
// ---------------------------------------------------------------------------

export interface CategoryWeights {
  firefighting: number;
  dataQuality: number;
  integration: number;
  productivity: number;
  regulatory: number;
}

export interface FindingDefinition {
  id: FindingId;
  propertyId: PropertyId;
  sector: Sector;
  title: string;
  description: string;
  example: string;
  damaDmbok: string;
  sectorStandard: string;
  categoryWeights: CategoryWeights;
  costFunction: (input: DALCInput) => number;
  remediation: string;
  scannerCheck: string;
}

// ---------------------------------------------------------------------------
// Property Definition
// ---------------------------------------------------------------------------

export interface MaturityLevelDescription {
  level: MaturityLevel;
  label: string;
  description: string;
}

export interface PropertyDefinition {
  id: PropertyId;
  name: string;
  definition: string;
  damaDmbok: string;
  sectorStandards: Record<Sector, string>;
  maturitySpectrum: MaturityLevelDescription[];
}

// ---------------------------------------------------------------------------
// Engine Output
// ---------------------------------------------------------------------------

export interface CostVector {
  firefighting: number;
  dataQuality: number;
  integration: number;
  productivity: number;
  regulatory: number;
}

export interface FindingCostResult {
  id: FindingId;
  severity: Severity;
  totalCost: number;
  categoryCosts: CostVector;
}

export interface PropertyScore {
  propertyId: PropertyId;
  name: string;
  score: number; // 0-4 scale
  maturityLabel: string;
  totalCost: number;
  findingCosts: FindingCostResult[];
}

export interface YearProjection {
  year: number;
  doNothingCost: number;
  withCanonicalCost: number;
  cumulativeSaving: number;
}

export interface DALCResult {
  // Engine metadata
  engineVersion: string;

  // Layer 1: Shannon Entropy
  baseMaturity: number;
  disorderScore: number;
  adjustedMaturity: number;
  shannonEntropy: number;
  maxEntropy: number;

  // Layer 1b: Base Costs
  baseCosts: CostVector;
  baseTotal: number;

  // Layer 1c: Findings Adjustment
  findingsAdjustment: CostVector;
  adjustedCosts: CostVector;
  adjustedTotal: number;

  // Layer 2: Leontief Amplification
  amplifiedCosts: CostVector;
  amplifiedTotal: number;
  amplificationRatio: number;
  spectralRadius: number;

  // Sanity bounds
  sanityCapped: boolean;
  finalCosts: CostVector;
  finalTotal: number;

  // Property Scores
  propertyScores: PropertyScore[];
  overallMaturity: number;

  // Canonical Comparison
  canonicalInvestment: number;
  withCanonicalTotal: number;
  annualSaving: number;
  paybackMonths: number;

  // 5-Year Projection
  fiveYearProjection: YearProjection[];
  fiveYearCumulativeSaving: number;

  // Per-finding detail
  findingResults: FindingCostResult[];

  // Input echo
  input: DALCInput;
  sectorConfig: SectorConfig;
}

// ---------------------------------------------------------------------------
// Evidence Citation
// ---------------------------------------------------------------------------

export interface EvidenceCitation {
  claim: string;
  source: string;
  quality: EvidenceQuality;
}
