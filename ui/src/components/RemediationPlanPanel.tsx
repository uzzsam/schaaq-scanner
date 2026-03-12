import { useEffect, useState } from 'react';
import { fetchRemediationPlan, type RemediationPlan, type RemediationAction } from '../api/client';
import { formatCost } from '../utils';

// =============================================================================
// Constants
// =============================================================================

const EFFORT_LABELS: Record<string, string> = { S: 'Small', M: 'Medium', L: 'Large' };
const EFFORT_COLORS: Record<string, string> = { S: '#10B981', M: '#F59E0B', L: '#EF4444' };

const OWNER_LABELS: Record<string, string> = {
  'data-engineer': 'Data Engineer',
  'data-architect': 'Data Architect',
  'data-steward': 'Data Steward',
  'dba': 'DBA',
  'analytics-engineer': 'Analytics Engineer',
  'compliance-officer': 'Compliance Officer',
};

const SEVERITY_LABELS: Record<number, { label: string; color: string }> = {
  4: { label: 'CRITICAL', color: '#EF4444' },
  3: { label: 'MAJOR', color: '#F59E0B' },
  2: { label: 'MINOR', color: '#3B82F6' },
  1: { label: 'INFO', color: '#6B7280' },
};

// =============================================================================
// Component
// =============================================================================

interface Props {
  resultSetId: string | null;
}

