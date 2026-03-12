/**
 * FindingDetailPanel — Evidence-rich detail view for a single finding.
 *
 * Works with both:
 *   - FindingDetailViewModel (from persisted result sets / API)
 *   - Active-scan Finding objects (gracefully shows available fields)
 */

import { useState } from 'react';
import type { FindingDetailViewModel, CriticalityTier, FindingMethodologyInfo } from '../api/client';
import { CRITICALITY_TIER_COLORS, CRITICALITY_TIER_LABELS } from '../api/client';
import { SeverityBadge } from './SeverityBadge';
import { PropertyBadge } from './PropertyBadge';
import { Card } from './Shared';
import { PROPERTY_NAMES, formatCostFull, type SeverityKey } from '../utils';

// ---------------------------------------------------------------------------
// Styles (consistent with existing dark theme)
// ---------------------------------------------------------------------------

const sectionTitle: React.CSSProperties = {
  color: '#9CA3AF', fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
  letterSpacing: '0.05em', marginBottom: 8,
};

const mono: React.CSSProperties = {
  fontFamily: "'JetBrains Mono', monospace",
};

const labelStyle: React.CSSProperties = {
  color: '#6B7280', fontSize: 11,
};

const valueStyle: React.CSSProperties = {
  ...mono, color: '#D1D5DB', fontSize: 14,
};

const chipStyle = (bg: string, fg: string): React.CSSProperties => ({
  display: 'inline-block', fontSize: 10, fontWeight: 600, padding: '2px 8px',
  borderRadius: 4, background: bg, color: fg,
});

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ConfidenceBadge({ level, score }: { level: string | null; score: number | null }) {
  if (!level) return null;
  const colors: Record<string, { bg: string; fg: string }> = {
    high: { bg: 'rgba(16,185,129,0.12)', fg: '#10B981' },
    medium: { bg: 'rgba(245,158,11,0.12)', fg: '#F59E0B' },
    low: { bg: 'rgba(239,68,68,0.12)', fg: '#EF4444' },
  };
  const c = colors[level] ?? colors.medium;
  return (
    <span style={chipStyle(c.bg, c.fg)}>
      {level.toUpperCase()}{score != null ? ` (${(score * 100).toFixed(0)}%)` : ''}
    </span>
  );
}

const techniqueColors: Record<string, { bg: string; fg: string }> = {
  deterministic: { bg: 'rgba(16,185,129,0.12)', fg: '#10B981' },
  heuristic: { bg: 'rgba(245,158,11,0.12)', fg: '#F59E0B' },
  statistical: { bg: 'rgba(59,130,246,0.12)', fg: '#3B82F6' },
};

