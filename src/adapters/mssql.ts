// =============================================================================
// SQL Server Adapter — Schema Extraction via sys.* catalog views
//
// Uses SQL authentication (username + password). For Azure SQL, set ssl: true
// which maps to encrypt: true in the tedious driver.
// =============================================================================

import * as sql from 'mssql';
import type {
  DatabaseAdapter,
  DatabaseAdapterConfig,
  SchemaData,
  TableInfo,
  ColumnInfo,
  ConstraintInfo,
  IndexInfo,
  ForeignKeyInfo,
  TableStatistics,
  ColumnStatistics,
  ObjectComment,
  NormalizedType,
} from './types';

// =============================================================================
// Default exclusion patterns — system/migration tables
// =============================================================================

export const DEFAULT_MSSQL_EXCLUDE_PATTERNS = [
  '^__MigrationHistory$',
  '^__EFMigrationsHistory$',
  '^sysdiagrams$',
  '^flyway_',
  '^knex_',
  '^typeorm_',
  '^schema_migrations$',
];

// =============================================================================
// Row count threshold: tables above this are too large for sampled column stats.
// On large mining/telemetry databases, COUNT(DISTINCT col) can timeout even
// with TABLESAMPLE. We skip stats and return null for these tables.
// =============================================================================

const COLUMN_STATS_ROW_LIMIT = 5_000_000;

// =============================================================================
// Type normalisation: SQL Server type name → NormalizedType
// =============================================================================

export function normalizeMssqlType(typeName: string): NormalizedType {
  const lower = typeName.toLowerCase();
  const map: Record<string, NormalizedType> = {
    'int': 'integer',
    'bigint': 'bigint',
    'smallint': 'smallint',
    'tinyint': 'smallint',
    'decimal': 'decimal',
    'numeric': 'decimal',
    'money': 'decimal',
    'smallmoney': 'decimal',
    'float': 'double',
    'real': 'float',
    'varchar': 'varchar',
    'nvarchar': 'varchar',
    'char': 'char',
    'nchar': 'char',
    'text': 'text',
    'ntext': 'text',
    'bit': 'boolean',
    'date': 'date',
    'datetime': 'timestamp',
    'datetime2': 'timestamp',
    'smalldatetime': 'timestamp',
    'datetimeoffset': 'timestamp_tz',
    'time': 'time',
    'uniqueidentifier': 'uuid',
    'xml': 'text',
    'varbinary': 'binary',
    'binary': 'binary',
    'image': 'blob',
    'sql_variant': 'other',
    'geography': 'other',
    'geometry': 'other',
    'hierarchyid': 'other',
    'timestamp': 'binary',     // SQL Server timestamp/rowversion is binary
    'rowversion': 'binary',
  };
  return map[lower] ?? 'other';
}

// =============================================================================
// MSSQLAdapter
// =============================================================================

export class MSSQLAdapter implements DatabaseAdapter {
  private pool: sql.ConnectionPool | null = null;
  private config: DatabaseAdapterConfig;

  constructor(config: DatabaseAdapterConfig) {
    this.config = config;
  }

  // ---------------------------------------------------------------------------
  // Connection
  // ---------------------------------------------------------------------------

  private buildPoolConfig(): sql.config {
    return {
      server: this.config.host ?? 'localhost',
      port: this.config.port ?? 1433,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      options: {
        // Azure SQL requires encrypt: true. For on-prem, ssl flag controls this.
        encrypt: this.config.ssl ?? false,
        // When using encrypt without a custom CA, trust the server cert.
        // For production Azure, set ssl + sslCaCert for full verification.
        trustServerCertificate: !this.config.sslCaCert,
      },
      // Connection timeout: 30s. Request timeout: 60s (stats queries on large dbs).
      connectionTimeout: 30_000,
      requestTimeout: 60_000,
    };
  }

