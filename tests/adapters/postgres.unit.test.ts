// =============================================================================
// PostgreSQL Adapter — Unit Tests (no Docker required)
//
// Tests the pure logic of the adapter: type normalisation, exclusion filtering,
// query result mapping, and adapter construction. Uses mock pg.Client to
// simulate database responses.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { normalizePostgresType, DEFAULT_EXCLUDE_PATTERNS, PostgreSQLAdapter } from '../../src/adapters/postgres';
import type { NormalizedType } from '../../src/adapters/types';

// =============================================================================
// Type Normalisation Tests
// =============================================================================

describe('normalizePostgresType', () => {
  const cases: Array<[string, NormalizedType]> = [
    // Integer types
    ['int2', 'smallint'],
    ['int4', 'integer'],
    ['int8', 'bigint'],
    // Float types
    ['float4', 'float'],
    ['float8', 'double'],
    // Decimal types
    ['numeric', 'decimal'],
    ['money', 'decimal'],
    // String types
    ['text', 'text'],
    ['varchar', 'varchar'],
    ['bpchar', 'char'],
    // Boolean
    ['bool', 'boolean'],
    // Date/time types
    ['date', 'date'],
    ['timestamp', 'timestamp'],
    ['timestamptz', 'timestamp_tz'],
    ['time', 'time'],
    ['timetz', 'time'],
    // UUID
    ['uuid', 'uuid'],
    // JSON types
    ['json', 'json'],
    ['jsonb', 'jsonb'],
    // Binary
    ['bytea', 'binary'],
    // Array types (explicit)
    ['_text', 'array'],
    ['_int4', 'array'],
    ['_int8', 'array'],
    ['_float4', 'array'],
    ['_float8', 'array'],
    ['_varchar', 'array'],
    ['_bool', 'array'],
    ['_uuid', 'array'],
    ['_numeric', 'array'],
    ['_timestamp', 'array'],
    ['_timestamptz', 'array'],
    ['_date', 'array'],
    ['_jsonb', 'array'],
    // Unknown array types (generic _ prefix)
    ['_citext', 'array'],
    ['_hstore', 'array'],
    // Unknown types
    ['citext', 'other'],
    ['hstore', 'other'],
    ['geometry', 'other'],
    ['tsvector', 'other'],
    ['xml', 'other'],
    ['inet', 'other'],
    ['macaddr', 'other'],
  ];

  for (const [input, expected] of cases) {
    it(`should normalise "${input}" to "${expected}"`, () => {
      expect(normalizePostgresType(input)).toBe(expected);
    });
  }
});

// =============================================================================
// Default Exclusion Patterns
// =============================================================================

describe('DEFAULT_EXCLUDE_PATTERNS', () => {
  it('should have 9 default exclusion patterns', () => {
    expect(DEFAULT_EXCLUDE_PATTERNS).toHaveLength(9);
  });

  const shouldExclude: string[] = [
    '_prisma_migrations',
    'flyway_schema_history',
    'flyway_other',
    'knex_migrations',
    'knex_migrations_lock',
    'typeorm_metadata',
    'schema_migrations',
    'pg_stat_statements',
    'spatial_ref_sys',
    'geometry_columns',
    'geography_columns',
  ];

  for (const table of shouldExclude) {
    it(`should match excluded table "${table}"`, () => {
      const matches = DEFAULT_EXCLUDE_PATTERNS.some(
        (p) => new RegExp(p).test(table)
      );
      expect(matches).toBe(true);
    });
  }

  const shouldNotExclude: string[] = [
    'sites',
    'organisations',
    'monitoring_results',
    'users',
    'orders',
    'prisma_data', // doesn't start with _prisma
    'my_flyway',   // doesn't start with flyway_
  ];

  for (const table of shouldNotExclude) {
    it(`should NOT match table "${table}"`, () => {
      const matches = DEFAULT_EXCLUDE_PATTERNS.some(
        (p) => new RegExp(p).test(table)
      );
      expect(matches).toBe(false);
    });
  }
});

// =============================================================================
// PostgreSQLAdapter — Construction & Mock-based Tests
// =============================================================================

// Mock pg module
vi.mock('pg', () => {
  const mockQuery = vi.fn();
  const mockConnect = vi.fn().mockResolvedValue(undefined);
  const mockEnd = vi.fn().mockResolvedValue(undefined);

  return {
    Client: vi.fn().mockImplementation(() => ({
      connect: mockConnect,
      query: mockQuery,
      end: mockEnd,
    })),
    __mockQuery: mockQuery,
    __mockConnect: mockConnect,
    __mockEnd: mockEnd,
  };
});

