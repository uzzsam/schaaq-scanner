import { describe, it, expect } from 'vitest';
import { parseStmFiles, classifyTransformFromLogic, type StmFile } from '../../src/adapters/stm-adapter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stmFile(name: string, content: string): StmFile {
  return {
    originalname: name,
    buffer: Buffer.from(content, 'utf-8'),
    mimetype: 'text/csv',
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('STM Adapter — parseStmFiles', () => {
  it('parses basic STM CSV', async () => {
    const file = stmFile('mapping.csv', [
      'source_table,source_column,target_table,target_column,transform_logic',
      'raw_orders,order_id,dim_orders,order_key,',
      'raw_orders,customer_name,dim_orders,customer_name,',
      'raw_orders,total_amount,fact_sales,amount,SUM(total_amount)',
    ].join('\n'));

    const result = await parseStmFiles([file]);

    expect(result.fileCount).toBe(1);
    expect(result.totalMappings).toBe(3);
    expect(result.pipelineMapping.sourceFormat).toBe('stm');
    expect(result.pipelineMapping.mappings).toHaveLength(3);
    expect(result.pipelineMapping.metadata.fileName).toBe('mapping.csv');
    expect(result.pipelineMapping.extractedAt).toBeTruthy();
  });

  it('fuzzy header matching', async () => {
    const file = stmFile('alt_headers.csv', [
      'src_table,src_column,tgt_table,tgt_column',
      'staging.accounts,account_id,dwh.dim_account,account_key',
      'staging.accounts,account_name,dwh.dim_account,name',
    ].join('\n'));

    const result = await parseStmFiles([file]);

    expect(result.fileCount).toBe(1);
    expect(result.totalMappings).toBe(2);

    const first = result.pipelineMapping.mappings[0];
    expect(first.sourceTable).toBe('staging.accounts');
    expect(first.sourceColumn).toBe('account_id');
    expect(first.targetTable).toBe('dwh.dim_account');
    expect(first.targetColumn).toBe('account_key');

    const second = result.pipelineMapping.mappings[1];
    expect(second.sourceTable).toBe('staging.accounts');
    expect(second.sourceColumn).toBe('account_name');
    expect(second.targetTable).toBe('dwh.dim_account');
    expect(second.targetColumn).toBe('name');
  });

  it('classifies identity transforms', async () => {
    // Same column name, no logic, no type difference -> identity
    const file = stmFile('identity.csv', [
      'source_table,source_column,target_table,target_column,transform_logic,source_type,target_type',
      'src_users,user_id,tgt_users,user_id,,,',
      'src_users,email,tgt_users,email,,varchar,varchar',
    ].join('\n'));

    const result = await parseStmFiles([file]);

    expect(result.pipelineMapping.mappings[0].transformType).toBe('identity');
    expect(result.pipelineMapping.mappings[1].transformType).toBe('identity');

    // Also verify the standalone function
    expect(classifyTransformFromLogic(null, 'user_id', 'user_id', null, null)).toBe('identity');
    expect(classifyTransformFromLogic('', 'email', 'email', 'varchar', 'varchar')).toBe('identity');
    expect(classifyTransformFromLogic('direct', 'col_a', 'col_a', null, null)).toBe('identity');
    expect(classifyTransformFromLogic('pass-through', 'x', 'x', null, null)).toBe('identity');
  });

  it('classifies aggregate transforms', async () => {
    const file = stmFile('aggregates.csv', [
      'source_table,source_column,target_table,target_column,transform_logic',
      'raw_sales,amount,fact_revenue,total_revenue,SUM(amount)',
    ].join('\n'));

    const result = await parseStmFiles([file]);

    expect(result.pipelineMapping.mappings[0].transformType).toBe('aggregate');
    expect(result.pipelineMapping.mappings[0].transformLogic).toBe('SUM(amount)');

    // Also verify standalone function with other aggregate patterns
    expect(classifyTransformFromLogic('COUNT(order_id)', 'order_id', 'order_count', null, null)).toBe('aggregate');
    expect(classifyTransformFromLogic('AVG(score)', 'score', 'avg_score', null, null)).toBe('aggregate');
    expect(classifyTransformFromLogic('MAX(created_at)', 'created_at', 'latest_date', null, null)).toBe('aggregate');
  });

  it('classifies conditional transforms', async () => {
    const file = stmFile('conditionals.csv', [
      'source_table,source_column,target_table,target_column,transform_logic',
      'raw_orders,status_code,dim_orders,status_label,CASE WHEN status_code = 1 THEN Active ELSE Inactive END',
    ].join('\n'));

    const result = await parseStmFiles([file]);

    expect(result.pipelineMapping.mappings[0].transformType).toBe('conditional');

    // Also verify standalone function with other conditional patterns
    expect(classifyTransformFromLogic('IF(amount > 0, credit, debit)', 'amount', 'txn_type', null, null)).toBe('conditional');
    expect(classifyTransformFromLogic('COALESCE(phone, mobile, home_phone)', 'phone', 'contact_number', null, null)).toBe('conditional');
    expect(classifyTransformFromLogic('NVL(discount, 0)', 'discount', 'discount_amt', null, null)).toBe('conditional');
  });

  it('classifies cast transforms', async () => {
    // Explicit CAST expression in logic
    const file = stmFile('casts.csv', [
      'source_table,source_column,target_table,target_column,transform_logic,source_type,target_type',
      'raw_data,created_str,clean_data,created_date,CAST(created_str AS DATE),varchar,date',
      'raw_data,price,clean_data,price,,varchar,decimal',
    ].join('\n'));

    const result = await parseStmFiles([file]);

    // First row: explicit CAST expression
    expect(result.pipelineMapping.mappings[0].transformType).toBe('cast');
    // Second row: no logic but different source/target types
    expect(result.pipelineMapping.mappings[1].transformType).toBe('cast');

    // Also verify standalone function
    expect(classifyTransformFromLogic('CONVERT(INT, quantity)', 'quantity', 'qty', null, null)).toBe('cast');
    expect(classifyTransformFromLogic('TO_DATE(date_str)', 'date_str', 'event_date', null, null)).toBe('cast');
    expect(classifyTransformFromLogic(null, 'amount', 'amount', 'varchar', 'integer')).toBe('cast');
  });

  it('classifies derive transforms', async () => {
    const file = stmFile('derive.csv', [
      'source_table,source_column,target_table,target_column,transform_logic',
      'raw_users,first_name,dim_users,full_name,CONCAT(first_name, \' \', last_name)',
    ].join('\n'));

    const result = await parseStmFiles([file]);

    expect(result.pipelineMapping.mappings[0].transformType).toBe('derive');

    // Also verify standalone function with other derive patterns
    expect(classifyTransformFromLogic('UPPER(country_code)', 'country_code', 'country', null, null)).toBe('derive');
    expect(classifyTransformFromLogic('TRIM(name)', 'name', 'clean_name', null, null)).toBe('derive');
    expect(classifyTransformFromLogic('SUBSTRING(phone, 1, 3)', 'phone', 'area_code', null, null)).toBe('derive');
    expect(classifyTransformFromLogic('REPLACE(path, /, -)', 'path', 'slug', null, null)).toBe('derive');
  });

  it('handles missing required headers', async () => {
    const badFile = stmFile('bad_headers.csv', [
      'table_a,column_a,table_b,column_b',
      'src,col1,tgt,col2',
    ].join('\n'));

    const validFile = stmFile('good.csv', [
      'source_table,source_column,target_table,target_column',
      'src_orders,order_id,dim_orders,order_key',
    ].join('\n'));

    const result = await parseStmFiles([badFile, validFile]);

    // The bad file should be skipped with a warning, not throw
    expect(result.fileCount).toBe(1);
    expect(result.totalMappings).toBe(1);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(result.warnings[0]).toContain('bad_headers.csv');
    expect(result.warnings[0]).toContain('required headers');
  });

  it('throws on no valid files', async () => {
    const invalid = stmFile('invalid.csv', [
      'wrong_header_a,wrong_header_b,wrong_header_c,wrong_header_d',
      'foo,bar,baz,qux',
    ].join('\n'));

    await expect(parseStmFiles([invalid])).rejects.toThrow(
      'No valid STM files found',
    );
  });
});
