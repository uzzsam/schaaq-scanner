/**
 * Executive Board Pack — HTML Template
 *
 * Concise, decision-oriented report for CFO / board audience.
 * ~8-12 pages when printed. No full findings table — only top risks
 * and remediation priorities.
 *
 * Self-contained HTML, no external URLs, print-friendly CSS.
 */

export const EXECUTIVE_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Executive Board Pack — {{organisationName}}</title>
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

/* Cover / Header */
.header {
  background: linear-gradient(135deg, var(--c-primary) 0%, var(--c-accent2) 100%);
  color: #fff;
  padding: 48px 0 40px;
  text-align: center;
}
.header h1 { font-size: 32px; font-weight: 700; margin-bottom: 4px; }
.header .subtitle { font-size: 16px; opacity: 0.85; margin-bottom: 8px; }
.header .meta { font-size: 12px; opacity: 0.7; }
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

/* Severity Summary */
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

/* Risk Cards */
.risk-cards { display: grid; gap: 16px; }
.risk-card {
  border: 1px solid var(--c-border);
  border-radius: 8px;
  padding: 20px;
  background: var(--c-bg-alt);
}
.risk-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}
.risk-card-header h3 { margin-bottom: 0; font-size: 15px; }
.risk-card-body { font-size: 13px; color: var(--c-text-muted); line-height: 1.5; }
.risk-card-meta { margin-top: 8px; font-size: 11px; color: var(--c-text-muted); }

