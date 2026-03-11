/**
 * DALC v4 Engine — Constants
 * Engine codename: Archimedes
 *
 * Maturity scores, firefighting rates, sector configurations,
 * W matrices, and evidence citations from Blueprint sections 5, 6, and 12.
 */

import type {
  ApproachConfig,
  EvidenceCitation,
  ModellingApproach,
  SectorConfig,
  Severity,
  WMatrix,
} from './types';

// ---------------------------------------------------------------------------
// Engine Version
// ---------------------------------------------------------------------------

export const ENGINE_VERSION = 'v4.0.0';

// ---------------------------------------------------------------------------
// Default Canonical Investment (AUD)
// ---------------------------------------------------------------------------

export const DEFAULT_CANONICAL_INVESTMENT = 1_800_000;

// ---------------------------------------------------------------------------
// Modelling Approach Configs — Blueprint §4 Layer 1
// ---------------------------------------------------------------------------

export const APPROACH_CONFIGS: Record<ModellingApproach, ApproachConfig> = {
  'ad-hoc': {
    label: 'Ad-hoc / tables as needed',
    mBase: 0.10,
    defaultCoverage: 0.15,
    firefightingRate: 0.38,
  },
  'one-big-table': {
    label: 'One Big Table',
    mBase: 0.15,
    defaultCoverage: 0.25,
    firefightingRate: 0.35,
  },
  'mixed-adhoc': {
    label: 'Mixed (ad-hoc dominant)',
    mBase: 0.25,
    defaultCoverage: 0.30,
    firefightingRate: 0.32,
  },
  'mixed-kimball': {
    label: 'Mixed (Kimball dominant)',
    mBase: 0.30,
    defaultCoverage: 0.55,
    firefightingRate: 0.29,
  },
  'kimball': {
    label: 'Kimball-style dimensional',
    mBase: 0.45,
    defaultCoverage: 0.65,
    firefightingRate: 0.26,
  },
  'data-vault': {
    label: 'Data Vault',
    mBase: 0.50,
    defaultCoverage: 0.70,
    firefightingRate: 0.24,
  },
  'event-driven': {
    label: 'Event-driven',
    mBase: 0.55,
    defaultCoverage: 0.75,
    firefightingRate: 0.22,
  },
  'canonical': {
    label: 'Canonical / semantic',
    mBase: 0.85,
    defaultCoverage: 0.90,
    firefightingRate: 0.19,
  },
};

// Canonical baseline firefighting rate (reference)
export const CANONICAL_FIREFIGHTING_RATE = 0.19;

// ---------------------------------------------------------------------------
// Sector Configurations — Blueprint §5
// ---------------------------------------------------------------------------

export const SECTOR_CONFIGS: Record<string, SectorConfig> = {
  mining: {
    sector: 'mining',
    tag: 'M&R',
    qualityFraction: 0.015,
    qualitySectorWeight: 0.65,
    integrationBaseCost: 2_500_000,
    integrationFailureProbability: 0.12,
    productivitySectorWeight: 0.18,
    regPenaltyCap: 55_000_000,
    regRevenueFraction: 0.02,
    regProbabilityBase: 0.08,
    canonicalSavingFraction: 0.42,
    systemGrowthRate: 0.08,
    regTighteningRate: 0.12,
    techDebtRate: 0.06,
    enforcementMultiplier: 3.5,
    // C6: Early AI adoption (autonomous haulage, predictive maintenance). Rio Tinto/BHP use cases.
    aiMlBaseAllocationFraction: 0.008,
    // Below-average AI adoption density in typical mid-market mining firms
    aiMlWMatrixMultiplier: 0.85,
  },
  environmental: {
    sector: 'environmental',
    tag: 'E&S',
    qualityFraction: 0.015,
    qualitySectorWeight: 0.70,
    integrationBaseCost: 1_800_000,
    integrationFailureProbability: 0.10,
    productivitySectorWeight: 0.22,
    regPenaltyCap: 60_000_000,
    regRevenueFraction: 0.05,
    regProbabilityBase: 0.10,
    canonicalSavingFraction: 0.38,
    systemGrowthRate: 0.12,
    regTighteningRate: 0.18,
    techDebtRate: 0.08,
    enforcementMultiplier: 5.0,
    // C6: AI in emissions modelling, compliance prediction. ESG regulatory risk.
    aiMlBaseAllocationFraction: 0.007,
    // Baseline
    aiMlWMatrixMultiplier: 1.00,
  },
  energy: {
    sector: 'energy',
    tag: 'E&U',
    qualityFraction: 0.015,
    qualitySectorWeight: 0.60,
    integrationBaseCost: 3_000_000,
    integrationFailureProbability: 0.15,
    productivitySectorWeight: 0.16,
    regPenaltyCap: 20_000_000,
    regRevenueFraction: 0.01,
    regProbabilityBase: 0.06,
    canonicalSavingFraction: 0.35,
    systemGrowthRate: 0.15,
    regTighteningRate: 0.10,
    techDebtRate: 0.10,
    enforcementMultiplier: 2.5,
    // C6: Grid optimisation, trading algorithms. Critical infrastructure exposure.
    aiMlBaseAllocationFraction: 0.012,
    // Above-average AI dependency, critical infrastructure
    aiMlWMatrixMultiplier: 1.15,
  },
};

