import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import { parsePowerBITemplate } from '../../src/adapters/powerbi-adapter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestPbit(schema: Record<string, unknown>): Buffer {
  const zip = new AdmZip();
  const content = Buffer.from(JSON.stringify(schema), 'utf16le');
  zip.addFile('DataModelSchema', content);
  return zip.toBuffer();
}

function minimalModel(overrides: Partial<{
  tables: unknown[];
  relationships: unknown[];
  culture: string;
  defaultPowerBIDataSourceVersion: string;
}> = {}) {
  return {
    model: {
      tables: overrides.tables ?? [{
        name: 'Sales',
        columns: [
          { name: 'OrderId', dataType: 'int64', isKey: true },
          { name: 'Amount', dataType: 'decimal' },
          { name: 'OrderDate', dataType: 'dateTime' },
          { name: 'CustomerName', dataType: 'string' },
        ],
      }],
      relationships: overrides.relationships ?? [],
      culture: overrides.culture ?? 'en-US',
      defaultPowerBIDataSourceVersion: overrides.defaultPowerBIDataSourceVersion ?? '1.38',
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Power BI Adapter — parsePowerBITemplate', () => {
  it('parses a basic model with tables and columns', () => {
    const pbit = createTestPbit(minimalModel());
    const sd = parsePowerBITemplate(pbit);

    expect(sd.databaseType).toBe('powerbi');
    expect(sd.databaseVersion).toBe('1.38');
    expect(sd.tables).toHaveLength(1);
    expect(sd.tables[0].name).toBe('Sales');
    expect(sd.tables[0].schema).toBe('semantic_model');
    expect(sd.tables[0].type).toBe('table');

    expect(sd.columns).toHaveLength(4);
    const colNames = sd.columns.map(c => c.name);
    expect(colNames).toContain('OrderId');
    expect(colNames).toContain('Amount');

    // Type mapping
    const orderIdCol = sd.columns.find(c => c.name === 'OrderId')!;
    expect(orderIdCol.dataType).toBe('bigint');
    expect(orderIdCol.normalizedType).toBe('bigint');
    expect(orderIdCol.isNullable).toBe(false); // isKey = true

    const amountCol = sd.columns.find(c => c.name === 'Amount')!;
    expect(amountCol.dataType).toBe('decimal');
    expect(amountCol.normalizedType).toBe('decimal');
    expect(amountCol.isNullable).toBe(true);
  });

  it('handles calculated columns with DAX expressions', () => {
    const model = minimalModel({
      tables: [{
        name: 'Products',
        columns: [
          { name: 'ProductId', dataType: 'int64', isKey: true },
          { name: 'Price', dataType: 'decimal' },
          { name: 'PriceWithTax', dataType: 'decimal', type: 'calculated', expression: '[Price] * 1.1' },
        ],
      }],
    });

    const pbit = createTestPbit(model);
    const sd = parsePowerBITemplate(pbit);

    const calcCol = sd.columns.find(c => c.name === 'PriceWithTax')!;
    expect(calcCol).toBeDefined();
    expect(calcCol.comment).toContain('[DAX Calculated]');
    expect(calcCol.comment).toContain('[Price] * 1.1');
  });

  it('represents measures as virtual columns with [Measure] prefix', () => {
    const model = minimalModel({
      tables: [{
        name: 'Sales',
        columns: [
          { name: 'OrderId', dataType: 'int64', isKey: true },
          { name: 'Amount', dataType: 'decimal' },
        ],
        measures: [
          { name: 'Total Revenue', expression: 'SUM(Sales[Amount])' },
          { name: 'Order Count', expression: 'COUNTROWS(Sales)' },
        ],
      }],
    });

    const pbit = createTestPbit(model);
    const sd = parsePowerBITemplate(pbit);

    const measureCols = sd.columns.filter(c => c.name.startsWith('[Measure]'));
    expect(measureCols).toHaveLength(2);

    const revMeasure = measureCols.find(c => c.name === '[Measure] Total Revenue')!;
    expect(revMeasure).toBeDefined();
    expect(revMeasure.dataType).toBe('decimal');
    expect(revMeasure.normalizedType).toBe('decimal');
    expect(revMeasure.comment).toContain('SUM(Sales[Amount])');
  });

  it('marks hidden tables with [Hidden] comment', () => {
    const model = minimalModel({
      tables: [
        { name: 'VisibleTable', columns: [{ name: 'id', dataType: 'int64' }] },
        { name: 'HiddenTable', columns: [{ name: 'id', dataType: 'int64' }], isHidden: true },
      ],
    });

    const pbit = createTestPbit(model);
    const sd = parsePowerBITemplate(pbit);

    expect(sd.tables).toHaveLength(2);
    const hidden = sd.tables.find(t => t.name === 'HiddenTable')!;
    expect(hidden.comment).toBe('[Hidden]');

    const visible = sd.tables.find(t => t.name === 'VisibleTable')!;
    expect(visible.comment).toBeNull();
  });

  it('filters out internal Power BI tables', () => {
    const model = minimalModel({
      tables: [
        { name: 'Sales', columns: [{ name: 'id', dataType: 'int64' }] },
        { name: 'LocalDateTable_abc123', columns: [{ name: 'Date', dataType: 'dateTime' }] },
        { name: 'DateTableTemplate_xyz', columns: [{ name: 'Date', dataType: 'dateTime' }] },
        { name: 'Culture_abc', columns: [{ name: 'Name', dataType: 'string' }] },
      ],
    });

    const pbit = createTestPbit(model);
    const sd = parsePowerBITemplate(pbit);

    expect(sd.tables).toHaveLength(1);
    expect(sd.tables[0].name).toBe('Sales');
  });

  it('filters out RowNumber internal column', () => {
    const model = minimalModel({
      tables: [{
        name: 'Products',
        columns: [
          { name: 'RowNumber-2662979B-1795-4F74-8F37-6A1BA8059B61', dataType: 'int64' },
          { name: 'ProductId', dataType: 'int64', isKey: true },
          { name: 'Name', dataType: 'string' },
        ],
      }],
    });

    const pbit = createTestPbit(model);
    const sd = parsePowerBITemplate(pbit);

    const colNames = sd.columns.map(c => c.name);
    expect(colNames).not.toContain('RowNumber-2662979B-1795-4F74-8F37-6A1BA8059B61');
    expect(colNames).toEqual(['ProductId', 'Name']);
  });

  it('throws when DataModelSchema is missing', () => {
    const zip = new AdmZip();
    zip.addFile('SomeOtherFile.txt', Buffer.from('hello'));
    const buf = zip.toBuffer();

    expect(() => parsePowerBITemplate(buf)).toThrow('DataModelSchema not found');
  });

  it('maps relationships to ForeignKeyInfo', () => {
    const model = minimalModel({
      tables: [
        { name: 'Orders', columns: [{ name: 'OrderId', dataType: 'int64', isKey: true }, { name: 'CustomerId', dataType: 'int64' }] },
        { name: 'Customers', columns: [{ name: 'CustomerId', dataType: 'int64', isKey: true }, { name: 'Name', dataType: 'string' }] },
      ],
      relationships: [
        { name: 'rel_orders_customers', fromTable: 'Orders', fromColumn: 'CustomerId', toTable: 'Customers', toColumn: 'CustomerId' },
      ],
    });

    const pbit = createTestPbit(model);
    const sd = parsePowerBITemplate(pbit);

    expect(sd.foreignKeys).toHaveLength(1);
    const fk = sd.foreignKeys[0];
    expect(fk.table).toBe('Orders');
    expect(fk.column).toBe('CustomerId');
    expect(fk.referencedTable).toBe('Customers');
    expect(fk.referencedColumn).toBe('CustomerId');
    expect(fk.constraintName).toBe('rel_orders_customers');
    expect(fk.updateRule).toBe('NO ACTION');
    expect(fk.deleteRule).toBe('NO ACTION');
  });

  it('handles an empty model gracefully', () => {
    const model = { model: { tables: [], relationships: [] } };
    const pbit = createTestPbit(model);
    const sd = parsePowerBITemplate(pbit);

    expect(sd.tables).toHaveLength(0);
    expect(sd.columns).toHaveLength(0);
    expect(sd.foreignKeys).toHaveLength(0);
  });

  it('produces SchemaData consumable by all checks (contract test)', async () => {
    const model = minimalModel({
      tables: [
        {
          name: 'Orders',
          columns: [
            { name: 'OrderId', dataType: 'int64', isKey: true },
            { name: 'CustomerId', dataType: 'int64' },
            { name: 'Amount', dataType: 'decimal' },
            { name: 'OrderDate', dataType: 'dateTime' },
            { name: 'Status', dataType: 'string' },
          ],
          measures: [{ name: 'Total Revenue', expression: 'SUM(Orders[Amount])' }],
        },
        {
          name: 'Customers',
          columns: [
            { name: 'CustomerId', dataType: 'int64', isKey: true },
            { name: 'Name', dataType: 'string' },
            { name: 'Email', dataType: 'string' },
          ],
        },
      ],
      relationships: [
        { fromTable: 'Orders', fromColumn: 'CustomerId', toTable: 'Customers', toColumn: 'CustomerId' },
      ],
    });

    const pbit = createTestPbit(model);
    const sd = parsePowerBITemplate(pbit);

    // Required fields exist
    expect(sd.databaseType).toBe('powerbi');
    expect(sd.databaseVersion).toBeTruthy();
    expect(sd.extractedAt).toBeTruthy();
    expect(sd.tables.length).toBeGreaterThan(0);
    expect(sd.columns.length).toBeGreaterThan(0);
    expect(Array.isArray(sd.constraints)).toBe(true);
    expect(Array.isArray(sd.indexes)).toBe(true);
    expect(Array.isArray(sd.foreignKeys)).toBe(true);
    expect(Array.isArray(sd.tableStatistics)).toBe(true);
    expect(Array.isArray(sd.columnStatistics)).toBe(true);

    // Verify we can run checks against the result
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
