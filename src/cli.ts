#!/usr/bin/env node
/**
 * DALC Scanner CLI
 *
 * Full pipeline orchestrator:
 *   config -> connect -> extract -> check -> score -> map -> engine -> report
 *
 * Supports --dry-run mode using built-in mock schema factory.
 * Supports `ui` subcommand to start the web interface.
 */

import { Command } from 'commander';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { parseConfig } from './config';
import type { CLIConfig } from './config';
import { ALL_CHECKS, computeStrengths } from './checks/index';
import { scoreFindings } from './scoring/severity-scorer';
import { mapToEngineInput } from './scoring/mapper';
import { calculateDALC } from './engine/index';
import { buildReportData, generateReport } from './report/generator';
import { createMockSchema, createMockConfig } from './mock/schema-factory';
import type { SchemaData } from './adapters/types';
import type { ScannerConfig } from './checks/types';
import type { Finding } from './checks/types';

// =============================================================================
// Version
// =============================================================================
// Read version from package.json (resolved from project root)
const VERSION: string = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')
).version ?? '0.0.0';

// =============================================================================
// CLI setup
// =============================================================================

const program = new Command();

program
  .name('dalc-scanner')
  .description('DALC Phase 2 — Standalone diagnostic scanner for data architecture cost assessment')
  .version(VERSION)
  .option('-c, --config <path>', 'Path to config.yml', 'config.yml')
  .option('-o, --output <dir>', 'Output directory (overrides config)')
  .option('-v, --verbose', 'Verbose output')
  .option('--json', 'Output JSON instead of HTML')
  .option('--dry-run', 'Run with mock data (no database connection required)')
  .action(async (opts) => {
    try {
      await run(opts);
    } catch (err: any) {
      console.error(`\n${err.message ?? err}`);
      if (opts.verbose && err.stack) {
        console.error(err.stack);
      }
      process.exit(1);
    }
  });

// =============================================================================
// UI subcommand
// =============================================================================

program
  .command('ui')
  .description('Start the web interface')
  .option('-p, --port <number>', 'Port to listen on', '3000')
  .option('-d, --data-dir <path>', 'Data directory for SQLite database', './data')
  .action(async (opts) => {
    const { createServer } = await import('./server/index');

    const port = parseInt(opts.port);
    const dataDir = resolve(opts.dataDir);

    // Check for built UI
    const uiDir = resolve(__dirname, '../ui/dist');

    const { app } = createServer({
      port,
      dataDir,
      uiDir: existsSync(uiDir) ? uiDir : undefined,
      version: VERSION,
    });

    app.listen(port, () => {
      console.log('');
      console.log('═══════════════════════════════════════════════════════');
      console.log('  DALC Scanner — Web Interface');
      console.log('═══════════════════════════════════════════════════════');
      console.log(`  API: http://localhost:${port}`);
      console.log(`  Data: ${dataDir}`);
      console.log('═══════════════════════════════════════════════════════');
      console.log('');
    });
  });

program.parse();

// =============================================================================
// Main pipeline
// =============================================================================

interface CLIOptions {
  config: string;
  output?: string;
  verbose?: boolean;
  json?: boolean;
  dryRun?: boolean;
}

