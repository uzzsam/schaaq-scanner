// =============================================================================
// MySQL Adapter — Schema Extraction via INFORMATION_SCHEMA
//
// Uses SQL authentication (username + password) via mysql2/promise.
// MySQL conflates "database" and "schema" — the database name IS the schema.
// We map config.schemas to database names and use config.database as the
// connection target.
// =============================================================================

import mysql from 'mysql2/promise';
import type { Connection, ConnectionOptions } from 'mysql2/promise';
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
// Default exclusion patterns — migration framework tables
// =============================================================================

export const DEFAULT_MYSQL_EXCLUDE_PATTERNS = [
  '^_prisma_migrations$',
  '^flyway_',
  '^knex_',
  '^typeorm_',
  '^schema_migrations$',
  '^__EFMigrationsHistory$',
  '^DATABASECHANGELOG$',
  '^DATABASECHANGELOGLOCK$',
];

// =============================================================================
// Row count threshold: tables above this are too large for sampled column stats.
// On large data-warehouse databases, COUNT(DISTINCT col) can timeout even
// with LIMIT sampling. We skip stats and return null for these tables.
// =============================================================================

const COLUMN_STATS_ROW_LIMIT = 5_000_000;

// =============================================================================
// Type normalisation: MySQL DATA_TYPE → NormalizedType
// =============================================================================

export function normalizeMysqlType(dataType: string): NormalizedType {
  const lower = dataType.toLowerCase();
  const map: Record<string, NormalizedType> = {
    'int': 'integer',
    'integer': 'integer',
    'bigint': 'bigint',
    'smallint': 'smallint',
    'tinyint': 'smallint',
    'mediumint': 'integer',
    'decimal': 'decimal',
    'numeric': 'decimal',
    'float': 'float',
    'double': 'double',
    'varchar': 'varchar',
    'char': 'char',
    'text': 'text',
    'tinytext': 'text',
    'mediumtext': 'text',
    'longtext': 'text',
    'enum': 'enum',
    'set': 'enum',
    'bit': 'boolean',
    'boolean': 'boolean',
    'bool': 'boolean',
    'date': 'date',
    'datetime': 'timestamp',
    'timestamp': 'timestamp_tz',
    'time': 'time',
    'year': 'integer',
    'json': 'json',
    'binary': 'binary',
    'varbinary': 'binary',
    'blob': 'blob',
    'tinyblob': 'blob',
    'mediumblob': 'blob',
    'longblob': 'blob',
    'geometry': 'other',
    'point': 'other',
    'linestring': 'other',
    'polygon': 'other',
  };
  return map[lower] ?? 'other';
}

// =============================================================================
// MySQLAdapter
// =============================================================================

export class MySQLAdapter implements DatabaseAdapter {
  private connection: Connection | null = null;
  private config: DatabaseAdapterConfig;

  constructor(config: DatabaseAdapterConfig) {
    this.config = config;
  }

  // ---------------------------------------------------------------------------
  // Connection
  // ---------------------------------------------------------------------------

  private buildConnectionOptions(): ConnectionOptions {
    return {
      host: this.config.host ?? 'localhost',
      port: this.config.port ?? 3306,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl
        ? { rejectUnauthorized: false }
        : undefined,
      connectTimeout: 30_000,
    };
  }

