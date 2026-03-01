import { describe, it, expect } from 'vitest';
import { checkLineageGaps } from '../../src/checks/p4-lineage-gaps';
import type { PipelineMapping, ColumnMapping } from '../../src/types/pipeline';
import type { SchemaData } from '../../src/adapters/types';

// =============================================================================
// Helpers
// =============================================================================

function makePM(mappings: Partial<ColumnMapping>[]): PipelineMapping {
  return {
    sourceFormat: 'stm',
    extractedAt: new Date().toISOString(),
    mappings: mappings.map(m => ({
      sourceTable: m.sourceTable ?? 'src',
      sourceColumn: m.sourceColumn ?? 'col',
      targetTable: m.targetTable ?? 'tgt',
      targetColumn: m.targetColumn ?? 'col',
      transformType: m.transformType ?? 'identity',
      transformLogic: null,
      sourceType: null,
      targetType: null,
      pipelineName: null,
    })),
    metadata: {},
  };
}

function makeSD(tables: { name: string; columns: string[] }[]): SchemaData {
  const tableInfos = tables.map(t => ({
    schema: 'public',
    name: t.name,
    type: 'table' as const,
    rowCount: null,
    sizeBytes: null,
    createdAt: null,
    lastModified: null,
    comment: null,
  }));
  const columnInfos = tables.flatMap((t) =>
    t.columns.map((c, ci) => ({
      schema: 'public',
      table: t.name,
      name: c,
      ordinalPosition: ci + 1,
      dataType: 'text',
      normalizedType: 'text' as const,
      isNullable: true,
      hasDefault: false,
      defaultValue: null,
      maxLength: null,
      numericPrecision: null,
      numericScale: null,
      comment: null,
    })),
  );
  return {
    databaseType: 'postgresql',
    databaseVersion: '15.0',
    extractedAt: new Date().toISOString(),
    tables: tableInfos,
    columns: columnInfos,
    foreignKeys: [],
    constraints: [],
    indexes: [],
    tableStatistics: [],
    columnStatistics: [],
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('P4-LINEAGE-GAPS', () => {
  // ---------------------------------------------------------------------------
  // 1. Returns empty when no SchemaData provided
  // ---------------------------------------------------------------------------
  it('returns empty when no SchemaData provided', () => {
    const pm = makePM([
      { targetTable: 'orders', targetColumn: 'id' },
      { targetTable: 'orders', targetColumn: 'amount' },
    ]);

    // null
    expect(checkLineageGaps(pm, null)).toEqual([]);
    // undefined (omitted)
    expect(checkLineageGaps(pm)).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // 2. Returns empty when schema tables are empty
  // ---------------------------------------------------------------------------
  it('returns empty when schema tables are empty', () => {
    const pm = makePM([
      { targetTable: 'orders', targetColumn: 'id' },
    ]);
    const sd = makeSD([]); // no tables, no columns

    const findings = checkLineageGaps(pm, sd);
    expect(findings).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // 3. Detects low coverage ratio (critical)
  // ---------------------------------------------------------------------------
  it('detects low coverage ratio', () => {
    // Schema has 10 columns across one table
    const sd = makeSD([
      {
        name: 'orders',
        columns: ['id', 'amount', 'status', 'customer_id', 'created_at',
                  'updated_at', 'region', 'currency', 'tax', 'total'],
      },
    ]);

    // Pipeline only maps 2 of the 10 columns -> 20% coverage -> critical
    const pm = makePM([
      { targetTable: 'orders', targetColumn: 'id' },
      { targetTable: 'orders', targetColumn: 'amount' },
    ]);

    const findings = checkLineageGaps(pm, sd);

    // Should have at least a coverage finding
    const coverageFinding = findings.find(f => f.title.includes('coverage'));
    expect(coverageFinding).toBeDefined();
    expect(coverageFinding!.checkId).toBe('P4-LINEAGE-GAPS');
    expect(coverageFinding!.category).toBe('ontological-break');
    // 20% coverage is < 30% -> critical
    expect(coverageFinding!.severity).toBe('critical');
  });

  // ---------------------------------------------------------------------------
  // 4. Detects orphan columns
  // ---------------------------------------------------------------------------
  it('detects orphan columns', () => {
    // Schema table has columns A, B, C
    const sd = makeSD([
      { name: 'users', columns: ['a', 'b', 'c'] },
    ]);

    // Pipeline targets columns A and B in table 'users', but not C
    const pm = makePM([
      { targetTable: 'users', targetColumn: 'a' },
      { targetTable: 'users', targetColumn: 'b' },
    ]);

    const findings = checkLineageGaps(pm, sd);

    // Should have an orphan finding
    const orphanFinding = findings.find(f => f.title.includes('orphan'));
    expect(orphanFinding).toBeDefined();
    expect(orphanFinding!.checkId).toBe('P4-LINEAGE-GAPS');
    expect(orphanFinding!.category).toBe('ontological-break');
    // 1 orphan <= 5 -> info severity
    expect(orphanFinding!.severity).toBe('info');
    // Evidence should contain the orphan column 'c'
    expect(orphanFinding!.evidence.length).toBe(1);
    expect(orphanFinding!.evidence[0].targetColumn).toBe('c');
    expect(orphanFinding!.evidence[0].detail).toContain('orphan');
  });

  // ---------------------------------------------------------------------------
  // 5. Detects phantom targets
  // ---------------------------------------------------------------------------
  it('detects phantom targets', () => {
    // Schema has table 'products' with columns 'id' and 'name'
    const sd = makeSD([
      { name: 'products', columns: ['id', 'name'] },
    ]);

    // Pipeline maps to column 'x' in table 'products', which doesn't exist in schema
    const pm = makePM([
      { targetTable: 'products', targetColumn: 'id' },
      { targetTable: 'products', targetColumn: 'name' },
      { targetTable: 'products', targetColumn: 'x' },
    ]);

    const findings = checkLineageGaps(pm, sd);

    // Should have a phantom finding
    const phantomFinding = findings.find(f => f.title.includes('phantom'));
    expect(phantomFinding).toBeDefined();
    expect(phantomFinding!.checkId).toBe('P4-LINEAGE-GAPS');
    expect(phantomFinding!.category).toBe('ontological-break');
    // 1 phantom <= 3 -> info severity
    expect(phantomFinding!.severity).toBe('info');
    // Evidence should reference the phantom column 'x'
    expect(phantomFinding!.evidence.length).toBe(1);
    expect(phantomFinding!.evidence[0].targetColumn).toBe('x');
    expect(phantomFinding!.evidence[0].detail).toContain('not found in schema');
  });

  // ---------------------------------------------------------------------------
  // 6. No findings when fully covered
  // ---------------------------------------------------------------------------
  it('no findings when fully covered', () => {
    // Schema has 3 columns
    const sd = makeSD([
      { name: 'accounts', columns: ['id', 'email', 'name'] },
    ]);

    // Pipeline maps all 3 columns exactly
    const pm = makePM([
      { targetTable: 'accounts', targetColumn: 'id' },
      { targetTable: 'accounts', targetColumn: 'email' },
      { targetTable: 'accounts', targetColumn: 'name' },
    ]);

    const findings = checkLineageGaps(pm, sd);

    // 100% coverage -> no coverage finding
    // All columns mapped -> no orphans
    // All targets exist -> no phantoms
    expect(findings).toEqual([]);
  });
});
