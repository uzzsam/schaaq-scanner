/**
 * HTML Report Generator
 *
 * Produces a self-contained, McKinsey-quality HTML report from DALC engine results.
 * - Pure CSS bar charts (no JavaScript, no chart libraries)
 * - SVG radar chart for property maturity (no JavaScript, no external libraries)
 * - No external URLs (air-gap safe)
 * - Print-friendly with @media print rules
 * - Professional C-suite presentable design
 * - Handlebars templating
 * - White-label support for consultant branding
 */

import Handlebars from 'handlebars';
import type { DALCResult, CostVector, PropertyScore, YearProjection, FindingCostResult } from '../engine/types';
import type { Finding, Strength } from '../checks/types';
import type { ScoredFindings } from '../scoring/severity-scorer';
import type { CriticalityTier } from '../criticality/types';
import { CRITICALITY_TIER_COLORS, CRITICALITY_TIER_LABELS } from '../criticality/types';
import type { BenchmarkPosition } from '../benchmark/types';
import { BENCHMARK_POSITION_COLORS, BENCHMARK_POSITION_LABELS } from '../benchmark/types';
import type { MethodologySummary } from '../methodology/types';
import type { HistoricalComparisonWindow } from '../trend/types';
import type { ReportTrendSummary, ReportRegressionDetail } from './types';
import {
  buildBlastRadiusGraph,
  buildBlastRadiusSummary,
  buildBlastRadiusDetail,
} from '../blast-radius';
import type { BlastRadiusFindingInput } from '../blast-radius';

// =============================================================================
// Display Mode — labels for technical vs executive audiences
// =============================================================================

export type ReportDisplayMode = 'technical' | 'executive';

const REPORT_LABELS = {
  annualDisorderCost:   { technical: 'Annual Data Disorder Cost',       executive: 'Annual Data Cost Impact' },
  baseCost:             { technical: 'Base Cost (Pre-Amplification)',    executive: 'Direct Costs Only' },
  amplifiedUnit:        { technical: 'per year (amplified)',             executive: 'per year (total estimated)' },
  overallMaturity:      { technical: 'Overall Maturity',                executive: 'Overall Maturity' },
  canonicalInvestment:  { technical: 'Canonical Investment',            executive: 'Recommended Investment' },
  potentialSaving:      { technical: 'Potential Annual Saving',         executive: 'Potential Annual Saving' },
  withCanonical:        { technical: 'with canonical architecture',     executive: 'with recommended architecture' },
  fiveYearSaving:       { technical: '5-Year Cumulative Saving',        executive: '5-Year Cumulative Saving' },
  propertyMaturity:     { technical: 'Property Maturity Assessment',    executive: 'Architecture Health Assessment' },
  doNothing:            { technical: 'Do Nothing',                      executive: 'Current Trajectory' },
  withCanonicalArch:    { technical: 'With Canonical Architecture',     executive: 'With Recommended Architecture' },
  firefighting:         { technical: 'Firefighting',                    executive: 'Unplanned Rework' },
  dataQuality:          { technical: 'Data Quality',                    executive: 'Data Quality Issues' },
  integration:          { technical: 'Integration',                     executive: 'Integration Failures' },
  productivity:         { technical: 'Productivity',                    executive: 'Lost Productivity' },
  regulatory:           { technical: 'Regulatory',                      executive: 'Compliance Risk' },
  aiMlRiskExposure:     { technical: 'AI/ML Risk Exposure',             executive: 'AI Risk Costs' },
} as const;

function resolveReportLabels(mode: ReportDisplayMode): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const [key, pair] of Object.entries(REPORT_LABELS)) {
    labels[key] = pair[mode];
  }
  return labels;
}

function resolveCategoryLabel(key: string, mode: ReportDisplayMode): string {
  const entry = REPORT_LABELS[key as keyof typeof REPORT_LABELS];
  return entry ? entry[mode] : key;
}

// =============================================================================
// Report Data — the shape passed to the Handlebars template
// =============================================================================

export interface ReportData {
  organisationName: string;
  sector: string;
  generatedAt: string;
  engineVersion: string;
  source?: string; // 'database' | 'csv'

  // Headline numbers
  finalTotal: number;
  baseTotal: number;
  amplifiedTotal: number;
  dalcLowUsd: number;
  dalcBaseUsd: number;
  dalcHighUsd: number;
  annualSaving: number;
  paybackMonths: number;
  overallMaturity: number;
  canonicalInvestment: number;
  fiveYearCumulativeSaving: number;

  // Cost breakdown
  finalCosts: CostVector;
  costCategories: Array<{ name: string; value: number; percentage: number; color: string }>;

  // Property scores
  propertyScores: Array<{
    propertyId: string;
    name: string;
    score: number;
    maturityLabel: string;
    totalCost: number;
    barWidth: number;
    barColor: string;
  }>;

  // Five-year projection
  fiveYearProjection: Array<{
    year: number;
    doNothingCost: number;
    withCanonicalCost: number;
    cumulativeSaving: number;
    doNothingBarWidth: number;
    withCanonicalBarWidth: number;
  }>;

  // Findings detail
  findings: Array<{
    checkId: string;
    property: number;
    severity: string;
    severityColor: string;
    title: string;
    description: string;
    ratio: number;
    ratioPercent: string;
    affectedObjects: number;
    totalObjects: number;
    remediation: string;
    rawScore: number;
    costCategories: string[];
    // Evidence fields (optional — available when evidenceInput populated)
    assetName: string | null;
    observedValue: number | null;
    thresholdValue: number | null;
    metricUnit: string | null;
    whatWasFound: string | null;
    whyItMatters: string | null;
    confidenceLevel: string | null;
    confidenceScore: number | null;
    criticalityTier: CriticalityTier | null;
  }>;

  // Asset criticality assessment (optional — available when criticality engine ran)
  criticalityAssessment?: {
    totalAssetsAssessed: number;
    totalCdeCandidates: number;
    averageCriticalityScore: number;
    tierDistribution: Record<CriticalityTier, number>;
    topCriticalAssets: Array<{
      assetName: string;
      assetType: string;
      criticalityScore: number;
      criticalityTier: CriticalityTier;
      cdeCandidate: boolean;
      tierColor: string;
      tierLabel: string;
    }>;
  };

  // Strengths (What's Working Well)
  strengths: Array<{
    property: number;
    title: string;
    description: string;
    detail: string;
    metric?: string;
  }>;

  // White-label / branding
  consultantName?: string;
  consultantTagline?: string;
  clientName?: string;
  clientLogoBase64?: string;
  consultantLogoBase64?: string;
  reportTitle?: string;
  reportSubtitle?: string;

  // Database context
  databaseLabel?: string;

  // Scanner stats
  isCsvSource: boolean;
  sourceLabel: string;
  totalTables: number;
  totalRowCount: number;
  totalFindings: number;
  criticalCount: number;
  majorCount: number;
  minorCount: number;
  infoCount: number;

  // Display mode labels (resolved for current mode)
  l: Record<string, string>;
}