// ---------------------------------------------------------------------------
// W Matrices — Blueprint §6
// Indices: 0=Firefighting, 1=Quality, 2=Integration, 3=Productivity, 4=Regulatory, 5=AI/ML Risk
// W[i][j] = how much cost in category j amplifies cost in category i
// ---------------------------------------------------------------------------
//
// C6 (AI/ML Risk Exposure) Dependencies — Evidence sources:
// --- How other categories feed INTO AI/ML Risk (column 5) ---
// C1 (Rework) → C6:       0.08 — Poor instrumentation increases AI incident MTTR. EU AI Act Art 12 record-keeping.
// C2 (Data Quality) → C6: 0.22 — STRONGEST dependency. 80% of AI failures are data failures (RAND RRA2680-1). EU AI Act Art 10.
// C3 (Integration) → C6:  0.15 — Pipeline fragility corrupts model inputs. Google SRE data pipeline literature.
// C4 (Productivity) → C6: 0.03 — Indirect: less bandwidth for AI governance.
// C5 (Regulatory) → C6:   0.10 — Compliance gaps amplify AI regulatory risk. EU AI Act Art 99.
//
// --- How AI/ML Risk feeds INTO other categories (row 5) ---
// C6 → C1 (Rework):       0.13 — AI failures force pipeline rebuilds. FTC Rite Aid remedy: banned from AI, forced process rebuild.
// C6 → C2 (Data Quality): 0.12 — AI failures expose hidden quality issues, triggering remediation cycles.
// C6 → C3 (Integration):  0.08 — Failed AI projects require integration rearchitecture.
// C6 → C4 (Productivity): 0.10 — Failed AI projects consume scarce technical talent bandwidth.
// C6 → C5 (Regulatory):   0.20 — Direct statutory link. EU AI Act Art 99. Meta $1.4B Texas settlement. Clearview €30.5M Dutch DPA fine.
// C6 → C6 (self):         0.00 — Diagonal stays zero.
//
// Sector multipliers applied to C6 weights:
// mining: 0.85 — Below-average AI adoption density
// environmental: 1.00 — Baseline
// energy: 1.15 — Above-average AI dependency, critical infrastructure

