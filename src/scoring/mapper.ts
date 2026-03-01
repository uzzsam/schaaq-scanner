/**
 * Mapper — bridges scored findings to the v4 DALC engine input.
 *
 * Converts:
 *   ScoredFindings + ScannerConfig → DALCInput
 *
 * Key mapping decisions:
 * - rawScore thresholds → engine Severity:
 *     < 0.2  → 'none'
 *     0.2–0.6 → 'some'
 *     >= 0.6  → 'pervasive'
 *
 * - Sector suffix mapping:
 *     'mining'        → '-M'
 *     'environmental' → '-E'
 *     'energy'        → '-U'
 *
 * - ModellingApproach: derived from overall severity pattern
 * - primaryCoverage: row-count-weighted coverage estimate
 * - sourceSystems: estimated from schema count + table name prefix diversity
 */

import type {
  DALCInput,
  FindingId,
  FindingSeverity,
  ModellingApproach,
  Sector,
  Severity,
} from '../engine/types';
import type { SchemaData } from '../adapters/types';
import type { ScannerConfig } from '../checks/types';
import type { ScoredFindings } from './severity-scorer';

// =============================================================================
// Constants
// =============================================================================

/** Sector → engine finding suffix */
const SECTOR_SUFFIX_MAP: Record<Sector, string> = {
  mining: '-M',
  environmental: '-E',
  energy: '-U',
};

/** All 7 property IDs that need findings */
const PROPERTY_IDS = [1, 2, 3, 4, 5, 6, 7] as const;

// =============================================================================
// Threshold → Severity mapping
// =============================================================================

function rawScoreToSeverity(rawScore: number): Severity {
  if (rawScore >= 0.6) return 'pervasive';
  if (rawScore >= 0.2) return 'some';
  return 'none';
}

// =============================================================================
// Modelling approach derivation
// =============================================================================

/**
 * Derive modellingApproach from the overall severity pattern.
 * Higher severity → less mature modelling approach.
 */
function deriveModellingApproach(propertyScores: Map<number, number>): ModellingApproach {
  // Calculate average property score
  let sum = 0;
  let count = 0;
  for (const score of propertyScores.values()) {
    sum += score;
    count++;
  }
  const avgScore = count > 0 ? sum / count : 0;

  // Map average score to modelling approach
  // High score = more problems = less mature approach
  if (avgScore >= 0.8) return 'ad-hoc';
  if (avgScore >= 0.65) return 'one-big-table';
  if (avgScore >= 0.5) return 'mixed-adhoc';
  if (avgScore >= 0.4) return 'mixed-kimball';
  if (avgScore >= 0.3) return 'kimball';
  if (avgScore >= 0.2) return 'data-vault';
  if (avgScore >= 0.1) return 'event-driven';
  return 'canonical';
}

// =============================================================================
// Source systems estimation
// =============================================================================

/**
 * Estimate number of source systems from schema count and table name prefix diversity.
 * Mining/environmental clients typically have 5–30 source systems.
 */
function estimateSourceSystems(schema: SchemaData): number {
  // Heuristic 1: distinct schema count
  const schemaCount = new Set(schema.tables.map((t) => t.schema)).size;

  // Heuristic 2: table name prefix diversity (first segment before underscore)
  const prefixes = new Set<string>();
  for (const t of schema.tables) {
    const parts = t.name.split('_');
    if (parts.length >= 2 && parts[0].length >= 2) {
      prefixes.add(parts[0].toLowerCase());
    }
  }
  const prefixCount = prefixes.size;

  // Take the larger of the two estimates, with floor of 1 and cap at 50
  return Math.min(50, Math.max(1, Math.max(schemaCount, Math.ceil(prefixCount / 2))));
}

// =============================================================================
// Primary coverage estimation
// =============================================================================

/**
 * Estimate primaryCoverage based on P5 governance score.
 * Well-governed schemas → higher coverage, poor governance → lower coverage.
 */
function estimatePrimaryCoverage(propertyScores: Map<number, number>): number {
  const p5Score = propertyScores.get(5) ?? 0;
  // Invert: low P5 score = good governance = high coverage
  // High P5 score = poor governance = low coverage
  const coverage = 1.0 - (p5Score * 0.6);  // Range: 0.4–1.0
  return Math.round(coverage * 100) / 100;  // Round to 2 dp
}

// =============================================================================
// Public API
// =============================================================================

export interface MapperOptions {
  /** Override the derived modelling approach */
  modellingApproach?: ModellingApproach;
  /** Override the estimated source systems count */
  sourceSystems?: number;
  /** Override the estimated primary coverage */
  primaryCoverage?: number;
}

/**
 * Map scored findings to a valid v4 DALCInput for the engine.
 */
export function mapToEngineInput(
  scored: ScoredFindings,
  schema: SchemaData,
  config: ScannerConfig,
  options: MapperOptions = {},
): DALCInput {
  const sector = config.organisation.sector as Sector;
  const suffix = SECTOR_SUFFIX_MAP[sector];

  if (!suffix) {
    throw new Error(`Unknown sector "${sector}". Expected: mining, environmental, or energy.`);
  }

  // Build FindingSeverity[] — one per property × sector
  const findings: FindingSeverity[] = PROPERTY_IDS.map((propNum) => {
    const rawScore = scored.propertyScores.get(propNum) ?? 0;
    const severity = rawScoreToSeverity(rawScore);
    const id = `P${propNum}${suffix}` as FindingId;
    return { id, severity };
  });

  // Derive modelling approach from severity pattern
  const modellingApproach =
    options.modellingApproach ?? deriveModellingApproach(scored.propertyScores);

  // Estimate source systems
  const sourceSystems =
    options.sourceSystems ?? estimateSourceSystems(schema);

  // Estimate primary coverage
  const primaryCoverage =
    options.primaryCoverage ?? estimatePrimaryCoverage(scored.propertyScores);

  return {
    sector,
    revenueAUD: config.organisation.revenueAUD,
    totalFTE: config.organisation.totalFTE,
    avgFTESalaryAUD: config.organisation.avgFTESalaryAUD,
    dataEngineers: config.organisation.dataEngineers,
    avgEngineerSalaryAUD: config.organisation.avgSalaryAUD,
    sourceSystems,
    modellingApproach,
    primaryCoverage,
    csrdInScope: config.organisation.csrdInScope,
    canonicalInvestmentAUD: config.organisation.canonicalInvestmentAUD,
    findings,
  };
}
