import { describe, it, expect } from 'vitest';
import {
  p1SemanticIdentity,
  p2TypeInconsistency,
  p2UncontrolledVocab,
  p3DomainOverlap,
  p3CrossSchemaCoupling,
  p4CsvImportPattern,
  p4IslandTables,
  p4WideTables,
  p5NamingViolations,
  p5MissingPk,
  p5Undocumented,
  p6HighNullRate,
  p6NoIndexes,
  p7MissingAudit,
  p7NoConstraints,
} from '../../src/checks/index';
import type { SchemaData, ColumnInfo, TableInfo, ConstraintInfo, ForeignKeyInfo, IndexInfo, TableStatistics, ColumnStatistics, ObjectComment } from '../../src/adapters/types';
import type { ScannerConfig } from '../../src/checks/types';

// =============================================================================
// Helpers
// =============================================================================

function makeSchemaData(overrides: Partial<SchemaData> = {}): SchemaData {
  return {
    databaseType: 'postgresql',
    databaseVersion: '16.0',
    extractedAt: '2024-01-01T00:00:00Z',
    tables: [],
    columns: [],
    constraints: [],
    indexes: [],
    foreignKeys: [],
    tableStatistics: [],
    columnStatistics: [],
    comments: [],
    ...overrides,
  };
}

function makeConfig(overrides: Partial<ScannerConfig> = {}): ScannerConfig {
  return {
    organisation: {
      name: 'Test Corp',
      sector: 'mining',
      revenueAUD: 100_000_000,
      totalFTE: 500,
      dataEngineers: 10,
      avgSalaryAUD: 150_000,
      avgFTESalaryAUD: 100_000,
      csrdInScope: false,
    },
    thresholds: {},
    ...overrides,
  };
}

function makeColumn(schema: string, table: string, name: string, normalizedType: ColumnInfo['normalizedType'] = 'integer'): ColumnInfo {
  return {
    schema, table, name,
    ordinalPosition: 1,
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

function makeTable(schema: string, name: string, type: TableInfo['type'] = 'table'): TableInfo {
  return {
    schema, name, type,
    rowCount: 1000,
    sizeBytes: 65536,
    createdAt: null,
    lastModified: null,
    comment: null,
  };
}

const cfg = makeConfig();

// =============================================================================
// P1 — Semantic Identity
// =============================================================================
describe('P1 — Semantic Identity', () => {
  it('returns empty when no columns', () => {
    const schema = makeSchemaData();
    const findings = p1SemanticIdentity.execute(schema, cfg);
    expect(findings).toHaveLength(0);
  });

  it('detects synonym group clusters', () => {
    const schema = makeSchemaData({
      columns: [
        makeColumn('public', 'assets', 'site_id'),
        makeColumn('public', 'inspections', 'location_id'),
        makeColumn('mining', 'projects', 'facility_id'),
      ],
    });
    const findings = p1SemanticIdentity.execute(schema, cfg);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].property).toBe(1);
    expect(findings[0].checkId).toBe('P1-SEMANTIC-IDENTITY');
    expect(findings[0].evidence.length).toBeGreaterThan(0);
    expect(findings[0].rawScore).toBe(0); // Not yet scored
  });

  it('detects Levenshtein-similar stems', () => {
    const schema = makeSchemaData({
      columns: [
        makeColumn('public', 'orders', 'customer_id'),
        makeColumn('public', 'invoices', 'custmer_id'),
      ],
    });
    const findings = p1SemanticIdentity.execute(schema, cfg);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].property).toBe(1);
  });

  it('does not cluster dissimilar stems', () => {
    const schema = makeSchemaData({
      columns: [
        makeColumn('public', 'orders', 'order_id'),
        makeColumn('public', 'products', 'product_id'),
      ],
    });
    const findings = p1SemanticIdentity.execute(schema, cfg);
    expect(findings).toHaveLength(0);
  });
});

