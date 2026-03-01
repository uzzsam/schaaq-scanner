// =============================================================================
// Power BI Template (.pbit) Adapter
//
// A .pbit file is a ZIP archive containing a DataModelSchema file encoded in
// UTF-16LE. We extract the JSON model and convert tables, columns, measures,
// and relationships into the standard SchemaData shape.
// =============================================================================

import AdmZip from 'adm-zip';
import type {
  SchemaData,
  TableInfo,
  ColumnInfo,
  NormalizedType,
  ForeignKeyInfo,
} from './types';

// ---------------------------------------------------------------------------
// Power BI model interfaces (subset of actual schema)
// ---------------------------------------------------------------------------

interface PbiColumn {
  name: string;
  dataType: string;
  isHidden?: boolean;
  type?: string;          // 'calculated' for DAX-generated columns
  expression?: string;    // DAX formula
  sourceColumn?: string;
  isKey?: boolean;
  lineageTag?: string;
}

interface PbiMeasure {
  name: string;
  expression: string;
  formatString?: string;
  lineageTag?: string;
}

interface PbiTable {
  name: string;
  columns?: PbiColumn[];
  measures?: PbiMeasure[];
  isHidden?: boolean;
  lineageTag?: string;
}

interface PbiRelationship {
  name?: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  crossFilteringBehavior?: number;
  isActive?: boolean;
}

interface DataModelSchema {
  model: {
    tables: PbiTable[];
    relationships?: PbiRelationship[];
    culture?: string;
    defaultPowerBIDataSourceVersion?: string;
  };
}

// ---------------------------------------------------------------------------
// Type mapping: Power BI types → normalised types
// ---------------------------------------------------------------------------

const PBI_TYPE_MAP: Record<string, { dataType: string; normalized: NormalizedType }> = {
  'string':       { dataType: 'varchar',          normalized: 'varchar' },
  'int64':        { dataType: 'bigint',           normalized: 'bigint' },
  'double':       { dataType: 'double precision', normalized: 'double' },
  'dateTime':     { dataType: 'timestamp',        normalized: 'timestamp' },
  'boolean':      { dataType: 'boolean',          normalized: 'boolean' },
  'decimal':      { dataType: 'decimal',          normalized: 'decimal' },
  'binary':       { dataType: 'bytea',            normalized: 'binary' },
  'dateTimeZone': { dataType: 'timestamptz',      normalized: 'timestamp_tz' },
  'duration':     { dataType: 'interval',         normalized: 'other' },
  'time':         { dataType: 'time',             normalized: 'time' },
  'date':         { dataType: 'date',             normalized: 'date' },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parsePowerBITemplate(fileBuffer: Buffer): SchemaData {
  const zip = new AdmZip(fileBuffer);
  const entries = zip.getEntries();

  let schemaContent: string | null = null;

  for (const entry of entries) {
    if (entry.entryName === 'DataModelSchema') {
      // Power BI serialises this as UTF-16LE
      schemaContent = entry.getData().toString('utf16le');
      break;
    }
  }

  if (!schemaContent) {
    throw new Error(
      'DataModelSchema not found in file. This may be a .pbix file (compressed format). ' +
      'Please save as .pbit template (File > Save As > Power BI Template) and re-upload.'
    );
  }

  // Clean null bytes and control characters from Microsoft JSON serialisation
  const cleaned = schemaContent.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const modelSchema: DataModelSchema = JSON.parse(cleaned);

  return convertPbiToSchemaData(modelSchema);
}

// ---------------------------------------------------------------------------
// Internal conversion
// ---------------------------------------------------------------------------

function convertPbiToSchemaData(model: DataModelSchema): SchemaData {
  const tables: TableInfo[] = [];
  const columns: ColumnInfo[] = [];
  const foreignKeys: ForeignKeyInfo[] = [];
  const schema = 'semantic_model';

  // Filter out internal Power BI tables
  const userTables = model.model.tables.filter(t =>
    !t.name.startsWith('LocalDateTable_') &&
    !t.name.startsWith('DateTableTemplate_') &&
    !t.name.startsWith('Culture_')
  );

  for (const table of userTables) {
    tables.push({
      schema,
      name: table.name,
      type: 'table',
      rowCount: null,   // .pbit has no data
      sizeBytes: null,
      createdAt: null,
      lastModified: null,
      comment: table.isHidden ? '[Hidden]' : null,
    });

    // Process columns
    if (table.columns) {
      const userColumns = table.columns.filter(c =>
        c.name !== 'RowNumber-2662979B-1795-4F74-8F37-6A1BA8059B61' &&
        !c.name.startsWith('[')
      );

      for (let i = 0; i < userColumns.length; i++) {
        const col = userColumns[i];
        const typeInfo = PBI_TYPE_MAP[col.dataType] || { dataType: col.dataType || 'varchar', normalized: 'other' as NormalizedType };

        columns.push({
          schema,
          table: table.name,
          name: col.name,
          ordinalPosition: i + 1,
          dataType: typeInfo.dataType,
          normalizedType: typeInfo.normalized,
          isNullable: !col.isKey,
          hasDefault: false,
          defaultValue: null,
          maxLength: null,
          numericPrecision: null,
          numericScale: null,
          comment: col.type === 'calculated' && col.expression
            ? `[DAX Calculated] ${col.expression.substring(0, 200)}`
            : col.sourceColumn
              ? `[Source: ${col.sourceColumn}]`
              : null,
        });
      }
    }

    // Process measures as virtual columns
    if (table.measures) {
      for (const measure of table.measures) {
        columns.push({
          schema,
          table: table.name,
          name: `[Measure] ${measure.name}`,
          ordinalPosition: 999,
          dataType: 'decimal',
          normalizedType: 'decimal',
          isNullable: true,
          hasDefault: false,
          defaultValue: null,
          maxLength: null,
          numericPrecision: null,
          numericScale: null,
          comment: `[DAX Measure] ${measure.expression.substring(0, 200)}`,
        });
      }
    }
  }

  // Process relationships
  if (model.model.relationships) {
    for (const rel of model.model.relationships) {
      foreignKeys.push({
        schema,
        table: rel.fromTable,
        column: rel.fromColumn,
        constraintName: rel.name || `rel_${rel.fromTable}_${rel.toTable}`,
        referencedSchema: schema,
        referencedTable: rel.toTable,
        referencedColumn: rel.toColumn,
        updateRule: 'NO ACTION',
        deleteRule: 'NO ACTION',
      });
    }
  }

  return {
    databaseType: 'powerbi',
    databaseVersion: model.model.defaultPowerBIDataSourceVersion || 'unknown',
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
