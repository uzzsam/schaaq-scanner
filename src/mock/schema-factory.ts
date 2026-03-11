/**
 * Mock Schema Factory
 *
 * Provides a realistic mock schema for dry-run mode and tests.
 * Represents a poorly-governed mining database with 25 tables across 3 schemas.
 * Extracted from tests/integration/pipeline.test.ts for shared use.
 */

import type {
  SchemaData,
  TableInfo,
  ColumnInfo,
  ConstraintInfo,
  ForeignKeyInfo,
  IndexInfo,
  TableStatistics,
  ColumnStatistics,
  ObjectComment,
} from '../adapters/types';
import type { ScannerConfig } from '../checks/types';

// =============================================================================
// Column helper
// =============================================================================

function col(
  schema: string,
  table: string,
  name: string,
  normalizedType: ColumnInfo['normalizedType'] = 'integer',
  ordinal = 1,
): ColumnInfo {
  return {
    schema, table, name,
    ordinalPosition: ordinal,
    dataType: normalizedType,
    normalizedType,
    isNullable: true,
    hasDefault: false,
    defaultValue: null,
    maxLength: null,
    numericPrecision: null,
    numericScale: null,
    comment: null,
  };
}

// =============================================================================
// Tables across 3 schemas (25 total)
// =============================================================================

const tables: TableInfo[] = [
  // public schema — 10 tables
  { schema: 'public', name: 'users', type: 'table', rowCount: 500, sizeBytes: 32768, createdAt: null, lastModified: null, comment: null },
  { schema: 'public', name: 'orders', type: 'table', rowCount: 10000, sizeBytes: 131072, createdAt: null, lastModified: null, comment: null },
  { schema: 'public', name: 'products', type: 'table', rowCount: 200, sizeBytes: 16384, createdAt: null, lastModified: null, comment: null },
  { schema: 'public', name: 'sites', type: 'table', rowCount: 50, sizeBytes: 8192, createdAt: null, lastModified: null, comment: null },
  { schema: 'public', name: 'stg_customers', type: 'table', rowCount: 100, sizeBytes: 8192, createdAt: null, lastModified: null, comment: null },
  { schema: 'public', name: 'csv_import_data', type: 'table', rowCount: 500, sizeBytes: 16384, createdAt: null, lastModified: null, comment: null },
  { schema: 'public', name: 'temp_load', type: 'table', rowCount: 0, sizeBytes: 0, createdAt: null, lastModified: null, comment: null },
  { schema: 'public', name: 'orphan_data', type: 'table', rowCount: 300, sizeBytes: 16384, createdAt: null, lastModified: null, comment: null },
  { schema: 'public', name: 'audit_log', type: 'table', rowCount: 50000, sizeBytes: 524288, createdAt: null, lastModified: null, comment: null },
  { schema: 'public', name: 'config', type: 'table', rowCount: 10, sizeBytes: 4096, createdAt: null, lastModified: null, comment: null },

  // mining schema — 9 tables
  { schema: 'mining', name: 'sites', type: 'table', rowCount: 100, sizeBytes: 16384, createdAt: null, lastModified: null, comment: null },
  { schema: 'mining', name: 'bores', type: 'table', rowCount: 5000, sizeBytes: 65536, createdAt: null, lastModified: null, comment: null },
  { schema: 'mining', name: 'samples', type: 'table', rowCount: 25000, sizeBytes: 262144, createdAt: null, lastModified: null, comment: null },
  { schema: 'mining', name: 'assays', type: 'table', rowCount: 50000, sizeBytes: 524288, createdAt: null, lastModified: null, comment: null },
  { schema: 'mining', name: 'tenements', type: 'table', rowCount: 200, sizeBytes: 16384, createdAt: null, lastModified: null, comment: null },
  { schema: 'mining', name: 'deposits', type: 'table', rowCount: 30, sizeBytes: 8192, createdAt: null, lastModified: null, comment: null },
  { schema: 'mining', name: 'drill_programs', type: 'table', rowCount: 80, sizeBytes: 8192, createdAt: null, lastModified: null, comment: null },
  { schema: 'mining', name: 'products', type: 'table', rowCount: 50, sizeBytes: 8192, createdAt: null, lastModified: null, comment: null },
  { schema: 'mining', name: 'raw_import_log', type: 'table', rowCount: 1000, sizeBytes: 16384, createdAt: null, lastModified: null, comment: null },

  // ml schema — 2 tables (P8 AI readiness targets — no audit, no lineage, no versioning)
  { schema: 'public', name: 'ml_feature_store', type: 'table', rowCount: 5000, sizeBytes: 65536, createdAt: null, lastModified: null, comment: null },
  { schema: 'public', name: 'prediction_scores', type: 'table', rowCount: 10000, sizeBytes: 131072, createdAt: null, lastModified: null, comment: null },

  // environmental schema — 6 tables
  { schema: 'environmental', name: 'monitoring_points', type: 'table', rowCount: 300, sizeBytes: 16384, createdAt: null, lastModified: null, comment: null },
  { schema: 'environmental', name: 'readings', type: 'table', rowCount: 100000, sizeBytes: 1048576, createdAt: null, lastModified: null, comment: null },
  { schema: 'environmental', name: 'parameters', type: 'table', rowCount: 50, sizeBytes: 4096, createdAt: null, lastModified: null, comment: null },
  { schema: 'environmental', name: 'compliance_reports', type: 'table', rowCount: 200, sizeBytes: 32768, createdAt: null, lastModified: null, comment: null },
  { schema: 'environmental', name: 'sites', type: 'table', rowCount: 80, sizeBytes: 8192, createdAt: null, lastModified: null, comment: null },
  { schema: 'environmental', name: 'emission_data', type: 'table', rowCount: 5000, sizeBytes: 65536, createdAt: null, lastModified: null, comment: null },
];

