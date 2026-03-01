/**
 * YAML Config Parser
 *
 * Reads and validates a YAML configuration file into typed CLIConfig.
 * Produces DatabaseAdapterConfig + ScannerConfig + output settings.
 */

import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import type { DatabaseAdapterConfig } from './adapters/types';
import type { ScannerConfig } from './checks/types';

// =============================================================================
// CLIConfig — the top-level config shape returned to the CLI
// =============================================================================

export interface OutputConfig {
  directory: string;
  format: 'html' | 'json';
  filename: string;
}

export interface CLIConfig {
  database: DatabaseAdapterConfig;
  scanner: ScannerConfig;
  output: OutputConfig;
}

// =============================================================================
// Raw YAML shape (before validation)
// =============================================================================

interface RawConfig {
  database?: {
    type?: string;
    connectionUri?: string;
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    ssl?: boolean;
  };
  scan?: {
    schemas?: string[];
    excludeTables?: string[];
    maxTablesPerSchema?: number;
  };
  organisation?: {
    name?: string;
    sector?: string;
    revenueAUD?: number;
    totalFTE?: number;
    dataEngineers?: number;
    avgEngineerSalaryAUD?: number;
    avgFTESalaryAUD?: number;
    avgSalaryAUD?: number;
    aiBudgetAUD?: number;
    csrdInScope?: boolean;
    canonicalInvestmentAUD?: number;
  };
  thresholds?: {
    entitySimilarityThreshold?: number;
    synonymGroups?: Array<{ canonical: string; variants: string[] }>;
    unitVariantThreshold?: number;
    sharedEntityThreshold?: number;
    csvIndicatorPatterns?: string[];
    namingConvention?: string;
    nullRateThreshold?: number;
    orphanedTableThreshold?: number;
    auditColumnPatterns?: string[];
    timestampColumnPatterns?: string[];
  };
  output?: {
    directory?: string;
    format?: string;
    filename?: string;
  };
}

// =============================================================================
// Validation helpers
// =============================================================================

class ConfigValidationError extends Error {
  constructor(public errors: string[]) {
    super(`Config validation failed:\n  - ${errors.join('\n  - ')}`);
    this.name = 'ConfigValidationError';
  }
}

const VALID_SECTORS = ['mining', 'environmental', 'energy'];
const VALID_DB_TYPES = ['postgresql', 'mysql', 'mssql'];
const VALID_FORMATS = ['html', 'json'];
const VALID_NAMING = ['snake_case', 'camelCase', 'PascalCase', 'any'];

function requireField(errors: string[], obj: unknown, path: string): void {
  if (obj === undefined || obj === null) {
    errors.push(`Missing required field: ${path}`);
  }
}

