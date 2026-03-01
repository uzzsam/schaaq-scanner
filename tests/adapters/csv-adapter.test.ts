import { describe, it, expect } from 'vitest';
import { parseCsvFiles, type CsvFile } from '../../src/adapters/csv-adapter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function csvFile(name: string, content: string): CsvFile {
  return {
    originalname: name,
    buffer: Buffer.from(content, 'utf-8'),
    mimetype: 'text/csv',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CSV Adapter — parseCsvFiles', () => {
  it('parses a single CSV into SchemaData', async () => {
    const file = csvFile('customers.csv', [
      'id,name,email,created_at',
      '1,Alice,alice@example.com,2024-01-15',
      '2,Bob,bob@example.com,2024-02-20',
      '3,Carol,carol@example.com,2024-03-10',
    ].join('\n'));

    const result = await parseCsvFiles([file]);

    expect(result.fileCount).toBe(1);
    expect(result.totalRows).toBe(3);
    expect(result.schemaData.databaseType).toBe('csv');
    expect(result.schemaData.databaseVersion).toBe('CSV/Excel Upload');

    // Tables
    expect(result.schemaData.tables).toHaveLength(1);
    expect(result.schemaData.tables[0].name).toBe('customers');
    expect(result.schemaData.tables[0].schema).toBe('upload');
    expect(result.schemaData.tables[0].rowCount).toBe(3);

    // Columns
    expect(result.schemaData.columns).toHaveLength(4);
    const colNames = result.schemaData.columns.map(c => c.name);
    expect(colNames).toEqual(['id', 'name', 'email', 'created_at']);
  });

  it('infers column types correctly', async () => {
    const file = csvFile('data.csv', [
      'id,score,is_active,birthday,event_time,record_id',
      '1,99.5,true,2024-01-15,2024-01-15T10:30:00,550e8400-e29b-41d4-a716-446655440000',
      '2,88.3,false,2024-02-20,2024-02-20T14:00:00,6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      '3,77.1,true,2024-03-10,2024-03-10T09:15:00,6ba7b811-9dad-11d1-80b4-00c04fd430c8',
      '4,66.0,false,2024-04-01,2024-04-01T16:45:00,6ba7b812-9dad-11d1-80b4-00c04fd430c8',
      '5,55.9,true,2024-05-15,2024-05-15T11:00:00,6ba7b813-9dad-11d1-80b4-00c04fd430c8',
    ].join('\n'));

    const result = await parseCsvFiles([file]);
    const typeMap = new Map(result.schemaData.columns.map(c => [c.name, c.normalizedType]));

    expect(typeMap.get('id')).toBe('integer');
    expect(typeMap.get('score')).toBe('decimal');
    expect(typeMap.get('is_active')).toBe('boolean');
    expect(typeMap.get('birthday')).toBe('date');
    expect(typeMap.get('event_time')).toBe('timestamp');
    expect(typeMap.get('record_id')).toBe('uuid');
  });

  it('detects primary key on column named "id"', async () => {
    const file = csvFile('items.csv', 'id,label\n1,Widget\n2,Gadget\n');

    const result = await parseCsvFiles([file]);

    const pks = result.schemaData.constraints.filter(c => c.type === 'primary_key');
    expect(pks).toHaveLength(1);
    expect(pks[0].table).toBe('items');
    expect(pks[0].columns).toEqual(['id']);

    const pkIdx = result.schemaData.indexes.filter(i => i.isPrimary);
    expect(pkIdx).toHaveLength(1);
  });

  it('detects heuristic foreign keys from _id suffixes', async () => {
    const orders = csvFile('orders.csv', 'id,customer_id,product_id,total\n1,10,20,99.99\n');
    const customers = csvFile('customers.csv', 'id,name\n10,Alice\n');
    const products = csvFile('products.csv', 'id,label\n20,Widget\n');

    const result = await parseCsvFiles([orders, customers, products]);

    const fks = result.schemaData.foreignKeys;
    expect(fks.length).toBeGreaterThanOrEqual(2);

    const customerFk = fks.find(fk => fk.column === 'customer_id');
    expect(customerFk).toBeDefined();
    expect(customerFk!.referencedTable).toBe('customers');

    const productFk = fks.find(fk => fk.column === 'product_id');
    expect(productFk).toBeDefined();
    expect(productFk!.referencedTable).toBe('products');
  });

  it('computes null fraction in column statistics', async () => {
    const file = csvFile('stats.csv', [
      'id,notes',
      '1,some note',
      '2,',
      '3,another',
      '4,',
      '5,',
    ].join('\n'));

    const result = await parseCsvFiles([file]);
    const notesStat = result.schemaData.columnStatistics.find(
      s => s.column === 'notes'
    );

    expect(notesStat).toBeDefined();
    // 3 out of 5 are empty
    expect(notesStat!.nullFraction).toBeCloseTo(0.6, 1);
  });

  it('handles multiple files as separate tables', async () => {
    const f1 = csvFile('users.csv', 'id,name\n1,Alice\n');
    const f2 = csvFile('roles.csv', 'id,role_name\n1,admin\n');
    const f3 = csvFile('permissions.csv', 'id,label\n1,read\n');

    const result = await parseCsvFiles([f1, f2, f3]);

    expect(result.fileCount).toBe(3);
    expect(result.schemaData.tables).toHaveLength(3);
    const names = result.schemaData.tables.map(t => t.name).sort();
    expect(names).toEqual(['permissions', 'roles', 'users']);
  });

  it('sanitises table names from filenames', async () => {
    const file = csvFile('My Data Export (2024).csv', 'id,value\n1,x\n');
    const result = await parseCsvFiles([file]);
    // Should not contain spaces, parens, etc
    expect(result.schemaData.tables[0].name).toBe('my_data_export_2024');
  });

  it('skips files with no headers and adds a warning', async () => {
    const empty = csvFile('empty.csv', '');
    const valid = csvFile('valid.csv', 'id,name\n1,Alice\n');

    const result = await parseCsvFiles([empty, valid]);

    // Only the valid file should produce a table
    expect(result.schemaData.tables).toHaveLength(1);
    expect(result.schemaData.tables[0].name).toBe('valid');
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(result.warnings[0]).toContain('empty');
  });

  it('produces SchemaData consumable by all 15 checks', async () => {
    // This test verifies the structural contract: SchemaData from CSV
    // has all required fields so that ALL_CHECKS can execute without errors.
    const file = csvFile('test_table.csv', [
      'id,name,category_id,score,created_at,is_active,notes',
      '1,Widget,10,99.5,2024-01-15,true,some notes',
      '2,Gadget,20,88.3,2024-02-20,false,',
      '3,Doohickey,10,77.1,2024-03-10,true,more notes',
    ].join('\n'));

    const result = await parseCsvFiles([file]);
    const sd = result.schemaData;

    // Required fields exist
    expect(sd.databaseType).toBe('csv');
    expect(sd.databaseVersion).toBeTruthy();
    expect(sd.extractedAt).toBeTruthy();
    expect(sd.tables.length).toBeGreaterThan(0);
    expect(sd.columns.length).toBeGreaterThan(0);
    expect(Array.isArray(sd.constraints)).toBe(true);
    expect(Array.isArray(sd.indexes)).toBe(true);
    expect(Array.isArray(sd.foreignKeys)).toBe(true);
    expect(Array.isArray(sd.tableStatistics)).toBe(true);
    expect(Array.isArray(sd.columnStatistics)).toBe(true);

    // Every table has a matching TableStatistics entry
    for (const table of sd.tables) {
      const stat = sd.tableStatistics.find(s => s.table === table.name && s.schema === table.schema);
      expect(stat).toBeDefined();
    }

    // Every column has a matching ColumnStatistics entry
    for (const col of sd.columns) {
      const stat = sd.columnStatistics.find(
        s => s.table === col.table && s.column === col.name && s.schema === col.schema
      );
      expect(stat).toBeDefined();
    }

    // Verify we can run checks against the result (import dynamically)
    const { ALL_CHECKS } = await import('../../src/checks/index');
    const config = {
      organisation: {
        name: 'Test Corp',
        sector: 'mining' as const,
        revenueAUD: 100_000_000,
        totalFTE: 500,
        dataEngineers: 5,
        avgSalaryAUD: 150_000,
        avgFTESalaryAUD: 100_000,
        aiBudgetAUD: 500_000,
        csrdInScope: false,
        canonicalInvestmentAUD: 1_350_000,
      },
      thresholds: {
        entitySimilarityThreshold: 0.7,
        synonymGroups: [],
        sharedEntityThreshold: 2,
        nullRateThreshold: 0.3,
        namingConvention: 'snake_case' as const,
      },
    };

    // Should not throw
    for (const check of ALL_CHECKS) {
      const findings = check.execute(sd, config);
      expect(Array.isArray(findings)).toBe(true);
    }
  });
});