// =============================================================================
// Columns
// =============================================================================

const columns: ColumnInfo[] = [
  // public.users
  col('public', 'users', 'id'), col('public', 'users', 'name', 'varchar'), col('public', 'users', 'email', 'varchar'),
  col('public', 'users', 'created_at', 'timestamp'), col('public', 'users', 'updated_at', 'timestamp'),
  // public.orders
  col('public', 'orders', 'id'), col('public', 'orders', 'user_id'), col('public', 'orders', 'status', 'varchar'),
  col('public', 'orders', 'total', 'decimal'), col('public', 'orders', 'created_at', 'timestamp'),
  // public.products — P2 type inconsistency: status as integer
  col('public', 'products', 'id'), col('public', 'products', 'name', 'varchar'), col('public', 'products', 'status', 'integer'),
  // public.sites
  col('public', 'sites', 'id'), col('public', 'sites', 'site_name', 'varchar'),
  // public.stg_customers (P4 CSV, P7 no audit)
  col('public', 'stg_customers', 'id'), col('public', 'stg_customers', 'name', 'varchar'),
  // public.csv_import_data (P4 CSV, P7 no audit)
  col('public', 'csv_import_data', 'id'), col('public', 'csv_import_data', 'data', 'text'),
  // public.temp_load (P4 CSV)
  col('public', 'temp_load', 'id'), col('public', 'temp_load', 'payload', 'jsonb'),
  // public.orphan_data (P4 island)
  col('public', 'orphan_data', 'id'), col('public', 'orphan_data', 'value', 'varchar'),
  col('public', 'orphan_data', 'category', 'varchar'),
  // public.audit_log
  col('public', 'audit_log', 'id'), col('public', 'audit_log', 'action', 'varchar'),
  col('public', 'audit_log', 'created_at', 'timestamp'),
  // public.config
  col('public', 'config', 'key', 'varchar'), col('public', 'config', 'value', 'text'),

  // mining.sites
  col('mining', 'sites', 'id'), col('mining', 'sites', 'location_name', 'varchar'),
  col('mining', 'sites', 'location_id', 'varchar'),
  // mining.bores
  col('mining', 'bores', 'id'), col('mining', 'bores', 'site_id'),
  col('mining', 'bores', 'depth', 'decimal'), col('mining', 'bores', 'created_at', 'timestamp'), col('mining', 'bores', 'updated_at', 'timestamp'),
  // mining.samples
  col('mining', 'samples', 'id'), col('mining', 'samples', 'bore_id'),
  col('mining', 'samples', 'depth_from', 'decimal'), col('mining', 'samples', 'depth_to', 'decimal'),
  col('mining', 'samples', 'created_at', 'timestamp'), col('mining', 'samples', 'updated_at', 'timestamp'),
  // mining.assays — P5 camelCase violation
  col('mining', 'assays', 'id'), col('mining', 'assays', 'sample_id'),
  col('mining', 'assays', 'mineralType', 'varchar'), col('mining', 'assays', 'grade', 'decimal'),
  col('mining', 'assays', 'created_at', 'timestamp'),
  // mining.tenements
  col('mining', 'tenements', 'id'), col('mining', 'tenements', 'name', 'varchar'),
  col('mining', 'tenements', 'lease_id', 'varchar'),
  // mining.deposits
  col('mining', 'deposits', 'id'), col('mining', 'deposits', 'name', 'varchar'),
  col('mining', 'deposits', 'ore_body_ref', 'varchar'),
  // mining.drill_programs
  col('mining', 'drill_programs', 'id'), col('mining', 'drill_programs', 'name', 'varchar'),
  col('mining', 'drill_programs', 'site_id'),
  // mining.products — P2 type inconsistency (status as boolean)
  col('mining', 'products', 'id'), col('mining', 'products', 'name', 'varchar'), col('mining', 'products', 'status', 'boolean'),
  // mining.raw_import_log
  col('mining', 'raw_import_log', 'id'), col('mining', 'raw_import_log', 'filename', 'varchar'),

  // public.ml_feature_store — P8 target: no audit, no lineage, no versioning, undocumented bias columns
  col('public', 'ml_feature_store', 'id'), col('public', 'ml_feature_store', 'user_id'),
  col('public', 'ml_feature_store', 'age', 'integer'), col('public', 'ml_feature_store', 'gender', 'varchar'),
  col('public', 'ml_feature_store', 'income_bracket', 'varchar'), col('public', 'ml_feature_store', 'score', 'decimal'),
  // public.prediction_scores — P8 target: no audit, no lineage, no versioning
  col('public', 'prediction_scores', 'id'), col('public', 'prediction_scores', 'entity_id'),
  col('public', 'prediction_scores', 'probability', 'decimal'), col('public', 'prediction_scores', 'label', 'varchar'),
  col('public', 'prediction_scores', 'postcode', 'varchar'),

  // environmental.monitoring_points
  col('environmental', 'monitoring_points', 'id'), col('environmental', 'monitoring_points', 'facility_id'),
  col('environmental', 'monitoring_points', 'name', 'varchar'),
  // environmental.readings
  col('environmental', 'readings', 'id'), col('environmental', 'readings', 'point_id'),
  col('environmental', 'readings', 'parameter_id'), col('environmental', 'readings', 'value', 'decimal'),
  col('environmental', 'readings', 'reading_date', 'timestamp'),
  // environmental.parameters
  col('environmental', 'parameters', 'id'), col('environmental', 'parameters', 'name', 'varchar'),
  col('environmental', 'parameters', 'unit', 'varchar'),
  // environmental.compliance_reports
  col('environmental', 'compliance_reports', 'id'), col('environmental', 'compliance_reports', 'title', 'varchar'),
  col('environmental', 'compliance_reports', 'status', 'varchar'),
  col('environmental', 'compliance_reports', 'created_at', 'timestamp'), col('environmental', 'compliance_reports', 'updated_at', 'timestamp'),
  // environmental.sites
  col('environmental', 'sites', 'id'), col('environmental', 'sites', 'name', 'varchar'),
  // environmental.emission_data
  col('environmental', 'emission_data', 'id'), col('environmental', 'emission_data', 'source_id'),
  col('environmental', 'emission_data', 'volume', 'decimal'),

  // Wide table: add 30 extra columns to public.orders to trigger P4 wide table
  ...Array.from({ length: 30 }, (_, i) =>
    col('public', 'orders', `extra_field_${i}`, 'varchar', i + 10),
  ),
];

