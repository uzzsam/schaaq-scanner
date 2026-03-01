// =============================================================================
// P1-MAPPING-DRIFT — Detect semantic alterations in pipeline mappings
// =============================================================================
//
// Checks for:
//   1. Type class changes (source type → target type mismatch)     — score 0.9
//   2. Hidden aggregations (undeclared AGG in identity/rename)     — score 0.8
//   3. Undocumented transforms (non-identity with no logic)        — score 0.6
//   4. Alias misalignment (column rename without documentation)    — score 0.5
//
// This check operates on PipelineMapping alone (no SchemaData required).
// =============================================================================

import type { PipelineMapping, ColumnMapping } from '../types/pipeline';

export interface PipelineFinding {
  checkId: string;
  category: 'semantic-drift' | 'ontological-break';
  severity: 'critical' | 'major' | 'minor' | 'info';
  title: string;
  description: string;
  affectedMappings: number;
  totalMappings: number;
  ratio: number;
  remediation: string;
  evidence: PipelineEvidence[];
  costCategories: string[];
  costWeights: Record<string, number>;
}

export interface PipelineEvidence {
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  detail: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Type class groupings for detecting semantic drift
// ---------------------------------------------------------------------------

type TypeClass = 'numeric' | 'text' | 'temporal' | 'boolean' | 'binary' | 'other';

function classifyType(typeStr: string): TypeClass {
  const t = typeStr.toLowerCase().trim();

  // Numeric
  if (/\b(int|integer|bigint|smallint|tinyint|decimal|numeric|float|double|real|number|money)\b/.test(t)) {
    return 'numeric';
  }
  // Text
  if (/\b(varchar|char|text|string|nvarchar|nchar|clob|ntext)\b/.test(t)) {
    return 'text';
  }
  // Temporal
  if (/\b(date|time|timestamp|datetime|interval)\b/.test(t)) {
    return 'temporal';
  }
  // Boolean
  if (/\b(bool|boolean|bit)\b/.test(t)) {
    return 'boolean';
  }
  // Binary
  if (/\b(binary|blob|varbinary|bytea|image)\b/.test(t)) {
    return 'binary';
  }

  return 'other';
}

// ---------------------------------------------------------------------------
// Aggregation detection in logic text
// ---------------------------------------------------------------------------

const AGG_INDICATORS = [
  /\bSUM\s*\(/i, /\bCOUNT\s*\(/i, /\bAVG\s*\(/i,
  /\bMIN\s*\(/i, /\bMAX\s*\(/i, /\bGROUP\s+BY\b/i,
  /\bCOUNT_DISTINCT\s*\(/i, /\bSTDDEV\s*\(/i,
];

function hasHiddenAggregation(mapping: ColumnMapping): boolean {
  if (mapping.transformType === 'aggregate') return false; // already declared
  if (!mapping.transformLogic) return false;
  return AGG_INDICATORS.some(r => r.test(mapping.transformLogic!));
}

// ---------------------------------------------------------------------------
// Check implementation
// ---------------------------------------------------------------------------

const COST_WEIGHTS = {
  firefighting: 0.3,
  dataQuality: 0.3,
  integration: 0.2,
  productivity: 0.2,
  regulatory: 0,
};

const COST_CATEGORIES = ['firefighting', 'dataQuality', 'integration', 'productivity'];

/**
 * Execute the P1-MAPPING-DRIFT check against a PipelineMapping.
 * Returns an array of pipeline findings.
 */
export function checkMappingDrift(pm: PipelineMapping): PipelineFinding[] {
  const findings: PipelineFinding[] = [];
  const total = pm.mappings.length;
  if (total === 0) return findings;

  // 1. Type class changes (score 0.9)
  const typeClassChanges: PipelineEvidence[] = [];
  for (const m of pm.mappings) {
    if (m.sourceType && m.targetType) {
      const srcClass = classifyType(m.sourceType);
      const tgtClass = classifyType(m.targetType);
      if (srcClass !== 'other' && tgtClass !== 'other' && srcClass !== tgtClass) {
        typeClassChanges.push({
          sourceTable: m.sourceTable,
          sourceColumn: m.sourceColumn,
          targetTable: m.targetTable,
          targetColumn: m.targetColumn,
          detail: `Type class change: ${m.sourceType} (${srcClass}) → ${m.targetType} (${tgtClass})`,
          metadata: { sourceType: m.sourceType, targetType: m.targetType, sourceClass: srcClass, targetClass: tgtClass },
        });
      }
    }
  }

  if (typeClassChanges.length > 0) {
    const ratio = typeClassChanges.length / total;
    findings.push({
      checkId: 'P1-MAPPING-DRIFT',
      category: 'semantic-drift',
      severity: ratio > 0.1 ? 'critical' : ratio > 0.05 ? 'major' : 'minor',
      title: `Type class changes detected in ${typeClassChanges.length} mapping(s)`,
      description:
        `${typeClassChanges.length} of ${total} column mappings change the fundamental data type class ` +
        `(e.g. numeric → text, temporal → text). This can cause silent data corruption and loss of precision.`,
      affectedMappings: typeClassChanges.length,
      totalMappings: total,
      ratio,
      remediation:
        'Review each type class change and either add explicit CAST/CONVERT logic with validation, ' +
        'or correct the source/target types to maintain type safety.',
      evidence: typeClassChanges,
      costCategories: COST_CATEGORIES,
      costWeights: { ...COST_WEIGHTS },
    });
  }

  // 2. Hidden aggregations (score 0.8)
  const hiddenAggs: PipelineEvidence[] = [];
  for (const m of pm.mappings) {
    if (hasHiddenAggregation(m)) {
      hiddenAggs.push({
        sourceTable: m.sourceTable,
        sourceColumn: m.sourceColumn,
        targetTable: m.targetTable,
        targetColumn: m.targetColumn,
        detail: `Mapping classified as '${m.transformType}' but logic contains aggregation: ${(m.transformLogic ?? '').slice(0, 80)}`,
        metadata: { declaredType: m.transformType, logic: m.transformLogic },
      });
    }
  }

  if (hiddenAggs.length > 0) {
    const ratio = hiddenAggs.length / total;
    findings.push({
      checkId: 'P1-MAPPING-DRIFT',
      category: 'semantic-drift',
      severity: ratio > 0.05 ? 'critical' : 'major',
      title: `Hidden aggregations in ${hiddenAggs.length} mapping(s)`,
      description:
        `${hiddenAggs.length} mappings contain aggregation functions (SUM, COUNT, AVG, etc.) in their transform logic ` +
        `but are not classified as aggregations. This hides grain changes and can lead to incorrect downstream analysis.`,
      affectedMappings: hiddenAggs.length,
      totalMappings: total,
      ratio,
      remediation:
        'Reclassify these mappings as aggregations and document the grain change explicitly. ' +
        'Ensure downstream consumers are aware of the aggregation level.',
      evidence: hiddenAggs,
      costCategories: COST_CATEGORIES,
      costWeights: { ...COST_WEIGHTS },
    });
  }

  // 3. Undocumented transforms (score 0.6)
  const undocumented: PipelineEvidence[] = [];
  for (const m of pm.mappings) {
    if (m.transformType !== 'identity' && m.transformType !== 'rename' && !m.transformLogic) {
      undocumented.push({
        sourceTable: m.sourceTable,
        sourceColumn: m.sourceColumn,
        targetTable: m.targetTable,
        targetColumn: m.targetColumn,
        detail: `Transform type '${m.transformType}' has no documented logic/expression`,
        metadata: { transformType: m.transformType },
      });
    }
  }

  if (undocumented.length > 0) {
    const ratio = undocumented.length / total;
    findings.push({
      checkId: 'P1-MAPPING-DRIFT',
      category: 'semantic-drift',
      severity: ratio > 0.3 ? 'major' : ratio > 0.1 ? 'minor' : 'info',
      title: `Undocumented transforms in ${undocumented.length} mapping(s)`,
      description:
        `${undocumented.length} mappings have a non-trivial transform type but no transform logic or expression documented. ` +
        `This makes the pipeline opaque and increases debugging and maintenance costs.`,
      affectedMappings: undocumented.length,
      totalMappings: total,
      ratio,
      remediation:
        'Add transform expressions or business rule descriptions to each mapping. ' +
        'Even simple descriptions like "UPPER(source_col)" help future maintainers.',
      evidence: undocumented,
      costCategories: COST_CATEGORIES,
      costWeights: { ...COST_WEIGHTS },
    });
  }

  // 4. Alias misalignment (score 0.5)
  const aliasMisaligned: PipelineEvidence[] = [];
  for (const m of pm.mappings) {
    if (m.transformType === 'identity' &&
        m.sourceColumn.toLowerCase() !== m.targetColumn.toLowerCase()) {
      aliasMisaligned.push({
        sourceTable: m.sourceTable,
        sourceColumn: m.sourceColumn,
        targetTable: m.targetTable,
        targetColumn: m.targetColumn,
        detail: `Column renamed from '${m.sourceColumn}' to '${m.targetColumn}' but classified as identity`,
        metadata: {},
      });
    }
  }

  if (aliasMisaligned.length > 0) {
    const ratio = aliasMisaligned.length / total;
    findings.push({
      checkId: 'P1-MAPPING-DRIFT',
      category: 'semantic-drift',
      severity: ratio > 0.2 ? 'major' : ratio > 0.1 ? 'minor' : 'info',
      title: `Alias misalignment in ${aliasMisaligned.length} mapping(s)`,
      description:
        `${aliasMisaligned.length} mappings are classified as 'identity' but the source and target column names differ. ` +
        `These should be reclassified as 'rename' transforms for accurate lineage tracking.`,
      affectedMappings: aliasMisaligned.length,
      totalMappings: total,
      ratio,
      remediation:
        'Reclassify these mappings as "rename" transforms and document the reason for the name change. ' +
        'Consistent naming improves data discoverability across pipeline stages.',
      evidence: aliasMisaligned,
      costCategories: COST_CATEGORIES,
      costWeights: { ...COST_WEIGHTS },
    });
  }

  return findings;
}
