/**
 * TrendPanel — Historical trend & regression detection display.
 *
 * Shows:
 *  - Overall direction indicator
 *  - DALC cost trend sparkline (text-based)
 *  - Finding delta counts (new / resolved / worsened / improved)
 *  - Top regressions & improvements
 *  - Property trend direction arrows
 */

import { useState } from 'react';
import type {
  HistoricalComparisonWindow,
  TrendDirection,
  FindingDeltaRecord,
  PropertyTrendRecord,
} from '../api/client';
import { formatCost, PROPERTY_NAMES, SEVERITY_CONFIG, type SeverityKey } from '../utils';
import { Card } from './Shared';

// ---------------------------------------------------------------------------
// Direction helpers
// ---------------------------------------------------------------------------

function directionIcon(d: TrendDirection): string {
  switch (d) {
    case 'improving': return '\u2193'; // down arrow — less findings/cost = good
    case 'worsening': return '\u2191'; // up arrow — more = bad
    case 'stable': return '\u2192';    // right arrow
    case 'insufficient_data': return '\u2014'; // em dash
  }
}

function directionColor(d: TrendDirection): string {
  switch (d) {
    case 'improving': return '#10B981';
    case 'worsening': return '#EF4444';
    case 'stable': return '#6B7280';
    case 'insufficient_data': return '#4B5563';
  }
}

function directionLabel(d: TrendDirection): string {
  switch (d) {
    case 'improving': return 'Improving';
    case 'worsening': return 'Worsening';
    case 'stable': return 'Stable';
    case 'insufficient_data': return 'Insufficient data';
  }
}

// ---------------------------------------------------------------------------
// Main TrendPanel
// ---------------------------------------------------------------------------

interface TrendPanelProps {
  trend: HistoricalComparisonWindow;
}

