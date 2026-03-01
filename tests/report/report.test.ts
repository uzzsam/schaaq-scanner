import { describe, it, expect } from 'vitest';
import { ALL_CHECKS } from '../../src/checks/index';
import { scoreFindings } from '../../src/scoring/severity-scorer';
import { mapToEngineInput } from '../../src/scoring/mapper';
import { calculateDALC } from '../../src/engine/index';
import { createMockSchema, createMockConfig } from '../../src/mock/schema-factory';
import { buildReportData, generateReport } from '../../src/report/generator';
import type { Finding } from '../../src/checks/types';

// =============================================================================
// Shared setup: run the full pipeline to get real data for reports
// =============================================================================

function runPipeline() {
  const schema = createMockSchema();
  const config = createMockConfig();

  const findings: Finding[] = [];
  for (const check of ALL_CHECKS) {
    findings.push(...check.execute(schema, config));
  }

  const scored = scoreFindings(findings, schema);
  const engineInput = mapToEngineInput(scored, schema, config);
  const result = calculateDALC(engineInput);

  return { schema, config, scored, result };
}

// =============================================================================
// Tests
// =============================================================================

describe('Report Generator', () => {
  describe('buildReportData', () => {
    it('produces valid report data from pipeline output', () => {
      const { scored, result } = runPipeline();
      const data = buildReportData(result, scored, 'Acme Mining Corp');

      expect(data.organisationName).toBe('Acme Mining Corp');
      expect(data.sector).toBe('mining');
      expect(data.engineVersion).toBe('v4.0.0');
      expect(data.generatedAt).toBeTruthy();
    });

    it('includes headline financial numbers', () => {
      const { scored, result } = runPipeline();
      const data = buildReportData(result, scored, 'Test Corp');

      expect(data.finalTotal).toBeGreaterThan(0);
      expect(data.baseTotal).toBeGreaterThan(0);
      expect(data.amplifiedTotal).toBeGreaterThan(0);
      expect(data.annualSaving).toBeDefined();
      expect(data.paybackMonths).toBeDefined();
      expect(data.overallMaturity).toBeGreaterThanOrEqual(0);
      expect(data.overallMaturity).toBeLessThanOrEqual(4);
    });

    it('includes cost category breakdown', () => {
      const { scored, result } = runPipeline();
      const data = buildReportData(result, scored, 'Test Corp');

      expect(data.costCategories).toHaveLength(5);
      const names = data.costCategories.map((c) => c.name);
      expect(names).toContain('Firefighting');
      expect(names).toContain('Data Quality');
      expect(names).toContain('Integration');
      expect(names).toContain('Productivity');
      expect(names).toContain('Regulatory');

      // Percentages should roughly sum to 100
      const totalPct = data.costCategories.reduce((s, c) => s + c.percentage, 0);
      expect(totalPct).toBeGreaterThan(95);
      expect(totalPct).toBeLessThanOrEqual(100.1);
    });

    it('includes 7 property scores with bar chart data', () => {
      const { scored, result } = runPipeline();
      const data = buildReportData(result, scored, 'Test Corp');

      expect(data.propertyScores).toHaveLength(7);
      for (const ps of data.propertyScores) {
        expect(ps.name).toBeTruthy();
        expect(ps.score).toBeGreaterThanOrEqual(0);
        expect(ps.score).toBeLessThanOrEqual(4);
        expect(ps.barWidth).toBeGreaterThanOrEqual(0);
        expect(ps.barWidth).toBeLessThanOrEqual(100);
        expect(ps.barColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(ps.maturityLabel).toBeTruthy();
      }
    });

    it('includes five-year projection with bar widths', () => {
      const { scored, result } = runPipeline();
      const data = buildReportData(result, scored, 'Test Corp');

      expect(data.fiveYearProjection).toHaveLength(5);
      for (const yr of data.fiveYearProjection) {
        expect(yr.year).toBeGreaterThanOrEqual(1);
        expect(yr.year).toBeLessThanOrEqual(5);
        expect(yr.doNothingCost).toBeGreaterThan(0);
        expect(yr.doNothingBarWidth).toBeGreaterThan(0);
        expect(yr.doNothingBarWidth).toBeLessThanOrEqual(100);
      }
    });

    it('includes scanner findings with severity colors', () => {
      const { scored, result } = runPipeline();
      const data = buildReportData(result, scored, 'Test Corp');

      expect(data.findings.length).toBeGreaterThan(0);
      expect(data.totalFindings).toBe(data.findings.length);

      for (const f of data.findings) {
        expect(f.checkId).toBeTruthy();
        expect(f.property).toBeGreaterThanOrEqual(1);
        expect(f.property).toBeLessThanOrEqual(7);
        expect(['critical', 'major', 'minor', 'info']).toContain(f.severity);
        expect(f.severityColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(f.title).toBeTruthy();
        expect(f.remediation).toBeTruthy();
        expect(f.rawScore).toBeGreaterThan(0);
        expect(f.rawScore).toBeLessThanOrEqual(1);
      }
    });

    it('includes correct severity counts', () => {
      const { scored, result } = runPipeline();
      const data = buildReportData(result, scored, 'Test Corp');

      const sumCounts = data.criticalCount + data.majorCount + data.minorCount + data.infoCount;
      expect(sumCounts).toBe(data.totalFindings);
    });
  });

  describe('generateReport', () => {
    it('produces valid HTML string', () => {
      const { scored, result } = runPipeline();
      const data = buildReportData(result, scored, 'Acme Mining Corp');
      const html = generateReport(data);

      expect(typeof html).toBe('string');
      expect(html.length).toBeGreaterThan(1000);
    });

    it('contains DOCTYPE and required HTML structure', () => {
      const { scored, result } = runPipeline();
      const data = buildReportData(result, scored, 'Test Corp');
      const html = generateReport(data);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html');
      expect(html).toContain('</html>');
      expect(html).toContain('<head>');
      expect(html).toContain('<body>');
      expect(html).toContain('<style>');
    });

    it('contains no external URLs (air-gap safe)', () => {
      const { scored, result } = runPipeline();
      const data = buildReportData(result, scored, 'Test Corp');
      const html = generateReport(data);

      // No http(s) URLs in the HTML (except potential data: URIs)
      const urls = html.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
      expect(urls).toHaveLength(0);
    });

    it('contains no JavaScript', () => {
      const { scored, result } = runPipeline();
      const data = buildReportData(result, scored, 'Test Corp');
      const html = generateReport(data);

      expect(html).not.toContain('<script');
      expect(html).not.toContain('javascript:');
    });

    it('contains organisation name in output', () => {
      const { scored, result } = runPipeline();
      const data = buildReportData(result, scored, 'Acme Mining Corp');
      const html = generateReport(data);

      expect(html).toContain('Acme Mining Corp');
    });

    it('contains print-friendly CSS', () => {
      const { scored, result } = runPipeline();
      const data = buildReportData(result, scored, 'Test Corp');
      const html = generateReport(data);

      expect(html).toContain('@media print');
    });

    it('contains severity badges', () => {
      const { scored, result } = runPipeline();
      const data = buildReportData(result, scored, 'Test Corp');
      const html = generateReport(data);

      // Should contain at least one severity badge
      expect(html).toContain('class="badge"');
    });

    it('contains cost breakdown bars', () => {
      const { scored, result } = runPipeline();
      const data = buildReportData(result, scored, 'Test Corp');
      const html = generateReport(data);

      expect(html).toContain('bar-fill');
      expect(html).toContain('bar-track');
    });

    it('contains five-year projection section', () => {
      const { scored, result } = runPipeline();
      const data = buildReportData(result, scored, 'Test Corp');
      const html = generateReport(data);

      expect(html).toContain('Five-Year Cost Projection');
      expect(html).toContain('Year 1');
      expect(html).toContain('Year 5');
    });

    it('contains engine version in footer', () => {
      const { scored, result } = runPipeline();
      const data = buildReportData(result, scored, 'Test Corp');
      const html = generateReport(data);

      expect(html).toContain('v4.0.0');
    });
  });
});