function MethodologyCard({ methodology }: { methodology: FindingMethodologyInfo }) {
  const [expanded, setExpanded] = useState(false);
  const tc = techniqueColors[methodology.technique] ?? techniqueColors.heuristic;

  return (
    <Card style={{ padding: 16, marginBottom: 16 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: 0, fontFamily: 'inherit',
        }}
      >
        <div style={sectionTitle}>
          Methodology &amp; Assumptions
        </div>
        <span style={{ color: '#6B7280', fontSize: 12 }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Always show technique badge */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
        <span style={chipStyle(tc.bg, tc.fg)}>{methodology.technique.toUpperCase()}</span>
        <span style={{ color: '#9CA3AF', fontSize: 12 }}>{methodology.methodology}</span>
      </div>

      {expanded && (
        <div style={{ marginTop: 12 }}>
          {/* Assumptions */}
          {methodology.assumptions.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ color: '#6B7280', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>
                Assumptions
              </div>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {methodology.assumptions.map((a, i) => (
                  <li key={i} style={{ color: '#9CA3AF', fontSize: 12, lineHeight: 1.6 }}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Limitations */}
          {methodology.limitations.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ color: '#6B7280', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>
                Limitations
              </div>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {methodology.limitations.map((l, i) => (
                  <li key={i} style={{ color: '#9CA3AF', fontSize: 12, lineHeight: 1.6 }}>{l}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Data Inputs */}
          {methodology.dataInputs.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ color: '#6B7280', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>
                Data Inputs
              </div>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {methodology.dataInputs.map((d, i) => (
                  <li key={i} style={{ color: '#9CA3AF', fontSize: 12, lineHeight: 1.6 }}>{d}</li>
                ))}
              </ul>
            </div>
          )}

          {/* References */}
          {methodology.references.length > 0 && (
            <div>
              <div style={{ color: '#6B7280', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>
                References
              </div>
              <div style={{ color: '#6B7280', fontSize: 11 }}>
                {methodology.references.join(', ')}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function MetricRow({ label, value }: { label: string; value: string | number | null }) {
  if (value == null || value === '') return null;
  return (
    <div style={{ marginBottom: 6 }}>
      <span style={labelStyle}>{label}</span>
      <div style={valueStyle}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

function CriticalityChip({ tier }: { tier: CriticalityTier }) {
  const color = CRITICALITY_TIER_COLORS[tier];
  return (
    <span style={chipStyle(`${color}18`, color)}>
      {CRITICALITY_TIER_LABELS[tier]} CRITICALITY
    </span>
  );
}

interface FindingDetailPanelProps {
  detail: FindingDetailViewModel;
  cost?: number;
  criticalityTier?: CriticalityTier | null;
  onBack: () => void;
}

export function FindingDetailPanel({ detail, cost, criticalityTier, onBack }: FindingDetailPanelProps) {
  const propertyName = PROPERTY_NAMES[detail.property] ?? `Property ${detail.property}`;

  return (
    <div>
      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          color: '#9CA3AF', fontSize: 12, background: 'none', border: 'none',
          cursor: 'pointer', marginBottom: 16, fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        ← Back to findings
      </button>

      {/* ================================================================= */}
      {/* Header Card                                                       */}
      {/* ================================================================= */}
      <Card style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <SeverityBadge severity={detail.severity as SeverityKey} />
              <PropertyBadge property={detail.property} />
              <span style={{ color: '#6B7280', fontSize: 11 }}>{propertyName}</span>
              <ConfidenceBadge level={detail.confidenceLevel} score={detail.confidenceScore} />
              {criticalityTier && <CriticalityChip tier={criticalityTier} />}
            </div>
            <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, margin: 0 }}>
              {detail.title}
            </h2>
            {detail.assetName && (
              <div style={{ ...mono, color: '#818CF8', fontSize: 12, marginTop: 4 }}>
                {detail.assetType ? `${detail.assetType}: ` : ''}{detail.assetName}
              </div>
            )}
          </div>
          {cost != null && cost > 0 && (
            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
              <div style={labelStyle}>Est. Annual Cost</div>
              <div style={{ ...mono, fontSize: 28, fontWeight: 700, color: '#F59E0B' }}>
                {formatCostFull(cost)}
              </div>
            </div>
          )}
        </div>

        {/* What Was Found */}
        {detail.whatWasFound && (
          <p style={{ color: '#D1D5DB', fontSize: 13, lineHeight: 1.7, margin: '0 0 8px' }}>
            {detail.whatWasFound}
          </p>
        )}
        {!detail.whatWasFound && detail.description && (
          <p style={{ color: '#D1D5DB', fontSize: 13, lineHeight: 1.7, margin: '0 0 8px' }}>
            {detail.description}
          </p>
        )}
      </Card>

      {/* ================================================================= */}
      {/* Two-column body                                                   */}
      {/* ================================================================= */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Why It Matters */}
          {detail.whyItMatters && (
            <Card style={{ padding: 16, border: '1px solid rgba(129,140,248,0.2)' }}>
              <div style={{ ...sectionTitle, color: '#818CF8' }}>Why It Matters</div>
              <p style={{ color: '#D1D5DB', fontSize: 13, lineHeight: 1.7, margin: 0 }}>
                {detail.whyItMatters}
              </p>
            </Card>
          )}

          {/* Scan Metrics */}
          <Card style={{ padding: 16, border: '1px solid rgba(245,158,11,0.2)' }}>
            <div style={{ ...sectionTitle, color: '#F59E0B' }}>Metrics</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <MetricRow label="Affected / Total" value={`${detail.affectedObjects} / ${detail.totalObjects}`} />
              <MetricRow label="Ratio" value={detail.ratioPercent} />
              {detail.thresholdDisplay && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <MetricRow label="Threshold" value={detail.thresholdDisplay} />
                </div>
              )}
              {!detail.thresholdDisplay && detail.observedValue != null && (
                <>
                  <MetricRow label="Observed" value={`${detail.observedValue}${detail.metricUnit ? ` ${detail.metricUnit}` : ''}`} />
                  {detail.thresholdValue != null && (
                    <MetricRow label="Threshold" value={`${detail.thresholdValue}${detail.metricUnit ? ` ${detail.metricUnit}` : ''}`} />
                  )}
                </>
              )}
            </div>
          </Card>

          {/* Confidence */}
          {detail.confidenceLevel && (
            <Card style={{ padding: 16 }}>
              <div style={sectionTitle}>Confidence</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <ConfidenceBadge level={detail.confidenceLevel} score={detail.confidenceScore} />
              </div>
              {detail.confidenceReason && (
                <p style={{ color: '#9CA3AF', fontSize: 12, lineHeight: 1.6, margin: '8px 0 0' }}>
                  {detail.confidenceReason}
                </p>
              )}
            </Card>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Remediation */}
          {detail.remediation && (
            <Card style={{ padding: 16, border: '1px solid rgba(16,185,129,0.2)' }}>
              <div style={{ ...sectionTitle, color: '#10B981' }}>Remediation</div>
              <p style={{ color: '#D1D5DB', fontSize: 13, lineHeight: 1.7, margin: 0 }}>
                {detail.remediation}
              </p>
            </Card>
          )}

          {/* Samples / Evidence */}
          {detail.samples.length > 0 && (
            <Card style={{ padding: 16 }}>
              <div style={sectionTitle}>
                Sample Evidence ({detail.samples.length})
              </div>
              <div style={{ maxHeight: 240, overflow: 'auto' }}>
                {detail.samples.map((s, i) => (
                  <div key={i} style={{
                    padding: '6px 10px', background: 'rgba(255,255,255,0.03)',
                    borderRadius: 4, marginBottom: 4,
                  }}>
                    <div style={{ ...mono, fontSize: 11, color: '#818CF8', marginBottom: 2 }}>
                      {s.label}
                    </div>
                    <div style={{ ...mono, fontSize: 12, color: '#D1D5DB' }}>
                      {s.value}
                    </div>
                    {s.context && Object.keys(s.context).length > 0 && (
                      <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>
                        {Object.entries(s.context).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* How Detected */}
          {detail.howDetected && (
            <Card style={{ padding: 16 }}>
              <div style={sectionTitle}>How Detected</div>
              <p style={{ color: '#9CA3AF', fontSize: 12, lineHeight: 1.6, margin: 0 }}>
                {detail.howDetected}
              </p>
            </Card>
          )}

          {/* Provenance */}
          {detail.provenance && (
            <Card style={{ padding: 16 }}>
              <div style={sectionTitle}>Provenance</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <MetricRow label="Adapter" value={detail.provenance.adapterType} />
                <MetricRow label="Source" value={detail.provenance.sourceName} />
                <MetricRow label="Extracted At" value={detail.provenance.extractedAt} />
                {detail.provenance.sourceFingerprint && (
                  <MetricRow label="Fingerprint" value={detail.provenance.sourceFingerprint.slice(0, 16) + '…'} />
                )}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* ================================================================= */}
      {/* Methodology & Assumptions                                         */}
      {/* ================================================================= */}
      {detail.methodology && (
        <MethodologyCard methodology={detail.methodology} />
      )}
    </div>
  );
}
