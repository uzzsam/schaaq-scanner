/**
 * BlastRadiusPanel — Economic Blast-Radius Graph visualisation.
 *
 * Compact panel showing:
 *  - Executive key message
 *  - Top 3 hot edges (property → cost category)
 *  - Concentration ratio bar
 *  - Property-level and category-level totals
 *  - Full edge table (collapsible)
 */

import { useState } from 'react';
import type {
  BlastRadiusResponse,
  BlastRadiusHotEdge,
} from '../api/client';
import { formatCost, PROPERTY_NAMES, COST_CATEGORY_LABELS, COST_CATEGORY_COLORS, SEVERITY_CONFIG } from '../utils';
import type { SeverityKey } from '../utils';
import { Card } from './Shared';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function HotEdgeRow({ edge, rank }: { edge: BlastRadiusHotEdge; rank: number }) {
  const catColor = COST_CATEGORY_COLORS[edge.costCategory] ?? '#9CA3AF';
  const sevColor = SEVERITY_CONFIG[edge.topSeverity as SeverityKey]?.color ?? '#6B7280';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      <span style={{
        width: 22, height: 22, borderRadius: '50%',
        background: 'rgba(239,68,68,0.15)', color: '#EF4444',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, flexShrink: 0,
      }}>
        {rank}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: '#E5E7EB', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {edge.propertyName} → <span style={{ color: catColor }}>{edge.costCategoryLabel}</span>
        </div>
        <div style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}>
          {edge.findingCount} finding{edge.findingCount !== 1 ? 's' : ''} · top severity{' '}
          <span style={{ color: sevColor }}>{edge.topSeverity}</span>
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#F9FAFB', fontFamily: "'JetBrains Mono', monospace" }}>
          {formatCost(edge.weightUsd)}
        </div>
        <div style={{ fontSize: 10, color: '#6B7280' }}>
          {(edge.shareOfTotal * 100).toFixed(0)}% of total
        </div>
      </div>
    </div>
  );
}