// =============================================================================
// Cost category metadata
// =============================================================================

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  firefighting: { label: 'Firefighting', color: '#E74C3C' },
  dataQuality: { label: 'Data Quality', color: '#F39C12' },
  integration: { label: 'Integration', color: '#3498DB' },
  productivity: { label: 'Productivity', color: '#9B59B6' },
  regulatory: { label: 'Regulatory', color: '#1ABC9C' },
  aiMlRiskExposure: { label: 'AI/ML Risk Exposure', color: '#8E44AD' },
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#E74C3C',
  major: '#F39C12',
  minor: '#3498DB',
  info: '#95A5A6',
};

const MATURITY_COLORS = ['#E74C3C', '#F39C12', '#F1C40F', '#2ECC71', '#27AE60'];

// =============================================================================
// Build ReportData from engine output + scanner findings
// =============================================================================

export function buildReportData(
  result: DALCResult,
  scored: ScoredFindings,
  organisationName: string,
  source?: string,
  options?: {
    strengths?: Strength[];
    consultantName?: string;
    consultantTagline?: string;
    clientName?: string;
    clientLogoBase64?: string;
    consultantLogoBase64?: string;
    reportTitle?: string;
    reportSubtitle?: string;
    databaseLabel?: string;
    displayMode?: ReportDisplayMode;
    criticalityAssessment?: import('../criticality/types').CriticalityAssessmentSummary;
    methodologySummary?: MethodologySummary;
  },
): ReportData {
  const displayMode = options?.displayMode ?? 'executive';
  const l = resolveReportLabels(displayMode);
  const costTotal = sumCostVector(result.finalCosts);

  // Cost categories breakdown
  const costCategories = Object.entries(CATEGORY_META).map(([key, meta]) => {
    const value = result.finalCosts[key as keyof CostVector];
    return {
      name: resolveCategoryLabel(key, displayMode),
      value,
      percentage: costTotal > 0 ? (value / costTotal) * 100 : 0,
      color: meta.color,
    };
  });

  // Property scores with bar chart data
  const maxPropertyCost = Math.max(...result.propertyScores.map((p) => p.totalCost), 1);
  const propertyScores = result.propertyScores.map((p) => ({
    propertyId: p.propertyId,
    name: p.name,
    score: p.score,
    maturityLabel: p.maturityLabel,
    totalCost: p.totalCost,
    barWidth: Math.min(100, (p.totalCost / maxPropertyCost) * 100),
    barColor: MATURITY_COLORS[Math.min(4, Math.round(p.score))],
  }));

  // Five-year projection with bar chart data
  const maxYearCost = Math.max(...result.fiveYearProjection.map((y) => y.doNothingCost), 1);
  const fiveYearProjection = result.fiveYearProjection.map((y) => ({
    year: y.year,
    doNothingCost: y.doNothingCost,
    withCanonicalCost: y.withCanonicalCost,
    cumulativeSaving: y.cumulativeSaving,
    doNothingBarWidth: Math.min(100, (y.doNothingCost / maxYearCost) * 100),
    withCanonicalBarWidth: Math.min(100, (y.withCanonicalCost / maxYearCost) * 100),
  }));

  // Scanner findings detail
  const findings = scored.findings.map((f) => {
    const ei = f.evidenceInput;
    return {
      checkId: f.checkId,
      property: f.property,
      severity: f.severity,
      severityColor: SEVERITY_COLORS[f.severity] ?? '#95A5A6',
      title: f.title,
      description: f.description,
      ratio: f.ratio,
      ratioPercent: (f.ratio * 100).toFixed(1),
      affectedObjects: f.affectedObjects,
      totalObjects: f.totalObjects,
      remediation: f.remediation,
      rawScore: Math.round(f.rawScore * 100) / 100,
      costCategories: f.costCategories,
      // Evidence fields — extracted from evidenceInput when available
      assetName: ei?.asset?.name ?? null,
      observedValue: ei?.metric?.observed ?? null,
      thresholdValue: ei?.threshold?.value ?? null,
      metricUnit: ei?.metric?.unit ?? null,
      whatWasFound: ei?.explanation?.whatWasFound ?? null,
      whyItMatters: ei?.explanation?.whyItMatters ?? null,
      confidenceLevel: ei?.confidence?.level ?? null,
      confidenceScore: ei?.confidence?.score ?? null,
      criticalityTier: lookupCriticalityTier(ei?.asset?.key, options?.criticalityAssessment),
    };
  });

  // Severity counts
  const criticalCount = scored.findings.filter((f) => f.severity === 'critical').length;
  const majorCount = scored.findings.filter((f) => f.severity === 'major').length;
  const minorCount = scored.findings.filter((f) => f.severity === 'minor').length;
  const infoCount = scored.findings.filter((f) => f.severity === 'info').length;

  // Map strengths
  const strengths = (options?.strengths ?? []).map((s) => ({
    property: s.property,
    title: s.title,
    description: s.description,
    detail: s.detail,
    metric: s.metric,
  }));

  return {
    organisationName,
    sector: result.input.sector,
    generatedAt: new Date().toISOString(),
    engineVersion: result.engineVersion,

    finalTotal: result.finalTotal,
    baseTotal: result.baseTotal,
    amplifiedTotal: result.amplifiedTotal,
    dalcLowUsd: result.adjustedTotal,
    dalcBaseUsd: result.finalTotal,
    dalcHighUsd: result.amplifiedTotal,
    annualSaving: result.annualSaving,
    paybackMonths: result.paybackMonths,
    overallMaturity: result.overallMaturity,
    canonicalInvestment: result.canonicalInvestment,
    fiveYearCumulativeSaving: result.fiveYearCumulativeSaving,

    finalCosts: result.finalCosts,
    costCategories,

    propertyScores,
    fiveYearProjection,
    findings,
    strengths,

    // White-label / branding
    consultantName: options?.consultantName,
    consultantTagline: options?.consultantTagline,
    clientName: options?.clientName,
    clientLogoBase64: options?.clientLogoBase64,
    consultantLogoBase64: options?.consultantLogoBase64,
    reportTitle: options?.reportTitle,
    reportSubtitle: options?.reportSubtitle,

    // Database context
    databaseLabel: options?.databaseLabel,

    isCsvSource: source === 'csv' || source === 'powerbi' || source === 'tableau' || source === 'pipeline',
    source: source ?? 'database',
    sourceLabel: source === 'powerbi' ? 'Power BI Template' : source === 'tableau' ? 'Tableau Workbook' : source === 'pipeline' ? 'Pipeline Analysis' : 'CSV/Excel Upload',
    totalTables: scored.totalTables,
    totalRowCount: scored.totalRowCount,
    totalFindings: scored.findings.length,
    criticalCount,
    majorCount,
    minorCount,
    infoCount,

    criticalityAssessment: buildCriticalitySummaryForReport(options?.criticalityAssessment),

    l,
  };
}

// =============================================================================
// Criticality helpers
// =============================================================================

function lookupCriticalityTier(
  assetKey: string | undefined,
  assessment: import('../criticality/types').CriticalityAssessmentSummary | undefined,
): CriticalityTier | null {
  if (!assetKey || !assessment) return null;
  const asset = assessment.allAssets?.find(a => a.assetKey === assetKey);
  return asset?.criticalityTier ?? null;
}

