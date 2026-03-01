// =============================================================================
// Transform Clarity Checks - Test Suite
// =============================================================================

import { describe, it, expect } from 'vitest';
import type { TransformData, TransformMapping, TransformFinding } from '../../src/transforms/types';
import {
  TRANSFORM_CHECKS, runTransformChecks,
  sd1AliasCheck, sd2TypeCoercionCheck, sd3AggregationCheck,
  sd4UnitConversionCheck, sd5NullMaskingCheck,
  ob1EntityMergingCheck, ob2EntitySplittingCheck,
  ob3CategoryFlatteningCheck, ob4FanoutJoinCheck,
} from '../../src/transforms/index';

function mapping(overrides: Partial<TransformMapping> = {}): TransformMapping {
  return { sourceTable: 'src_table', sourceColumn: 'col', sourceType: 'varchar', targetTable: 'tgt_table', targetColumn: 'col', targetType: 'varchar', transformRule: '', notes: '', ...overrides };
}

function buildData(mappings: TransformMapping[]): TransformData {
  const targetToSources = new Map<string, TransformMapping[]>();
  const sourceToTargets = new Map<string, TransformMapping[]>();
  const sourceTableSet = new Set<string>();
  const targetTableSet = new Set<string>();
  for (const m of mappings) {
    const tgtKey = `${m.targetTable}.${m.targetColumn}`.toLowerCase();
    const srcKey = `${m.sourceTable}.${m.sourceColumn}`.toLowerCase();
    if (!targetToSources.has(tgtKey)) targetToSources.set(tgtKey, []);
    targetToSources.get(tgtKey)!.push(m);
    if (!sourceToTargets.has(srcKey)) sourceToTargets.set(srcKey, []);
    sourceToTargets.get(srcKey)!.push(m);
    if (m.sourceTable) sourceTableSet.add(m.sourceTable);
    if (m.targetTable) targetTableSet.add(m.targetTable);
  }
  return { mappings, sourceTables: Array.from(sourceTableSet).sort(), targetTables: Array.from(targetTableSet).sort(), totalMappings: mappings.length, targetToSources, sourceToTargets };
}

describe('TRANSFORM_CHECKS', () => {
  it('should contain exactly 9 checks', () => { expect(TRANSFORM_CHECKS).toHaveLength(9); });
  it('should have unique IDs', () => { expect(new Set(TRANSFORM_CHECKS.map(c => c.id)).size).toBe(9); });
  it('should include all expected IDs', () => {
    const ids = TRANSFORM_CHECKS.map(c => c.id);
    ['SD-1','SD-2','SD-3','SD-4','SD-5','OB-1','OB-2','OB-3','OB-4'].forEach(id => expect(ids).toContain(id));
  });
  it('should have correct categories', () => {
    TRANSFORM_CHECKS.forEach(c => {
      if (c.id.startsWith('SD-')) expect(c.category).toBe('semantic-drift');
      else if (c.id.startsWith('OB-')) expect(c.category).toBe('ontological-break');
    });
  });
});

describe('SD-1: Alias Misalignment', () => {
  it('should detect revenue vs income conflict', () => {
    const f = sd1AliasCheck.evaluate(buildData([mapping({ sourceColumn: 'total_revenue', targetColumn: 'total_income' })]));
    expect(f).toHaveLength(1);
    expect(f[0].checkId).toBe('SD-1');
    expect(f[0].category).toBe('semantic-drift');
    expect(f[0].affectedMappings).toBe(1);
    expect(f[0].evidence[0].detail).toContain('revenue');
    expect(f[0].evidence[0].detail).toContain('income');
  });
  it('should detect customer vs client', () => {
    const f = sd1AliasCheck.evaluate(buildData([mapping({ sourceColumn: 'customer_name', targetColumn: 'client_name' })]));
    expect(f).toHaveLength(1);
    expect(f[0].evidence[0].detail).toContain('customer');
    expect(f[0].evidence[0].detail).toContain('client');
  });
  it('should detect cost vs expense', () => {
    const f = sd1AliasCheck.evaluate(buildData([mapping({ sourceColumn: 'operating_cost', targetColumn: 'operating_expense' })]));
    expect(f).toHaveLength(1);
  });
  it('should return no findings when names do not conflict', () => {
    expect(sd1AliasCheck.evaluate(buildData([mapping({ sourceColumn: 'first_name', targetColumn: 'last_name' }), mapping({ sourceColumn: 'address', targetColumn: 'address' })]))).toHaveLength(0);
  });
  it('should return no findings when same term is used', () => {
    expect(sd1AliasCheck.evaluate(buildData([mapping({ sourceColumn: 'total_revenue', targetColumn: 'monthly_revenue' })]))).toHaveLength(0);
  });
  it('should count multiple affected mappings', () => {
    const f = sd1AliasCheck.evaluate(buildData([
      mapping({ sourceColumn: 'revenue', targetColumn: 'income' }),
      mapping({ sourceColumn: 'employee_id', targetColumn: 'staff_id' }),
      mapping({ sourceColumn: 'site_code', targetColumn: 'location_code' }),
    ]));
    expect(f).toHaveLength(1);
    expect(f[0].affectedMappings).toBe(3);
    expect(f[0].evidence).toHaveLength(3);
  });
  it('should handle camelCase', () => {
    const f = sd1AliasCheck.evaluate(buildData([mapping({ sourceColumn: 'totalRevenue', targetColumn: 'totalIncome' })]));
    expect(f).toHaveLength(1);
    expect(f[0].evidence[0].detail).toContain('revenue');
  });
  it('should set severity to critical for 10+', () => {
    const m: TransformMapping[] = [];
    for (let i = 0; i < 10; i++) m.push(mapping({ sourceColumn: `revenue_${i}`, targetColumn: `income_${i}` }));
    const f = sd1AliasCheck.evaluate(buildData(m));
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('critical');
  });
  it('should have correct finding structure', () => {
    const f = sd1AliasCheck.evaluate(buildData([mapping({ sourceColumn: 'revenue', targetColumn: 'income' })]));
    expect(f[0]).toMatchObject({ checkId: 'SD-1', category: 'semantic-drift', totalMappings: 1, ratio: 1 });
    expect(f[0].remediation).toBeTruthy();
    expect(f[0].costCategories.length).toBeGreaterThan(0);
  });
});

