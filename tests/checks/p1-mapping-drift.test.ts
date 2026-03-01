import { describe, it, expect } from 'vitest';
import { checkMappingDrift } from '../../src/checks/p1-mapping-drift';
import type { PipelineMapping, ColumnMapping } from '../../src/types/pipeline';

// =============================================================================
// Helper
// =============================================================================

function makePM(mappings: Partial<ColumnMapping>[]): PipelineMapping {
  return {
    sourceFormat: 'stm',
    extractedAt: new Date().toISOString(),
    mappings: mappings.map(m => ({
      sourceTable: m.sourceTable ?? 'src_table',
      sourceColumn: m.sourceColumn ?? 'col',
      targetTable: m.targetTable ?? 'tgt_table',
      targetColumn: m.targetColumn ?? 'col',
      transformType: m.transformType ?? 'identity',
      transformLogic: m.transformLogic ?? null,
      sourceType: m.sourceType ?? null,
      targetType: m.targetType ?? null,
      pipelineName: m.pipelineName ?? null,
    })),
    metadata: {},
  };
}

// =============================================================================
// P1-MAPPING-DRIFT
// =============================================================================

describe('P1-MAPPING-DRIFT — checkMappingDrift', () => {
  // ---------------------------------------------------------------------------
  // 1. Clean mappings produce no findings
  // ---------------------------------------------------------------------------
  it('returns empty for clean mappings', () => {
    const pm = makePM([
      { sourceColumn: 'id', targetColumn: 'id', transformType: 'identity', sourceType: 'integer', targetType: 'integer' },
      { sourceColumn: 'name', targetColumn: 'name', transformType: 'identity', sourceType: 'varchar', targetType: 'varchar' },
      { sourceColumn: 'created_at', targetColumn: 'created_at', transformType: 'identity', sourceType: 'timestamp', targetType: 'timestamp' },
    ]);

    const findings = checkMappingDrift(pm);

    expect(findings).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // 2. Type class changes
  // ---------------------------------------------------------------------------
  it('detects type class changes', () => {
    const pm = makePM([
      { sourceColumn: 'id', targetColumn: 'id', transformType: 'identity', sourceType: 'integer', targetType: 'varchar' },
      { sourceColumn: 'name', targetColumn: 'name', transformType: 'identity', sourceType: 'varchar', targetType: 'varchar' },
    ]);

    const findings = checkMappingDrift(pm);

    expect(findings.length).toBeGreaterThanOrEqual(1);

    const typeClassFinding = findings.find(f => f.title.includes('Type class change'));
    expect(typeClassFinding).toBeDefined();
    expect(typeClassFinding!.checkId).toBe('P1-MAPPING-DRIFT');
    expect(typeClassFinding!.category).toBe('semantic-drift');
    expect(typeClassFinding!.affectedMappings).toBe(1);
    expect(typeClassFinding!.totalMappings).toBe(2);
    expect(typeClassFinding!.ratio).toBe(0.5);
    // ratio 0.5 > 0.1 => critical
    expect(typeClassFinding!.severity).toBe('critical');
    expect(typeClassFinding!.evidence).toHaveLength(1);
    expect(typeClassFinding!.evidence[0].sourceColumn).toBe('id');
    expect(typeClassFinding!.evidence[0].detail).toContain('numeric');
    expect(typeClassFinding!.evidence[0].detail).toContain('text');
    expect(typeClassFinding!.costCategories).toEqual(expect.arrayContaining(['firefighting', 'dataQuality']));
    expect(typeClassFinding!.costWeights).toHaveProperty('firefighting');
  });

  // ---------------------------------------------------------------------------
  // 3. Hidden aggregations
  // ---------------------------------------------------------------------------
  it('detects hidden aggregations', () => {
    const pm = makePM([
      { sourceColumn: 'amount', targetColumn: 'amount', transformType: 'identity', transformLogic: 'SUM(amount)' },
      { sourceColumn: 'name', targetColumn: 'name', transformType: 'identity' },
    ]);

    const findings = checkMappingDrift(pm);

    const aggFinding = findings.find(f => f.title.includes('Hidden aggregation'));
    expect(aggFinding).toBeDefined();
    expect(aggFinding!.checkId).toBe('P1-MAPPING-DRIFT');
    expect(aggFinding!.category).toBe('semantic-drift');
    expect(aggFinding!.affectedMappings).toBe(1);
    expect(aggFinding!.totalMappings).toBe(2);
    expect(aggFinding!.ratio).toBe(0.5);
    // ratio 0.5 > 0.05 => critical
    expect(aggFinding!.severity).toBe('critical');
    expect(aggFinding!.evidence).toHaveLength(1);
    expect(aggFinding!.evidence[0].detail).toContain('SUM(amount)');
    expect(aggFinding!.costCategories.length).toBeGreaterThan(0);
    expect(aggFinding!.costWeights).toHaveProperty('dataQuality');
  });

  // ---------------------------------------------------------------------------
  // 4. Undocumented transforms
  // ---------------------------------------------------------------------------
  it('detects undocumented transforms', () => {
    const pm = makePM([
      { sourceColumn: 'status', targetColumn: 'status', transformType: 'cast', transformLogic: null },
      { sourceColumn: 'name', targetColumn: 'name', transformType: 'identity' },
      { sourceColumn: 'id', targetColumn: 'id', transformType: 'identity' },
    ]);

    const findings = checkMappingDrift(pm);

    const undocFinding = findings.find(f => f.title.includes('Undocumented transform'));
    expect(undocFinding).toBeDefined();
    expect(undocFinding!.checkId).toBe('P1-MAPPING-DRIFT');
    expect(undocFinding!.category).toBe('semantic-drift');
    expect(undocFinding!.affectedMappings).toBe(1);
    expect(undocFinding!.totalMappings).toBe(3);
    // ratio = 1/3 ~ 0.333 > 0.3 => major
    expect(undocFinding!.severity).toBe('major');
    expect(undocFinding!.evidence).toHaveLength(1);
    expect(undocFinding!.evidence[0].detail).toContain('cast');
    expect(undocFinding!.costCategories.length).toBeGreaterThan(0);
    expect(undocFinding!.costWeights).toHaveProperty('productivity');
  });

  // ---------------------------------------------------------------------------
  // 5. Alias misalignment
  // ---------------------------------------------------------------------------
  it('detects alias misalignment', () => {
    const pm = makePM([
      { sourceColumn: 'customer_id', targetColumn: 'cust_id', transformType: 'identity' },
      { sourceColumn: 'name', targetColumn: 'name', transformType: 'identity' },
      { sourceColumn: 'email', targetColumn: 'email', transformType: 'identity' },
      { sourceColumn: 'phone', targetColumn: 'phone', transformType: 'identity' },
    ]);

    const findings = checkMappingDrift(pm);

    const aliasFinding = findings.find(f => f.title.includes('Alias misalignment'));
    expect(aliasFinding).toBeDefined();
    expect(aliasFinding!.checkId).toBe('P1-MAPPING-DRIFT');
    expect(aliasFinding!.category).toBe('semantic-drift');
    expect(aliasFinding!.affectedMappings).toBe(1);
    expect(aliasFinding!.totalMappings).toBe(4);
    // ratio = 1/4 = 0.25 > 0.2 => major
    expect(aliasFinding!.severity).toBe('major');
    expect(aliasFinding!.evidence).toHaveLength(1);
    expect(aliasFinding!.evidence[0].sourceColumn).toBe('customer_id');
    expect(aliasFinding!.evidence[0].targetColumn).toBe('cust_id');
    expect(aliasFinding!.evidence[0].detail).toContain('customer_id');
    expect(aliasFinding!.evidence[0].detail).toContain('cust_id');
    expect(aliasFinding!.costCategories.length).toBeGreaterThan(0);
    expect(aliasFinding!.costWeights).toHaveProperty('integration');
  });

  // ---------------------------------------------------------------------------
  // 6. Multiple findings from mixed issues
  // ---------------------------------------------------------------------------
  it('returns multiple findings for mappings with multiple issues', () => {
    const pm = makePM([
      // Type class change: numeric -> text
      { sourceColumn: 'amount', targetColumn: 'amount', transformType: 'identity', sourceType: 'decimal', targetType: 'varchar' },
      // Hidden aggregation
      { sourceColumn: 'total', targetColumn: 'total', transformType: 'identity', transformLogic: 'COUNT(*)' },
      // Undocumented transform
      { sourceColumn: 'status', targetColumn: 'status', transformType: 'conditional', transformLogic: null },
      // Alias misalignment
      { sourceColumn: 'customer_id', targetColumn: 'cust_id', transformType: 'identity' },
      // Clean mapping (no issues)
      { sourceColumn: 'name', targetColumn: 'name', transformType: 'identity', sourceType: 'varchar', targetType: 'varchar' },
    ]);

    const findings = checkMappingDrift(pm);

    // Should have 4 distinct findings (one per sub-check)
    expect(findings).toHaveLength(4);

    // Every finding must have checkId P1-MAPPING-DRIFT
    for (const f of findings) {
      expect(f.checkId).toBe('P1-MAPPING-DRIFT');
      expect(f.category).toBe('semantic-drift');
      expect(['critical', 'major', 'minor', 'info']).toContain(f.severity);
      expect(f.evidence.length).toBeGreaterThan(0);
      expect(f.costCategories.length).toBeGreaterThan(0);
      expect(f.costWeights).toBeDefined();
      expect(f.totalMappings).toBe(5);
    }

    // Verify each sub-check produced exactly one finding
    const titles = findings.map(f => f.title);
    expect(titles.some(t => t.includes('Type class change'))).toBe(true);
    expect(titles.some(t => t.includes('Hidden aggregation'))).toBe(true);
    expect(titles.some(t => t.includes('Undocumented transform'))).toBe(true);
    expect(titles.some(t => t.includes('Alias misalignment'))).toBe(true);
  });
});