// Get mock references
async function getMocks() {
  const pgModule = await import('pg') as any;
  return {
    mockQuery: pgModule.__mockQuery as ReturnType<typeof vi.fn>,
    mockConnect: pgModule.__mockConnect as ReturnType<typeof vi.fn>,
    mockEnd: pgModule.__mockEnd as ReturnType<typeof vi.fn>,
  };
}

describe('PostgreSQLAdapter — Construction', () => {
  it('should construct with connectionUri config', () => {
    const adapter = new PostgreSQLAdapter({
      type: 'postgresql',
      connectionUri: 'postgresql://user:pass@localhost:5432/db',
      schemas: ['public'],
      excludeTables: [],
      maxTablesPerSchema: 500,
    });
    expect(adapter).toBeDefined();
  });

  it('should construct with host/port config', () => {
    const adapter = new PostgreSQLAdapter({
      type: 'postgresql',
      host: 'localhost',
      port: 5432,
      database: 'testdb',
      username: 'user',
      password: 'pass',
      schemas: ['public', 'app'],
      excludeTables: ['^temp_'],
      maxTablesPerSchema: 1000,
    });
    expect(adapter).toBeDefined();
  });
});

describe('PostgreSQLAdapter — connect/disconnect', () => {
  let mocks: Awaited<ReturnType<typeof getMocks>>;

  beforeEach(async () => {
    mocks = await getMocks();
    mocks.mockConnect.mockClear();
    mocks.mockEnd.mockClear();
    mocks.mockQuery.mockClear();
    // Default: version query returns something
    mocks.mockQuery.mockResolvedValue({ rows: [{ version: 'PostgreSQL 16.0' }] });
  });

  it('should connect and verify pg_catalog access', async () => {
    const adapter = new PostgreSQLAdapter({
      type: 'postgresql',
      connectionUri: 'postgresql://user:pass@localhost/db',
      schemas: ['public'],
      excludeTables: [],
      maxTablesPerSchema: 500,
    });
    await adapter.connect();
    expect(mocks.mockConnect).toHaveBeenCalledOnce();
    expect(mocks.mockQuery).toHaveBeenCalledWith('SELECT version()');
  });

  it('should disconnect cleanly', async () => {
    const adapter = new PostgreSQLAdapter({
      type: 'postgresql',
      connectionUri: 'postgresql://user:pass@localhost/db',
      schemas: ['public'],
      excludeTables: [],
      maxTablesPerSchema: 500,
    });
    await adapter.connect();
    await adapter.disconnect();
    expect(mocks.mockEnd).toHaveBeenCalledOnce();
  });

  it('should handle disconnect when not connected', async () => {
    const adapter = new PostgreSQLAdapter({
      type: 'postgresql',
      connectionUri: 'postgresql://user:pass@localhost/db',
      schemas: ['public'],
      excludeTables: [],
      maxTablesPerSchema: 500,
    });
    // disconnect without connect should not throw
    await adapter.disconnect();
    expect(mocks.mockEnd).not.toHaveBeenCalled();
  });
});