describe('SD-2: Type Coercion Risk', () => {
  it('should detect TIMESTAMP to DATE', () => {
    const f = sd2TypeCoercionCheck.evaluate(buildData([mapping({ sourceType: 'timestamp', targetType: 'date' })]));
    expect(f).toHaveLength(1);
    expect(f[0].checkId).toBe('SD-2');
    expect(f[0].category).toBe('semantic-drift');
    expect(f[0].evidence[0].detail).toContain('lossy cast');
  });
  it('should detect DECIMAL to INTEGER', () => { expect(sd2TypeCoercionCheck.evaluate(buildData([mapping({ sourceType: 'decimal', targetType: 'integer' })]))).toHaveLength(1); });
  it('should detect BIGINT to SMALLINT', () => { expect(sd2TypeCoercionCheck.evaluate(buildData([mapping({ sourceType: 'bigint', targetType: 'smallint' })]))).toHaveLength(1); });
  it('should detect FLOAT to BOOLEAN', () => { expect(sd2TypeCoercionCheck.evaluate(buildData([mapping({ sourceType: 'float', targetType: 'boolean' })]))).toHaveLength(1); });
  it('should return no findings for same types', () => { expect(sd2TypeCoercionCheck.evaluate(buildData([mapping({ sourceType: 'varchar', targetType: 'varchar' }), mapping({ sourceType: 'integer', targetType: 'integer' })]))).toHaveLength(0); });
  it('should return no findings for int to bigint (upcast)', () => { expect(sd2TypeCoercionCheck.evaluate(buildData([mapping({ sourceType: 'integer', targetType: 'bigint' })]))).toHaveLength(0); });
  it('should return no findings for date to timestamp', () => { expect(sd2TypeCoercionCheck.evaluate(buildData([mapping({ sourceType: 'date', targetType: 'timestamp' })]))).toHaveLength(0); });
  it('should handle NUMERIC(10,2)', () => { expect(sd2TypeCoercionCheck.evaluate(buildData([mapping({ sourceType: 'NUMERIC(10,2)', targetType: 'integer' })]))).toHaveLength(1); });
  it('should return no findings for unknown types', () => { expect(sd2TypeCoercionCheck.evaluate(buildData([mapping({ sourceType: 'custom_type', targetType: 'another_custom' })]))).toHaveLength(0); });
  it('should set severity to critical for 5+', () => {
    const m: TransformMapping[] = [];
    for (let i = 0; i < 5; i++) m.push(mapping({ sourceColumn: `col_${i}`, targetColumn: `col_${i}`, sourceType: 'timestamp', targetType: 'date' }));
    expect(sd2TypeCoercionCheck.evaluate(buildData(m))[0].severity).toBe('critical');
  });
  it('should return no findings for empty types', () => { expect(sd2TypeCoercionCheck.evaluate(buildData([mapping({ sourceType: '', targetType: 'integer' }), mapping({ sourceType: 'timestamp', targetType: '' })]))).toHaveLength(0); });
});

