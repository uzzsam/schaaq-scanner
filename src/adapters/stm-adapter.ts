// =============================================================================
// STM Adapter — Parse Source-to-Target Mapping CSV files into PipelineMapping
// =============================================================================

import Papa from 'papaparse';
import type { PipelineMapping, ColumnMapping, TransformType } from '../types/pipeline';

// ---------------------------------------------------------------------------
// Header aliases — fuzzy matching for common STM column header variations
// ---------------------------------------------------------------------------

const HEADER_ALIASES: Record<string, string[]> = {
  sourceTable: [
    'source_table', 'source table', 'sourcetable', 'src_table', 'src table',
    'source_entity', 'source entity', 'from_table', 'from table', 'source object',
    'source_object',
  ],
  sourceColumn: [
    'source_column', 'source column', 'sourcecolumn', 'src_column', 'src column',
    'source_field', 'source field', 'from_column', 'from column', 'source_attribute',
    'source attribute',
  ],
  targetTable: [
    'target_table', 'target table', 'targettable', 'tgt_table', 'tgt table',
    'dest_table', 'dest table', 'destination_table', 'destination table',
    'to_table', 'to table', 'target_entity', 'target entity', 'target object',
    'target_object',
  ],
  targetColumn: [
    'target_column', 'target column', 'targetcolumn', 'tgt_column', 'tgt column',
    'dest_column', 'dest column', 'destination_column', 'destination column',
    'to_column', 'to column', 'target_field', 'target field', 'target_attribute',
    'target attribute',
  ],
  transformLogic: [
    'transform_logic', 'transform logic', 'transformation', 'transform_rule',
    'transform rule', 'transformation_rule', 'transformation rule', 'logic',
    'mapping_rule', 'mapping rule', 'expression', 'sql', 'formula', 'rule',
    'business_rule', 'business rule', 'etl_logic', 'etl logic',
  ],
  sourceType: [
    'source_type', 'source type', 'source_datatype', 'source datatype',
    'source_data_type', 'source data type', 'src_type', 'src type',
    'from_type', 'from type',
  ],
  targetType: [
    'target_type', 'target type', 'target_datatype', 'target datatype',
    'target_data_type', 'target data type', 'tgt_type', 'tgt type',
    'dest_type', 'dest type', 'to_type', 'to type',
  ],
  pipelineName: [
    'pipeline', 'pipeline_name', 'pipeline name', 'job', 'job_name', 'job name',
    'process', 'process_name', 'process name', 'flow', 'flow_name', 'flow name',
    'etl_name', 'etl name', 'mapping_name', 'mapping name',
  ],
};

// ---------------------------------------------------------------------------
// Transform classification from logic text (regex-based, no SQL AST)
// ---------------------------------------------------------------------------