export function RemediationPlanPanel({ resultSetId }: Props) {
  const [plan, setPlan] = useState<RemediationPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedAction, setExpandedAction] = useState<string | null>(null);

  useEffect(() => {
    if (!resultSetId) return;
    setLoading(true);
    setError(null);
    fetchRemediationPlan(resultSetId)
      .then(setPlan)
      .catch((e) => setError(e?.message || 'Failed to load remediation plan'))
      .finally(() => setLoading(false));
  }, [resultSetId]);

  if (!resultSetId) {
    return (
      <div style={{ color: '#6B7280', fontSize: 13, padding: 20, textAlign: 'center' }}>
        Complete a scan to generate a remediation plan.
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: 20 }}>
        <div style={{ color: '#9CA3AF', fontSize: 13 }}>Generating remediation plan...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 20, color: '#EF4444', fontSize: 13 }}>{error}</div>
    );
  }

  if (!plan || plan.actions.length === 0) {
    return (
      <div style={{ color: '#6B7280', fontSize: 13, padding: 20, textAlign: 'center' }}>
        No remediation actions — all critical and major checks passed.
      </div>
    );
  }

  const topActions = plan.actions.slice(0, 5);

  return (
    <div>
      {/* Header summary */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <SummaryCard label="Actions" value={String(plan.actions.length)} />
        <SummaryCard label="Quick Wins" value={String(plan.quickWinCount)} accent="#10B981" />
        <SummaryCard
          label="Est. Impact (base)"
          value={formatCost(plan.totalEstimatedImpactUsd.base)}
          subtitle={`${formatCost(plan.totalEstimatedImpactUsd.low)} – ${formatCost(plan.totalEstimatedImpactUsd.high)}`}
        />
        <SummaryCard label="Phases" value={String(plan.sequenceGroups.length)} />
      </div>

      {/* Top actions */}
      <div style={{ marginBottom: 8 }}>
        <h3 style={{ color: '#D1D5DB', fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>
          Priority Actions
        </h3>
        {topActions.map((action) => (
          <ActionCard
            key={action.id}
            action={action}
            expanded={expandedAction === action.id}
            onToggle={() => setExpandedAction(expandedAction === action.id ? null : action.id)}
          />
        ))}
      </div>

      {/* Sequence groups */}
      {plan.sequenceGroups.length > 1 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ color: '#D1D5DB', fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>
            Execution Sequence
          </h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {plan.sequenceGroups.map((sg) => (
              <div key={sg.group} style={{
                flex: 1, minWidth: 200, background: '#1A1F2E', borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.06)', padding: 14,
              }}>
                <div style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                  {sg.label}
                </div>
                {sg.actionIds.map((aid) => {
                  const a = plan.actions.find((x) => x.id === aid);
                  if (!a) return null;
                  return (
                    <div key={aid} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{
                        background: 'rgba(16,185,129,0.1)', color: '#10B981',
                        width: 22, height: 22, borderRadius: '50%', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0,
                      }}>
                        {a.priorityRank}
                      </span>
                      <span style={{ color: '#D1D5DB', fontSize: 12 }}>{a.title}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Remaining actions if > 5 */}
      {plan.actions.length > 5 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ color: '#D1D5DB', fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>
            Additional Actions
          </h3>
          {plan.actions.slice(5).map((action) => (
            <ActionCard
              key={action.id}
              action={action}
              expanded={expandedAction === action.id}
              onToggle={() => setExpandedAction(expandedAction === action.id ? null : action.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function SummaryCard({ label, value, subtitle, accent }: {
  label: string; value: string; subtitle?: string; accent?: string;
}) {
  return (
    <div style={{
      background: '#1A1F2E', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)',
      padding: '12px 16px', minWidth: 120,
    }}>
      <div style={{ color: '#6B7280', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ color: accent || '#E5E7EB', fontSize: 20, fontWeight: 700 }}>{value}</div>
      {subtitle && <div style={{ color: '#6B7280', fontSize: 10, marginTop: 2 }}>{subtitle}</div>}
    </div>
  );
}

function ActionCard({ action, expanded, onToggle }: {
  action: RemediationAction; expanded: boolean; onToggle: () => void;
}) {
  const sev = SEVERITY_LABELS[action.severityWeight] ?? SEVERITY_LABELS[1];

  return (
    <div style={{
      background: '#1A1F2E', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)',
      marginBottom: 8, overflow: 'hidden',
    }}>
      {/* Compact row */}
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
          textAlign: 'left', fontFamily: 'inherit',
        }}
      >
        {/* Rank */}
        <span style={{
          background: 'rgba(16,185,129,0.1)', color: '#10B981',
          width: 26, height: 26, borderRadius: '50%', display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0,
        }}>
          {action.priorityRank}
        </span>

        {/* Title + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#E5E7EB', fontSize: 13, fontWeight: 600 }}>
            {action.title}
            {action.quickWin && (
              <span style={{
                background: 'rgba(16,185,129,0.15)', color: '#10B981', padding: '1px 6px',
                borderRadius: 4, fontSize: 9, fontWeight: 700, marginLeft: 8, verticalAlign: 'middle',
              }}>
                QUICK WIN
              </span>
            )}
          </div>
          <div style={{ color: '#6B7280', fontSize: 11, marginTop: 2 }}>
            {action.relatedFindingCodes.length} finding(s) &middot; {action.affectedAssets} asset(s)
          </div>
        </div>

        {/* Severity */}
        <span style={{
          color: sev.color, fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
          padding: '2px 6px', borderRadius: 4, border: `1px solid ${sev.color}30`,
        }}>
          {sev.label}
        </span>

        {/* Effort */}
        <span style={{
          background: `${EFFORT_COLORS[action.effortBand]}20`,
          color: EFFORT_COLORS[action.effortBand],
          padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
        }}>
          {EFFORT_LABELS[action.effortBand]}
        </span>

        {/* Impact */}
        <span style={{ color: '#D1D5DB', fontSize: 12, fontWeight: 500, minWidth: 70, textAlign: 'right' }}>
          {formatCost(action.estimatedImpactUsd.base)}
        </span>

        {/* Chevron */}
        <span style={{ color: '#6B7280', fontSize: 14, transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
          &#9662;
        </span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 14px 14px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
            <div>
              <DetailLabel>Description</DetailLabel>
              <DetailText>{action.description}</DetailText>
            </div>
            <div>
              <DetailLabel>Business Rationale</DetailLabel>
              <DetailText>{action.rationale}</DetailText>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
            <div>
              <DetailLabel>Impact Range</DetailLabel>
              <DetailText>
                {formatCost(action.estimatedImpactUsd.low)} – {formatCost(action.estimatedImpactUsd.high)}
              </DetailText>
            </div>
            <div>
              <DetailLabel>Owner</DetailLabel>
              <DetailText>{OWNER_LABELS[action.likelyOwnerType] ?? action.likelyOwnerType}</DetailText>
            </div>
            <div>
              <DetailLabel>Confidence</DetailLabel>
              <DetailText style={{ textTransform: 'capitalize' }}>{action.confidenceLevel}</DetailText>
            </div>
            <div>
              <DetailLabel>Phase</DetailLabel>
              <DetailText>Phase {action.sequenceGroup}</DetailText>
            </div>
          </div>

          {action.blockedByActionIds.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <DetailLabel>Blocked By</DetailLabel>
              <DetailText>{action.blockedByActionIds.map(id => id.replace('action-', '')).join(', ')}</DetailText>
            </div>
          )}

          <div style={{ marginTop: 12 }}>
            <DetailLabel>Related Checks</DetailLabel>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
              {action.relatedFindingCodes.map((code) => (
                <span key={code} style={{
                  background: 'rgba(255,255,255,0.05)', color: '#9CA3AF',
                  padding: '2px 8px', borderRadius: 4, fontSize: 10, fontFamily: 'monospace',
                }}>
                  {code}
                </span>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 10, color: '#6B7280', fontSize: 10, fontStyle: 'italic' }}>
            {action.explanation}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: '#6B7280', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
      {children}
    </div>
  );
}

function DetailText({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ color: '#D1D5DB', fontSize: 12, lineHeight: 1.5, ...style }}>
      {children}
    </div>
  );
}
