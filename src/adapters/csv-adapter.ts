// =============================================================================
// CSV / Excel Adapter
//
// Parses uploaded CSV and Excel files into the standard SchemaData shape so that
// all 15 existing scanner checks run unchanged.  This is a standalone function,
// NOT a DatabaseAdapter implementation.
// =============================================================================

import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type {
  SchemaData,
  TableInfo,
  ColumnInfo,
  NormalizedType,
  ConstraintInfo,
  IndexInfo,
  ForeignKeyInfo,
  TableStatistics,
  ColumnStatistics,
} from './types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CsvFile {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
}

export interface CsvParseResult {
  schemaData: SchemaData;
  fileCount: number;
  totalRows: number;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FK_SUFFIXES = ['_id', '_code', '_key', '_ref'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
const INTEGER_RE = /^-?\d+$/;
const DECIMAL_RE = /^-?\d+\.\d+$/;
const BOOLEAN_RE = /^(true|false|yes|no|0|1)$/i;

// ---------------------------------------------------------------------------
// Core: parse uploaded files into SchemaData
// ---------------------------------------------------------------------------

export async function parseCsvFiles(files: CsvFile[]): Promise<CsvParseResult> {
  const warnings: string[] = [];
  const tables: TableInfo[] = [];
  const columns: ColumnInfo[] = [];
  const constraints: ConstraintInfo[] = [];
  const indexes: IndexInfo[] = [];
  const foreignKeys: ForeignKeyInfo[] = [];
  const tableStats: TableStatistics[] = [];
  const columnStats: ColumnStatistics[] = [];

  let totalRows = 0;

  // Collect all table names first for FK detection later
  const allTableNames = new Set<string>();
  for (const file of files) {
    const sheets = extractSheets(file);
    for (const sheet of sheets) {
      allTableNames.add(sheet.tableName);
    }
  }

  for (const file of files) {
    const sheets = extractSheets(file);

    for (const { tableName, headers, rows } of sheets) {
      if (headers.length === 0) {
        warnings.push(`Skipped "${tableName}": no headers detected`);
        continue;
      }

      const rowCount = rows.length;
      totalRows += rowCount;

      // --- TableInfo ---
      tables.push({
        schema: 'upload',
        name: tableName,
        type: 'table',
        rowCount,
        sizeBytes: null,
        createdAt: null,
        lastModified: null,
        comment: null,
      });

      // --- TableStatistics ---
      tableStats.push({
        schema: 'upload',
        table: tableName,
        rowCount,
        deadRows: null,
        lastVacuum: null,
        lastAnalyze: null,
        lastAutoAnalyze: null,
      });

      // --- Process each column ---
      for (let ordinal = 0; ordinal < headers.length; ordinal++) {
        const colName = headers[ordinal];
        const colValues = rows.map((r) => r[colName]);
        const nonNull = colValues.filter((v) => v !== null && v !== undefined && String(v).trim() !== '');
        const nullCount = colValues.length - nonNull.length;
        const nullFraction = rowCount > 0 ? nullCount / rowCount : 0;

        const inferredType = inferType(nonNull.map(String));
        const maxLen = inferredType === 'varchar'
          ? Math.max(0, ...nonNull.map((v) => String(v).length))
          : null;

        const distinctValues = new Set(nonNull.map(String));
        const hasDefault = nullCount > 0; // heuristic: nullable columns have implicit default

        columns.push({
          schema: 'upload',
          table: tableName,
          name: colName,
          ordinalPosition: ordinal + 1,
          dataType: normalizedTypeToVendorType(inferredType),
          normalizedType: inferredType,
          isNullable: nullFraction > 0,
          hasDefault,
          defaultValue: null,
          maxLength: maxLen,
          numericPrecision: null,
          numericScale: null,
          comment: null,
        });

        columnStats.push({
          schema: 'upload',
          table: tableName,
          column: colName,
          nullFraction,
          distinctCount: distinctValues.size,
          avgWidth: null,
          correlation: null,
        });

        // --- Heuristic: detect primary key (column named "id") ---
        if (colName.toLowerCase() === 'id') {
          constraints.push({
            schema: 'upload',
            table: tableName,
            name: `pk_${tableName}_${colName}`,
            type: 'primary_key',
            columns: [colName],
            definition: null,
          });
          indexes.push({
            schema: 'upload',
            table: tableName,
            name: `pk_${tableName}_${colName}`,
            columns: [colName],
            isUnique: true,
            isPrimary: true,
            type: 'btree',
          });
        }

        // --- Heuristic: detect foreign keys from _id / _key / _code / _ref suffixes ---
        const lowerCol = colName.toLowerCase();
        for (const suffix of FK_SUFFIXES) {
          if (lowerCol.endsWith(suffix) && lowerCol !== 'id') {
            const stem = lowerCol.slice(0, -suffix.length);
            // Try plural + singular matches in allTableNames
            const candidates = [stem, stem + 's', stem + 'es'];
            const refTable = candidates.find((c) => allTableNames.has(c));
            if (refTable) {
              foreignKeys.push({
                schema: 'upload',
                table: tableName,
                column: colName,
                constraintName: `fk_${tableName}_${colName}`,
                referencedSchema: 'upload',
                referencedTable: refTable,
                referencedColumn: 'id',
                updateRule: 'NO ACTION',
                deleteRule: 'NO ACTION',
              });
            }
            break; // only match first suffix
          }
        }
      }
    }
  }

  const schemaData: SchemaData = {
    databaseType: 'csv',
    databaseVersion: 'CSV/Excel Upload',
    extractedAt: new Date().toISOString(),
    tables,
    columns,
    constraints,
    indexes,
    foreignKeys,
    tableStatistics: tableStats,
    columnStatistics: columnStats,
  };

  return {
    schemaData,
    fileCount: files.length,
    totalRows,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Sheet extraction — CSV vs Excel
// ---------------------------------------------------------------------------

interface SheetData {
  tableName: string;
  headers: string[];
  rows: Record<string, unknown>[];
}

function extractSheets(file: CsvFile): SheetData[] {
  const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';

  if (ext === 'csv' || ext === 'tsv') {
    return [parseCsvBuffer(file)];
  }

  if (ext === 'xlsx' || ext === 'xls') {
    return parseExcelBuffer(file);
  }

  // Fallback: try CSV parse
  return [parseCsvBuffer(file)];
}

function parseCsvBuffer(file: CsvFile): SheetData {
  const text = file.buffer.toString('utf-8');
  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false, // keep everything as strings for type inference
  });

  const tableName = sanitiseTableName(file.originalname);
  const headers = result.meta.fields ?? [];
  const rows = result.data as Record<string, unknown>[];

  return { tableName, headers, rows };
}

function parseExcelBuffer(file: CsvFile): SheetData[] {
  const workbook = XLSX.read(file.buffer, { type: 'buffer' });
  const sheets: SheetData[] = [];

  for (const sheetName of workbook.SheetNames) {
    const ws = workbook.Sheets[sheetName];
    const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });

    if (jsonRows.length === 0) continue;

    const headers = Object.keys(jsonRows[0]);
    // Sanitise header names
    const cleanHeaders = headers.map((h) => sanitiseColumnName(String(h)));

    const rows = jsonRows.map((row) => {
      const clean: Record<string, unknown> = {};
      for (let i = 0; i < headers.length; i++) {
        clean[cleanHeaders[i]] = row[headers[i]];
      }
      return clean;
    });

    const baseName = sanitiseTableName(file.originalname);
    const tableName = workbook.SheetNames.length > 1
      ? `${baseName}_${sanitiseTableName(sheetName)}`
      : baseName;

    sheets.push({ tableName, headers: cleanHeaders, rows });
  }