// =============================================================================
// P2 — Type Inconsistency
// =============================================================================
describe('P2 — Type Inconsistency', () => {
  it('returns empty when no columns appear in multiple tables', () => {
    const schema = makeSchemaData({
      columns: [
        makeColumn('public', 'users', 'name', 'varchar'),
      ],
    });
    const findings = p2TypeInconsistency.execute(schema, cfg);
    expect(findings).toHaveLength(0);
  });

  it('detects same column name with different types', () => {
    const schema = makeSchemaData({
      columns: [
        makeColumn('public', 'users', 'status', 'varchar'),
        makeColumn('public', 'orders', 'status', 'integer'),
      ],
    });
    const findings = p2TypeInconsistency.execute(schema, cfg);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].property).toBe(2);
    expect(findings[0].checkId).toBe('P2-TYPE-INCONSISTENCY');
    expect(findings[0].evidence.length).toBeGreaterThan(0);
    expect(findings[0].ratio).toBeGreaterThanOrEqual(0);
    expect(findings[0].ratio).toBeLessThanOrEqual(1);
  });

  it('ignores columns with consistent types', () => {
    const schema = makeSchemaData({
      columns: [
        makeColumn('public', 'users', 'created_at', 'timestamp'),
        makeColumn('public', 'orders', 'created_at', 'timestamp'),
      ],
    });
    const findings = p2TypeInconsistency.execute(schema, cfg);
    expect(findings).toHaveLength(0);
  });
});

// =============================================================================
// P2 — Uncontrolled Vocab
// =============================================================================
describe('P2 — Uncontrolled Vocab', () => {
  it('returns empty with no string columns', () => {
    const schema = makeSchemaData({
      columns: [makeColumn('public', 'users', 'age', 'integer')],
      columnStatistics: [{ schema: 'public', table: 'users', column: 'age', nullFraction: 0, distinctCount: 10, avgWidth: 4, correlation: 1 }],
    });
    const findings = p2UncontrolledVocab.execute(schema, cfg);
    expect(findings).toHaveLength(0);
  });

  it('detects low-cardinality string without FK', () => {
    const schema = makeSchemaData({
      columns: [makeColumn('public', 'orders', 'status', 'varchar')],
      columnStatistics: [
        { schema: 'public', table: 'orders', column: 'status', nullFraction: 0, distinctCount: 10, avgWidth: 8, correlation: 0.5 },
      ],
      foreignKeys: [],
    });
    const findings = p2UncontrolledVocab.execute(schema, cfg);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].property).toBe(2);
    expect(findings[0].checkId).toBe('P2-UNCONTROLLED-VOCAB');
    expect(findings[0].evidence.length).toBeGreaterThan(0);
  });

  it('ignores string columns with FK constraint', () => {
    const schema = makeSchemaData({
      columns: [makeColumn('public', 'orders', 'status', 'varchar')],
      columnStatistics: [
        { schema: 'public', table: 'orders', column: 'status', nullFraction: 0, distinctCount: 10, avgWidth: 8, correlation: 0.5 },
      ],
      foreignKeys: [
        { schema: 'public', table: 'orders', column: 'status', constraintName: 'fk_status', referencedSchema: 'public', referencedTable: 'statuses', referencedColumn: 'code', updateRule: 'NO ACTION', deleteRule: 'NO ACTION' },
      ],
    });
    const findings = p2UncontrolledVocab.execute(schema, cfg);
    expect(findings).toHaveLength(0);
  });
});

// =============================================================================
// P3 — Domain Overlap
// =============================================================================
describe('P3 — Domain Overlap', () => {
  it('returns empty when no table name duplicates', () => {
    const schema = makeSchemaData({
      tables: [makeTable('public', 'users'), makeTable('mining', 'sites')],
    });
    const findings = p3DomainOverlap.execute(schema, cfg);
    expect(findings).toHaveLength(0);
  });

  it('detects table name shared across schemas', () => {
    const schema = makeSchemaData({
      tables: [
        makeTable('public', 'users'),
        makeTable('mining', 'users'),
      ],
    });
    const findings = p3DomainOverlap.execute(schema, cfg);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].property).toBe(3);
    expect(findings[0].checkId).toBe('P3-DOMAIN-OVERLAP');
  });
});