/* Remediation Table */
.remediation-table { width: 100%; border-collapse: collapse; margin-top: 12px; }
.remediation-table th {
  background: var(--c-primary);
  color: #fff;
  padding: 10px 12px;
  text-align: left;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.remediation-table td { padding: 10px 12px; border-bottom: 1px solid var(--c-border); font-size: 13px; vertical-align: top; }
.remediation-table tr:nth-child(even) { background: var(--c-bg-alt); }

.effort-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
}
.effort-quick { background: #D1FAE5; color: #065F46; }
.effort-medium { background: #FEF3C7; color: #92400E; }
.effort-major { background: #FEE2E2; color: #991B1B; }

/* Radar chart layout */
.radar-layout {
  display: flex;
  gap: 40px;
  align-items: flex-start;
}
.radar-chart-wrap { flex: 0 0 auto; }
.radar-scores-wrap { flex: 1; }

/* Method limits */
.method-limits { margin-top: 8px; }
.method-limits li {
  font-size: 12px;
  color: var(--c-text-muted);
  margin-bottom: 6px;
  line-height: 1.5;
}

/* Footer */
.footer {
  padding: 24px 0;
  text-align: center;
  font-size: 12px;
  color: var(--c-text-muted);
  border-top: 1px solid var(--c-border);
}

@media print {
  @page { size: A4; margin: 15mm; }
  body { font-size: 11px; color: #1F2937; background: white; }
  .container { max-width: 100%; padding: 0; }
  section { padding: 16px 0; break-inside: avoid; page-break-inside: avoid; }
  .section-page-break { break-before: page; page-break-before: always; }
  * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .header { padding: 24px 0 16px; }
  .metrics { grid-template-columns: repeat(4, 1fr); }
  .metric-card { padding: 10px; }
  .metric-card .value { font-size: 18px; }
  .radar-layout { gap: 20px; }
  .radar-chart-wrap svg { max-width: 280px; }
  .remediation-table { font-size: 10px; }
  .remediation-table th, .remediation-table td { padding: 5px 6px; }
}
</style>
</head>
<body>

<!-- Cover -->
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
    <div class="subtitle">
      {{#if reportSubtitle}}{{reportSubtitle}}{{else}}{{organisationName}} — {{uppercase sector}} Sector{{/if}}
    </div>
    <div class="meta">
      {{generatedAt}} &middot; {{totalTables}} tables analysed &middot; {{coverageSummary}}{{#if databaseLabel}} &middot; {{databaseLabel}}{{/if}}
    </div>
    <div class="report-type">Executive Board Pack</div>
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
    <div class="metric-card success">
      <div class="label">{{l.potentialSaving}}</div>
      <div class="value">{{currency annualSaving}}</div>
      <div class="unit">{{l.withCanonical}}</div>
    </div>
    <div class="metric-card">
      <div class="label">{{l.overallMaturity}}</div>
      <div class="value">{{fixed1 overallMaturity}}<span style="font-size:14px">/4</span></div>
    </div>
    <div class="metric-card">
      <div class="label">Payback Period</div>
      <div class="value">{{fixed1 paybackMonths}}</div>
      <div class="unit">months</div>
    </div>
  </div>

  <div class="severity-summary">
    <div class="count-badge"><div class="dot" style="background:var(--c-critical)"></div>{{criticalCount}} Critical</div>
    <div class="count-badge"><div class="dot" style="background:var(--c-major)"></div>{{majorCount}} Major</div>
    <div class="count-badge"><div class="dot" style="background:var(--c-minor)"></div>{{minorCount}} Minor</div>
    <div class="count-badge"><div class="dot" style="background:var(--c-info)"></div>{{infoCount}} Info</div>
  </div>
</section>

<!-- Trend Summary (if historical data available) -->
{{#if trendSummary}}
<section class="section-page-break">
  <h2>Trend Analysis</h2>
  <p style="font-size:13px;color:var(--c-text-muted);margin-bottom:16px;">
    Based on {{trendSummary.windowSize}} consecutive scans. Compares latest scan to immediately previous.
  </p>

  <div class="metrics-grid">
    <div class="metric-card">
      <div class="label">Overall Direction</div>
      <div class="value" style="color:{{trendSummary.directionColor}}; font-size:20px;">{{trendSummary.directionLabel}}</div>
    </div>
    <div class="metric-card">
      <div class="label">DALC Cost Trend</div>
      <div class="value" style="color:{{trendSummary.dalcDirectionColor}}; font-size:20px;">{{trendSummary.dalcDirectionLabel}}</div>
      {{#if trendSummary.dalcPercentChange}}
      <div class="unit">{{fixed1 trendSummary.dalcPercentChange}}% change</div>
      {{/if}}
    </div>
    <div class="metric-card">
      <div class="label">New Findings</div>
      <div class="value" style="color:var(--c-critical)">{{trendSummary.deltaCounts.new}}</div>
    </div>
    <div class="metric-card">
      <div class="label">Resolved</div>
      <div class="value" style="color:var(--c-success)">{{trendSummary.deltaCounts.resolved}}</div>
    </div>
  </div>

  <div class="severity-summary" style="margin-top:12px;">
    <div class="count-badge"><div class="dot" style="background:var(--c-critical)"></div>{{trendSummary.deltaCounts.worsened}} Worsened</div>
    <div class="count-badge"><div class="dot" style="background:var(--c-success)"></div>{{trendSummary.deltaCounts.improved}} Improved</div>
    <div class="count-badge"><div class="dot" style="background:var(--c-info)"></div>{{trendSummary.deltaCounts.unchanged}} Unchanged</div>
  </div>
</section>
{{/if}}

<!-- Benchmark Comparison -->
{{#if benchmarkSummary}}
<section class="section-page-break">
  <h2>Benchmark Comparison</h2>
  <p style="font-size:12px;color:#6B7280;margin-bottom:12px;">
    vs. {{benchmarkSummary.packName}} benchmark (v{{benchmarkSummary.packVersion}})
  </p>

  <div class="metric-row">
    <div class="metric-card" style="border-top:3px solid {{benchmarkPositionColor benchmarkSummary.overallPosition}}">
      <div class="label">Overall Position</div>
      <div class="value" style="color:{{benchmarkPositionColor benchmarkSummary.overallPosition}};font-size:18px;">
        {{benchmarkPositionLabel benchmarkSummary.overallPosition}}
      </div>
    </div>
    <div class="metric-card">
      <div class="label">DALC vs Range</div>
      <div class="value" style="color:{{benchmarkPositionColor benchmarkSummary.dalcComparison.position}};font-size:18px;">
        {{benchmarkPositionLabel benchmarkSummary.dalcComparison.position}}
      </div>
      {{#if benchmarkSummary.dalcComparison.percentFromRange}}
      <div class="unit">{{benchmarkSummary.dalcComparison.percentFromRange}}% from range</div>
      {{/if}}
    </div>
    <div class="metric-card">
      <div class="label">Findings vs Range</div>
      <div class="value" style="color:{{benchmarkPositionColor benchmarkSummary.totalFindingsComparison.position}};font-size:18px;">
        {{benchmarkPositionLabel benchmarkSummary.totalFindingsComparison.position}}
      </div>
    </div>
    <div class="metric-card">
      <div class="label">High-Severity vs Range</div>
      <div class="value" style="color:{{benchmarkPositionColor benchmarkSummary.highSeverityComparison.position}};font-size:18px;">
        {{benchmarkPositionLabel benchmarkSummary.highSeverityComparison.position}}
      </div>
    </div>
  </div>

  {{#if benchmarkSummary.keyMessages.length}}
  <div style="margin-top:12px;">
    {{#each benchmarkSummary.keyMessages}}
    <div class="summary-note">{{this}}</div>
    {{/each}}
  </div>
  {{/if}}
</section>
{{/if}}

<!-- Economic Blast Radius -->
{{#if blastRadiusSummary}}
<section class="section-page-break">
  <h2>Economic Blast Radius</h2>
  <div class="summary-note" style="margin-bottom:16px;">
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
</section>
{{/if}}

<!-- Top Business Risks -->
{{#if topRisks.length}}
<section class="section-page-break">
  <h2>Top Business Risks</h2>
  <div class="risk-cards">
    {{#each topRisks}}
    <div class="risk-card" style="border-left: 4px solid {{severityColor}};">
      <div class="risk-card-header">
        {{{severityBadge severity}}}
        <h3>{{title}}</h3>
      </div>
      <div class="risk-card-body">
        {{#if whyItMatters}}{{whyItMatters}}{{else}}{{description}}{{/if}}
      </div>
      <div class="risk-card-meta">
        P{{property}} &middot; {{affectedObjects}}/{{totalObjects}} objects affected ({{ratioPercent}}%)
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

<!-- Property Health -->
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
          <div class="bar-label">{{name}}</div>
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

<!-- Asset Criticality -->
{{#if criticalitySummary}}
<section class="section-page-break">
  <h2>Asset Criticality</h2>
  <p style="color:#aaa;font-size:12px;margin-bottom:16px">
    {{criticalitySummary.totalAssetsAssessed}} assets assessed &middot;
    {{criticalitySummary.totalCdeCandidates}} Critical Data Element candidates &middot;
    Average criticality score: {{fixed1 criticalitySummary.averageCriticalityScore}}/1.0
  </p>

  <div style="display:flex;gap:12px;margin-bottom:20px">
    {{#each criticalitySummary.tierDistribution}}
    <div class="kpi-box" style="flex:1;text-align:center">
      <div class="kpi-value">{{this}}</div>
      <div class="kpi-label">{{uppercase @key}}</div>
    </div>
    {{/each}}
  </div>

  {{#if criticalitySummary.topCriticalAssets.length}}
  <table>
    <thead>
      <tr>
        <th>Asset</th>
        <th style="width:100px">Tier</th>
        <th style="width:60px">CDE</th>
      </tr>
    </thead>
    <tbody>
      {{#each criticalitySummary.topCriticalAssets}}
      <tr>
        <td style="font-family:'JetBrains Mono',monospace;font-size:11px">{{assetName}}</td>
        <td>{{{criticalityBadge criticalityTier}}}</td>
        <td>{{#if cdeCandidate}}<span style="color:#10B981">Yes</span>{{else}}<span style="color:#6B7280">No</span>{{/if}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  {{/if}}
</section>
{{/if}}

<!-- 90-Day Remediation Priorities -->
{{#if remediationPriorities.length}}
<section class="section-page-break">
  <h2>90-Day Remediation Priorities</h2>
  <table class="remediation-table">
    <thead>
      <tr>
        <th style="width:30px">#</th>
        <th>Action</th>
        <th style="width:70px">Severity</th>
        <th style="width:100px">Property</th>
        <th style="width:80px">Effort</th>
        <th style="width:60px">Weeks</th>
        <th style="width:130px">Sequencing</th>
      </tr>
    </thead>
    <tbody>
      {{#each remediationPriorities}}
      <tr>
        <td><strong>{{rank}}</strong></td>
        <td>
          <strong>{{findingTitle}}</strong>
          <div style="margin-top:4px;font-size:12px;color:#6B7280;">{{actionText}}</div>
        </td>
        <td>{{{severityBadge severity}}}</td>
        <td><small>P{{property}}</small> {{propertyName}}</td>
        <td>
          {{#if (eq effortBand "Quick Win")}}<span class="effort-badge effort-quick">Quick Win</span>{{/if}}
          {{#if (eq effortBand "Medium")}}<span class="effort-badge effort-medium">Medium</span>{{/if}}
          {{#if (eq effortBand "Major")}}<span class="effort-badge effort-major">Major</span>{{/if}}
        </td>
        <td>{{estimatedWeeks}}</td>
        <td>{{#if sequencingNote}}<em style="font-size:11px;color:#6B7280;">{{sequencingNote}}</em>{{else}}—{{/if}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
</section>
{{/if}}

<!-- Remediation Roadmap (Grouped Actions) -->
{{#if remediationActions.length}}
<section class="section-page-break">
  <h2>Remediation Roadmap — Top Priority Actions</h2>
  <table class="remediation-table">
    <thead>
      <tr>
        <th style="width:30px">#</th>
        <th>Action</th>
        <th style="width:80px">Est. Impact</th>
        <th style="width:70px">Effort</th>
        <th style="width:70px">Phase</th>
        <th style="width:90px">Owner</th>
      </tr>
    </thead>
    <tbody>
      {{#each remediationActions}}
      <tr>
        <td><strong>{{priorityRank}}</strong></td>
        <td>
          <strong>{{title}}</strong>
          {{#if quickWin}}<span class="effort-badge effort-quick" style="margin-left:6px">Quick Win</span>{{/if}}
          <div style="margin-top:4px;font-size:12px;color:#6B7280;">{{rationale}}</div>
          <div style="margin-top:2px;font-size:11px;color:#9CA3AF;">{{relatedFindingCodes.length}} findings &middot; {{affectedAssets}} assets</div>
        </td>
        <td style="font-weight:600">{{currency estimatedImpactUsd.base}}</td>
        <td>
          {{#if (eq effortBand "S")}}<span class="effort-badge effort-quick">Small</span>{{/if}}
          {{#if (eq effortBand "M")}}<span class="effort-badge effort-medium">Medium</span>{{/if}}
          {{#if (eq effortBand "L")}}<span class="effort-badge effort-major">Large</span>{{/if}}
        </td>
        <td>Phase {{sequenceGroup}}</td>
        <td style="font-size:12px">{{ownerLabel likelyOwnerType}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
</section>
{{/if}}

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
  <div class="metrics" style="margin-top:16px;">
    <div class="metric-card success">
      <div class="label">{{l.fiveYearSaving}}</div>
      <div class="value">{{currency fiveYearCumulativeSaving}}</div>
    </div>
    <div class="metric-card">
      <div class="label">{{l.canonicalInvestment}}</div>
      <div class="value">{{currency canonicalInvestment}}</div>
    </div>
  </div>
</section>

<!-- Methodology & Confidence -->
{{#if methodologySummary}}
<section>
  <h2>Methodology &amp; Confidence</h2>
  <div style="display:flex;gap:16px;margin-bottom:16px;">
    <div style="flex:1;padding:12px 16px;border-radius:6px;background:{{#ifEq methodologySummary.overallConfidence 'high'}}#27AE6020{{/ifEq}}{{#ifEq methodologySummary.overallConfidence 'medium'}}#F39C1220{{/ifEq}}{{#ifEq methodologySummary.overallConfidence 'low'}}#E74C3C20{{/ifEq}}{{#ifEq methodologySummary.overallConfidence 'very_low'}}#E74C3C30{{/ifEq}};border:1px solid {{#ifEq methodologySummary.overallConfidence 'high'}}#27AE60{{/ifEq}}{{#ifEq methodologySummary.overallConfidence 'medium'}}#F39C12{{/ifEq}}{{#ifEq methodologySummary.overallConfidence 'low'}}#E74C3C{{/ifEq}}{{#ifEq methodologySummary.overallConfidence 'very_low'}}#E74C3C{{/ifEq}};">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--c-text-muted);margin-bottom:4px;">Overall Confidence</div>
      <div style="font-size:20px;font-weight:700;text-transform:uppercase;">{{methodologySummary.overallConfidence}}</div>
      <div style="font-size:12px;color:var(--c-text-muted);margin-top:4px;">{{methodologySummary.overallConfidenceRationale}}</div>
    </div>
    <div style="flex:1;display:flex;gap:8px;">
      {{#each methodologySummary.confidenceAssessments}}
      <div style="flex:1;padding:10px 12px;background:var(--c-bg-alt);border-radius:6px;border:1px solid var(--c-border);">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:var(--c-text-muted);">{{area}}</div>
        <div style="font-size:16px;font-weight:600;margin-top:2px;color:{{#ifEq confidenceLevel 'high'}}#27AE60{{/ifEq}}{{#ifEq confidenceLevel 'medium'}}#F39C12{{/ifEq}}{{#ifEq confidenceLevel 'low'}}#E74C3C{{/ifEq}}{{#ifEq confidenceLevel 'very_low'}}#E74C3C{{/ifEq}};">{{confidenceLevel}}</div>
      </div>
      {{/each}}
    </div>
  </div>
  {{#if methodologySummary.coverageGaps.length}}
  <p style="font-size:12px;color:var(--c-text-muted);">{{methodologySummary.coverageGaps.length}} coverage gap(s) identified — see Technical Appendix for details.</p>
  {{/if}}
</section>
{{/if}}

<!-- Method Limits -->
<section>
  <h2>Assessment Scope &amp; Limitations</h2>
  <ul class="method-limits">
    {{#each methodLimits}}
    <li>{{this}}</li>
    {{/each}}
  </ul>

  <h3 style="margin-top:20px;font-size:14px;">Detection Methodology Summary</h3>
  <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px;">
    <thead>
      <tr style="border-bottom:2px solid var(--c-border);text-align:left;">
        <th style="padding:6px 8px;">Check</th>
        <th style="padding:6px 8px;">Property</th>
        <th style="padding:6px 8px;">Technique</th>
        <th style="padding:6px 8px;">Key Assumptions</th>
      </tr>
    </thead>
    <tbody>
      {{#each methodologyRegister}}
      <tr style="border-bottom:1px solid var(--c-border);">
        <td style="padding:6px 8px;font-size:11px;">{{checkName}}</td>
        <td style="padding:6px 8px;font-size:11px;">P{{property}}</td>
        <td style="padding:6px 8px;">
          <span style="font-size:10px;padding:1px 6px;border-radius:3px;background:{{#ifEq technique 'deterministic'}}#27AE60{{/ifEq}}{{#ifEq technique 'heuristic'}}#F39C12{{/ifEq}}{{#ifEq technique 'statistical'}}#3498DB{{/ifEq}};color:#fff;">
            {{technique}}
          </span>
        </td>
        <td style="padding:6px 8px;font-size:11px;color:var(--c-text-muted);">{{#each assumptions}}{{this}}{{#unless @last}}; {{/unless}}{{/each}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>
  <p style="font-size:11px;color:var(--c-text-muted);margin-top:8px;">
    Full methodology cards with limitations and data inputs are available in the Technical Appendix.
  </p>
</section>

</div>

<!-- Footer -->
<div class="footer">
  <div class="container">
    {{#if consultantName}}{{consultantName}}{{#if consultantTagline}} — {{consultantTagline}}{{/if}} &middot; {{/if}}DALC Scanner &middot; {{engineVersion}} &middot; Executive Board Pack generated {{generatedAt}}<br>
    Confidential — prepared for {{organisationName}}
  </div>
</div>

</body>
</html>`;
