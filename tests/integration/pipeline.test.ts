import { describe, it, expect } from 'vitest';
import { ALL_CHECKS } from '../../src/checks/index';
import { scoreFindings } from '../../src/scoring/severity-scorer';
import { mapToEngineInput } from '../../src/scoring/mapper';
import { calculateDALC } from '../../src/engine/index';
import { createMockSchema, createMockConfig } from '../../src/mock/schema-factory';
import type { Finding } from '../../src/checks/types';

// =============================================================================
// Use shared mock schema factory
// =============================================================================

const mockSchema = createMockSchema();
const mockConfig = createMockConfig();

// =============================================================================
// Pipeline Integration Tests
// =============================================================================
describe('Full Pipeline Integration', () => {
  let allFindings: Finding[];

  it('ALL_CHECKS produces findings from mock schema', () => {
    allFindings = [];
    for (const check of ALL_CHECKS) {
      const results = check.execute(mockSchema, mockConfig);
      allFindings.push(...results);
    }

    // Should have multiple findings across multiple properties
    expect(allFindings.length).toBeGreaterThanOrEqual(5);
    const properties = new Set(allFindings.map((f) => f.property));
    expect(properties.size).toBeGreaterThanOrEqual(3);

    // Verify all findings have rawScore 0 (not yet scored)
    for (const f of allFindings) {
      expect(f.rawScore).toBe(0);
    }
  });

  it('scoreFindings scores all findings', () => {
    // Use findings from previous test
    if (!allFindings || allFindings.length === 0) {
      allFindings = [];
      for (const check of ALL_CHECKS) {
        allFindings.push(...check.execute(mockSchema, mockConfig));
      }
    }

    const scored = scoreFindings(allFindings, mockSchema);

    // All findings should have rawScore > 0
    for (const f of scored.findings) {
      expect(f.rawScore).toBeGreaterThan(0);
      expect(f.rawScore).toBeLessThanOrEqual(1);
    }

    // PropertyScores should have entries
    expect(scored.propertyScores.size).toBeGreaterThan(0);

    // totalTables should match
    expect(scored.totalTables).toBe(mockSchema.tables.length);

    // Complexity floor should NOT be applied (25 tables > 20)
    expect(scored.complexityFloorApplied).toBe(false);
  });

  it('mapToEngineInput produces valid DALCInput', () => {
    allFindings = [];
    for (const check of ALL_CHECKS) {
      allFindings.push(...check.execute(mockSchema, mockConfig));
    }
    const scored = scoreFindings(allFindings, mockSchema);
    const input = mapToEngineInput(scored, mockSchema, mockConfig);

    // 7 findings (one per property)
    expect(input.findings).toHaveLength(7);

    // All have valid FindingId format (P1-M through P7-M for mining)
    for (const f of input.findings) {
      expect(f.id).toMatch(/^P[1-7]-M$/);
      expect(['none', 'some', 'pervasive']).toContain(f.severity);
    }

    // Organisation fields mapped correctly
    expect(input.sector).toBe('mining');
    expect(input.revenueAUD).toBe(250_000_000);
    expect(input.totalFTE).toBe(1200);
    expect(input.csrdInScope).toBe(true);
    expect(input.canonicalInvestmentAUD).toBe(2_000_000);

    // Valid modelling approach
    expect([
      'ad-hoc', 'one-big-table', 'mixed-adhoc', 'mixed-kimball',
      'kimball', 'data-vault', 'event-driven', 'canonical',
    ]).toContain(input.modellingApproach);
  });

  it('calculateDALC produces valid result from pipeline output', () => {
    allFindings = [];
    for (const check of ALL_CHECKS) {
      allFindings.push(...check.execute(mockSchema, mockConfig));
    }
    const scored = scoreFindings(allFindings, mockSchema);
    const input = mapToEngineInput(scored, mockSchema, mockConfig);
    const result = calculateDALC(input);

    // Engine metadata
    expect(result.engineVersion).toBe('v4.0.0');

    // Core financials
    expect(result.finalTotal).toBeGreaterThan(0);
    expect(result.baseTotal).toBeGreaterThan(0);

    // Property scores
    expect(result.propertyScores).toHaveLength(7);
    for (const ps of result.propertyScores) {
      expect(ps.score).toBeGreaterThanOrEqual(0);
      expect(ps.score).toBeLessThanOrEqual(4);
    }

    // 5-year projection
    expect(result.fiveYearProjection).toHaveLength(5);
    for (const yr of result.fiveYearProjection) {
      expect(yr.doNothingCost).toBeGreaterThan(0);
    }

    // Canonical comparison
    expect(result.annualSaving).toBeDefined();
    expect(result.paybackMonths).toBeDefined();

    // Input echo
    expect(result.input).toBeDefined();
    expect(result.input.sector).toBe('mining');
  });

  it('full pipeline end-to-end: checks → score → map → engine', () => {
    // Single integrated test running the full chain
    const findings: Finding[] = [];
    for (const check of ALL_CHECKS) {
      findings.push(...check.execute(mockSchema, mockConfig));
    }

    expect(findings.length).toBeGreaterThan(0);

    const scored = scoreFindings(findings, mockSchema);
    expect(scored.findings.every((f) => f.rawScore > 0)).toBe(true);

    const input = mapToEngineInput(scored, mockSchema, mockConfig);
    expect(input.findings).toHaveLength(7);

    const result = calculateDALC(input);

    // The DALC Result should be a complete, valid output
    expect(result.engineVersion).toBe('v4.0.0');
    expect(typeof result.finalTotal).toBe('number');
    expect(result.finalTotal).toBeGreaterThan(0);
    expect(result.propertyScores).toHaveLength(7);
    expect(result.fiveYearProjection).toHaveLength(5);
    expect(result.fiveYearCumulativeSaving).toBeDefined();
    expect(result.findingResults).toHaveLength(7);

    // Sanity check: costs should be plausible for a $250M revenue mining company
    // Total disorder cost should be between $100K and $100M
    expect(result.finalTotal).toBeGreaterThan(100_000);
    expect(result.finalTotal).toBeLessThan(100_000_000);
  });
});
