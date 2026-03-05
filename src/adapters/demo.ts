// =============================================================================
// Demo Adapter — Hardcoded mining company schema for demo / showcase scans
// =============================================================================
//
// Returns a realistic "Pilbara Resources" mining company schema with
// intentional data-quality issues pre-baked across all 7 DALC properties:
//
//   P1  Semantic Identity     — duplicate / near-duplicate column names
//   P2  Type Inconsistency    — same column name, different types across tables
//   P3  Domain Overlap        — overlapping metrics across schemas
//   P4  Island Tables         — tables with no relationships or indexes
//   P5  Naming Violations     — mixed camelCase / snake_case / PascalCase
//   P6  Anomaly Detection     — high null rates, z-score outliers, no indexes
//   P7  Missing Constraints   — tables with no PK, no audit columns
//
// No real database connection is needed — connect() and disconnect() are no-ops.
// =============================================================================

import type {
  DatabaseAdapter,
  SchemaData,
  TableInfo,
  ColumnInfo,
  ConstraintInfo,
  IndexInfo,
  ForeignKeyInfo,
  TableStatistics,
  ColumnStatistics,
  NormalizedType,
} from './types';

/**
 * DemoAdapter — implements DatabaseAdapter with hardcoded mining-company data.
 */
export class DemoAdapter implements DatabaseAdapter {
  async connect(): Promise<void> {
    /* no-op */
  }

  async disconnect(): Promise<void> {
    /* no-op */
  }

  async checkStatsFreshness(): Promise<{
    stale: boolean;
    oldestAnalyze: string | null;
    warning: string | null;
  }> {
    return { stale: false, oldestAnalyze: null, warning: null };
  }

  async extractSchema(): Promise<SchemaData> {
    return buildDemoSchema();
  }
}

// ---------------------------------------------------------------------------
// Helper — build a single ColumnInfo
// ---------------------------------------------------------------------------

function col(
  schema: string,
  table: string,
  name: string,
  ordinal: number,
  dataType: string,
  normalizedType: NormalizedType,
  opts: Partial<
    Omit<
      ColumnInfo,
      'schema' | 'table' | 'name' | 'ordinalPosition' | 'dataType' | 'normalizedType'
    >
  > = {},
): ColumnInfo {
  return {
    schema,
    table,
    name,
    ordinalPosition: ordinal,
    dataType,
    normalizedType,
    isNullable: opts.isNullable ?? true,
    hasDefault: opts.hasDefault ?? false,
    defaultValue: opts.defaultValue ?? null,
    maxLength: opts.maxLength ?? null,
    numericPrecision: opts.numericPrecision ?? null,
    numericScale: opts.numericScale ?? null,
    comment: opts.comment ?? null,
  };
}

// ---------------------------------------------------------------------------
// Helper — build a single ColumnStatistics
// ---------------------------------------------------------------------------

function cstat(
  schema: string,
  table: string,
  column: string,
  nullFraction: number,
  distinctCount: number,
  avgWidth: number = 8,
): ColumnStatistics {
  return {
    schema,
    table,
    column,
    nullFraction,
    distinctCount,
    avgWidth,
    correlation: 0.95,
  };
}

// ---------------------------------------------------------------------------
// Build the full demo SchemaData
// ---------------------------------------------------------------------------