function buildCriticalitySummaryForReport(
  assessment: import('../criticality/types').CriticalityAssessmentSummary | undefined,
): ReportData['criticalityAssessment'] | undefined {
  if (!assessment) return undefined;
  return {
    totalAssetsAssessed: assessment.totalAssetsAssessed,
    totalCdeCandidates: assessment.totalCdeCandidates,
    averageCriticalityScore: assessment.averageCriticalityScore,
    tierDistribution: assessment.tierDistribution,
    topCriticalAssets: (assessment.topCriticalAssets ?? []).slice(0, 10).map(a => ({
      assetName: a.assetName,
      assetType: a.assetType,
      criticalityScore: a.criticalityScore,
      criticalityTier: a.criticalityTier,
      cdeCandidate: a.cdeCandidate,
      tierColor: CRITICALITY_TIER_COLORS[a.criticalityTier],
      tierLabel: CRITICALITY_TIER_LABELS[a.criticalityTier],
    })),
  };
}

// =============================================================================
// Handlebars Helpers
// =============================================================================

function registerHelpers(): void {
  Handlebars.registerHelper('currency', (value: number) => {
    if (value === undefined || value === null) return '$0';
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  });

  Handlebars.registerHelper('currencyFull', (value: number) => {
    if (value === undefined || value === null) return '$0';
    return '$' + value.toLocaleString('en-AU', { maximumFractionDigits: 0 });
  });

  Handlebars.registerHelper('pct', (value: number) => {
    if (value === undefined || value === null) return '0%';
    return value.toFixed(1) + '%';
  });

  Handlebars.registerHelper('inc', (value: number) => {
    return (value ?? 0) + 1;
  });

  Handlebars.registerHelper('pctRatio', (value: number) => {
    if (value === undefined || value === null) return '0%';
    return Math.round(value * 100) + '%';
  });

  Handlebars.registerHelper('fixed1', (value: number) => {
    if (value === undefined || value === null) return '0.0';
    return value.toFixed(1);
  });

  Handlebars.registerHelper('fixed2', (value: number) => {
    if (value === undefined || value === null) return '0.00';
    return value.toFixed(2);
  });

  // DALC range helper: renders "low – high" or empty if degenerate
  Handlebars.registerHelper('dalcRange', function (this: any) {
    const low = this.dalcLowUsd;
    const high = this.dalcHighUsd;
    if (low == null || high == null || low === high) return '';
    const fmt = (v: number) => {
      if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
      if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
      return `$${v.toFixed(0)}`;
    };
    return new Handlebars.SafeString(
      `<div class="unit" style="margin-top:2px;font-size:11px;color:#888;">Range: ${Handlebars.Utils.escapeExpression(fmt(low))} – ${Handlebars.Utils.escapeExpression(fmt(high))}</div>`
    );
  });

  Handlebars.registerHelper('uppercase', (value: string) => {
    return value ? value.toUpperCase() : '';
  });

  Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b);

  Handlebars.registerHelper('ifEq', function (this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
    return a === b ? options.fn(this) : options.inverse(this);
  });

  Handlebars.registerHelper('ownerLabel', (ownerType: string) => {
    const labels: Record<string, string> = {
      'data-engineer': 'Data Engineer',
      'data-architect': 'Data Architect',
      'data-steward': 'Data Steward',
      'dba': 'DBA',
      'analytics-engineer': 'Analytics Engineer',
      'compliance-officer': 'Compliance Officer',
    };
    return labels[ownerType] ?? ownerType;
  });

  Handlebars.registerHelper('severityBadge', (severity: string) => {
    const escapedSeverity = Handlebars.Utils.escapeExpression(severity);
    const color = SEVERITY_COLORS[severity] ?? '#95A5A6';
    const escapedColor = Handlebars.Utils.escapeExpression(color);
    return new Handlebars.SafeString(
      `<span class="badge" style="background:${escapedColor}">${escapedSeverity.toUpperCase()}</span>`
    );
  });

  Handlebars.registerHelper('criticalityBadge', (tier: string | null | undefined) => {
    if (!tier) return '';
    const escapedTier = Handlebars.Utils.escapeExpression(tier);
    const color = CRITICALITY_TIER_COLORS[tier as CriticalityTier] ?? '#6b7280';
    const escapedColor = Handlebars.Utils.escapeExpression(color);
    const label = CRITICALITY_TIER_LABELS[tier as CriticalityTier] ?? tier;
    const escapedLabel = Handlebars.Utils.escapeExpression(label);
    return new Handlebars.SafeString(
      `<span class="badge" style="background:${escapedColor};font-size:9px;padding:2px 6px">${escapedLabel.toUpperCase()}</span>`
    );
  });

  Handlebars.registerHelper('benchmarkPositionColor', (position: BenchmarkPosition) => {
    return BENCHMARK_POSITION_COLORS[position] ?? '#6B7280';
  });

  Handlebars.registerHelper('benchmarkPositionLabel', (position: BenchmarkPosition) => {
    return BENCHMARK_POSITION_LABELS[position] ?? 'Unknown';
  });

  // Radar chart SVG helper
  Handlebars.registerHelper('radarChart', (propertyScores: ReportData['propertyScores']) => {
    if (!propertyScores || propertyScores.length === 0) return '';

    const cx = 200, cy = 200, maxR = 150;
    const n = propertyScores.length;
    const viewBox = '0 0 460 430';

    // Helper to get point at angle and radius
    const point = (i: number, r: number) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    };

    // Points to polygon string
    const polyPoints = (pts: { x: number; y: number }[]) =>
      pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

    // Grid rings (levels 1-4)
    const gridRings = [1, 2, 3, 4].map((level) => {
      const r = (level / 4) * maxR;
      const pts = Array.from({ length: n }, (_, i) => point(i, r));
      return `<polygon points="${polyPoints(pts)}" fill="none" stroke="#E5E7EB" stroke-width="${level === 4 ? 1.5 : 0.75}" />`;
    });

    // Axis lines from center to each vertex
    const axisLines = Array.from({ length: n }, (_, i) => {
      const p = point(i, maxR);
      return `<line x1="${cx}" y1="${cy}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" stroke="#F3F4F6" stroke-width="0.75" />`;
    });

    // Data polygon
    const dataPoints = propertyScores.map((p, i) => point(i, (p.score / 4) * maxR));
    const dataPolygon = `<polygon points="${polyPoints(dataPoints)}" fill="rgba(59,130,246,0.15)" stroke="#3B82F6" stroke-width="2" />`;

    // Data point circles
    const dataCircles = dataPoints.map(
      (p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#3B82F6" />`
    );

    // Labels at each axis tip
    const labels = propertyScores.map((p, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const labelR = maxR + 28;
      const lx = cx + labelR * Math.cos(angle);
      const ly = cy + labelR * Math.sin(angle);

      // Determine text-anchor based on position
      let anchor = 'middle';
      if (Math.cos(angle) > 0.15) anchor = 'start';
      else if (Math.cos(angle) < -0.15) anchor = 'end';

      // Truncate long names
      const words = p.name.split(' ');
      const shortName = words.length > 2 ? words.slice(0, 2).join(' ') : p.name;

      return `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="central" font-size="11" fill="#4B5563" font-family="-apple-system,BlinkMacSystemFont,sans-serif">${Handlebars.Utils.escapeExpression(shortName)}</text>`;
    });

    // Score labels near each data point
    const scoreLabels = propertyScores.map((p, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const r = (p.score / 4) * maxR;
      const offset = 14;
      const sx = cx + (r + offset) * Math.cos(angle);
      const sy = cy + (r + offset) * Math.sin(angle);

      let anchor = 'middle';
      if (Math.cos(angle) > 0.15) anchor = 'start';
      else if (Math.cos(angle) < -0.15) anchor = 'end';

      return `<text x="${sx.toFixed(1)}" y="${sy.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="central" font-size="9" fill="#6B7280" font-weight="600" font-family="-apple-system,BlinkMacSystemFont,sans-serif">${p.score.toFixed(1)}/4</text>`;
    });

    const svg = `<svg viewBox="${viewBox}" width="340" height="320" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">
  <g transform="translate(30,15)">
    ${gridRings.join('\n    ')}
    ${axisLines.join('\n    ')}
    ${dataPolygon}
    ${dataCircles.join('\n    ')}
    ${labels.join('\n    ')}
    ${scoreLabels.join('\n    ')}
  </g>
</svg>`;

    return new Handlebars.SafeString(svg);
  });
}