// =============================================================================
// P3 — Cross-Schema Coupling
// =============================================================================
describe('P3 — Cross-Schema Coupling', () => {
  it('returns empty with no FKs', () => {
    const schema = makeSchemaData();
    const findings = p3CrossSchemaCoupling.execute(schema, cfg);
    expect(findings).toHaveLength(0);
  });

  it('detects cross-schema FK', () => {
    const schema = makeSchemaData({
      foreignKeys: [
        { schema: 'public', table: 'orders', column: 'customer_id', constraintName: 'fk_customer', referencedSchema: 'mining', referencedTable: 'customers', referencedColumn: 'id', updateRule: 'NO ACTION', deleteRule: 'NO ACTION' },
      ],
    });
    const findings = p3CrossSchemaCoupling.execute(schema, cfg);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].property).toBe(3);
    expect(findings[0].checkId).toBe('P3-CROSS-SCHEMA-COUPLING');
    expect(findings[0].ratio).toBe(1); // 1/1 FKs are cross-schema
  });

  it('ignores same-schema FK', () => {
    const schema = makeSchemaData({
      foreignKeys: [
        { schema: 'public', table: 'orders', column: 'customer_id', constraintName: 'fk_customer', referencedSchema: 'public', referencedTable: 'customers', referencedColumn: 'id', updateRule: 'NO ACTION', deleteRule: 'NO ACTION' },
      ],
    });
    const findings = p3CrossSchemaCoupling.execute(schema, cfg);
    expect(findings).toHaveLength(0);
  });
});

// =============================================================================
// P4 — CSV Import Pattern
// =============================================================================
describe('P4 — CSV Import Pattern', () => {
  it('returns empty when no patterns match', () => {
    const schema = makeSchemaData({
      tables: [makeTable('public', 'users'), makeTable('public', 'orders')],
      columns: [
        makeColumn('public', 'users', 'id'),
        makeColumn('public', 'orders', 'id'),
      ],
    });
    const findings = p4CsvImportPattern.execute(schema, cfg);
    expect(findings).toHaveLength(0);
  });

  it('detects staging/import table names', () => {
    const schema = makeSchemaData({
      tables: [
        makeTable('public', 'stg_customers'),
        makeTable('public', 'csv_data_load'),
        makeTable('public', 'users'),
      ],
      columns: [
        makeColumn('public', 'stg_customers', 'id'),
        makeColumn('public', 'csv_data_load', 'id'),
        makeColumn('public', 'users', 'id'),
      ],
    });
    const findings = p4CsvImportPattern.execute(schema, cfg);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].property).toBe(4);
  });
});

// =============================================================================
// P4 — Island Tables
// =============================================================================
describe('P4 — Island Tables', () => {
  it('returns empty when all tables have FK relationships', () => {
    const schema = makeSchemaData({
      tables: [makeTable('public', 'users'), makeTable('public', 'orders')],
      foreignKeys: [
        { schema: 'public', table: 'orders', column: 'user_id', constraintName: 'fk_user', referencedSchema: 'public', referencedTable: 'users', referencedColumn: 'id', updateRule: 'NO ACTION', deleteRule: 'NO ACTION' },
      ],
    });
    const findings = p4IslandTables.execute(schema, cfg);
    expect(findings).toHaveLength(0);
  });

  it('detects tables with no FK at all', () => {
    const schema = makeSchemaData({
      tables: [makeTable('public', 'users'), makeTable('public', 'orphan')],
      foreignKeys: [],
      columns: [
        makeColumn('public', 'orphan', 'id'),
        makeColumn('public', 'orphan', 'name', 'varchar'),
      ],
    });
    const findings = p4IslandTables.execute(schema, cfg);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].property).toBe(4);
    expect(findings[0].checkId).toBe('P4-ISLAND-TABLES');
  });
});