export function TrendPanel({ trend }: TrendPanelProps) {
  const [showDeltas, setShowDeltas] = useState(false);
  const regression = trend.regressionVsPrevious;

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Overall direction */}
      {regression && (
        <Card style={{ marginBottom: 12, overflow: 'hidden' }} data-testid="trend-direction-card">
          <div style={{
            padding: '10px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span style={{ fontSize: 12 }}>📈</span>
            <span className="label-text">Trend Analysis</span>
            <span style={{
              marginLeft: 'auto',
              fontSize: 10,
              color: '#6B7280',
            }}>
              {trend.windowSize} scan{trend.windowSize !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Direction & DALC summary */}
          <div style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{
                fontSize: 20,
                fontWeight: 700,
                color: directionColor(regression.overallDirection),
              }}>
                {directionIcon(regression.overallDirection)}
              </span>
              <div>
                <div style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: directionColor(regression.overallDirection),
                }}>
                  {directionLabel(regression.overallDirection)}
                </div>
                <div style={{ fontSize: 10, color: '#6B7280' }}>
                  vs previous scan ({regression.baselineLabel})
                </div>
              </div>
            </div>

            {/* Finding delta summary */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 8,
              marginBottom: 12,
            }}>
              <DeltaCountBadge label="New" count={regression.counts.new} color="#EF4444" />
              <DeltaCountBadge label="Resolved" count={regression.counts.resolved} color="#10B981" />
              <DeltaCountBadge label="Worsened" count={regression.counts.worsened} color="#F97316" />
              <DeltaCountBadge label="Improved" count={regression.counts.improved} color="#3B82F6" />
            </div>

            {/* DALC change */}
            {regression.dalcDelta.percentChange != null && (
              <div style={{
                padding: '8px 12px',
                background: 'rgba(255,255,255,0.02)',
                borderRadius: 6,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span style={{ color: '#9CA3AF', fontSize: 11 }}>DALC cost change</span>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12,
                  fontWeight: 600,
                  color: regression.dalcDelta.changeBaseUsd > 0 ? '#EF4444'
                    : regression.dalcDelta.changeBaseUsd < 0 ? '#10B981' : '#6B7280',
                }}>
                  {regression.dalcDelta.changeBaseUsd > 0 ? '+' : ''}
                  {formatCost(regression.dalcDelta.changeBaseUsd)}
                  {' ('}
                  {regression.dalcDelta.percentChange > 0 ? '+' : ''}
                  {regression.dalcDelta.percentChange.toFixed(1)}%
                  {')'}
                </span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* DALC Trend Sparkline */}
      {trend.dalcTrend.points.length > 1 && (
        <Card style={{ marginBottom: 12, overflow: 'hidden' }} data-testid="dalc-trend-card">
          <div style={{
            padding: '10px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <span style={{ fontSize: 12 }}>💰</span>
            <span className="label-text">DALC Cost Trend</span>
            <span style={{
              marginLeft: 'auto',
              fontSize: 10,
              fontWeight: 600,
              color: directionColor(trend.dalcTrend.direction),
            }}>
              {directionIcon(trend.dalcTrend.direction)} {directionLabel(trend.dalcTrend.direction)}
            </span>
          </div>
          <div style={{ padding: '12px 16px' }}>
            <DalcSparkline points={trend.dalcTrend.points} />
          </div>
        </Card>
      )}

      {/* Property Trends */}
      <Card style={{ marginBottom: 12, overflow: 'hidden' }} data-testid="property-trends-card">
        <div style={{
          padding: '10px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <span style={{ fontSize: 12 }}>🏗️</span>
          <span className="label-text">Property Trends</span>
        </div>
        <div style={{ padding: '8px 16px' }}>
          {trend.propertyTrends
            .filter(pt => pt.latestFindingCount > 0 || (pt.previousFindingCount ?? 0) > 0)
            .map(pt => (
              <PropertyTrendRow key={pt.property} trend={pt} />
            ))}
          {trend.propertyTrends.every(pt => pt.latestFindingCount === 0 && (pt.previousFindingCount ?? 0) === 0) && (
            <div style={{ color: '#6B7280', fontSize: 11, padding: '8px 0', textAlign: 'center' }}>
              No findings across any property
            </div>
          )}
        </div>
      </Card>

      {/* Top Regressions / Improvements toggle */}
      {regression && (regression.topRegressions.length > 0 || regression.topImprovements.length > 0) && (
        <Card style={{ marginBottom: 12, overflow: 'hidden' }} data-testid="regressions-card">
          <div
            style={{
              padding: '10px 16px',
              borderBottom: showDeltas ? '1px solid rgba(255,255,255,0.06)' : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
            }}
            onClick={() => setShowDeltas(!showDeltas)}
          >
            <span style={{ fontSize: 12 }}>🔍</span>
            <span className="label-text">Regressions & Improvements</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: '#6B7280' }}>
              {showDeltas ? '▾' : '▸'}
            </span>
          </div>
          {showDeltas && (
            <div style={{ padding: '8px 16px' }}>
              {regression.topRegressions.length > 0 && (
                <>
                  <div style={{ fontSize: 10, color: '#EF4444', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, marginTop: 4 }}>
                    Regressions
                  </div>
                  {regression.topRegressions.map((d, i) => (
                    <DeltaRow key={`reg-${i}`} delta={d} />
                  ))}
                </>
              )}
              {regression.topImprovements.length > 0 && (
                <>
                  <div style={{ fontSize: 10, color: '#10B981', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, marginTop: 8 }}>
                    Improvements
                  </div>
                  {regression.topImprovements.map((d, i) => (
                    <DeltaRow key={`imp-${i}`} delta={d} />
                  ))}
                </>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DeltaCountBadge({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 16,
        fontWeight: 700,
        color: count > 0 ? color : '#4B5563',
      }}>
        {count}
      </div>
      <div style={{ fontSize: 9, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
    </div>
  );
}

function PropertyTrendRow({ trend }: { trend: PropertyTrendRecord }) {
  const delta = trend.previousFindingCount != null
    ? trend.latestFindingCount - trend.previousFindingCount
    : null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 0',
      borderBottom: '1px solid rgba(255,255,255,0.03)',
    }}>
      <span style={{
        fontSize: 14,
        fontWeight: 700,
        color: directionColor(trend.direction),
        width: 16,
        textAlign: 'center',
      }}>
        {directionIcon(trend.direction)}
      </span>
      <span style={{
        fontSize: 11,
        color: '#D1D5DB',
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        P{trend.property} — {trend.propertyName}
      </span>
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        fontWeight: 600,
        color: '#E5E7EB',
      }}>
        {trend.latestFindingCount}
      </span>
      {delta != null && delta !== 0 && (
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          fontWeight: 600,
          color: delta > 0 ? '#EF4444' : '#10B981',
        }}>
          {delta > 0 ? '+' : ''}{delta}
        </span>
      )}
      {/* Mini severity bar */}
      <div style={{ display: 'flex', gap: 2 }}>
        {(['critical', 'major', 'minor', 'info'] as const).map(sev => {
          const count = trend.latestBySeverity[sev] ?? 0;
          if (count === 0) return null;
          return (
            <span key={sev} style={{
              fontSize: 8,
              fontWeight: 600,
              padding: '1px 3px',
              borderRadius: 2,
              background: `${SEVERITY_CONFIG[sev as SeverityKey]?.color ?? '#6B7280'}22`,
              color: SEVERITY_CONFIG[sev as SeverityKey]?.color ?? '#6B7280',
            }}>
              {count}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function DeltaRow({ delta }: { delta: FindingDeltaRecord }) {
  const statusColors: Record<string, string> = {
    new: '#EF4444',
    resolved: '#10B981',
    worsened: '#F97316',
    improved: '#3B82F6',
    unchanged: '#6B7280',
  };
  const statusLabels: Record<string, string> = {
    new: 'NEW',
    resolved: 'RESOLVED',
    worsened: 'WORSENED',
    improved: 'IMPROVED',
    unchanged: 'UNCHANGED',
  };
  const sevColor = SEVERITY_CONFIG[delta.currentSeverity as SeverityKey]?.color ?? '#6B7280';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '5px 0',
      borderBottom: '1px solid rgba(255,255,255,0.03)',
    }}>
      <span style={{
        fontSize: 8,
        fontWeight: 700,
        padding: '1px 4px',
        borderRadius: 2,
        color: statusColors[delta.status] ?? '#6B7280',
        background: `${statusColors[delta.status] ?? '#6B7280'}15`,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        flexShrink: 0,
      }}>
        {statusLabels[delta.status] ?? delta.status}
      </span>
      <span style={{
        fontSize: 8,
        fontWeight: 600,
        padding: '1px 4px',
        borderRadius: 2,
        color: sevColor,
        background: `${sevColor}22`,
        textTransform: 'uppercase',
        flexShrink: 0,
      }}>
        {delta.currentSeverity}
      </span>
      {delta.previousSeverity && delta.previousSeverity !== delta.currentSeverity && (
        <span style={{ fontSize: 9, color: '#6B7280' }}>
          (was {delta.previousSeverity})
        </span>
      )}
      <span style={{
        fontSize: 11,
        color: '#D1D5DB',
        flex: 1,
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {delta.title}
      </span>
      <span style={{
        fontSize: 9,
        color: '#6B7280',
        flexShrink: 0,
      }}>
        P{delta.property}
      </span>
    </div>
  );
}

/** Text-based DALC sparkline showing low/base/high over time. */
function DalcSparkline({ points }: { points: Array<{ runLabel: string; baseUsd: number; lowUsd: number; highUsd: number }> }) {
  if (points.length === 0) return null;

  // Show a compact table of values
  const maxPoints = Math.min(points.length, 8);
  const displayPoints = points.slice(-maxPoints);

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `80px repeat(${displayPoints.length}, 1fr)`,
        gap: 4,
        fontSize: 10,
      }}>
        {/* Header row */}
        <div style={{ color: '#6B7280', fontWeight: 600 }}></div>
        {displayPoints.map((p, i) => (
          <div key={i} style={{
            color: '#9CA3AF',
            textAlign: 'right',
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {p.runLabel.length > 8 ? p.runLabel.slice(0, 8) + '...' : p.runLabel}
          </div>
        ))}

        {/* Base row */}
        <div style={{ color: '#F59E0B', fontWeight: 600 }}>Base</div>
        {displayPoints.map((p, i) => (
          <div key={i} style={{
            fontFamily: "'JetBrains Mono', monospace",
            color: '#F59E0B',
            textAlign: 'right',
            fontWeight: 600,
          }}>
            {formatCost(p.baseUsd)}
          </div>
        ))}

        {/* Range row */}
        <div style={{ color: '#6B7280' }}>Range</div>
        {displayPoints.map((p, i) => (
          <div key={i} style={{
            fontFamily: "'JetBrains Mono', monospace",
            color: '#6B7280',
            textAlign: 'right',
            fontSize: 9,
          }}>
            {formatCost(p.lowUsd)}&ndash;{formatCost(p.highUsd)}
          </div>
        ))}
      </div>
    </div>
  );
}