  async connect(): Promise<void> {
    this.pool = new sql.ConnectionPool(this.buildPoolConfig());
    await this.pool.connect();
    // Verify read access
    await this.pool.request().query('SELECT @@VERSION AS version');
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Main extraction
  // ---------------------------------------------------------------------------

  async extractSchema(): Promise<SchemaData> {
    if (!this.pool) {
      throw new Error('Not connected. Call connect() first.');
    }

    const version = await this.getVersion();
    const schemas = this.config.schemas;

    const [
      tables,
      columns,
      constraints,
      indexes,
      foreignKeys,
      tableStats,
      comments,
    ] = await Promise.all([
      this.extractTables(schemas),
      this.extractColumns(schemas),
      this.extractConstraints(schemas),
      this.extractIndexes(schemas),
      this.extractForeignKeys(schemas),
      this.extractTableStatistics(schemas),
      this.extractComments(schemas),
    ]);

    // Column stats require per-table sampled queries — run after we have table info
    const columnStats = await this.extractColumnStatistics(schemas, tableStats);

    // Apply exclusion filters
    const filtered = this.applyExclusions({
      tables,
      columns,
      constraints,
      indexes,
      foreignKeys,
      tableStatistics: tableStats,
      columnStatistics: columnStats,
      comments,
    });

    return {
      databaseType: 'mssql',
      databaseVersion: version,
      extractedAt: new Date().toISOString(),
      ...filtered,
    };
  }

  // ---------------------------------------------------------------------------
  // Stats freshness check
  // ---------------------------------------------------------------------------

  async checkStatsFreshness(): Promise<{
    stale: boolean;
    oldestAnalyze: string | null;
    warning: string | null;
  }> {
    if (!this.pool) {
      throw new Error('Not connected. Call connect() first.');
    }

    const schemas = this.config.schemas;
    const schemaList = schemas.map((s) => `'${s.replace(/'/g, "''")}'`).join(',');

    const result = await this.pool.request().query(`
      SELECT TOP 1
        s.name AS schema_name,
        o.name AS table_name,
        STATS_DATE(st.object_id, st.stats_id) AS last_updated
      FROM sys.stats st
      JOIN sys.objects o ON st.object_id = o.object_id
      JOIN sys.schemas s ON o.schema_id = s.schema_id
      WHERE o.type = 'U'
        AND s.name IN (${schemaList})
      ORDER BY STATS_DATE(st.object_id, st.stats_id) ASC
    `);

    if (result.recordset.length === 0) {
      return {
        stale: true,
        oldestAnalyze: null,
        warning: 'No tables found in specified schemas.',
      };
    }

    const row = result.recordset[0];
    const lastUpdated: Date | null = row.last_updated;

    if (!lastUpdated) {
      return {
        stale: true,
        oldestAnalyze: null,
        warning:
          'Statistics are stale (UPDATE STATISTICS has never been run). P6 findings may be inaccurate. Recommendation: Run UPDATE STATISTICS.',
      };
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    if (lastUpdated < sevenDaysAgo) {
      return {
        stale: true,
        oldestAnalyze: lastUpdated.toISOString(),
        warning: `Statistics are stale (last UPDATE STATISTICS: ${lastUpdated.toISOString()}). P6 findings may be inaccurate. Recommendation: Run UPDATE STATISTICS.`,
      };
    }

    return {
      stale: false,
      oldestAnalyze: lastUpdated.toISOString(),
      warning: null,
    };
  }

  // ---------------------------------------------------------------------------
  // Version
  // ---------------------------------------------------------------------------

  private async getVersion(): Promise<string> {
    const result = await this.pool!.request().query('SELECT @@VERSION AS version');
    return result.recordset[0].version;
  }

  // ---------------------------------------------------------------------------
  // Tables
  // ---------------------------------------------------------------------------

  private async extractTables(schemas: string[]): Promise<TableInfo[]> {
    const schemaList = schemas.map((s) => `'${s.replace(/'/g, "''")}'`).join(',');

    const result = await this.pool!.request().query(`
      SELECT
        s.name AS [schema],
        o.name AS [name],
        CASE o.type
          WHEN 'U' THEN 'table'
          WHEN 'V' THEN 'view'
        END AS [type],
        SUM(ps.row_count) AS row_count,
        SUM(au.total_pages) * 8 * 1024 AS size_bytes,
        o.create_date,
        o.modify_date,
        ep.value AS comment
      FROM sys.objects o
      JOIN sys.schemas s ON o.schema_id = s.schema_id
      LEFT JOIN sys.dm_db_partition_stats ps
        ON o.object_id = ps.object_id AND ps.index_id IN (0, 1)
      LEFT JOIN sys.allocation_units au
        ON ps.partition_id = au.container_id
      LEFT JOIN sys.extended_properties ep
        ON ep.major_id = o.object_id AND ep.minor_id = 0 AND ep.name = 'MS_Description'
      WHERE o.type IN ('U', 'V')
        AND s.name IN (${schemaList})
      GROUP BY s.name, o.name, o.type, o.create_date, o.modify_date, ep.value
      ORDER BY s.name, o.name
    `);

    return result.recordset.map((row: any) => ({
      schema: row.schema,
      name: row.name,
      type: row.type as 'table' | 'view',
      rowCount: row.row_count != null ? Number(row.row_count) : null,
      sizeBytes: row.size_bytes != null ? Number(row.size_bytes) : null,
      createdAt: row.create_date ? new Date(row.create_date).toISOString() : null,
      lastModified: row.modify_date ? new Date(row.modify_date).toISOString() : null,
      comment: row.comment ? String(row.comment) : null,
    }));
  }

  // ---------------------------------------------------------------------------
  // Columns
  // ---------------------------------------------------------------------------

  private async extractColumns(schemas: string[]): Promise<ColumnInfo[]> {
    const schemaList = schemas.map((s) => `'${s.replace(/'/g, "''")}'`).join(',');

    const result = await this.pool!.request().query(`
      SELECT
        s.name AS [schema],
        o.name AS [table],
        c.name AS [name],
        c.column_id AS ordinal_position,
        tp.name AS data_type,
        c.is_nullable,
        CASE WHEN dc.object_id IS NOT NULL THEN 1 ELSE 0 END AS has_default,
        dc.definition AS default_value,
        c.max_length,
        c.precision AS numeric_precision,
        c.scale AS numeric_scale,
        ep.value AS comment
      FROM sys.columns c
      JOIN sys.objects o ON c.object_id = o.object_id
      JOIN sys.schemas s ON o.schema_id = s.schema_id
      JOIN sys.types tp ON c.user_type_id = tp.user_type_id
      LEFT JOIN sys.default_constraints dc ON c.default_object_id = dc.object_id
      LEFT JOIN sys.extended_properties ep
        ON ep.major_id = c.object_id AND ep.minor_id = c.column_id AND ep.name = 'MS_Description'
      WHERE o.type IN ('U', 'V')
        AND s.name IN (${schemaList})
      ORDER BY s.name, o.name, c.column_id
    `);

    return result.recordset.map((row: any) => {
      // SQL Server max_length for nvarchar/nchar is in bytes (2 per char)
      let maxLength = row.max_length != null ? Number(row.max_length) : null;
      const dt = (row.data_type as string).toLowerCase();
      if (maxLength !== null && (dt === 'nvarchar' || dt === 'nchar' || dt === 'ntext')) {
        maxLength = maxLength === -1 ? -1 : maxLength / 2;
      }

      return {
        schema: row.schema,
        table: row.table,
        name: row.name,
        ordinalPosition: Number(row.ordinal_position),
        dataType: row.data_type,
        normalizedType: normalizeMssqlType(row.data_type),
        isNullable: Boolean(row.is_nullable),
        hasDefault: Boolean(row.has_default),
        defaultValue: row.default_value ?? null,
        maxLength: maxLength === -1 ? null : maxLength,  // -1 means MAX
        numericPrecision: row.numeric_precision != null ? Number(row.numeric_precision) : null,
        numericScale: row.numeric_scale != null ? Number(row.numeric_scale) : null,
        comment: row.comment ? String(row.comment) : null,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Constraints
  // ---------------------------------------------------------------------------

  private async extractConstraints(schemas: string[]): Promise<ConstraintInfo[]> {
    const schemaList = schemas.map((s) => `'${s.replace(/'/g, "''")}'`).join(',');

    const result = await this.pool!.request().query(`
      SELECT
        s.name AS [schema],
        o.name AS [table],
        kc.name AS [name],
        CASE kc.type
          WHEN 'PK' THEN 'primary_key'
          WHEN 'UQ' THEN 'unique'
        END AS [type],
        STUFF((
          SELECT ',' + col.name
          FROM sys.index_columns ic
          JOIN sys.columns col ON ic.object_id = col.object_id AND ic.column_id = col.column_id
          WHERE ic.object_id = kc.parent_object_id AND ic.index_id = kc.unique_index_id
          ORDER BY ic.key_ordinal
          FOR XML PATH('')
        ), 1, 1, '') AS columns_csv,
        NULL AS definition
      FROM sys.key_constraints kc
      JOIN sys.objects o ON kc.parent_object_id = o.object_id
      JOIN sys.schemas s ON o.schema_id = s.schema_id
      WHERE s.name IN (${schemaList})

      UNION ALL

      SELECT
        s.name AS [schema],
        o.name AS [table],
        cc.name AS [name],
        'check' AS [type],
        NULL AS columns_csv,
        cc.definition
      FROM sys.check_constraints cc
      JOIN sys.objects o ON cc.parent_object_id = o.object_id
      JOIN sys.schemas s ON o.schema_id = s.schema_id
      WHERE s.name IN (${schemaList})

      ORDER BY [schema], [table], [name]
    `);

    return result.recordset.map((row: any) => ({
      schema: row.schema,
      table: row.table,
      name: row.name,
      type: row.type as ConstraintInfo['type'],
      columns: row.columns_csv ? row.columns_csv.split(',') : [],
      definition: row.definition ?? null,
    }));
  }

  // ---------------------------------------------------------------------------
  // Indexes
  // ---------------------------------------------------------------------------

  private async extractIndexes(schemas: string[]): Promise<IndexInfo[]> {
    const schemaList = schemas.map((s) => `'${s.replace(/'/g, "''")}'`).join(',');

    const result = await this.pool!.request().query(`
      SELECT
        s.name AS [schema],
        o.name AS [table],
        i.name AS [name],
        STUFF((
          SELECT ',' + c.name
          FROM sys.index_columns ic
          JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
          WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0
          ORDER BY ic.key_ordinal
          FOR XML PATH('')
        ), 1, 1, '') AS columns_csv,
        i.is_unique,
        i.is_primary_key,
        CASE i.type
          WHEN 0 THEN 'heap'
          WHEN 1 THEN 'clustered'
          WHEN 2 THEN 'nonclustered'
          WHEN 3 THEN 'xml'
          WHEN 4 THEN 'spatial'
          WHEN 5 THEN 'clustered_columnstore'
          WHEN 6 THEN 'nonclustered_columnstore'
          WHEN 7 THEN 'nonclustered_hash'
          ELSE 'other'
        END AS index_type
      FROM sys.indexes i
      JOIN sys.objects o ON i.object_id = o.object_id
      JOIN sys.schemas s ON o.schema_id = s.schema_id
      WHERE o.type = 'U'
        AND i.name IS NOT NULL
        AND s.name IN (${schemaList})
      ORDER BY s.name, o.name, i.name
    `);

    return result.recordset.map((row: any) => ({
      schema: row.schema,
      table: row.table,
      name: row.name,
      columns: row.columns_csv ? row.columns_csv.split(',') : [],
      isUnique: Boolean(row.is_unique),
      isPrimary: Boolean(row.is_primary_key),
      type: row.index_type,
    }));
  }

  // ---------------------------------------------------------------------------
  // Foreign Keys
  // ---------------------------------------------------------------------------

  private async extractForeignKeys(schemas: string[]): Promise<ForeignKeyInfo[]> {
    const schemaList = schemas.map((s) => `'${s.replace(/'/g, "''")}'`).join(',');

    const result = await this.pool!.request().query(`
      SELECT
        s1.name AS [schema],
        t1.name AS [table],
        c1.name AS [column],
        fk.name AS constraint_name,
        s2.name AS referenced_schema,
        t2.name AS referenced_table,
        c2.name AS referenced_column,
        CASE fk.update_referential_action
          WHEN 0 THEN 'NO ACTION'
          WHEN 1 THEN 'CASCADE'
          WHEN 2 THEN 'SET NULL'
          WHEN 3 THEN 'SET DEFAULT'
        END AS update_rule,
        CASE fk.delete_referential_action
          WHEN 0 THEN 'NO ACTION'
          WHEN 1 THEN 'CASCADE'
          WHEN 2 THEN 'SET NULL'
          WHEN 3 THEN 'SET DEFAULT'
        END AS delete_rule
      FROM sys.foreign_key_columns fkc
      JOIN sys.foreign_keys fk ON fkc.constraint_object_id = fk.object_id
      JOIN sys.tables t1 ON fkc.parent_object_id = t1.object_id
      JOIN sys.schemas s1 ON t1.schema_id = s1.schema_id
      JOIN sys.columns c1 ON fkc.parent_object_id = c1.object_id AND fkc.parent_column_id = c1.column_id
      JOIN sys.tables t2 ON fkc.referenced_object_id = t2.object_id
      JOIN sys.schemas s2 ON t2.schema_id = s2.schema_id
      JOIN sys.columns c2 ON fkc.referenced_object_id = c2.object_id AND fkc.referenced_column_id = c2.column_id
      WHERE s1.name IN (${schemaList})
      ORDER BY s1.name, t1.name, fk.name, fkc.constraint_column_id
    `);

    return result.recordset.map((row: any) => ({
      schema: row.schema,
      table: row.table,
      column: row.column,
      constraintName: row.constraint_name,
      referencedSchema: row.referenced_schema,
      referencedTable: row.referenced_table,
      referencedColumn: row.referenced_column,
      updateRule: row.update_rule,
      deleteRule: row.delete_rule,
    }));
  }

  // ---------------------------------------------------------------------------
  // Table Statistics
  // ---------------------------------------------------------------------------

  private async extractTableStatistics(schemas: string[]): Promise<TableStatistics[]> {
    const schemaList = schemas.map((s) => `'${s.replace(/'/g, "''")}'`).join(',');

    const result = await this.pool!.request().query(`
      SELECT
        s.name AS [schema],
        o.name AS [table],
        SUM(ps.row_count) AS row_count
      FROM sys.dm_db_partition_stats ps
      JOIN sys.objects o ON ps.object_id = o.object_id
      JOIN sys.schemas s ON o.schema_id = s.schema_id
      WHERE o.type = 'U'
        AND ps.index_id IN (0, 1)
        AND s.name IN (${schemaList})
      GROUP BY s.name, o.name
      ORDER BY s.name, o.name
    `);

    // SQL Server has no direct equivalent of dead_rows, last_vacuum, last_analyze.
    // We leave them null.
    return result.recordset.map((row: any) => ({
      schema: row.schema,
      table: row.table,
      rowCount: Number(row.row_count),
      deadRows: null,
      lastVacuum: null,
      lastAnalyze: null,
      lastAutoAnalyze: null,
    }));
  }

  // ---------------------------------------------------------------------------
  // Column Statistics — sampled per-table COUNT queries
  //
  // SQL Server has no pg_stats equivalent with pre-computed per-column null
  // fractions and distinct counts. We compute them with sampled queries.
  //
  // Tables exceeding COLUMN_STATS_ROW_LIMIT (5M rows) are skipped entirely
  // to prevent timeouts on large mining/telemetry databases. The downstream
  // checks handle nullFraction: null gracefully.
  // ---------------------------------------------------------------------------

  private async extractColumnStatistics(
    schemas: string[],
    tableStats: TableStatistics[],
  ): Promise<ColumnStatistics[]> {
    const results: ColumnStatistics[] = [];
    const schemaList = schemas.map((s) => `'${s.replace(/'/g, "''")}'`).join(',');

    // Get all columns for user tables in the target schemas
    const colResult = await this.pool!.request().query(`
      SELECT
        s.name AS [schema],
        o.name AS [table],
        c.name AS [column]
      FROM sys.columns c
      JOIN sys.objects o ON c.object_id = o.object_id
      JOIN sys.schemas s ON o.schema_id = s.schema_id
      WHERE o.type = 'U'
        AND s.name IN (${schemaList})
      ORDER BY s.name, o.name, c.column_id
    `);

    // Group columns by schema.table
    const tableColumns = new Map<string, { schema: string; table: string; columns: string[] }>();
    for (const row of colResult.recordset) {
      const key = `${row.schema}.${row.table}`;
      if (!tableColumns.has(key)) {
        tableColumns.set(key, { schema: row.schema, table: row.table, columns: [] });
      }
      tableColumns.get(key)!.columns.push(row.column);
    }

    // Build row count lookup from tableStats
    const rowCounts = new Map<string, number>();
    for (const ts of tableStats) {
      rowCounts.set(`${ts.schema}.${ts.table}`, ts.rowCount);
    }

    // Process each table
    for (const [key, info] of tableColumns) {
      const rowCount = rowCounts.get(key) ?? 0;

      // Skip tables exceeding the row limit — sampled COUNT(DISTINCT) on tables
      // with millions of rows can still take minutes and risk statement timeouts.
      if (rowCount > COLUMN_STATS_ROW_LIMIT) {
        for (const col of info.columns) {
          results.push({
            schema: info.schema,
            table: info.table,
            column: col,
            nullFraction: null,
            distinctCount: null,
            avgWidth: null,
            correlation: null,
          });
        }
        continue;
      }

      // For tables with rows, run sampled stats query
      if (rowCount === 0) {
        for (const col of info.columns) {
          results.push({
            schema: info.schema,
            table: info.table,
            column: col,
            nullFraction: 0,
            distinctCount: 0,
            avgWidth: null,
            correlation: null,
          });
        }
        continue;
      }

      // Build a single query that computes null fraction and distinct count
      // for all columns in this table at once.
      const quotedSchema = info.schema.replace(/]/g, ']]');
      const quotedTable = info.table.replace(/]/g, ']]');

      const selectClauses = info.columns.map((col) => {
        const qCol = col.replace(/]/g, ']]');
        return `
          CAST(SUM(CASE WHEN [${qCol}] IS NULL THEN 1 ELSE 0 END) AS FLOAT) / NULLIF(COUNT(*), 0) AS [null_${col}],
          COUNT(DISTINCT [${qCol}]) AS [dist_${col}]`;
      });

      // Use TABLESAMPLE for tables with > 100k rows to speed up the query
      const sampleClause = rowCount > 100_000 ? 'TABLESAMPLE SYSTEM (10 PERCENT)' : '';

      try {
        const statsResult = await this.pool!.request().query(`
          SELECT COUNT(*) AS sample_total,
            ${selectClauses.join(',')}
          FROM [${quotedSchema}].[${quotedTable}] ${sampleClause}
        `);

        const statsRow = statsResult.recordset[0];
        const sampleTotal = Number(statsRow.sample_total) || 1;

        for (const col of info.columns) {
          const nullFrac = statsRow[`null_${col}`];
          const dist = statsRow[`dist_${col}`];

          results.push({
            schema: info.schema,
            table: info.table,
            column: col,
            nullFraction: nullFrac != null ? Number(nullFrac) : null,
            distinctCount: dist != null ? Number(dist) : null,
            avgWidth: null,       // SQL Server does not expose avg column width
            correlation: null,    // SQL Server does not expose correlation
          });
        }
      } catch {
        // If the stats query fails (e.g. computed columns, CLR types), return nulls
        for (const col of info.columns) {
          results.push({
            schema: info.schema,
            table: info.table,
            column: col,
            nullFraction: null,
            distinctCount: null,
            avgWidth: null,
            correlation: null,
          });
        }
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Comments (extended properties)
  // ---------------------------------------------------------------------------

  private async extractComments(schemas: string[]): Promise<ObjectComment[]> {
    const schemaList = schemas.map((s) => `'${s.replace(/'/g, "''")}'`).join(',');

    const result = await this.pool!.request().query(`
      -- Table-level comments
      SELECT
        s.name AS [schema],
        'table' AS object_type,
        o.name AS object_name,
        NULL AS column_name,
        CAST(ep.value AS NVARCHAR(MAX)) AS comment
      FROM sys.extended_properties ep
      JOIN sys.objects o ON ep.major_id = o.object_id
      JOIN sys.schemas s ON o.schema_id = s.schema_id
      WHERE ep.minor_id = 0
        AND ep.name = 'MS_Description'
        AND o.type IN ('U', 'V')
        AND s.name IN (${schemaList})

      UNION ALL

      -- Column-level comments
      SELECT
        s.name AS [schema],
        'column' AS object_type,
        o.name AS object_name,
        c.name AS column_name,
        CAST(ep.value AS NVARCHAR(MAX)) AS comment
      FROM sys.extended_properties ep
      JOIN sys.objects o ON ep.major_id = o.object_id
      JOIN sys.schemas s ON o.schema_id = s.schema_id
      JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
      WHERE ep.minor_id > 0
        AND ep.name = 'MS_Description'
        AND o.type IN ('U', 'V')
        AND s.name IN (${schemaList})

      ORDER BY [schema], object_name
    `);

    return result.recordset.map((row: any) => ({
      schema: row.schema,
      objectType: row.object_type as ObjectComment['objectType'],
      objectName: row.object_name,
      columnName: row.column_name ?? null,
      comment: row.comment,
    }));
  }

  // ---------------------------------------------------------------------------
  // Exclusion filtering — same pattern as PostgreSQLAdapter
  // ---------------------------------------------------------------------------

  private applyExclusions(data: {
    tables: TableInfo[];
    columns: ColumnInfo[];
    constraints: ConstraintInfo[];
    indexes: IndexInfo[];
    foreignKeys: ForeignKeyInfo[];
    tableStatistics: TableStatistics[];
    columnStatistics: ColumnStatistics[];
    comments: ObjectComment[];
  }): {
    tables: TableInfo[];
    columns: ColumnInfo[];
    constraints: ConstraintInfo[];
    indexes: IndexInfo[];
    foreignKeys: ForeignKeyInfo[];
    tableStatistics: TableStatistics[];
    columnStatistics: ColumnStatistics[];
    comments: ObjectComment[];
  } {
    const patterns = [
      ...DEFAULT_MSSQL_EXCLUDE_PATTERNS,
      ...this.config.excludeTables,
    ].map((p) => new RegExp(p));

    const isExcluded = (tableName: string): boolean =>
      patterns.some((re) => re.test(tableName));

    // Apply max tables per schema limit
    const tablesPerSchema = new Map<string, number>();
    const limitedTables = data.tables.filter((t) => {
      if (isExcluded(t.name)) return false;
      const count = tablesPerSchema.get(t.schema) ?? 0;
      if (count >= this.config.maxTablesPerSchema) return false;
      tablesPerSchema.set(t.schema, count + 1);
      return true;
    });

    const includedTables = new Set(
      limitedTables.map((t) => `${t.schema}.${t.name}`),
    );

    return {
      tables: limitedTables,
      columns: data.columns.filter((c) =>
        includedTables.has(`${c.schema}.${c.table}`),
      ),
      constraints: data.constraints.filter((c) =>
        includedTables.has(`${c.schema}.${c.table}`),
      ),
      indexes: data.indexes.filter((i) =>
        includedTables.has(`${i.schema}.${i.table}`),
      ),
      foreignKeys: data.foreignKeys.filter((fk) =>
        includedTables.has(`${fk.schema}.${fk.table}`),
      ),
      tableStatistics: data.tableStatistics.filter((s) =>
        includedTables.has(`${s.schema}.${s.table}`),
      ),
      columnStatistics: data.columnStatistics.filter((s) =>
        includedTables.has(`${s.schema}.${s.table}`),
      ),
      comments: data.comments.filter((c) =>
        includedTables.has(`${c.schema}.${c.objectName}`),
      ),
    };
  }
}
