import { describe, it, expect } from 'vitest';
import {
  parseTransformFiles,
  type TransformFile,
  type TransformParseResult,
} from '../../src/transforms/parser';

// =============================================================================
// Helpers
// =============================================================================

function mappingFile(name: string, content: string): TransformFile {
  return {
    originalname: name,
    buffer: Buffer.from(content, 'utf-8'),
    mimetype: 'text/csv',
  };
}

const EXACT_HEADERS =
  'source_table,source_column,source_type,target_table,target_column,target_type,transform_rule,notes';

function row(
  srcTable: string, srcCol: string, srcType: string,
  tgtTable: string, tgtCol: string, tgtType: string,
  rule: string, notes: string,
): string {
  return `${srcTable},${srcCol},${srcType},${tgtTable},${tgtCol},${tgtType},${rule},${notes}`;
}

async function parseOne(name: string, csv: string): Promise<TransformParseResult> {
  return parseTransformFiles([mappingFile(name, csv)]);
}

describe('parseTransformFiles', () => {
  // ---------------------------------------------------------------------------
  // 1. Basic CSV parsing with exact header names
  // ---------------------------------------------------------------------------
  describe('basic CSV parsing with exact header names', () => {
    it('parses a single row with all 8 fields', async () => {
      const csv = [
        EXACT_HEADERS,
        row('orders', 'order_id', 'int', 'dim_order', 'order_key', 'bigint', 'CAST', 'PK mapping'),
      ].join('\n');
      const result = await parseOne('mapping.csv', csv);
      expect(result.fileCount).toBe(1);
      expect(result.totalMappings).toBe(1);
      expect(result.warnings).toHaveLength(0);
      const m = result.data.mappings[0];
      expect(m.sourceTable).toBe('orders');
      expect(m.sourceColumn).toBe('order_id');
      expect(m.sourceType).toBe('int');
      expect(m.targetTable).toBe('dim_order');
      expect(m.targetColumn).toBe('order_key');
      expect(m.targetType).toBe('bigint');
      expect(m.transformRule).toBe('CAST');
      expect(m.notes).toBe('PK mapping');
    });

    it('parses multiple rows correctly', async () => {
      const csv = [
        EXACT_HEADERS,
        row('orders', 'order_id', 'int', 'dim_order', 'order_key', 'bigint', 'CAST', ''),
        row('orders', 'created_at', 'timestamp', 'dim_order', 'created_date', 'date', 'TRUNC', ''),
        row('customers', 'cust_id', 'int', 'dim_customer', 'customer_key', 'bigint', 'direct', ''),
      ].join('\n');
      const result = await parseOne('mapping.csv', csv);
      expect(result.totalMappings).toBe(3);
      expect(result.data.mappings).toHaveLength(3);
      expect(result.data.sourceTables).toEqual(['customers', 'orders']);
      expect(result.data.targetTables).toEqual(['dim_customer', 'dim_order']);
    });

    it('populates totalMappings on both result and data', async () => {
      const csv = [EXACT_HEADERS, row('a', 'b', '', 'c', 'd', '', '', '')].join('\n');
      const result = await parseOne('m.csv', csv);
      expect(result.totalMappings).toBe(1);
      expect(result.data.totalMappings).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Fuzzy header matching
  // ---------------------------------------------------------------------------
  describe('fuzzy header matching', () => {
    it('matches space-separated headers', async () => {
      const csv = ['Source Table,Source Column,Target Table,Target Column', 'orders,id,dim_order,order_key'].join('\n');
      const result = await parseOne('map.csv', csv);
      expect(result.totalMappings).toBe(1);
      expect(result.data.mappings[0].sourceTable).toBe('orders');
    });

    it('matches src/tgt abbreviations', async () => {
      const csv = ['src_table,src_col,tgt_table,tgt_col', 'users,email,dim_user,email_addr'].join('\n');
      const result = await parseOne('map.csv', csv);
      expect(result.totalMappings).toBe(1);
      expect(result.data.mappings[0].sourceTable).toBe('users');
      expect(result.data.mappings[0].targetColumn).toBe('email_addr');
    });

    it('matches entity-style headers', async () => {
      const csv = ['source_entity,source_field,target_entity,target_field', 'products,sku,dim_product,product_sku'].join('\n');
      const result = await parseOne('map.csv', csv);
      expect(result.totalMappings).toBe(1);
      expect(result.data.mappings[0].sourceTable).toBe('products');
      expect(result.data.mappings[0].targetTable).toBe('dim_product');
    });

    it('matches from/to variants', async () => {
      const csv = ['from_table,from_col,to_table,to_col', 'invoices,inv_no,fact_invoice,invoice_number'].join('\n');
      const result = await parseOne('map.csv', csv);
      expect(result.totalMappings).toBe(1);
      expect(result.data.mappings[0].sourceTable).toBe('invoices');
      expect(result.data.mappings[0].targetTable).toBe('fact_invoice');
    });

    it('matches dest variants', async () => {
      const csv = ['source_table,source_column,dest_table,dest_col', 'sales,amount,fact_sales,sale_amount'].join('\n');
      const result = await parseOne('map.csv', csv);
      expect(result.totalMappings).toBe(1);
      expect(result.data.mappings[0].targetTable).toBe('fact_sales');
      expect(result.data.mappings[0].targetColumn).toBe('sale_amount');
    });

    it('matches destination variants', async () => {
      const csv = ['source_table,source_column,destination_table,destination_col', 'sales,amount,fact_sales,sale_amount'].join('\n');
      const result = await parseOne('map.csv', csv);
      expect(result.totalMappings).toBe(1);
      expect(result.data.mappings[0].targetTable).toBe('fact_sales');
    });

    it('matches type-related headers', async () => {
      const csv = ['source_table,source_column,src_data_type,target_table,target_column,target_data_type', 'orders,total,decimal(10 2),dim_order,order_total,numeric'].join('\n');
      const result = await parseOne('map.csv', csv);
      expect(result.totalMappings).toBe(1);
      expect(result.data.mappings[0].sourceType).toBe('decimal(10 2)');
      expect(result.data.mappings[0].targetType).toBe('numeric');
    });

    it('matches transform rule variants', async () => {
      const variants = ['transformation', 'expression', 'formula', 'etl_rule', 'logic', 'mapping_rule'];
      for (const header of variants) {
        const csv = [`source_table,source_column,target_table,target_column,${header}`, 'orders,id,dim_order,order_key,CAST(id AS BIGINT)'].join('\n');
        const result = await parseOne('map.csv', csv);
        expect(result.totalMappings).toBe(1);
        expect(result.data.mappings[0].transformRule).toBe('CAST(id AS BIGINT)');
      }
    });

    it('matches notes variants', async () => {
      const variants = ['notes', 'comment', 'description', 'remark'];
      for (const header of variants) {
        const csv = [`source_table,source_column,target_table,target_column,${header}`, 'orders,id,dim_order,order_key,important note'].join('\n');
        const result = await parseOne('map.csv', csv);
        expect(result.totalMappings).toBe(1);
        expect(result.data.mappings[0].notes).toBe('important note');
      }
    });

    it('matches case-insensitively', async () => {
      const csv = ['SOURCE_TABLE,Source_Column,TARGET_TABLE,Target_Column', 'orders,id,dim_order,order_key'].join('\n');
      const result = await parseOne('map.csv', csv);
      expect(result.totalMappings).toBe(1);
      expect(result.data.mappings[0].sourceTable).toBe('orders');
    });

    it('matches hyphen-separated headers', async () => {
      const csv = ['source-table,source-column,target-table,target-column', 'orders,id,dim_order,order_key'].join('\n');
      const result = await parseOne('map.csv', csv);
      expect(result.totalMappings).toBe(1);
      expect(result.data.mappings[0].sourceTable).toBe('orders');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Minimum required fields validation
  // ---------------------------------------------------------------------------
  describe('minimum required fields validation', () => {
    it('warns when sourceTable header is not detected', async () => {
      const csv = ['unknown_header,source_column,target_table,target_column', 'orders,id,dim_order,order_key'].join('\n');
      const result = await parseOne('bad.csv', csv);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('sourceTable');
      expect(result.totalMappings).toBe(0);
    });

    it('warns when targetColumn header is not detected', async () => {
      const csv = ['source_table,source_column,target_table,unrecognized_col', 'orders,id,dim_order,order_key'].join('\n');
      const result = await parseOne('bad.csv', csv);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('targetColumn');
    });

    it('warns when multiple required headers are missing', async () => {
      const csv = ['foo,bar,baz,qux', 'a,b,c,d'].join('\n');
      const result = await parseOne('bad.csv', csv);
      expect(result.warnings.length).toBeGreaterThan(0);
      const warning = result.warnings[0];
      expect(warning).toContain('sourceTable');
      expect(warning).toContain('sourceColumn');
      expect(warning).toContain('targetTable');
      expect(warning).toContain('targetColumn');
    });

    it('includes detected headers in the warning message', async () => {
      const csv = ['foo,bar,baz,qux', 'a,b,c,d'].join('\n');
      const result = await parseOne('bad.csv', csv);
      expect(result.warnings[0]).toContain('foo');
      expect(result.warnings[0]).toContain('bar');
    });

    it('skips the file but does not throw on validation failure', async () => {
      const csv = ['irrelevant_a,irrelevant_b', '1,2'].join('\n');
      const result = await parseOne('skip.csv', csv);
      expect(result.totalMappings).toBe(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('succeeds with exactly the 4 required fields', async () => {
      const csv = ['source_table,source_column,target_table,target_column', 'orders,id,dim_order,order_key'].join('\n');
      const result = await parseOne('minimal.csv', csv);
      expect(result.totalMappings).toBe(1);
      expect(result.warnings).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Empty / no-data files are skipped with warning
  // ---------------------------------------------------------------------------
  describe('empty and no-data files', () => {
    it('warns and skips a completely empty file', async () => {
      const result = await parseOne('empty.csv', '');
      expect(result.totalMappings).toBe(0);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('empty.csv');
      expect(result.warnings[0]).toContain('no data');
    });

    it('warns and skips a file with only headers and no rows', async () => {
      const csv = 'source_table,source_column,target_table,target_column\n';
      const result = await parseOne('headers-only.csv', csv);
      expect(result.totalMappings).toBe(0);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('headers-only.csv');
    });

    it('warns and skips a file with only whitespace', async () => {
      const result = await parseOne('whitespace.csv', '   \n  \n  ');
      expect(result.totalMappings).toBe(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('still returns fileCount reflecting the number of input files', async () => {
      const result = await parseOne('empty.csv', '');
      expect(result.fileCount).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Multiple files parsed together
  // ---------------------------------------------------------------------------
  describe('multiple files', () => {
    it('merges mappings from two files', async () => {
      const csv1 = [EXACT_HEADERS, row('orders', 'order_id', 'int', 'dim_order', 'order_key', 'bigint', 'CAST', '')].join('\n');
      const csv2 = [
        EXACT_HEADERS,
        row('customers', 'cust_id', 'int', 'dim_customer', 'cust_key', 'bigint', 'CAST', ''),
        row('customers', 'name', 'varchar', 'dim_customer', 'full_name', 'text', 'direct', ''),
      ].join('\n');
      const result = await parseTransformFiles([mappingFile('orders.csv', csv1), mappingFile('customers.csv', csv2)]);
      expect(result.fileCount).toBe(2);
      expect(result.totalMappings).toBe(3);
      expect(result.data.sourceTables).toEqual(['customers', 'orders']);
      expect(result.data.targetTables).toEqual(['dim_customer', 'dim_order']);
    });

    it('handles a mix of valid and empty files', async () => {
      const validCsv = [EXACT_HEADERS, row('orders', 'id', 'int', 'dim_order', 'order_key', 'bigint', '', '')].join('\n');
      const result = await parseTransformFiles([mappingFile('valid.csv', validCsv), mappingFile('empty.csv', '')]);
      expect(result.fileCount).toBe(2);
      expect(result.totalMappings).toBe(1);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes('empty.csv'))).toBe(true);
    });

    it('handles a mix of valid and invalid-header files', async () => {
      const validCsv = [EXACT_HEADERS, row('orders', 'id', 'int', 'dim_order', 'order_key', 'bigint', '', '')].join('\n');
      const badCsv = ['foo,bar,baz,qux', 'a,b,c,d'].join('\n');
      const result = await parseTransformFiles([mappingFile('valid.csv', validCsv), mappingFile('bad_headers.csv', badCsv)]);
      expect(result.fileCount).toBe(2);
      expect(result.totalMappings).toBe(1);
      expect(result.warnings.some((w) => w.includes('bad_headers.csv'))).toBe(true);
    });

    it('accumulates warnings from all files', async () => {
      const result = await parseTransformFiles([mappingFile('empty1.csv', ''), mappingFile('empty2.csv', '')]);
      expect(result.warnings.length).toBe(2);
      expect(result.warnings[0]).toContain('empty1.csv');
      expect(result.warnings[1]).toContain('empty2.csv');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Lookup map construction (targetToSources, sourceToTargets)
  // ---------------------------------------------------------------------------
  describe('lookup map construction', () => {
    it('builds targetToSources keyed by table.column lowercase', async () => {
      const csv = [EXACT_HEADERS, row('orders', 'order_id', 'int', 'DIM_ORDER', 'Order_Key', 'bigint', '', '')].join('\n');
      const result = await parseOne('map.csv', csv);
      const key = 'dim_order.order_key';
      expect(result.data.targetToSources.has(key)).toBe(true);
      expect(result.data.targetToSources.get(key)).toHaveLength(1);
      expect(result.data.targetToSources.get(key)![0].sourceColumn).toBe('order_id');
    });

    it('builds sourceToTargets keyed by table.column lowercase', async () => {
      const csv = [EXACT_HEADERS, row('Orders', 'Order_ID', 'int', 'dim_order', 'order_key', 'bigint', '', '')].join('\n');
      const result = await parseOne('map.csv', csv);
      const key = 'orders.order_id';
      expect(result.data.sourceToTargets.has(key)).toBe(true);
      expect(result.data.sourceToTargets.get(key)).toHaveLength(1);
      expect(result.data.sourceToTargets.get(key)![0].targetColumn).toBe('order_key');
    });

    it('groups multiple sources feeding the same target column', async () => {
      const csv = [
        EXACT_HEADERS,
        row('orders', 'first_name', 'varchar', 'dim_customer', 'full_name', 'text', 'CONCAT', ''),
        row('orders', 'last_name', 'varchar', 'dim_customer', 'full_name', 'text', 'CONCAT', ''),
      ].join('\n');
      const result = await parseOne('map.csv', csv);
      const key = 'dim_customer.full_name';
      expect(result.data.targetToSources.has(key)).toBe(true);
      expect(result.data.targetToSources.get(key)).toHaveLength(2);
    });

    it('groups a single source feeding multiple target columns', async () => {
      const csv = [
        EXACT_HEADERS,
        row('orders', 'created_at', 'timestamp', 'dim_date', 'date_key', 'int', 'DATE_KEY()', ''),
        row('orders', 'created_at', 'timestamp', 'fact_order', 'order_date', 'date', 'TRUNC', ''),
      ].join('\n');
      const result = await parseOne('map.csv', csv);
      const key = 'orders.created_at';
      expect(result.data.sourceToTargets.has(key)).toBe(true);
      expect(result.data.sourceToTargets.get(key)).toHaveLength(2);
    });

    it('produces correct maps across multiple files', async () => {
      const csv1 = [EXACT_HEADERS, row('orders', 'id', 'int', 'dim_order', 'order_key', 'bigint', '', '')].join('\n');
      const csv2 = [EXACT_HEADERS, row('legacy_orders', 'order_num', 'int', 'dim_order', 'order_key', 'bigint', 'CAST', '')].join('\n');
      const result = await parseTransformFiles([mappingFile('file1.csv', csv1), mappingFile('file2.csv', csv2)]);
      const key = 'dim_order.order_key';
      expect(result.data.targetToSources.get(key)).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Rows with empty source/target columns are skipped
  // ---------------------------------------------------------------------------
  describe('skipping rows with empty required values', () => {
    it('skips a row where all four key fields are empty', async () => {
      const csv = [
        EXACT_HEADERS,
        row('', '', '', '', '', '', '', ''),
        row('orders', 'id', 'int', 'dim_order', 'order_key', 'bigint', '', ''),
      ].join('\n');
      const result = await parseOne('map.csv', csv);
      expect(result.totalMappings).toBe(1);
      expect(result.data.mappings[0].sourceTable).toBe('orders');
    });

    it('keeps a row where at least one key field is non-empty', async () => {
      const csv = [
        EXACT_HEADERS,
        row('orders', '', '', '', '', '', '', ''),
        row('orders', 'id', 'int', 'dim_order', 'order_key', 'bigint', '', ''),
      ].join('\n');
      const result = await parseOne('map.csv', csv);
      expect(result.totalMappings).toBe(2);
    });

    it('handles multiple empty rows interspersed with valid rows', async () => {
      const csv = [
        EXACT_HEADERS,
        row('', '', '', '', '', '', '', ''),
        row('orders', 'id', 'int', 'dim_order', 'key', 'bigint', '', ''),
        row('', '', '', '', '', '', '', ''),
        row('', '', '', '', '', '', '', ''),
        row('customers', 'id', 'int', 'dim_cust', 'key', 'bigint', '', ''),
      ].join('\n');
      const result = await parseOne('map.csv', csv);
      expect(result.totalMappings).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Default values for optional fields
  // ---------------------------------------------------------------------------
  describe('default values for optional fields', () => {
    it('defaults sourceType to empty string when column not present', async () => {
      const csv = ['source_table,source_column,target_table,target_column', 'orders,id,dim_order,order_key'].join('\n');
      const result = await parseOne('map.csv', csv);
      expect(result.data.mappings[0].sourceType).toBe('');
    });

    it('defaults targetType to empty string when column not present', async () => {
      const csv = ['source_table,source_column,target_table,target_column', 'orders,id,dim_order,order_key'].join('\n');
      const result = await parseOne('map.csv', csv);
      expect(result.data.mappings[0].targetType).toBe('');
    });

    it('defaults transformRule to empty string when column not present', async () => {
      const csv = ['source_table,source_column,target_table,target_column', 'orders,id,dim_order,order_key'].join('\n');
      const result = await parseOne('map.csv', csv);
      expect(result.data.mappings[0].transformRule).toBe('');
    });

    it('defaults notes to empty string when column not present', async () => {
      const csv = ['source_table,source_column,target_table,target_column', 'orders,id,dim_order,order_key'].join('\n');
      const result = await parseOne('map.csv', csv);
      expect(result.data.mappings[0].notes).toBe('');
    });

    it('defaults all optional fields to empty string when cells are blank', async () => {
      const csv = [EXACT_HEADERS, row('orders', 'id', '', 'dim_order', 'key', '', '', '')].join('\n');
      const result = await parseOne('map.csv', csv);
      const m = result.data.mappings[0];
      expect(m.sourceType).toBe('');
      expect(m.targetType).toBe('');
      expect(m.transformRule).toBe('');
      expect(m.notes).toBe('');
    });

    it('preserves optional field values when present', async () => {
      const csv = [EXACT_HEADERS, row('orders', 'id', 'int', 'dim_order', 'key', 'bigint', 'CAST', 'primary key')].join('\n');
      const result = await parseOne('map.csv', csv);
      const m = result.data.mappings[0];
      expect(m.sourceType).toBe('int');
      expect(m.targetType).toBe('bigint');
      expect(m.transformRule).toBe('CAST');
      expect(m.notes).toBe('primary key');
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------
  describe('edge cases', () => {
    it('trims whitespace from cell values', async () => {
      const csv = ['source_table,source_column,target_table,target_column', '  orders  ,  id  ,  dim_order  ,  order_key  '].join('\n');
      const result = await parseOne('map.csv', csv);
      expect(result.data.mappings[0].sourceTable).toBe('orders');
      expect(result.data.mappings[0].sourceColumn).toBe('id');
      expect(result.data.mappings[0].targetTable).toBe('dim_order');
      expect(result.data.mappings[0].targetColumn).toBe('order_key');
    });

    it('handles source_name and target_name as column header aliases', async () => {
      const csv = ['source_table,source_name,target_table,target_name', 'orders,id,dim_order,order_key'].join('\n');
      const result = await parseOne('map.csv', csv);
      expect(result.totalMappings).toBe(1);
      expect(result.data.mappings[0].sourceColumn).toBe('id');
      expect(result.data.mappings[0].targetColumn).toBe('order_key');
    });

    it('returns sorted and deduplicated sourceTables and targetTables', async () => {
      const csv = [
        EXACT_HEADERS,
        row('b_table', 'col', '', 'y_table', 'col', '', '', ''),
        row('a_table', 'col', '', 'z_table', 'col', '', '', ''),
        row('b_table', 'col2', '', 'y_table', 'col2', '', '', ''),
      ].join('\n');
      const result = await parseOne('map.csv', csv);
      expect(result.data.sourceTables).toEqual(['a_table', 'b_table']);
      expect(result.data.targetTables).toEqual(['y_table', 'z_table']);
    });

    it('handles an empty files array', async () => {
      const result = await parseTransformFiles([]);
      expect(result.fileCount).toBe(0);
      expect(result.totalMappings).toBe(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.data.mappings).toHaveLength(0);
    });

    it('source_attr and target_attr match as column headers', async () => {
      const csv = ['source_table,source_attr,target_table,target_attr', 'orders,id,dim_order,order_key'].join('\n');
      const result = await parseOne('map.csv', csv);
      expect(result.totalMappings).toBe(1);
      expect(result.data.mappings[0].sourceColumn).toBe('id');
      expect(result.data.mappings[0].targetColumn).toBe('order_key');
    });

    it('source_schema matches as sourceTable alias', async () => {
      const csv = ['source_schema,source_column,target_table,target_column', 'public.orders,id,dim_order,order_key'].join('\n');
      const result = await parseOne('map.csv', csv);
      expect(result.totalMappings).toBe(1);
      expect(result.data.mappings[0].sourceTable).toBe('public.orders');
    });
  });
});
