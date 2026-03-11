import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dirname, '..', '..');
const OUTPUT_DIR = join(PROJECT_ROOT, 'test-output-cli');

describe('CLI Dry-Run', () => {
  beforeEach(() => {
    // Clean up output directory before each test
    if (existsSync(OUTPUT_DIR)) {
      rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean up after tests
    if (existsSync(OUTPUT_DIR)) {
      rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  it('runs --dry-run and produces HTML report', () => {
    const result = execSync(
      `npx tsx src/cli.ts --dry-run --output "${OUTPUT_DIR}"`,
      { cwd: PROJECT_ROOT, encoding: 'utf-8', timeout: 30_000 },
    );

    // CLI should output progress messages
    expect(result).toContain('DALC Scanner');
    expect(result).toContain('DRY RUN');
    expect(result).toContain('Running');
    expect(result).toContain('Done');

    // Should produce HTML file
    const htmlPath = join(OUTPUT_DIR, 'dalc-report.html');
    expect(existsSync(htmlPath)).toBe(true);

    const html = readFileSync(htmlPath, 'utf-8');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Acme Mining Corp');
    expect(html).toContain('v4.0.0');
  });

  it('runs --dry-run --json and produces JSON report', () => {
    const result = execSync(
      `npx tsx src/cli.ts --dry-run --json --output "${OUTPUT_DIR}"`,
      { cwd: PROJECT_ROOT, encoding: 'utf-8', timeout: 30_000 },
    );

    expect(result).toContain('DRY RUN');
    expect(result).toContain('JSON report');

    const jsonPath = join(OUTPUT_DIR, 'dalc-report.json');
    expect(existsSync(jsonPath)).toBe(true);

    const data = JSON.parse(readFileSync(jsonPath, 'utf-8'));

    // Verify JSON structure
    expect(data.version).toBe('3.0.0');
    expect(data.organisation).toBe('Acme Mining Corp');
    expect(data.sector).toBe('mining');
    expect(data.engineResult).toBeDefined();
    expect(data.engineResult.engineVersion).toBe('v4.0.0');
    expect(data.engineResult.finalTotal).toBeGreaterThan(0);
    expect(data.engineResult.propertyScores).toHaveLength(8);
    expect(data.engineResult.fiveYearProjection).toHaveLength(5);
    expect(data.scannerFindings).toBeDefined();
    expect(data.scannerFindings.length).toBeGreaterThan(0);
    expect(data.summary).toBeDefined();
    expect(data.summary.totalTables).toBe(25);
  });

  it('runs --dry-run --verbose and shows detailed output', () => {
    const result = execSync(
      `npx tsx src/cli.ts --dry-run --verbose --output "${OUTPUT_DIR}"`,
      { cwd: PROJECT_ROOT, encoding: 'utf-8', timeout: 30_000 },
    );

    // Verbose should show additional details
    expect(result).toContain('Mock schema');
    expect(result).toContain('tables');
    expect(result).toContain('columns');
    expect(result).toContain('Modelling approach');
    expect(result).toContain('Source systems');
  });

  it('shows version with --version', () => {
    const result = execSync(
      `npx tsx src/cli.ts --version`,
      { cwd: PROJECT_ROOT, encoding: 'utf-8', timeout: 15_000 },
    );
    expect(result.trim()).toBe('3.0.0');
  });

  it('shows help with --help', () => {
    const result = execSync(
      `npx tsx src/cli.ts --help`,
      { cwd: PROJECT_ROOT, encoding: 'utf-8', timeout: 15_000 },
    );
    expect(result).toContain('dalc-scanner');
    expect(result).toContain('--config');
    expect(result).toContain('--dry-run');
    expect(result).toContain('--verbose');
    expect(result).toContain('--json');
    expect(result).toContain('--output');
  });

  it('exits with error when config not found and not dry-run', () => {
    expect(() => {
      execSync(
        `npx tsx src/cli.ts --config nonexistent.yml`,
        { cwd: PROJECT_ROOT, encoding: 'utf-8', timeout: 15_000 },
      );
    }).toThrow();
  });
});
