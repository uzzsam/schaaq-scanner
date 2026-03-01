import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import { parseTableauWorkbook } from '../../src/adapters/tableau-adapter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function minimalTwb(datasources: string = '', version: string = '18.1'): string {
  return `<?xml version='1.0' encoding='utf-8' ?>
<workbook version='${version}'>
  <datasources>
    ${datasources}
  </datasources>
</workbook>`;
}

function singleTableDs(opts: {
  caption?: string;
  name?: string;
  tableName?: string;
  columns?: { name: string; datatype: string }[];
  dsColumns?: { name: string; caption?: string; datatype?: string; formula?: string; hidden?: string }[];
} = {}): string {
  const caption = opts.caption ?? 'Sales Data';
  const name = opts.name ?? 'federated.abc123';
  const tableName = opts.tableName ?? '[dbo].[Orders]';
  const columns = opts.columns ?? [
    { name: 'OrderId', datatype: 'integer' },
    { name: 'Amount', datatype: 'real' },
    { name: 'OrderDate', datatype: 'date' },
    { name: 'CustomerName', datatype: 'string' },
  ];

  const relCols = columns.map(c =>
    `<column datatype='${c.datatype}' name='${c.name}' />`
  ).join('\n          ');

  const dsCols = (opts.dsColumns ?? []).map(c => {
    let attrs = `name='${c.name}'`;
    if (c.caption) attrs += ` caption='${c.caption}'`;
    if (c.datatype) attrs += ` datatype='${c.datatype}'`;
    if (c.hidden) attrs += ` hidden='${c.hidden}'`;
    const calc = c.formula
      ? `<calculation class='tableau' formula='${c.formula}' />`
      : '';
    return `<column ${attrs}>${calc}</column>`;
  }).join('\n    ');

  return `<datasource caption='${caption}' name='${name}'>
    ${dsCols}
    <connection class='sqlserver'>
      <relation name='${tableName}' table='${tableName}' type='table'>
        <columns>
          ${relCols}
        </columns>
      </relation>
    </connection>
  </datasource>`;
}