// =============================================================================
// P4 — Wide Tables
// =============================================================================
describe('P4 — Wide Tables', () => {
  it('returns empty when all tables are narrow', () => {
    const schema = makeSchemaData({
      tables: [makeTable('public', 'users')],
      columns: Array.from({ length: 5 }, (_, i) =>
        makeColumn('public', 'users', `col_${i}`),
      ),
    });
    const findings = p4WideTables.execute(schema, cfg);
    expect(findings).toHaveLength(0);
  });

  it('detects table with 35 columns', () => {
    const schema = makeSchemaData({
      tables: [makeTable('public', 'big_table')],
      columns: Array.from({ length: 35 }, (_, i) =>
        makeColumn('public', 'big_table', `col_${i}`),
      ),
    });
    const findings = p4WideTables.execute(schema, cfg);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].property).toBe(4);
    expect(findings[0].checkId).toBe('P4-WIDE-TABLES');
    expect(findings[0].evidence.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// P5 — Naming Violations
// =============================================================================
describe('P5 — Naming Violations', () => {
  it('returns empty when all columns follow same convention', () => {
    const schema = makeSchemaData({
      columns: [
        makeColumn('public', 'users', 'first_name'),
        makeColumn('public', 'users', 'last_name'),
        makeColumn('public', 'users', 'email_address'),
      ],
    });
    const findings = p5NamingViolations.execute(schema, cfg);
    expect(findings).toHaveLength(0);
  });

  it('detects mixed naming conventions', () => {
    const schema = makeSchemaData({
      columns: [
        makeColumn('public', 'users', 'first_name'),
        makeColumn('public', 'users', 'last_name'),
        makeColumn('public', 'users', 'email_address'),
        makeColumn('public', 'users', 'phone_number'),
        makeColumn('public', 'users', 'homeAddress'),    // camelCase violation
        makeColumn('public', 'users', 'zipCode'),        // camelCase violation
      ],
    });
    const findings = p5NamingViolations.execute(schema, cfg);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].property).toBe(5);
    expect(findings[0].checkId).toBe('p5-naming-violations');
  });
});

// =============================================================================
// P5 — Missing PK
// =============================================================================
describe('P5 — Missing PK', () => {
  it('returns empty when all tables have PKs', () => {
    const schema = makeSchemaData({
      tables: [makeTable('public', 'users')],
      constraints: [
        { schema: 'public', table: 'users', name: 'pk_users', type: 'primary_key', columns: ['id'], definition: null },
      ],
    });
    const findings = p5MissingPk.execute(schema, cfg);
    expect(findings).toHaveLength(0);
  });

  it('detects table without PK constraint', () => {
    const schema = makeSchemaData({
      tables: [makeTable('public', 'users'), makeTable('public', 'logs')],
      constraints: [
        { schema: 'public', table: 'users', name: 'pk_users', type: 'primary_key', columns: ['id'], definition: null },
      ],
    });
    const findings = p5MissingPk.execute(schema, cfg);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].property).toBe(5);
    expect(findings[0].checkId).toBe('p5-missing-pk');
    expect(findings[0].affectedObjects).toBe(1);
  });
});

// =============================================================================
// P5 — Undocumented
// =============================================================================
describe('P5 — Undocumented', () => {
  it('returns empty when comments metadata is absent', () => {
    const schema = makeSchemaData({
      tables: [makeTable('public', 'users')],
      comments: [],
    });
    const findings = p5Undocumented.execute(schema, cfg);
    expect(findings).toHaveLength(0);
  });

  it('detects undocumented tables', () => {
    const schema = makeSchemaData({
      tables: [makeTable('public', 'users'), makeTable('public', 'orders')],
      comments: [
        { schema: 'public', objectType: 'table', objectName: 'users', columnName: null, comment: 'User accounts' },
      ],
    });
    const findings = p5Undocumented.execute(schema, cfg);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].property).toBe(5);
    expect(findings[0].checkId).toBe('p5-undocumented');
    expect(findings[0].affectedObjects).toBe(1); // Only 'orders' is undocumented
  });
});

