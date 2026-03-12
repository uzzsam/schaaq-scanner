/**
 * MethodologyPanel — Result-set level methodology & confidence display.
 *
 * Four sections:
 *   1. Overall Confidence — badge + rationale
 *   2. Confidence Breakdown — 4 area cards (detection/coverage/economic/criticality)
 *   3. Assumptions — collapsible table (category, assumption, source type, materiality)
 *   4. Coverage Gaps — list with impact descriptions
 */

import { useState } from 'react';
import type { MethodologySummary, MethodologyConfidenceLevel, AssumptionSourceType, MaterialityLevel } from '../api/client';
import { Card } from './Shared';

// ---------------------------------------------------------------------------
// Colour mappings (dark theme)
// ---------------------------------------------------------------------------

const CONFIDENCE_COLORS: Record<MethodologyConfidenceLevel, { bg: string; fg: string }> = {
  high: { bg: 'rgba(16,185,129,0.15)', fg: '#10B981' },
  medium: { bg: 'rgba(245,158,11,0.15)', fg: '#F59E0B' },
  low: { bg: 'rgba(239,68,68,0.15)', fg: '#EF4444' },
  very_low: { bg: 'rgba(239,68,68,0.25)', fg: '#EF4444' },
};

const SOURCE_COLORS: Record<AssumptionSourceType, { bg: string; fg: string }> = {
  empirical: { bg: 'rgba(16,185,129,0.15)', fg: '#10B981' },
  expert_estimated: { bg: 'rgba(245,158,11,0.15)', fg: '#F59E0B' },
  client_configured: { bg: 'rgba(59,130,246,0.15)', fg: '#3B82F6' },
  inferred: { bg: 'rgba(168,85,247,0.15)', fg: '#A855F7' },
  system_default: { bg: 'rgba(107,114,128,0.15)', fg: '#6B7280' },
};

