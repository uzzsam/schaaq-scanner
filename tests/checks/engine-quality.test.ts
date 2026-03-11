/**
 * Engine quality verification tests
 * Validates the three specialist-review fixes work together:
 *   1. CSV null handling — optional fields not penalised
 *   2. Strengths — positive observations alongside findings
 *   3. Database-type-specific remediation — contextual messaging
 */
import { describe, it, expect } from 'vitest';
import { createMockSchema } from '../../src/mock/schema-factory';
import { ALL_CHECKS, computeStrengths } from '../../src/checks/index';
import { scoreFindings } from '../../src/scoring/severity-scorer';
import { getDbContext } from '../../src/checks/db-context';
import type { SchemaData } from '../../src/adapters/types';
import type { ScannerConfig, Finding } from '../../src/checks/types';

const defaultConfig: ScannerConfig = {
  companyName: 'Test Corp',
  annualRevenue: 500_000_000,
  aiBudget: 2_500_000,
  sector: 'mining',
  sourceSystemCount: 5,
  thresholds: { nullRateThreshold: 0.3, wideTableThreshold: 30, csvIndicatorPatterns: [] },
};

function runAllChecks(schema: SchemaData, config: ScannerConfig = defaultConfig): Finding[] {
  const findings: Finding[] = [];
  for (const check of ALL_CHECKS) {
    findings.push(...check.execute(schema, config));
  }
  return findings;
}

// =============================================================================
// 1. Database-type-specific remediation
// =============================================================================
describe('Database-type-specific remediation', () => {
  describe('PostgreSQL dry-run', () => {
    const schema = createMockSchema();
    const ctx = getDbContext(schema);
    const findings = runAllChecks(schema);

    it('mock schema is PostgreSQL', () => {
      expect(schema.databaseType).toBe('postgresql');
      expect(ctx.label).toBe('PostgreSQL');
      expect(ctx.engine).toBe('PostgreSQL');
    });

    const pgCheckIds = [
      'P2-TYPE-INCONSISTENCY',
      'P4-ISLAND-TABLES',
      'P4-WIDE-TABLES',
      'p5-naming-violations',
      'p5-missing-pk',
      'p5-undocumented',
      'p6-high-null-rate',
      'p6-no-indexes',
      'p7-missing-audit',
      'p7-no-constraints',
    ];

    for (const checkId of pgCheckIds) {
      it(`${checkId} has PostgreSQL-specific remediation`, () => {
        const finding = findings.find(f => f.checkId === checkId);
        if (!finding) return; // check may not fire on mock data
        const hasPgText =
          finding.remediation.includes('PostgreSQL') ||
          finding.remediation.includes('ALTER TABLE') ||
          finding.remediation.includes('BIGSERIAL') ||
          finding.remediation.includes('COMMENT ON') ||
          finding.remediation.includes('pg_stat') ||
          finding.remediation.includes('CONCURRENTLY') ||
          finding.remediation.includes('DOMAIN') ||
          finding.remediation.includes('TIMESTAMPTZ') ||
          finding.remediation.includes('trigger');
        expect(hasPgText).toBe(true);
      });
    }

    const genericCheckIds = ['P1-SEMANTIC-IDENTITY', 'P2-UNCONTROLLED-VOCAB', 'P3-DOMAIN-OVERLAP', 'P3-CROSS-SCHEMA-COUPLING'];

    for (const checkId of genericCheckIds) {
      it(`${checkId} keeps generic remediation (no engine name)`, () => {
        const finding = findings.find(f => f.checkId === checkId);
        if (!finding) return;
        expect(finding.remediation).not.toContain('PostgreSQL');
        expect(finding.remediation).not.toContain('MySQL');
        expect(finding.remediation).not.toContain('SQL Server');
      });
    }
  });

  describe('MySQL context', () => {
    it('returns MySQL-specific strings', () => {
      const ctx = getDbContext({ databaseType: 'mysql' } as SchemaData);
      expect(ctx.label).toBe('MySQL');
      expect(ctx.remediation.missingPk).toContain('AUTO_INCREMENT');
      expect(ctx.remediation.missingAudit).toContain('ON UPDATE CURRENT_TIMESTAMP');
    });
  });

  describe('SQL Server context', () => {
    it('returns SQL Server-specific strings', () => {
      const ctx = getDbContext({ databaseType: 'mssql' } as SchemaData);
      expect(ctx.label).toBe('SQL Server');
      expect(ctx.remediation.missingPk).toContain('IDENTITY');
      expect(ctx.remediation.undocumented).toContain('sp_addextendedproperty');
    });
  });

  describe('CSV context', () => {
    it('returns CSV-appropriate strings', () => {
      const ctx = getDbContext({ databaseType: 'csv' } as SchemaData);
      expect(ctx.label).toBe('CSV / Excel');
      expect(ctx.remediation.missingPk).toContain('ID');
      expect(ctx.remediation.noIndexes).toContain('does not apply');
    });
  });

  describe('generic fallback', () => {
    it('returns generic strings for unknown db types', () => {
      const ctx = getDbContext({ databaseType: 'powerbi' } as SchemaData);
      expect(ctx.label).toBe('Database');
      expect(ctx.remediation.missingPk).not.toContain('PostgreSQL');
      expect(ctx.remediation.missingPk).not.toContain('MySQL');
    });
  });
});