// =============================================================================
// P6 — High Null Rate
// =============================================================================
describe('P6 — High Null Rate', () => {
  it('returns empty when no stats exceed threshold', () => {
    const schema = makeSchemaData({
      columnStatistics: [
        { schema: 'public', table: 'users', column: 'name', nullFraction: 0.1, distinctCount: 50, avgWidth: 10, correlation: 0.8 },
      ],
    });
    const findings = p6HighNullRate.execute(schema, cfg);
    expect(findings).toHaveLength(0);
  });

  it('detects columns above null threshold', () => {
    const schema = makeSchemaData({
      columnStatistics: [
        { schema: 'public', table: 'users', column: 'middle_name', nullFraction: 0.8, distinctCount: 20, avgWidth: 10, correlation: 0.1 },
        { schema: 'public', table: 'users', column: 'name', nullFraction: 0.05, distinctCount: 100, avgWidth: 10, correlation: 0.9 },
      ],
    });
    const findings = p6HighNullRate.execute(schema, cfg);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].property).toBe(6);
    expect(findings[0].checkId).toBe('p6-high-null-rate');
    expect(findings[0].affectedObjects).toBe(1);
    expect(findings[0].totalObjects).toBe(2);
  });
});

// =============================================================================
// P6 — No Indexes
// =============================================================================
describe('P6 — No Indexes', () => {
  it('returns empty when all data tables have indexes', () => {
    const schema = makeSchemaData({
      tables: [makeTable('public', 'users')],
      tableStatistics: [
        { schema: 'public', table: 'users', rowCount: 500, deadRows: 0, lastVacuum: null, lastAnalyze: null, lastAutoAnalyze: null },
      ],
      indexes: [
        { schema: 'public', table: 'users', name: 'idx_users_pk', columns: ['id'], isUnique: true, isPrimary: true, type: 'btree' },
      ],
    });
    const findings = p6NoIndexes.execute(schema, cfg);
    expect(findings).toHaveLength(0);
  });

  it('detects data table without indexes', () => {
    const schema = makeSchemaData({
      tables: [makeTable('public', 'logs')],
      tableStatistics: [
        { schema: 'public', table: 'logs', rowCount: 500, deadRows: 0, lastVacuum: null, lastAnalyze: null, lastAutoAnalyze: null },
      ],
      indexes: [],
    });
    const findings = p6NoIndexes.execute(schema, cfg);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].property).toBe(6);
    expect(findings[0].checkId).toBe('p6-no-indexes');
  });
});

// =============================================================================
// P7 — Missing Audit
// =============================================================================
describe('P7 — Missing Audit', () => {
  it('returns empty when all tables have audit columns', () => {
    const schema = makeSchemaData({
      tables: [makeTable('public', 'users')],
      columns: [
        makeColumn('public', 'users', 'id'),
        makeColumn('public', 'users', 'created_at', 'timestamp'),
        makeColumn('public', 'users', 'updated_at', 'timestamp'),
      ],
    });
    const findings = p7MissingAudit.execute(schema, cfg);
    expect(findings).toHaveLength(0);
  });

  it('detects tables without audit columns', () => {
    const schema = makeSchemaData({
      tables: [makeTable('public', 'users'), makeTable('public', 'logs')],
      columns: [
        makeColumn('public', 'users', 'id'),
        makeColumn('public', 'users', 'created_at', 'timestamp'),
        makeColumn('public', 'users', 'updated_at', 'timestamp'),
        makeColumn('public', 'logs', 'id'),
        makeColumn('public', 'logs', 'message', 'text'),
      ],
    });
    const findings = p7MissingAudit.execute(schema, cfg);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].property).toBe(7);
  });
});