function createTwbx(twbContent: string): Buffer {
  const zip = new AdmZip();
  zip.addFile('workbook.twb', Buffer.from(twbContent, 'utf-8'));
  return zip.toBuffer();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Tableau Adapter — parseTableauWorkbook', () => {
  it('parses a basic workbook with a single datasource', () => {
    const xml = minimalTwb(singleTableDs());
    const sd = parseTableauWorkbook(Buffer.from(xml), 'test.twb');

    expect(sd.databaseType).toBe('tableau');
    expect(sd.databaseVersion).toBe('18.1');
    expect(sd.tables.length).toBeGreaterThanOrEqual(1);

    // Should have columns from the relation
    expect(sd.columns.length).toBeGreaterThanOrEqual(4);
    const colNames = sd.columns.map(c => c.name);
    expect(colNames).toContain('OrderId');
    expect(colNames).toContain('Amount');

    // Type mapping
    const orderIdCol = sd.columns.find(c => c.name === 'OrderId')!;
    expect(orderIdCol.dataType).toBe('integer');
    expect(orderIdCol.normalizedType).toBe('integer');

    const amountCol = sd.columns.find(c => c.name === 'Amount')!;
    expect(amountCol.dataType).toBe('double precision');
    expect(amountCol.normalizedType).toBe('double');
  });

  it('detects calculated fields and includes formula in comment', () => {
    const ds = singleTableDs({
      dsColumns: [
        { name: '[Calculation_1]', caption: 'Profit Margin', datatype: 'real', formula: '[Amount] - [Cost]' },
      ],
    });
    const xml = minimalTwb(ds);
    const sd = parseTableauWorkbook(Buffer.from(xml), 'test.twb');

    const calcCol = sd.columns.find(c => c.name === 'Profit Margin');
    expect(calcCol).toBeDefined();
    expect(calcCol!.comment).toContain('[Calculated]');
    expect(calcCol!.comment).toContain('[Amount] - [Cost]');
  });

  it('handles multiple datasources', () => {
    const ds1 = singleTableDs({ caption: 'Sales', tableName: '[Sales]', columns: [
      { name: 'OrderId', datatype: 'integer' },
      { name: 'Amount', datatype: 'real' },
    ]});
    const ds2 = singleTableDs({ caption: 'Products', name: 'federated.xyz789', tableName: '[Products]', columns: [
      { name: 'ProductId', datatype: 'integer' },
      { name: 'ProductName', datatype: 'string' },
    ]});

    const xml = minimalTwb(`${ds1}\n${ds2}`);
    const sd = parseTableauWorkbook(Buffer.from(xml), 'test.twb');

    expect(sd.tables.length).toBeGreaterThanOrEqual(2);
    const schemas = new Set(sd.tables.map(t => t.schema));
    expect(schemas.has('Sales')).toBe(true);
    expect(schemas.has('Products')).toBe(true);
  });

  it('filters out Parameters datasource', () => {
    const realDs = singleTableDs({ caption: 'Sales' });
    const paramsDs = `<datasource caption='Parameters' name='Parameters'>
      <column name='[Parameter 1]' caption='Date Range' datatype='string' />
    </datasource>`;

    const xml = minimalTwb(`${realDs}\n${paramsDs}`);
    const sd = parseTableauWorkbook(Buffer.from(xml), 'test.twb');

    const tableSchemas = sd.tables.map(t => t.schema);
    expect(tableSchemas).not.toContain('Parameters');
  });

  it('cleans bracket notation from column names', () => {
    const ds = singleTableDs({
      columns: [
        { name: '[OrderId]', datatype: 'integer' },
        { name: '[Customer Name]', datatype: 'string' },
      ],
    });
    const xml = minimalTwb(ds);
    const sd = parseTableauWorkbook(Buffer.from(xml), 'test.twb');

    const colNames = sd.columns.map(c => c.name);
    expect(colNames).toContain('OrderId');
    expect(colNames).toContain('Customer Name');
    // Should not have brackets
    expect(colNames.some(n => n.includes('['))).toBe(false);
  });

  it('skips hidden columns', () => {
    const ds = singleTableDs({
      dsColumns: [
        { name: '[Visible Col]', caption: 'Visible Col', datatype: 'string' },
        { name: '[Hidden Col]', caption: 'Hidden Col', datatype: 'string', hidden: 'true' },
      ],
    });
    const xml = minimalTwb(ds);
    const sd = parseTableauWorkbook(Buffer.from(xml), 'test.twb');

    const colNames = sd.columns.map(c => c.name);
    expect(colNames).toContain('Visible Col');
    expect(colNames).not.toContain('Hidden Col');
  });

  it('extracts .twb from .twbx ZIP archive', () => {
    const xml = minimalTwb(singleTableDs());
    const twbx = createTwbx(xml);
    const sd = parseTableauWorkbook(twbx, 'test.twbx');

    expect(sd.databaseType).toBe('tableau');
    expect(sd.tables.length).toBeGreaterThanOrEqual(1);
    expect(sd.columns.length).toBeGreaterThanOrEqual(4);
  });

  it('throws when .twbx contains no .twb file', () => {
    const zip = new AdmZip();
    zip.addFile('data.hyper', Buffer.from('not a workbook'));
    const buf = zip.toBuffer();

    expect(() => parseTableauWorkbook(buf, 'test.twbx')).toThrow('No .twb file found');
  });

  it('throws on invalid XML (no workbook element)', () => {
    const xml = '<invalid>not a workbook</invalid>';
    expect(() => parseTableauWorkbook(Buffer.from(xml), 'test.twb')).toThrow('no <workbook> element');
  });

  it('handles an empty workbook gracefully', () => {
    const xml = `<?xml version='1.0' encoding='utf-8' ?>
<workbook version='18.1'>
  <datasources></datasources>
</workbook>`;

    const sd = parseTableauWorkbook(Buffer.from(xml), 'test.twb');
    expect(sd.databaseType).toBe('tableau');
    expect(sd.tables).toHaveLength(0);
    expect(sd.columns).toHaveLength(0);
  });

  it('produces SchemaData consumable by all checks (contract test)', async () => {
    const ds1 = singleTableDs({
      caption: 'Orders',
      tableName: '[Orders]',
      columns: [
        { name: 'OrderId', datatype: 'integer' },
        { name: 'CustomerId', datatype: 'integer' },
        { name: 'Amount', datatype: 'real' },
        { name: 'OrderDate', datatype: 'date' },
        { name: 'Status', datatype: 'string' },
      ],
      dsColumns: [
        { name: '[Calculation_1]', caption: 'Total Revenue', datatype: 'real', formula: 'SUM([Amount])' },
      ],
    });

    const xml = minimalTwb(ds1);
    const sd = parseTableauWorkbook(Buffer.from(xml), 'test.twb');

    // Required fields exist
    expect(sd.databaseType).toBe('tableau');
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