describe('SD-3: Undocumented Aggregation', () => {
  it('should detect SUM without notes', () => {
    const f = sd3AggregationCheck.evaluate(buildData([mapping({ transformRule: 'SUM(amount)', notes: '' })]));
    expect(f).toHaveLength(1);
    expect(f[0].checkId).toBe('SD-3');
    expect(f[0].category).toBe('semantic-drift');
    expect(f[0].evidence[0].detail).toContain('SUM(amount)');
  });
  it('should detect AVG without notes', () => { expect(sd3AggregationCheck.evaluate(buildData([mapping({ transformRule: 'AVG(price)', notes: '' })]))).toHaveLength(1); });
  it('should detect COUNT without notes', () => { expect(sd3AggregationCheck.evaluate(buildData([mapping({ transformRule: 'COUNT(order_id)', notes: '' })]))).toHaveLength(1); });
  it('should detect GROUP BY without notes', () => { expect(sd3AggregationCheck.evaluate(buildData([mapping({ transformRule: 'SUM(qty) GROUP BY region', notes: '' })]))).toHaveLength(1); });
  it('should return no findings when notes are sufficient (>10 chars)', () => { expect(sd3AggregationCheck.evaluate(buildData([mapping({ transformRule: 'SUM(amount)', notes: 'Aggregated from transaction-level to account-level monthly totals' })]))).toHaveLength(0); });
  it('should flag when notes are too short', () => { expect(sd3AggregationCheck.evaluate(buildData([mapping({ transformRule: 'SUM(amount)', notes: 'Sum total' })]))).toHaveLength(1); });
  it('should return no findings for non-aggregation rules', () => { expect(sd3AggregationCheck.evaluate(buildData([mapping({ transformRule: 'UPPER(name)', notes: '' }), mapping({ transformRule: 'direct', notes: '' })]))).toHaveLength(0); });
  it('should return no findings for empty rule', () => { expect(sd3AggregationCheck.evaluate(buildData([mapping({ transformRule: '', notes: '' })]))).toHaveLength(0); });
  it('should count multiple undocumented aggregations', () => {
    const f = sd3AggregationCheck.evaluate(buildData([
      mapping({ sourceColumn: 'a', transformRule: 'SUM(amount)', notes: '' }),
      mapping({ sourceColumn: 'b', transformRule: 'AVG(qty)', notes: '' }),
      mapping({ sourceColumn: 'c', transformRule: 'COUNT(order_id)', notes: '' }),
    ]));
    expect(f).toHaveLength(1);
    expect(f[0].affectedMappings).toBe(3);
  });
  it('should detect window functions', () => { expect(sd3AggregationCheck.evaluate(buildData([mapping({ transformRule: 'ROW_NUMBER() OVER (PARTITION BY id ORDER BY date)', notes: '' })]))).toHaveLength(1); });
});

describe('SD-4: Unit Conversion Gap', () => {
  it('should detect weight_kg to weight_lbs without conversion', () => {
    const f = sd4UnitConversionCheck.evaluate(buildData([mapping({ sourceColumn: 'weight_kg', targetColumn: 'weight_lbs', transformRule: '' })]));
    expect(f).toHaveLength(1);
    expect(f[0].checkId).toBe('SD-4');
    expect(f[0].category).toBe('semantic-drift');
    expect(f[0].evidence[0].detail).toContain('Unit mismatch');
  });
  it('should detect celsius to fahrenheit', () => { expect(sd4UnitConversionCheck.evaluate(buildData([mapping({ sourceColumn: 'temp_celsius', targetColumn: 'temp_fahrenheit', transformRule: '' })]))).toHaveLength(1); });
  it('should detect km to miles', () => { expect(sd4UnitConversionCheck.evaluate(buildData([mapping({ sourceColumn: 'distance_km', targetColumn: 'distance_miles', transformRule: '' })]))).toHaveLength(1); });
  it('should detect kwh to mwh', () => { expect(sd4UnitConversionCheck.evaluate(buildData([mapping({ sourceColumn: 'consumption_kwh', targetColumn: 'consumption_mwh', transformRule: '' })]))).toHaveLength(1); });
  it('should detect usd to eur', () => { expect(sd4UnitConversionCheck.evaluate(buildData([mapping({ sourceColumn: 'price_usd', targetColumn: 'price_eur', transformRule: '' })]))).toHaveLength(1); });
  it('should not flag when multiply is present', () => { expect(sd4UnitConversionCheck.evaluate(buildData([mapping({ sourceColumn: 'weight_kg', targetColumn: 'weight_lbs', transformRule: 'multiply by 2.20462' })]))).toHaveLength(0); });
  it('should not flag when * operator is present', () => { expect(sd4UnitConversionCheck.evaluate(buildData([mapping({ sourceColumn: 'weight_kg', targetColumn: 'weight_lbs', transformRule: 'weight_kg * 2.20462' })]))).toHaveLength(0); });
  it('should not flag when convert keyword is present', () => { expect(sd4UnitConversionCheck.evaluate(buildData([mapping({ sourceColumn: 'weight_kg', targetColumn: 'weight_lbs', transformRule: 'convert kg to lbs' })]))).toHaveLength(0); });
  it('should not flag same units', () => { expect(sd4UnitConversionCheck.evaluate(buildData([mapping({ sourceColumn: 'weight_kg', targetColumn: 'total_weight_kg', transformRule: '' })]))).toHaveLength(0); });
  it('should not flag no unit suffixes', () => { expect(sd4UnitConversionCheck.evaluate(buildData([mapping({ sourceColumn: 'first_name', targetColumn: 'full_name', transformRule: '' })]))).toHaveLength(0); });
  it('should not flag different unit families', () => { expect(sd4UnitConversionCheck.evaluate(buildData([mapping({ sourceColumn: 'value_kg', targetColumn: 'value_km', transformRule: '' })]))).toHaveLength(0); });
});

