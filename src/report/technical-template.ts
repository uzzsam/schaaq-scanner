/**
 * Technical Appendix — HTML Template
 *
 * Evidence-backed, auditable report for data architects / consultants.
 * Full findings catalogue with evidence fields, DALC explanation,
 * assessment metadata, coverage detail.
 *
 * Self-contained HTML, no external URLs, print-friendly CSS.
 */

export const TECHNICAL_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Technical Appendix — {{organisationName}}</title>
<style>
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
.header .report-type {
  display: inline-block;
  margin-top: 12px;
  padding: 4px 16px;
  border: 1px solid rgba(255,255,255,0.3);
  border-radius: 20px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1px;
}
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

/* Metadata Table */
.meta-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
.meta-table th {
  text-align: left;
  padding: 8px 12px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: var(--c-text-muted);
  border-bottom: 1px solid var(--c-border);
  width: 200px;
}
.meta-table td {
  padding: 8px 12px;
  font-size: 13px;
  border-bottom: 1px solid var(--c-border);
}

/* Metric Cards */
.metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 20px; }
.metric-card {
  background: var(--c-bg-alt);
  border: 1px solid var(--c-border);
  border-radius: 8px;
  padding: 16px;
  text-align: center;
}
.metric-card .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--c-text-muted); margin-bottom: 4px; }
.metric-card .value { font-size: 24px; font-weight: 700; color: var(--c-primary); }
.metric-card .unit { font-size: 11px; color: var(--c-text-muted); }
.metric-card.highlight { border-left: 4px solid var(--c-accent); }

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

/* Bar Charts */
.bar-chart { margin: 12px 0; }
.bar-row { display: flex; align-items: center; margin-bottom: 8px; }
.bar-label { width: 180px; font-size: 13px; flex-shrink: 0; }
.bar-track { flex: 1; height: 24px; background: var(--c-bg-alt); border-radius: 4px; overflow: hidden; position: relative; }
.bar-fill { height: 100%; border-radius: 4px; display: flex; align-items: center; padding-left: 8px; }
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

/* Radar chart layout */
.radar-layout { display: flex; gap: 40px; align-items: flex-start; }
.radar-chart-wrap { flex: 0 0 auto; }
.radar-scores-wrap { flex: 1; }

/* Findings Property Group */
.property-group { margin-bottom: 24px; }
.property-group-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--c-bg-alt);
  border: 1px solid var(--c-border);
  border-radius: 8px 8px 0 0;
  margin-bottom: 0;
}
.property-group-header .prop-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--c-primary);
  color: #fff;
  font-weight: 700;
  font-size: 13px;
}

/* Findings Table */
.findings-table { width: 100%; border-collapse: collapse; }
.findings-table th {
  background: var(--c-primary);
  color: #fff;
  padding: 8px 10px;
  text-align: left;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.findings-table td { padding: 10px 12px; border-bottom: 1px solid var(--c-border); font-size: 12px; vertical-align: top; }
.findings-table tr:nth-child(even) { background: var(--c-bg-alt); }
.findings-table .remediation { font-size: 11px; color: var(--c-text-muted); margin-top: 4px; font-style: italic; }

/* DALC Explanation Grid */
.dalc-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 16px 0; }
.dalc-card {
  background: var(--c-bg-alt);
  border: 1px solid var(--c-border);
  border-radius: 6px;
  padding: 12px;
}
.dalc-card .dalc-label { font-size: 11px; text-transform: uppercase; color: var(--c-text-muted); margin-bottom: 2px; }
.dalc-card .dalc-value { font-size: 18px; font-weight: 700; color: var(--c-primary); }

/* Coverage stats */
.coverage-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 16px 0; }

/* Footer */
.footer {
  padding: 24px 0;
  text-align: center;
  font-size: 12px;
  color: var(--c-text-muted);
  border-top: 1px solid var(--c-border);
}