const AGGREGATE_PATTERNS = [
  /\bSUM\s*\(/i, /\bCOUNT\s*\(/i, /\bAVG\s*\(/i, /\bMIN\s*\(/i,
  /\bMAX\s*\(/i, /\bCOUNT_DISTINCT\s*\(/i, /\bGROUP\s+BY\b/i,
  /\bSTDDEV\s*\(/i, /\bVARIANCE\s*\(/i, /\bMEDIAN\s*\(/i,
];

const CONDITIONAL_PATTERNS = [
  /\bCASE\b/i, /\bWHEN\b/i, /\bIF\s*\(/i, /\bIIF\s*\(/i,
  /\bCOALESCE\s*\(/i, /\bNULLIF\s*\(/i, /\bNVL\s*\(/i,
  /\bDECODE\s*\(/i,
];

const CAST_PATTERNS = [
  /\bCAST\s*\(/i, /\bCONVERT\s*\(/i, /::[\w]+/,
  /\bTO_DATE\s*\(/i, /\bTO_NUMBER\s*\(/i, /\bTO_CHAR\s*\(/i,
  /\bTO_TIMESTAMP\s*\(/i, /\bTRY_CAST\s*\(/i,
];

const DERIVE_PATTERNS = [
  /\bCONCAT\s*\(/i, /\|\|/, /\+\s*\w/, /\*\s*\w/, /\/\s*\w/,
  /\bSUBSTRING\s*\(/i, /\bTRIM\s*\(/i, /\bREPLACE\s*\(/i,
  /\bUPPER\s*\(/i, /\bLOWER\s*\(/i, /\bLEFT\s*\(/i, /\bRIGHT\s*\(/i,
  /\bLEN\s*\(/i, /\bLENGTH\s*\(/i, /\bROUND\s*\(/i, /\bFLOOR\s*\(/i,
  /\bCEIL\s*\(/i, /\bABS\s*\(/i, /\bDATEDIFF\s*\(/i, /\bDATEADD\s*\(/i,
];

/**
 * Classify a transform type from the raw logic/expression string.
 */
export function classifyTransformFromLogic(
  logic: string | null | undefined,
  sourceCol: string,
  targetCol: string,
  sourceType: string | null | undefined,
  targetType: string | null | undefined,
): TransformType {
  // No logic provided
  if (!logic || logic.trim().length === 0) {
    // Check for type change
    if (sourceType && targetType && sourceType.toLowerCase() !== targetType.toLowerCase()) {
      return 'cast';
    }
    // Check for rename
    if (sourceCol.toLowerCase() !== targetCol.toLowerCase()) {
      return 'rename';
    }
    return 'identity';
  }

  const trimmed = logic.trim();

  // Direct pass-through markers
  const directPassMarkers = [
    'direct', 'pass-through', 'passthrough', 'pass through', 'as-is',
    'no change', 'no transformation', '1:1', 'identity',
  ];
  if (directPassMarkers.some(m => trimmed.toLowerCase() === m)) {
    if (sourceCol.toLowerCase() !== targetCol.toLowerCase()) {
      return 'rename';
    }
    return 'identity';
  }

  // Check aggregate first (highest complexity)
  if (AGGREGATE_PATTERNS.some(p => p.test(trimmed))) return 'aggregate';
  // Check conditional
  if (CONDITIONAL_PATTERNS.some(p => p.test(trimmed))) return 'conditional';
  // Check cast
  if (CAST_PATTERNS.some(p => p.test(trimmed))) return 'cast';
  // Check derive (string manipulation, arithmetic, etc.)
  if (DERIVE_PATTERNS.some(p => p.test(trimmed))) return 'derive';

  // If logic exists but doesn't match known patterns
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface StmFile {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
}

export interface StmParseResult {
  pipelineMapping: PipelineMapping;
  fileCount: number;
  totalMappings: number;
  warnings: string[];
}

/**
 * Build a header map from actual CSV headers to canonical field names.
 * Returns null for required fields that can't be matched.
 */
function buildHeaderMap(headers: string[]): Map<string, string> | null {
  const map = new Map<string, string>();
  const normalised = headers.map(h => h.trim().toLowerCase());

  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    for (let i = 0; i < normalised.length; i++) {
      if (aliases.includes(normalised[i])) {
        map.set(canonical, headers[i].trim());
        break;
      }
    }
  }

  // sourceTable, sourceColumn, targetTable, targetColumn are required
  const required = ['sourceTable', 'sourceColumn', 'targetTable', 'targetColumn'];
  for (const r of required) {
    if (!map.has(r)) return null;
  }

  return map;
}

/**
 * Parse one or more STM CSV files into a PipelineMapping.
 */
export async function parseStmFiles(files: StmFile[]): Promise<StmParseResult> {
  const allMappings: ColumnMapping[] = [];
  const warnings: string[] = [];
  let validFiles = 0;

  for (const file of files) {
    const content = file.buffer.toString('utf-8');
    const parsed = Papa.parse(content, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim(),
    });

    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      warnings.push(`${file.originalname}: Failed to parse CSV`);
      continue;
    }

    const headers = parsed.meta.fields ?? [];
    if (headers.length === 0) {
      warnings.push(`${file.originalname}: No headers found`);
      continue;
    }

    const headerMap = buildHeaderMap(headers);
    if (!headerMap) {
      warnings.push(
        `${file.originalname}: Could not find required headers (source_table, source_column, target_table, target_column)`,
      );
      continue;
    }

    validFiles++;

    for (const row of parsed.data as Record<string, string>[]) {
      const sourceTable = (row[headerMap.get('sourceTable')!] ?? '').trim();
      const sourceColumn = (row[headerMap.get('sourceColumn')!] ?? '').trim();
      const targetTable = (row[headerMap.get('targetTable')!] ?? '').trim();
      const targetColumn = (row[headerMap.get('targetColumn')!] ?? '').trim();

      // Skip rows where required fields are empty
      if (!sourceTable || !sourceColumn || !targetTable || !targetColumn) continue;

      const logic = headerMap.has('transformLogic')
        ? (row[headerMap.get('transformLogic')!] ?? '').trim() || null
        : null;

      const srcType = headerMap.has('sourceType')
        ? (row[headerMap.get('sourceType')!] ?? '').trim() || null
        : null;

      const tgtType = headerMap.has('targetType')
        ? (row[headerMap.get('targetType')!] ?? '').trim() || null
        : null;

      const pipeline = headerMap.has('pipelineName')
        ? (row[headerMap.get('pipelineName')!] ?? '').trim() || null
        : null;

      const transformType = classifyTransformFromLogic(logic, sourceColumn, targetColumn, srcType, tgtType);

      allMappings.push({
        sourceTable,
        sourceColumn,
        targetTable,
        targetColumn,
        transformType,
        transformLogic: logic,
        sourceType: srcType,
        targetType: tgtType,
        pipelineName: pipeline,
      });
    }
  }

  if (validFiles === 0 && files.length > 0) {
    throw new Error('No valid STM files found. Ensure CSV files have source_table, source_column, target_table, target_column headers.');
  }

  return {
    pipelineMapping: {
      sourceFormat: 'stm',
      extractedAt: new Date().toISOString(),
      mappings: allMappings,
      metadata: {
        fileName: files.map(f => f.originalname).join(', '),
      },
    },
    fileCount: validFiles,
    totalMappings: allMappings.length,
    warnings,
  };
}
