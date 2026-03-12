/**
 * ScanHistoryPanel — Collapsible scan history sidebar / inline panel.
 *
 * Shows:
 *  - List of historical runs (newest first) with status, adapter, finding count, DALC cost
 *  - Active run indicator
 *  - Failed runs displayed with ✕ icon, selectable
 *  - Comparison summary when 2+ completed runs exist
 *  - Empty state when no persisted result sets
 */

import type {
  ScanHistoryListItem,
  ScanSummaryComparison,
} from '../api/client';
import { formatCost, formatDalcRangeShort, SEVERITY_CONFIG, timeAgo } from '../utils';
import { Card } from './Shared';

// ---------------------------------------------------------------------------
// History List
// ---------------------------------------------------------------------------

interface ScanHistoryPanelProps {
  history: ScanHistoryListItem[];
  selectedResultSetId: string | null;
  comparison: ScanSummaryComparison | null;
  loading: boolean;
  onSelect: (resultSetId: string) => void;
}

export function ScanHistoryPanel({
  history,
  selectedResultSetId,
  comparison,
  loading,
  onSelect,
}: ScanHistoryPanelProps) {
  if (loading) {
    return (
      <Card style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ color: '#6B7280', fontSize: 12, textAlign: 'center' }}>
          Loading scan history…
        </div>
      </Card>
    );
  }

  if (history.length === 0) {
    return (
      <Card style={{ padding: 20, marginBottom: 16, textAlign: 'center' }} data-testid="history-empty-state">
        <div style={{ fontSize: 24, opacity: 0.3, marginBottom: 8 }}>📋</div>
        <div style={{ color: '#9CA3AF', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
          No scan history
        </div>
        <div style={{ color: '#6B7280', fontSize: 12 }}>
          Completed scans will appear here for comparison and trend analysis.
        </div>
      </Card>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Comparison summary (when 2+ completed runs exist) */}
      {comparison && comparison.previous && comparison.delta && (
        <ComparisonSummary comparison={comparison} />
      )}

      {/* History list */}
      <Card data-testid="history-list">
        <div style={{
          padding: '10px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <span className="label-text">Scan History</span>
          <span style={{ color: '#6B7280', fontSize: 11 }}>{history.length} run{history.length !== 1 ? 's' : ''}</span>
        </div>
        {history.map((item, i) => (
          <HistoryRow
            key={item.resultSetId}
            item={item}
            isSelected={item.resultSetId === selectedResultSetId}
            isLast={i === history.length - 1}
            onSelect={() => onSelect(item.resultSetId)}
          />
        ))}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single History Row
// ---------------------------------------------------------------------------

function HistoryRow({
  item,
  isSelected,
  isLast,
  onSelect,
}: {
  item: ScanHistoryListItem;
  isSelected: boolean;
  isLast: boolean;
  onSelect: () => void;
}) {
  const isFailed = item.status === 'failed';
  const isCompleted = item.status === 'completed';

  const statusIcon = isFailed ? '✕' : isCompleted ? '✓' : '⋯';
  const statusColor = isFailed ? '#EF4444' : isCompleted ? '#10B981' : '#F59E0B';

  return (
    <div
      data-testid="history-row"
      onClick={onSelect}
      style={{
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        borderBottom: !isLast ? '1px solid rgba(255,255,255,0.04)' : 'none',
        cursor: 'pointer',
        transition: 'background 0.1s',
        background: isSelected ? 'rgba(16,185,129,0.06)' : 'transparent',
        borderLeft: isSelected ? '3px solid #10B981' : '3px solid transparent',
      }}
      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
    >
      {/* Status icon */}
      <span style={{
        fontSize: 10,
        fontWeight: 700,
        color: statusColor,
        width: 16,
        textAlign: 'center',
        flexShrink: 0,
      }}>
        {statusIcon}
      </span>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{
            color: isSelected ? '#E5E7EB' : '#D1D5DB',
            fontSize: 12,
            fontWeight: isSelected ? 600 : 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {item.runLabel}
          </span>
          <span style={{
            fontSize: 9,
            fontWeight: 600,
            padding: '1px 5px',
            borderRadius: 3,
            background: 'rgba(255,255,255,0.06)',
            color: '#9CA3AF',
            textTransform: 'uppercase',
            letterSpacing: '0.03em',
            flexShrink: 0,
          }}>
            {item.adapterType}
          </span>
        </div>
        <div style={{ color: '#6B7280', fontSize: 10 }}>
          {timeAgo(item.completedAt ?? item.startedAt)}
          {item.durationMs != null && ` · ${(item.durationMs / 1000).toFixed(1)}s`}
        </div>
      </div>

      {/* Right metrics */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {isFailed ? (
          <div style={{ color: '#EF4444', fontSize: 11, fontWeight: 600 }}>Failed</div>
        ) : (
          <>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              fontWeight: 600,
              color: '#F59E0B',
            }}>
              {formatCost(item.dalcBaseUsd ?? item.dalcTotalUsd)}
            </div>
            {item.dalcLowUsd != null && item.dalcHighUsd != null && item.dalcLowUsd !== item.dalcHighUsd && (
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#6B7280' }}>
                {formatDalcRangeShort(item.dalcLowUsd, item.dalcHighUsd, item.dalcBaseUsd)}
              </div>
            )}
            <div style={{ color: '#6B7280', fontSize: 10 }}>
              {item.totalFindings} finding{item.totalFindings !== 1 ? 's' : ''}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comparison Summary
// ---------------------------------------------------------------------------

function ComparisonSummary({ comparison }: { comparison: ScanSummaryComparison }) {
  const { latest, delta, findingsDiff } = comparison;
  if (!delta) return null;

  return (
    <Card style={{ marginBottom: 12, overflow: 'hidden' }} data-testid="comparison-summary">
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
      }}>
        <span style={{ fontSize: 12 }}>📊</span>
        <span className="label-text">Latest vs Previous</span>
      </div>
      <div style={{
        padding: '12px 16px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
        gap: 12,
      }}>
        <DeltaMetric
          label="Findings"
          value={latest.totalFindings}
          delta={delta.totalFindings}
          invertColor
        />
        <DeltaMetric
          label="Critical"
          value={latest.criticalCount}
          delta={delta.criticalCount}
          invertColor
          color={SEVERITY_CONFIG.critical.color}
        />
        <DeltaMetric
          label="Major"
          value={latest.majorCount}
          delta={delta.majorCount}
          invertColor
          color={SEVERITY_CONFIG.major.color}
        />
        <DeltaMetric
          label="DALC (low)"
          value={formatCost(latest.dalcLowUsd ?? latest.dalcBaseUsd ?? latest.dalcTotalUsd)}
          delta={delta.dalcLowUsd ?? delta.dalcBaseUsd ?? delta.dalcTotalUsd}
          invertColor
          formatDelta={(d) => formatCost(d)}
        />
        <DeltaMetric
          label="DALC (base)"
          value={formatCost(latest.dalcBaseUsd ?? latest.dalcTotalUsd)}
          delta={delta.dalcBaseUsd ?? delta.dalcTotalUsd}
          invertColor
          formatDelta={(d) => formatCost(d)}
        />
        <DeltaMetric
          label="DALC (high)"
          value={formatCost(latest.dalcHighUsd ?? latest.dalcBaseUsd ?? latest.dalcTotalUsd)}
          delta={delta.dalcHighUsd ?? delta.dalcBaseUsd ?? delta.dalcTotalUsd}
          invertColor
          formatDelta={(d) => formatCost(d)}
        />
      </div>
      {findingsDiff && (findingsDiff.added.length > 0 || findingsDiff.removed.length > 0) && (
        <div style={{
          padding: '8px 16px',
          borderTop: '1px solid rgba(255,255,255,0.04)',
          color: '#6B7280',
          fontSize: 11,
        }}>
          {findingsDiff.added.length > 0 && (
            <span style={{ color: '#EF4444' }}>+{findingsDiff.added.length} new</span>
          )}
          {findingsDiff.added.length > 0 && findingsDiff.removed.length > 0 && ' · '}
          {findingsDiff.removed.length > 0 && (
            <span style={{ color: '#10B981' }}>−{findingsDiff.removed.length} resolved</span>
          )}
          {findingsDiff.unchanged > 0 && ` · ${findingsDiff.unchanged} unchanged`}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Delta Metric
// ---------------------------------------------------------------------------

function DeltaMetric({
  label,
  value,
  delta,
  invertColor = false,
  color,
  formatDelta,
}: {
  label: string;
  value: string | number;
  delta: number;
  invertColor?: boolean;
  color?: string;
  formatDelta?: (d: number) => string;
}) {
  const deltaColor = delta === 0
    ? '#6B7280'
    : (invertColor ? delta > 0 : delta < 0)
      ? '#EF4444'
      : '#10B981';

  const deltaStr = delta === 0
    ? '—'
    : `${delta > 0 ? '+' : ''}${formatDelta ? formatDelta(delta) : delta}`;

  return (
    <div>
      <div style={{ color: '#6B7280', fontSize: 10, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 14,
        fontWeight: 700,
        color: color ?? '#E5E7EB',
      }}>
        {value}
      </div>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        fontWeight: 600,
        color: deltaColor,
        marginTop: 1,
      }}>
        {deltaStr}
      </div>
    </div>
  );
}