export const W_MATRICES: Record<string, WMatrix> = {
  mining: [
    //  C1     C2     C3     C4     C5     C6
    [0,     0.045, 0.135, 0,     0.045, 0.13 * 0.85 ], // C1: +C6→C1 (AI failures force pipeline rebuilds)
    [0,     0,     0.180, 0.135, 0,     0.12 * 0.85 ], // C2: +C6→C2 (AI failures expose quality issues)
    [0.090, 0,     0,     0,     0,     0.08 * 0.85 ], // C3: +C6→C3 (failed AI requires integration rearch)
    [0,     0.180, 0.090, 0,     0,     0.10 * 0.85 ], // C4: +C6→C4 (failed AI consumes talent bandwidth)
    [0,     0.225, 0.045, 0,     0,     0.20 * 0.85 ], // C5: +C6→C5 (EU AI Act Art 99, Meta $1.4B)
    [0.08 * 0.85, 0.22 * 0.85, 0.15 * 0.85, 0.03 * 0.85, 0.10 * 0.85, 0], // C6: all deps × mining multiplier
  ],
  environmental: [
    //  C1     C2     C3     C4     C5     C6
    [0,     0.060, 0.080, 0,     0.140, 0.13 * 1.00 ], // C1
    [0,     0,     0.100, 0.180, 0,     0.12 * 1.00 ], // C2
    [0.070, 0,     0,     0,     0,     0.08 * 1.00 ], // C3
    [0,     0.220, 0.060, 0,     0,     0.10 * 1.00 ], // C4
    [0,     0.350, 0.080, 0,     0,     0.20 * 1.00 ], // C5
    [0.08 * 1.00, 0.22 * 1.00, 0.15 * 1.00, 0.03 * 1.00, 0.10 * 1.00, 0], // C6
  ],
  energy: [
    //  C1     C2     C3     C4     C5     C6
    [0,     0.050, 0.220, 0,     0.080, 0.13 * 1.15 ], // C1
    [0,     0,     0.250, 0.120, 0,     0.12 * 1.15 ], // C2
    [0.120, 0,     0,     0,     0,     0.08 * 1.15 ], // C3
    [0,     0.160, 0.150, 0,     0,     0.10 * 1.15 ], // C4
    [0,     0.180, 0.120, 0,     0,     0.20 * 1.15 ], // C5
    [0.08 * 1.15, 0.22 * 1.15, 0.15 * 1.15, 0.03 * 1.15, 0.10 * 1.15, 0], // C6
  ],
};

// ---------------------------------------------------------------------------
// Neumann Series Terms for Leontief Inversion
// ---------------------------------------------------------------------------

export const NEUMANN_TERMS = 12;

// ---------------------------------------------------------------------------
// Sanity Bounds — Blueprint §4
// ---------------------------------------------------------------------------

export const SANITY_SINGLE_CATEGORY_MAX_REVENUE_FRACTION = 0.05;
export const SANITY_TOTAL_MAX_REVENUE_FRACTION = 0.10;

// ---------------------------------------------------------------------------
// Findings Adjustment Cap — Blueprint §4 Layer 1c
// ---------------------------------------------------------------------------

export const FINDINGS_ADJUSTMENT_CAP = 0.60;

// ---------------------------------------------------------------------------
// Canonical Comparison — "With canonical" annual growth rate
// ---------------------------------------------------------------------------

export const CANONICAL_ANNUAL_GROWTH_RATE = 0.03;

// ---------------------------------------------------------------------------
// Severity Multipliers
// ---------------------------------------------------------------------------

export const SEVERITY_MULTIPLIERS: Record<Severity, number> = {
  none: 0.0,
  some: 0.5,
  pervasive: 1.0,
};

// ---------------------------------------------------------------------------
// Evidence Citations — Blueprint §12
// ---------------------------------------------------------------------------

