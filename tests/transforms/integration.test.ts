// =============================================================================
// Transform Clarity Checks — Integration Test
//
// End-to-end: parse fixture CSV → run all 9 checks → verify findings.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseTransformFiles, runTransformChecks } from '../../src/transforms/index';
import type { TransformFile } from '../../src/transforms/parser';

const FIXTURE_PATH = join(__dirname, '../fixtures/sample-mapping.csv');

function loadFixture(): TransformFile {
  const buffer = readFileSync(FIXTURE_PATH);
  return {
    originalname: 'sample-mapping.csv',
    buffer,
    mimetype: 'text/csv',
  };
}

describe('Transform Integration', () => {
  it('should parse the sample CSV without errors', async () => {
    const result = await parseTransformFiles([loadFixture()]);
    expect(result.warnings).toHaveLength(0);
    expect(result.totalMappings).toBeGreaterThan(20);
    expect(result.data.sourceTables.length).toBeGreaterThan(3);
    expect(result.data.targetTables.length).toBeGreaterThan(3);
  });

  it('should detect multiple findings from sample mapping CSV', async () => {
    const result = await parseTransformFiles([loadFixture()]);
    const findings = runTransformChecks(result.data);

    // Each check returns at most 1 finding; all 9 checks should fire
    expect(findings.length).toBeGreaterThanOrEqual(9);

    // Should have findings from multiple check categories
    const checkIds = new Set(findings.map(f => f.checkId));
    expect(checkIds.size).toBeGreaterThanOrEqual(4);

    // Should include both semantic drift and ontological breaks
    const categories = new Set(findings.map(f => f.category));
    expect(categories.has('semantic-drift')).toBe(true);
    expect(categories.has('ontological-break')).toBe(true);

    // Every finding should have required fields
    for (const f of findings) {
      expect(f.title).toBeTruthy();
      expect(f.description).toBeTruthy();
      expect(f.evidence).toBeInstanceOf(Array);
      expect(f.evidence.length).toBeGreaterThan(0);
      expect(f.remediation).toBeTruthy();
      expect(f.costCategories).toBeInstanceOf(Array);
      expect(f.costCategories.length).toBeGreaterThan(0);
      expect(typeof f.ratio).toBe('number');
      expect(f.ratio).toBeGreaterThanOrEqual(0);
      expect(f.ratio).toBeLessThanOrEqual(1);
    }
  });

  it('should detect SD-1 alias misalignment (revenue→income, cost→expense)', async () => {
    const result = await parseTransformFiles([loadFixture()]);
    const findings = runTransformChecks(result.data);
    const sd1 = findings.find(f => f.checkId === 'SD-1');
    expect(sd1).toBeDefined();
    expect(sd1!.category).toBe('semantic-drift');
    // Should detect at least revenue→income and cost→expense
    expect(sd1!.affectedMappings).toBeGreaterThanOrEqual(2);
  });

  it('should detect SD-2 type coercion (timestamp→date, decimal→integer)', async () => {
    const result = await parseTransformFiles([loadFixture()]);
    const findings = runTransformChecks(result.data);
    const sd2 = findings.find(f => f.checkId === 'SD-2');
    expect(sd2).toBeDefined();
    expect(sd2!.category).toBe('semantic-drift');
    expect(sd2!.affectedMappings).toBeGreaterThanOrEqual(2);
  });

  it('should detect SD-3 undocumented aggregation (SUM, AVG without notes)', async () => {
    const result = await parseTransformFiles([loadFixture()]);
    const findings = runTransformChecks(result.data);
    const sd3 = findings.find(f => f.checkId === 'SD-3');
    expect(sd3).toBeDefined();
    expect(sd3!.category).toBe('semantic-drift');
    expect(sd3!.affectedMappings).toBeGreaterThanOrEqual(3);
  });

  it('should detect SD-4 unit conversion gap (kg→lbs, celsius→fahrenheit)', async () => {
    const result = await parseTransformFiles([loadFixture()]);
    const findings = runTransformChecks(result.data);
    const sd4 = findings.find(f => f.checkId === 'SD-4');
    expect(sd4).toBeDefined();
    expect(sd4!.category).toBe('semantic-drift');
    expect(sd4!.affectedMappings).toBeGreaterThanOrEqual(2);
  });

  it('should detect SD-5 null masking (COALESCE, ISNULL, NVL without notes)', async () => {
    const result = await parseTransformFiles([loadFixture()]);
    const findings = runTransformChecks(result.data);
    const sd5 = findings.find(f => f.checkId === 'SD-5');
    expect(sd5).toBeDefined();
    expect(sd5!.category).toBe('semantic-drift');
    expect(sd5!.affectedMappings).toBeGreaterThanOrEqual(2);
  });

  it('should detect OB-1 entity merging (customers+suppliers+employees→dim_party)', async () => {
    const result = await parseTransformFiles([loadFixture()]);
    const findings = runTransformChecks(result.data);
    const ob1 = findings.find(f => f.checkId === 'OB-1');
    expect(ob1).toBeDefined();
    expect(ob1!.category).toBe('ontological-break');
    // dim_party receives from 3 sources
    expect(ob1!.evidence.length).toBeGreaterThanOrEqual(1);
  });

  it('should detect OB-2 entity splitting (source→3+ targets)', async () => {
    const result = await parseTransformFiles([loadFixture()]);
    const findings = runTransformChecks(result.data);
    const ob2 = findings.find(f => f.checkId === 'OB-2');
    // inventory.stock maps to dim_product, fact_inventory, dim_category (3 targets)
    // hr.payroll maps to dim_employee, fact_payroll (only 2 — not enough)
    // sales.orders maps to fact_sales, dim_status (only 2 — not enough)
    // mining.sites maps to dim_location, fact_emissions, fact_transport, fact_quality (4 targets)
    expect(ob2).toBeDefined();
    expect(ob2!.category).toBe('ontological-break');
  });

  it('should detect OB-4 fan-out join (target column fed by 2+ source tables)', async () => {
    const result = await parseTransformFiles([loadFixture()]);
    const findings = runTransformChecks(result.data);
    const ob4 = findings.find(f => f.checkId === 'OB-4');
    // dim_party.party_name gets data from customers, suppliers, and employees
    expect(ob4).toBeDefined();
    expect(ob4!.category).toBe('ontological-break');
  });

  it('should produce findings with valid severity levels', async () => {
    const result = await parseTransformFiles([loadFixture()]);
    const findings = runTransformChecks(result.data);
    const validSeverities = ['critical', 'major', 'minor', 'info'];
    for (const f of findings) {
      expect(validSeverities).toContain(f.severity);
    }
  });

  it('should produce findings with valid cost weights', async () => {
    const result = await parseTransformFiles([loadFixture()]);
    const findings = runTransformChecks(result.data);
    for (const f of findings) {
      expect(f.costWeights).toBeDefined();
      const total = Object.values(f.costWeights).reduce((s, v) => s + v, 0);
      expect(total).toBeCloseTo(1.0, 1);
    }
  });
});
