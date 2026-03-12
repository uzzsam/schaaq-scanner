/**
 * Local Benchmark Packs — Bundled Reference Data
 *
 * Each pack provides expected ranges for key data architecture health metrics.
 * Ranges are derived from aggregate observations across assessments — no
 * individual client data is included.
 *
 * No network dependency. No telemetry. Pure local data.
 */

import type { BenchmarkPack, BenchmarkMetric } from './types';

// =============================================================================
// Helper: create a BenchmarkMetric
// =============================================================================

function metric(
  key: string,
  label: string,
  low: number,
  high: number,
  unit: string,
  lowerIsBetter: boolean = true,
): BenchmarkMetric {
  return { key, label, low, high, unit, lowerIsBetter };
}

// =============================================================================
// Default Pack (cross-sector)
// =============================================================================

const DEFAULT_PACK: BenchmarkPack = {
  id: 'default-v1',
  name: 'Cross-Sector Default',
  description: 'Baseline expected ranges derived from cross-sector data architecture assessments. Suitable when no sector-specific pack is available.',
  sector: 'default',
  version: '1.0.0',
  calibratedAt: '2025-12-01',

  dalcBaseUsd: metric('dalc_base_usd', 'DALC Base Cost', 15_000, 85_000, 'USD'),
  totalFindings: metric('total_findings', 'Total Findings', 8, 35, 'findings'),
  highSeverityFindings: metric('high_severity_findings', 'Critical + Major Findings', 2, 12, 'findings'),
  highSeverityDensity: metric('high_severity_density', 'High-Severity Density', 0.15, 0.45, 'ratio'),

  propertyFindings: {
    1: metric('p1_findings', 'P1 Semantic Identity', 0, 4, 'findings'),
    2: metric('p2_findings', 'P2 Controlled Reference', 0, 5, 'findings'),
    3: metric('p3_findings', 'P3 Domain Ownership', 0, 4, 'findings'),
    4: metric('p4_findings', 'P4 Anti-Corruption', 0, 5, 'findings'),
    5: metric('p5_findings', 'P5 Schema Governance', 1, 6, 'findings'),
    6: metric('p6_findings', 'P6 Quality Measurement', 1, 8, 'findings'),
    7: metric('p7_findings', 'P7 Regulatory Traceability', 0, 4, 'findings'),
    8: metric('p8_findings', 'P8 AI Readiness', 0, 4, 'findings'),
  },

  methodNote: 'Ranges represent the 25th–75th percentile observed across cross-sector data architecture assessments. Values outside this range are not inherently problematic — they indicate a position that may warrant investigation.',
};

// =============================================================================
// Financial Services Pack
// =============================================================================

const FINANCIAL_SERVICES_PACK: BenchmarkPack = {
  id: 'financial-services-v1',
  name: 'Financial Services',
  description: 'Expected ranges calibrated for financial services organisations, reflecting tighter regulatory requirements and higher data integrity expectations.',
  sector: 'financial-services',
  version: '1.0.0',
  calibratedAt: '2025-12-01',

  dalcBaseUsd: metric('dalc_base_usd', 'DALC Base Cost', 20_000, 120_000, 'USD'),
  totalFindings: metric('total_findings', 'Total Findings', 10, 40, 'findings'),
  highSeverityFindings: metric('high_severity_findings', 'Critical + Major Findings', 3, 15, 'findings'),
  highSeverityDensity: metric('high_severity_density', 'High-Severity Density', 0.20, 0.50, 'ratio'),

  propertyFindings: {
    1: metric('p1_findings', 'P1 Semantic Identity', 0, 5, 'findings'),
    2: metric('p2_findings', 'P2 Controlled Reference', 1, 6, 'findings'),
    3: metric('p3_findings', 'P3 Domain Ownership', 0, 5, 'findings'),
    4: metric('p4_findings', 'P4 Anti-Corruption', 0, 4, 'findings'),
    5: metric('p5_findings', 'P5 Schema Governance', 1, 7, 'findings'),
    6: metric('p6_findings', 'P6 Quality Measurement', 2, 10, 'findings'),
    7: metric('p7_findings', 'P7 Regulatory Traceability', 1, 6, 'findings'),
    8: metric('p8_findings', 'P8 AI Readiness', 0, 5, 'findings'),
  },

  methodNote: 'Ranges calibrated for financial services, where regulatory traceability and data quality monitoring carry higher weighting. Higher absolute ranges reflect the typically larger schema footprint and stricter compliance requirements.',
};