function requirePositiveNumber(errors: string[], value: unknown, path: string): void {
  if (typeof value !== 'number' || value <= 0 || !Number.isFinite(value)) {
    errors.push(`${path} must be a positive number, got: ${value}`);
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Parse a YAML config file and return a validated CLIConfig.
 * Throws ConfigValidationError if validation fails.
 */
export function parseConfig(filePath: string): CLIConfig {
  const content = readFileSync(filePath, 'utf-8');
  return parseConfigString(content);
}

/**
 * Parse a YAML config string (useful for testing).
 */
export function parseConfigString(content: string): CLIConfig {
  const raw = yaml.load(content) as RawConfig;

  if (!raw || typeof raw !== 'object') {
    throw new ConfigValidationError(['Config file is empty or not a valid YAML object']);
  }

  const errors: string[] = [];

  // -----------------------------------------------------------------------
  // Database section
  // -----------------------------------------------------------------------
  if (!raw.database) {
    errors.push('Missing required section: database');
  }

  const dbType = raw.database?.type ?? 'postgresql';
  if (!VALID_DB_TYPES.includes(dbType)) {
    errors.push(`database.type must be one of: ${VALID_DB_TYPES.join(', ')}. Got: "${dbType}"`);
  }

  // Must have either connectionUri or host+database
  const hasUri = !!raw.database?.connectionUri;
  const hasHost = !!raw.database?.host && !!raw.database?.database;
  if (!hasUri && !hasHost) {
    errors.push('database must specify either connectionUri or both host and database');
  }

  // -----------------------------------------------------------------------
  // Organisation section
  // -----------------------------------------------------------------------
  if (!raw.organisation) {
    errors.push('Missing required section: organisation');
  } else {
    requireField(errors, raw.organisation.name, 'organisation.name');
    requireField(errors, raw.organisation.sector, 'organisation.sector');
    requirePositiveNumber(errors, raw.organisation.revenueAUD, 'organisation.revenueAUD');
    requirePositiveNumber(errors, raw.organisation.totalFTE, 'organisation.totalFTE');
    requirePositiveNumber(errors, raw.organisation.dataEngineers, 'organisation.dataEngineers');

    // Accept either avgEngineerSalaryAUD or avgSalaryAUD
    const avgSalary = raw.organisation.avgEngineerSalaryAUD ?? raw.organisation.avgSalaryAUD;
    if (avgSalary === undefined) {
      errors.push('Missing required field: organisation.avgEngineerSalaryAUD (or avgSalaryAUD)');
    } else {
      requirePositiveNumber(errors, avgSalary, 'organisation.avgEngineerSalaryAUD');
    }

    requirePositiveNumber(errors, raw.organisation.avgFTESalaryAUD, 'organisation.avgFTESalaryAUD');

    if (raw.organisation.sector && !VALID_SECTORS.includes(raw.organisation.sector)) {
      errors.push(`organisation.sector must be one of: ${VALID_SECTORS.join(', ')}. Got: "${raw.organisation.sector}"`);
    }
  }

  // -----------------------------------------------------------------------
  // Thresholds (optional, validate if present)
  // -----------------------------------------------------------------------
  if (raw.thresholds?.namingConvention && !VALID_NAMING.includes(raw.thresholds.namingConvention)) {
    errors.push(`thresholds.namingConvention must be one of: ${VALID_NAMING.join(', ')}. Got: "${raw.thresholds.namingConvention}"`);
  }

  // -----------------------------------------------------------------------
  // Output section (optional, defaults applied later)
  // -----------------------------------------------------------------------
  if (raw.output?.format && !VALID_FORMATS.includes(raw.output.format)) {
    errors.push(`output.format must be one of: ${VALID_FORMATS.join(', ')}. Got: "${raw.output.format}"`);
  }

  // -----------------------------------------------------------------------
  // Bail if errors
  // -----------------------------------------------------------------------
  if (errors.length > 0) {
    throw new ConfigValidationError(errors);
  }

  // -----------------------------------------------------------------------
  // Build validated config objects
  // -----------------------------------------------------------------------
  const org = raw.organisation!;
  const avgSalary = org.avgEngineerSalaryAUD ?? org.avgSalaryAUD!;

  const database: DatabaseAdapterConfig = {
    type: dbType as DatabaseAdapterConfig['type'],
    connectionUri: raw.database!.connectionUri,
    host: raw.database!.host,
    port: raw.database!.port,
    database: raw.database!.database,
    username: raw.database!.username,
    password: raw.database!.password,
    ssl: raw.database!.ssl,
    schemas: raw.scan?.schemas ?? ['public'],
    excludeTables: raw.scan?.excludeTables ?? [],
    maxTablesPerSchema: raw.scan?.maxTablesPerSchema ?? 500,
  };

  const scanner: ScannerConfig = {
    organisation: {
      name: org.name!,
      sector: org.sector!,
      revenueAUD: org.revenueAUD!,
      totalFTE: org.totalFTE!,
      dataEngineers: org.dataEngineers!,
      avgSalaryAUD: avgSalary,
      avgFTESalaryAUD: org.avgFTESalaryAUD!,
      aiBudgetAUD: org.aiBudgetAUD,
      csrdInScope: org.csrdInScope ?? false,
      canonicalInvestmentAUD: org.canonicalInvestmentAUD,
    },
    thresholds: {
      entitySimilarityThreshold: raw.thresholds?.entitySimilarityThreshold,
      synonymGroups: raw.thresholds?.synonymGroups,
      unitVariantThreshold: raw.thresholds?.unitVariantThreshold,
      sharedEntityThreshold: raw.thresholds?.sharedEntityThreshold,
      csvIndicatorPatterns: raw.thresholds?.csvIndicatorPatterns,
      namingConvention: raw.thresholds?.namingConvention as ScannerConfig['thresholds']['namingConvention'],
      nullRateThreshold: raw.thresholds?.nullRateThreshold,
      orphanedTableThreshold: raw.thresholds?.orphanedTableThreshold,
      auditColumnPatterns: raw.thresholds?.auditColumnPatterns,
      timestampColumnPatterns: raw.thresholds?.timestampColumnPatterns,
    },
  };

  const output: OutputConfig = {
    directory: raw.output?.directory ?? './output',
    format: (raw.output?.format as OutputConfig['format']) ?? 'html',
    filename: raw.output?.filename ?? 'dalc-report',
  };

  return { database, scanner, output };
}