function ConcentrationBar({ ratio }: { ratio: number }) {
  const pct = Math.round(ratio * 100);
  const barColor = pct >= 70 ? '#EF4444' : pct >= 50 ? '#F59E0B' : '#10B981';
  return (
    <div style={{ margin: '12px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: '#9CA3AF' }}>Top-3 Concentration</span>
        <span style={{ fontSize: 11, color: barColor, fontWeight: 600 }}>{pct}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }}>
        <div style={{ height: '100%', borderRadius: 3, background: barColor, width: `${Math.min(pct, 100)}%`, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

function TotalsTable({ items, labelKey, valueKey, countKey, colorMap }: {
  items: Array<Record<string, unknown>>;
  labelKey: string;
  valueKey: string;
  countKey: string;
  colorMap?: Record<string, string>;
}) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: 8 }}>
      {items.map((item, i) => {
        const label = String(item[labelKey] ?? '');
        const key = String(item['category'] ?? item['property'] ?? '');
        const color = colorMap?.[key] ?? '#9CA3AF';
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.03)',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 12, color: '#D1D5DB' }}>{label}</span>
            <span style={{ fontSize: 12, color: '#9CA3AF', fontFamily: "'JetBrains Mono', monospace" }}>
              {formatCost(item[valueKey] as number)}
            </span>
            <span style={{ fontSize: 11, color: '#6B7280', minWidth: 40, textAlign: 'right' }}>
              {item[countKey] as number} finding{(item[countKey] as number) !== 1 ? 's' : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Property color map (reuse a warm palette)
// ---------------------------------------------------------------------------

const PROPERTY_COLORS: Record<number, string> = {
  1: '#3B82F6', 2: '#06B6D4', 3: '#10B981', 4: '#F59E0B',
  5: '#EF4444', 6: '#8B5CF6', 7: '#EC4899', 8: '#F97316',
};

// ---------------------------------------------------------------------------
// Main Panel
// ---------------------------------------------------------------------------

interface BlastRadiusPanelProps {
  data: BlastRadiusResponse;
}

export function BlastRadiusPanel({ data }: BlastRadiusPanelProps) {
  const { summary, detail } = data;
  const [showEdges, setShowEdges] = useState(false);

  if (summary.totalEdgeCount === 0) {
    return (
      <Card style={{ padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#F9FAFB', marginBottom: 8 }}>
          💥 Economic Blast Radius
        </div>
        <div style={{ fontSize: 12, color: '#6B7280' }}>
          No blast-radius data — no findings with cost-category mappings in this result set.
        </div>
      </Card>
    );
  }

  return (
    <Card style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#F9FAFB' }}>
          💥 Economic Blast Radius
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#EF4444', fontFamily: "'JetBrains Mono', monospace" }}>
          {formatCost(summary.totalImpactUsd)}
        </div>
      </div>

      {/* Key message */}
      <div style={{
        fontSize: 12, color: '#D1D5DB', lineHeight: 1.5,
        padding: '8px 12px', borderRadius: 6, background: 'rgba(239,68,68,0.06)',
        border: '1px solid rgba(239,68,68,0.12)', marginBottom: 16,
      }}>
        {summary.keyMessage}
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#F9FAFB' }}>{summary.totalEdgeCount}</div>
          <div style={{ fontSize: 10, color: '#6B7280' }}>Pathways</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#F9FAFB' }}>{summary.totalPropertyNodesActive}</div>
          <div style={{ fontSize: 10, color: '#6B7280' }}>Properties</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#F9FAFB' }}>{summary.totalCostCategoryNodesActive}</div>
          <div style={{ fontSize: 10, color: '#6B7280' }}>Cost Areas</div>
        </div>
      </div>

      {/* Concentration bar */}
      <ConcentrationBar ratio={summary.concentrationRatio} />

      {/* Hot edges */}
      <div style={{ fontSize: 12, fontWeight: 600, color: '#9CA3AF', marginTop: 16, marginBottom: 4 }}>
        Highest-Impact Pathways
      </div>
      {summary.topHotEdges.map((edge, i) => (
        <HotEdgeRow key={edge.costCategory + edge.property} edge={edge} rank={i + 1} />
      ))}

      {/* Category totals */}
      <div style={{ fontSize: 12, fontWeight: 600, color: '#9CA3AF', marginTop: 16 }}>
        By Cost Category
      </div>
      <TotalsTable
        items={detail.categoryTotals}
        labelKey="categoryLabel"
        valueKey="totalUsd"
        countKey="findingCount"
        colorMap={COST_CATEGORY_COLORS}
      />

      {/* Property totals */}
      <div style={{ fontSize: 12, fontWeight: 600, color: '#9CA3AF', marginTop: 16 }}>
        By Property
      </div>
      <TotalsTable
        items={detail.propertyTotals.map(p => ({ ...p, property: p.property }))}
        labelKey="propertyName"
        valueKey="totalUsd"
        countKey="findingCount"
        colorMap={Object.fromEntries(
          Object.entries(PROPERTY_COLORS).map(([k, v]) => [k, v])
        )}
      />

      {/* Full edge table (collapsible) */}
      <button
        onClick={() => setShowEdges(!showEdges)}
        style={{
          marginTop: 16, width: '100%', padding: '8px 0',
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 6, color: '#9CA3AF', fontSize: 12, cursor: 'pointer',
        }}
      >
        {showEdges ? '▾ Hide' : '▸ Show'} All {detail.edges.length} Pathways
      </button>
      {showEdges && (
        <div style={{ marginTop: 8 }}>
          {detail.edges.map((e, i) => {
            const catColor = COST_CATEGORY_COLORS[e.costCategory] ?? '#9CA3AF';
            return (
              <div key={i} style={{
                display: 'flex', gap: 8, padding: '4px 0',
                borderBottom: '1px solid rgba(255,255,255,0.03)',
                fontSize: 11, color: '#D1D5DB',
              }}>
                <span style={{ flex: 1 }}>
                  {PROPERTY_NAMES[e.property] ?? `P${e.property}`} →{' '}
                  <span style={{ color: catColor }}>{e.costCategoryLabel}</span>
                </span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#9CA3AF' }}>
                  {formatCost(e.weightUsd)}
                </span>
                <span style={{ minWidth: 40, textAlign: 'right', color: '#6B7280' }}>
                  {(e.shareOfTotal * 100).toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