  return sheets;
}

// ---------------------------------------------------------------------------
// Type inference from column sample values
// ---------------------------------------------------------------------------

function inferType(values: string[]): NormalizedType {
  if (values.length === 0) return 'varchar';

  // Sample up to 100 values for performance
  const sample = values.length > 100 ? values.slice(0, 100) : values;

  let uuids = 0, ints = 0, decimals = 0, bools = 0, dates = 0, timestamps = 0;

  for (const v of sample) {
    const trimmed = v.trim();
    if (UUID_RE.test(trimmed)) { uuids++; continue; }
    if (BOOLEAN_RE.test(trimmed)) { bools++; continue; }
    if (ISO_TIMESTAMP_RE.test(trimmed)) { timestamps++; continue; }
    if (ISO_DATE_RE.test(trimmed)) { dates++; continue; }
    if (INTEGER_RE.test(trimmed)) { ints++; continue; }
    if (DECIMAL_RE.test(trimmed)) { decimals++; continue; }
  }

  const threshold = sample.length * 0.8;

  if (uuids >= threshold) return 'uuid';
  if (bools >= threshold) return 'boolean';
  if (timestamps >= threshold) return 'timestamp';
  if (dates >= threshold) return 'date';
  if (ints >= threshold) return 'integer';
  if (decimals >= threshold) return 'decimal';
  if ((ints + decimals) >= threshold) return 'decimal';

  return 'varchar';
}

function normalizedTypeToVendorType(nt: NormalizedType): string {
  const map: Partial<Record<NormalizedType, string>> = {
    integer: 'INTEGER',
    decimal: 'NUMERIC',
    boolean: 'BOOLEAN',
    date: 'DATE',
    timestamp: 'TIMESTAMP',
    uuid: 'UUID',
    varchar: 'VARCHAR',
  };
  return map[nt] ?? 'VARCHAR';
}

// ---------------------------------------------------------------------------
// Name sanitisation
// ---------------------------------------------------------------------------

function sanitiseTableName(filename: string): string {
  // Remove extension, replace non-alphanumeric with underscore, collapse, trim
  return filename
    .replace(/\.[^.]+$/, '')     // strip extension
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase()
    || 'unnamed_table';
}

function sanitiseColumnName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase()
    || 'unnamed_column';
}
