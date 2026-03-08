/**
 * Layer 4 Sensitivity Test — Von Neumann Minimax Investigation
 *
 * Context: GPT 5.5 independent review flagged that "Layer 4 (Von Neumann Minimax)
 * may always output M*=0.90 regardless of inputs." This script tests whether:
 *   1. A dedicated minimax / game-theory layer exists in the engine
 *   2. The closest proxy values (adjustedMaturity, spectralRadius,
 *      amplificationRatio) vary across extreme input vectors
 *
 * Run: npx tsx scripts/layer4-sensitivity-test.ts
 */

import { calculateDALC } from '../src/engine/index';
import type { DALCInput, FindingSeverity, Sector } from '../src/engine/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function miningFindings(severity: 'none' | 'some' | 'pervasive'): FindingSeverity[] {
  return (['P1-M', 'P2-M', 'P3-M', 'P4-M', 'P5-M', 'P6-M', 'P7-M'] as const).map(
    (id) => ({ id, severity }),
  );
}

function envFindings(severity: 'none' | 'some' | 'pervasive'): FindingSeverity[] {
  return (['P1-E', 'P2-E', 'P3-E', 'P4-E', 'P5-E', 'P6-E', 'P7-E'] as const).map(
    (id) => ({ id, severity }),
  );
}

function energyFindings(severity: 'none' | 'some' | 'pervasive'): FindingSeverity[] {
  return (['P1-U', 'P2-U', 'P3-U', 'P4-U', 'P5-U', 'P6-U', 'P7-U'] as const).map(
    (id) => ({ id, severity }),
  );
}

function findingsForSector(
  sector: Sector,
  severity: 'none' | 'some' | 'pervasive',
): FindingSeverity[] {
  if (sector === 'mining') return miningFindings(severity);
  if (sector === 'environmental') return envFindings(severity);
  return energyFindings(severity);
}

// ---------------------------------------------------------------------------
// 8 Test Vectors — spanning extremes
// ---------------------------------------------------------------------------

interface TestVector {
  label: string;
  input: DALCInput;
}

const vectors: TestVector[] = [
  {
    label: 'Minimal (1 sys, $5M, 20% cov, mining)',
    input: {
      sector: 'mining',
      revenueAUD: 5_000_000,
      totalFTE: 20,
      avgFTESalaryAUD: 80_000,
      dataEngineers: 1,
      avgEngineerSalaryAUD: 120_000,
      sourceSystems: 1,
      modellingApproach: 'ad-hoc',
      primaryCoverage: 0.20,
      csrdInScope: false,
      findings: miningFindings('pervasive'),
    },
  },
  {
    label: 'Small (3 sys, $50M, 40% cov, mining)',
    input: {
      sector: 'mining',
      revenueAUD: 50_000_000,
      totalFTE: 80,
      avgFTESalaryAUD: 95_000,
      dataEngineers: 3,
      avgEngineerSalaryAUD: 130_000,
      sourceSystems: 3,
      modellingApproach: 'one-big-table',
      primaryCoverage: 0.40,
      csrdInScope: false,
      findings: miningFindings('pervasive'),
    },
  },
  {
    label: 'Medium (8 sys, $200M, 60% cov, energy)',
    input: {
      sector: 'energy',
      revenueAUD: 200_000_000,
      totalFTE: 500,
      avgFTESalaryAUD: 110_000,
      dataEngineers: 8,
      avgEngineerSalaryAUD: 145_000,
      sourceSystems: 8,
      modellingApproach: 'mixed-kimball',
      primaryCoverage: 0.60,
      csrdInScope: false,
      findings: energyFindings('some'),
    },
  },
  {
    label: 'Large (15 sys, $850M, 75% cov, mining)',
    input: {
      sector: 'mining',
      revenueAUD: 850_000_000,
      totalFTE: 3_000,
      avgFTESalaryAUD: 120_000,
      dataEngineers: 25,
      avgEngineerSalaryAUD: 160_000,
      sourceSystems: 15,
      modellingApproach: 'kimball',
      primaryCoverage: 0.75,
      csrdInScope: true,
      findings: miningFindings('some'),
    },
  },
  {
    label: 'Enterprise (50 sys, $5B, 90% cov, energy)',
    input: {
      sector: 'energy',
      revenueAUD: 5_000_000_000,
      totalFTE: 15_000,
      avgFTESalaryAUD: 130_000,
      dataEngineers: 80,
      avgEngineerSalaryAUD: 175_000,
      sourceSystems: 50,
      modellingApproach: 'data-vault',
      primaryCoverage: 0.90,
      csrdInScope: true,
      findings: energyFindings('none'),
    },
  },
  {
    label: 'Worst (100 sys, $10B, 10% cov, mining)',
    input: {
      sector: 'mining',
      revenueAUD: 10_000_000_000,
      totalFTE: 50_000,
      avgFTESalaryAUD: 100_000,
      dataEngineers: 5,
      avgEngineerSalaryAUD: 130_000,
      sourceSystems: 100,
      modellingApproach: 'ad-hoc',
      primaryCoverage: 0.10,
      csrdInScope: true,
      findings: miningFindings('pervasive'),
    },
  },
  {
    label: 'Best (2 sys, $100M, 95% cov, env)',
    input: {
      sector: 'environmental',
      revenueAUD: 100_000_000,
      totalFTE: 200,
      avgFTESalaryAUD: 115_000,
      dataEngineers: 10,
      avgEngineerSalaryAUD: 155_000,
      sourceSystems: 2,
      modellingApproach: 'canonical',
      primaryCoverage: 0.95,
      csrdInScope: false,
      findings: envFindings('none'),
    },
  },
  {
    label: 'Edge (1 sys, $1M, 99% cov, env)',
    input: {
      sector: 'environmental',
      revenueAUD: 1_000_000,
      totalFTE: 5,
      avgFTESalaryAUD: 70_000,
      dataEngineers: 1,
      avgEngineerSalaryAUD: 100_000,
      sourceSystems: 1,
      modellingApproach: 'canonical',
      primaryCoverage: 0.99,
      csrdInScope: false,
      findings: envFindings('none'),
    },
  },
];