describe('PostgreSQLAdapter — extractSchema with mock data', () => {
  let mocks: Awaited<ReturnType<typeof getMocks>>;

  beforeEach(async () => {
    mocks = await getMocks();
    mocks.mockConnect.mockClear();
    mocks.mockEnd.mockClear();
    mocks.mockQuery.mockClear();
  });

  it('should extract schema and apply exclusions', async () => {
    // Set up sequential mock responses for all queries
    let callCount = 0;
    mocks.mockQuery.mockImplementation(async (queryOrText: string | { text: string }) => {
      const query = typeof queryOrText === 'string' ? queryOrText : queryOrText.text;

      // connect() calls SELECT version()
      if (query === 'SELECT version()') {
        return { rows: [{ version: 'PostgreSQL 16.2' }] };
      }

      // extractSchema() calls getVersion() first
      callCount++;

      // Tables query (contains pg_class, relkind filter, and pg_total_relation_size)
      if (query.includes('pg_total_relation_size') && query.includes("c.relkind IN ('r', 'v', 'm')")) {
        return {
          rows: [
            { schema: 'public', name: 'sites', type: 'table', row_count: 100, size_bytes: 8192, comment: 'Site register' },
            { schema: 'public', name: 'orders', type: 'table', row_count: 500, size_bytes: 32768, comment: null },
            { schema: 'public', name: '_prisma_migrations', type: 'table', row_count: 10, size_bytes: 4096, comment: null },
            { schema: 'mining', name: 'bores', type: 'table', row_count: 50, size_bytes: 16384, comment: null },
          ],
        };
      }

      // Columns query (contains pg_attribute)
      if (query.includes('pg_attribute a') && query.includes('a.attnum > 0')) {
        return {
          rows: [
            { schema: 'public', table: 'sites', name: 'site_id', ordinal_position: 1, data_type: 'int4', is_nullable: false, has_default: true, default_value: "nextval('sites_site_id_seq')", max_length: null, numeric_precision: null, numeric_scale: null, comment: null },
            { schema: 'public', table: 'sites', name: 'site_name', ordinal_position: 2, data_type: 'text', is_nullable: true, has_default: false, default_value: null, max_length: null, numeric_precision: null, numeric_scale: null, comment: null },
            { schema: 'public', table: 'orders', name: 'status', ordinal_position: 2, data_type: 'varchar', is_nullable: true, has_default: false, default_value: null, max_length: 20, numeric_precision: null, numeric_scale: null, comment: null },
            { schema: 'public', table: '_prisma_migrations', name: 'id', ordinal_position: 1, data_type: 'varchar', is_nullable: false, has_default: false, default_value: null, max_length: 36, numeric_precision: null, numeric_scale: null, comment: null },
            { schema: 'mining', table: 'bores', name: 'bore_id', ordinal_position: 1, data_type: 'int4', is_nullable: false, has_default: true, default_value: "nextval('bores_bore_id_seq')", max_length: null, numeric_precision: null, numeric_scale: null, comment: null },
          ],
        };
      }

      // Constraints query
      if (query.includes('pg_constraint co')) {
        return {
          rows: [
            { schema: 'public', table: 'sites', name: 'sites_pkey', type: 'primary_key', columns: ['site_id'], definition: 'PRIMARY KEY (site_id)' },
            { schema: 'public', table: 'orders', name: 'orders_pkey', type: 'primary_key', columns: ['order_id'], definition: 'PRIMARY KEY (order_id)' },
            { schema: 'mining', table: 'bores', name: 'bores_pkey', type: 'primary_key', columns: ['bore_id'], definition: 'PRIMARY KEY (bore_id)' },
          ],
        };
      }

      // Indexes query
      if (query.includes('pg_index ix')) {
        return {
          rows: [
            { schema: 'public', table: 'sites', name: 'sites_pkey', columns: ['site_id'], is_unique: true, is_primary: true, type: 'btree' },
          ],
        };
      }

      // Foreign keys query (contains confrelid)
      if (query.includes('co.confrelid')) {
        return { rows: [] };
      }

      // Table stats
      if (query.includes('pg_stat_user_tables') && !query.includes('LIMIT 1')) {
        return {
          rows: [
            { schema: 'public', table: 'sites', row_count: 100, dead_rows: 0, last_vacuum: null, last_analyze: '2026-02-25', last_autoanalyze: null },
            { schema: 'public', table: 'orders', row_count: 500, dead_rows: 5, last_vacuum: null, last_analyze: '2026-02-25', last_autoanalyze: null },
            { schema: 'mining', table: 'bores', row_count: 50, dead_rows: 0, last_vacuum: null, last_analyze: '2026-02-25', last_autoanalyze: null },
          ],
        };
      }

      // Column stats
      if (query.includes('pg_stats')) {
        return {
          rows: [
            { schema: 'public', table: 'sites', column: 'site_name', null_fraction: 0.0, distinct_count: -1, avg_width: 15, correlation: 0.5 },
          ],
        };
      }

      // Comments query
      if (query.includes('pg_description d') && query.includes('UNION ALL')) {
        return {
          rows: [
            { schema: 'public', object_type: 'table', object_name: 'sites', column_name: null, comment: 'Site register' },
          ],
        };
      }

      // Default: empty result
      return { rows: [] };
    });

    const adapter = new PostgreSQLAdapter({
      type: 'postgresql',
      connectionUri: 'postgresql://user:pass@localhost/db',
      schemas: ['public', 'mining'],
      excludeTables: [],
      maxTablesPerSchema: 500,
    });

    await adapter.connect();
    const schema = await adapter.extractSchema();
    await adapter.disconnect();

    // Verify metadata
    expect(schema.databaseType).toBe('postgresql');
    expect(schema.databaseVersion).toBe('PostgreSQL 16.2');
    expect(schema.extractedAt).toBeDefined();

    // _prisma_migrations should be excluded by default patterns
    const tableNames = schema.tables.map(t => t.name);
    expect(tableNames).not.toContain('_prisma_migrations');
    expect(tableNames).toContain('sites');
    expect(tableNames).toContain('orders');
    expect(tableNames).toContain('bores');

    // Columns for excluded table should also be filtered
    const prismaCols = schema.columns.filter(c => c.table === '_prisma_migrations');
    expect(prismaCols).toHaveLength(0);

    // Type normalisation should be applied
    const siteIdCol = schema.columns.find(c => c.table === 'sites' && c.name === 'site_id');
    expect(siteIdCol).toBeDefined();
    expect(siteIdCol!.normalizedType).toBe('integer');

    const statusCol = schema.columns.find(c => c.table === 'orders' && c.name === 'status');
    expect(statusCol).toBeDefined();
    expect(statusCol!.normalizedType).toBe('varchar');
    expect(statusCol!.maxLength).toBe(20);

    // Comments should be present for non-excluded tables
    expect(schema.comments).toBeDefined();
    expect(schema.comments!.length).toBeGreaterThan(0);
    const siteComment = schema.comments!.find(c => c.objectName === 'sites');
    expect(siteComment).toBeDefined();
    expect(siteComment!.comment).toBe('Site register');
  });

  it('should apply custom exclusion patterns', async () => {
    mocks.mockQuery.mockImplementation(async (query: string) => {
      if (query === 'SELECT version()') {
        return { rows: [{ version: 'PostgreSQL 16.2' }] };
      }
      if (query.includes('pg_total_relation_size') && query.includes("c.relkind IN ('r', 'v', 'm')")) {
        return {
          rows: [
            { schema: 'public', name: 'sites', type: 'table', row_count: 100, size_bytes: 8192, comment: null },
            { schema: 'public', name: 'legacy_data', type: 'table', row_count: 200, size_bytes: 16384, comment: null },
            { schema: 'public', name: 'scratch_data', type: 'table', row_count: 100, size_bytes: 4096, comment: null },
            { schema: 'public', name: 'temp_import', type: 'table', row_count: 50, size_bytes: 2048, comment: null },
          ],
        };
      }
      // Return empty for all other queries
      return { rows: [] };
    });

    const adapter = new PostgreSQLAdapter({
      type: 'postgresql',
      connectionUri: 'postgresql://user:pass@localhost/db',
      schemas: ['public'],
      excludeTables: ['^legacy_', '^scratch_', '^temp_'],
      maxTablesPerSchema: 500,
    });

    await adapter.connect();
    const schema = await adapter.extractSchema();
    await adapter.disconnect();

    const tableNames = schema.tables.map(t => t.name);
    expect(tableNames).toContain('sites');
    expect(tableNames).not.toContain('legacy_data');
    expect(tableNames).not.toContain('scratch_data');
    expect(tableNames).not.toContain('temp_import');
  });

  it('should enforce maxTablesPerSchema limit', async () => {
    mocks.mockQuery.mockImplementation(async (query: string) => {
      if (query === 'SELECT version()') {
        return { rows: [{ version: 'PostgreSQL 16.2' }] };
      }
      if (query.includes('pg_total_relation_size') && query.includes("c.relkind IN ('r', 'v', 'm')")) {
        return {
          rows: [
            { schema: 'public', name: 'table_a', type: 'table', row_count: 10, size_bytes: 1024, comment: null },
            { schema: 'public', name: 'table_b', type: 'table', row_count: 20, size_bytes: 2048, comment: null },
            { schema: 'public', name: 'table_c', type: 'table', row_count: 30, size_bytes: 3072, comment: null },
            { schema: 'public', name: 'table_d', type: 'table', row_count: 40, size_bytes: 4096, comment: null },
            { schema: 'public', name: 'table_e', type: 'table', row_count: 50, size_bytes: 5120, comment: null },
            { schema: 'mining', name: 'mine_a', type: 'table', row_count: 10, size_bytes: 1024, comment: null },
            { schema: 'mining', name: 'mine_b', type: 'table', row_count: 20, size_bytes: 2048, comment: null },
            { schema: 'mining', name: 'mine_c', type: 'table', row_count: 30, size_bytes: 3072, comment: null },
          ],
        };
      }
      return { rows: [] };
    });

    const adapter = new PostgreSQLAdapter({
      type: 'postgresql',
      connectionUri: 'postgresql://user:pass@localhost/db',
      schemas: ['public', 'mining'],
      excludeTables: [],
      maxTablesPerSchema: 2, // Very restrictive
    });

    await adapter.connect();
    const schema = await adapter.extractSchema();
    await adapter.disconnect();

    const publicTables = schema.tables.filter(t => t.schema === 'public');
    const miningTables = schema.tables.filter(t => t.schema === 'mining');
    expect(publicTables.length).toBe(2);
    expect(miningTables.length).toBe(2);
  });
});

