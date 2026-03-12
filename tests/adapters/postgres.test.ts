// =============================================================================
// PostgreSQL Adapter — Integration Tests
// Uses Testcontainers to spin up a real PostgreSQL instance, seeds the fixture,
// and validates the adapter extracts all schema metadata correctly.
//
// INFRA-DEPENDENT: Requires Docker for Testcontainers.
// Set DOCKER_TESTS=1 to run.  Skipped by default in local/CI environments
// without Docker.
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { readFileSync } from 'fs';
import { PostgreSQLAdapter } from '../../src/adapters/postgres';
import type { SchemaData } from '../../src/adapters/types';

const DOCKER_AVAILABLE = process.env.DOCKER_TESTS === '1';

describe.skipIf(!DOCKER_AVAILABLE)('PostgreSQL Adapter', () => {
  let container: StartedPostgreSqlContainer;
  let schemaData: SchemaData;

  beforeAll(async () => {
    // Start PostgreSQL container
    container = await new PostgreSqlContainer('postgres:16-alpine').start();

    // Seed test fixture
    const client = new Client({ connectionString: container.getConnectionUri() });
    await client.connect();
    const fixture = readFileSync('./tests/fixtures/postgres.sql', 'utf8');
    await client.query(fixture);
    await client.end();

    // Extract schema using our adapter
    const adapter = new PostgreSQLAdapter({
      type: 'postgresql',
      connectionUri: container.getConnectionUri(),
      schemas: ['public', 'mining', 'environmental'],
      excludeTables: [],
      maxTablesPerSchema: 500,
    });
    await adapter.connect();
    schemaData = await adapter.extractSchema();
    await adapter.disconnect();
  }, 120_000);  // 2 min timeout for container startup

  afterAll(async () => {
    await container?.stop();
  });

  // --- Metadata ---
  it('should identify database type as postgresql', () => {
    expect(schemaData.databaseType).toBe('postgresql');
  });

  it('should have a version string', () => {
    expect(schemaData.databaseVersion).toMatch(/^PostgreSQL/);
  });

  it('should have an extractedAt timestamp', () => {
    expect(schemaData.extractedAt).toBeDefined();
    expect(new Date(schemaData.extractedAt).getTime()).not.toBeNaN();
  });

  // --- Tables ---
  it('should extract tables from all 3 schemas', () => {
    const schemas = new Set(schemaData.tables.map(t => t.schema));
    expect(schemas).toContain('public');
    expect(schemas).toContain('mining');
    expect(schemas).toContain('environmental');
  });

  it('should extract at least 15 tables total', () => {
    const baseTables = schemaData.tables.filter(t => t.type === 'table');
    expect(baseTables.length).toBeGreaterThanOrEqual(15);
  });

  it('should include known fixture tables', () => {
    const tableNames = schemaData.tables.map(t => `${t.schema}.${t.name}`);
    expect(tableNames).toContain('public.sites');
    expect(tableNames).toContain('mining.bores');
    expect(tableNames).toContain('environmental.samples');
    expect(tableNames).toContain('public.organisations');
  });

  it('should include P1 violation tables (entity name variants)', () => {
    const tableNames = schemaData.tables.map(t => `${t.schema}.${t.name}`);
    expect(tableNames).toContain('mining.locations');
    expect(tableNames).toContain('environmental.facilities');
    expect(tableNames).toContain('mining.places');
    expect(tableNames).toContain('mining.drill_holes');
    expect(tableNames).toContain('mining.wells');
  });

  it('should have table size information', () => {
    const sites = schemaData.tables.find(t => t.name === 'sites');
    expect(sites).toBeDefined();
    expect(sites!.sizeBytes).toBeGreaterThan(0);
  });

  // --- Columns ---
  it('should extract columns with correct types', () => {
    const siteIdCol = schemaData.columns.find(
      c => c.schema === 'public' && c.table === 'sites' && c.name === 'site_id'
    );
    expect(siteIdCol).toBeDefined();
    expect(siteIdCol!.normalizedType).toBe('integer');
  });

  it('should normalise varchar type correctly', () => {
    const statusCol = schemaData.columns.find(
      c => c.schema === 'public' && c.table === 'orders' && c.name === 'status'
    );
    expect(statusCol).toBeDefined();
    expect(statusCol!.normalizedType).toBe('varchar');
    expect(statusCol!.maxLength).toBe(20);
  });

  it('should normalise boolean type correctly', () => {
    const statusCol = schemaData.columns.find(
      c => c.schema === 'environmental' && c.table === 'samples' && c.name === 'status'
    );
    expect(statusCol).toBeDefined();
    expect(statusCol!.normalizedType).toBe('boolean');
  });

  it('should normalise numeric precision correctly', () => {
    const amountCol = schemaData.columns.find(
      c => c.schema === 'public' && c.table === 'orders' && c.name === 'amount'
    );
    expect(amountCol).toBeDefined();
    expect(amountCol!.normalizedType).toBe('decimal');
    expect(amountCol!.numericPrecision).toBe(12);
    expect(amountCol!.numericScale).toBe(2);
  });

  it('should normalise UUID type correctly', () => {
    const orgIdCol = schemaData.columns.find(
      c => c.schema === 'public' && c.table === 'organisations' && c.name === 'organisation_id'
    );
    expect(orgIdCol).toBeDefined();
    expect(orgIdCol!.normalizedType).toBe('uuid');
  });

  it('should normalise JSONB type correctly', () => {
    const jsonbCol = schemaData.columns.find(
      c => c.table === 'stg_assay_results' && c.name === 'raw_data'
    );
    expect(jsonbCol).toBeDefined();
    expect(jsonbCol!.normalizedType).toBe('jsonb');
  });

  it('should normalise timestamp with timezone correctly', () => {
    const tsCol = schemaData.columns.find(
      c => c.schema === 'public' && c.table === 'sites' && c.name === 'created_at'
    );
    expect(tsCol).toBeDefined();
    expect(tsCol!.normalizedType).toBe('timestamp_tz');
  });

  it('should detect type differences for "status" column', () => {
    const statusCols = schemaData.columns.filter(c => c.name === 'status');
    const types = new Set(statusCols.map(c => c.normalizedType));
    expect(types.size).toBeGreaterThanOrEqual(2);  // varchar + integer + boolean
  });

  it('should detect nullable columns correctly', () => {
    // organisations.name is NOT NULL
    const nameCol = schemaData.columns.find(
      c => c.schema === 'public' && c.table === 'organisations' && c.name === 'name'
    );
    expect(nameCol).toBeDefined();
    expect(nameCol!.isNullable).toBe(false);

    // orders.status is nullable
    const statusCol = schemaData.columns.find(
      c => c.schema === 'public' && c.table === 'orders' && c.name === 'status'
    );
    expect(statusCol).toBeDefined();
    expect(statusCol!.isNullable).toBe(true);
  });

  it('should detect default values', () => {
    const createdCol = schemaData.columns.find(
      c => c.schema === 'public' && c.table === 'sites' && c.name === 'created_at'
    );
    expect(createdCol).toBeDefined();
    expect(createdCol!.hasDefault).toBe(true);
    expect(createdCol!.defaultValue).toBeTruthy();
  });

  // --- Constraints ---
  it('should find primary keys', () => {
    const pks = schemaData.constraints.filter(c => c.type === 'primary_key');
    expect(pks.length).toBeGreaterThan(10);
  });

  it('should find unique constraints', () => {
    const uqs = schemaData.constraints.filter(c => c.type === 'unique');
    // organisations.abn has UNIQUE
    const abnUnique = uqs.find(u => u.table === 'organisations' && u.columns.includes('abn'));
    expect(abnUnique).toBeDefined();
  });

  it('should find check constraints', () => {
    const checks = schemaData.constraints.filter(c => c.type === 'check');
    // organisations.sector has CHECK
    const sectorCheck = checks.find(ck => ck.table === 'organisations');
    expect(sectorCheck).toBeDefined();
  });

  it('should find foreign key constraints', () => {
    const fkConstraints = schemaData.constraints.filter(c => c.type === 'foreign_key');
    expect(fkConstraints.length).toBeGreaterThan(0);
  });

  // --- Foreign Keys ---
  it('should find foreign keys', () => {
    const fks = schemaData.foreignKeys;
    expect(fks.length).toBeGreaterThan(0);
    // organisation_contacts -> organisations FK
    const orgFK = fks.find(fk =>
      fk.table === 'organisation_contacts' && fk.referencedTable === 'organisations'
    );
    expect(orgFK).toBeDefined();
    expect(orgFK!.column).toBe('organisation_id');
    expect(orgFK!.referencedColumn).toBe('organisation_id');
  });

  // --- Indexes ---
  it('should find indexes', () => {
    expect(schemaData.indexes.length).toBeGreaterThan(0);
  });

  it('should find named indexes', () => {
    const orgIdx = schemaData.indexes.find(i => i.name === 'idx_org_contacts_org');
    expect(orgIdx).toBeDefined();
    expect(orgIdx!.columns).toContain('organisation_id');
    expect(orgIdx!.isUnique).toBe(false);
    expect(orgIdx!.isPrimary).toBe(false);
  });

  it('should find monitoring results index', () => {
    const monIdx = schemaData.indexes.find(i => i.name === 'idx_monitoring_results_point');
    expect(monIdx).toBeDefined();
    expect(monIdx!.table).toBe('monitoring_results');
  });

  it('should identify primary key indexes', () => {
    const pkIdxs = schemaData.indexes.filter(i => i.isPrimary);
    expect(pkIdxs.length).toBeGreaterThan(0);
  });

  // --- Statistics ---
  it('should have table statistics with row counts', () => {
    expect(schemaData.tableStatistics.length).toBeGreaterThan(0);
    const sampleStats = schemaData.tableStatistics.find(
      s => s.schema === 'environmental' && s.table === 'samples'
    );
    expect(sampleStats).toBeDefined();
    expect(sampleStats!.rowCount).toBeGreaterThan(0);
  });

  it('should have column statistics with null fractions', () => {
    expect(schemaData.columnStatistics.length).toBeGreaterThan(0);
    // monitoring_results.detection_limit should have high null fraction
    const detLimitStat = schemaData.columnStatistics.find(
      s => s.table === 'monitoring_results' && s.column === 'detection_limit'
    );
    expect(detLimitStat).toBeDefined();
    expect(detLimitStat!.nullFraction).toBeGreaterThan(0.5);
  });

  it('should have column statistics with distinct counts', () => {
    const paramStat = schemaData.columnStatistics.find(
      s => s.table === 'samples' && s.column === 'parameter'
    );
    expect(paramStat).toBeDefined();
    expect(paramStat!.distinctCount).not.toBeNull();
  });

  // --- Comments ---
  it('should extract table comments', () => {
    expect(schemaData.comments).toBeDefined();
    const siteComment = schemaData.comments!.find(
      c => c.objectType === 'table' && c.objectName === 'sites'
    );
    expect(siteComment).toBeDefined();
    expect(siteComment!.comment).toBe('Master site register');
  });

  it('should extract bore comment', () => {
    const boreComment = schemaData.comments!.find(
      c => c.objectType === 'table' && c.objectName === 'bores'
    );
    expect(boreComment).toBeDefined();
    expect(boreComment!.comment).toBe('Bore/drill hole master data');
  });

  it('should extract organisation comment', () => {
    const orgComment = schemaData.comments!.find(
      c => c.objectType === 'table' && c.objectName === 'organisations'
    );
    expect(orgComment).toBeDefined();
    expect(orgComment!.comment).toBe('Canonical organisation register');
  });

  // --- Stats freshness ---
  it('should report stats as fresh after ANALYZE', async () => {
    const adapter = new PostgreSQLAdapter({
      type: 'postgresql',
      connectionUri: container.getConnectionUri(),
      schemas: ['public', 'mining', 'environmental'],
      excludeTables: [],
      maxTablesPerSchema: 500,
    });
    await adapter.connect();
    const freshness = await adapter.checkStatsFreshness();
    await adapter.disconnect();
    expect(freshness.stale).toBe(false);
    expect(freshness.oldestAnalyze).not.toBeNull();
    expect(freshness.warning).toBeNull();
  });

  // --- Exclusion filtering ---
  it('should exclude tables matching patterns', async () => {
    const adapter = new PostgreSQLAdapter({
      type: 'postgresql',
      connectionUri: container.getConnectionUri(),
      schemas: ['public', 'mining', 'environmental'],
      excludeTables: ['^legacy_', '^scratch_'],
      maxTablesPerSchema: 500,
    });
    await adapter.connect();
    const filtered = await adapter.extractSchema();
    await adapter.disconnect();

    const tableNames = filtered.tables.map(t => t.name);
    expect(tableNames).not.toContain('legacy_data');
    expect(tableNames).not.toContain('scratch_data');
    // But should still have other tables
    expect(tableNames).toContain('sites');
    expect(tableNames).toContain('organisations');
  });

  it('should also exclude columns/constraints/stats for excluded tables', async () => {
    const adapter = new PostgreSQLAdapter({
      type: 'postgresql',
      connectionUri: container.getConnectionUri(),
      schemas: ['public', 'mining', 'environmental'],
      excludeTables: ['^legacy_', '^scratch_'],
      maxTablesPerSchema: 500,
    });
    await adapter.connect();
    const filtered = await adapter.extractSchema();
    await adapter.disconnect();

    // No columns for excluded tables
    const legacyCols = filtered.columns.filter(c => c.table === 'legacy_data');
    expect(legacyCols).toHaveLength(0);

    const scratchCols = filtered.columns.filter(c => c.table === 'scratch_data');
    expect(scratchCols).toHaveLength(0);

    // No stats for excluded tables
    const legacyStats = filtered.tableStatistics.filter(s => s.table === 'legacy_data');
    expect(legacyStats).toHaveLength(0);
  });

  // --- Max tables per schema limit ---
  it('should respect maxTablesPerSchema limit', async () => {
    const adapter = new PostgreSQLAdapter({
      type: 'postgresql',
      connectionUri: container.getConnectionUri(),
      schemas: ['public', 'mining', 'environmental'],
      excludeTables: [],
      maxTablesPerSchema: 3, // Very restrictive limit
    });
    await adapter.connect();
    const limited = await adapter.extractSchema();
    await adapter.disconnect();

    // Each schema should have at most 3 tables
    const schemas = ['public', 'mining', 'environmental'];
    for (const schema of schemas) {
      const count = limited.tables.filter(t => t.schema === schema).length;
      expect(count).toBeLessThanOrEqual(3);
    }
  });
});
