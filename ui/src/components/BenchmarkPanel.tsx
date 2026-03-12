/**
 * BenchmarkPanel — Comparative context display.
 *
 * Shows:
 *  - Overall position indicator (below / within / above range)
 *  - Key metric comparisons (DALC, total findings, high-severity)
 *  - Property-level position indicators
 *  - Baseline comparison direction arrows
 *  - Key messages (max 3)
 */

import { useState } from 'react';
import type {
  BenchmarkSummary,
  BenchmarkPosition,
  PropertyBenchmarkPosition,
  BenchmarkComparisonRecord,
} from '../api/client';
import {
  BENCHMARK_POSITION_COLORS,
  BENCHMARK_POSITION_LABELS,
  PROPERTY_POSITION_COLORS,
  PROPERTY_POSITION_LABELS,
} from '../api/client';
import { formatCost, PROPERTY_NAMES } from '../utils';
import { Card } from './Shared';

// ---------------------------------------------------------------------------
// Position helpers
// ---------------------------------------------------------------------------

function positionIcon(p: BenchmarkPosition): string {
  switch (p) {
    case 'below_range': return '\u2193';   // down arrow — better
    case 'within_range': return '\u2192';  // right arrow — on track
    case 'above_range': return '\u2191';   // up arrow — worse
    case 'unknown': return '\u2014';       // em dash
  }
}

function propertyPositionIcon(p: PropertyBenchmarkPosition): string {
  switch (p) {
    case 'better_than_range': return '\u2193';
    case 'near_range': return '\u2192';
    case 'worse_than_range': return '\u2191';
    case 'unknown': return '\u2014';
  }
}

// ---------------------------------------------------------------------------
// Metric row
// ---------------------------------------------------------------------------

function MetricRow({ record }: { record: BenchmarkComparisonRecord }) {
  const color = BENCHMARK_POSITION_COLORS[record.position];
  const pct = record.percentFromRange;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      <span style={{ color, fontSize: 14, fontWeight: 600, width: 18, textAlign: 'center' }}>
        {positionIcon(record.position)}
      </span>
      <span style={{ flex: 1, fontSize: 12, color: '#D1D5DB' }}>
        {record.metric.label}
      </span>
      <span style={{ fontSize: 12, color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace" }}>
        {record.metric.unit === 'USD'
          ? formatCost(record.actualValue)
          : record.metric.unit === 'ratio'
            ? `${(record.actualValue * 100).toFixed(0)}%`
            : record.actualValue}
      </span>
      <span style={{ fontSize: 11, color, minWidth: 60, textAlign: 'right' }}>
        {pct !== null ? `${pct > 0 ? '+' : ''}${pct}%` : BENCHMARK_POSITION_LABELS[record.position]}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main BenchmarkPanel
// ---------------------------------------------------------------------------

interface BenchmarkPanelProps {
  benchmark: BenchmarkSummary;
}

export function BenchmarkPanel({ benchmark }: BenchmarkPanelProps) {
  const [showProperties, setShowProperties] = useState(false);
  const overallColor = BENCHMARK_POSITION_COLORS[benchmark.overallPosition];

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Overall position card */}
      <Card style={{ marginBottom: 12, overflow: 'hidden' }} data-testid="benchmark-overall-card">
        <div style={{
          padding: '10px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ fontSize: 12 }}>📊</span>
          <span className="label-text">Benchmark Comparison</span>
          <span style={{
            marginLeft: 'auto',
            fontSize: 11, fontWeight: 600, color: overallColor,
            padding: '2px 8px', borderRadius: 4,
            background: `${overallColor}18`,
          }}>
            {BENCHMARK_POSITION_LABELS[benchmark.overallPosition]}
          </span>
        </div>

        {/* Pack info */}
        <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ fontSize: 11, color: '#6B7280' }}>
            vs. {benchmark.packName} benchmark (v{benchmark.packVersion})
          </div>
        </div>

        {/* Key messages */}
        <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          {benchmark.keyMessages.map((msg, i) => (
            <div key={i} style={{ fontSize: 12, color: '#D1D5DB', marginBottom: 4 }}>
              {msg}
            </div>
          ))}
        </div>

        {/* Core metric rows */}
        <div style={{ padding: '4px 16px 8px' }}>
          <MetricRow record={benchmark.dalcComparison} />
          <MetricRow record={benchmark.totalFindingsComparison} />
          <MetricRow record={benchmark.highSeverityComparison} />
          <MetricRow record={benchmark.highSeverityDensityComparison} />
        </div>
      </Card>

      {/* Property-level comparison (collapsible) */}
      {benchmark.propertyComparisons.length > 0 && (
        <Card style={{ overflow: 'hidden' }} data-testid="benchmark-property-card">
          <div
            style={{
              padding: '8px 16px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              borderBottom: showProperties ? '1px solid rgba(255,255,255,0.06)' : 'none',
            }}
            onClick={() => setShowProperties(!showProperties)}
          >
            <span style={{ fontSize: 10, color: '#6B7280', transition: 'transform 0.15s', transform: showProperties ? 'rotate(90deg)' : 'none' }}>
              ▶
            </span>
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>Property Breakdown</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#4B5563' }}>
              {benchmark.propertyComparisons.length} properties
            </span>
          </div>

          {showProperties && (
            <div style={{ padding: '4px 16px 8px' }}>
              {benchmark.propertyComparisons.map(pc => {
                const color = PROPERTY_POSITION_COLORS[pc.position];
                return (
                  <div key={pc.property} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.03)',
                  }}>
                    <span style={{ color, fontSize: 13, fontWeight: 600, width: 18, textAlign: 'center' }}>
                      {propertyPositionIcon(pc.position)}
                    </span>
                    <span style={{ flex: 1, fontSize: 11, color: '#D1D5DB' }}>
                      {PROPERTY_NAMES[pc.property] ?? pc.propertyName}
                    </span>
                    <span style={{ fontSize: 11, color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace" }}>
                      {pc.actualFindingCount} / {pc.benchmarkLow}–{pc.benchmarkHigh}
                    </span>
                    <span style={{ fontSize: 10, color, minWidth: 50, textAlign: 'right' }}>
                      {PROPERTY_POSITION_LABELS[pc.position]}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Baseline direction (if available) */}
      {benchmark.baselineComparison?.baselineAvailable && (
        <Card style={{ marginTop: 12, overflow: 'hidden' }} data-testid="benchmark-baseline-card">
          <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#6B7280' }}>vs. Project Baseline</span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
              <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                DALC: <span style={{ fontWeight: 600 }}>{benchmark.baselineComparison.dalcDirectionLabel}</span>
                {benchmark.baselineComparison.dalcPercentChange !== null && (
                  <span style={{ color: '#6B7280' }}> ({benchmark.baselineComparison.dalcPercentChange > 0 ? '+' : ''}{benchmark.baselineComparison.dalcPercentChange}%)</span>
                )}
              </span>
              <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                Findings: <span style={{ fontWeight: 600 }}>{benchmark.baselineComparison.findingCountDirectionLabel}</span>
              </span>
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
