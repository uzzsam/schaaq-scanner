// =============================================================================
// PostgreSQL Adapter — Schema Extraction via pg_catalog
//
// Uses pg_catalog system tables (NOT information_schema) for speed on large
// databases. All extraction queries run in parallel via Promise.all.
// =============================================================================

import { Client, type ClientConfig } from 'pg';
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

export const DEFAULT_EXCLUDE_PATTERNS = [
  '^_prisma_migrations$',
  '^flyway_',
  '^knex_',
  '^typeorm_',
  '^schema_migrations$',
  '^pg_stat_',
  '^spatial_ref_sys$',
  '^geometry_columns$',
  '^geography_columns$',
];

// =============================================================================
// Type normalisation: pg_catalog typname → NormalizedType
// =============================================================================

export function normalizePostgresType(typname: string): NormalizedType {
  const map: Record<string, NormalizedType> = {
    'int2': 'smallint',
    'int4': 'integer',
    'int8': 'bigint',
    'float4': 'float',
    'float8': 'double',
    'numeric': 'decimal',
    'money': 'decimal',
    'text': 'text',
    'varchar': 'varchar',
    'bpchar': 'char',
    'bool': 'boolean',
    'date': 'date',
    'timestamp': 'timestamp',
    'timestamptz': 'timestamp_tz',
    'time': 'time',
    'timetz': 'time',
    'uuid': 'uuid',
    'json': 'json',
    'jsonb': 'jsonb',
    'bytea': 'binary',
    '_text': 'array',
    '_int4': 'array',
    '_int8': 'array',
    '_float4': 'array',
    '_float8': 'array',
    '_varchar': 'array',
    '_bool': 'array',
    '_uuid': 'array',
    '_numeric': 'array',
    '_timestamp': 'array',
    '_timestamptz': 'array',
    '_date': 'array',
    '_jsonb': 'array',
  };
  // Handle array types generically (anything starting with _)
  if (typname.startsWith('_') && !map[typname]) {
    return 'array';
  }
  return map[typname] ?? 'other';
}

// =============================================================================
// PostgreSQLAdapter
// =============================================================================

export class PostgreSQLAdapter implements DatabaseAdapter {
  private client: Client | null = null;
  private config: DatabaseAdapterConfig;

  constructor(config: DatabaseAdapterConfig) {
    this.config = config;
  }

  // ---------------------------------------------------------------------------
  // Connection
  // ---------------------------------------------------------------------------

  private buildClientConfig(): ClientConfig {
    if (this.config.connectionUri) {
      return { connectionString: this.config.connectionUri };
    }
    return {
      host: this.config.host ?? 'localhost',
      port: this.config.port ?? 5432,
      database: this.config.database,
      user: this.config.username,
      password: this.config.password,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
    };
  }