export const EVIDENCE_CITATIONS: EvidenceCitation[] = [
  {
    claim: '5.4% of data teams use canonical/semantic models',
    source: 'Reis 2026 Survey (n=1,101)',
    quality: 'Strong',
  },
  {
    claim: 'Ad-hoc teams firefight at 38% vs 19% for canonical teams',
    source: 'Reis 2026 Survey',
    quality: 'Strong',
  },
  {
    claim: '$12.9\u201315M average annual cost of poor data quality',
    source: 'Gartner 2017/2020',
    quality: 'Strong',
  },
  {
    claim: '27% of employee time spent correcting bad data',
    source: 'IBM/Forrester via Gartner',
    quality: 'Strong',
  },
  {
    claim: '$2.5M average failed enterprise integration',
    source: 'Gartner 2020',
    quality: 'Moderate',
  },
  {
    claim: '89% of data practitioners report modelling pain points',
    source: 'Reis 2026 Survey',
    quality: 'Strong',
  },
  {
    claim: '59% cite "pressure to move fast" as top barrier',
    source: 'Reis 2026 Survey',
    quality: 'Strong',
  },
  {
    claim: 'DAMA-DMBOK 11 knowledge areas',
    source: 'DAMA International',
    quality: 'Strong',
  },
  {
    claim: 'Sector maturity ranking (8th, 9th, 4th of 9)',
    source: 'KB-00 analysis derived from Reis 2026 + sector standards',
    quality: 'Moderate',
  },
  {
    claim: '39+ TSOs using CIM',
    source: 'ENTSO-E documentation',
    quality: 'Strong',
  },
  {
    claim: 'Barrick Gold $8.5B write-off — driven by unreliable environmental data and executive cover-up, not environmental damage itself. The data architecture was the failure.',
    source: 'Public regulatory record',
    quality: 'Strong',
  },
  {
    claim: 'DWS/Deutsche Bank $25M + CEO resignation — sustainability data that could not withstand audit scrutiny triggered enforcement',
    source: 'SEC/BaFin enforcement',
    quality: 'Strong',
  },
  {
    claim: 'CSRD penalty framework (5% turnover)',
    source: 'CSDDD legislation',
    quality: 'Strong',
  },
  {
    claim: 'GDPR enforcement acceleration (+50% YoY)',
    source: 'CMS ET Report 2025',
    quality: 'Strong',
  },
  {
    claim: 'Alcoa WA $55M penalty',
    source: 'KB-07, public record',
    quality: 'Strong',
  },
  {
    claim: 'MuleSoft $4.7M avg integration cost',
    source: 'MuleSoft 2023 (n=1,050)',
    quality: 'Moderate',
  },
  {
    claim: '67 data incidents/month',
    source: 'Monte Carlo survey 2023 (n=200)',
    quality: 'Moderate',
  },
  {
    claim: '80% use AI but no DQ improvement',
    source: 'dbt Labs 2025 (n=459)',
    quality: 'Moderate',
  },
  {
    claim: 'W matrix coefficients',
    source: 'KB-11 Gemini calibration — 87% estimated, 13% sourced',
    quality: 'Moderate',
  },
  {
    claim: '80% of AI failures are data failures',
    source: 'RAND Corporation RRA2680-1',
    quality: 'Strong',
  },
  {
    claim: 'EU AI Act Art 10 mandates training data be "free of errors and complete"',
    source: 'EU AI Act (Regulation 2024/1689)',
    quality: 'Strong',
  },
  {
    claim: '$5B+ in named AI incidents (Meta $1.4B+$650M, Anthropic $1.5B, Zillow $500M+)',
    source: 'Public enforcement records and financial disclosures',
    quality: 'Strong',
  },
  {
    claim: 'C6 base allocation fractions (0.007-0.018) calibrated for CFO defensibility',
    source: 'Evidence synthesis: 16 named incidents, EU AI Act, NIST AI RMF, ISO/IEC 5259',
    quality: 'Moderate',
  },
];

// ---------------------------------------------------------------------------
// Estimated Values Disclosures — Blueprint §12
// ---------------------------------------------------------------------------

export const ESTIMATED_VALUE_DISCLOSURES: string[] = [
  'Per-finding cost functions are assessment-calibrated estimates designed as an updatable dataset.',
  'Cross-category interaction coefficients are 87% expert estimation, 13% sourced from published benchmarks.',
  'Findings adjustment capped at 60% of base cost per category \u2014 bounding assumption.',
  'Sector saving fractions (35\u201342%) are derived estimates. CIM 20\u201350% range referenced where available.',
  '$1.8M AUD canonical build cost is a parametric estimate (3 architects \u00d7 18 months \u00d7 WA rates).',
  'Regulatory probability bases are mixed sourced/estimated per sector.',
];
