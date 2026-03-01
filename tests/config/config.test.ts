import { describe, it, expect } from 'vitest';
import { parseConfigString } from '../../src/config';

// =============================================================================
// Valid minimal config YAML
// =============================================================================

const VALID_CONFIG = `
database:
  type: postgresql
  host: localhost
  port: 5432
  database: test_db
  username: scanner
  password: secret
  ssl: false

scan:
  schemas:
    - public
    - mining
  excludeTables: []
  maxTablesPerSchema: 500

organisation:
  name: "Acme Mining Corp"
  sector: mining
  revenueAUD: 250000000
  totalFTE: 1200
  dataEngineers: 15
  avgEngineerSalaryAUD: 160000
  avgFTESalaryAUD: 110000
  csrdInScope: true
  canonicalInvestmentAUD: 2000000

output:
  directory: ./output
  format: html
  filename: dalc-report
`;

const VALID_CONFIG_WITH_URI = `
database:
  type: postgresql
  connectionUri: postgresql://scanner:secret@localhost:5432/test_db

organisation:
  name: "Test Corp"
  sector: environmental
  revenueAUD: 100000000
  totalFTE: 500
  dataEngineers: 5
  avgEngineerSalaryAUD: 150000
  avgFTESalaryAUD: 100000
`;

// =============================================================================
// Tests
// =============================================================================