async function run(opts: CLIOptions): Promise<void> {
  const startTime = Date.now();

  log(opts, `\nDALC Scanner v${VERSION}`);
  log(opts, '='.repeat(50));

  // -------------------------------------------------------------------------
  // Step 1: Config
  // -------------------------------------------------------------------------
  let cliConfig: CLIConfig | undefined;
  let scannerConfig: ScannerConfig;
  let schemaData: SchemaData;
  let outputDir: string;
  let outputFormat: 'html' | 'json';
  let outputFilename: string;
  let orgName: string;

  if (opts.dryRun) {
    log(opts, '\nMode: DRY RUN (using mock schema)');

    // In dry-run, try to load config for org info, fall back to mock config
    if (existsSync(resolve(opts.config))) {
      try {
        cliConfig = parseConfig(resolve(opts.config));
        scannerConfig = cliConfig.scanner;
        log(opts, `   Config loaded from ${opts.config}`);
      } catch {
        scannerConfig = createMockConfig();
        log(opts, '   Using default mock config (Acme Mining Corp)');
      }
    } else {
      scannerConfig = createMockConfig();
      log(opts, '   Using default mock config (Acme Mining Corp)');
    }

    schemaData = createMockSchema();
    orgName = scannerConfig.organisation.name;
    outputDir = opts.output ?? cliConfig?.output?.directory ?? './output';
    outputFormat = opts.json ? 'json' : (cliConfig?.output?.format ?? 'html');
    outputFilename = cliConfig?.output?.filename ?? 'dalc-report';

    verbose(opts, `   Mock schema: ${schemaData.tables.length} tables, ${schemaData.columns.length} columns`);
  } else {
    // -----------------------------------------------------------------------
    // Live mode: parse config, connect to DB
    // -----------------------------------------------------------------------
    log(opts, `\nLoading config from ${opts.config}`);
    const configPath = resolve(opts.config);

    if (!existsSync(configPath)) {
      throw new Error(
        `Config file not found: ${configPath}\n` +
        'Copy config.example.yml to config.yml and edit with your values,\n' +
        'or use --dry-run to test with mock data.'
      );
    }

    cliConfig = parseConfig(configPath);
    scannerConfig = cliConfig.scanner;
    orgName = scannerConfig.organisation.name;
    outputDir = opts.output ?? cliConfig.output.directory;
    outputFormat = opts.json ? 'json' : cliConfig.output.format;
    outputFilename = cliConfig.output.filename;

    verbose(opts, `   Organisation: ${orgName}`);
    verbose(opts, `   Sector: ${scannerConfig.organisation.sector}`);
    verbose(opts, `   Schemas: ${cliConfig.database.schemas.join(', ')}`);

    // -----------------------------------------------------------------------
    // Step 2: Connect & extract schema
    // -----------------------------------------------------------------------
    log(opts, '\nConnecting to database...');

    if (cliConfig.database.type !== 'postgresql') {
      throw new Error(`Database type "${cliConfig.database.type}" is not yet supported. Only "postgresql" is currently available.`);
    }

    // Dynamic import to avoid pulling in pg for dry-run
    const { PostgreSQLAdapter } = await import('./adapters/postgres');
    const adapter = new PostgreSQLAdapter(cliConfig.database);

    try {
      await adapter.connect();
      log(opts, '   Connected successfully.');

      // Check stats freshness
      const freshness = await adapter.checkStatsFreshness();
      if (freshness.warning) {
        console.warn(`   Warning: ${freshness.warning}`);
      }

      log(opts, '\nExtracting schema metadata...');
      schemaData = await adapter.extractSchema();
      log(opts, `   Extracted ${schemaData.tables.length} tables, ${schemaData.columns.length} columns`);
    } finally {
      await adapter.disconnect();
      verbose(opts, '   Database connection closed.');
    }
  }

  // -------------------------------------------------------------------------
  // Step 3: Run checks
  // -------------------------------------------------------------------------
  log(opts, `\nRunning ${ALL_CHECKS.length} diagnostic checks...`);

  const findings: Finding[] = [];
  for (const check of ALL_CHECKS) {
    const results = check.execute(schemaData, scannerConfig);
    findings.push(...results);
    if (results.length > 0) {
      verbose(opts, `   ${check.name}: ${results.length} finding(s)`);
    }
  }

  log(opts, `   Found ${findings.length} issues across ${new Set(findings.map((f) => f.property)).size} properties`);

  // -------------------------------------------------------------------------
  // Step 4: Score findings
  // -------------------------------------------------------------------------
  log(opts, '\nScoring findings...');
  const scored = scoreFindings(findings, schemaData);

  verbose(opts, `   Total tables: ${scored.totalTables}`);
  verbose(opts, `   Total rows: ${scored.totalRowCount.toLocaleString()}`);
  verbose(opts, `   Complexity floor applied: ${scored.complexityFloorApplied}`);
  verbose(opts, `   Zero-row downgrade: ${scored.zeroRowDowngrade}`);

  for (const [prop, score] of scored.propertyScores) {
    verbose(opts, `   P${prop} score: ${score.toFixed(3)}`);
  }

  // -------------------------------------------------------------------------
  // Step 5: Map to engine input
  // -------------------------------------------------------------------------
  log(opts, '\nMapping to DALC engine input...');
  const engineInput = mapToEngineInput(scored, schemaData, scannerConfig);

  verbose(opts, `   Sector: ${engineInput.sector}`);
  verbose(opts, `   Modelling approach: ${engineInput.modellingApproach}`);
  verbose(opts, `   Source systems: ${engineInput.sourceSystems}`);
  verbose(opts, `   Findings: ${engineInput.findings.map((f) => `${f.id}=${f.severity}`).join(', ')}`);

  // -------------------------------------------------------------------------
  // Step 6: Run DALC engine
  // -------------------------------------------------------------------------
  log(opts, '\nRunning DALC v4 engine...');
  const result = calculateDALC(engineInput);

  log(opts, `   Engine version: ${result.engineVersion}`);
  log(opts, `   Annual disorder cost: $${result.finalTotal.toLocaleString('en-AU', { maximumFractionDigits: 0 })}`);
  log(opts, `   Annual saving opportunity: $${result.annualSaving.toLocaleString('en-AU', { maximumFractionDigits: 0 })}`);
  log(opts, `   Payback period: ${result.paybackMonths.toFixed(1)} months`);

  // -------------------------------------------------------------------------
  // Step 7: Generate output
  // -------------------------------------------------------------------------
  log(opts, '\nGenerating report...');

  // Ensure output directory exists
  const resolvedOutputDir = resolve(outputDir);
  if (!existsSync(resolvedOutputDir)) {
    mkdirSync(resolvedOutputDir, { recursive: true });
  }

  if (outputFormat === 'json') {
    // JSON output
    const jsonOutput = {
      version: VERSION,
      generatedAt: new Date().toISOString(),
      organisation: orgName,
      sector: engineInput.sector,
      engineResult: result,
      scannerFindings: scored.findings.map((f) => ({
        checkId: f.checkId,
        property: f.property,
        severity: f.severity,
        rawScore: f.rawScore,
        title: f.title,
        description: f.description,
        affectedObjects: f.affectedObjects,
        totalObjects: f.totalObjects,
        ratio: f.ratio,
        remediation: f.remediation,
        costCategories: f.costCategories,
      })),
      summary: {
        totalTables: scored.totalTables,
        totalRowCount: scored.totalRowCount,
        totalFindings: scored.findings.length,
        criticalCount: scored.findings.filter((f) => f.severity === 'critical').length,
        majorCount: scored.findings.filter((f) => f.severity === 'major').length,
        minorCount: scored.findings.filter((f) => f.severity === 'minor').length,
        infoCount: scored.findings.filter((f) => f.severity === 'info').length,
      },
    };

    const jsonPath = join(resolvedOutputDir, `${outputFilename}.json`);
    writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 2), 'utf-8');
    log(opts, `   JSON report written to ${jsonPath}`);
  } else {
    // HTML output
    const strengths = computeStrengths(schemaData, scannerConfig, scored.findings);
    const reportData = buildReportData(result, scored, orgName, undefined, {
      strengths,
      databaseLabel: schemaData.databaseVersion || undefined,
    });
    const html = generateReport(reportData);

    const htmlPath = join(resolvedOutputDir, `${outputFilename}.html`);
    writeFileSync(htmlPath, html, 'utf-8');
    log(opts, `   HTML report written to ${htmlPath}`);
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(opts, `\nDone in ${elapsed}s`);
  log(opts, '='.repeat(50));
}

// =============================================================================
// Logging helpers
// =============================================================================

function log(_opts: CLIOptions, message: string): void {
  console.log(message);
}

function verbose(opts: CLIOptions, message: string): void {
  if (opts.verbose) {
    console.log(message);
  }
}
