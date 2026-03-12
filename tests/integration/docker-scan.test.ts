// =============================================================================
// Docker Scan Integration Test
// Spins up a real PostgreSQL via Testcontainers, seeds the fixture, and runs
// the full DALC pipeline: adapter → checks → scorer → mapper → engine → report.
//
// INFRA-DEPENDENT: Requires Docker for Testcontainers.
// Set DOCKER_TESTS=1 to run.  Skipped by default in local/CI environments
// without Docker.
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Client } from 'pg';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { join, resolve } from 'path';

import { PostgreSQLAdapter } from '../../src/adapters/postgres';
import type { SchemaData } from '../../src/adapters/types';
import type { ScannerConfig } from '../../src/checks/types';
import type { Finding } from '../../src/checks/types';
import { ALL_CHECKS } from '../../src/checks/index';
import { scoreFindings } from '../../src/scoring/severity-scorer';
import { mapToEngineInput } from '../../src/scoring/mapper';
import { calculateDALC } from '../../src/engine/index';
import { buildReportData, generateReport } from '../../src/report/generator';

const FIXTURE_PATH = resolve(import.meta.dirname, '..', 'fixtures', 'postgres.sql');
const OUTPUT_DIR = resolve(import.meta.dirname, '..', '..', 'test-output-docker');

// Scanner config matching config.test.yml
const scannerConfig: ScannerConfig = {
  organisation: {
    name: 'Test Mining Corp',
    sector: 'mining',
    revenueAUD: 250_000_000,
    totalFTE: 1200,
    dataEngineers: 15,
    avgSalaryAUD: 160_000,
    avgFTESalaryAUD: 110_000,
    csrdInScope: true,
    canonicalInvestmentAUD: 2_000_000,
  },
  thresholds: {},
};

const DOCKER_AVAILABLE = process.env.DOCKER_TESTS === '1';