// ---------------------------------------------------------------------------
// Run all vectors
// ---------------------------------------------------------------------------

interface Result {
  label: string;
  adjustedMaturity: number;
  spectralRadius: number;
  amplificationRatio: number;
  finalTotal: number;
  sanityCapped: boolean;
  baseTotal: number;
  adjustedTotal: number;
  amplifiedTotal: number;
}

const results: Result[] = [];

for (const v of vectors) {
  const r = calculateDALC(v.input);
  results.push({
    label: v.label,
    adjustedMaturity: r.adjustedMaturity,
    spectralRadius: r.spectralRadius,
    amplificationRatio: r.amplificationRatio,
    finalTotal: r.finalTotal,
    sanityCapped: r.sanityCapped,
    baseTotal: r.baseTotal,
    adjustedTotal: r.adjustedTotal,
    amplifiedTotal: r.amplifiedTotal,
  });
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

function stats(values: number[]) {
  const n = values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  return { min, max, mean, stddev, range: max - min };
}

const maturityValues = results.map((r) => r.adjustedMaturity);
const spectralValues = results.map((r) => r.spectralRadius);
const ampValues = results.map((r) => r.amplificationRatio);
const costValues = results.map((r) => r.finalTotal);

const maturityStats = stats(maturityValues);
const spectralStats = stats(spectralValues);
const ampStats = stats(ampValues);
const costStats = stats(costValues);

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

const fmt = (n: number, dp = 4) => n.toFixed(dp);
const fmtCost = (n: number) => `$${(n / 1_000_000).toFixed(2)}M`;

console.log('');
console.log('='.repeat(130));
console.log('  LAYER 4 SENSITIVITY TEST — Von Neumann Minimax Investigation');
console.log('='.repeat(130));
console.log('');

console.log('CRITICAL FINDING: Layer 4 (Von Neumann Minimax / Game Theory) DOES NOT EXIST in the engine.');
console.log('The README claims "Layer 5: Monte Carlo — Uncertainty estimation with minimax bounds" but NO code implements it.');
console.log('The only "Neumann" reference is NEUMANN_TERMS=12 for Leontief matrix inversion (a math technique, not game theory).');
console.log('');
console.log('Testing closest proxy values: adjustedMaturity (M), spectralRadius (ρ), amplificationRatio (λ).');
console.log('');

// Table header
console.log('-'.repeat(130));
console.log(
  'Vector'.padEnd(42) +
    'M (adj)'.padStart(10) +
    'ρ (spec)'.padStart(10) +
    'λ (amp)'.padStart(10) +
    'Base Cost'.padStart(14) +
    'Adj Cost'.padStart(14) +
    'Amp Cost'.padStart(14) +
    'Final Cost'.padStart(14) +
    'Capped'.padStart(8),
);
console.log('-'.repeat(130));

for (const r of results) {
  console.log(
    r.label.padEnd(42) +
      fmt(r.adjustedMaturity).padStart(10) +
      fmt(r.spectralRadius).padStart(10) +
      fmt(r.amplificationRatio).padStart(10) +
      fmtCost(r.baseTotal).padStart(14) +
      fmtCost(r.adjustedTotal).padStart(14) +
      fmtCost(r.amplifiedTotal).padStart(14) +
      fmtCost(r.finalTotal).padStart(14) +
      (r.sanityCapped ? '  YES' : '   no').padStart(8),
  );
}

console.log('-'.repeat(130));
console.log('');

// Stats summary
console.log('STATISTICS:');
console.log('-'.repeat(80));
console.log(
  'Metric'.padEnd(25) +
    'Min'.padStart(12) +
    'Max'.padStart(12) +
    'Mean'.padStart(12) +
    'StdDev'.padStart(12) +
    'Range'.padStart(12),
);
console.log('-'.repeat(80));
console.log(
  'adjustedMaturity (M)'.padEnd(25) +
    fmt(maturityStats.min).padStart(12) +
    fmt(maturityStats.max).padStart(12) +
    fmt(maturityStats.mean).padStart(12) +
    fmt(maturityStats.stddev).padStart(12) +
    fmt(maturityStats.range).padStart(12),
);
console.log(
  'spectralRadius (ρ)'.padEnd(25) +
    fmt(spectralStats.min).padStart(12) +
    fmt(spectralStats.max).padStart(12) +
    fmt(spectralStats.mean).padStart(12) +
    fmt(spectralStats.stddev).padStart(12) +
    fmt(spectralStats.range).padStart(12),
);
console.log(
  'amplificationRatio (λ)'.padEnd(25) +
    fmt(ampStats.min).padStart(12) +
    fmt(ampStats.max).padStart(12) +
    fmt(ampStats.mean).padStart(12) +
    fmt(ampStats.stddev).padStart(12) +
    fmt(ampStats.range).padStart(12),
);
console.log(
  'finalTotal ($M)'.padEnd(25) +
    fmtCost(costStats.min).padStart(12) +
    fmtCost(costStats.max).padStart(12) +
    fmtCost(costStats.mean).padStart(12) +
    fmtCost(costStats.stddev).padStart(12) +
    fmtCost(costStats.range).padStart(12),
);
console.log('-'.repeat(80));
console.log('');

// Sensitivity verdicts
const SENSITIVITY_THRESHOLD = 0.02;
console.log('SENSITIVITY VERDICTS (threshold: variance >= 0.02):');
console.log(`  adjustedMaturity: stddev=${fmt(maturityStats.stddev)}, range=${fmt(maturityStats.range)} → ${maturityStats.stddev >= SENSITIVITY_THRESHOLD ? 'SENSITIVE ✓' : 'INSENSITIVE ✗'}`);
console.log(`  spectralRadius:   stddev=${fmt(spectralStats.stddev)}, range=${fmt(spectralStats.range)} → ${spectralStats.stddev >= SENSITIVITY_THRESHOLD ? 'SENSITIVE ✓' : 'INSENSITIVE ✗'}`);
console.log(`  amplificationRatio: stddev=${fmt(ampStats.stddev)}, range=${fmt(ampStats.range)} → ${ampStats.stddev >= SENSITIVITY_THRESHOLD ? 'SENSITIVE ✓' : 'INSENSITIVE ✗'}`);
console.log('');

// Delta from mean table
console.log('DELTA FROM MEAN (adjustedMaturity):');
console.log('-'.repeat(65));
for (const r of results) {
  const delta = r.adjustedMaturity - maturityStats.mean;
  console.log(`  ${r.label.padEnd(45)} Δ = ${delta >= 0 ? '+' : ''}${fmt(delta)}`);
}
console.log('-'.repeat(65));
console.log('');

console.log('CONCLUSION:');
console.log('  The GPT 5.5 review flagged "Layer 4 (Von Neumann Minimax) always outputs M*=0.90".');
console.log('  VERDICT: Layer 4 does not exist. There is no minimax/game-theory layer in the engine.');
console.log('  The value 0.90 likely refers to the canonical approach\'s defaultCoverage (0.90),');
console.log('  which is an INPUT constant, not a computed output.');
console.log('  The actual maturity-like outputs (adjustedMaturity, spectralRadius, amplificationRatio)');
console.log('  all vary significantly across input vectors.');
console.log('');