describe('SD-5: Null Masking', () => {
  it('should detect COALESCE without docs', () => {
    const f = sd5NullMaskingCheck.evaluate(buildData([mapping({ transformRule: 'COALESCE(col, 0)', notes: '' })]));
    expect(f).toHaveLength(1);
    expect(f[0].checkId).toBe('SD-5');
    expect(f[0].category).toBe('semantic-drift');
    expect(f[0].evidence[0].detail).toContain('COALESCE');
  });
  it('should detect ISNULL without docs', () => { expect(sd5NullMaskingCheck.evaluate(buildData([mapping({ transformRule: 'ISNULL(amount, 0)', notes: '' })]))).toHaveLength(1); });
  it('should detect NVL without docs', () => { expect(sd5NullMaskingCheck.evaluate(buildData([mapping({ transformRule: "NVL(status, 'UNKNOWN')", notes: '' })]))).toHaveLength(1); });
  it('should detect IFNULL without docs', () => { expect(sd5NullMaskingCheck.evaluate(buildData([mapping({ transformRule: "IFNULL(cat, 'N/A')", notes: '' })]))).toHaveLength(1); });
  it('should detect CASE WHEN IS NULL', () => { expect(sd5NullMaskingCheck.evaluate(buildData([mapping({ transformRule: 'CASE WHEN amount IS NULL THEN 0 ELSE amount END', notes: '' })]))).toHaveLength(1); });
  it('should not flag when notes are sufficient', () => { expect(sd5NullMaskingCheck.evaluate(buildData([mapping({ transformRule: 'COALESCE(col, 0)', notes: 'Null values replaced with 0 for reporting aggregation compatibility' })]))).toHaveLength(0); });
  it('should flag when notes are too short', () => { expect(sd5NullMaskingCheck.evaluate(buildData([mapping({ transformRule: 'COALESCE(col, 0)', notes: 'default 0' })]))).toHaveLength(1); });
  it('should not flag non-null-masking rules', () => { expect(sd5NullMaskingCheck.evaluate(buildData([mapping({ transformRule: 'UPPER(name)', notes: '' })]))).toHaveLength(0); });
  it('should not flag empty rule', () => { expect(sd5NullMaskingCheck.evaluate(buildData([mapping({ transformRule: '', notes: '' })]))).toHaveLength(0); });
  it('should count multiple null masking instances', () => {
    const f = sd5NullMaskingCheck.evaluate(buildData([
      mapping({ sourceColumn: 'a', transformRule: 'COALESCE(a, 0)', notes: '' }),
      mapping({ sourceColumn: 'b', transformRule: "NVL(b, 'N/A')", notes: '' }),
      mapping({ sourceColumn: 'c', transformRule: "ISNULL(c, 'X')", notes: '' }),
    ]));
    expect(f).toHaveLength(1);
    expect(f[0].affectedMappings).toBe(3);
    expect(f[0].evidence).toHaveLength(3);
  });
});