// =============================================================================
// Constraints — some tables deliberately lack PKs
// =============================================================================

const constraints: ConstraintInfo[] = [
  { schema: 'public', table: 'users', name: 'pk_users', type: 'primary_key', columns: ['id'], definition: null },
  { schema: 'public', table: 'orders', name: 'pk_orders', type: 'primary_key', columns: ['id'], definition: null },
  { schema: 'public', table: 'products', name: 'pk_products', type: 'primary_key', columns: ['id'], definition: null },
  { schema: 'public', table: 'sites', name: 'pk_sites', type: 'primary_key', columns: ['id'], definition: null },
  { schema: 'public', table: 'audit_log', name: 'pk_audit_log', type: 'primary_key', columns: ['id'], definition: null },
  { schema: 'mining', table: 'bores', name: 'pk_bores', type: 'primary_key', columns: ['id'], definition: null },
  { schema: 'mining', table: 'samples', name: 'pk_samples', type: 'primary_key', columns: ['id'], definition: null },
  { schema: 'mining', table: 'assays', name: 'pk_assays', type: 'primary_key', columns: ['id'], definition: null },
  { schema: 'mining', table: 'sites', name: 'pk_mining_sites', type: 'primary_key', columns: ['id'], definition: null },
  { schema: 'environmental', table: 'monitoring_points', name: 'pk_mp', type: 'primary_key', columns: ['id'], definition: null },
  { schema: 'environmental', table: 'readings', name: 'pk_readings', type: 'primary_key', columns: ['id'], definition: null },
  { schema: 'environmental', table: 'compliance_reports', name: 'pk_cr', type: 'primary_key', columns: ['id'], definition: null },
];