// =============================================================================
// Utility
// =============================================================================

function sumCostVector(cv: CostVector): number {
  return cv.firefighting + cv.dataQuality + cv.integration + cv.productivity + cv.regulatory + cv.aiMlRiskExposure;
}

// =============================================================================
// HTML Template
// =============================================================================

const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DALC Report — {{organisationName}}</title>
<style>
/* =====================================================================
   DALC Report — Self-contained CSS (no external dependencies)
   ===================================================================== */
:root {
  --c-primary: #1a1a2e;
  --c-accent: #e94560;
  --c-accent2: #0f3460;
  --c-bg: #ffffff;
  --c-bg-alt: #f8f9fa;
  --c-border: #dee2e6;
  --c-text: #212529;
  --c-text-muted: #6c757d;
  --c-critical: #E74C3C;
  --c-major: #F39C12;
  --c-minor: #3498DB;
  --c-info: #95A5A6;
  --c-success: #27AE60;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  color: var(--c-text);
  background: var(--c-bg);
  line-height: 1.6;
  font-size: 14px;
}

.container { max-width: 1100px; margin: 0 auto; padding: 0 24px; }

/* Header */
.header {
  background: linear-gradient(135deg, var(--c-primary) 0%, var(--c-accent2) 100%);
  color: #fff;
  padding: 40px 0 32px;
}
.header h1 { font-size: 28px; font-weight: 700; margin-bottom: 4px; }
.header .subtitle { font-size: 15px; opacity: 0.85; }
.header .meta { margin-top: 12px; font-size: 12px; opacity: 0.7; }
.report-logos {
  display: flex;
  gap: 24px;
  justify-content: center;
  margin-bottom: 20px;
}
.header-logo {
  max-height: 48px;
  max-width: 180px;
  object-fit: contain;
}

/* Sections */
section { padding: 32px 0; border-bottom: 1px solid var(--c-border); }
section:last-child { border-bottom: none; }
h2 { font-size: 20px; font-weight: 700; color: var(--c-primary); margin-bottom: 16px; }
h3 { font-size: 16px; font-weight: 600; color: var(--c-primary); margin-bottom: 12px; }

/* Metric Cards */
.metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
.metric-card {
  background: var(--c-bg-alt);
  border: 1px solid var(--c-border);
  border-radius: 8px;
  padding: 20px;
  text-align: center;
}
.metric-card .label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--c-text-muted); margin-bottom: 4px; }
.metric-card .value { font-size: 28px; font-weight: 700; color: var(--c-primary); }
.metric-card .unit { font-size: 12px; color: var(--c-text-muted); }
.metric-card.highlight { border-left: 4px solid var(--c-accent); }
.metric-card.success { border-left: 4px solid var(--c-success); }