  async connect(): Promise<void> {
    this.connection = await mysql.createConnection(this.buildConnectionOptions());
    // Verify read access
    await this.connection.query('SELECT VERSION() AS version');
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Main extraction
  // ---------------------------------------------------------------------------

  async extractSchema(): Promise<SchemaData> {
    if (!this.connection) {
      throw new Error('Not connected. Call connect() first.');
    }

    const version = await this.getVersion();
    // In MySQL, schemas = databases. Use config.schemas if provided,
    // otherwise fall back to the connected database.
    const schemas = this.config.schemas.length > 0
      ? this.config.schemas
      : this.config.database
        ? [this.config.database]
        : [];

    if (schemas.length === 0) {
      throw new Error('No schemas (databases) specified for extraction.');
    }

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
      databaseType: 'mysql',
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
    if (!this.connection) {
      throw new Error('Not connected. Call connect() first.');
    }

    const schemas = this.config.schemas.length > 0
      ? this.config.schemas
      : this.config.database ? [this.config.database] : [];

    const placeholders = schemas.map(() => '?').join(',');

    // MySQL tracks last update time in information_schema.TABLES.UPDATE_TIME
    // for InnoDB tables.
    const [rows] = await this.connection.query<mysql.RowDataPacket[]>(
      `SELECT
        TABLE_SCHEMA AS table_schema,
        TABLE_NAME AS table_name,
        UPDATE_TIME AS last_updated
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA IN (${placeholders})
        AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY UPDATE_TIME ASC
      LIMIT 1`,
      schemas,
    );

    if (rows.length === 0) {
      return {
        stale: true,
        oldestAnalyze: null,
        warning: 'No tables found in specified schemas.',
      };
    }

    const row = rows[0];
    const lastUpdated: Date | null = row.last_updated ? new Date(row.last_updated) : null;

    if (!lastUpdated) {
      return {
        stale: true,
        oldestAnalyze: null,
        warning:
          'Statistics may be stale (no UPDATE_TIME recorded). P6 findings may be inaccurate. Recommendation: Run ANALYZE TABLE on all tables.',
      };
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    if (lastUpdated < sevenDaysAgo) {
      return {
        stale: true,
        oldestAnalyze: lastUpdated.toISOString(),
        warning: `Statistics may be stale (oldest UPDATE_TIME: ${lastUpdated.toISOString()}). P6 findings may be inaccurate. Recommendation: Run ANALYZE TABLE.`,
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
    const [rows] = await this.connection!.query<mysql.RowDataPacket[]>(
      'SELECT VERSION() AS version',
    );
    return rows[0].version;
  }

  // ---------------------------------------------------------------------------
  // Tables
  // ---------------------------------------------------------------------------

  private async extractTables(schemas: string[]): Promise<TableInfo[]> {
    const placeholders = schemas.map(() => '?').join(',');

    const [rows] = await this.connection!.query<mysql.RowDataPacket[]>(
      `SELECT
        t.TABLE_SCHEMA AS \`schema\`,
        t.TABLE_NAME AS name,
        CASE t.TABLE_TYPE
          WHEN 'BASE TABLE' THEN 'table'
          WHEN 'VIEW' THEN 'view'
          ELSE 'table'
        END AS type,
        t.TABLE_ROWS AS row_count,
        t.DATA_LENGTH + t.INDEX_LENGTH AS size_bytes,
        t.CREATE_TIME AS created_at,
        t.UPDATE_TIME AS last_modified,
        t.TABLE_COMMENT AS comment
      FROM information_schema.TABLES t
      WHERE t.TABLE_SCHEMA IN (${placeholders})
        AND t.TABLE_TYPE IN ('BASE TABLE', 'VIEW')
      ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME`,
      schemas,
    );

    return rows.map((row) => ({
      schema: row.schema,
      name: row.name,
      type: row.type as 'table' | 'view',
      rowCount: row.row_count != null ? Number(row.row_count) : null,
      sizeBytes: row.size_bytes != null ? Number(row.size_bytes) : null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      lastModified: row.last_modified ? new Date(row.last_modified).toISOString() : null,
      comment: row.comment && row.comment !== '' ? row.comment : null,
    }));
  }

  // ---------------------------------------------------------------------------
  // Columns
  // ---------------------------------------------------------------------------

  private async extractColumns(schemas: string[]): Promise<ColumnInfo[]> {
    const placeholders = schemas.map(() => '?').join(',');

    const [rows] = await this.connection!.query<mysql.RowDataPacket[]>(
      `SELECT
        c.TABLE_SCHEMA AS \`schema\`,
        c.TABLE_NAME AS \`table\`,
        c.COLUMN_NAME AS name,
        c.ORDINAL_POSITION AS ordinal_position,
        c.DATA_TYPE AS data_type,
        c.IS_NULLABLE AS is_nullable,
        c.COLUMN_DEFAULT AS default_value,
        c.CHARACTER_MAXIMUM_LENGTH AS max_length,
        c.NUMERIC_PRECISION AS numeric_precision,
        c.NUMERIC_SCALE AS numeric_scale,
        c.COLUMN_COMMENT AS comment
      FROM information_schema.COLUMNS c
      JOIN information_schema.TABLES t
        ON c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME
      WHERE c.TABLE_SCHEMA IN (${placeholders})
        AND t.TABLE_TYPE IN ('BASE TABLE', 'VIEW')
      ORDER BY c.TABLE_SCHEMA, c.TABLE_NAME, c.ORDINAL_POSITION`,
      schemas,
    );

    return rows.map((row) => ({
      schema: row.schema,
      table: row.table,
      name: row.name,
      ordinalPosition: Number(row.ordinal_position),
      dataType: row.data_type,
      normalizedType: normalizeMysqlType(row.data_type),
      isNullable: row.is_nullable === 'YES',
      hasDefault: row.default_value != null,
      defaultValue: row.default_value ?? null,
      maxLength: row.max_length != null ? Number(row.max_length) : null,
      numericPrecision: row.numeric_precision != null ? Number(row.numeric_precision) : null,
      numericScale: row.numeric_scale != null ? Number(row.numeric_scale) : null,
      comment: row.comment && row.comment !== '' ? row.comment : null,
    }));
  }

  // ---------------------------------------------------------------------------
  // Constraints
  // ---------------------------------------------------------------------------

  private async extractConstraints(schemas: string[]): Promise<ConstraintInfo[]> {
    const placeholders = schemas.map(() => '?').join(',');

    const [rows] = await this.connection!.query<mysql.RowDataPacket[]>(
      `SELECT
        tc.TABLE_SCHEMA AS \`schema\`,
        tc.TABLE_NAME AS \`table\`,
        tc.CONSTRAINT_NAME AS name,
        tc.CONSTRAINT_TYPE AS constraint_type,
        GROUP_CONCAT(kcu.COLUMN_NAME ORDER BY kcu.ORDINAL_POSITION) AS columns_csv
      FROM information_schema.TABLE_CONSTRAINTS tc
      JOIN information_schema.KEY_COLUMN_USAGE kcu
        ON tc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
        AND tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
        AND tc.TABLE_NAME = kcu.TABLE_NAME
      WHERE tc.TABLE_SCHEMA IN (${placeholders})
        AND tc.CONSTRAINT_TYPE IN ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY')
      GROUP BY tc.TABLE_SCHEMA, tc.TABLE_NAME, tc.CONSTRAINT_NAME, tc.CONSTRAINT_TYPE
      ORDER BY tc.TABLE_SCHEMA, tc.TABLE_NAME, tc.CONSTRAINT_NAME`,
      schemas,
    );

    return rows.map((row) => {
      let type: ConstraintInfo['type'];
      switch (row.constraint_type) {
        case 'PRIMARY KEY': type = 'primary_key'; break;
        case 'UNIQUE': type = 'unique'; break;
        case 'FOREIGN KEY': type = 'foreign_key'; break;
        default: type = 'check'; break;
      }
      return {
        schema: row.schema,
        table: row.table,
        name: row.name,
        type,
        columns: row.columns_csv ? row.columns_csv.split(',') : [],
        definition: null,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Indexes
  // ---------------------------------------------------------------------------

  private async extractIndexes(schemas: string[]): Promise<IndexInfo[]> {
    const placeholders = schemas.map(() => '?').join(',');

    const [rows] = await this.connection!.query<mysql.RowDataPacket[]>(
      `SELECT
        s.TABLE_SCHEMA AS \`schema\`,
        s.TABLE_NAME AS \`table\`,
        s.INDEX_NAME AS name,
        GROUP_CONCAT(s.COLUMN_NAME ORDER BY s.SEQ_IN_INDEX) AS columns_csv,
        CASE WHEN s.NON_UNIQUE = 0 THEN 1 ELSE 0 END AS is_unique,
        CASE WHEN s.INDEX_NAME = 'PRIMARY' THEN 1 ELSE 0 END AS is_primary,
        s.INDEX_TYPE AS index_type
      FROM information_schema.STATISTICS s
      WHERE s.TABLE_SCHEMA IN (${placeholders})
      GROUP BY s.TABLE_SCHEMA, s.TABLE_NAME, s.INDEX_NAME, s.NON_UNIQUE, s.INDEX_TYPE
      ORDER BY s.TABLE_SCHEMA, s.TABLE_NAME, s.INDEX_NAME`,
      schemas,
    );

    return rows.map((row) => ({
      schema: row.schema,
      table: row.table,
      name: row.name,
      columns: row.columns_csv ? row.columns_csv.split(',') : [],
      isUnique: Boolean(row.is_unique),
      isPrimary: Boolean(row.is_primary),
      type: (row.index_type as string).toLowerCase(),  // btree, hash, fulltext, etc.
    }));
  }

  // ---------------------------------------------------------------------------
  // Foreign Keys
  // ---------------------------------------------------------------------------

  private async extractForeignKeys(schemas: string[]): Promise<ForeignKeyInfo[]> {
    const placeholders = schemas.map(() => '?').join(',');

    const [rows] = await this.connection!.query<mysql.RowDataPacket[]>(
      `SELECT
        kcu.TABLE_SCHEMA AS \`schema\`,
        kcu.TABLE_NAME AS \`table\`,
        kcu.COLUMN_NAME AS \`column\`,
        kcu.CONSTRAINT_NAME AS constraint_name,
        kcu.REFERENCED_TABLE_SCHEMA AS referenced_schema,
        kcu.REFERENCED_TABLE_NAME AS referenced_table,
        kcu.REFERENCED_COLUMN_NAME AS referenced_column,
        rc.UPDATE_RULE AS update_rule,
        rc.DELETE_RULE AS delete_rule
      FROM information_schema.KEY_COLUMN_USAGE kcu
      JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
        ON kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
        AND kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
      WHERE kcu.TABLE_SCHEMA IN (${placeholders})
        AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY kcu.TABLE_SCHEMA, kcu.TABLE_NAME, kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION`,
      schemas,
    );

    return rows.map((row) => ({
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
    const placeholders = schemas.map(() => '?').join(',');

    const [rows] = await this.connection!.query<mysql.RowDataPacket[]>(
      `SELECT
        TABLE_SCHEMA AS \`schema\`,
        TABLE_NAME AS \`table\`,
        TABLE_ROWS AS row_count
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA IN (${placeholders})
        AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_SCHEMA, TABLE_NAME`,
      schemas,
    );

    // MySQL has no direct equivalent of dead_rows, last_vacuum, last_analyze.
    return rows.map((row) => ({
      schema: row.schema,
      table: row.table,
      rowCount: Number(row.row_count ?? 0),
      deadRows: null,
      lastVacuum: null,
      lastAnalyze: null,
      lastAutoAnalyze: null,
    }));
  }

  // ---------------------------------------------------------------------------
  // Column Statistics — sampled per-table queries
  //
  // MySQL has no equivalent of pg_stats. We compute null fraction and distinct
  // count with sampled queries per table.
  //
  // Tables exceeding COLUMN_STATS_ROW_LIMIT (5M rows) are skipped entirely
  // to prevent timeouts on large data-warehouse databases. The downstream
  // checks handle nullFraction: null gracefully.
  //
  // For large tables (>100k rows), we sample by using a subquery with LIMIT.
  // MySQL does not support TABLESAMPLE, so we read the first N rows via LIMIT.
  // This is biased toward insertion order but is fast and avoids full scans.
  // ORDER BY RAND() would give a true sample but is too expensive at scale.
  // ---------------------------------------------------------------------------

  private async extractColumnStatistics(
    schemas: string[],
    tableStats: TableStatistics[],
  ): Promise<ColumnStatistics[]> {
    const results: ColumnStatistics[] = [];
    const placeholders = schemas.map(() => '?').join(',');

    // Get all columns for base tables in target schemas
    const [colRows] = await this.connection!.query<mysql.RowDataPacket[]>(
      `SELECT
        c.TABLE_SCHEMA AS \`schema\`,
        c.TABLE_NAME AS \`table\`,
        c.COLUMN_NAME AS \`column\`
      FROM information_schema.COLUMNS c
      JOIN information_schema.TABLES t
        ON c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME
      WHERE c.TABLE_SCHEMA IN (${placeholders})
        AND t.TABLE_TYPE = 'BASE TABLE'
      ORDER BY c.TABLE_SCHEMA, c.TABLE_NAME, c.ORDINAL_POSITION`,
      schemas,
    );

    // Group columns by schema.table
    const tableColumns = new Map<string, { schema: string; table: string; columns: string[] }>();
    for (const row of colRows) {
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

      // Empty tables
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
      const quotedSchema = info.schema.replace(/`/g, '``');
      const quotedTable = info.table.replace(/`/g, '``');

      const selectClauses = info.columns.map((col) => {
        const qCol = col.replace(/`/g, '``');
        return `
          SUM(CASE WHEN \`${qCol}\` IS NULL THEN 1 ELSE 0 END) / COUNT(*) AS \`null_${col}\`,
          COUNT(DISTINCT \`${qCol}\`) AS \`dist_${col}\``;
      });

      // For large tables (>100k rows), use a subquery with LIMIT to sample.
      // MySQL does not support TABLESAMPLE, so we read the first N rows via LIMIT.
      // This is biased toward insertion order but is fast and avoids full scans.
      let fromClause: string;
      if (rowCount > 100_000) {
        const sampleSize = Math.min(Math.ceil(rowCount * 0.1), 500_000);
        fromClause = `(SELECT * FROM \`${quotedSchema}\`.\`${quotedTable}\` LIMIT ${sampleSize}) AS _sample`;
      } else {
        fromClause = `\`${quotedSchema}\`.\`${quotedTable}\``;
      }

      try {
        const [statsRows] = await this.connection!.query<mysql.RowDataPacket[]>(
          `SELECT COUNT(*) AS sample_total, ${selectClauses.join(',')} FROM ${fromClause}`,
        );

        const statsRow = statsRows[0];

        for (const col of info.columns) {
          const nullFrac = statsRow[`null_${col}`];
          const dist = statsRow[`dist_${col}`];

          results.push({
            schema: info.schema,
            table: info.table,
            column: col,
            nullFraction: nullFrac != null ? Number(nullFrac) : null,
            distinctCount: dist != null ? Number(dist) : null,
            avgWidth: null,       // MySQL does not expose avg column width
            correlation: null,    // MySQL does not expose correlation
          });
        }
      } catch {
        // If the stats query fails (e.g. generated columns, spatial types), return nulls
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
  // Comments (table and column comments from INFORMATION_SCHEMA)
  // ---------------------------------------------------------------------------

  private async extractComments(schemas: string[]): Promise<ObjectComment[]> {
    const placeholders = schemas.map(() => '?').join(',');
    const results: ObjectComment[] = [];

    // Table-level comments
    const [tableRows] = await this.connection!.query<mysql.RowDataPacket[]>(
      `SELECT
        TABLE_SCHEMA AS \`schema\`,
        TABLE_NAME AS object_name,
        TABLE_COMMENT AS comment
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA IN (${placeholders})
        AND TABLE_TYPE IN ('BASE TABLE', 'VIEW')
        AND TABLE_COMMENT IS NOT NULL
        AND TABLE_COMMENT != ''
      ORDER BY TABLE_SCHEMA, TABLE_NAME`,
      schemas,
    );

    for (const row of tableRows) {
      // InnoDB tables have auto-generated comments like "InnoDB free: 12288 kB" — skip those
      if (row.comment && !row.comment.startsWith('InnoDB free:')) {
        results.push({
          schema: row.schema,
          objectType: 'table',
          objectName: row.object_name,
          columnName: null,
          comment: row.comment,
        });
      }
    }

    // Column-level comments
    const [colRows] = await this.connection!.query<mysql.RowDataPacket[]>(
      `SELECT
        c.TABLE_SCHEMA AS \`schema\`,
        c.TABLE_NAME AS object_name,
        c.COLUMN_NAME AS column_name,
        c.COLUMN_COMMENT AS comment
      FROM information_schema.COLUMNS c
      JOIN information_schema.TABLES t
        ON c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME
      WHERE c.TABLE_SCHEMA IN (${placeholders})
        AND t.TABLE_TYPE IN ('BASE TABLE', 'VIEW')
        AND c.COLUMN_COMMENT IS NOT NULL
        AND c.COLUMN_COMMENT != ''
      ORDER BY c.TABLE_SCHEMA, c.TABLE_NAME`,
      schemas,
    );

    for (const row of colRows) {
      results.push({
        schema: row.schema,
        objectType: 'column',
        objectName: row.object_name,
        columnName: row.column_name,
        comment: row.comment,
      });
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Exclusion filtering — same pattern as PostgreSQLAdapter / MSSQLAdapter
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
      ...DEFAULT_MYSQL_EXCLUDE_PATTERNS,
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
