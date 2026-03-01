// =============================================================================
// Tableau Workbook (.twb / .twbx) Adapter
//
// A .twb file is plain XML describing datasources, columns, and calculations.
// A .twbx file is a ZIP archive containing a .twb file (plus packaged extracts).
// We parse the XML model and convert datasources, columns, calculated fields,
// and relationships into the standard SchemaData shape.
// =============================================================================

import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import type {
  SchemaData,
  TableInfo,
  ColumnInfo,
  NormalizedType,
  ForeignKeyInfo,
} from './types';

// ---------------------------------------------------------------------------
// Tableau XML interfaces (subset of actual schema)
// ---------------------------------------------------------------------------

interface TabColumn {
  '@_caption'?: string;
  '@_datatype'?: string;
  '@_name'?: string;
  '@_role'?: string;
  '@_type'?: string;
  '@_hidden'?: string;
  calculation?: {
    '@_class'?: string;
    '@_formula'?: string;
  };
}

interface TabRelationCol {
  '@_datatype'?: string;
  '@_name'?: string;
}

interface TabRelation {
  '@_name'?: string;
  '@_table'?: string;
  '@_type'?: string;
  columns?: { column: TabRelationCol | TabRelationCol[] };
  // Joins have nested relations
  clause?: unknown;
  relation?: TabRelation | TabRelation[];
}

interface TabDatasource {
  '@_caption'?: string;
  '@_name'?: string;
  '@_inline'?: string;
  column?: TabColumn | TabColumn[];
  connection?: {
    '@_class'?: string;
    relation?: TabRelation | TabRelation[];
    cols?: { map: { '@_key'?: string; '@_value'?: string } | { '@_key'?: string; '@_value'?: string }[] };
  };
}

interface TabWorkbook {
  workbook: {
    '@_version'?: string;
    datasources?: {
      datasource: TabDatasource | TabDatasource[];
    };
  };
}

// ---------------------------------------------------------------------------
// Type mapping: Tableau types → normalised types
// ---------------------------------------------------------------------------

const TABLEAU_TYPE_MAP: Record<string, { dataType: string; normalized: NormalizedType }> = {
  'string':   { dataType: 'varchar',          normalized: 'varchar' },
  'integer':  { dataType: 'integer',          normalized: 'integer' },
  'real':     { dataType: 'double precision', normalized: 'double' },
  'date':     { dataType: 'date',             normalized: 'date' },
  'datetime': { dataType: 'timestamp',        normalized: 'timestamp' },
  'boolean':  { dataType: 'boolean',          normalized: 'boolean' },
  'spatial':  { dataType: 'geometry',         normalized: 'other' },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseTableauWorkbook(fileBuffer: Buffer, filename: string): SchemaData {
  let xmlContent: string;

  if (filename.toLowerCase().endsWith('.twbx')) {
    xmlContent = extractTwbFromTwbx(fileBuffer);
  } else {
    xmlContent = fileBuffer.toString('utf-8');
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => name === 'datasource' || name === 'column' || name === 'relation',
  });

  const parsed: TabWorkbook = parser.parse(xmlContent);

  if (!parsed.workbook) {
    throw new Error(
      'Invalid Tableau workbook: no <workbook> element found. ' +
      'Please upload a valid .twb or .twbx file.'
    );
  }

  return convertTableauToSchemaData(parsed);
}

// ---------------------------------------------------------------------------
// ZIP extraction for .twbx
// ---------------------------------------------------------------------------

function extractTwbFromTwbx(fileBuffer: Buffer): string {
  const zip = new AdmZip(fileBuffer);
  const entries = zip.getEntries();

  for (const entry of entries) {
    if (entry.entryName.endsWith('.twb')) {
      return entry.getData().toString('utf-8');
    }
  }

  throw new Error(
    'No .twb file found inside .twbx archive. ' +
    'The file may be corrupted or not a valid Tableau packaged workbook.'
  );
}

// ---------------------------------------------------------------------------
// Internal conversion
// ---------------------------------------------------------------------------