/* Bar Charts */
.bar-chart { margin: 12px 0; }
.bar-row { display: flex; align-items: center; margin-bottom: 8px; }
.bar-label { width: 180px; font-size: 13px; flex-shrink: 0; }
.bar-track { flex: 1; height: 24px; background: var(--c-bg-alt); border-radius: 4px; overflow: hidden; position: relative; }
.bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s; display: flex; align-items: center; padding-left: 8px; }
.bar-fill span { font-size: 11px; color: #fff; font-weight: 600; white-space: nowrap; }
.bar-value { width: 100px; text-align: right; font-size: 13px; font-weight: 600; padding-left: 8px; }

/* Dual Bars (projection) */
.dual-bar-row { margin-bottom: 12px; }
.dual-bar-row .year-label { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
.dual-bar-pair { display: flex; flex-direction: column; gap: 2px; }
.dual-bar-pair .bar-track { height: 18px; }

/* Legend */
.legend { display: flex; gap: 16px; margin-bottom: 12px; flex-wrap: wrap; }
.legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.legend-dot { width: 12px; height: 12px; border-radius: 2px; }

/* Badge */
.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 3px;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Strengths */
.strengths-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}
.strength-card {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  background: rgba(16, 185, 129, 0.06);
  border: 1px solid rgba(16, 185, 129, 0.15);
  border-radius: 8px;
}
.strength-icon {
  flex: 0 0 28px;
  height: 28px;
  border-radius: 50%;
  background: rgba(16, 185, 129, 0.15);
  color: #10B981;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
}
.strength-title {
  font-weight: 600;
  color: var(--c-text);
  font-size: 13px;
}
.strength-detail {
  color: var(--c-text-muted);
  font-size: 12px;
  margin-top: 2px;
}
.strength-metric {
  display: inline-block;
  margin-top: 6px;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(16, 185, 129, 0.1);
  color: #10B981;
  font-size: 11px;
  font-weight: 600;
}

/* Radar chart layout */
.radar-layout {
  display: flex;
  gap: 40px;
  align-items: flex-start;
}
.radar-chart-wrap {
  flex: 0 0 auto;
}
.radar-scores-wrap {
  flex: 1;
}

/* Findings Table */
.findings-table { width: 100%; border-collapse: collapse; margin-top: 12px; }
.findings-table th {
  background: var(--c-primary);
  color: #fff;
  padding: 10px 12px;
  text-align: left;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.findings-table td { padding: 10px 12px; border-bottom: 1px solid var(--c-border); font-size: 13px; vertical-align: top; }
.findings-table tr:nth-child(even) { background: var(--c-bg-alt); }
.findings-table .remediation { font-size: 12px; color: var(--c-text-muted); margin-top: 4px; font-style: italic; }

/* Score indicator */
.score-indicator {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  font-weight: 700;
  font-size: 14px;
  color: #fff;
}

/* Summary badges */
.severity-summary { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.severity-summary .count-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  background: var(--c-bg-alt);
  border: 1px solid var(--c-border);
}
.severity-summary .count-badge .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

/* Footer */
.footer {
  padding: 24px 0;
  text-align: center;
  font-size: 12px;
  color: var(--c-text-muted);
  border-top: 1px solid var(--c-border);
}

/* =====================================================================
   Print styles
   ===================================================================== */
@media print {
  /* Page setup */
  @page { size: A4; margin: 15mm; }

  body { font-size: 11px; color: #1F2937; background: white; }
  .container { max-width: 100%; padding: 0; }

  /* Each major section avoids mid-section breaks */
  section { padding: 16px 0; break-inside: avoid; page-break-inside: avoid; }

  /* Force page break before key sections */
  .section-page-break { break-before: page; page-break-before: always; }

  /* Ensure backgrounds print */
  * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }

  /* Header compact for print */
  .header { padding: 20px 0 16px; }
  .header-logo { max-height: 36px; }

  /* Metrics grid */
  .metrics { grid-template-columns: repeat(4, 1fr); }
  .metric-card { padding: 10px; }
  .metric-card .value { font-size: 18px; }

  /* Strengths grid: force 2 columns */
  .strengths-grid { grid-template-columns: repeat(2, 1fr); }
  .strength-card { padding: 10px 12px; }

  /* Radar chart */
  .radar-layout { gap: 20px; }
  .radar-chart-wrap svg { max-width: 280px; }

  /* Findings table */
  .findings-table { font-size: 10px; }
  .findings-table th, .findings-table td { padding: 5px 6px; }
  .remediation { font-size: 9px; }

  /* Bar chart */
  .bar-track { height: 20px; }
}
</style>
</head>
<body>

<!-- Header -->
<div class="header">
  <div class="container">
    {{#if consultantLogoBase64}}
    <div class="report-logos">
      <img src="data:image/png;base64,{{consultantLogoBase64}}" alt="{{consultantName}}" class="header-logo" />
      {{#if clientLogoBase64}}
      <img src="data:image/png;base64,{{clientLogoBase64}}" alt="{{clientName}}" class="header-logo" />
      {{/if}}
    </div>
    {{/if}}
    <h1>{{#if reportTitle}}{{reportTitle}}{{else}}Data Architecture Loss Calculator{{/if}}</h1>
    <div class="subtitle">
      {{#if reportSubtitle}}{{reportSubtitle}}{{else}}{{organisationName}} — {{uppercase sector}} Sector Assessment{{/if}}
    </div>
    <div class="meta">
      Engine {{engineVersion}} &middot; Generated {{generatedAt}} &middot; {{totalTables}} tables analysed{{#if databaseLabel}} &middot; {{databaseLabel}}{{/if}}{{#if isCsvSource}} &middot; Source: {{sourceLabel}}{{/if}}
    </div>
  </div>
</div>

<div class="container">

<!-- Executive Summary -->
<section>
  <h2>Executive Summary</h2>
  <div class="metrics">
    <div class="metric-card highlight">
      <div class="label">{{l.annualDisorderCost}}</div>
      <div class="value">{{currency finalTotal}}</div>
      <div class="unit">{{l.amplifiedUnit}}</div>
      {{dalcRange}}
    </div>
    <div class="metric-card">
      <div class="label">{{l.baseCost}}</div>
      <div class="value">{{currency baseTotal}}</div>
      <div class="unit">direct costs only</div>
    </div>
    <div class="metric-card success">
      <div class="label">{{l.potentialSaving}}</div>
      <div class="value">{{currency annualSaving}}</div>
      <div class="unit">{{l.withCanonical}}</div>
    </div>
    <div class="metric-card">
      <div class="label">Payback Period</div>
      <div class="value">{{fixed1 paybackMonths}}</div>
      <div class="unit">months</div>
    </div>
  </div>
  <div class="metrics">
    <div class="metric-card">
      <div class="label">{{l.overallMaturity}}</div>
      <div class="value">{{fixed1 overallMaturity}}<span style="font-size:14px">/4</span></div>
    </div>
    <div class="metric-card">
      <div class="label">{{l.canonicalInvestment}}</div>
      <div class="value">{{currency canonicalInvestment}}</div>
    </div>
    <div class="metric-card">
      <div class="label">{{l.fiveYearSaving}}</div>
      <div class="value">{{currency fiveYearCumulativeSaving}}</div>
    </div>
    <div class="metric-card">
      <div class="label">Total Findings</div>
      <div class="value">{{totalFindings}}</div>
    </div>
  </div>

  <div class="severity-summary">
    <div class="count-badge"><div class="dot" style="background:var(--c-critical)"></div>{{criticalCount}} Critical</div>
    <div class="count-badge"><div class="dot" style="background:var(--c-major)"></div>{{majorCount}} Major</div>
    <div class="count-badge"><div class="dot" style="background:var(--c-minor)"></div>{{minorCount}} Minor</div>
    <div class="count-badge"><div class="dot" style="background:var(--c-info)"></div>{{infoCount}} Info</div>
  </div>
  <p style="font-size:13px;color:var(--c-text-muted);margin-top:12px;line-height:1.6">
    Assessment covers 8 data architecture properties including AI Readiness (P8).
    Regulatory context includes EU AI Act, Australia Privacy Act 1988, NIST AI RMF, and ISO 5259.
  </p>
</section>

<!-- What's Working Well -->
{{#if strengths.length}}
<section class="strengths-section">
  <h2>What's Working Well</h2>
  <div class="strengths-grid">
    {{#each strengths}}
    <div class="strength-card">
      <div class="strength-icon">&#10003;</div>
      <div class="strength-content">
        <div class="strength-title">{{title}}</div>
        <div class="strength-detail">{{detail}}</div>
        {{#if metric}}
        <div class="strength-metric">{{metric}}</div>
        {{/if}}
      </div>
    </div>
    {{/each}}
  </div>
</section>
{{/if}}

<!-- Cost Breakdown -->
<section class="section-page-break">
  <h2>Cost Breakdown by Category</h2>
  <div class="bar-chart">
    {{#each costCategories}}
    <div class="bar-row">
      <div class="bar-label">{{name}}</div>
      <div class="bar-track">
        <div class="bar-fill" style="width:{{percentage}}%;background:{{color}}">
          <span>{{pct percentage}}</span>
        </div>
      </div>
      <div class="bar-value">{{currency value}}</div>
    </div>
    {{/each}}
  </div>
</section>

<!-- Property Maturity Assessment -->
<section class="section-page-break">
  <h2>{{l.propertyMaturity}}</h2>
  <div class="radar-layout">
    <div class="radar-chart-wrap">
      {{{radarChart propertyScores}}}
    </div>
    <div class="radar-scores-wrap">
      <div class="bar-chart">
        {{#each propertyScores}}
        <div class="bar-row">
          <div class="bar-label" title="{{propertyId}}">{{name}}</div>
          <div class="bar-track">
            <div class="bar-fill" style="width:{{barWidth}}%;background:{{barColor}}">
              <span>{{fixed1 score}}/4 — {{maturityLabel}}</span>
            </div>
          </div>
          <div class="bar-value">{{currency totalCost}}</div>
        </div>
        {{/each}}
      </div>
    </div>
  </div>
</section>

<!-- Five-Year Projection -->
<section class="section-page-break">
  <h2>Five-Year Cost Projection</h2>
  <div class="legend">
    <div class="legend-item"><div class="legend-dot" style="background:var(--c-accent)"></div>{{l.doNothing}}</div>
    <div class="legend-item"><div class="legend-dot" style="background:var(--c-success)"></div>{{l.withCanonicalArch}}</div>
  </div>
  {{#each fiveYearProjection}}
  <div class="dual-bar-row">
    <div class="year-label">Year {{year}}</div>
    <div class="dual-bar-pair">
      <div class="bar-row" style="margin-bottom:2px">
        <div class="bar-track">
          <div class="bar-fill" style="width:{{doNothingBarWidth}}%;background:var(--c-accent)">
            <span>{{currency doNothingCost}}</span>
          </div>
        </div>
      </div>
      <div class="bar-row">
        <div class="bar-track">
          <div class="bar-fill" style="width:{{withCanonicalBarWidth}}%;background:var(--c-success)">
            <span>{{currency withCanonicalCost}}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
  {{/each}}
</section>

<!-- Scanner Findings Detail -->
<section class="section-page-break">
  <h2>Scanner Findings Detail</h2>
  <table class="findings-table">
    <thead>
      <tr>
        <th style="width:40px">P</th>
        <th style="width:80px">Severity</th>
        <th>Finding</th>
        <th style="width:90px">Affected</th>
        <th style="width:70px">Score</th>
      </tr>
    </thead>
    <tbody>
      {{#each findings}}
      <tr>
        <td><strong>P{{property}}</strong></td>
        <td>{{{severityBadge severity}}}</td>
        <td>
          <strong>{{title}}</strong>
          {{#if assetName}}<br><small style="color:#818CF8">{{assetName}}</small>{{/if}}
          {{#if whatWasFound}}<br>{{whatWasFound}}{{else}}<br>{{description}}{{/if}}
          {{#if whyItMatters}}<div style="margin-top:4px;color:#6B7280;font-size:11px"><em>{{whyItMatters}}</em></div>{{/if}}
          {{#if observedValue}}<div style="margin-top:4px;font-size:11px;color:#9CA3AF">Observed: {{observedValue}}{{#if metricUnit}} {{metricUnit}}{{/if}}{{#if thresholdValue}} · Threshold: {{thresholdValue}}{{#if metricUnit}} {{metricUnit}}{{/if}}{{/if}}</div>{{/if}}
          {{#if confidenceLevel}}<div style="margin-top:2px;font-size:10px;color:#9CA3AF">Confidence: {{confidenceLevel}}{{#if confidenceScore}} ({{confidenceScore}}){{/if}}</div>{{/if}}
          <div class="remediation">{{remediation}}</div>
        </td>
        <td>{{affectedObjects}}/{{totalObjects}}<br><small>({{ratioPercent}}%)</small></td>
        <td>{{fixed2 rawScore}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
</section>

</div>

<!-- Footer -->
<div class="footer">
  <div class="container">
    {{#if consultantName}}{{consultantName}}{{#if consultantTagline}} — {{consultantTagline}}{{/if}} &middot; {{/if}}DALC Scanner &middot; {{engineVersion}} &middot; Report generated {{generatedAt}}<br>
    Confidential — prepared for {{organisationName}}
  </div>
</div>

</body>
</html>`;

// =============================================================================
// Public API
// =============================================================================

/**
 * Generate a self-contained HTML report string.
 */
export function generateReport(data: ReportData): string {
  registerHelpers();
  const template = Handlebars.compile(HTML_TEMPLATE);
  return template(data);
}

/**
 * Convenience: build report data and generate HTML in one step.
 */
export function generateReportFromResult(
  result: DALCResult,
  scored: ScoredFindings,
  organisationName: string,
  source?: string,
  options?: Parameters<typeof buildReportData>[4],
): string {
  const data = buildReportData(result, scored, organisationName, source, options);
  return generateReport(data);
}

// =============================================================================
// Two-Layer Report System — Executive Board Pack + Technical Appendix
// =============================================================================

import type { ExecutiveReportData, TechnicalAppendixData, MethodologyRegisterEntry } from './types';
import { deriveRemediationPriorities, METHOD_LIMITS } from './remediation';
import { getAllMethodologies } from '../checks/methodology-register';
import { buildRemediationPlan, type ParsedFinding } from '../remediation';
import { EXECUTIVE_TEMPLATE } from './executive-template';
import { TECHNICAL_TEMPLATE } from './technical-template';

/**
 * Convert ReportData findings into ParsedFinding shape for the remediation planner.
 * ReportData findings lack some ResultFindingRow DB fields; we fill in sensible defaults.
 */
function reportFindingsToParsed(
  findings: ReportData['findings'],
): ParsedFinding[] {
  return findings.map((f, idx) => {
    const costCategories = f.costCategories ?? [];
    // Build uniform cost weights from category list (equal weight per category)
    const weight = costCategories.length > 0 ? 1 / costCategories.length : 0;
    const costWeights: Record<string, number> = {};
    for (const cat of costCategories) {
      costWeights[cat] = weight;
    }

    return {
      // ResultFindingRow fields
      id: idx + 1,
      result_set_id: 'report',
      project_id: 'report',
      check_id: f.checkId,
      property: f.property,
      severity: f.severity,
      raw_score: f.rawScore,
      title: f.title,
      description: f.description ?? null,
      asset_type: null,
      asset_key: null,
      asset_name: f.assetName ?? null,
      affected_objects: f.affectedObjects,
      total_objects: f.totalObjects,
      ratio: f.ratio,
      threshold_value: f.thresholdValue ?? null,
      observed_value: f.observedValue ?? null,
      metric_unit: f.metricUnit ?? null,
      remediation: f.remediation ?? null,
      evidence_json: '[]',
      cost_categories_json: JSON.stringify(costCategories),
      cost_weights_json: JSON.stringify(costWeights),
      confidence_level: f.confidenceLevel ?? null,
      confidence_score: f.confidenceScore ?? null,
      explanation: null,
      why_it_matters: f.whyItMatters ?? null,
      // ParsedFinding parsed fields
      costCategories,
      costWeights,
    };
  });
}

const PROPERTY_NAMES_MAP: Record<number, string> = {
  1: 'Semantic Identity',
  2: 'Reference Data',
  3: 'Domain Ownership',
  4: 'Anti-Corruption',
  5: 'Schema Governance',
  6: 'Quality Measurement',
  7: 'Regulatory Traceability',
  8: 'AI Readiness',
};

// =============================================================================
// Trend data builders for reports
// =============================================================================

const DIRECTION_LABELS: Record<string, string> = {
  improving: 'Improving',
  worsening: 'Worsening',
  stable: 'Stable',
  insufficient_data: 'Insufficient Data',
};

const DIRECTION_COLORS: Record<string, string> = {
  improving: '#22c55e',
  worsening: '#ef4444',
  stable: '#94a3b8',
  insufficient_data: '#94a3b8',
};

const SEVERITY_COLORS_MAP: Record<string, string> = {
  critical: '#ef4444',
  major: '#f97316',
  minor: '#eab308',
  info: '#3b82f6',
};

const DELTA_STATUS_LABELS: Record<string, string> = {
  new: 'New',
  resolved: 'Resolved',
  worsened: 'Worsened',
  improved: 'Improved',
  unchanged: 'Unchanged',
};

function buildReportTrendSummary(trendWindow: HistoricalComparisonWindow): ReportTrendSummary | undefined {
  if (trendWindow.windowSize < 2 || !trendWindow.regressionVsPrevious) return undefined;

  const reg = trendWindow.regressionVsPrevious;
  return {
    overallDirection: reg.overallDirection,
    directionLabel: DIRECTION_LABELS[reg.overallDirection] ?? 'Unknown',
    directionColor: DIRECTION_COLORS[reg.overallDirection] ?? '#94a3b8',
    dalcDirection: trendWindow.dalcTrend.direction,
    dalcDirectionLabel: DIRECTION_LABELS[trendWindow.dalcTrend.direction] ?? 'Unknown',
    dalcDirectionColor: DIRECTION_COLORS[trendWindow.dalcTrend.direction] ?? '#94a3b8',
    dalcPercentChange: trendWindow.dalcTrend.percentChange,
    windowSize: trendWindow.windowSize,
    deltaCounts: {
      new: reg.counts.new,
      resolved: reg.counts.resolved,
      worsened: reg.counts.worsened,
      improved: reg.counts.improved,
      unchanged: reg.counts.unchanged,
    },
  };
}

function buildReportRegressionDetail(trendWindow: HistoricalComparisonWindow): ReportRegressionDetail | undefined {
  if (trendWindow.windowSize < 2 || !trendWindow.regressionVsPrevious) return undefined;

  const reg = trendWindow.regressionVsPrevious;
  const mapDelta = (d: typeof reg.topRegressions[number]) => ({
    checkId: d.checkId,
    title: d.title,
    property: d.property,
    propertyName: PROPERTY_NAMES_MAP[d.property] ?? `P${d.property}`,
    status: d.status,
    statusLabel: DELTA_STATUS_LABELS[d.status] ?? d.status,
    currentSeverity: d.currentSeverity,
    previousSeverity: d.previousSeverity,
    severityColor: SEVERITY_COLORS_MAP[d.currentSeverity] ?? '#94a3b8',
  });

  return {
    targetLabel: reg.targetLabel,
    baselineLabel: reg.baselineLabel,
    targetTimestamp: reg.targetTimestamp,
    baselineTimestamp: reg.baselineTimestamp,
    overallDirection: reg.overallDirection,
    directionLabel: DIRECTION_LABELS[reg.overallDirection] ?? 'Unknown',
    directionColor: DIRECTION_COLORS[reg.overallDirection] ?? '#94a3b8',
    deltaCounts: reg.counts,
    topRegressions: reg.topRegressions.map(mapDelta),
    topImprovements: reg.topImprovements.map(mapDelta),
    dalcDelta: {
      baselineBaseUsd: reg.dalcDelta.baselineBaseUsd,
      targetBaseUsd: reg.dalcDelta.targetBaseUsd,
      changeBaseUsd: reg.dalcDelta.changeBaseUsd,
      percentChange: reg.dalcDelta.percentChange,
    },
  };
}

/**
 * Build methodology register entries enriched with property names.
 */
function buildMethodologyRegister(): MethodologyRegisterEntry[] {
  return getAllMethodologies().map(m => ({
    ...m,
    propertyName: PROPERTY_NAMES_MAP[m.property] ?? `P${m.property}`,
  }));
}

/**
 * Build Executive Board Pack data from base ReportData.
 * Adds top risks, remediation priorities, method limits, coverage summary.
 */
export function buildExecutiveReportData(
  result: DALCResult,
  scored: ScoredFindings,
  organisationName: string,
  source?: string,
  options?: Parameters<typeof buildReportData>[4] & {
    totalChecksRun?: number;
    trendWindow?: HistoricalComparisonWindow;
    benchmarkSummary?: import('../benchmark/types').BenchmarkSummary;
    includeBlastRadius?: boolean;
  },
): ExecutiveReportData {
  const base = buildReportData(result, scored, organisationName, source, {
    ...options,
    displayMode: 'executive',
  });

  // Top risks: critical + major, sorted by rawScore desc, max 5
  const topRisks = [...base.findings]
    .filter((f) => f.severity === 'critical' || f.severity === 'major')
    .sort((a, b) => b.rawScore - a.rawScore)
    .slice(0, 5);

  // Remediation priorities from findings (legacy per-finding)
  const remediationPriorities = deriveRemediationPriorities(base.findings);

  // Grouped remediation actions from planner
  const pseudoFindings = reportFindingsToParsed(base.findings);
  const plan = buildRemediationPlan({
    resultSetId: 'report',
    findings: pseudoFindings,
    dalcLowUsd: base.dalcLowUsd,
    dalcBaseUsd: base.dalcBaseUsd,
    dalcHighUsd: base.dalcHighUsd,
  });

  // Coverage summary
  const checksRun = options?.totalChecksRun ?? 21;
  const propertiesCovered = new Set(base.findings.map((f) => f.property)).size;
  const coverageSummary = `${checksRun} checks across ${propertiesCovered} properties`;

  // Criticality summary for executive audience (condensed)
  const criticalitySummary = base.criticalityAssessment ? {
    totalAssetsAssessed: base.criticalityAssessment.totalAssetsAssessed,
    totalCdeCandidates: base.criticalityAssessment.totalCdeCandidates,
    averageCriticalityScore: base.criticalityAssessment.averageCriticalityScore,
    tierDistribution: base.criticalityAssessment.tierDistribution,
    topCriticalAssets: base.criticalityAssessment.topCriticalAssets.slice(0, 5).map(a => ({
      assetName: a.assetName,
      criticalityTier: a.criticalityTier,
      tierColor: a.tierColor,
      tierLabel: a.tierLabel,
      cdeCandidate: a.cdeCandidate,
    })),
  } : undefined;

  // Blast-radius summary (optional — uses findings + finalCosts from DALC)
  let blastRadiusSummary: ExecutiveReportData['blastRadiusSummary'];
  if (options?.includeBlastRadius !== false && base.findings.length > 0) {
    const brFindings: BlastRadiusFindingInput[] = pseudoFindings.map(f => ({
      checkId: f.check_id,
      property: f.property,
      severity: f.severity,
      raw_score: f.raw_score,
      costCategories: f.costCategories,
      costWeights: f.costWeights,
    }));
    const brGraph = buildBlastRadiusGraph(brFindings, result.finalCosts as unknown as Record<string, number>);
    blastRadiusSummary = buildBlastRadiusSummary(brGraph);
  }

  return {
    ...base,
    reportMode: 'executive',
    topRisks,
    remediationPriorities,
    remediationActions: plan.actions.slice(0, 5),
    methodLimits: METHOD_LIMITS,
    methodologyRegister: buildMethodologyRegister(),
    coverageSummary,
    methodologySummary: options?.methodologySummary,
    trendSummary: options?.trendWindow ? buildReportTrendSummary(options.trendWindow) : undefined,
    benchmarkSummary: options?.benchmarkSummary,
    blastRadiusSummary,
    criticalitySummary,
  };
}

/**
 * Build Technical Appendix data from base ReportData.
 * Adds assessment metadata, findings-by-property, DALC explanation, coverage detail.
 */
export function buildTechnicalAppendixData(
  result: DALCResult,
  scored: ScoredFindings,
  organisationName: string,
  source?: string,
  options?: Parameters<typeof buildReportData>[4] & {
    appVersion?: string;
    rulesetVersion?: string;
    dalcVersion?: string;
    adapterType?: string;
    scanDuration?: string;
    startedAt?: string;
    completedAt?: string;
    totalChecksRun?: number;
    schemasScanned?: number;
    columnsScanned?: number;
    trendWindow?: HistoricalComparisonWindow;
    benchmarkSummary?: import('../benchmark/types').BenchmarkSummary;
    includeBlastRadius?: boolean;
    resultSetId?: string;
    manifestStatus?: string;
    schemaVersion?: number;
    projectScanCount?: number;
  },
): TechnicalAppendixData {
  const base = buildReportData(result, scored, organisationName, source, {
    ...options,
    displayMode: 'technical',
  });

  // Group findings by property
  const propertyMap = new Map<number, typeof base.findings>();
  for (const f of base.findings) {
    const arr = propertyMap.get(f.property) ?? [];
    arr.push(f);
    propertyMap.set(f.property, arr);
  }

  const findingsByProperty = result.propertyScores.map((ps, idx) => {
    const propNum = idx + 1;
    return {
      propertyNumber: propNum,
      propertyName: PROPERTY_NAMES_MAP[propNum] ?? ps.name,
      propertyScore: ps.score,
      maturityLabel: ps.maturityLabel,
      findings: propertyMap.get(propNum) ?? [],
    };
  });

  // Assessment metadata
  const assessmentMetadata = {
    appVersion: options?.appVersion ?? 'unknown',
    rulesetVersion: options?.rulesetVersion ?? 'v1.0.0',
    dalcVersion: result.engineVersion,
    adapterType: options?.adapterType ?? (source ?? 'database'),
    scanDuration: options?.scanDuration,
    startedAt: options?.startedAt,
    completedAt: options?.completedAt,
    totalChecksRun: options?.totalChecksRun ?? 21,
    totalStrengths: base.strengths.length,
  };

  // DALC explanation
  const dalcExplanation = {
    dalcLowUsd: base.dalcLowUsd,
    dalcBaseUsd: base.dalcBaseUsd,
    dalcHighUsd: base.dalcHighUsd,
    spectralRadius: result.spectralRadius,
    amplificationRatio: result.amplificationRatio,
    shannonEntropy: result.shannonEntropy,
    maxEntropy: result.maxEntropy,
    baseTotal: result.baseTotal,
    adjustedTotal: result.adjustedTotal,
    amplifiedTotal: result.amplifiedTotal,
    sanityCapped: result.sanityCapped,
  };

  // Coverage detail
  const checksWithFindings = new Set(base.findings.map((f) => f.checkId)).size;
  const propertiesCovered = new Set(base.findings.map((f) => f.property)).size;
  const coverageDetail = {
    schemasScanned: options?.schemasScanned ?? 1,
    tablesScanned: base.totalTables,
    columnsScanned: options?.columnsScanned ?? 0,
    checksRun: options?.totalChecksRun ?? 21,
    checksWithFindings,
    propertiesCovered,
  };

  // Grouped remediation actions from planner
  const pseudoFindings = reportFindingsToParsed(base.findings);
  const techPlan = buildRemediationPlan({
    resultSetId: 'report',
    findings: pseudoFindings,
    dalcLowUsd: base.dalcLowUsd,
    dalcBaseUsd: base.dalcBaseUsd,
    dalcHighUsd: base.dalcHighUsd,
  });

  // Criticality detail for technical audience (full)
  const criticalityDetail = base.criticalityAssessment ? {
    totalAssetsAssessed: base.criticalityAssessment.totalAssetsAssessed,
    totalCdeCandidates: base.criticalityAssessment.totalCdeCandidates,
    averageCriticalityScore: base.criticalityAssessment.averageCriticalityScore,
    tierDistribution: base.criticalityAssessment.tierDistribution,
    topCriticalAssets: base.criticalityAssessment.topCriticalAssets.map(a => ({
      assetName: a.assetName,
      assetType: a.assetType,
      criticalityScore: a.criticalityScore,
      criticalityTier: a.criticalityTier,
      tierColor: a.tierColor,
      tierLabel: a.tierLabel,
      cdeCandidate: a.cdeCandidate,
    })),
  } : undefined;

  // Blast-radius summary + detail (optional — full edge table for technical audience)
  let blastRadiusSummary: TechnicalAppendixData['blastRadiusSummary'];
  let blastRadiusDetail: TechnicalAppendixData['blastRadiusDetail'];
  if (options?.includeBlastRadius !== false && base.findings.length > 0) {
    const brFindings: BlastRadiusFindingInput[] = pseudoFindings.map(f => ({
      checkId: f.check_id,
      property: f.property,
      severity: f.severity,
      raw_score: f.raw_score,
      costCategories: f.costCategories,
      costWeights: f.costWeights,
    }));
    const brGraph = buildBlastRadiusGraph(brFindings, result.finalCosts as unknown as Record<string, number>);
    blastRadiusSummary = buildBlastRadiusSummary(brGraph);
    blastRadiusDetail = buildBlastRadiusDetail(brGraph);
  }

  // Reproducibility manifest summary (optional — audit trail for technical audience)
  const componentLabels = [
    'Core Findings', 'Criticality', 'Methodology', 'Trend Data',
    'Benchmark', 'Blast Radius', 'Remediation',
  ];
  const componentAvailable = [
    base.findings.length > 0,
    !!criticalityDetail,
    !!options?.methodologySummary,
    !!(options?.trendWindow),
    !!options?.benchmarkSummary,
    !!blastRadiusSummary,
    base.findings.length > 0,
  ];
  const manifestSummary = options?.resultSetId ? {
    manifestVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    schemaVersion: options?.schemaVersion ?? 13,
    status: options?.manifestStatus ?? 'completed',
    componentAvailability: componentLabels.map((label, i) => ({
      label,
      available: componentAvailable[i],
    })),
    propertiesCovered: coverageDetail.propertiesCovered,
    totalProperties: 8,
    amplificationRatio: result.amplificationRatio,
    resultSetId: options.resultSetId,
  } : undefined;

  return {
    ...base,
    reportMode: 'technical',
    remediationActions: techPlan.actions,
    methodologyRegister: buildMethodologyRegister(),
    methodologySummary: options?.methodologySummary,
    trendSummary: options?.trendWindow ? buildReportTrendSummary(options.trendWindow) : undefined,
    benchmarkSummary: options?.benchmarkSummary,
    blastRadiusSummary,
    blastRadiusDetail,
    regressionDetail: options?.trendWindow ? buildReportRegressionDetail(options.trendWindow) : undefined,
    manifestSummary,
    assessmentMetadata,
    findingsByProperty,
    dalcExplanation,
    coverageDetail,
    criticalityDetail,
  };
}

/**
 * Generate Executive Board Pack HTML.
 */
export function generateExecutiveReport(data: ExecutiveReportData): string {
  registerHelpers();
  const template = Handlebars.compile(EXECUTIVE_TEMPLATE);
  return template(data);
}

/**
 * Generate Technical Appendix HTML.
 */
export function generateTechnicalReport(data: TechnicalAppendixData): string {
  registerHelpers();
  const template = Handlebars.compile(TECHNICAL_TEMPLATE);
  return template(data);
}