const MATERIALITY_COLORS: Record<MaterialityLevel, { bg: string; fg: string }> = {
  high: { bg: 'rgba(239,68,68,0.15)', fg: '#EF4444' },
  medium: { bg: 'rgba(245,158,11,0.15)', fg: '#F59E0B' },
  low: { bg: 'rgba(107,114,128,0.15)', fg: '#6B7280' },
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const sectionTitle: React.CSSProperties = {
  color: '#9CA3AF', fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.05em', marginBottom: 10,
};

const chipStyle = (bg: string, fg: string): React.CSSProperties => ({
  display: 'inline-block', fontSize: 10, fontWeight: 600, padding: '2px 8px',
  borderRadius: 4, background: bg, color: fg, textTransform: 'uppercase',
});

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ConfidenceBadge({ level }: { level: MethodologyConfidenceLevel }) {
  const c = CONFIDENCE_COLORS[level] ?? CONFIDENCE_COLORS.medium;
  return <span style={chipStyle(c.bg, c.fg)}>{level.replace('_', ' ')}</span>;
}

function SourceBadge({ source }: { source: AssumptionSourceType }) {
  const c = SOURCE_COLORS[source] ?? SOURCE_COLORS.system_default;
  return <span style={chipStyle(c.bg, c.fg)}>{source.replace('_', ' ')}</span>;
}

function MaterialityBadge({ level }: { level: MaterialityLevel }) {
  const c = MATERIALITY_COLORS[level] ?? MATERIALITY_COLORS.medium;
  return <span style={chipStyle(c.bg, c.fg)}>{level}</span>;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface Props {
  summary: MethodologySummary;
}

export function MethodologyPanel({ summary }: Props) {
  const [showAllAssumptions, setShowAllAssumptions] = useState(false);

  const highMateriality = summary.assumptions.filter(a => a.materialityLevel === 'high');
  const displayAssumptions = showAllAssumptions ? summary.assumptions : highMateriality;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* 1. Overall Confidence */}
      <Card style={{ padding: 20 }}>
        <div style={sectionTitle}>Overall Confidence</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <span style={{
            fontSize: 22, fontWeight: 700, textTransform: 'uppercase',
            color: CONFIDENCE_COLORS[summary.overallConfidence]?.fg ?? '#9CA3AF',
          }}>
            {summary.overallConfidence.replace('_', ' ')}
          </span>
        </div>
        <div style={{ color: '#9CA3AF', fontSize: 13, lineHeight: 1.5 }}>
          {summary.overallConfidenceRationale}
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: '#6B7280' }}>
          v{summary.version} &middot; Generated {new Date(summary.generatedAt).toLocaleString()}
        </div>
      </Card>

      {/* 2. Confidence Breakdown */}
      <Card style={{ padding: 20 }}>
        <div style={sectionTitle}>Confidence by Area</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {summary.confidenceAssessments.map(ca => (
            <div key={ca.area} style={{
              padding: '12px 14px', background: 'rgba(255,255,255,0.03)',
              borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#D1D5DB', textTransform: 'capitalize' }}>
                  {ca.area}
                </span>
                <ConfidenceBadge level={ca.confidenceLevel} />
              </div>
              <div style={{ fontSize: 12, color: '#9CA3AF', lineHeight: 1.4, marginBottom: 6 }}>
                {ca.rationale}
              </div>
              <div style={{ fontSize: 11, color: '#6B7280' }}>
                <strong>Drivers:</strong> {ca.keyDrivers.join(', ')}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 3. Assumptions */}
      <Card style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={sectionTitle}>
            System Assumptions ({summary.assumptions.length})
          </div>
          <button
            onClick={() => setShowAllAssumptions(!showAllAssumptions)}
            style={{
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#9CA3AF', fontSize: 11, padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
            }}
          >
            {showAllAssumptions
              ? `Show high materiality only (${highMateriality.length})`
              : `Show all (${summary.assumptions.length})`}
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <th style={{ padding: '6px 8px', textAlign: 'left', color: '#6B7280', fontSize: 11 }}>Category</th>
                <th style={{ padding: '6px 8px', textAlign: 'left', color: '#6B7280', fontSize: 11 }}>Assumption</th>
                <th style={{ padding: '6px 8px', textAlign: 'left', color: '#6B7280', fontSize: 11 }}>Source</th>
                <th style={{ padding: '6px 8px', textAlign: 'left', color: '#6B7280', fontSize: 11 }}>Materiality</th>
                <th style={{ padding: '6px 8px', textAlign: 'left', color: '#6B7280', fontSize: 11 }}>Value</th>
              </tr>
            </thead>
            <tbody>
              {displayAssumptions.map(a => (
                <tr key={a.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding: '6px 8px', color: '#6B7280', fontSize: 11 }}>{a.category}</td>
                  <td style={{ padding: '6px 8px', color: '#D1D5DB' }}>{a.assumption}</td>
                  <td style={{ padding: '6px 8px' }}><SourceBadge source={a.sourceType} /></td>
                  <td style={{ padding: '6px 8px' }}><MaterialityBadge level={a.materialityLevel} /></td>
                  <td style={{ padding: '6px 8px', color: '#9CA3AF', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                    {a.currentValue}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 4. Coverage Gaps */}
      {summary.coverageGaps.length > 0 && (
        <Card style={{ padding: 20 }}>
          <div style={sectionTitle}>Coverage Gaps ({summary.coverageGaps.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {summary.coverageGaps.map(gap => (
              <div key={gap.id} style={{
                padding: '10px 14px',
                borderLeft: '3px solid #F59E0B',
                background: 'rgba(245,158,11,0.05)',
                borderRadius: '0 6px 6px 0',
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#D1D5DB' }}>{gap.description}</div>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                  <strong>Impact:</strong> {gap.impact}
                </div>
                <div style={{ fontSize: 11, color: '#6B7280' }}>
                  <strong>Mitigation:</strong> {gap.mitigationHint}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 5. Scan Coverage */}
      <Card style={{ padding: 20 }}>
        <div style={sectionTitle}>Scan Coverage</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[
            { label: 'Tables', value: summary.scanCoverage.totalTables },
            { label: 'Columns', value: summary.scanCoverage.totalColumns },
            { label: 'Checks Run', value: `${summary.scanCoverage.checksRun}/${summary.scanCoverage.checksAvailable}` },
            { label: 'Properties', value: summary.scanCoverage.propertiesCovered.length },
          ].map(item => (
            <div key={item.label} style={{
              padding: 10, background: 'rgba(255,255,255,0.03)',
              borderRadius: 6, textAlign: 'center',
            }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#D1D5DB', fontFamily: "'JetBrains Mono', monospace" }}>
                {item.value}
              </div>
              <div style={{ fontSize: 11, color: '#6B7280' }}>{item.label}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: '#6B7280' }}>
          Adapter: {summary.scanCoverage.adapterType}
          {summary.scanCoverage.hasPipelineMapping && ' | Pipeline mapping: yes'}
          {summary.scanCoverage.hasExternalLineage && ' | External lineage: yes'}
        </div>
      </Card>
    </div>
  );
}