@media print {
  @page { size: A4; margin: 12mm; }
  body { font-size: 10px; color: #1F2937; background: white; }
  .container { max-width: 100%; padding: 0; }
  section { padding: 12px 0; break-inside: avoid; page-break-inside: avoid; }
  .section-page-break { break-before: page; page-break-before: always; }
  * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .header { padding: 16px 0; }
  .metrics { grid-template-columns: repeat(4, 1fr); }
  .metric-card { padding: 8px; }
  .metric-card .value { font-size: 16px; }
  .findings-table { font-size: 9px; }
  .findings-table th, .findings-table td { padding: 4px 5px; }
  .radar-layout { gap: 16px; }
  .radar-chart-wrap svg { max-width: 240px; }
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
    <h1>{{#if reportTitle}}{{reportTitle}}{{else}}Data Architecture Assessment{{/if}}</h1>
    <div class="subtitle">{{organisationName}} — {{uppercase sector}} Sector</div>
    <div class="meta">
      Engine {{engineVersion}} &middot; Generated {{generatedAt}} &middot; {{totalTables}} tables analysed{{#if databaseLabel}} &middot; {{databaseLabel}}{{/if}}
    </div>
    <div class="report-type">Technical Appendix</div>
  </div>
</div>

<div class="container">

<!-- Assessment Metadata -->
<section>
  <h2>Assessment Metadata</h2>
  <table class="meta-table">
    <tr><th>Application Version</th><td>{{assessmentMetadata.appVersion}}</td></tr>
    <tr><th>Ruleset Version</th><td>{{assessmentMetadata.rulesetVersion}}</td></tr>
    <tr><th>DALC Engine Version</th><td>{{assessmentMetadata.dalcVersion}}</td></tr>
    <tr><th>Adapter Type</th><td>{{assessmentMetadata.adapterType}}</td></tr>
    <tr><th>Total Checks Run</th><td>{{assessmentMetadata.totalChecksRun}}</td></tr>
    <tr><th>Total Strengths</th><td>{{assessmentMetadata.totalStrengths}}</td></tr>
    {{#if assessmentMetadata.startedAt}}<tr><th>Started At</th><td>{{assessmentMetadata.startedAt}}</td></tr>{{/if}}
    {{#if assessmentMetadata.completedAt}}<tr><th>Completed At</th><td>{{assessmentMetadata.completedAt}}</td></tr>{{/if}}
    {{#if assessmentMetadata.scanDuration}}<tr><th>Scan Duration</th><td>{{assessmentMetadata.scanDuration}}</td></tr>{{/if}}
  </table>
</section>

{{#if manifestSummary}}
<!-- Reproducibility & Audit Trail -->
<section>
  <h2>Reproducibility &amp; Audit Trail</h2>
  <table class="meta-table">
    <tr><th>Manifest Version</th><td>{{manifestSummary.manifestVersion}}</td></tr>
    <tr><th>Schema Version</th><td>{{manifestSummary.schemaVersion}}</td></tr>
    <tr><th>Result Set ID</th><td><code>{{manifestSummary.resultSetId}}</code></td></tr>
    <tr><th>Run Status</th><td>{{manifestSummary.status}}</td></tr>
    <tr><th>Properties Covered</th><td>{{manifestSummary.propertiesCovered}} / {{manifestSummary.totalProperties}}</td></tr>
    <tr><th>Amplification Ratio</th><td>{{manifestSummary.amplificationRatio}}×</td></tr>
    <tr><th>Generated At</th><td>{{manifestSummary.generatedAt}}</td></tr>
  </table>
  <h3 style="margin-top:12px">Component Availability</h3>
  <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px">
    {{#each manifestSummary.componentAvailability}}
    <span style="display:inline-block;padding:2px 8px;border-radius:3px;font-size:11px;{{#if available}}background:rgba(39,174,96,0.1);color:#27AE60{{else}}background:rgba(75,85,99,0.1);color:#6B7280{{/if}}">
      {{#if available}}✓{{else}}—{{/if}} {{label}}
    </span>
    {{/each}}
  </div>
</section>
{{/if}}

<!-- Coverage Summary -->
<section>
  <h2>Coverage Summary</h2>
  <div class="coverage-grid">
    <div class="metric-card">
      <div class="label">Schemas Scanned</div>
      <div class="value">{{coverageDetail.schemasScanned}}</div>
    </div>
    <div class="metric-card">
      <div class="label">Tables Scanned</div>
      <div class="value">{{coverageDetail.tablesScanned}}</div>
    </div>
    <div class="metric-card">
      <div class="label">Columns Scanned</div>
      <div class="value">{{coverageDetail.columnsScanned}}</div>
    </div>
    <div class="metric-card">
      <div class="label">Checks Run</div>
      <div class="value">{{coverageDetail.checksRun}}</div>
    </div>
    <div class="metric-card">
      <div class="label">Checks with Findings</div>
      <div class="value">{{coverageDetail.checksWithFindings}}</div>
    </div>
    <div class="metric-card">
      <div class="label">Properties Covered</div>
      <div class="value">{{coverageDetail.propertiesCovered}}</div>
    </div>
  </div>

  <div class="severity-summary">
    <div class="count-badge"><div class="dot" style="background:var(--c-critical)"></div>{{criticalCount}} Critical</div>
    <div class="count-badge"><div class="dot" style="background:var(--c-major)"></div>{{majorCount}} Major</div>
    <div class="count-badge"><div class="dot" style="background:var(--c-minor)"></div>{{minorCount}} Minor</div>
    <div class="count-badge"><div class="dot" style="background:var(--c-info)"></div>{{infoCount}} Info</div>
  </div>

  <!-- Severity Summary -->
  <div class="severity-summary" style="margin-top: 8px;">
    <div class="count-badge" style="background: none; border: none; font-size: 12px; color: var(--c-text-muted);">Total Findings: {{totalFindings}}</div>
  </div>
</section>

<!-- Regression Analysis (if historical data available) -->
{{#if regressionDetail}}
<section class="section-page-break">
  <h2>Regression Analysis</h2>
  <p style="font-size:13px;color:var(--c-text-muted);margin-bottom:16px;">
    Comparing <strong>{{regressionDetail.targetLabel}}</strong> to <strong>{{regressionDetail.baselineLabel}}</strong>
  </p>

  <div class="metrics-grid">
    <div class="metric-card">
      <div class="label">Direction</div>
      <div class="value" style="color:{{regressionDetail.directionColor}}; font-size:18px;">{{regressionDetail.directionLabel}}</div>
    </div>
    <div class="metric-card">
      <div class="label">New</div>
      <div class="value" style="color:var(--c-critical)">{{regressionDetail.deltaCounts.new}}</div>
    </div>
    <div class="metric-card">
      <div class="label">Resolved</div>
      <div class="value" style="color:var(--c-success)">{{regressionDetail.deltaCounts.resolved}}</div>
    </div>
    <div class="metric-card">
      <div class="label">Worsened</div>
      <div class="value" style="color:var(--c-major)">{{regressionDetail.deltaCounts.worsened}}</div>
    </div>
    <div class="metric-card">
      <div class="label">Improved</div>
      <div class="value" style="color:var(--c-success)">{{regressionDetail.deltaCounts.improved}}</div>
    </div>
    <div class="metric-card">
      <div class="label">Unchanged</div>
      <div class="value">{{regressionDetail.deltaCounts.unchanged}}</div>
    </div>
  </div>

  <div style="margin-top:16px; display:flex; gap:16px; flex-wrap:wrap;">
    <div style="flex:1; min-width:200px; padding:12px; background:var(--c-surface); border-radius:8px;">
      <div style="font-size:12px; color:var(--c-text-muted); margin-bottom:4px;">DALC Change</div>
      <div style="font-size:16px; font-weight:600;">
        {{currency regressionDetail.dalcDelta.baselineBaseUsd}} &rarr; {{currency regressionDetail.dalcDelta.targetBaseUsd}}
      </div>
      <div style="font-size:13px; color:var(--c-text-muted);">
        {{currency regressionDetail.dalcDelta.changeBaseUsd}} change
        {{#if regressionDetail.dalcDelta.percentChange}}({{fixed1 regressionDetail.dalcDelta.percentChange}}%){{/if}}
      </div>
    </div>
  </div>

  {{#if regressionDetail.topRegressions.length}}
  <h3 style="margin-top:20px; font-size:14px;">Top Regressions</h3>
  <table class="findings-table">
    <thead>
      <tr>
        <th style="width:80px">Check ID</th>
        <th style="width:70px">Status</th>
        <th>Finding</th>
        <th style="width:70px">Severity</th>
        <th style="width:100px">Property</th>
      </tr>
    </thead>
    <tbody>
      {{#each regressionDetail.topRegressions}}
      <tr>
        <td><code>{{checkId}}</code></td>
        <td><span style="color:var(--c-critical); font-weight:600;">{{statusLabel}}</span></td>
        <td>{{title}}</td>
        <td>{{{severityBadge currentSeverity}}}</td>
        <td>P{{property}} {{propertyName}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  {{/if}}

  {{#if regressionDetail.topImprovements.length}}
  <h3 style="margin-top:20px; font-size:14px;">Top Improvements</h3>
  <table class="findings-table">
    <thead>
      <tr>
        <th style="width:80px">Check ID</th>
        <th style="width:70px">Status</th>
        <th>Finding</th>
        <th style="width:70px">Severity</th>
        <th style="width:100px">Property</th>
      </tr>
    </thead>
    <tbody>
      {{#each regressionDetail.topImprovements}}
      <tr>
        <td><code>{{checkId}}</code></td>
        <td><span style="color:var(--c-success); font-weight:600;">{{statusLabel}}</span></td>
        <td>{{title}}</td>
        <td>{{{severityBadge currentSeverity}}}</td>
        <td>P{{property}} {{propertyName}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  {{/if}}
</section>
{{/if}}

<!-- Trend Summary (condensed, if available) -->
{{#if trendSummary}}
<section>
  <div class="severity-summary" style="margin-bottom:16px;">
    <div class="count-badge">
      Trend: <strong style="color:{{trendSummary.directionColor}}">{{trendSummary.directionLabel}}</strong>
      &nbsp;across {{trendSummary.windowSize}} scans
    </div>
    <div class="count-badge">
      DALC: <strong style="color:{{trendSummary.dalcDirectionColor}}">{{trendSummary.dalcDirectionLabel}}</strong>
      {{#if trendSummary.dalcPercentChange}}({{fixed1 trendSummary.dalcPercentChange}}%){{/if}}
    </div>
  </div>
</section>
{{/if}}

<!-- Benchmark Comparison (if available) -->
{{#if benchmarkSummary}}
<section>
  <h3 style="margin-bottom:8px;">Benchmark Comparison</h3>
  <p style="font-size:11px;color:#6B7280;margin-bottom:10px;">
    vs. {{benchmarkSummary.packName}} (v{{benchmarkSummary.packVersion}})
    &mdash; Overall:
    <strong style="color:{{benchmarkPositionColor benchmarkSummary.overallPosition}}">
      {{benchmarkPositionLabel benchmarkSummary.overallPosition}}
    </strong>
  </p>

  <table class="findings-table" style="margin-bottom:12px;">
    <thead>
      <tr>
        <th>Metric</th>
        <th style="text-align:right">Actual</th>
        <th style="text-align:right">Range</th>
        <th style="text-align:center">Position</th>
        <th style="text-align:right">% from Range</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>{{benchmarkSummary.dalcComparison.metric.label}}</td>
        <td style="text-align:right">{{currency benchmarkSummary.dalcComparison.actualValue}}</td>
        <td style="text-align:right">{{currency benchmarkSummary.dalcComparison.metric.low}} – {{currency benchmarkSummary.dalcComparison.metric.high}}</td>
        <td style="text-align:center;color:{{benchmarkPositionColor benchmarkSummary.dalcComparison.position}}">
          {{benchmarkPositionLabel benchmarkSummary.dalcComparison.position}}
        </td>
        <td style="text-align:right">{{#if benchmarkSummary.dalcComparison.percentFromRange}}{{benchmarkSummary.dalcComparison.percentFromRange}}%{{else}}&mdash;{{/if}}</td>
      </tr>
      <tr>
        <td>{{benchmarkSummary.totalFindingsComparison.metric.label}}</td>
        <td style="text-align:right">{{benchmarkSummary.totalFindingsComparison.actualValue}}</td>
        <td style="text-align:right">{{benchmarkSummary.totalFindingsComparison.metric.low}} – {{benchmarkSummary.totalFindingsComparison.metric.high}}</td>
        <td style="text-align:center;color:{{benchmarkPositionColor benchmarkSummary.totalFindingsComparison.position}}">
          {{benchmarkPositionLabel benchmarkSummary.totalFindingsComparison.position}}
        </td>
        <td style="text-align:right">{{#if benchmarkSummary.totalFindingsComparison.percentFromRange}}{{benchmarkSummary.totalFindingsComparison.percentFromRange}}%{{else}}&mdash;{{/if}}</td>
      </tr>
      <tr>
        <td>{{benchmarkSummary.highSeverityComparison.metric.label}}</td>
        <td style="text-align:right">{{benchmarkSummary.highSeverityComparison.actualValue}}</td>
        <td style="text-align:right">{{benchmarkSummary.highSeverityComparison.metric.low}} – {{benchmarkSummary.highSeverityComparison.metric.high}}</td>
        <td style="text-align:center;color:{{benchmarkPositionColor benchmarkSummary.highSeverityComparison.position}}">
          {{benchmarkPositionLabel benchmarkSummary.highSeverityComparison.position}}
        </td>
        <td style="text-align:right">{{#if benchmarkSummary.highSeverityComparison.percentFromRange}}{{benchmarkSummary.highSeverityComparison.percentFromRange}}%{{else}}&mdash;{{/if}}</td>
      </tr>
      <tr>
        <td>{{benchmarkSummary.highSeverityDensityComparison.metric.label}}</td>
        <td style="text-align:right">{{pct benchmarkSummary.highSeverityDensityComparison.actualValue}}</td>
        <td style="text-align:right">{{pct benchmarkSummary.highSeverityDensityComparison.metric.low}} – {{pct benchmarkSummary.highSeverityDensityComparison.metric.high}}</td>
        <td style="text-align:center;color:{{benchmarkPositionColor benchmarkSummary.highSeverityDensityComparison.position}}">
          {{benchmarkPositionLabel benchmarkSummary.highSeverityDensityComparison.position}}
        </td>
        <td style="text-align:right">{{#if benchmarkSummary.highSeverityDensityComparison.percentFromRange}}{{benchmarkSummary.highSeverityDensityComparison.percentFromRange}}%{{else}}&mdash;{{/if}}</td>
      </tr>
    </tbody>
  </table>

  {{#if benchmarkSummary.propertyComparisons.length}}
  <details style="margin-bottom:8px;">
    <summary style="cursor:pointer;font-size:12px;color:#9CA3AF;">Property Breakdown ({{benchmarkSummary.propertyComparisons.length}} properties)</summary>
    <table class="findings-table" style="margin-top:6px;">
      <thead>
        <tr><th>Property</th><th style="text-align:right">Findings</th><th style="text-align:right">Range</th><th style="text-align:center">Position</th></tr>
      </thead>
      <tbody>
        {{#each benchmarkSummary.propertyComparisons}}
        <tr>
          <td>{{propertyName}}</td>
          <td style="text-align:right">{{actualFindingCount}}</td>
          <td style="text-align:right">{{benchmarkLow}} – {{benchmarkHigh}}</td>
          <td style="text-align:center">{{position}}</td>
        </tr>
        {{/each}}
      </tbody>
    </table>
  </details>
  {{/if}}

  {{#if benchmarkSummary.keyMessages.length}}
  {{#each benchmarkSummary.keyMessages}}
  <div style="font-size:11px;color:#9CA3AF;margin-bottom:3px;">{{this}}</div>
  {{/each}}
  {{/if}}
</section>
{{/if}}

<!-- Economic Blast Radius -->
{{#if blastRadiusSummary}}
<section class="section-page-break">
  <h2>Economic Blast Radius</h2>
  <div style="font-size:12px;color:#D1D5DB;line-height:1.5;padding:8px 12px;border-radius:6px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.12);margin-bottom:16px;">
    {{blastRadiusSummary.keyMessage}}
  </div>

  <div class="metric-row">
    <div class="metric-card" style="border-top:3px solid #EF4444">
      <div class="label">Total Impact</div>
      <div class="value" style="color:#EF4444;font-size:18px;">{{currency blastRadiusSummary.totalImpactUsd}}</div>
    </div>
    <div class="metric-card">
      <div class="label">Impact Pathways</div>
      <div class="value">{{blastRadiusSummary.totalEdgeCount}}</div>
    </div>
    <div class="metric-card">
      <div class="label">Properties Affected</div>
      <div class="value">{{blastRadiusSummary.totalPropertyNodesActive}}</div>
    </div>
    <div class="metric-card">
      <div class="label">Cost Areas</div>
      <div class="value">{{blastRadiusSummary.totalCostCategoryNodesActive}}</div>
    </div>
    <div class="metric-card">
      <div class="label">Top-3 Concentration</div>
      <div class="value">{{pctRatio blastRadiusSummary.concentrationRatio}}</div>
    </div>
  </div>

  {{#if blastRadiusSummary.topHotEdges.length}}
  <h3 style="margin-top:20px;margin-bottom:8px;">Highest-Impact Pathways</h3>
  <table class="findings-table">
    <thead>
      <tr>
        <th style="width:30px">#</th>
        <th>Property → Cost Category</th>
        <th style="text-align:right">Impact (USD)</th>
        <th style="text-align:right">Share</th>
        <th style="text-align:right">Findings</th>
        <th style="width:70px">Top Severity</th>
      </tr>
    </thead>
    <tbody>
      {{#each blastRadiusSummary.topHotEdges}}
      <tr>
        <td>{{inc @index}}</td>
        <td>{{propertyName}} → {{costCategoryLabel}}</td>
        <td style="text-align:right">{{currency weightUsd}}</td>
        <td style="text-align:right">{{pctRatio shareOfTotal}}</td>
        <td style="text-align:right">{{findingCount}}</td>
        <td>{{{severityBadge topSeverity}}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  {{/if}}

  {{#if blastRadiusDetail}}
  <h3 style="margin-top:20px;margin-bottom:8px;">Full Edge Table</h3>
  <table class="findings-table" style="font-size:11px;">
    <thead>
      <tr>
        <th>Property</th>
        <th>Cost Category</th>
        <th style="text-align:right">Impact (USD)</th>
        <th style="text-align:right">Share</th>
        <th style="text-align:right">Findings</th>
      </tr>
    </thead>
    <tbody>
      {{#each blastRadiusDetail.edges}}
      <tr>
        <td>{{propertyName}}</td>
        <td>{{costCategoryLabel}}</td>
        <td style="text-align:right">{{currency weightUsd}}</td>
        <td style="text-align:right">{{pctRatio shareOfTotal}}</td>
        <td style="text-align:right">{{findingCount}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>

  <div style="display:flex;gap:24px;margin-top:16px;">
    <div style="flex:1;">
      <h4 style="margin-bottom:8px;">By Property</h4>
      <table class="findings-table" style="font-size:11px;">
        <thead><tr><th>Property</th><th style="text-align:right">Total (USD)</th><th style="text-align:right">Findings</th></tr></thead>
        <tbody>
          {{#each blastRadiusDetail.propertyTotals}}
          <tr>
            <td>{{propertyName}}</td>
            <td style="text-align:right">{{currency totalUsd}}</td>
            <td style="text-align:right">{{findingCount}}</td>
          </tr>
          {{/each}}
        </tbody>
      </table>
    </div>
    <div style="flex:1;">
      <h4 style="margin-bottom:8px;">By Cost Category</h4>
      <table class="findings-table" style="font-size:11px;">
        <thead><tr><th>Category</th><th style="text-align:right">Total (USD)</th><th style="text-align:right">Findings</th></tr></thead>
        <tbody>
          {{#each blastRadiusDetail.categoryTotals}}
          <tr>
            <td>{{categoryLabel}}</td>
            <td style="text-align:right">{{currency totalUsd}}</td>
            <td style="text-align:right">{{findingCount}}</td>
          </tr>
          {{/each}}
        </tbody>
      </table>
    </div>
  </div>
  {{/if}}
</section>
{{/if}}

<!-- Findings Catalogue -->
<section class="section-page-break">
  <h2>Findings Catalogue</h2>

  {{#each findingsByProperty}}
  {{#if findings.length}}
  <div class="property-group">
    <div class="property-group-header">
      <span class="prop-num">P{{propertyNumber}}</span>
      <div>
        <strong>{{propertyName}}</strong>
        <span style="margin-left:12px;font-size:12px;color:var(--c-text-muted)">Score: {{fixed1 propertyScore}}/4 — {{maturityLabel}}</span>
      </div>
    </div>
    <table class="findings-table">
      <thead>
        <tr>
          <th style="width:80px">Check ID</th>
          <th style="width:70px">Severity</th>
          <th style="width:60px">Criticality</th>
          <th>Finding</th>
          <th style="width:80px">Affected</th>
          <th style="width:60px">Score</th>
        </tr>
      </thead>
      <tbody>
        {{#each findings}}
        <tr>
          <td><code>{{checkId}}</code></td>
          <td>{{{severityBadge severity}}}</td>
          <td>{{{criticalityBadge criticalityTier}}}</td>
          <td>
            <strong>{{title}}</strong>
            {{#if assetName}}<br><small style="color:#818CF8">{{assetName}}</small>{{/if}}
            {{#if whatWasFound}}<br>{{whatWasFound}}{{else}}<br>{{description}}{{/if}}
            {{#if whyItMatters}}<div style="margin-top:4px;color:#6B7280;font-size:11px"><em>{{whyItMatters}}</em></div>{{/if}}
            {{#if observedValue}}<div style="margin-top:4px;font-size:11px;color:#9CA3AF">Observed: {{observedValue}}{{#if metricUnit}} {{metricUnit}}{{/if}}{{#if thresholdValue}} &middot; Threshold: {{thresholdValue}}{{#if metricUnit}} {{metricUnit}}{{/if}}{{/if}}</div>{{/if}}
            {{#if confidenceLevel}}<div style="margin-top:2px;font-size:10px;color:#9CA3AF">Confidence: {{confidenceLevel}}{{#if confidenceScore}} ({{confidenceScore}}){{/if}}</div>{{/if}}
            <div class="remediation">{{remediation}}</div>
          </td>
          <td>{{affectedObjects}}/{{totalObjects}}<br><small>({{ratioPercent}}%)</small></td>
          <td>{{fixed2 rawScore}}</td>
        </tr>
        {{/each}}
      </tbody>
    </table>
  </div>
  {{/if}}
  {{/each}}
</section>

<!-- DALC Explanation -->
<section class="section-page-break">
  <h2>DALC Cost Model Explanation</h2>
  <p style="font-size:13px;color:var(--c-text-muted);margin-bottom:16px;">
    The Data Architecture Loss Calculator (DALC) uses a Leontief input-output amplification model
    to estimate the total cost of data architecture disorder across six cost categories.
  </p>

  <h3>Cost Range (Low / Base / High)</h3>
  <div class="dalc-grid">
    <div class="dalc-card">
      <div class="dalc-label">Low Estimate</div>
      <div class="dalc-value">{{currency dalcExplanation.dalcLowUsd}}</div>
    </div>
    <div class="dalc-card" style="border-left: 3px solid var(--c-accent);">
      <div class="dalc-label">Base Estimate</div>
      <div class="dalc-value">{{currency dalcExplanation.dalcBaseUsd}}</div>
    </div>
    <div class="dalc-card">
      <div class="dalc-label">High Estimate</div>
      <div class="dalc-value">{{currency dalcExplanation.dalcHighUsd}}</div>
    </div>
  </div>

  <h3>Amplification Pipeline</h3>
  <div class="dalc-grid">
    <div class="dalc-card">
      <div class="dalc-label">Base Total</div>
      <div class="dalc-value">{{currency dalcExplanation.baseTotal}}</div>
    </div>
    <div class="dalc-card">
      <div class="dalc-label">Adjusted Total</div>
      <div class="dalc-value">{{currency dalcExplanation.adjustedTotal}}</div>
    </div>
    <div class="dalc-card">
      <div class="dalc-label">Amplified Total</div>
      <div class="dalc-value">{{currency dalcExplanation.amplifiedTotal}}</div>
    </div>
  </div>

  <h3>Model Parameters</h3>
  <div class="dalc-grid">
    <div class="dalc-card">
      <div class="dalc-label">Spectral Radius</div>
      <div class="dalc-value">{{fixed2 dalcExplanation.spectralRadius}}</div>
    </div>
    <div class="dalc-card">
      <div class="dalc-label">Amplification Ratio</div>
      <div class="dalc-value">{{fixed2 dalcExplanation.amplificationRatio}}x</div>
    </div>
    <div class="dalc-card">
      <div class="dalc-label">Shannon Entropy</div>
      <div class="dalc-value">{{fixed2 dalcExplanation.shannonEntropy}}</div>
    </div>
    <div class="dalc-card">
      <div class="dalc-label">Max Entropy</div>
      <div class="dalc-value">{{fixed2 dalcExplanation.maxEntropy}}</div>
    </div>
    <div class="dalc-card">
      <div class="dalc-label">Sanity Capped</div>
      <div class="dalc-value">{{#if dalcExplanation.sanityCapped}}Yes{{else}}No{{/if}}</div>
    </div>
  </div>
</section>

<!-- Asset Criticality Assessment -->
{{#if criticalityDetail}}
<section class="section-page-break">
  <h2>Asset Criticality Assessment</h2>
  <p style="font-size:13px;color:var(--c-text-muted);margin-bottom:16px;">
    Criticality scores are computed per-asset using signal density, anomaly frequency, and regulatory exposure.
    Assets flagged as CDE (Critical Data Element) candidates warrant priority remediation.
  </p>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">
    {{#each criticalityDetail.tierDistribution}}
    <div class="dalc-card" style="text-align:center">
      <div class="dalc-label">{{uppercase @key}}</div>
      <div class="dalc-value">{{this}}</div>
    </div>
    {{/each}}
  </div>

  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">
    <div class="dalc-card">
      <div class="dalc-label">Assets Assessed</div>
      <div class="dalc-value">{{criticalityDetail.totalAssetsAssessed}}</div>
    </div>
    <div class="dalc-card">
      <div class="dalc-label">CDE Candidates</div>
      <div class="dalc-value">{{criticalityDetail.totalCdeCandidates}}</div>
    </div>
    <div class="dalc-card">
      <div class="dalc-label">Avg Criticality Score</div>
      <div class="dalc-value">{{fixed2 criticalityDetail.averageCriticalityScore}}</div>
    </div>
  </div>

  {{#if criticalityDetail.topCriticalAssets.length}}
  <h3 style="font-size:14px;margin:16px 0 8px">Top Critical Assets</h3>
  <table class="findings-table">
    <thead>
      <tr>
        <th>Asset</th>
        <th style="width:80px">Type</th>
        <th style="width:80px">Score</th>
        <th style="width:80px">Tier</th>
        <th style="width:60px">CDE</th>
      </tr>
    </thead>
    <tbody>
      {{#each criticalityDetail.topCriticalAssets}}
      <tr>
        <td style="font-family:'JetBrains Mono',monospace;font-size:11px">{{assetName}}</td>
        <td>{{assetType}}</td>
        <td>{{fixed2 criticalityScore}}</td>
        <td>{{{criticalityBadge criticalityTier}}}</td>
        <td>{{#if cdeCandidate}}<span style="color:#10B981;font-weight:600">Yes</span>{{else}}<span style="color:#6B7280">No</span>{{/if}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  {{/if}}
</section>
{{/if}}

<!-- Remediation Roadmap -->
{{#if remediationActions.length}}
<section class="section-page-break">
  <h2>Remediation Roadmap</h2>
  <p style="font-size:13px;color:var(--c-text-muted);margin-bottom:16px;">
    Actions are grouped by remediation theme, scored by composite priority (severity 40%, DALC share 25%, asset coverage 20%, quick-win 10%, confidence 5%), and sequenced into three execution phases.
  </p>

  {{#each remediationActions}}
  <div style="margin-bottom:16px;border:1px solid var(--c-border);border-radius:8px;overflow:hidden;">
    <div style="padding:12px 16px;background:var(--c-bg-alt);display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--c-border);">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:var(--c-primary);color:#fff;font-weight:700;font-size:12px;">{{priorityRank}}</span>
      <div style="flex:1">
        <strong style="font-size:14px;">{{title}}</strong>
        {{#if quickWin}}<span class="badge" style="background:#D1FAE5;color:#065F46;margin-left:8px">QUICK WIN</span>{{/if}}
      </div>
      <span style="font-size:18px;font-weight:700;color:var(--c-primary)">{{currency estimatedImpactUsd.base}}</span>
    </div>
    <div style="padding:12px 16px;font-size:13px;">
      <p>{{description}}</p>
      <p style="margin-top:8px;color:var(--c-text-muted);font-style:italic">{{rationale}}</p>
      <div style="margin-top:12px;display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;">
        <div><span style="font-size:11px;text-transform:uppercase;color:var(--c-text-muted)">Impact Range</span><br><strong>{{currency estimatedImpactUsd.low}} — {{currency estimatedImpactUsd.high}}</strong></div>
        <div><span style="font-size:11px;text-transform:uppercase;color:var(--c-text-muted)">Effort</span><br><strong>{{#if (eq effortBand "S")}}Small (< 2 wks){{/if}}{{#if (eq effortBand "M")}}Medium (2–6 wks){{/if}}{{#if (eq effortBand "L")}}Large (6+ wks){{/if}}</strong></div>
        <div><span style="font-size:11px;text-transform:uppercase;color:var(--c-text-muted)">Phase</span><br><strong>Phase {{sequenceGroup}}</strong></div>
        <div><span style="font-size:11px;text-transform:uppercase;color:var(--c-text-muted)">Owner</span><br><strong>{{ownerLabel likelyOwnerType}}</strong></div>
        <div><span style="font-size:11px;text-transform:uppercase;color:var(--c-text-muted)">Confidence</span><br><strong>{{confidenceLevel}}</strong></div>
        <div><span style="font-size:11px;text-transform:uppercase;color:var(--c-text-muted)">Findings</span><br><strong>{{relatedFindingCodes.length}} findings &middot; {{affectedAssets}} assets</strong></div>
      </div>
      {{#if blockedByActionIds.length}}
      <div style="margin-top:8px;font-size:11px;color:var(--c-text-muted)">Blocked by: {{#each blockedByActionIds}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}</div>
      {{/if}}
      <div style="margin-top:8px;font-size:11px;color:#9CA3AF">Checks: {{#each relatedFindingCodes}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}</div>
      <div style="margin-top:4px;font-size:11px;color:#9CA3AF">{{explanation}}</div>
    </div>
  </div>
  {{/each}}
</section>
{{/if}}

<!-- Property Maturity -->
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

<!-- Cost Breakdown -->
<section>
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

<!-- Result-Set Methodology Summary -->
{{#if methodologySummary}}
<section class="section-page-break">
  <h2>Result-Set Methodology &amp; Confidence Assessment</h2>
  <p style="font-size:13px;color:var(--c-text-muted);margin-bottom:16px;">
    Deterministic assessment of scan assumptions, coverage gaps, and confidence levels.
    Generated at {{methodologySummary.generatedAt}} (v{{methodologySummary.version}}).
  </p>

  <!-- Overall Confidence -->
  <div style="padding:14px 18px;border-radius:8px;margin-bottom:20px;background:{{#ifEq methodologySummary.overallConfidence 'high'}}#27AE6015{{/ifEq}}{{#ifEq methodologySummary.overallConfidence 'medium'}}#F39C1215{{/ifEq}}{{#ifEq methodologySummary.overallConfidence 'low'}}#E74C3C15{{/ifEq}}{{#ifEq methodologySummary.overallConfidence 'very_low'}}#E74C3C25{{/ifEq}};border:1px solid {{#ifEq methodologySummary.overallConfidence 'high'}}#27AE60{{/ifEq}}{{#ifEq methodologySummary.overallConfidence 'medium'}}#F39C12{{/ifEq}}{{#ifEq methodologySummary.overallConfidence 'low'}}#E74C3C{{/ifEq}}{{#ifEq methodologySummary.overallConfidence 'very_low'}}#E74C3C{{/ifEq}};">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--c-text-muted);">Overall Result Confidence</div>
    <div style="font-size:22px;font-weight:700;text-transform:uppercase;margin:4px 0;">{{methodologySummary.overallConfidence}}</div>
    <div style="font-size:13px;color:var(--c-text);">{{methodologySummary.overallConfidenceRationale}}</div>
  </div>

  <!-- Confidence Breakdown -->
  <h3 style="font-size:14px;margin-bottom:12px;">Confidence by Area</h3>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;">
    {{#each methodologySummary.confidenceAssessments}}
    <div style="padding:12px 14px;background:var(--c-bg-alt);border-radius:6px;border:1px solid var(--c-border);break-inside:avoid;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;">
        <span style="font-size:13px;font-weight:600;text-transform:capitalize;">{{area}}</span>
        <span style="font-size:12px;font-weight:700;padding:2px 8px;border-radius:4px;color:#fff;background:{{#ifEq confidenceLevel 'high'}}#27AE60{{/ifEq}}{{#ifEq confidenceLevel 'medium'}}#F39C12{{/ifEq}}{{#ifEq confidenceLevel 'low'}}#E74C3C{{/ifEq}}{{#ifEq confidenceLevel 'very_low'}}#95A5A6{{/ifEq}};">{{confidenceLevel}}</span>
      </div>
      <p style="font-size:12px;color:var(--c-text-muted);margin:6px 0 0;">{{rationale}}</p>
      <div style="margin-top:6px;font-size:11px;color:var(--c-text-muted);">
        <strong>Drivers:</strong> {{#each keyDrivers}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}
      </div>
    </div>
    {{/each}}
  </div>

  <!-- Assumptions Table -->
  <h3 style="font-size:14px;margin-bottom:8px;">System Assumptions ({{methodologySummary.assumptions.length}})</h3>
  <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:24px;">
    <thead>
      <tr style="border-bottom:2px solid var(--c-border);text-align:left;">
        <th style="padding:6px 8px;">Category</th>
        <th style="padding:6px 8px;">Assumption</th>
        <th style="padding:6px 8px;">Source</th>
        <th style="padding:6px 8px;">Materiality</th>
        <th style="padding:6px 8px;">Current Value</th>
      </tr>
    </thead>
    <tbody>
      {{#each methodologySummary.assumptions}}
      <tr style="border-bottom:1px solid var(--c-border);">
        <td style="padding:6px 8px;font-size:11px;">{{category}}</td>
        <td style="padding:6px 8px;">{{assumption}}</td>
        <td style="padding:6px 8px;">
          <span style="font-size:10px;padding:1px 6px;border-radius:3px;background:{{#ifEq sourceType 'empirical'}}#27AE60{{/ifEq}}{{#ifEq sourceType 'expert_estimated'}}#F39C12{{/ifEq}}{{#ifEq sourceType 'client_configured'}}#3498DB{{/ifEq}}{{#ifEq sourceType 'inferred'}}#9B59B6{{/ifEq}}{{#ifEq sourceType 'system_default'}}#95A5A6{{/ifEq}};color:#fff;">{{sourceType}}</span>
        </td>
        <td style="padding:6px 8px;">
          <span style="font-size:10px;padding:1px 6px;border-radius:3px;background:{{#ifEq materialityLevel 'high'}}#E74C3C{{/ifEq}}{{#ifEq materialityLevel 'medium'}}#F39C12{{/ifEq}}{{#ifEq materialityLevel 'low'}}#95A5A6{{/ifEq}};color:#fff;">{{materialityLevel}}</span>
        </td>
        <td style="padding:6px 8px;font-size:11px;color:var(--c-text-muted);">{{currentValue}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>

  <!-- Coverage Gaps -->
  {{#if methodologySummary.coverageGaps.length}}
  <h3 style="font-size:14px;margin-bottom:8px;">Coverage Gaps ({{methodologySummary.coverageGaps.length}})</h3>
  {{#each methodologySummary.coverageGaps}}
  <div style="padding:10px 14px;margin-bottom:8px;border-left:3px solid #F39C12;background:#F39C1208;border-radius:0 6px 6px 0;break-inside:avoid;">
    <div style="font-size:12px;font-weight:600;">{{description}}</div>
    <div style="font-size:11px;color:var(--c-text-muted);margin-top:2px;"><strong>Impact:</strong> {{impact}}</div>
    <div style="font-size:11px;color:var(--c-text-muted);"><strong>Mitigation:</strong> {{mitigationHint}}</div>
  </div>
  {{/each}}
  {{/if}}

  <!-- Scan Coverage -->
  <h3 style="font-size:14px;margin:20px 0 8px;">Scan Coverage</h3>
  <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:10px;margin-bottom:16px;">
    <div style="padding:10px;background:var(--c-bg-alt);border-radius:6px;text-align:center;">
      <div style="font-size:20px;font-weight:700;">{{methodologySummary.scanCoverage.totalTables}}</div>
      <div style="font-size:11px;color:var(--c-text-muted);">Tables</div>
    </div>
    <div style="padding:10px;background:var(--c-bg-alt);border-radius:6px;text-align:center;">
      <div style="font-size:20px;font-weight:700;">{{methodologySummary.scanCoverage.totalColumns}}</div>
      <div style="font-size:11px;color:var(--c-text-muted);">Columns</div>
    </div>
    <div style="padding:10px;background:var(--c-bg-alt);border-radius:6px;text-align:center;">
      <div style="font-size:20px;font-weight:700;">{{methodologySummary.scanCoverage.checksRun}}</div>
      <div style="font-size:11px;color:var(--c-text-muted);">Checks Run</div>
    </div>
    <div style="padding:10px;background:var(--c-bg-alt);border-radius:6px;text-align:center;">
      <div style="font-size:20px;font-weight:700;">{{methodologySummary.scanCoverage.propertiesCovered.length}}</div>
      <div style="font-size:11px;color:var(--c-text-muted);">Properties</div>
    </div>
  </div>
</section>
{{/if}}

<!-- Methodology & Assumptions Register -->
<section class="section-page-break">
  <h2>Methodology &amp; Assumptions Register</h2>
  <p style="font-size:13px;color:var(--c-text-muted);margin-bottom:16px;">
    Each check in the DALC Scanner uses a documented detection technique with stated assumptions and limitations.
    This register enables auditors and data architects to evaluate the credibility of each finding.
  </p>

  {{#each methodologyRegister}}
  <div style="margin-bottom:20px;border:1px solid var(--c-border);border-radius:8px;padding:16px;break-inside:avoid;">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
      <h3 style="margin:0;font-size:14px;">{{checkId}} — {{checkName}}</h3>
      <span style="font-size:11px;padding:2px 8px;border-radius:4px;background:{{#ifEq technique 'deterministic'}}#27AE60{{/ifEq}}{{#ifEq technique 'heuristic'}}#F39C12{{/ifEq}}{{#ifEq technique 'statistical'}}#3498DB{{/ifEq}};color:#fff;">
        {{technique}}
      </span>
    </div>
    <div style="font-size:11px;color:var(--c-text-muted);margin-bottom:8px;">
      P{{property}} — {{propertyName}}
    </div>
    <p style="font-size:12px;margin:0 0 10px;">{{methodology}}</p>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:12px;">
      <div>
        <strong style="font-size:11px;text-transform:uppercase;color:var(--c-text-muted);">Assumptions</strong>
        <ul style="margin:4px 0 0;padding-left:16px;">
          {{#each assumptions}}<li>{{this}}</li>{{/each}}
        </ul>
      </div>
      <div>
        <strong style="font-size:11px;text-transform:uppercase;color:var(--c-text-muted);">Limitations</strong>
        <ul style="margin:4px 0 0;padding-left:16px;">
          {{#each limitations}}<li>{{this}}</li>{{/each}}
        </ul>
      </div>
    </div>

    <div style="margin-top:8px;font-size:12px;">
      <strong style="font-size:11px;text-transform:uppercase;color:var(--c-text-muted);">Data Inputs</strong>
      <ul style="margin:4px 0 0;padding-left:16px;">
        {{#each dataInputs}}<li>{{this}}</li>{{/each}}
      </ul>
    </div>

    {{#if references}}
    <div style="margin-top:8px;font-size:11px;color:var(--c-text-muted);">
      <strong>References:</strong> {{#each references}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}
    </div>
    {{/if}}
  </div>
  {{/each}}
</section>

</div>

<!-- Footer -->
<div class="footer">
  <div class="container">
    {{#if consultantName}}{{consultantName}}{{#if consultantTagline}} — {{consultantTagline}}{{/if}} &middot; {{/if}}DALC Scanner &middot; {{engineVersion}} &middot; Technical Appendix generated {{generatedAt}}<br>
    Confidential — prepared for {{organisationName}}
  </div>
</div>

</body>
</html>`;
