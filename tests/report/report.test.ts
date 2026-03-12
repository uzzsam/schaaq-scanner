import { describe, it, expect } from 'vitest';
import { ALL_CHECKS } from '../../src/checks/index';
import { scoreFindings } from '../../src/scoring/severity-scorer';
import { mapToEngineInput } from '../../src/scoring/mapper';
import { calculateDALC } from '../../src/engine/index';
import { createMockSchema, createMockConfig } from '../../src/mock/schema-factory';
import {
  buildReportData,
  generateReport,
  buildExecutiveReportData,
  buildTechnicalAppendixData,
  generateExecutiveReport,
  generateTechnicalReport,
} from '../../src/report/generator';
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

      expect(data.costCategories).toHaveLength(6);
      const names = data.costCategories.map((c) => c.name);
      // Default display mode is 'executive', so labels are executive-mode names
      expect(names).toContain('Unplanned Rework');
      expect(names).toContain('Data Quality Issues');
      expect(names).toContain('Integration Failures');
      expect(names).toContain('Lost Productivity');
      expect(names).toContain('Compliance Risk');
      expect(names).toContain('AI Risk Costs');

      // Percentages should roughly sum to 100
      const totalPct = data.costCategories.reduce((s, c) => s + c.percentage, 0);
      expect(totalPct).toBeGreaterThan(95);
      expect(totalPct).toBeLessThanOrEqual(100.1);
    });

    it('includes 8 property scores with bar chart data', () => {
      const { scored, result } = runPipeline();
      const data = buildReportData(result, scored, 'Test Corp');

      expect(data.propertyScores).toHaveLength(8);
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
        expect(f.property).toBeLessThanOrEqual(8);
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

      // No http(s) URLs in the HTML (except XML namespace URIs and data: URIs)
      const urls = (html.match(/https?:\/\/[^\s"'<>]+/g) ?? [])
        .filter((u: string) => !u.startsWith('http://www.w3.org/'));
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

  // ===========================================================================
  // Executive Board Pack
  // ===========================================================================

  describe('buildExecutiveReportData', () => {
    it('produces topRisks (max 5, critical/major only)', () => {
      const { scored, result } = runPipeline();
      const data = buildExecutiveReportData(result, scored, 'Exec Corp');

      expect(data.reportMode).toBe('executive');
      expect(data.topRisks.length).toBeLessThanOrEqual(5);
      for (const r of data.topRisks) {
        expect(['critical', 'major']).toContain(r.severity);
      }
      // Should be sorted by rawScore desc
      for (let i = 1; i < data.topRisks.length; i++) {
        expect(data.topRisks[i - 1].rawScore).toBeGreaterThanOrEqual(data.topRisks[i].rawScore);
      }
    });

    it('includes remediationPriorities with ranks', () => {
      const { scored, result } = runPipeline();
      const data = buildExecutiveReportData(result, scored, 'Exec Corp');

      expect(data.remediationPriorities.length).toBeGreaterThan(0);
      expect(data.remediationPriorities.length).toBeLessThanOrEqual(10);
      for (let i = 0; i < data.remediationPriorities.length; i++) {
        expect(data.remediationPriorities[i].rank).toBe(i + 1);
      }
    });

    it('includes methodLimits array', () => {
      const { scored, result } = runPipeline();
      const data = buildExecutiveReportData(result, scored, 'Exec Corp');

      expect(data.methodLimits).toBeInstanceOf(Array);
      expect(data.methodLimits.length).toBeGreaterThan(0);
    });

    it('includes coverageSummary string', () => {
      const { scored, result } = runPipeline();
      const data = buildExecutiveReportData(result, scored, 'Exec Corp');

      expect(data.coverageSummary).toMatch(/\d+ checks across \d+ properties/);
    });

    it('includes DALC low/base/high range', () => {
      const { scored, result } = runPipeline();
      const data = buildExecutiveReportData(result, scored, 'Exec Corp');

      expect(data.dalcLowUsd).toBeGreaterThan(0);
      expect(data.dalcBaseUsd).toBeGreaterThan(0);
      expect(data.dalcHighUsd).toBeGreaterThanOrEqual(data.dalcBaseUsd);
    });
  });

  describe('generateExecutiveReport', () => {
    it('produces valid HTML with executive sections', () => {
      const { scored, result } = runPipeline();
      const data = buildExecutiveReportData(result, scored, 'Exec Corp');
      const html = generateExecutiveReport(data);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Exec Corp');
      expect(html).toContain('Executive Board Pack');
      expect(html).toContain('Top Business Risks');
      expect(html).toContain('Remediation Priorities');
      expect(html).toContain('Method Limits');
      expect(html).toContain('@media print');
    });

    it('contains no external URLs (air-gap safe)', () => {
      const { scored, result } = runPipeline();
      const data = buildExecutiveReportData(result, scored, 'Test Corp');
      const html = generateExecutiveReport(data);

      const urls = (html.match(/https?:\/\/[^\s"'<>]+/g) ?? [])
        .filter((u: string) => !u.startsWith('http://www.w3.org/'));
      expect(urls).toHaveLength(0);
    });

    it('contains no JavaScript', () => {
      const { scored, result } = runPipeline();
      const data = buildExecutiveReportData(result, scored, 'Test Corp');
      const html = generateExecutiveReport(data);

      expect(html).not.toContain('<script');
      expect(html).not.toContain('javascript:');
    });
  });

  // ===========================================================================
  // Technical Appendix
  // ===========================================================================

  describe('buildTechnicalAppendixData', () => {
    it('has findingsByProperty grouped correctly', () => {
      const { scored, result } = runPipeline();
      const data = buildTechnicalAppendixData(result, scored, 'Tech Corp');

      expect(data.reportMode).toBe('technical');
      expect(data.findingsByProperty.length).toBe(8);
      for (const group of data.findingsByProperty) {
        expect(group.propertyNumber).toBeGreaterThanOrEqual(1);
        expect(group.propertyNumber).toBeLessThanOrEqual(8);
        expect(group.propertyName).toBeTruthy();
        expect(group.propertyScore).toBeGreaterThanOrEqual(0);
        expect(group.maturityLabel).toBeTruthy();
        // All findings in group should belong to this property
        for (const f of group.findings) {
          expect(f.property).toBe(group.propertyNumber);
        }
      }
    });

    it('has dalcExplanation with spectralRadius etc.', () => {
      const { scored, result } = runPipeline();
      const data = buildTechnicalAppendixData(result, scored, 'Tech Corp');

      expect(data.dalcExplanation.spectralRadius).toBeGreaterThan(0);
      expect(data.dalcExplanation.amplificationRatio).toBeGreaterThan(0);
      expect(data.dalcExplanation.shannonEntropy).toBeGreaterThanOrEqual(0);
      expect(data.dalcExplanation.dalcLowUsd).toBeGreaterThan(0);
      expect(data.dalcExplanation.dalcBaseUsd).toBeGreaterThan(0);
      expect(data.dalcExplanation.dalcHighUsd).toBeGreaterThanOrEqual(data.dalcExplanation.dalcBaseUsd);
      expect(typeof data.dalcExplanation.sanityCapped).toBe('boolean');
    });

    it('has assessmentMetadata', () => {
      const { scored, result } = runPipeline();
      const data = buildTechnicalAppendixData(result, scored, 'Tech Corp');

      expect(data.assessmentMetadata.dalcVersion).toBeTruthy();
      expect(data.assessmentMetadata.totalChecksRun).toBeGreaterThan(0);
      expect(typeof data.assessmentMetadata.totalStrengths).toBe('number');
    });

    it('has coverageDetail', () => {
      const { scored, result } = runPipeline();
      const data = buildTechnicalAppendixData(result, scored, 'Tech Corp');

      expect(data.coverageDetail.tablesScanned).toBeGreaterThan(0);
      expect(data.coverageDetail.checksRun).toBeGreaterThan(0);
      expect(data.coverageDetail.propertiesCovered).toBeGreaterThan(0);
    });
  });

  describe('generateTechnicalReport', () => {
    it('produces valid HTML with technical sections', () => {
      const { scored, result } = runPipeline();
      const data = buildTechnicalAppendixData(result, scored, 'Tech Corp');
      const html = generateTechnicalReport(data);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Tech Corp');
      expect(html).toContain('Technical Appendix');
      expect(html).toContain('Assessment Metadata');
      expect(html).toContain('Findings Catalogue');
      expect(html).toContain('DALC Cost Model');
      expect(html).toContain('@media print');
    });

    it('contains no external URLs (air-gap safe)', () => {
      const { scored, result } = runPipeline();
      const data = buildTechnicalAppendixData(result, scored, 'Test Corp');
      const html = generateTechnicalReport(data);

      const urls = (html.match(/https?:\/\/[^\s"'<>]+/g) ?? [])
        .filter((u: string) => !u.startsWith('http://www.w3.org/'));
      expect(urls).toHaveLength(0);
    });

    it('contains no JavaScript', () => {
      const { scored, result } = runPipeline();
      const data = buildTechnicalAppendixData(result, scored, 'Test Corp');
      const html = generateTechnicalReport(data);

      expect(html).not.toContain('<script');
      expect(html).not.toContain('javascript:');
    });
  });
});
