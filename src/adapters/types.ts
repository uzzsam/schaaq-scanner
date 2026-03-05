// =============================================================================
// SchemaData — Normalised database schema representation
// Consumed by all scanner checks. Produced by database-specific adapters.
// =============================================================================

export interface SchemaData {
  // Metadata
  databaseType: 'postgresql' | 'mysql' | 'mssql' | 'csv' | 'powerbi' | 'tableau' | 'demo';
  databaseVersion: string;
  extractedAt: string;              // ISO 8601 timestamp

  // Core schema objects
  tables: TableInfo[];
  columns: ColumnInfo[];
  constraints: ConstraintInfo[];
  indexes: IndexInfo[];
  foreignKeys: ForeignKeyInfo[];

  // Statistics
  tableStatistics: TableStatistics[];
  columnStatistics: ColumnStatistics[];

  // Optional vendor-specific (nullable)
  triggers?: TriggerInfo[];
  views?: ViewInfo[];
  functions?: FunctionInfo[];
  comments?: ObjectComment[];
}

export interface TableInfo {
  schema: string;
  name: string;
  type: 'table' | 'view' | 'materialized_view';
  rowCount: number | null;
  sizeBytes: number | null;
  createdAt: string | null;
  lastModified: string | null;
  comment: string | null;
}

export interface ColumnInfo {
  schema: string;
  table: string;
  name: string;
  ordinalPosition: number;
  dataType: string;                 // Vendor-specific type name
  normalizedType: NormalizedType;   // Canonical type mapping
  isNullable: boolean;
  hasDefault: boolean;
  defaultValue: string | null;
  maxLength: number | null;
  numericPrecision: number | null;
  numericScale: number | null;
  comment: string | null;
}

export type NormalizedType =
  | 'integer' | 'bigint' | 'smallint'
  | 'decimal' | 'float' | 'double'
  | 'text' | 'varchar' | 'char'
  | 'boolean'
  | 'date' | 'timestamp' | 'timestamp_tz' | 'time'
  | 'uuid' | 'json' | 'jsonb'
  | 'binary' | 'blob'
  | 'array' | 'enum' | 'other';

export interface ConstraintInfo {
  schema: string;
  table: string;
  name: string;
  type: 'primary_key' | 'unique' | 'check' | 'foreign_key' | 'exclusion';
  columns: string[];
  definition: string | null;
}

export interface IndexInfo {
  schema: string;
  table: string;
  name: string;
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
  type: string;                     // btree, hash, gin, gist, etc.
}

export interface ForeignKeyInfo {
  schema: string;
  table: string;
  column: string;
  constraintName: string;
  referencedSchema: string;
  referencedTable: string;
  referencedColumn: string;
  updateRule: string;
  deleteRule: string;
}

export interface TableStatistics {
  schema: string;
  table: string;
  rowCount: number;
  deadRows: number | null;
  lastVacuum: string | null;
  lastAnalyze: string | null;
  lastAutoAnalyze: string | null;
}

export interface ColumnStatistics {
  schema: string;
  table: string;
  column: string;
  nullFraction: number | null;      // 0.0–1.0
  distinctCount: number | null;
  avgWidth: number | null;
  correlation: number | null;
}

export interface TriggerInfo {
  schema: string;
  table: string;
  name: string;
  event: string;
  timing: string;
  definition: string | null;
}

export interface ViewInfo {
  schema: string;
  name: string;
  definition: string | null;
  isMaterialized: boolean;
}

export interface FunctionInfo {
  schema: string;
  name: string;
  language: string;
  returnType: string;
  parameterCount: number;
}

export interface ObjectComment {
  schema: string;
  objectType: 'table' | 'column' | 'index' | 'constraint';
  objectName: string;
  columnName: string | null;
  comment: string;
}

// =============================================================================
// DatabaseAdapter interface — one per supported database
// =============================================================================

export interface DatabaseAdapterConfig {
  type: 'postgresql' | 'mysql' | 'mssql';
  connectionUri?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  sslCaCert?: string;             // PEM-encoded CA certificate for SSL verification
  schemas: string[];              // Which schemas to scan
  excludeTables: string[];        // Regex patterns to exclude
  maxTablesPerSchema: number;     // Safety limit
}

export interface DatabaseAdapter {
  /** Test the connection and verify read access */
  connect(): Promise<void>;

  /** Extract full schema metadata into normalised form */
  extractSchema(): Promise<SchemaData>;

  /** Check if ANALYZE has been run recently */
  checkStatsFreshness(): Promise<{
    stale: boolean;
    oldestAnalyze: string | null;
    warning: string | null;
  }>;

  /** Clean up connection */
  disconnect(): Promise<void>;
}