describe.skipIf(!DOCKER_AVAILABLE)('Docker Scan Integration', () => {
  let container: StartedPostgreSqlContainer;
  let schemaData: SchemaData;

  beforeAll(async () => {
    // Clean output
    if (existsSync(OUTPUT_DIR)) {
      rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
    mkdirSync(OUTPUT_DIR, { recursive: true });

    // Start PostgreSQL container
    container = await new PostgreSqlContainer('postgres:16-alpine').start();

    // Seed fixture
    const client = new Client({ connectionString: container.getConnectionUri() });
    await client.connect();
    const fixture = readFileSync(FIXTURE_PATH, 'utf8');
    await client.query(fixture);
    await client.end();

    // Extract schema using adapter
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
  }, 120_000);

  afterAll(async () => {
    await container?.stop();
    if (existsSync(OUTPUT_DIR)) {
      rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  // ---------------------------------------------------------------------------
  // Schema extraction sanity checks
  // ---------------------------------------------------------------------------

  it('extracts tables from all 3 schemas', () => {
    const schemas = new Set(schemaData.tables.map(t => t.schema));
    expect(schemas).toContain('public');
    expect(schemas).toContain('mining');
    expect(schemas).toContain('environmental');
  });

  it('extracts at least 15 tables', () => {
    const baseTables = schemaData.tables.filter(t => t.type === 'table');
    expect(baseTables.length).toBeGreaterThanOrEqual(15);
  });

  // ---------------------------------------------------------------------------
  // Full pipeline: checks → score → map → engine
  // ---------------------------------------------------------------------------

  it('runs all checks and produces findings', () => {
    const findings: Finding[] = [];
    for (const check of ALL_CHECKS) {
      findings.push(...check.execute(schemaData, scannerConfig));
    }

    expect(findings.length).toBeGreaterThan(0);

    // Should cover multiple properties
    const properties = new Set(findings.map(f => f.property));
    expect(properties.size).toBeGreaterThanOrEqual(3);
  });

  it('scores, maps, and runs engine on live schema', () => {
    const findings: Finding[] = [];
    for (const check of ALL_CHECKS) {
      findings.push(...check.execute(schemaData, scannerConfig));
    }

    const scored = scoreFindings(findings, schemaData);
    expect(scored.findings.every(f => f.rawScore > 0)).toBe(true);

    const input = mapToEngineInput(scored, schemaData, scannerConfig);
    expect(input.findings).toHaveLength(8);

    const result = calculateDALC(input);

    // Engine should produce valid result
    expect(result.engineVersion).toBe('v4.0.0');
    expect(result.finalTotal).toBeGreaterThan(0);
    expect(result.propertyScores).toHaveLength(8);
    expect(result.fiveYearProjection).toHaveLength(5);
    expect(result.annualSaving).toBeDefined();
    expect(result.paybackMonths).toBeDefined();

    // Sanity: costs plausible for $250M revenue mining company
    expect(result.finalTotal).toBeGreaterThan(100_000);
    expect(result.finalTotal).toBeLessThan(100_000_000);
  });

  // ---------------------------------------------------------------------------
  // Report generation from live data
  // ---------------------------------------------------------------------------

  it('generates HTML report from live pipeline', () => {
    const findings: Finding[] = [];
    for (const check of ALL_CHECKS) {
      findings.push(...check.execute(schemaData, scannerConfig));
    }

    const scored = scoreFindings(findings, schemaData);
    const input = mapToEngineInput(scored, schemaData, scannerConfig);
    const result = calculateDALC(input);
    const reportData = buildReportData(result, scored, 'Test Mining Corp');
    const html = generateReport(reportData);

    // Write to file for inspection
    const htmlPath = join(OUTPUT_DIR, 'dalc-report.html');
    writeFileSync(htmlPath, html, 'utf-8');

    // Validate HTML
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Test Mining Corp');
    expect(html).toContain('v4.0.0');
    expect(html.length).toBeGreaterThan(1000);

    // Air-gap: no external URLs
    const urls = html.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
    expect(urls).toHaveLength(0);

    // No JavaScript
    expect(html).not.toContain('<script');
    expect(html).not.toContain('javascript:');
  });

  it('generates JSON report from live pipeline', () => {
    const findings: Finding[] = [];
    for (const check of ALL_CHECKS) {
      findings.push(...check.execute(schemaData, scannerConfig));
    }

    const scored = scoreFindings(findings, schemaData);
    const input = mapToEngineInput(scored, schemaData, scannerConfig);
    const result = calculateDALC(input);

    // Build JSON-compatible report
    const jsonReport = {
      version: '0.1.0',
      organisation: 'Test Mining Corp',
      sector: 'mining',
      generatedAt: new Date().toISOString(),
      engineResult: {
        engineVersion: result.engineVersion,
        finalTotal: result.finalTotal,
        baseTotal: result.baseTotal,
        amplifiedTotal: result.amplifiedTotal,
        amplificationRatio: result.amplificationRatio,
        annualSaving: result.annualSaving,
        paybackMonths: result.paybackMonths,
        overallMaturity: result.overallMaturity,
        propertyScores: result.propertyScores,
        fiveYearProjection: result.fiveYearProjection,
      },
      scannerFindings: scored.findings.map(f => ({
        checkId: f.checkId,
        property: f.property,
        severity: f.severity,
        rawScore: f.rawScore,
        title: f.title,
        affectedObjects: f.affectedObjects,
        totalObjects: f.totalObjects,
      })),
      summary: {
        totalTables: schemaData.tables.filter(t => t.type === 'table').length,
        totalFindings: scored.findings.length,
        schemasScanned: [...new Set(schemaData.tables.map(t => t.schema))].length,
      },
    };

    const jsonPath = join(OUTPUT_DIR, 'dalc-report.json');
    writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2), 'utf-8');

    // Verify JSON structure
    const data = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    expect(data.version).toBe('0.1.0');
    expect(data.organisation).toBe('Test Mining Corp');
    expect(data.engineResult.engineVersion).toBe('v4.0.0');
    expect(data.engineResult.finalTotal).toBeGreaterThan(0);
    expect(data.engineResult.propertyScores).toHaveLength(8);
    expect(data.scannerFindings.length).toBeGreaterThan(0);
    expect(data.summary.schemasScanned).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // Stats freshness from live DB
  // ---------------------------------------------------------------------------

  it('reports stats as fresh after fixture ANALYZE', async () => {
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
  });
});
