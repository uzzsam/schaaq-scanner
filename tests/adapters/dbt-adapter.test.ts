import { describe, it, expect } from 'vitest';
import { parseDbtManifest, classifyFromSql } from '../../src/adapters/dbt-adapter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function manifestBuffer(manifest: object): Buffer {
  return Buffer.from(JSON.stringify(manifest), 'utf-8');
}

function catalogBuffer(catalog: object): Buffer {
  return Buffer.from(JSON.stringify(catalog), 'utf-8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dbt Adapter — parseDbtManifest', () => {
  it('parses basic manifest with one model', () => {
    const manifest = {
      metadata: { project_name: 'my_project', dbt_version: '1.7.0' },
      nodes: {
        'model.my_project.orders_summary': {
          unique_id: 'model.my_project.orders_summary',
          name: 'orders_summary',
          resource_type: 'model',
          schema: 'analytics',
          depends_on: { nodes: ['source.my_project.raw.orders'] },
          columns: {
            order_id: { name: 'order_id' },
            total_amount: { name: 'total_amount' },
          },
          raw_sql:
            "SELECT order_id, SUM(amount) as total_amount FROM {{ source('raw', 'orders') }} GROUP BY order_id",
        },
      },
      sources: {
        'source.my_project.raw.orders': {
          unique_id: 'source.my_project.raw.orders',
          name: 'orders',
          source_name: 'raw',
          schema: 'raw_data',
          columns: {
            order_id: { name: 'order_id' },
            total_amount: { name: 'total_amount' },
          },
        },
      },
    };

    const result = parseDbtManifest(manifestBuffer(manifest));

    expect(result.sourceFormat).toBe('dbt');
    expect(result.mappings.length).toBeGreaterThan(0);

    const m = result.mappings[0];
    expect(m.sourceTable).toBe('raw.orders');
    expect(m.targetTable).toBe('analytics.orders_summary');
    expect(m.sourceColumn).toBe('order_id');
    expect(m.targetColumn).toBe('order_id');
    expect(m.pipelineName).toBe('orders_summary');
  });

  it('traces columns through parent dependencies', () => {
    const manifest = {
      metadata: { project_name: 'tracing_project', dbt_version: '1.7.0' },
      nodes: {
        'model.tracing_project.combined_report': {
          unique_id: 'model.tracing_project.combined_report',
          name: 'combined_report',
          resource_type: 'model',
          schema: 'reporting',
          depends_on: {
            nodes: [
              'source.tracing_project.raw.customers',
              'source.tracing_project.raw.invoices',
            ],
          },
          columns: {
            customer_id: { name: 'customer_id' },
            customer_name: { name: 'customer_name' },
            invoice_id: { name: 'invoice_id' },
            invoice_total: { name: 'invoice_total' },
          },
          raw_sql:
            'SELECT c.customer_id, c.customer_name, i.invoice_id, i.invoice_total FROM customers c JOIN invoices i ON c.customer_id = i.customer_id',
        },
      },
      sources: {
        'source.tracing_project.raw.customers': {
          unique_id: 'source.tracing_project.raw.customers',
          name: 'customers',
          source_name: 'raw',
          schema: 'raw_data',
          columns: {
            customer_id: { name: 'customer_id' },
            customer_name: { name: 'customer_name' },
          },
        },
        'source.tracing_project.raw.invoices': {
          unique_id: 'source.tracing_project.raw.invoices',
          name: 'invoices',
          source_name: 'raw',
          schema: 'raw_data',
          columns: {
            invoice_id: { name: 'invoice_id' },
            invoice_total: { name: 'invoice_total' },
            customer_id: { name: 'customer_id' },
          },
        },
      },
    };

    const result = parseDbtManifest(manifestBuffer(manifest));

    // customer_id + customer_name traced to customers source
    const fromCustomers = result.mappings.filter(
      (m) => m.sourceTable === 'raw.customers',
    );
    expect(fromCustomers.map((m) => m.sourceColumn).sort()).toEqual(
      ['customer_id', 'customer_name'].sort(),
    );
    expect(fromCustomers.every((m) => m.targetTable === 'reporting.combined_report')).toBe(true);

    // invoice_id + invoice_total + customer_id traced to invoices source
    const fromInvoices = result.mappings.filter(
      (m) => m.sourceTable === 'raw.invoices',
    );
    expect(fromInvoices.map((m) => m.sourceColumn).sort()).toEqual(
      ['customer_id', 'invoice_id', 'invoice_total'].sort(),
    );
  });

  it('classifies SQL transform types', () => {
    const manifest = {
      metadata: { project_name: 'agg_project', dbt_version: '1.7.0' },
      nodes: {
        'model.agg_project.revenue_by_region': {
          unique_id: 'model.agg_project.revenue_by_region',
          name: 'revenue_by_region',
          resource_type: 'model',
          schema: 'analytics',
          depends_on: { nodes: ['source.agg_project.raw.sales'] },
          columns: {
            region: { name: 'region' },
          },
          raw_sql:
            'SELECT region, SUM(revenue) as total_revenue FROM {{ source(\'raw\', \'sales\') }} GROUP BY region',
        },
      },
      sources: {
        'source.agg_project.raw.sales': {
          unique_id: 'source.agg_project.raw.sales',
          name: 'sales',
          source_name: 'raw',
          schema: 'raw_data',
          columns: {
            region: { name: 'region' },
            revenue: { name: 'revenue' },
          },
        },
      },
    };

    const result = parseDbtManifest(manifestBuffer(manifest));

    const regionMapping = result.mappings.find(
      (m) => m.sourceColumn === 'region',
    );
    expect(regionMapping).toBeDefined();
    expect(regionMapping!.transformType).toBe('aggregate');

    // Also verify classifyFromSql directly
    expect(classifyFromSql('SELECT SUM(amount) FROM orders GROUP BY id')).toBe('aggregate');
    expect(classifyFromSql('SELECT CASE WHEN x > 0 THEN 1 ELSE 0 END')).toBe('conditional');
    expect(classifyFromSql('SELECT CAST(id AS VARCHAR)')).toBe('cast');
    expect(classifyFromSql('SELECT CONCAT(first, last)')).toBe('derive');
    expect(classifyFromSql(null)).toBe('unknown');
    expect(classifyFromSql('')).toBe('unknown');
    expect(classifyFromSql(undefined)).toBe('unknown');
  });

  it('uses catalog for column types and detects cast when types differ', () => {
    const manifest = {
      metadata: { project_name: 'catalog_project', dbt_version: '1.7.0' },
      nodes: {
        'model.catalog_project.typed_orders': {
          unique_id: 'model.catalog_project.typed_orders',
          name: 'typed_orders',
          resource_type: 'model',
          schema: 'analytics',
          depends_on: { nodes: ['source.catalog_project.raw.orders'] },
          columns: {
            order_id: { name: 'order_id' },
            amount: { name: 'amount' },
          },
          raw_sql: 'SELECT order_id, amount FROM {{ source(\'raw\', \'orders\') }}',
        },
      },
      sources: {
        'source.catalog_project.raw.orders': {
          unique_id: 'source.catalog_project.raw.orders',
          name: 'orders',
          source_name: 'raw',
          schema: 'raw_data',
          columns: {
            order_id: { name: 'order_id' },
            amount: { name: 'amount' },
          },
        },
      },
    };

    const catalog = {
      nodes: {
        'model.catalog_project.typed_orders': {
          columns: {
            order_id: { name: 'order_id', type: 'BIGINT', index: 1 },
            amount: { name: 'amount', type: 'NUMERIC(18,2)', index: 2 },
          },
        },
      },
      sources: {
        'source.catalog_project.raw.orders': {
          columns: {
            order_id: { name: 'order_id', type: 'INTEGER', index: 1 },
            amount: { name: 'amount', type: 'NUMERIC(18,2)', index: 2 },
          },
        },
      },
    };

    const result = parseDbtManifest(
      manifestBuffer(manifest),
      catalogBuffer(catalog),
    );

    // order_id: INTEGER -> BIGINT → types differ → cast
    const orderIdMapping = result.mappings.find(
      (m) => m.sourceColumn === 'order_id',
    );
    expect(orderIdMapping).toBeDefined();
    expect(orderIdMapping!.transformType).toBe('cast');
    expect(orderIdMapping!.sourceType).toBe('INTEGER');
    expect(orderIdMapping!.targetType).toBe('BIGINT');

    // amount: NUMERIC(18,2) -> NUMERIC(18,2) → same types → identity
    const amountMapping = result.mappings.find(
      (m) => m.sourceColumn === 'amount',
    );
    expect(amountMapping).toBeDefined();
    expect(amountMapping!.transformType).toBe('identity');
    expect(amountMapping!.sourceType).toBe('NUMERIC(18,2)');
    expect(amountMapping!.targetType).toBe('NUMERIC(18,2)');
  });

  it('handles model with no columns — produces no mappings', () => {
    const manifest = {
      metadata: { project_name: 'empty_cols_project', dbt_version: '1.7.0' },
      nodes: {
        'model.empty_cols_project.no_columns_model': {
          unique_id: 'model.empty_cols_project.no_columns_model',
          name: 'no_columns_model',
          resource_type: 'model',
          schema: 'staging',
          depends_on: { nodes: ['source.empty_cols_project.raw.events'] },
          columns: {},
          raw_sql: 'SELECT * FROM {{ source(\'raw\', \'events\') }}',
        },
      },
      sources: {
        'source.empty_cols_project.raw.events': {
          unique_id: 'source.empty_cols_project.raw.events',
          name: 'events',
          source_name: 'raw',
          schema: 'raw_data',
          columns: {
            event_id: { name: 'event_id' },
            event_type: { name: 'event_type' },
          },
        },
      },
    };

    const result = parseDbtManifest(manifestBuffer(manifest));

    expect(result.mappings).toHaveLength(0);
  });

  it('throws on invalid JSON', () => {
    const badBuffer = Buffer.from('this is not json {{{', 'utf-8');

    expect(() => parseDbtManifest(badBuffer)).toThrowError(
      'Invalid dbt manifest.json',
    );
  });

  it('metadata includes project name and model count', () => {
    const manifest = {
      metadata: { project_name: 'analytics_warehouse', dbt_version: '1.7.0' },
      nodes: {
        'model.analytics_warehouse.dim_customers': {
          unique_id: 'model.analytics_warehouse.dim_customers',
          name: 'dim_customers',
          resource_type: 'model',
          schema: 'warehouse',
          depends_on: { nodes: ['source.analytics_warehouse.raw.customers'] },
          columns: { customer_id: { name: 'customer_id' } },
          raw_sql: 'SELECT customer_id FROM {{ source(\'raw\', \'customers\') }}',
        },
        'model.analytics_warehouse.fct_orders': {
          unique_id: 'model.analytics_warehouse.fct_orders',
          name: 'fct_orders',
          resource_type: 'model',
          schema: 'warehouse',
          depends_on: { nodes: ['source.analytics_warehouse.raw.orders'] },
          columns: { order_id: { name: 'order_id' } },
          raw_sql: 'SELECT order_id FROM {{ source(\'raw\', \'orders\') }}',
        },
        'test.analytics_warehouse.not_null_orders': {
          unique_id: 'test.analytics_warehouse.not_null_orders',
          name: 'not_null_orders',
          resource_type: 'test',
          schema: 'warehouse',
          depends_on: { nodes: [] },
          columns: {},
          raw_sql: 'SELECT * FROM orders WHERE order_id IS NULL',
        },
      },
      sources: {
        'source.analytics_warehouse.raw.customers': {
          unique_id: 'source.analytics_warehouse.raw.customers',
          name: 'customers',
          source_name: 'raw',
          schema: 'raw_data',
          columns: { customer_id: { name: 'customer_id' } },
        },
        'source.analytics_warehouse.raw.orders': {
          unique_id: 'source.analytics_warehouse.raw.orders',
          name: 'orders',
          source_name: 'raw',
          schema: 'raw_data',
          columns: { order_id: { name: 'order_id' } },
        },
      },
    };

    const result = parseDbtManifest(manifestBuffer(manifest));

    expect(result.metadata.dbtProjectName).toBe('analytics_warehouse');
    // Only counts 'model' resource_type, not 'test'
    expect(result.metadata.totalModels).toBe(2);
  });
});