// =============================================================================
// Foreign Keys
// =============================================================================

const foreignKeys: ForeignKeyInfo[] = [
  { schema: 'public', table: 'orders', column: 'user_id', constraintName: 'fk_orders_user', referencedSchema: 'public', referencedTable: 'users', referencedColumn: 'id', updateRule: 'NO ACTION', deleteRule: 'NO ACTION' },
  { schema: 'mining', table: 'bores', column: 'site_id', constraintName: 'fk_bores_site', referencedSchema: 'mining', referencedTable: 'sites', referencedColumn: 'id', updateRule: 'NO ACTION', deleteRule: 'NO ACTION' },
  { schema: 'mining', table: 'samples', column: 'bore_id', constraintName: 'fk_samples_bore', referencedSchema: 'mining', referencedTable: 'bores', referencedColumn: 'id', updateRule: 'NO ACTION', deleteRule: 'NO ACTION' },
  { schema: 'mining', table: 'assays', column: 'sample_id', constraintName: 'fk_assays_sample', referencedSchema: 'mining', referencedTable: 'samples', referencedColumn: 'id', updateRule: 'NO ACTION', deleteRule: 'NO ACTION' },
  { schema: 'environmental', table: 'readings', column: 'point_id', constraintName: 'fk_readings_mp', referencedSchema: 'environmental', referencedTable: 'monitoring_points', referencedColumn: 'id', updateRule: 'NO ACTION', deleteRule: 'NO ACTION' },
  { schema: 'mining', table: 'drill_programs', column: 'site_id', constraintName: 'fk_drill_site', referencedSchema: 'public', referencedTable: 'sites', referencedColumn: 'id', updateRule: 'NO ACTION', deleteRule: 'CASCADE' },
];

// =============================================================================
// Indexes
// =============================================================================

const indexes: IndexInfo[] = [
  { schema: 'public', table: 'users', name: 'idx_users_pk', columns: ['id'], isUnique: true, isPrimary: true, type: 'btree' },
  { schema: 'public', table: 'orders', name: 'idx_orders_pk', columns: ['id'], isUnique: true, isPrimary: true, type: 'btree' },
  { schema: 'mining', table: 'bores', name: 'idx_bores_pk', columns: ['id'], isUnique: true, isPrimary: true, type: 'btree' },
  { schema: 'mining', table: 'samples', name: 'idx_samples_pk', columns: ['id'], isUnique: true, isPrimary: true, type: 'btree' },
  { schema: 'environmental', table: 'readings', name: 'idx_readings_pk', columns: ['id'], isUnique: true, isPrimary: true, type: 'btree' },
];