describe('Config Parser', () => {
  describe('valid configs', () => {
    it('parses a complete valid config', () => {
      const config = parseConfigString(VALID_CONFIG);

      // Database
      expect(config.database.type).toBe('postgresql');
      expect(config.database.host).toBe('localhost');
      expect(config.database.port).toBe(5432);
      expect(config.database.database).toBe('test_db');
      expect(config.database.username).toBe('scanner');
      expect(config.database.password).toBe('secret');
      expect(config.database.ssl).toBe(false);
      expect(config.database.schemas).toEqual(['public', 'mining']);
      expect(config.database.excludeTables).toEqual([]);
      expect(config.database.maxTablesPerSchema).toBe(500);

      // Scanner config
      expect(config.scanner.organisation.name).toBe('Acme Mining Corp');
      expect(config.scanner.organisation.sector).toBe('mining');
      expect(config.scanner.organisation.revenueAUD).toBe(250_000_000);
      expect(config.scanner.organisation.totalFTE).toBe(1200);
      expect(config.scanner.organisation.dataEngineers).toBe(15);
      expect(config.scanner.organisation.avgSalaryAUD).toBe(160_000);
      expect(config.scanner.organisation.avgFTESalaryAUD).toBe(110_000);
      expect(config.scanner.organisation.csrdInScope).toBe(true);
      expect(config.scanner.organisation.canonicalInvestmentAUD).toBe(2_000_000);

      // Output
      expect(config.output.directory).toBe('./output');
      expect(config.output.format).toBe('html');
      expect(config.output.filename).toBe('dalc-report');
    });

    it('parses config with connectionUri', () => {
      const config = parseConfigString(VALID_CONFIG_WITH_URI);

      expect(config.database.type).toBe('postgresql');
      expect(config.database.connectionUri).toBe('postgresql://scanner:secret@localhost:5432/test_db');
      expect(config.scanner.organisation.sector).toBe('environmental');
    });

    it('applies defaults for optional fields', () => {
      const config = parseConfigString(VALID_CONFIG_WITH_URI);

      // Default scan settings
      expect(config.database.schemas).toEqual(['public']);
      expect(config.database.excludeTables).toEqual([]);
      expect(config.database.maxTablesPerSchema).toBe(500);

      // Default output settings
      expect(config.output.directory).toBe('./output');
      expect(config.output.format).toBe('html');
      expect(config.output.filename).toBe('dalc-report');

      // Default csrdInScope
      expect(config.scanner.organisation.csrdInScope).toBe(false);
    });

    it('accepts avgSalaryAUD as alternative to avgEngineerSalaryAUD', () => {
      const yaml = `
database:
  type: postgresql
  connectionUri: postgresql://u:p@h:5432/d

organisation:
  name: "Test"
  sector: energy
  revenueAUD: 50000000
  totalFTE: 300
  dataEngineers: 3
  avgSalaryAUD: 140000
  avgFTESalaryAUD: 90000
`;
      const config = parseConfigString(yaml);
      expect(config.scanner.organisation.avgSalaryAUD).toBe(140_000);
    });

    it('parses config with thresholds', () => {
      const yaml = `
database:
  type: postgresql
  connectionUri: postgresql://u:p@h:5432/d

organisation:
  name: "Test"
  sector: mining
  revenueAUD: 50000000
  totalFTE: 300
  dataEngineers: 3
  avgEngineerSalaryAUD: 140000
  avgFTESalaryAUD: 90000

thresholds:
  entitySimilarityThreshold: 0.8
  namingConvention: camelCase
  nullRateThreshold: 0.5
`;
      const config = parseConfigString(yaml);
      expect(config.scanner.thresholds.entitySimilarityThreshold).toBe(0.8);
      expect(config.scanner.thresholds.namingConvention).toBe('camelCase');
      expect(config.scanner.thresholds.nullRateThreshold).toBe(0.5);
    });

    it('accepts all valid sectors', () => {
      for (const sector of ['mining', 'environmental', 'energy']) {
        const yaml = `
database:
  type: postgresql
  connectionUri: postgresql://u:p@h:5432/d

organisation:
  name: "Test"
  sector: ${sector}
  revenueAUD: 50000000
  totalFTE: 300
  dataEngineers: 3
  avgEngineerSalaryAUD: 140000
  avgFTESalaryAUD: 90000
`;
        const config = parseConfigString(yaml);
        expect(config.scanner.organisation.sector).toBe(sector);
      }
    });

    it('accepts json output format', () => {
      const yaml = `
database:
  type: postgresql
  connectionUri: postgresql://u:p@h:5432/d

organisation:
  name: "Test"
  sector: mining
  revenueAUD: 50000000
  totalFTE: 300
  dataEngineers: 3
  avgEngineerSalaryAUD: 140000
  avgFTESalaryAUD: 90000

output:
  format: json
`;
      const config = parseConfigString(yaml);
      expect(config.output.format).toBe('json');
    });
  });

  describe('validation errors', () => {
    it('rejects empty config', () => {
      expect(() => parseConfigString('')).toThrow('empty or not a valid YAML');
    });

    it('rejects missing database section', () => {
      const yaml = `
organisation:
  name: "Test"
  sector: mining
  revenueAUD: 50000000
  totalFTE: 300
  dataEngineers: 3
  avgEngineerSalaryAUD: 140000
  avgFTESalaryAUD: 90000
`;
      expect(() => parseConfigString(yaml)).toThrow('database');
    });

    it('rejects missing organisation section', () => {
      const yaml = `
database:
  type: postgresql
  connectionUri: postgresql://u:p@h:5432/d
`;
      expect(() => parseConfigString(yaml)).toThrow('organisation');
    });

    it('rejects invalid sector', () => {
      const yaml = `
database:
  type: postgresql
  connectionUri: postgresql://u:p@h:5432/d

organisation:
  name: "Test"
  sector: manufacturing
  revenueAUD: 50000000
  totalFTE: 300
  dataEngineers: 3
  avgEngineerSalaryAUD: 140000
  avgFTESalaryAUD: 90000
`;
      expect(() => parseConfigString(yaml)).toThrow('sector');
    });

    it('rejects invalid database type', () => {
      const yaml = `
database:
  type: oracle
  connectionUri: oracle://u:p@h:1521/d

organisation:
  name: "Test"
  sector: mining
  revenueAUD: 50000000
  totalFTE: 300
  dataEngineers: 3
  avgEngineerSalaryAUD: 140000
  avgFTESalaryAUD: 90000
`;
      expect(() => parseConfigString(yaml)).toThrow('database.type');
    });

    it('rejects database without host or connectionUri', () => {
      const yaml = `
database:
  type: postgresql

organisation:
  name: "Test"
  sector: mining
  revenueAUD: 50000000
  totalFTE: 300
  dataEngineers: 3
  avgEngineerSalaryAUD: 140000
  avgFTESalaryAUD: 90000
`;
      expect(() => parseConfigString(yaml)).toThrow('connectionUri');
    });

    it('rejects missing required organisation fields', () => {
      const yaml = `
database:
  type: postgresql
  connectionUri: postgresql://u:p@h:5432/d

organisation:
  name: "Test"
  sector: mining
`;
      expect(() => parseConfigString(yaml)).toThrow('revenueAUD');
    });

    it('rejects negative revenueAUD', () => {
      const yaml = `
database:
  type: postgresql
  connectionUri: postgresql://u:p@h:5432/d

organisation:
  name: "Test"
  sector: mining
  revenueAUD: -100
  totalFTE: 300
  dataEngineers: 3
  avgEngineerSalaryAUD: 140000
  avgFTESalaryAUD: 90000
`;
      expect(() => parseConfigString(yaml)).toThrow('revenueAUD');
    });

    it('rejects missing salary fields', () => {
      const yaml = `
database:
  type: postgresql
  connectionUri: postgresql://u:p@h:5432/d

organisation:
  name: "Test"
  sector: mining
  revenueAUD: 50000000
  totalFTE: 300
  dataEngineers: 3
  avgFTESalaryAUD: 90000
`;
      expect(() => parseConfigString(yaml)).toThrow('avgEngineerSalaryAUD');
    });

    it('rejects invalid naming convention', () => {
      const yaml = `
database:
  type: postgresql
  connectionUri: postgresql://u:p@h:5432/d

organisation:
  name: "Test"
  sector: mining
  revenueAUD: 50000000
  totalFTE: 300
  dataEngineers: 3
  avgEngineerSalaryAUD: 140000
  avgFTESalaryAUD: 90000

thresholds:
  namingConvention: UPPER_CASE
`;
      expect(() => parseConfigString(yaml)).toThrow('namingConvention');
    });

    it('rejects invalid output format', () => {
      const yaml = `
database:
  type: postgresql
  connectionUri: postgresql://u:p@h:5432/d

organisation:
  name: "Test"
  sector: mining
  revenueAUD: 50000000
  totalFTE: 300
  dataEngineers: 3
  avgEngineerSalaryAUD: 140000
  avgFTESalaryAUD: 90000

output:
  format: pdf
`;
      expect(() => parseConfigString(yaml)).toThrow('output.format');
    });

    it('reports multiple errors at once', () => {
      const yaml = `
database:
  type: oracle

organisation:
  sector: manufacturing
`;
      try {
        parseConfigString(yaml);
        expect.fail('should have thrown');
      } catch (err: any) {
        // Should contain multiple error messages
        expect(err.message).toContain('database.type');
        expect(err.message).toContain('sector');
      }
    });
  });
});