// =============================================================================
// 2. Strengths alongside findings
// =============================================================================
describe('Strengths computed alongside findings', () => {
  const schema = createMockSchema();
  const findings = runAllChecks(schema);
  const scored = scoreFindings(findings, schema);
  const strengths = computeStrengths(schema, defaultConfig, scored.findings);

  it('produces strengths from mock data', () => {
    expect(strengths.length).toBeGreaterThan(0);
  });

  it('all strengths have valid property numbers (1-8)', () => {
    for (const s of strengths) {
      expect(s.property).toBeGreaterThanOrEqual(1);
      expect(s.property).toBeLessThanOrEqual(8);
    }
  });

  it('all strengths have non-empty titles and descriptions', () => {
    for (const s of strengths) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.description.length).toBeGreaterThan(0);
    }
  });

  it('strengths have valid checkId references', () => {
    for (const s of strengths) {
      expect(s.checkId.length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// 3. CSV null handling — optional fields
// =============================================================================
describe('CSV null handling — optional fields not penalised', () => {
  const csvSchema: SchemaData = {
    databaseType: 'csv',
    databaseVersion: 'CSV Upload',
    tables: [{ schema: 'csv', name: 'contacts', type: 'table' as const }],
    columns: [
      { schema: 'csv', table: 'contacts', name: 'id', dataType: 'integer', normalizedType: 'integer', nullable: false, ordinalPosition: 1 },
      { schema: 'csv', table: 'contacts', name: 'name', dataType: 'text', normalizedType: 'text', nullable: false, ordinalPosition: 2 },
      { schema: 'csv', table: 'contacts', name: 'email', dataType: 'text', normalizedType: 'text', nullable: false, ordinalPosition: 3 },
      { schema: 'csv', table: 'contacts', name: 'phone', dataType: 'text', normalizedType: 'text', nullable: true, ordinalPosition: 4 },
      { schema: 'csv', table: 'contacts', name: 'fax', dataType: 'text', normalizedType: 'text', nullable: true, ordinalPosition: 5 },
      { schema: 'csv', table: 'contacts', name: 'secondary_email', dataType: 'text', normalizedType: 'text', nullable: true, ordinalPosition: 6 },
      { schema: 'csv', table: 'contacts', name: 'notes', dataType: 'text', normalizedType: 'text', nullable: true, ordinalPosition: 7 },
    ],
    constraints: [],
    indexes: [],
    foreignKeys: [],
    tableStatistics: [{ schema: 'csv', table: 'contacts', rowCount: 5 }],
    columnStatistics: [
      { schema: 'csv', table: 'contacts', column: 'id', nullFraction: 0.0, distinctCount: 5, avgWidth: 4 },
      { schema: 'csv', table: 'contacts', column: 'name', nullFraction: 0.0, distinctCount: 5, avgWidth: 10 },
      { schema: 'csv', table: 'contacts', column: 'email', nullFraction: 0.0, distinctCount: 5, avgWidth: 15 },
      { schema: 'csv', table: 'contacts', column: 'phone', nullFraction: 0.4, distinctCount: 3, avgWidth: 12 },
      { schema: 'csv', table: 'contacts', column: 'fax', nullFraction: 0.8, distinctCount: 1, avgWidth: 12 },
      { schema: 'csv', table: 'contacts', column: 'secondary_email', nullFraction: 1.0, distinctCount: 0, avgWidth: 0 },
      { schema: 'csv', table: 'contacts', column: 'notes', nullFraction: 0.6, distinctCount: 2, avgWidth: 20 },
    ],
    comments: [],
  };

  // Config without explicit nullRateThreshold so CSV default (0.7) applies
  const csvConfig: ScannerConfig = {
    ...defaultConfig,
    thresholds: { ...defaultConfig.thresholds, nullRateThreshold: undefined as any },
  };

  const findings = runAllChecks(csvSchema, csvConfig);

  it('p4CsvImportPattern is skipped for CSV sources', () => {
    expect(findings.find(f => f.checkId === 'P4-CSV-IMPORT-PATTERN')).toBeUndefined();
  });

  it('p6NoIndexes is skipped for CSV sources', () => {
    expect(findings.find(f => f.checkId === 'p6-no-indexes')).toBeUndefined();
  });

  it('p7NoConstraints is skipped for CSV sources', () => {
    expect(findings.find(f => f.checkId === 'p7-no-constraints')).toBeUndefined();
  });

  it('high null finding is not critical for CSV', () => {
    const f = findings.find(f => f.checkId === 'p6-high-null-rate');
    if (f) {
      expect(f.severity).not.toBe('critical');
    }
  });

  it('secondary_email (100% null) is NOT flagged — >=95% filtered for CSV', () => {
    const f = findings.find(f => f.checkId === 'p6-high-null-rate');
    if (f) {
      const evidence = f.evidence?.find((e: any) => e.column === 'secondary_email');
      expect(evidence).toBeUndefined();
    }
  });

  it('notes (60% null) is NOT flagged — below 70% CSV threshold', () => {
    const f = findings.find(f => f.checkId === 'p6-high-null-rate');
    if (f) {
      const evidence = f.evidence?.find((e: any) => e.column === 'notes');
      expect(evidence).toBeUndefined();
    }
  });

  it('missing PK severity is downgraded for CSV', () => {
    const f = findings.find(f => f.checkId === 'p5-missing-pk');
    if (f) {
      expect(f.severity).not.toBe('critical');
    }
  });

  it('missing PK remediation is CSV-appropriate', () => {
    const f = findings.find(f => f.checkId === 'p5-missing-pk');
    if (f) {
      const hasCsvText = f.remediation.includes('ID') || f.remediation.includes('CSV') || f.remediation.includes('key column');
      expect(hasCsvText).toBe(true);
    }
  });

  it('high null remediation is CSV-appropriate', () => {
    const f = findings.find(f => f.checkId === 'p6-high-null-rate');
    if (f) {
      const hasCsvText = f.remediation.includes('CSV') || f.remediation.includes('blank') || f.remediation.includes('optional') || f.remediation.includes('template');
      expect(hasCsvText).toBe(true);
    }
  });
});