  async connect(): Promise<void> {
    this.client = new Client(this.buildClientConfig());
    await this.client.connect();
    // Verify we can read pg_catalog
    await this.client.query('SELECT version()');
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Main extraction
  // ---------------------------------------------------------------------------

  async extractSchema(): Promise<SchemaData> {
    if (!this.client) {
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
      columnStats,
      comments,
    ] = await Promise.all([
      this.extractTables(schemas),
      this.extractColumns(schemas),
      this.extractConstraints(schemas),
      this.extractIndexes(schemas),
      this.extractForeignKeys(schemas),
      this.extractTableStatistics(schemas),
      this.extractColumnStatistics(schemas),
      this.extractComments(schemas),
    ]);

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
      databaseType: 'postgresql',
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
    if (!this.client) {
      throw new Error('Not connected. Call connect() first.');
    }

    const schemas = this.config.schemas;
    const result = await this.client.query(
      `SELECT
        schemaname,
        relname,
        last_analyze,
        last_autoanalyze,
        GREATEST(last_analyze, last_autoanalyze) AS latest
      FROM pg_stat_user_tables
      WHERE schemaname = ANY($1)
      ORDER BY latest NULLS FIRST
      LIMIT 1`,
      [schemas],
    );

    if (result.rows.length === 0) {
      return {
        stale: true,
        oldestAnalyze: null,
        warning: 'No tables found in specified schemas.',
      };
    }

    const row = result.rows[0];
    const latest = row.latest as Date | null;

    if (!latest) {
      return {
        stale: true,
        oldestAnalyze: null,
        warning:
          'Statistics are stale (ANALYZE has never been run). P6 findings may be inaccurate. Recommendation: Run ANALYZE.',
      };
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    if (latest < sevenDaysAgo) {
      return {
        stale: true,
        oldestAnalyze: latest.toISOString(),
        warning: `Statistics are stale (last ANALYZE: ${latest.toISOString()}). P6 findings may be inaccurate. Recommendation: Run ANALYZE.`,
      };
    }

    return {
      stale: false,
      oldestAnalyze: latest.toISOString(),
      warning: null,
    };
  }

  // ---------------------------------------------------------------------------
  // Version
  // ---------------------------------------------------------------------------

  private async getVersion(): Promise<string> {
    const result = await this.client!.query('SELECT version()');
    return result.rows[0].version;
  }

  // ---------------------------------------------------------------------------
  // Tables
  // ---------------------------------------------------------------------------

  private async extractTables(schemas: string[]): Promise<TableInfo[]> {
    const result = await this.client!.query(
      `SELECT
        n.nspname AS schema,
        c.relname AS name,
        CASE c.relkind
          WHEN 'r' THEN 'table'
          WHEN 'v' THEN 'view'
          WHEN 'm' THEN 'materialized_view'
        END AS type,
        c.reltuples::bigint AS row_count,
        pg_total_relation_size(c.oid) AS size_bytes,
        d.description AS comment
      FROM pg_class c
      JOIN pg_namespace n ON c.relnamespace = n.oid
      LEFT JOIN pg_description d ON c.oid = d.objoid AND d.objsubid = 0
      WHERE n.nspname = ANY($1)
        AND c.relkind IN ('r', 'v', 'm')
      ORDER BY n.nspname, c.relname`,
      [schemas],
    );

    return result.rows.map((row) => ({
      schema: row.schema,
      name: row.name,
      type: row.type as 'table' | 'view' | 'materialized_view',
      rowCount: row.row_count != null ? Number(row.row_count) : null,
      sizeBytes: row.size_bytes != null ? Number(row.size_bytes) : null,
      createdAt: null, // pg_catalog doesn't track creation time for tables
      lastModified: null,
      comment: row.comment ?? null,
    }));
  }

  // ---------------------------------------------------------------------------
  // Columns
  // ---------------------------------------------------------------------------

  private async extractColumns(schemas: string[]): Promise<ColumnInfo[]> {
    const result = await this.client!.query(
      `SELECT
        n.nspname AS schema,
        c.relname AS table,
        a.attname AS name,
        a.attnum AS ordinal_position,
        t.typname AS data_type,
        NOT a.attnotnull AS is_nullable,
        a.atthasdef AS has_default,
        pg_get_expr(ad.adbin, ad.adrelid) AS default_value,
        CASE WHEN t.typname IN ('varchar', 'bpchar') THEN a.atttypmod - 4 ELSE NULL END AS max_length,
        CASE WHEN t.typname = 'numeric' THEN ((a.atttypmod - 4) >> 16) & 65535 ELSE NULL END AS numeric_precision,
        CASE WHEN t.typname = 'numeric' THEN (a.atttypmod - 4) & 65535 ELSE NULL END AS numeric_scale,
        col_description(c.oid, a.attnum) AS comment
      FROM pg_attribute a
      JOIN pg_class c ON a.attrelid = c.oid
      JOIN pg_namespace n ON c.relnamespace = n.oid
      JOIN pg_type t ON a.atttypid = t.oid
      LEFT JOIN pg_attrdef ad ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
      WHERE n.nspname = ANY($1)
        AND c.relkind IN ('r', 'v', 'm')
        AND a.attnum > 0
        AND NOT a.attisdropped
      ORDER BY n.nspname, c.relname, a.attnum`,
      [schemas],
    );

    return result.rows.map((row) => ({
      schema: row.schema,
      table: row.table,
      name: row.name,
      ordinalPosition: Number(row.ordinal_position),
      dataType: row.data_type,
      normalizedType: normalizePostgresType(row.data_type),
      isNullable: row.is_nullable,
      hasDefault: row.has_default,
      defaultValue: row.default_value ?? null,
      maxLength: row.max_length != null ? Number(row.max_length) : null,
      numericPrecision: row.numeric_precision != null ? Number(row.numeric_precision) : null,
      numericScale: row.numeric_scale != null ? Number(row.numeric_scale) : null,
      comment: row.comment ?? null,
    }));
  }

  // ---------------------------------------------------------------------------
  // Constraints
  // ---------------------------------------------------------------------------

  private async extractConstraints(schemas: string[]): Promise<ConstraintInfo[]> {
    const result = await this.client!.query(
      `SELECT
        n.nspname AS schema,
        cl.relname AS table,
        co.conname AS name,
        CASE co.contype
          WHEN 'p' THEN 'primary_key'
          WHEN 'u' THEN 'unique'
          WHEN 'c' THEN 'check'
          WHEN 'f' THEN 'foreign_key'
          WHEN 'x' THEN 'exclusion'
        END AS type,
        ARRAY(
          SELECT a.attname FROM pg_attribute a
          WHERE a.attrelid = co.conrelid
          AND a.attnum = ANY(co.conkey)
          ORDER BY array_position(co.conkey, a.attnum)
        ) AS columns,
        pg_get_constraintdef(co.oid) AS definition
      FROM pg_constraint co
      JOIN pg_class cl ON co.conrelid = cl.oid
      JOIN pg_namespace n ON cl.relnamespace = n.oid
      WHERE n.nspname = ANY($1)
      ORDER BY n.nspname, cl.relname, co.conname`,
      [schemas],
    );

    return result.rows.map((row) => ({
      schema: row.schema,
      table: row.table,
      name: row.name,
      type: row.type as ConstraintInfo['type'],
      columns: row.columns ?? [],
      definition: row.definition ?? null,
    }));
  }

  // ---------------------------------------------------------------------------
  // Indexes
  // ---------------------------------------------------------------------------

  private async extractIndexes(schemas: string[]): Promise<IndexInfo[]> {
    const result = await this.client!.query(
      `SELECT
        n.nspname AS schema,
        ct.relname AS table,
        ci.relname AS name,
        ARRAY(
          SELECT a.attname FROM pg_attribute a
          WHERE a.attrelid = ct.oid
          AND a.attnum = ANY(ix.indkey)
          ORDER BY array_position(ix.indkey::int[], a.attnum)
        ) AS columns,
        ix.indisunique AS is_unique,
        ix.indisprimary AS is_primary,
        am.amname AS type
      FROM pg_index ix
      JOIN pg_class ci ON ix.indexrelid = ci.oid
      JOIN pg_class ct ON ix.indrelid = ct.oid
      JOIN pg_namespace n ON ct.relnamespace = n.oid
      JOIN pg_am am ON ci.relam = am.oid
      WHERE n.nspname = ANY($1)
      ORDER BY n.nspname, ct.relname, ci.relname`,
      [schemas],
    );

    return result.rows.map((row) => ({
      schema: row.schema,
      table: row.table,
      name: row.name,
      columns: row.columns ?? [],
      isUnique: row.is_unique,
      isPrimary: row.is_primary,
      type: row.type,
    }));
  }

  // ---------------------------------------------------------------------------
  // Foreign Keys
  // ---------------------------------------------------------------------------

  private async extractForeignKeys(schemas: string[]): Promise<ForeignKeyInfo[]> {
    const result = await this.client!.query(
      `SELECT
        n1.nspname AS schema,
        c1.relname AS table,
        a1.attname AS column,
        co.conname AS constraint_name,
        n2.nspname AS referenced_schema,
        c2.relname AS referenced_table,
        a2.attname AS referenced_column,
        CASE co.confupdtype
          WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
          WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
          WHEN 'd' THEN 'SET DEFAULT'
        END AS update_rule,
        CASE co.confdeltype
          WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
          WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL'
          WHEN 'd' THEN 'SET DEFAULT'
        END AS delete_rule
      FROM pg_constraint co
      JOIN pg_class c1 ON co.conrelid = c1.oid
      JOIN pg_namespace n1 ON c1.relnamespace = n1.oid
      JOIN pg_class c2 ON co.confrelid = c2.oid
      JOIN pg_namespace n2 ON c2.relnamespace = n2.oid
      CROSS JOIN LATERAL unnest(co.conkey, co.confkey) WITH ORDINALITY AS cols(key, fkey, ord)
      JOIN pg_attribute a1 ON a1.attrelid = c1.oid AND a1.attnum = cols.key
      JOIN pg_attribute a2 ON a2.attrelid = c2.oid AND a2.attnum = cols.fkey
      WHERE co.contype = 'f'
        AND n1.nspname = ANY($1)
      ORDER BY n1.nspname, c1.relname, co.conname, cols.ord`,
      [schemas],
    );

    return result.rows.map((row) => ({
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
    const result = await this.client!.query(
      `SELECT
        schemaname AS schema,
        relname AS table,
        n_live_tup AS row_count,
        n_dead_tup AS dead_rows,
        last_vacuum::text,
        last_analyze::text,
        last_autoanalyze::text
      FROM pg_stat_user_tables
      WHERE schemaname = ANY($1)
      ORDER BY schemaname, relname`,
      [schemas],
    );

    return result.rows.map((row) => ({
      schema: row.schema,
      table: row.table,
      rowCount: Number(row.row_count),
      deadRows: row.dead_rows != null ? Number(row.dead_rows) : null,
      lastVacuum: row.last_vacuum ?? null,
      lastAnalyze: row.last_analyze ?? null,
      lastAutoAnalyze: row.last_autoanalyze ?? null,
    }));
  }

  // ---------------------------------------------------------------------------
  // Column Statistics
  // ---------------------------------------------------------------------------

  private async extractColumnStatistics(schemas: string[]): Promise<ColumnStatistics[]> {
    const result = await this.client!.query(
      `SELECT
        schemaname AS schema,
        tablename AS table,
        attname AS column,
        null_frac AS null_fraction,
        n_distinct AS distinct_count,
        avg_width,
        correlation
      FROM pg_stats
      WHERE schemaname = ANY($1)
      ORDER BY schemaname, tablename, attname`,
      [schemas],
    );

    return result.rows.map((row) => ({
      schema: row.schema,
      table: row.table,
      column: row.column,
      nullFraction: row.null_fraction != null ? Number(row.null_fraction) : null,
      distinctCount: row.distinct_count != null ? Number(row.distinct_count) : null,
      avgWidth: row.avg_width != null ? Number(row.avg_width) : null,
      correlation: row.correlation != null ? Number(row.correlation) : null,
    }));
  }

  // ---------------------------------------------------------------------------
  // Comments (tables + columns)
  // ---------------------------------------------------------------------------

  private async extractComments(schemas: string[]): Promise<ObjectComment[]> {
    const result = await this.client!.query(
      `-- Table comments
      SELECT
        n.nspname AS schema,
        'table' AS object_type,
        c.relname AS object_name,
        NULL AS column_name,
        d.description AS comment
      FROM pg_description d
      JOIN pg_class c ON d.objoid = c.oid
      JOIN pg_namespace n ON c.relnamespace = n.oid
      WHERE d.objsubid = 0
        AND c.relkind IN ('r', 'v', 'm')
        AND n.nspname = ANY($1)

      UNION ALL

      -- Column comments
      SELECT
        n.nspname AS schema,
        'column' AS object_type,
        c.relname AS object_name,
        a.attname AS column_name,
        d.description AS comment
      FROM pg_description d
      JOIN pg_class c ON d.objoid = c.oid
      JOIN pg_namespace n ON c.relnamespace = n.oid
      JOIN pg_attribute a ON d.objoid = a.attrelid AND d.objsubid = a.attnum
      WHERE d.objsubid > 0
        AND c.relkind IN ('r', 'v', 'm')
        AND n.nspname = ANY($1)
      ORDER BY schema, object_name`,
      [schemas],
    );

    return result.rows.map((row) => ({
      schema: row.schema,
      objectType: row.object_type as ObjectComment['objectType'],
      objectName: row.object_name,
      columnName: row.column_name ?? null,
      comment: row.comment,
    }));
  }

  // ---------------------------------------------------------------------------
  // Exclusion filtering — applied after extraction (database-agnostic)
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
    // Build combined exclusion patterns
    const patterns = [
      ...DEFAULT_EXCLUDE_PATTERNS,
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

    // Build set of included schema.table pairs for filtering related data
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