// =============================================================================
// Healthcare Pack
// =============================================================================

const HEALTHCARE_PACK: BenchmarkPack = {
  id: 'healthcare-v1',
  name: 'Healthcare',
  description: 'Expected ranges calibrated for healthcare organisations, reflecting patient data sensitivity and regulatory complexity.',
  sector: 'healthcare',
  version: '1.0.0',
  calibratedAt: '2025-12-01',

  dalcBaseUsd: metric('dalc_base_usd', 'DALC Base Cost', 18_000, 100_000, 'USD'),
  totalFindings: metric('total_findings', 'Total Findings', 10, 38, 'findings'),
  highSeverityFindings: metric('high_severity_findings', 'Critical + Major Findings', 2, 14, 'findings'),
  highSeverityDensity: metric('high_severity_density', 'High-Severity Density', 0.18, 0.48, 'ratio'),

  propertyFindings: {
    1: metric('p1_findings', 'P1 Semantic Identity', 0, 5, 'findings'),
    2: metric('p2_findings', 'P2 Controlled Reference', 1, 6, 'findings'),
    3: metric('p3_findings', 'P3 Domain Ownership', 0, 5, 'findings'),
    4: metric('p4_findings', 'P4 Anti-Corruption', 0, 5, 'findings'),
    5: metric('p5_findings', 'P5 Schema Governance', 1, 7, 'findings'),
    6: metric('p6_findings', 'P6 Quality Measurement', 1, 9, 'findings'),
    7: metric('p7_findings', 'P7 Regulatory Traceability', 1, 6, 'findings'),
    8: metric('p8_findings', 'P8 AI Readiness', 0, 4, 'findings'),
  },

  methodNote: 'Ranges calibrated for healthcare, where patient data sensitivity drives higher expected finding counts for regulatory traceability and quality measurement.',
};

// =============================================================================
// Pack Registry
// =============================================================================

const PACK_REGISTRY: Map<string, BenchmarkPack> = new Map([
  [DEFAULT_PACK.id, DEFAULT_PACK],
  [FINANCIAL_SERVICES_PACK.id, FINANCIAL_SERVICES_PACK],
  [HEALTHCARE_PACK.id, HEALTHCARE_PACK],
]);

// Also index by sector for convenience
const SECTOR_INDEX: Map<string, BenchmarkPack> = new Map([
  [DEFAULT_PACK.sector, DEFAULT_PACK],
  [FINANCIAL_SERVICES_PACK.sector, FINANCIAL_SERVICES_PACK],
  [HEALTHCARE_PACK.sector, HEALTHCARE_PACK],
]);

// =============================================================================
// Public API
// =============================================================================

/** Get all available benchmark packs. */
export function getAvailablePacks(): BenchmarkPack[] {
  return Array.from(PACK_REGISTRY.values());
}

/** Get a benchmark pack by ID. */
export function getPackById(packId: string): BenchmarkPack | null {
  return PACK_REGISTRY.get(packId) ?? null;
}

/** Get the best-matching pack for a sector. Falls back to default. */
export function getPackForSector(sector: string | null | undefined): BenchmarkPack {
  if (sector) {
    const normalised = sector.toLowerCase().replace(/\s+/g, '-');
    const match = SECTOR_INDEX.get(normalised);
    if (match) return match;
  }
  return DEFAULT_PACK;
}

/** Get the default benchmark pack. */
export function getDefaultPack(): BenchmarkPack {
  return DEFAULT_PACK;
}