// =============================================================================
// P7 — No Constraints
// =============================================================================
describe('P7 — No Constraints', () => {
  it('returns empty when all tables have constraints', () => {
    const schema = makeSchemaData({
      tables: [makeTable('public', 'users')],
      constraints: [
        { schema: 'public', table: 'users', name: 'pk_users', type: 'primary_key', columns: ['id'], definition: null },
      ],
    });
    const findings = p7NoConstraints.execute(schema, cfg);
    expect(findings).toHaveLength(0);
  });

  it('detects tables with zero constraints', () => {
    const schema = makeSchemaData({
      tables: [makeTable('public', 'users'), makeTable('public', 'temp_data')],
      constraints: [
        { schema: 'public', table: 'users', name: 'pk_users', type: 'primary_key', columns: ['id'], definition: null },
      ],
    });
    const findings = p7NoConstraints.execute(schema, cfg);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].property).toBe(7);
    expect(findings[0].affectedObjects).toBe(1);
    expect(findings[0].evidence.length).toBe(1);
  });
});

// =============================================================================
// CSV Source — checks should not over-penalise optional null fields
// =============================================================================
describe('CSV source — null rate tolerance', () => {
  const csvSchema = makeSchemaData({
    databaseType: 'csv',
    databaseVersion: 'CSV/Excel Upload',
    columnStatistics: [
      // 80% null — typical optional field (e.g. secondary_email)
      { schema: 'upload', table: 'contacts', column: 'secondary_email', nullFraction: 0.8, distinctCount: 15, avgWidth: null, correlation: null },
      // 96% null — clearly unused optional field, should be skipped entirely
      { schema: 'upload', table: 'contacts', column: 'fax_number', nullFraction: 0.96, distinctCount: 3, avgWidth: null, correlation: null },
      // 5% null — populated field, should never trigger
      { schema: 'upload', table: 'contacts', column: 'name', nullFraction: 0.05, distinctCount: 80, avgWidth: null, correlation: null },
    ],
  });

  const pgSchema = makeSchemaData({
    databaseType: 'postgresql',
    databaseVersion: '16.0',
    columnStatistics: [
      { schema: 'public', table: 'contacts', column: 'secondary_email', nullFraction: 0.8, distinctCount: 15, avgWidth: 20, correlation: 0.1 },
      { schema: 'public', table: 'contacts', column: 'fax_number', nullFraction: 0.96, distinctCount: 3, avgWidth: 12, correlation: 0.1 },
      { schema: 'public', table: 'contacts', column: 'name', nullFraction: 0.05, distinctCount: 80, avgWidth: 10, correlation: 0.9 },
    ],
  });

  it('CSV with 80% null optional columns produces fewer findings than PostgreSQL', () => {
    const csvFindings = p6HighNullRate.execute(csvSchema, cfg);
    const pgFindings = p6HighNullRate.execute(pgSchema, cfg);

    // PostgreSQL should flag both secondary_email (80%) and fax_number (96%)
    expect(pgFindings.length).toBeGreaterThanOrEqual(1);
    expect(pgFindings[0].affectedObjects).toBe(2);

    // CSV should flag at most secondary_email (80% > 70% threshold)
    // but skip fax_number (96% >= 95% threshold) entirely
    if (csvFindings.length > 0) {
      expect(csvFindings[0].affectedObjects).toBe(1);
    }
  });

  it('CSV findings have downgraded severity compared to PostgreSQL', () => {
    const csvFindings = p6HighNullRate.execute(csvSchema, cfg);
    const pgFindings = p6HighNullRate.execute(pgSchema, cfg);

    if (csvFindings.length > 0 && pgFindings.length > 0) {
      const severityRank = { info: 0, minor: 1, major: 2, critical: 3 };
      expect(severityRank[csvFindings[0].severity]).toBeLessThan(
        severityRank[pgFindings[0].severity],
      );
    }
  });

  it('CSV with all columns below 70% null produces no findings', () => {
    const schema = makeSchemaData({
      databaseType: 'csv',
      columnStatistics: [
        { schema: 'upload', table: 'data', column: 'notes', nullFraction: 0.6, distinctCount: 30, avgWidth: null, correlation: null },
        { schema: 'upload', table: 'data', column: 'phone', nullFraction: 0.4, distinctCount: 50, avgWidth: null, correlation: null },
      ],
    });
    const findings = p6HighNullRate.execute(schema, cfg);
    expect(findings).toHaveLength(0);
  });
});

