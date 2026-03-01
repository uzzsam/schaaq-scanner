import type { SchemaData } from '../adapters/types';

// =============================================================================
// Cost categories matching the engine's 5-category model
// =============================================================================
export type CostCategory =
  | 'firefighting'
  | 'dataQuality'
  | 'integration'
  | 'productivity'
  | 'regulatory';

// =============================================================================
// Evidence — concrete proof for a finding
// =============================================================================
export interface Evidence {
  schema: string;
  table: string;
  column?: string;
  detail: string;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Finding — a specific problem detected by a check
// =============================================================================
export interface Finding {
  checkId: string;
  property: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  severity: 'critical' | 'major' | 'minor' | 'info';
  rawScore: number;                 // 0.0–1.0 — set by severity scorer
  title: string;
  description: string;
  evidence: Evidence[];
  affectedObjects: number;
  totalObjects: number;
  ratio: number;                    // affectedObjects / totalObjects
  remediation: string;
  costCategories: CostCategory[];
  costWeights: Record<CostCategory, number>;
}

// =============================================================================
// ScannerConfig — from config.yml, drives check thresholds
// =============================================================================
export interface SynonymGroup {
  canonical: string;
  variants: string[];
}

export interface ScannerConfig {
  organisation: {
    name: string;
    sector: string;
    revenueAUD: number;
    totalFTE: number;
    dataEngineers: number;
    avgSalaryAUD: number;
    avgFTESalaryAUD: number;
    aiBudgetAUD?: number;
    csrdInScope: boolean;
    canonicalInvestmentAUD?: number;
  };

  thresholds: {
    entitySimilarityThreshold?: number;     // Default 0.7
    synonymGroups?: SynonymGroup[];
    unitVariantThreshold?: number;          // Default 2
    sharedEntityThreshold?: number;         // Default 2
    csvIndicatorPatterns?: string[];
    namingConvention?: 'snake_case' | 'camelCase' | 'PascalCase' | 'any';
    nullRateThreshold?: number;             // Default 0.3
    orphanedTableThreshold?: number;        // Default 0
    auditColumnPatterns?: string[];
    timestampColumnPatterns?: string[];
  };
}

// =============================================================================
// ScannerCheck — pure function interface
// =============================================================================
export interface ScannerCheck {
  id: string;
  property: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  name: string;
  description: string;
  execute(schema: SchemaData, config: ScannerConfig): Finding[];
}
