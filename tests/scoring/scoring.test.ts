import { describe, it, expect } from 'vitest';
import { scoreFindings } from '../../src/scoring/severity-scorer';
import type { ScoredFindings } from '../../src/scoring/severity-scorer';
import { mapToEngineInput } from '../../src/scoring/mapper';
import type { SchemaData } from '../../src/adapters/types';
import type { Finding, ScannerConfig } from '../../src/checks/types';

// =============================================================================
// Helpers
// =============================================================================

function makeSchemaData(overrides: Partial<SchemaData> = {}): SchemaData {
  return {
    databaseType: 'postgresql',
    databaseVersion: '16.0',
    extractedAt: '2024-01-01T00:00:00Z',
    tables: [],
    columns: [],
    constraints: [],
    indexes: [],
    foreignKeys: [],
    tableStatistics: [],
    columnStatistics: [],
    comments: [],
    ...overrides,
  };
}

function makeConfig(overrides: Partial<ScannerConfig> = {}): ScannerConfig {
  return {
    organisation: {
      name: 'Test Corp',
      sector: 'mining',
      revenueAUD: 100_000_000,
      totalFTE: 500,
      dataEngineers: 10,
      avgSalaryAUD: 150_000,
      avgFTESalaryAUD: 100_000,
      csrdInScope: false,
    },
    thresholds: {},
    ...overrides,
  };
}

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    checkId: 'TEST-CHECK',
    property: 1,
    severity: 'major',
    rawScore: 0,
    title: 'Test finding',
    description: 'Test description',
    evidence: [{ schema: 'public', table: 'test', detail: 'test detail' }],
    affectedObjects: 5,
    totalObjects: 10,
    ratio: 0.5,
    remediation: 'Fix it',
    costCategories: ['firefighting', 'integration'],
    costWeights: { firefighting: 0.3, dataQuality: 0.0, integration: 0.5, productivity: 0.2, regulatory: 0 },
    ...overrides,
  };
}

function makeTables(count: number, schema = 'public') {
  return Array.from({ length: count }, (_, i) => ({
    schema,
    name: `table_${i}`,
    type: 'table' as const,
    rowCount: 1000,
    sizeBytes: 65536,
    createdAt: null,
    lastModified: null,
    comment: null,
  }));
}

function makeTableStats(count: number, rowCount = 1000, schema = 'public') {
  return Array.from({ length: count }, (_, i) => ({
    schema,
    table: `table_${i}`,
    rowCount,
    deadRows: 0,
    lastVacuum: null,
    lastAnalyze: null,
    lastAutoAnalyze: null,
  }));
}

