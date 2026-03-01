import { describe, it, expect } from 'vitest';
import { parseOpenLineageEvents, classifyFromOL } from '../../src/adapters/openlineage-adapter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function olBuffer(events: object | object[]): Buffer {
  return Buffer.from(JSON.stringify(events), 'utf-8');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OpenLineage Adapter — parseOpenLineageEvents', () => {
  it('parses COMPLETE event with column lineage', () => {
    const event = {
      eventType: 'COMPLETE',
      eventTime: '2024-01-15T10:00:00Z',
      job: { namespace: 'spark', name: 'etl_orders' },
      inputs: [{
        namespace: 'postgres', name: 'raw_orders',
        facets: {
          schema: {
            fields: [
              { name: 'order_id', type: 'integer' },
              { name: 'amount', type: 'decimal' },
            ],
          },
        },
      }],
      outputs: [{
        namespace: 'warehouse', name: 'dim_orders',
        facets: {
          schema: {
            fields: [
              { name: 'order_id', type: 'integer' },
              { name: 'total_amount', type: 'decimal' },
            ],
          },
          columnLineage: {
            fields: [
              {
                name: 'order_id',
                inputFields: [{ namespace: 'postgres', name: 'raw_orders', field: 'order_id' }],
                transformationType: 'IDENTITY',
              },
              {
                name: 'total_amount',
                inputFields: [{ namespace: 'postgres', name: 'raw_orders', field: 'amount' }],
                transformationDescription: 'sum of amount',
              },
            ],
          },
        },
      }],
    };

    const result = parseOpenLineageEvents(olBuffer(event));

    expect(result.sourceFormat).toBe('openlineage');
    expect(result.mappings).toHaveLength(2);

    const orderIdMapping = result.mappings.find(m => m.targetColumn === 'order_id')!;
    expect(orderIdMapping.sourceTable).toBe('raw_orders');
    expect(orderIdMapping.sourceColumn).toBe('order_id');
    expect(orderIdMapping.targetTable).toBe('dim_orders');
    expect(orderIdMapping.transformType).toBe('identity');
    expect(orderIdMapping.sourceType).toBe('integer');
    expect(orderIdMapping.targetType).toBe('integer');
    expect(orderIdMapping.pipelineName).toBe('etl_orders');

    const amountMapping = result.mappings.find(m => m.targetColumn === 'total_amount')!;
    expect(amountMapping.sourceTable).toBe('raw_orders');
    expect(amountMapping.sourceColumn).toBe('amount');
    expect(amountMapping.targetTable).toBe('dim_orders');
    expect(amountMapping.transformType).toBe('aggregate');
    expect(amountMapping.transformLogic).toBe('sum of amount');
  });

  it('falls back to schema-level matching when no columnLineage facet', () => {
    const event = {
      eventType: 'COMPLETE',
      eventTime: '2024-01-15T10:00:00Z',
      job: { namespace: 'airflow', name: 'load_users' },
      inputs: [{
        namespace: 'postgres', name: 'staging_users',
        facets: {
          schema: {
            fields: [
              { name: 'user_id', type: 'integer' },
              { name: 'email', type: 'varchar' },
              { name: 'raw_score', type: 'text' },
            ],
          },
        },
      }],
      outputs: [{
        namespace: 'warehouse', name: 'dim_users',
        facets: {
          schema: {
            fields: [
              { name: 'user_id', type: 'integer' },
              { name: 'email', type: 'varchar' },
              { name: 'display_name', type: 'varchar' },
            ],
          },
          // No columnLineage facet
        },
      }],
    };

    const result = parseOpenLineageEvents(olBuffer(event));

    // Only matching column names should produce mappings: user_id and email
    expect(result.mappings).toHaveLength(2);

    const userIdMapping = result.mappings.find(m => m.targetColumn === 'user_id')!;
    expect(userIdMapping).toBeDefined();
    expect(userIdMapping.sourceTable).toBe('staging_users');
    expect(userIdMapping.sourceColumn).toBe('user_id');
    expect(userIdMapping.targetTable).toBe('dim_users');
    expect(userIdMapping.transformType).toBe('identity');
    expect(userIdMapping.sourceType).toBe('integer');
    expect(userIdMapping.targetType).toBe('integer');

    const emailMapping = result.mappings.find(m => m.targetColumn === 'email')!;
    expect(emailMapping).toBeDefined();
    expect(emailMapping.transformType).toBe('identity');

    // display_name and raw_score should NOT appear (no matching name)
    expect(result.mappings.find(m => m.targetColumn === 'display_name')).toBeUndefined();
    expect(result.mappings.find(m => m.sourceColumn === 'raw_score')).toBeUndefined();
  });

  it('filters to COMPLETE events only', () => {
    const startEvent = {
      eventType: 'START',
      job: { namespace: 'spark', name: 'etl_start' },
      inputs: [{
        namespace: 'db', name: 'start_table',
        facets: {
          schema: { fields: [{ name: 'start_col', type: 'text' }] },
        },
      }],
      outputs: [{
        namespace: 'wh', name: 'start_output',
        facets: {
          schema: { fields: [{ name: 'start_col', type: 'text' }] },
        },
      }],
    };

    const runningEvent = {
      eventType: 'RUNNING',
      job: { namespace: 'spark', name: 'etl_running' },
      inputs: [{
        namespace: 'db', name: 'running_table',
        facets: {
          schema: { fields: [{ name: 'running_col', type: 'text' }] },
        },
      }],
      outputs: [{
        namespace: 'wh', name: 'running_output',
        facets: {
          schema: { fields: [{ name: 'running_col', type: 'text' }] },
        },
      }],
    };

    const completeEvent = {
      eventType: 'COMPLETE',
      job: { namespace: 'spark', name: 'etl_final' },
      inputs: [{
        namespace: 'db', name: 'source_table',
        facets: {
          schema: { fields: [{ name: 'id', type: 'integer' }] },
        },
      }],
      outputs: [{
        namespace: 'wh', name: 'target_table',
        facets: {
          schema: { fields: [{ name: 'id', type: 'integer' }] },
        },
      }],
    };

    const result = parseOpenLineageEvents(olBuffer([startEvent, runningEvent, completeEvent]));

    // Only the COMPLETE event should be processed
    expect(result.mappings).toHaveLength(1);
    expect(result.mappings[0].sourceTable).toBe('source_table');
    expect(result.mappings[0].targetTable).toBe('target_table');
    expect(result.mappings[0].pipelineName).toBe('etl_final');
  });

  it('throws on invalid JSON', () => {
    const badBuffer = Buffer.from('this is not JSON {{{', 'utf-8');

    expect(() => parseOpenLineageEvents(badBuffer)).toThrow('Invalid OpenLineage JSON');
  });

  it('handles multiple output datasets', () => {
    const event = {
      eventType: 'COMPLETE',
      eventTime: '2024-01-15T12:00:00Z',
      job: { namespace: 'spark', name: 'split_pipeline' },
      inputs: [{
        namespace: 'postgres', name: 'raw_events',
        facets: {
          schema: {
            fields: [
              { name: 'event_id', type: 'bigint' },
              { name: 'user_id', type: 'integer' },
              { name: 'event_type', type: 'varchar' },
            ],
          },
        },
      }],
      outputs: [
        {
          namespace: 'warehouse', name: 'fact_clicks',
          facets: {
            schema: {
              fields: [
                { name: 'click_id', type: 'bigint' },
                { name: 'user_id', type: 'integer' },
              ],
            },
            columnLineage: {
              fields: [
                {
                  name: 'click_id',
                  inputFields: [{ namespace: 'postgres', name: 'raw_events', field: 'event_id' }],
                  transformationType: 'IDENTITY',
                },
                {
                  name: 'user_id',
                  inputFields: [{ namespace: 'postgres', name: 'raw_events', field: 'user_id' }],
                  transformationType: 'IDENTITY',
                },
              ],
            },
          },
        },
        {
          namespace: 'warehouse', name: 'fact_views',
          facets: {
            schema: {
              fields: [
                { name: 'view_id', type: 'bigint' },
                { name: 'viewer_id', type: 'integer' },
              ],
            },
            columnLineage: {
              fields: [
                {
                  name: 'view_id',
                  inputFields: [{ namespace: 'postgres', name: 'raw_events', field: 'event_id' }],
                  transformationType: 'IDENTITY',
                },
                {
                  name: 'viewer_id',
                  inputFields: [{ namespace: 'postgres', name: 'raw_events', field: 'user_id' }],
                  transformationDescription: 'case when event_type = view',
                },
              ],
            },
          },
        },
      ],
    };

    const result = parseOpenLineageEvents(olBuffer(event));

    // 2 mappings from fact_clicks + 2 mappings from fact_views = 4 total
    expect(result.mappings).toHaveLength(4);

    const clickMappings = result.mappings.filter(m => m.targetTable === 'fact_clicks');
    expect(clickMappings).toHaveLength(2);
    expect(clickMappings.map(m => m.targetColumn).sort()).toEqual(['click_id', 'user_id']);

    const viewMappings = result.mappings.filter(m => m.targetTable === 'fact_views');
    expect(viewMappings).toHaveLength(2);
    expect(viewMappings.map(m => m.targetColumn).sort()).toEqual(['view_id', 'viewer_id']);

    // All mappings should reference the same source table
    for (const m of result.mappings) {
      expect(m.sourceTable).toBe('raw_events');
      expect(m.pipelineName).toBe('split_pipeline');
    }
  });
});

describe('OpenLineage Adapter — classifyFromOL', () => {
  it('classifies IDENTITY transformation type as identity', () => {
    const result = classifyFromOL('IDENTITY', undefined, 1);
    expect(result).toBe('identity');
  });

  it('classifies aggregation from description containing sum', () => {
    const result = classifyFromOL(undefined, 'sum of amount grouped by region', 1);
    expect(result).toBe('aggregate');
  });
});
