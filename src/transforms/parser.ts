// =============================================================================
// Transform Mapping Parser
//
// Parses source-to-target mapping CSV/Excel files into TransformData.
// Uses fuzzy header matching so users don't need exact column names.
// =============================================================================

import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { TransformMapping, TransformData } from './types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TransformFile {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
}

export interface TransformParseResult {
  data: TransformData;
  fileCount: number;
  totalMappings: number;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Fuzzy header matching
//
// Users may provide headers like "Source Table", "src_tbl", "source_table_name",
// "SourceEntity", etc. We match against known patterns for each field.
// ---------------------------------------------------------------------------

interface HeaderMapping {
  field: keyof TransformMapping;
  patterns: RegExp[];
}

const HEADER_MAPPINGS: HeaderMapping[] = [
  {
    field: 'sourceTable',
    patterns: [
      /^source[_\s-]?table/i, /^src[_\s-]?table/i, /^source[_\s-]?entity/i,
      /^src[_\s-]?entity/i, /^from[_\s-]?table/i, /^source[_\s-]?schema/i,
    ],
  },
  {
    field: 'sourceColumn',
    patterns: [
      /^source[_\s-]?col/i, /^src[_\s-]?col/i, /^source[_\s-]?field/i,
      /^src[_\s-]?field/i, /^source[_\s-]?attr/i, /^from[_\s-]?col/i,
      /^source[_\s-]?name/i,
    ],
  },
  {
    field: 'sourceType',
    patterns: [
      /^source[_\s-]?type/i, /^src[_\s-]?type/i, /^source[_\s-]?data[_\s-]?type/i,
      /^from[_\s-]?type/i, /^src[_\s-]?data[_\s-]?type/i,
    ],
  },
  {
    field: 'targetTable',
    patterns: [
      /^target[_\s-]?table/i, /^tgt[_\s-]?table/i, /^dest[_\s-]?table/i,
      /^target[_\s-]?entity/i, /^tgt[_\s-]?entity/i, /^to[_\s-]?table/i,
      /^destination[_\s-]?table/i,
    ],
  },
  {
    field: 'targetColumn',
    patterns: [
      /^target[_\s-]?col/i, /^tgt[_\s-]?col/i, /^dest[_\s-]?col/i,
      /^target[_\s-]?field/i, /^tgt[_\s-]?field/i, /^target[_\s-]?attr/i,
      /^to[_\s-]?col/i, /^target[_\s-]?name/i, /^destination[_\s-]?col/i,
    ],
  },
  {
    field: 'targetType',
    patterns: [
      /^target[_\s-]?type/i, /^tgt[_\s-]?type/i, /^dest[_\s-]?type/i,
      /^target[_\s-]?data[_\s-]?type/i, /^to[_\s-]?type/i,
    ],
  },
  {
    field: 'transformRule',
    patterns: [
      /^transform/i, /^rule/i, /^logic/i, /^mapping[_\s-]?rule/i,
      /^transformation/i, /^expression/i, /^formula/i, /^etl[_\s-]?rule/i,
      /^conversion/i,
    ],
  },
  {
    field: 'notes',
    patterns: [
      /^notes?$/i, /^comment/i, /^desc/i, /^remark/i, /^explanation/i,
      /^detail/i, /^reason/i, /^justification/i,
    ],
  },
];

function matchHeader(rawHeader: string): keyof TransformMapping | null {
  const clean = rawHeader.trim();
  for (const hm of HEADER_MAPPINGS) {
    for (const re of hm.patterns) {
      if (re.test(clean)) return hm.field;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Core: parse uploaded mapping files into TransformData
// ---------------------------------------------------------------------------

export async function parseTransformFiles(files: TransformFile[]): Promise<TransformParseResult> {
  const warnings: string[] = [];
  const allMappings: TransformMapping[] = [];

  for (const file of files) {
    const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
    let rawSheets: { headers: string[]; rows: Record<string, string>[] }[];

    if (ext === 'xlsx' || ext === 'xls') {
      rawSheets = parseExcel(file);
    } else {
      rawSheets = [parseCsv(file)];
    }

    for (const sheet of rawSheets) {
      if (sheet.headers.length === 0 || sheet.rows.length === 0) {
        warnings.push(`Skipped "${file.originalname}": no data`);
        continue;
      }

      // Build header → field mapping
      const headerMap = new Map<string, keyof TransformMapping>();
      for (const h of sheet.headers) {
        const field = matchHeader(h);
        if (field) headerMap.set(h, field);
      }

      // Validate minimum required fields
      const mappedFields = new Set(headerMap.values());
      const requiredFields: (keyof TransformMapping)[] = [
        'sourceTable', 'sourceColumn', 'targetTable', 'targetColumn',
      ];
      const missingFields = requiredFields.filter((f) => !mappedFields.has(f));
      if (missingFields.length > 0) {
        warnings.push(
          `"${file.originalname}": could not detect columns for: ${missingFields.join(', ')}. ` +
          `Found headers: [${sheet.headers.join(', ')}]`
        );
        continue;
      }

      // Parse rows into TransformMapping objects
      for (const row of sheet.rows) {
        const mapping: Partial<TransformMapping> = {};
        for (const [header, field] of headerMap) {
          mapping[field] = String(row[header] ?? '').trim();
        }

        // Fill defaults
        const m: TransformMapping = {
          sourceTable: mapping.sourceTable ?? '',
          sourceColumn: mapping.sourceColumn ?? '',
          sourceType: mapping.sourceType ?? '',
          targetTable: mapping.targetTable ?? '',
          targetColumn: mapping.targetColumn ?? '',
          targetType: mapping.targetType ?? '',
          transformRule: mapping.transformRule ?? '',
          notes: mapping.notes ?? '',
        };

        // Skip rows with empty source/target
        if (!m.sourceTable && !m.sourceColumn && !m.targetTable && !m.targetColumn) continue;

        allMappings.push(m);
      }
    }
  }

  // Build lookup maps
  const targetToSources = new Map<string, TransformMapping[]>();
  const sourceToTargets = new Map<string, TransformMapping[]>();
  const sourceTableSet = new Set<string>();
  const targetTableSet = new Set<string>();

  for (const m of allMappings) {
    const tgtKey = `${m.targetTable}.${m.targetColumn}`.toLowerCase();
    const srcKey = `${m.sourceTable}.${m.sourceColumn}`.toLowerCase();

    if (!targetToSources.has(tgtKey)) targetToSources.set(tgtKey, []);
    targetToSources.get(tgtKey)!.push(m);

    if (!sourceToTargets.has(srcKey)) sourceToTargets.set(srcKey, []);
    sourceToTargets.get(srcKey)!.push(m);

    if (m.sourceTable) sourceTableSet.add(m.sourceTable);
    if (m.targetTable) targetTableSet.add(m.targetTable);
  }

  const data: TransformData = {
    mappings: allMappings,
    sourceTables: Array.from(sourceTableSet).sort(),
    targetTables: Array.from(targetTableSet).sort(),
    totalMappings: allMappings.length,
    targetToSources,
    sourceToTargets,
  };

  return {
    data,
    fileCount: files.length,
    totalMappings: allMappings.length,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// CSV / Excel parsing helpers
// ---------------------------------------------------------------------------

function parseCsv(file: TransformFile): { headers: string[]; rows: Record<string, string>[] } {
  const text = file.buffer.toString('utf-8');
  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  return {
    headers: result.meta.fields ?? [],
    rows: result.data as Record<string, string>[],
  };
}

function parseExcel(file: TransformFile): { headers: string[]; rows: Record<string, string>[] }[] {
  const workbook = XLSX.read(file.buffer, { type: 'buffer' });
  const sheets: { headers: string[]; rows: Record<string, string>[] }[] = [];

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    const jsonRows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
    if (jsonRows.length === 0) continue;
    const headers = Object.keys(jsonRows[0]);
    sheets.push({ headers, rows: jsonRows });
  }

  return sheets;
}