// =============================================================================
// Severity Scorer Tests
// =============================================================================
describe('scoreFindings', () => {
  it('returns empty propertyScores when no findings', () => {
    const schema = makeSchemaData({ tables: makeTables(10) });
    const result = scoreFindings([], schema);
    expect(result.propertyScores.size).toBe(0);
    expect(result.findings).toHaveLength(0);
  });

  it('sets rawScore on each finding', () => {
    const schema = makeSchemaData({
      tables: makeTables(25),
      tableStatistics: makeTableStats(25),
    });
    const findings = [
      makeFinding({ property: 1 }),
      makeFinding({ property: 2, severity: 'critical', ratio: 0.8 }),
    ];
    const result = scoreFindings(findings, schema);
    expect(result.findings[0].rawScore).toBeGreaterThan(0);
    expect(result.findings[1].rawScore).toBeGreaterThan(0);
  });

  it('higher severity yields higher rawScore', () => {
    const schema = makeSchemaData({
      tables: makeTables(25),
      tableStatistics: makeTableStats(25),
    });
    const criticalFinding = makeFinding({ severity: 'critical', ratio: 0.5 });
    const minorFinding = makeFinding({ severity: 'minor', ratio: 0.5 });

    const criticalResult = scoreFindings([criticalFinding], schema);
    const minorResult = scoreFindings([minorFinding], schema);

    expect(criticalResult.findings[0].rawScore).toBeGreaterThan(
      minorResult.findings[0].rawScore,
    );
  });

  it('complexity floor caps severity for small databases', () => {
    // Small DB: 5 tables (< 20 threshold)
    const smallSchema = makeSchemaData({
      tables: makeTables(5),
      tableStatistics: makeTableStats(5),
    });
    // Large DB: 25 tables
    const largeSchema = makeSchemaData({
      tables: makeTables(25),
      tableStatistics: makeTableStats(25),
    });

    const smallFinding = makeFinding({ severity: 'critical', ratio: 0.5 });
    const largeFinding = makeFinding({ severity: 'critical', ratio: 0.5 });

    const smallResult = scoreFindings([smallFinding], smallSchema);
    const largeResult = scoreFindings([largeFinding], largeSchema);

    expect(smallResult.complexityFloorApplied).toBe(true);
    expect(largeResult.complexityFloorApplied).toBe(false);
    expect(smallResult.findings[0].rawScore).toBeLessThan(
      largeResult.findings[0].rawScore,
    );
  });

  it('zero-row downgrade halves rawScore', () => {
    const normalSchema = makeSchemaData({
      tables: makeTables(25),
      tableStatistics: makeTableStats(25, 1000),
    });
    const emptySchema = makeSchemaData({
      tables: makeTables(25),
      tableStatistics: makeTableStats(25, 0),
    });

    const normalFinding = makeFinding({ severity: 'major', ratio: 0.5 });
    const emptyFinding = makeFinding({ severity: 'major', ratio: 0.5 });

    const normalResult = scoreFindings([normalFinding], normalSchema);
    const emptyResult = scoreFindings([emptyFinding], emptySchema);

    expect(emptyResult.zeroRowDowngrade).toBe(true);
    expect(normalResult.zeroRowDowngrade).toBe(false);
    // Empty should be approximately half of normal
    expect(emptyResult.findings[0].rawScore).toBeLessThan(
      normalResult.findings[0].rawScore,
    );
    // Specifically about half
    const ratio = emptyResult.findings[0].rawScore / normalResult.findings[0].rawScore;
    expect(ratio).toBeCloseTo(0.5, 1);
  });

  it('propertyScores aggregates max per property', () => {
    const schema = makeSchemaData({
      tables: makeTables(25),
      tableStatistics: makeTableStats(25),
    });
    const findings = [
      makeFinding({ property: 1, severity: 'minor', ratio: 0.2 }),
      makeFinding({ property: 1, severity: 'critical', ratio: 0.9 }),
    ];
    const result = scoreFindings(findings, schema);
    // Property 1 score should equal the higher (critical) finding
    const p1Score = result.propertyScores.get(1)!;
    expect(p1Score).toBe(result.findings[1].rawScore);
    expect(p1Score).toBeGreaterThan(result.findings[0].rawScore);
  });

  it('breadth increases rawScore', () => {
    // 3 schemas present in the database
    const schema = makeSchemaData({
      tables: [
        ...makeTables(10, 'public'),
        ...makeTables(10, 'mining').map((t) => ({ ...t, schema: 'mining', name: `m_${t.name}` })),
        ...makeTables(10, 'env').map((t) => ({ ...t, schema: 'env', name: `e_${t.name}` })),
      ],
      tableStatistics: [
        ...makeTableStats(10, 1000, 'public'),
        ...makeTableStats(10, 1000, 'mining'),
        ...makeTableStats(10, 1000, 'env'),
      ],
    });

    const narrowFinding = makeFinding({
      severity: 'major',
      ratio: 0.5,
      evidence: [{ schema: 'public', table: 'test', detail: 'd' }],
    });
    const broadFinding = makeFinding({
      severity: 'major',
      ratio: 0.5,
      evidence: [
        { schema: 'public', table: 'test', detail: 'd' },
        { schema: 'mining', table: 'test2', detail: 'd' },
        { schema: 'env', table: 'test3', detail: 'd' },
      ],
    });

    const narrowResult = scoreFindings([narrowFinding], schema);
    const broadResult = scoreFindings([broadFinding], schema);

    expect(broadResult.findings[0].rawScore).toBeGreaterThan(
      narrowResult.findings[0].rawScore,
    );
  });
});