describe('OB-1: Entity Merging', () => {
  it('should detect 2 sources merging into 1 target', () => {
    const data = buildData([
      mapping({ sourceTable: 'customers', sourceColumn: 'name', targetTable: 'dim_party', targetColumn: 'party_name' }),
      mapping({ sourceTable: 'suppliers', sourceColumn: 'name', targetTable: 'dim_party', targetColumn: 'party_name' }),
    ]);
    const f = ob1EntityMergingCheck.evaluate(data);
    expect(f).toHaveLength(1);
    expect(f[0].checkId).toBe('OB-1');
    expect(f[0].category).toBe('ontological-break');
    expect(f[0].affectedMappings).toBe(1);
    expect(f[0].evidence[0].detail).toContain('customers');
    expect(f[0].evidence[0].detail).toContain('suppliers');
    expect(f[0].evidence[0].detail).toContain('dim_party');
  });
  it('should detect 3 sources merging', () => {
    const data = buildData([
      mapping({ sourceTable: 'customers', sourceColumn: 'id', targetTable: 'dim_party', targetColumn: 'party_id' }),
      mapping({ sourceTable: 'suppliers', sourceColumn: 'id', targetTable: 'dim_party', targetColumn: 'party_id' }),
      mapping({ sourceTable: 'employees', sourceColumn: 'id', targetTable: 'dim_party', targetColumn: 'party_id' }),
    ]);
    expect(ob1EntityMergingCheck.evaluate(data)[0].evidence[0].detail).toContain('3 source tables');
  });
  it('should not flag single-source targets', () => {
    expect(ob1EntityMergingCheck.evaluate(buildData([
      mapping({ sourceTable: 'customers', targetTable: 'dim_customer', targetColumn: 'name' }),
      mapping({ sourceTable: 'suppliers', targetTable: 'dim_supplier', targetColumn: 'name' }),
    ]))).toHaveLength(0);
  });
  it('should detect multiple merges', () => {
    const f = ob1EntityMergingCheck.evaluate(buildData([
      mapping({ sourceTable: 'customers', targetTable: 'dim_party', targetColumn: 'name' }),
      mapping({ sourceTable: 'suppliers', targetTable: 'dim_party', targetColumn: 'name' }),
      mapping({ sourceTable: 'invoices', targetTable: 'fact_txn', targetColumn: 'amount' }),
      mapping({ sourceTable: 'payments', targetTable: 'fact_txn', targetColumn: 'amount' }),
    ]));
    expect(f).toHaveLength(1);
    expect(f[0].affectedMappings).toBe(2);
    expect(f[0].evidence).toHaveLength(2);
  });
  it('should set severity to critical for 6+ sources', () => {
    const data = buildData([
      mapping({ sourceTable: 's1', targetTable: 'ta', targetColumn: 'c' }),
      mapping({ sourceTable: 's2', targetTable: 'ta', targetColumn: 'c' }),
      mapping({ sourceTable: 's3', targetTable: 'ta', targetColumn: 'c' }),
      mapping({ sourceTable: 's4', targetTable: 'tb', targetColumn: 'c' }),
      mapping({ sourceTable: 's5', targetTable: 'tb', targetColumn: 'c' }),
      mapping({ sourceTable: 's6', targetTable: 'tb', targetColumn: 'c' }),
    ]);
    expect(ob1EntityMergingCheck.evaluate(data)[0].severity).toBe('critical');
  });
});

describe('OB-2: Entity Splitting', () => {
  it('should detect 1 source feeding 3+ targets', () => {
    const f = ob2EntitySplittingCheck.evaluate(buildData([
      mapping({ sourceTable: 'orders', sourceColumn: 'order_id', targetTable: 'fact_orders', targetColumn: 'order_id' }),
      mapping({ sourceTable: 'orders', sourceColumn: 'customer_id', targetTable: 'dim_customer', targetColumn: 'customer_id' }),
      mapping({ sourceTable: 'orders', sourceColumn: 'product_id', targetTable: 'dim_product', targetColumn: 'product_id' }),
    ]));
    expect(f).toHaveLength(1);
    expect(f[0].checkId).toBe('OB-2');
    expect(f[0].category).toBe('ontological-break');
    expect(f[0].evidence[0].detail).toContain('3 target tables');
  });
  it('should detect 4 target tables', () => {
    const f = ob2EntitySplittingCheck.evaluate(buildData([
      mapping({ sourceTable: 'md', sourceColumn: 'id', targetTable: 'a', targetColumn: 'id' }),
      mapping({ sourceTable: 'md', sourceColumn: 'n', targetTable: 'b', targetColumn: 'n' }),
      mapping({ sourceTable: 'md', sourceColumn: 't', targetTable: 'c', targetColumn: 't' }),
      mapping({ sourceTable: 'md', sourceColumn: 's', targetTable: 'd', targetColumn: 's' }),
    ]));
    expect(f[0].evidence[0].detail).toContain('4 target tables');
  });
  it('should not flag 2 targets', () => {
    expect(ob2EntitySplittingCheck.evaluate(buildData([
      mapping({ sourceTable: 'orders', sourceColumn: 'a', targetTable: 'ta', targetColumn: 'a' }),
      mapping({ sourceTable: 'orders', sourceColumn: 'b', targetTable: 'tb', targetColumn: 'b' }),
    ]))).toHaveLength(0);
  });
  it('should not flag 1 target', () => {
    expect(ob2EntitySplittingCheck.evaluate(buildData([
      mapping({ sourceTable: 'orders', sourceColumn: 'a', targetTable: 'ta', targetColumn: 'a' }),
      mapping({ sourceTable: 'orders', sourceColumn: 'b', targetTable: 'ta', targetColumn: 'b' }),
    ]))).toHaveLength(0);
  });
  it('should detect multiple splits', () => {
    const f = ob2EntitySplittingCheck.evaluate(buildData([
      mapping({ sourceTable: 'sa', sourceColumn: 'c1', targetTable: 't1', targetColumn: 'c1' }),
      mapping({ sourceTable: 'sa', sourceColumn: 'c2', targetTable: 't2', targetColumn: 'c2' }),
      mapping({ sourceTable: 'sa', sourceColumn: 'c3', targetTable: 't3', targetColumn: 'c3' }),
      mapping({ sourceTable: 'sb', sourceColumn: 'c1', targetTable: 't4', targetColumn: 'c1' }),
      mapping({ sourceTable: 'sb', sourceColumn: 'c2', targetTable: 't5', targetColumn: 'c2' }),
      mapping({ sourceTable: 'sb', sourceColumn: 'c3', targetTable: 't6', targetColumn: 'c3' }),
    ]));
    expect(f).toHaveLength(1);
    expect(f[0].affectedMappings).toBe(2);
  });
  it('should report total targets in title', () => {
    const f = ob2EntitySplittingCheck.evaluate(buildData([
      mapping({ sourceTable: 'orders', sourceColumn: 'c1', targetTable: 'a', targetColumn: 'c1' }),
      mapping({ sourceTable: 'orders', sourceColumn: 'c2', targetTable: 'b', targetColumn: 'c2' }),
      mapping({ sourceTable: 'orders', sourceColumn: 'c3', targetTable: 'c', targetColumn: 'c3' }),
    ]));
    expect(f[0].title).toContain('3 target tables');
  });
});