describe('PostgreSQLAdapter — checkStatsFreshness with mock', () => {
  let mocks: Awaited<ReturnType<typeof getMocks>>;

  beforeEach(async () => {
    mocks = await getMocks();
    mocks.mockConnect.mockClear();
    mocks.mockEnd.mockClear();
    mocks.mockQuery.mockClear();
  });

  it('should report fresh when ANALYZE was run recently', async () => {
    const recentDate = new Date();
    mocks.mockQuery.mockImplementation(async (query: string) => {
      if (query === 'SELECT version()') {
        return { rows: [{ version: 'PostgreSQL 16.2' }] };
      }
      if (query.includes('LIMIT 1')) {
        return {
          rows: [{
            schemaname: 'public',
            relname: 'sites',
            last_analyze: recentDate,
            last_autoanalyze: null,
            latest: recentDate,
          }],
        };
      }
      return { rows: [] };
    });

    const adapter = new PostgreSQLAdapter({
      type: 'postgresql',
      connectionUri: 'postgresql://user:pass@localhost/db',
      schemas: ['public'],
      excludeTables: [],
      maxTablesPerSchema: 500,
    });
    await adapter.connect();
    const freshness = await adapter.checkStatsFreshness();
    await adapter.disconnect();

    expect(freshness.stale).toBe(false);
    expect(freshness.warning).toBeNull();
    expect(freshness.oldestAnalyze).toBeDefined();
  });

  it('should report stale when ANALYZE is older than 7 days', async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 10); // 10 days ago
    mocks.mockQuery.mockImplementation(async (query: string) => {
      if (query === 'SELECT version()') {
        return { rows: [{ version: 'PostgreSQL 16.2' }] };
      }
      if (query.includes('LIMIT 1')) {
        return {
          rows: [{
            schemaname: 'public',
            relname: 'sites',
            last_analyze: oldDate,
            last_autoanalyze: null,
            latest: oldDate,
          }],
        };
      }
      return { rows: [] };
    });

    const adapter = new PostgreSQLAdapter({
      type: 'postgresql',
      connectionUri: 'postgresql://user:pass@localhost/db',
      schemas: ['public'],
      excludeTables: [],
      maxTablesPerSchema: 500,
    });
    await adapter.connect();
    const freshness = await adapter.checkStatsFreshness();
    await adapter.disconnect();

    expect(freshness.stale).toBe(true);
    expect(freshness.warning).toContain('stale');
    expect(freshness.warning).toContain('ANALYZE');
  });

  it('should report stale when ANALYZE has never run', async () => {
    mocks.mockQuery.mockImplementation(async (query: string) => {
      if (query === 'SELECT version()') {
        return { rows: [{ version: 'PostgreSQL 16.2' }] };
      }
      if (query.includes('LIMIT 1')) {
        return {
          rows: [{
            schemaname: 'public',
            relname: 'sites',
            last_analyze: null,
            last_autoanalyze: null,
            latest: null,
          }],
        };
      }
      return { rows: [] };
    });

    const adapter = new PostgreSQLAdapter({
      type: 'postgresql',
      connectionUri: 'postgresql://user:pass@localhost/db',
      schemas: ['public'],
      excludeTables: [],
      maxTablesPerSchema: 500,
    });
    await adapter.connect();
    const freshness = await adapter.checkStatsFreshness();
    await adapter.disconnect();

    expect(freshness.stale).toBe(true);
    expect(freshness.warning).toContain('never been run');
    expect(freshness.oldestAnalyze).toBeNull();
  });

  it('should report stale when no tables found', async () => {
    mocks.mockQuery.mockImplementation(async (query: string) => {
      if (query === 'SELECT version()') {
        return { rows: [{ version: 'PostgreSQL 16.2' }] };
      }
      if (query.includes('LIMIT 1')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const adapter = new PostgreSQLAdapter({
      type: 'postgresql',
      connectionUri: 'postgresql://user:pass@localhost/db',
      schemas: ['empty_schema'],
      excludeTables: [],
      maxTablesPerSchema: 500,
    });
    await adapter.connect();
    const freshness = await adapter.checkStatsFreshness();
    await adapter.disconnect();

    expect(freshness.stale).toBe(true);
    expect(freshness.warning).toContain('No tables found');
  });
});