// =============================================================================
// Mapper Tests
// =============================================================================
describe('mapToEngineInput', () => {
  it('produces 7 findings with correct sector suffix for mining', () => {
    const scored: ScoredFindings = {
      findings: [],
      propertyScores: new Map([[1, 0.5], [2, 0.3], [3, 0.1], [4, 0.4], [5, 0.2], [6, 0.6], [7, 0.8]]),
      totalTables: 30,
      totalRowCount: 50000,
      zeroRowDowngrade: false,
      complexityFloorApplied: false,
    };
    const schema = makeSchemaData({ tables: makeTables(30) });
    const config = makeConfig();

    const input = mapToEngineInput(scored, schema, config);
    expect(input.findings).toHaveLength(7);
    for (const f of input.findings) {
      expect(f.id).toMatch(/-M$/);
    }
  });

  it('produces correct sector suffix for environmental', () => {
    const scored: ScoredFindings = {
      findings: [],
      propertyScores: new Map([[1, 0.5], [2, 0.3], [3, 0.1], [4, 0.4], [5, 0.2], [6, 0.6], [7, 0.8]]),
      totalTables: 30,
      totalRowCount: 50000,
      zeroRowDowngrade: false,
      complexityFloorApplied: false,
    };
    const schema = makeSchemaData({ tables: makeTables(30) });
    const config = makeConfig({
      organisation: {
        name: 'Test Corp',
        sector: 'environmental',
        revenueAUD: 100_000_000,
        totalFTE: 500,
        dataEngineers: 10,
        avgSalaryAUD: 150_000,
        avgFTESalaryAUD: 100_000,
        csrdInScope: false,
      },
    });

    const input = mapToEngineInput(scored, schema, config);
    for (const f of input.findings) {
      expect(f.id).toMatch(/-E$/);
    }
  });

  it('produces correct sector suffix for energy', () => {
    const scored: ScoredFindings = {
      findings: [],
      propertyScores: new Map([[1, 0.5], [2, 0.3], [3, 0.1], [4, 0.4], [5, 0.2], [6, 0.6], [7, 0.8]]),
      totalTables: 30,
      totalRowCount: 50000,
      zeroRowDowngrade: false,
      complexityFloorApplied: false,
    };
    const schema = makeSchemaData({ tables: makeTables(30) });
    const config = makeConfig({
      organisation: {
        name: 'Test Corp',
        sector: 'energy',
        revenueAUD: 100_000_000,
        totalFTE: 500,
        dataEngineers: 10,
        avgSalaryAUD: 150_000,
        avgFTESalaryAUD: 100_000,
        csrdInScope: false,
      },
    });

    const input = mapToEngineInput(scored, schema, config);
    for (const f of input.findings) {
      expect(f.id).toMatch(/-U$/);
    }
  });

  it('maps rawScore < 0.2 to none', () => {
    const scored: ScoredFindings = {
      findings: [],
      propertyScores: new Map([[1, 0.1], [2, 0.1], [3, 0.1], [4, 0.1], [5, 0.1], [6, 0.1], [7, 0.1]]),
      totalTables: 30,
      totalRowCount: 50000,
      zeroRowDowngrade: false,
      complexityFloorApplied: false,
    };
    const schema = makeSchemaData({ tables: makeTables(30) });
    const config = makeConfig();

    const input = mapToEngineInput(scored, schema, config);
    for (const f of input.findings) {
      expect(f.severity).toBe('none');
    }
  });

  it('maps rawScore 0.2–0.6 to some', () => {
    const scored: ScoredFindings = {
      findings: [],
      propertyScores: new Map([[1, 0.4], [2, 0.4], [3, 0.4], [4, 0.4], [5, 0.4], [6, 0.4], [7, 0.4]]),
      totalTables: 30,
      totalRowCount: 50000,
      zeroRowDowngrade: false,
      complexityFloorApplied: false,
    };
    const schema = makeSchemaData({ tables: makeTables(30) });
    const config = makeConfig();

    const input = mapToEngineInput(scored, schema, config);
    for (const f of input.findings) {
      expect(f.severity).toBe('some');
    }
  });

  it('maps rawScore >= 0.6 to pervasive', () => {
    const scored: ScoredFindings = {
      findings: [],
      propertyScores: new Map([[1, 0.8], [2, 0.8], [3, 0.8], [4, 0.8], [5, 0.8], [6, 0.8], [7, 0.8]]),
      totalTables: 30,
      totalRowCount: 50000,
      zeroRowDowngrade: false,
      complexityFloorApplied: false,
    };
    const schema = makeSchemaData({ tables: makeTables(30) });
    const config = makeConfig();

    const input = mapToEngineInput(scored, schema, config);
    for (const f of input.findings) {
      expect(f.severity).toBe('pervasive');
    }
  });

  it('passes organisation fields correctly', () => {
    const scored: ScoredFindings = {
      findings: [],
      propertyScores: new Map(),
      totalTables: 30,
      totalRowCount: 50000,
      zeroRowDowngrade: false,
      complexityFloorApplied: false,
    };
    const schema = makeSchemaData({ tables: makeTables(30) });
    const config = makeConfig();

    const input = mapToEngineInput(scored, schema, config);
    expect(input.sector).toBe('mining');
    expect(input.revenueAUD).toBe(100_000_000);
    expect(input.totalFTE).toBe(500);
    expect(input.avgFTESalaryAUD).toBe(100_000);
    expect(input.dataEngineers).toBe(10);
    expect(input.avgEngineerSalaryAUD).toBe(150_000);
    expect(input.csrdInScope).toBe(false);
  });

  it('derives ad-hoc modellingApproach for high severity', () => {
    const scored: ScoredFindings = {
      findings: [],
      propertyScores: new Map([[1, 0.9], [2, 0.9], [3, 0.9], [4, 0.9], [5, 0.9], [6, 0.9], [7, 0.9]]),
      totalTables: 30,
      totalRowCount: 50000,
      zeroRowDowngrade: false,
      complexityFloorApplied: false,
    };
    const schema = makeSchemaData({ tables: makeTables(30) });
    const config = makeConfig();

    const input = mapToEngineInput(scored, schema, config);
    expect(input.modellingApproach).toBe('ad-hoc');
  });

  it('derives canonical modellingApproach for low severity', () => {
    const scored: ScoredFindings = {
      findings: [],
      propertyScores: new Map([[1, 0.05], [2, 0.05], [3, 0.05], [4, 0.05], [5, 0.05], [6, 0.05], [7, 0.05]]),
      totalTables: 30,
      totalRowCount: 50000,
      zeroRowDowngrade: false,
      complexityFloorApplied: false,
    };
    const schema = makeSchemaData({ tables: makeTables(30) });
    const config = makeConfig();

    const input = mapToEngineInput(scored, schema, config);
    expect(input.modellingApproach).toBe('canonical');
  });

  it('allows override for modellingApproach', () => {
    const scored: ScoredFindings = {
      findings: [],
      propertyScores: new Map([[1, 0.9], [2, 0.9], [3, 0.9], [4, 0.9], [5, 0.9], [6, 0.9], [7, 0.9]]),
      totalTables: 30,
      totalRowCount: 50000,
      zeroRowDowngrade: false,
      complexityFloorApplied: false,
    };
    const schema = makeSchemaData({ tables: makeTables(30) });
    const config = makeConfig();

    const input = mapToEngineInput(scored, schema, config, {
      modellingApproach: 'kimball',
    });
    expect(input.modellingApproach).toBe('kimball');
  });

  it('throws on invalid sector', () => {
    const scored: ScoredFindings = {
      findings: [],
      propertyScores: new Map(),
      totalTables: 30,
      totalRowCount: 50000,
      zeroRowDowngrade: false,
      complexityFloorApplied: false,
    };
    const schema = makeSchemaData();
    const config = makeConfig({
      organisation: {
        name: 'Test Corp',
        sector: 'invalid' as any,
        revenueAUD: 100_000_000,
        totalFTE: 500,
        dataEngineers: 10,
        avgSalaryAUD: 150_000,
        avgFTESalaryAUD: 100_000,
        csrdInScope: false,
      },
    });

    expect(() => mapToEngineInput(scored, schema, config)).toThrow(
      /Unknown sector/,
    );
  });
});