describe('CSV source — checks that should be skipped entirely', () => {
  const csvSchema = makeSchemaData({
    databaseType: 'csv',
    databaseVersion: 'CSV/Excel Upload',
    tables: [makeTable('upload', 'stg_customers'), makeTable('upload', 'csv_data')],
    columns: [
      makeColumn('upload', 'stg_customers', 'id'),
      makeColumn('upload', 'stg_customers', 'source_file', 'varchar'),
      makeColumn('upload', 'csv_data', 'id'),
    ],
    constraints: [],
    indexes: [],
    tableStatistics: [
      { schema: 'upload', table: 'stg_customers', rowCount: 500, deadRows: null, lastVacuum: null, lastAnalyze: null, lastAutoAnalyze: null },
      { schema: 'upload', table: 'csv_data', rowCount: 200, deadRows: null, lastVacuum: null, lastAnalyze: null, lastAutoAnalyze: null },
    ],
  });

  it('p6NoIndexes returns empty for CSV source', () => {
    const findings = p6NoIndexes.execute(csvSchema, cfg);
    expect(findings).toHaveLength(0);
  });

  it('p7NoConstraints returns empty for CSV source', () => {
    const findings = p7NoConstraints.execute(csvSchema, cfg);
    expect(findings).toHaveLength(0);
  });

  it('p4CsvImportPattern returns empty for CSV source', () => {
    const findings = p4CsvImportPattern.execute(csvSchema, cfg);
    expect(findings).toHaveLength(0);
  });
});

describe('CSV source — p5MissingPk severity downgrade', () => {
  it('CSV source downgrades severity and uses CSV-specific remediation', () => {
    const csvSchema = makeSchemaData({
      databaseType: 'csv',
      tables: [makeTable('upload', 'contacts'), makeTable('upload', 'notes')],
      constraints: [],
    });
    const pgSchema = makeSchemaData({
      databaseType: 'postgresql',
      tables: [makeTable('public', 'contacts'), makeTable('public', 'notes')],
      constraints: [],
    });

    const csvFindings = p5MissingPk.execute(csvSchema, cfg);
    const pgFindings = p5MissingPk.execute(pgSchema, cfg);

    expect(csvFindings.length).toBeGreaterThanOrEqual(1);
    expect(pgFindings.length).toBeGreaterThanOrEqual(1);

    // CSV severity should be lower
    const severityRank = { info: 0, minor: 1, major: 2, critical: 3 };
    expect(severityRank[csvFindings[0].severity]).toBeLessThan(
      severityRank[pgFindings[0].severity],
    );

    // CSV remediation should mention CSV files
    expect(csvFindings[0].remediation).toContain('CSV');
  });
});

// =============================================================================
// ALL_CHECKS array validation
// =============================================================================
describe('ALL_CHECKS array', () => {
  it('has 15 checks', async () => {
    const { ALL_CHECKS } = await import('../../src/checks/index');
    expect(ALL_CHECKS).toHaveLength(15);
  });

  it('covers all 7 properties', async () => {
    const { ALL_CHECKS } = await import('../../src/checks/index');
    const properties = new Set(ALL_CHECKS.map((c) => c.property));
    expect(properties.size).toBe(7);
    for (let p = 1; p <= 7; p++) {
      expect(properties.has(p as 1|2|3|4|5|6|7)).toBe(true);
    }
  });

  it('all checks have unique IDs', async () => {
    const { ALL_CHECKS } = await import('../../src/checks/index');
    const ids = ALL_CHECKS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