// =============================================================================
// Table Statistics
// =============================================================================

const tableStatistics: TableStatistics[] = tables.map((t) => ({
  schema: t.schema,
  table: t.name,
  rowCount: t.rowCount ?? 0,
  deadRows: 0,
  lastVacuum: null,
  lastAnalyze: '2024-01-01T00:00:00Z',
  lastAutoAnalyze: null,
}));

// =============================================================================
// Column Statistics — some with high null rates
// =============================================================================

const columnStatistics: ColumnStatistics[] = [
  { schema: 'public', table: 'orders', column: 'status', nullFraction: 0.05, distinctCount: 5, avgWidth: 10, correlation: 0.9 },
  { schema: 'public', table: 'products', column: 'status', nullFraction: 0.1, distinctCount: 3, avgWidth: 4, correlation: 0.8 },
  { schema: 'mining', table: 'products', column: 'status', nullFraction: 0.02, distinctCount: 2, avgWidth: 1, correlation: 1 },
  { schema: 'environmental', table: 'parameters', column: 'name', nullFraction: 0.0, distinctCount: 30, avgWidth: 15, correlation: 0.5 },
  { schema: 'environmental', table: 'parameters', column: 'unit', nullFraction: 0.0, distinctCount: 12, avgWidth: 8, correlation: 0.7 },
  { schema: 'environmental', table: 'compliance_reports', column: 'status', nullFraction: 0.0, distinctCount: 4, avgWidth: 10, correlation: 0.8 },
  { schema: 'public', table: 'orphan_data', column: 'value', nullFraction: 0.85, distinctCount: 20, avgWidth: 10, correlation: 0.1 },
  { schema: 'public', table: 'orphan_data', column: 'category', nullFraction: 0.7, distinctCount: 5, avgWidth: 8, correlation: 0.5 },
  { schema: 'mining', table: 'assays', column: 'mineralType', nullFraction: 0.6, distinctCount: 15, avgWidth: 12, correlation: 0.3 },
];

// =============================================================================
// Comments — only some tables documented
// =============================================================================

const comments: ObjectComment[] = [
  { schema: 'public', objectType: 'table', objectName: 'users', columnName: null, comment: 'User accounts' },
  { schema: 'public', objectType: 'table', objectName: 'orders', columnName: null, comment: 'Customer orders' },
  { schema: 'mining', objectType: 'table', objectName: 'bores', columnName: null, comment: 'Drill holes/bores' },
  { schema: 'environmental', objectType: 'table', objectName: 'readings', columnName: null, comment: 'Environmental readings' },
];

// =============================================================================
// Public API
// =============================================================================

/**
 * Create a realistic mock schema for a poorly-governed mining database.
 * 25 tables across 3 schemas (public, mining, environmental).
 */
export function createMockSchema(): SchemaData {
  return {
    databaseType: 'postgresql',
    databaseVersion: '16.0',
    extractedAt: new Date().toISOString(),
    tables: [...tables],
    columns: [...columns],
    constraints: [...constraints],
    indexes: [...indexes],
    foreignKeys: [...foreignKeys],
    tableStatistics: [...tableStatistics],
    columnStatistics: [...columnStatistics],
    comments: [...comments],
  };
}

/**
 * Create a default mock scanner config for Acme Mining Corp.
 */
export function createMockConfig(): ScannerConfig {
  return {
    organisation: {
      name: 'Acme Mining Corp',
      sector: 'mining',
      revenueAUD: 250_000_000,
      totalFTE: 1200,
      dataEngineers: 15,
      avgSalaryAUD: 160_000,
      avgFTESalaryAUD: 110_000,
      csrdInScope: true,
      canonicalInvestmentAUD: 2_000_000,
    },
    thresholds: {},
  };
}