function convertTableauToSchemaData(parsed: TabWorkbook): SchemaData {
  const tables: TableInfo[] = [];
  const columns: ColumnInfo[] = [];
  const foreignKeys: ForeignKeyInfo[] = [];

  const workbook = parsed.workbook;
  const version = workbook['@_version'] || 'unknown';

  if (!workbook.datasources?.datasource) {
    return emptySchemaData(version);
  }

  const datasources = ensureArray(workbook.datasources.datasource);

  for (const ds of datasources) {
    const dsName = ds['@_caption'] || ds['@_name'] || 'unknown';

    // Skip the built-in Parameters datasource
    if (dsName === 'Parameters' || ds['@_name'] === 'Parameters') continue;

    const schema = dsName;

    // Extract physical tables from relation nodes
    const physicalTables = extractPhysicalTables(ds);

    if (physicalTables.length > 0) {
      // Add each physical table
      for (const pt of physicalTables) {
        const tableName = pt.name;
        if (!tables.some(t => t.schema === schema && t.name === tableName)) {
          tables.push({
            schema,
            name: tableName,
            type: 'table',
            rowCount: null,
            sizeBytes: null,
            createdAt: null,
            lastModified: null,
            comment: null,
          });
        }

        // Add columns from relation definition
        if (pt.columns.length > 0) {
          for (let i = 0; i < pt.columns.length; i++) {
            const col = pt.columns[i];
            const typeInfo = TABLEAU_TYPE_MAP[col.datatype] ||
              { dataType: col.datatype || 'varchar', normalized: 'other' as NormalizedType };

            columns.push({
              schema,
              table: tableName,
              name: cleanColumnName(col.name),
              ordinalPosition: i + 1,
              dataType: typeInfo.dataType,
              normalizedType: typeInfo.normalized,
              isNullable: true,
              hasDefault: false,
              defaultValue: null,
              maxLength: null,
              numericPrecision: null,
              numericScale: null,
              comment: null,
            });
          }
        }
      }

      // Extract join relationships as foreign keys
      const joins = extractJoins(ds, schema);
      foreignKeys.push(...joins);
    } else {
      // No physical tables found — treat datasource itself as a table
      tables.push({
        schema,
        name: dsName,
        type: 'table',
        rowCount: null,
        sizeBytes: null,
        createdAt: null,
        lastModified: null,
        comment: null,
      });
    }

    // Process datasource-level columns (includes calculated fields)
    const dsColumns = ds.column ? ensureArray(ds.column) : [];
    for (const col of dsColumns) {
      const colName = col['@_caption'] || col['@_name'] || '';
      if (!colName) continue;

      // Skip hidden internal columns
      if (col['@_hidden'] === 'true') continue;

      const cleanName = cleanColumnName(colName);
      const datatype = col['@_datatype'] || 'string';
      const typeInfo = TABLEAU_TYPE_MAP[datatype] ||
        { dataType: datatype, normalized: 'other' as NormalizedType };

      const isCalculated = !!col.calculation?.['@_formula'];
      const formula = col.calculation?.['@_formula'] || '';

      // Determine which table this column belongs to
      const tableName = determineTableForColumn(col, physicalTables, dsName);

      // Avoid duplicate columns (relation columns may already be added)
      const exists = columns.some(
        c => c.schema === schema && c.table === tableName && c.name === cleanName
      );
      if (exists) continue;

      columns.push({
        schema,
        table: tableName,
        name: cleanName,
        ordinalPosition: 999,
        dataType: typeInfo.dataType,
        normalizedType: typeInfo.normalized,
        isNullable: true,
        hasDefault: false,
        defaultValue: null,
        maxLength: null,
        numericPrecision: null,
        numericScale: null,
        comment: isCalculated
          ? `[Calculated] ${formula.substring(0, 200)}`
          : null,
      });
    }
  }

  return {
    databaseType: 'tableau',
    databaseVersion: version,
    extractedAt: new Date().toISOString(),
    tables,
    columns,
    constraints: [],
    indexes: [],
    foreignKeys,
    tableStatistics: [],
    columnStatistics: [],
    triggers: [],
    views: [],
    functions: [],
    comments: [],
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PhysicalTable {
  name: string;
  columns: { name: string; datatype: string }[];
}

function extractPhysicalTables(ds: TabDatasource): PhysicalTable[] {
  const result: PhysicalTable[] = [];
  if (!ds.connection?.relation) return result;

  const relations = ensureArray(ds.connection.relation);
  for (const rel of relations) {
    collectTablesFromRelation(rel, result);
  }

  return result;
}

function collectTablesFromRelation(rel: TabRelation, result: PhysicalTable[]): void {
  // A leaf relation has @_table — it's an actual physical table
  if (rel['@_table']) {
    const tableName = cleanTableName(rel['@_table']);
    const cols: { name: string; datatype: string }[] = [];

    if (rel.columns) {
      const relCols = rel.columns.column
        ? ensureArray(rel.columns.column)
        : [];
      for (const c of relCols) {
        cols.push({
          name: c['@_name'] || '',
          datatype: c['@_datatype'] || 'string',
        });
      }
    }

    if (!result.some(t => t.name === tableName)) {
      result.push({ name: tableName, columns: cols });
    }
    return;
  }

  // A join/union relation has nested relations
  if (rel.relation) {
    const nested = ensureArray(rel.relation);
    for (const child of nested) {
      collectTablesFromRelation(child, result);
    }
  }
}

function extractJoins(ds: TabDatasource, schema: string): ForeignKeyInfo[] {
  const joins: ForeignKeyInfo[] = [];
  if (!ds.connection?.relation) return joins;

  const relations = ensureArray(ds.connection.relation);
  for (const rel of relations) {
    collectJoinsFromRelation(rel, schema, joins);
  }

  return joins;
}

function collectJoinsFromRelation(
  rel: TabRelation,
  schema: string,
  joins: ForeignKeyInfo[]
): void {
  // A join relation has @_type='join' and nested relations
  if (rel['@_type'] === 'join' && rel.relation) {
    const nested = ensureArray(rel.relation);
    if (nested.length >= 2) {
      const leftTable = getRelationTableName(nested[0]);
      const rightTable = getRelationTableName(nested[1]);

      if (leftTable && rightTable) {
        // Extract join columns from clause if available
        const clauseCols = extractClauseColumns(rel.clause);

        if (clauseCols) {
          joins.push({
            schema,
            table: cleanTableName(leftTable),
            column: cleanColumnName(clauseCols.leftCol),
            constraintName: `join_${cleanTableName(leftTable)}_${cleanTableName(rightTable)}`,
            referencedSchema: schema,
            referencedTable: cleanTableName(rightTable),
            referencedColumn: cleanColumnName(clauseCols.rightCol),
            updateRule: 'NO ACTION',
            deleteRule: 'NO ACTION',
          });
        } else {
          // No clause details — create a generic relationship
          joins.push({
            schema,
            table: cleanTableName(leftTable),
            column: '(join)',
            constraintName: `join_${cleanTableName(leftTable)}_${cleanTableName(rightTable)}`,
            referencedSchema: schema,
            referencedTable: cleanTableName(rightTable),
            referencedColumn: '(join)',
            updateRule: 'NO ACTION',
            deleteRule: 'NO ACTION',
          });
        }
      }
    }

    // Recurse into nested relations (for multi-table joins)
    for (const child of nested) {
      collectJoinsFromRelation(child, schema, joins);
    }
  }
}

function getRelationTableName(rel: TabRelation): string | null {
  if (rel['@_table']) return rel['@_table'];
  if (rel['@_name']) return rel['@_name'];
  return null;
}

function extractClauseColumns(clause: unknown): { leftCol: string; rightCol: string } | null {
  if (!clause || typeof clause !== 'object') return null;

  // Tableau clause structure: { expression: { '@_op': '=', expression: [...] } }
  const c = clause as Record<string, unknown>;
  const expr = c.expression;
  if (!expr) return null;

  // The expression might be an object with nested expressions
  const e = expr as Record<string, unknown>;
  if (e.expression && Array.isArray(e.expression) && e.expression.length >= 2) {
    const left = e.expression[0] as Record<string, string>;
    const right = e.expression[1] as Record<string, string>;
    const leftCol = left['@_name'] || left['@_op'] || '';
    const rightCol = right['@_name'] || right['@_op'] || '';
    if (leftCol && rightCol) {
      return { leftCol, rightCol };
    }
  }

  return null;
}

function determineTableForColumn(
  col: TabColumn,
  physicalTables: PhysicalTable[],
  fallbackTable: string
): string {
  // Tableau column names often have format [TableName].[ColumnName]
  const name = col['@_name'] || '';
  const match = name.match(/^\[([^\]]+)\]\./);
  if (match) {
    const tablePart = match[1];
    // Check if this matches a physical table
    const found = physicalTables.find(
      t => t.name.toLowerCase() === tablePart.toLowerCase()
    );
    if (found) return found.name;
  }

  // If only one physical table, assign there
  if (physicalTables.length === 1) return physicalTables[0].name;

  return fallbackTable;
}

function cleanColumnName(name: string): string {
  // Remove Tableau bracket notation: [Column Name] → Column Name
  return name.replace(/^\[/, '').replace(/\]$/, '').replace(/\]$/, '').trim();
}

function cleanTableName(name: string): string {
  // Remove bracket notation and schema prefixes like [dbo].[TableName]
  return name.replace(/^\[/, '').replace(/\]$/, '').trim();
}

function emptySchemaData(version: string): SchemaData {
  return {
    databaseType: 'tableau',
    databaseVersion: version,
    extractedAt: new Date().toISOString(),
    tables: [],
    columns: [],
    constraints: [],
    indexes: [],
    foreignKeys: [],
    tableStatistics: [],
    columnStatistics: [],
    triggers: [],
    views: [],
    functions: [],
    comments: [],
  };
}

function ensureArray<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}