describe('OB-3: Category Flattening', () => {
  it('should detect when status column is dropped', () => {
    const data = buildData([
      mapping({ sourceTable: 'orders', sourceColumn: 'order_id', targetTable: 'fact_orders', targetColumn: 'order_id' }),
      mapping({ sourceTable: 'orders', sourceColumn: 'amount', targetTable: 'fact_orders', targetColumn: 'amount' }),
      mapping({ sourceTable: 'orders', sourceColumn: 'order_status', targetTable: 'dim_status', targetColumn: 'status_name' }),
    ]);
    const f = ob3CategoryFlatteningCheck.evaluate(data);
    expect(f).toHaveLength(1);
    expect(f[0].checkId).toBe('OB-3');
    expect(f[0].category).toBe('ontological-break');
    expect(f[0].evidence[0].detail).toContain('order_status');
    expect(f[0].evidence[0].detail).toContain('fact_orders');
  });
  it('should detect when category column is dropped', () => {
    const f = ob3CategoryFlatteningCheck.evaluate(buildData([
      mapping({ sourceTable: 'products', sourceColumn: 'product_id', targetTable: 'dim_product', targetColumn: 'product_id' }),
      mapping({ sourceTable: 'products', sourceColumn: 'product_name', targetTable: 'dim_product', targetColumn: 'product_name' }),
      mapping({ sourceTable: 'products', sourceColumn: 'product_category', targetTable: 'dim_cat', targetColumn: 'cat_name' }),
    ]));
    expect(f).toHaveLength(1);
    expect(f[0].evidence[0].detail).toContain('product_category');
  });
  it('should detect when type column is dropped', () => {
    const f = ob3CategoryFlatteningCheck.evaluate(buildData([
      mapping({ sourceTable: 'accounts', sourceColumn: 'account_id', targetTable: 'dim_account', targetColumn: 'account_id' }),
      mapping({ sourceTable: 'accounts', sourceColumn: 'account_name', targetTable: 'dim_account', targetColumn: 'account_name' }),
      mapping({ sourceTable: 'accounts', sourceColumn: 'account_type', targetTable: 'ref_types', targetColumn: 'type_name' }),
    ]));
    expect(f).toHaveLength(1);
    expect(f[0].evidence[0].detail).toContain('account_type');
  });
  it('should not flag when category columns are preserved', () => {
    expect(ob3CategoryFlatteningCheck.evaluate(buildData([
      mapping({ sourceTable: 'orders', sourceColumn: 'order_id', targetTable: 'fact_orders', targetColumn: 'order_id' }),
      mapping({ sourceTable: 'orders', sourceColumn: 'order_status', targetTable: 'fact_orders', targetColumn: 'order_status' }),
      mapping({ sourceTable: 'orders', sourceColumn: 'amount', targetTable: 'fact_orders', targetColumn: 'amount' }),
    ]))).toHaveLength(0);
  });
  it('should not flag when no category columns exist', () => {
    expect(ob3CategoryFlatteningCheck.evaluate(buildData([
      mapping({ sourceTable: 'orders', sourceColumn: 'order_id', targetTable: 'fact_orders', targetColumn: 'order_id' }),
      mapping({ sourceTable: 'orders', sourceColumn: 'amount', targetTable: 'fact_orders', targetColumn: 'amount' }),
    ]))).toHaveLength(0);
  });
  it('should detect dropped level and tier columns', () => {
    const f = ob3CategoryFlatteningCheck.evaluate(buildData([
      mapping({ sourceTable: 'members', sourceColumn: 'member_id', targetTable: 'dim_member', targetColumn: 'member_id' }),
      mapping({ sourceTable: 'members', sourceColumn: 'name', targetTable: 'dim_member', targetColumn: 'name' }),
      mapping({ sourceTable: 'members', sourceColumn: 'member_level', targetTable: 'ref_levels', targetColumn: 'level_name' }),
      mapping({ sourceTable: 'members', sourceColumn: 'member_tier', targetTable: 'ref_tiers', targetColumn: 'tier_name' }),
    ]));
    expect(f).toHaveLength(1);
    expect(f[0].evidence[0].detail).toContain('member_level');
    expect(f[0].evidence[0].detail).toContain('member_tier');
  });
});
describe('OB-4: Fan-Out Join Risk', () => {
  it('should detect target column fed by 2 source tables', () => {
    const data = buildData([
      mapping({ sourceTable: 'customers', sourceColumn: 'email', targetTable: 'dim_contact', targetColumn: 'email_addr' }),
      mapping({ sourceTable: 'suppliers', sourceColumn: 'contact_email', targetTable: 'dim_contact', targetColumn: 'email_addr' }),
    ]);
    const f = ob4FanoutJoinCheck.evaluate(data);
    expect(f).toHaveLength(1);
    expect(f[0].checkId).toBe('OB-4');
    expect(f[0].category).toBe('ontological-break');
    expect(f[0].evidence[0].detail).toContain('dim_contact.email_addr');
    expect(f[0].evidence[0].detail).toContain('customers');
    expect(f[0].evidence[0].detail).toContain('suppliers');
  });
  it('should not flag single-source target columns', () => {
    expect(ob4FanoutJoinCheck.evaluate(buildData([
      mapping({ sourceTable: 'orders', sourceColumn: 'order_id', targetTable: 'fact_orders', targetColumn: 'order_id' }),
      mapping({ sourceTable: 'orders', sourceColumn: 'amount', targetTable: 'fact_orders', targetColumn: 'amount' }),
    ]))).toHaveLength(0);
  });
  it('should detect multiple fan-out columns', () => {
    const f = ob4FanoutJoinCheck.evaluate(buildData([
      mapping({ sourceTable: 'sales', sourceColumn: 'region', targetTable: 'fact_combined', targetColumn: 'region' }),
      mapping({ sourceTable: 'returns', sourceColumn: 'region', targetTable: 'fact_combined', targetColumn: 'region' }),
      mapping({ sourceTable: 'sales', sourceColumn: 'amount', targetTable: 'fact_combined', targetColumn: 'total' }),
      mapping({ sourceTable: 'returns', sourceColumn: 'refund', targetTable: 'fact_combined', targetColumn: 'total' }),
    ]));
    expect(f).toHaveLength(1);
    expect(f[0].evidence.length).toBeGreaterThanOrEqual(2);
  });
  it('should return minor severity for few fan-out columns', () => {
    // 1 fan-out column out of 14 total target columns => ratio ~0.07 < 0.08
    const mappings: ReturnType<typeof mapping>[] = [
      // The fan-out: 2 source tables feed t.x
      mapping({ sourceTable: 'a', sourceColumn: 'x', targetTable: 't', targetColumn: 'x' }),
      mapping({ sourceTable: 'b', sourceColumn: 'x', targetTable: 't', targetColumn: 'x' }),
    ];
    // Add 13 more single-source target columns to dilute ratio
    for (let i = 0; i < 13; i++) {
      mappings.push(mapping({ sourceTable: 'a', sourceColumn: `f${i}`, targetTable: 't', targetColumn: `f${i}` }));
    }
    const f = ob4FanoutJoinCheck.evaluate(buildData(mappings));
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('minor');
  });
  it('should return critical severity for many fan-out columns', () => {
    const mappings: ReturnType<typeof mapping>[] = [];
    for (let i = 0; i < 6; i++) {
      mappings.push(mapping({ sourceTable: 'src_a', sourceColumn: `col_${i}`, targetTable: 'tgt', targetColumn: `col_${i}` }));
      mappings.push(mapping({ sourceTable: 'src_b', sourceColumn: `col_${i}`, targetTable: 'tgt', targetColumn: `col_${i}` }));
    }
    const f = ob4FanoutJoinCheck.evaluate(buildData(mappings));
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('critical');
  });
  it('should not flag same source table mapping different cols to same target col', () => {
    expect(ob4FanoutJoinCheck.evaluate(buildData([
      mapping({ sourceTable: 'orders', sourceColumn: 'ship_date', targetTable: 'fact', targetColumn: 'event_date' }),
      mapping({ sourceTable: 'orders', sourceColumn: 'order_date', targetTable: 'fact', targetColumn: 'event_date' }),
    ]))).toHaveLength(0);
  });
});
describe('runTransformChecks aggregator', () => {
  it('should return empty array for clean data', () => {
    const f = runTransformChecks(buildData([
      mapping({ sourceTable: 'src', sourceColumn: 'id', targetTable: 'tgt', targetColumn: 'id' }),
    ]));
    expect(f).toHaveLength(0);
  });
  it('should aggregate findings from multiple checks', () => {
    const data = buildData([
      // SD-1: alias misalignment (revenue -> income)
      mapping({ sourceTable: 'src', sourceColumn: 'revenue', targetTable: 'tgt', targetColumn: 'income' }),
      // SD-2: type coercion (timestamp -> date)
      mapping({ sourceTable: 'src', sourceColumn: 'created_at', sourceType: 'timestamp', targetTable: 'tgt', targetColumn: 'created_at', targetType: 'date' }),
    ]);
    const f = runTransformChecks(data);
    expect(f.length).toBeGreaterThanOrEqual(2);
    const checkIds = f.map(x => x.checkId);
    expect(checkIds).toContain('SD-1');
    expect(checkIds).toContain('SD-2');
  });
  it('should produce findings with all required fields', () => {
    const data = buildData([
      mapping({ sourceTable: 'src', sourceColumn: 'revenue', targetTable: 'tgt', targetColumn: 'income' }),
    ]);
    const f = runTransformChecks(data);
    for (const finding of f) {
      expect(finding.checkId).toBeDefined();
      expect(finding.category).toMatch(/^(semantic-drift|ontological-break)/);
      expect(finding.severity).toMatch(/^(critical|major|minor|info)/);
      expect(finding.title).toBeTruthy();
      expect(finding.description).toBeTruthy();
      expect(finding.evidence).toBeInstanceOf(Array);
      expect(finding.remediation).toBeTruthy();
      expect(finding.costCategories).toBeInstanceOf(Array);
      expect(typeof finding.ratio).toBe('number');
    }
  });
  it('should return findings from both categories', () => {
    const data = buildData([
      // SD-1 trigger
      mapping({ sourceTable: 'src', sourceColumn: 'cost', targetTable: 'tgt', targetColumn: 'expense' }),
      // OB-1 trigger: 2 source tables -> 1 target table
      mapping({ sourceTable: 'customers', sourceColumn: 'id', targetTable: 'dim_entity', targetColumn: 'entity_id' }),
      mapping({ sourceTable: 'suppliers', sourceColumn: 'id', targetTable: 'dim_entity', targetColumn: 'entity_id' }),
    ]);
    const f = runTransformChecks(data);
    const categories = new Set(f.map(x => x.category));
    expect(categories.has('semantic-drift')).toBe(true);
    expect(categories.has('ontological-break')).toBe(true);
  });
  it('should handle empty mappings array', () => {
    const f = runTransformChecks(buildData([]));
    expect(f).toHaveLength(0);
  });
});
describe('Edge Cases', () => {
  it('should handle empty string columns gracefully', () => {
    const data = buildData([
      mapping({ sourceTable: '', sourceColumn: '', targetTable: '', targetColumn: '' }),
    ]);
    expect(() => runTransformChecks(data)).not.toThrow();
  });
  it('should be case-insensitive for table/column matching', () => {
    const data = buildData([
      mapping({ sourceTable: 'Orders', sourceColumn: 'ORDER_ID', targetTable: 'FACT_ORDERS', targetColumn: 'order_id' }),
      mapping({ sourceTable: 'orders', sourceColumn: 'amount', targetTable: 'fact_orders', targetColumn: 'Amount' }),
    ]);
    expect(() => runTransformChecks(data)).not.toThrow();
  });
  it('should handle very long column names', () => {
    const longName = 'a'.repeat(200);
    const data = buildData([
      mapping({ sourceColumn: longName, targetColumn: longName }),
    ]);
    expect(() => runTransformChecks(data)).not.toThrow();
  });
  it('should handle special characters in column names', () => {
    const data = buildData([
      mapping({ sourceColumn: 'col-with-dashes', targetColumn: 'col.with.dots' }),
      mapping({ sourceColumn: 'col with spaces', targetColumn: 'col_normal' }),
    ]);
    expect(() => runTransformChecks(data)).not.toThrow();
  });
});