function buildDemoSchema(): SchemaData {
  const now = new Date().toISOString();
  const oneWeekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  // =========================================================================
  // 1. Tables (8 tables across 4 schemas)
  // =========================================================================

  const tables: TableInfo[] = [
    // -- operations (3 tables) --
    { schema: 'operations', name: 'mine_sites',        type: 'table', rowCount: 47,   sizeBytes: 32_768,  createdAt: oneWeekAgo, lastModified: now, comment: 'Active mine site locations' },
    { schema: 'operations', name: 'operational_costs',  type: 'table', rowCount: 1284, sizeBytes: 196_608, createdAt: oneWeekAgo, lastModified: now, comment: null },
    { schema: 'operations', name: 'equipment_log',      type: 'table', rowCount: 0,    sizeBytes: 8_192,   createdAt: oneWeekAgo, lastModified: now, comment: null },  // P7: 0 rows
    // -- finance (2 tables) --
    { schema: 'finance',    name: 'monthly_costs',      type: 'table', rowCount: 864,  sizeBytes: 131_072, createdAt: oneWeekAgo, lastModified: now, comment: null },
    { schema: 'finance',    name: 'tblAssets',          type: 'table', rowCount: 523,  sizeBytes: 81_920,  createdAt: oneWeekAgo, lastModified: now, comment: null },  // P5: tbl prefix
    // -- environmental (1 table) --
    { schema: 'environmental', name: 'compliance_monitoring', type: 'table', rowCount: 2156, sizeBytes: 393_216, createdAt: oneWeekAgo, lastModified: now, comment: null },
    // -- hr (2 tables) --
    { schema: 'hr', name: 'EmployeeData',     type: 'table', rowCount: 1842, sizeBytes: 262_144, createdAt: oneWeekAgo, lastModified: now, comment: null },  // P5: PascalCase table
    { schema: 'hr', name: 'employee_records',  type: 'table', rowCount: 1842, sizeBytes: 229_376, createdAt: oneWeekAgo, lastModified: now, comment: 'Historical employee records' },
  ];

  // =========================================================================
  // 2. Columns
  // =========================================================================

  const columns: ColumnInfo[] = [

    // ── operations.mine_sites  (12 cols) ──────────────────────────────────
    col('operations', 'mine_sites', 'site_id',               1, 'integer',                   'integer',      { isNullable: false }),
    col('operations', 'mine_sites', 'site_code',             2, 'character(4)',               'char',         { maxLength: 4 }),                        // P2: CHAR(4) vs VARCHAR(20) in hr
    col('operations', 'mine_sites', 'site_name',             3, 'character varying(100)',     'varchar',      { maxLength: 100 }),
    col('operations', 'mine_sites', 'latitude',              4, 'numeric(10,6)',              'decimal',      { numericPrecision: 10, numericScale: 6 }),
    col('operations', 'mine_sites', 'longitude',             5, 'numeric(10,6)',              'decimal',      { numericPrecision: 10, numericScale: 6 }),
    col('operations', 'mine_sites', 'ore_grade',             6, 'numeric(8,4)',               'decimal',      { numericPrecision: 8, numericScale: 4 }),
    col('operations', 'mine_sites', 'extraction_volume',     7, 'numeric(12,2)',              'decimal',      { numericPrecision: 12, numericScale: 2 }),
    col('operations', 'mine_sites', 'site_manager_id',       8, 'integer',                   'integer'),                                                // P6: null 0.65
    col('operations', 'mine_sites', 'safety_incident_count', 9, 'integer',                   'integer',      { hasDefault: true, defaultValue: '0' }),
    col('operations', 'mine_sites', 'last_inspection_date', 10, 'date',                      'date'),
    col('operations', 'mine_sites', 'status',               11, 'character varying(20)',      'varchar',      { maxLength: 20 }),
    col('operations', 'mine_sites', 'created_at',           12, 'timestamp with time zone',  'timestamp_tz', { hasDefault: true }),

    // ── operations.operational_costs  (10 cols) ───────────────────────────
    col('operations', 'operational_costs', 'id',              1, 'integer',                  'integer',  { isNullable: false }),
    col('operations', 'operational_costs', 'site_id',         2, 'integer',                  'integer'),
    col('operations', 'operational_costs', 'cost_centre',     3, 'character varying(10)',     'varchar',  { maxLength: 10 }),                            // P2: VARCHAR vs INTEGER in finance
    col('operations', 'operational_costs', 'total_cost',      4, 'numeric(14,2)',             'decimal',  { numericPrecision: 14, numericScale: 2 }),    // P3: same name as finance.monthly_costs
    col('operations', 'operational_costs', 'labour_cost',     5, 'numeric(14,2)',             'decimal',  { numericPrecision: 14, numericScale: 2 }),
    col('operations', 'operational_costs', 'equipment_cost',  6, 'numeric(14,2)',             'decimal',  { numericPrecision: 14, numericScale: 2 }),
    col('operations', 'operational_costs', 'reporting_month', 7, 'date',                     'date'),
    col('operations', 'operational_costs', 'approved_by',     8, 'character varying(100)',    'varchar',  { maxLength: 100 }),
    col('operations', 'operational_costs', 'notes',           9, 'text',                     'text'),
    col('operations', 'operational_costs', 'created_at',     10, 'timestamp with time zone', 'timestamp_tz', { hasDefault: true }),

    // ── operations.equipment_log  (8 cols — NO PK, NO indexes) ────────────
    col('operations', 'equipment_log', 'equipment_id',     1, 'integer',                'integer'),                                                   // P7: no PK
    col('operations', 'equipment_log', 'site_id',          2, 'integer',                'integer'),
    col('operations', 'equipment_log', 'equipment_type',   3, 'character varying(50)',  'varchar',  { maxLength: 50 }),
    col('operations', 'equipment_log', 'manufacturer',     4, 'character varying(100)', 'varchar',  { maxLength: 100 }),
    col('operations', 'equipment_log', 'purchase_date',    5, 'date',                   'date'),
    col('operations', 'equipment_log', 'last_service_date',6, 'date',                   'date'),
    col('operations', 'equipment_log', 'condition_rating', 7, 'integer',                'integer'),
    col('operations', 'equipment_log', 'decommissioned',   8, 'boolean',                'boolean',  { hasDefault: true, defaultValue: 'false' }),

    // ── finance.monthly_costs  (10 cols) ──────────────────────────────────
    col('finance', 'monthly_costs', 'id',                1, 'integer',                  'integer',  { isNullable: false }),
    col('finance', 'monthly_costs', 'department',        2, 'character varying(50)',     'varchar',  { maxLength: 50 }),
    col('finance', 'monthly_costs', 'cost_centre',       3, 'integer',                  'integer'),                                                    // P2: INTEGER vs VARCHAR in operations
    col('finance', 'monthly_costs', 'total_cost',        4, 'character varying(20)',     'varchar',  { maxLength: 20 }),                                // P2: VARCHAR vs DECIMAL + P3: duplicate metric
    col('finance', 'monthly_costs', 'budget_allocation',  5, 'numeric(14,2)',            'decimal',  { numericPrecision: 14, numericScale: 2 }),
    col('finance', 'monthly_costs', 'variance',           6, 'numeric(14,2)',            'decimal',  { numericPrecision: 14, numericScale: 2 }),
    col('finance', 'monthly_costs', 'fiscal_year',        7, 'integer',                 'integer'),
    col('finance', 'monthly_costs', 'fiscal_quarter',     8, 'integer',                 'integer'),
    col('finance', 'monthly_costs', 'approved',           9, 'boolean',                 'boolean'),
    col('finance', 'monthly_costs', 'last_audit_date',   10, 'date',                    'date'),                                                       // P6: null 0.71

    // ── finance.tblAssets  (9 cols — tbl prefix, PascalCase cols) ─────────
    col('finance', 'tblAssets', 'AssetID',          1, 'integer',                'integer',  { isNullable: false }),                                   // P5: PascalCase
    col('finance', 'tblAssets', 'AssetName',        2, 'character varying(100)', 'varchar',  { maxLength: 100 }),                                      // P5: PascalCase
    col('finance', 'tblAssets', 'PurchaseDate',     3, 'date',                   'date'),                                                              // P5: PascalCase
    col('finance', 'tblAssets', 'PurchasePrice',    4, 'numeric(14,2)',          'decimal',  { numericPrecision: 14, numericScale: 2 }),                // P5: PascalCase
    col('finance', 'tblAssets', 'DepreciationRate', 5, 'numeric(5,4)',           'decimal',  { numericPrecision: 5, numericScale: 4 }),                 // P5: PascalCase
    col('finance', 'tblAssets', 'CurrentValue',     6, 'numeric(14,2)',          'decimal',  { numericPrecision: 14, numericScale: 2 }),                // P5: PascalCase
    col('finance', 'tblAssets', 'Location',         7, 'character varying(100)', 'varchar',  { maxLength: 100 }),                                      // P5: PascalCase
    col('finance', 'tblAssets', 'assignedTo',       8, 'character varying(100)', 'varchar',  { maxLength: 100 }),                                      // P5: camelCase mixed in
    col('finance', 'tblAssets', 'last_maintenance', 9, 'date',                   'date'),                                                              // P5: snake_case mixed in

    // ── environmental.compliance_monitoring  (12 cols — high null cluster) ─
    col('environmental', 'compliance_monitoring', 'id',                       1, 'integer',                  'integer',  { isNullable: false }),
    col('environmental', 'compliance_monitoring', 'site_id',                  2, 'integer',                  'integer'),
    col('environmental', 'compliance_monitoring', 'monitoring_date',          3, 'date',                     'date'),
    col('environmental', 'compliance_monitoring', 'air_quality_index',        4, 'numeric(6,2)',              'decimal',  { numericPrecision: 6, numericScale: 2 }),
    col('environmental', 'compliance_monitoring', 'water_ph_level',           5, 'numeric(4,2)',              'decimal',  { numericPrecision: 4, numericScale: 2 }),
    col('environmental', 'compliance_monitoring', 'noise_level_db',           6, 'numeric(5,1)',              'decimal',  { numericPrecision: 5, numericScale: 1 }),
    col('environmental', 'compliance_monitoring', 'environmental_cert_date',  7, 'date',                     'date'),                                   // P6: null 0.82
    col('environmental', 'compliance_monitoring', 'inspector_name',           8, 'character varying(100)',    'varchar',  { maxLength: 100 }),
    col('environmental', 'compliance_monitoring', 'compliance_status',        9, 'character varying(20)',     'varchar',  { maxLength: 20 }),
    col('environmental', 'compliance_monitoring', 'remediation_required',    10, 'boolean',                  'boolean'),
    col('environmental', 'compliance_monitoring', 'followup_date',           11, 'date',                     'date'),                                   // P6: null 0.73
    col('environmental', 'compliance_monitoring', 'penalty_amount',          12, 'numeric(12,2)',             'decimal',  { numericPrecision: 12, numericScale: 2 }),  // P6: null 0.75

    // ── hr.EmployeeData  (10 cols — PascalCase table, mixed naming) ───────
    col('hr', 'EmployeeData', 'employeeId',   1, 'integer',                'integer',  { isNullable: false }),                                         // P5: camelCase
    col('hr', 'EmployeeData', 'firstName',    2, 'character varying(50)',  'varchar',  { maxLength: 50 }),                                             // P5: camelCase
    col('hr', 'EmployeeData', 'lastName',     3, 'character varying(50)',  'varchar',  { maxLength: 50 }),                                             // P5: camelCase
    col('hr', 'EmployeeData', 'employee_id',  4, 'character varying(20)', 'varchar',  { maxLength: 20 }),                                             // P2: VARCHAR vs INTEGER elsewhere
    col('hr', 'EmployeeData', 'DateOfBirth',  5, 'date',                  'date'),                                                                     // P5: PascalCase
    col('hr', 'EmployeeData', 'department',   6, 'character varying(50)', 'varchar',  { maxLength: 50 }),
    col('hr', 'EmployeeData', 'site_code',    7, 'character varying(20)', 'varchar',  { maxLength: 20 }),                                             // P2: VARCHAR(20) vs CHAR(4)
    col('hr', 'EmployeeData', 'salary',       8, 'numeric(12,2)',         'decimal',  { numericPrecision: 12, numericScale: 2 }),
    col('hr', 'EmployeeData', 'StartDate',    9, 'date',                  'date'),                                                                     // P5: PascalCase
    col('hr', 'EmployeeData', 'is_active',   10, 'boolean',               'boolean',  { hasDefault: true, defaultValue: 'true' }),

    // ── hr.employee_records  (10 cols — snake_case, same entity as above) ─
    col('hr', 'employee_records', 'record_id',       1, 'integer',                'integer',  { isNullable: false }),
    col('hr', 'employee_records', 'employee_id',     2, 'integer',                'integer'),                                                          // P2: INTEGER vs VARCHAR in EmployeeData
    col('hr', 'employee_records', 'first_name',      3, 'character varying(50)',  'varchar',  { maxLength: 50 }),                                      // P1: snake vs camelCase
    col('hr', 'employee_records', 'last_name',       4, 'character varying(50)',  'varchar',  { maxLength: 50 }),
    col('hr', 'employee_records', 'hire_date',       5, 'date',                   'date'),
    col('hr', 'employee_records', 'termination_date',6, 'date',                   'date'),
    col('hr', 'employee_records', 'position_title',  7, 'character varying(100)', 'varchar',  { maxLength: 100 }),
    col('hr', 'employee_records', 'annual_salary',   8, 'numeric(12,2)',          'decimal',  { numericPrecision: 12, numericScale: 2 }),
    col('hr', 'employee_records', 'manager_id',      9, 'integer',                'integer'),                                                          // moderately null 0.45
    col('hr', 'employee_records', 'department_code', 10, 'character varying(10)', 'varchar',  { maxLength: 10 }),
  ];

  // =========================================================================
  // 3. Constraints
  // =========================================================================

  const constraints: ConstraintInfo[] = [
    // Primary keys — equipment_log & EmployeeData intentionally have NONE (P5 / P7)
    { schema: 'operations',    table: 'mine_sites',            name: 'mine_sites_pkey',            type: 'primary_key', columns: ['site_id'],   definition: null },
    { schema: 'operations',    table: 'operational_costs',     name: 'operational_costs_pkey',     type: 'primary_key', columns: ['id'],        definition: null },
    { schema: 'finance',       table: 'monthly_costs',         name: 'monthly_costs_pkey',         type: 'primary_key', columns: ['id'],        definition: null },
    { schema: 'finance',       table: 'tblAssets',             name: 'tblAssets_pkey',             type: 'primary_key', columns: ['AssetID'],   definition: null },
    { schema: 'environmental', table: 'compliance_monitoring', name: 'compliance_monitoring_pkey', type: 'primary_key', columns: ['id'],        definition: null },
    { schema: 'hr',            table: 'employee_records',      name: 'employee_records_pkey',      type: 'primary_key', columns: ['record_id'], definition: null },

    // Unique
    { schema: 'operations', table: 'mine_sites', name: 'mine_sites_site_code_key', type: 'unique', columns: ['site_code'], definition: null },

    // Foreign-key constraints (also listed in foreignKeys below)
    { schema: 'operations',    table: 'operational_costs',     name: 'operational_costs_site_id_fkey',     type: 'foreign_key', columns: ['site_id'], definition: null },
    { schema: 'environmental', table: 'compliance_monitoring', name: 'compliance_monitoring_site_id_fkey', type: 'foreign_key', columns: ['site_id'], definition: null },
    { schema: 'operations',    table: 'mine_sites',            name: 'mine_sites_manager_fkey',            type: 'foreign_key', columns: ['site_manager_id'], definition: null },
  ];

  // =========================================================================
  // 4. Indexes
  // =========================================================================
  //
  // equipment_log  → NO indexes at all          (P6: p6NoIndexes)
  // EmployeeData   → NO indexes                 (P6: p6NoIndexes)
  // =========================================================================

  const indexes: IndexInfo[] = [
    // PK indexes
    { schema: 'operations',    table: 'mine_sites',            name: 'mine_sites_pkey',            columns: ['site_id'],   isUnique: true, isPrimary: true,  type: 'btree' },
    { schema: 'operations',    table: 'operational_costs',     name: 'operational_costs_pkey',     columns: ['id'],        isUnique: true, isPrimary: true,  type: 'btree' },
    { schema: 'finance',       table: 'monthly_costs',         name: 'monthly_costs_pkey',         columns: ['id'],        isUnique: true, isPrimary: true,  type: 'btree' },
    { schema: 'finance',       table: 'tblAssets',             name: 'tblAssets_pkey',             columns: ['AssetID'],   isUnique: true, isPrimary: true,  type: 'btree' },
    { schema: 'environmental', table: 'compliance_monitoring', name: 'compliance_monitoring_pkey', columns: ['id'],        isUnique: true, isPrimary: true,  type: 'btree' },
    { schema: 'hr',            table: 'employee_records',      name: 'employee_records_pkey',      columns: ['record_id'], isUnique: true, isPrimary: true,  type: 'btree' },
    // Unique index
    { schema: 'operations',    table: 'mine_sites',            name: 'mine_sites_site_code_key',   columns: ['site_code'], isUnique: true, isPrimary: false, type: 'btree' },
  ];

  // =========================================================================
  // 5. Foreign Keys
  // =========================================================================

  const foreignKeys: ForeignKeyInfo[] = [
    {
      schema: 'operations', table: 'operational_costs', column: 'site_id',
      constraintName: 'operational_costs_site_id_fkey',
      referencedSchema: 'operations', referencedTable: 'mine_sites', referencedColumn: 'site_id',
      updateRule: 'NO ACTION', deleteRule: 'CASCADE',
    },
    {
      schema: 'environmental', table: 'compliance_monitoring', column: 'site_id',
      constraintName: 'compliance_monitoring_site_id_fkey',
      referencedSchema: 'operations', referencedTable: 'mine_sites', referencedColumn: 'site_id',
      updateRule: 'NO ACTION', deleteRule: 'SET NULL',
    },
    // Cross-schema FK  (P3: cross-schema coupling)
    {
      schema: 'operations', table: 'mine_sites', column: 'site_manager_id',
      constraintName: 'mine_sites_manager_fkey',
      referencedSchema: 'hr', referencedTable: 'EmployeeData', referencedColumn: 'employeeId',
      updateRule: 'NO ACTION', deleteRule: 'SET NULL',
    },
  ];

  // =========================================================================
  // 6. Table Statistics
  // =========================================================================

  const tableStatistics: TableStatistics[] = tables.map((t) => ({
    schema: t.schema,
    table: t.name,
    rowCount: t.rowCount ?? 0,
    deadRows: Math.floor((t.rowCount ?? 0) * 0.02),
    lastVacuum: oneWeekAgo,
    lastAnalyze: oneWeekAgo,
    lastAutoAnalyze: oneWeekAgo,
  }));

  // =========================================================================
  // 7. Column Statistics
  // =========================================================================

  const columnStatistics: ColumnStatistics[] = [

    // ── operations.mine_sites ─────────────────────────────────────────────
    cstat('operations', 'mine_sites', 'site_id',               0.0,  47),
    cstat('operations', 'mine_sites', 'site_code',             0.0,  47),
    cstat('operations', 'mine_sites', 'site_name',             0.0,  47),
    cstat('operations', 'mine_sites', 'latitude',              0.0,  47),
    cstat('operations', 'mine_sites', 'longitude',             0.0,  47),
    cstat('operations', 'mine_sites', 'ore_grade',             0.02, 38),
    cstat('operations', 'mine_sites', 'extraction_volume',     0.04, 45),
    cstat('operations', 'mine_sites', 'site_manager_id',       0.65, 12, 4),   // ← P6 high null
    cstat('operations', 'mine_sites', 'safety_incident_count', 0.0,  23, 4),
    cstat('operations', 'mine_sites', 'last_inspection_date',  0.08, 42, 4),
    cstat('operations', 'mine_sites', 'status',                0.0,  4,  12),
    cstat('operations', 'mine_sites', 'created_at',            0.0,  47),

    // ── operations.operational_costs ──────────────────────────────────────
    cstat('operations', 'operational_costs', 'id',              0.0,  1284),
    cstat('operations', 'operational_costs', 'site_id',         0.0,  47,   4),
    cstat('operations', 'operational_costs', 'cost_centre',     0.03, 18),
    cstat('operations', 'operational_costs', 'total_cost',      0.0,  1150),
    cstat('operations', 'operational_costs', 'labour_cost',     0.0,  980),
    cstat('operations', 'operational_costs', 'equipment_cost',  0.05, 870),
    cstat('operations', 'operational_costs', 'reporting_month', 0.0,  36,   4),
    cstat('operations', 'operational_costs', 'approved_by',     0.12, 28,   24),
    cstat('operations', 'operational_costs', 'notes',           0.45, 640,  120),
    cstat('operations', 'operational_costs', 'created_at',      0.0,  1284),

    // ── operations.equipment_log  (0 rows — all zeroed) ──────────────────
    cstat('operations', 'equipment_log', 'equipment_id',      0.0, 0, 4),
    cstat('operations', 'equipment_log', 'site_id',           0.0, 0, 4),
    cstat('operations', 'equipment_log', 'equipment_type',    0.0, 0, 18),
    cstat('operations', 'equipment_log', 'manufacturer',      0.0, 0, 22),
    cstat('operations', 'equipment_log', 'purchase_date',     0.0, 0, 4),
    cstat('operations', 'equipment_log', 'last_service_date', 0.0, 0, 4),
    cstat('operations', 'equipment_log', 'condition_rating',  0.0, 0, 4),
    cstat('operations', 'equipment_log', 'decommissioned',    0.0, 0, 1),

    // ── finance.monthly_costs ────────────────────────────────────────────
    cstat('finance', 'monthly_costs', 'id',                0.0,  864),
    cstat('finance', 'monthly_costs', 'department',        0.0,  12,  16),
    cstat('finance', 'monthly_costs', 'cost_centre',       0.0,  18,  4),
    cstat('finance', 'monthly_costs', 'total_cost',        0.0,  780, 14),
    cstat('finance', 'monthly_costs', 'budget_allocation', 0.02, 720),
    cstat('finance', 'monthly_costs', 'variance',          0.02, 680),
    cstat('finance', 'monthly_costs', 'fiscal_year',       0.0,  3,   4),
    cstat('finance', 'monthly_costs', 'fiscal_quarter',    0.0,  4,   4),
    cstat('finance', 'monthly_costs', 'approved',          0.0,  2,   1),
    cstat('finance', 'monthly_costs', 'last_audit_date',   0.71, 42,  4),    // ← P6 high null

    // ── finance.tblAssets ────────────────────────────────────────────────
    cstat('finance', 'tblAssets', 'AssetID',          0.0,  523),
    cstat('finance', 'tblAssets', 'AssetName',        0.0,  498,  28),
    cstat('finance', 'tblAssets', 'PurchaseDate',     0.0,  412,  4),
    cstat('finance', 'tblAssets', 'PurchasePrice',    0.0,  490),
    cstat('finance', 'tblAssets', 'DepreciationRate', 0.05, 18),
    cstat('finance', 'tblAssets', 'CurrentValue',     0.0,  510),
    cstat('finance', 'tblAssets', 'Location',         0.08, 47,   22),
    cstat('finance', 'tblAssets', 'assignedTo',       0.22, 180,  24),
    cstat('finance', 'tblAssets', 'last_maintenance', 0.35, 380,  4),

    // ── environmental.compliance_monitoring  (3 cols > 0.7 null) ─────────
    cstat('environmental', 'compliance_monitoring', 'id',                       0.0,  2156),
    cstat('environmental', 'compliance_monitoring', 'site_id',                  0.0,  47,   4),
    cstat('environmental', 'compliance_monitoring', 'monitoring_date',          0.0,  730,  4),
    cstat('environmental', 'compliance_monitoring', 'air_quality_index',        0.05, 1840),
    cstat('environmental', 'compliance_monitoring', 'water_ph_level',           0.03, 156),
    cstat('environmental', 'compliance_monitoring', 'noise_level_db',           0.04, 890),
    cstat('environmental', 'compliance_monitoring', 'environmental_cert_date',  0.82, 38,   4),   // ← P6 very high null
    cstat('environmental', 'compliance_monitoring', 'inspector_name',           0.06, 14,   22),
    cstat('environmental', 'compliance_monitoring', 'compliance_status',        0.0,  4,    12),
    cstat('environmental', 'compliance_monitoring', 'remediation_required',     0.0,  2,    1),
    cstat('environmental', 'compliance_monitoring', 'followup_date',            0.73, 320,  4),   // ← P6 high null
    cstat('environmental', 'compliance_monitoring', 'penalty_amount',           0.75, 85),         // ← P6 high null

    // ── hr.EmployeeData ─────────────────────────────────────────────────
    cstat('hr', 'EmployeeData', 'employeeId',   0.0,  1842),
    cstat('hr', 'EmployeeData', 'firstName',    0.0,  412,  14),
    cstat('hr', 'EmployeeData', 'lastName',     0.0,  856,  16),
    cstat('hr', 'EmployeeData', 'employee_id',  0.0,  1842, 10),
    cstat('hr', 'EmployeeData', 'DateOfBirth',  0.02, 1680, 4),
    cstat('hr', 'EmployeeData', 'department',   0.0,  12,   16),
    cstat('hr', 'EmployeeData', 'site_code',    0.08, 47),
    cstat('hr', 'EmployeeData', 'salary',       0.0,  1420),
    cstat('hr', 'EmployeeData', 'StartDate',    0.0,  1580, 4),
    cstat('hr', 'EmployeeData', 'is_active',    0.0,  2,    1),

    // ── hr.employee_records ─────────────────────────────────────────────
    cstat('hr', 'employee_records', 'record_id',        0.0,  1842),
    cstat('hr', 'employee_records', 'employee_id',      0.0,  1842, 4),
    cstat('hr', 'employee_records', 'first_name',       0.0,  412,  14),
    cstat('hr', 'employee_records', 'last_name',        0.0,  856,  16),
    cstat('hr', 'employee_records', 'hire_date',        0.0,  1580, 4),
    cstat('hr', 'employee_records', 'termination_date', 0.42, 320,  4),
    cstat('hr', 'employee_records', 'position_title',   0.0,  86,   24),
    cstat('hr', 'employee_records', 'annual_salary',    0.0,  1420),
    cstat('hr', 'employee_records', 'manager_id',       0.45, 52,   4),
    cstat('hr', 'employee_records', 'department_code',  0.0,  12,   6),
  ];

  // =========================================================================
  // Assemble
  // =========================================================================

  return {
    databaseType: 'demo',
    databaseVersion: 'Schaaq Demo Database v1.0',
    extractedAt: now,
    tables,
    columns,
    constraints,
    indexes,
    foreignKeys,
    tableStatistics,
    columnStatistics,
  };
}
