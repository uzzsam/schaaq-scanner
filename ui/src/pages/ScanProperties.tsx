import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { fetchScan, fetchFindings, fetchEngineResult, type Scan, type Finding } from '../api/client';
import { PageHeader, Card } from '../components/Shared';
import { PropertyRadar } from '../components/PropertyRadar';
import { ScoreBar } from '../components/Badges';
import { SeverityBadge } from '../components/SeverityBadge';
import { formatCost, PROPERTY_NAMES, scoreColor, type SeverityKey } from '../utils';
import { ScanDetailSkeleton } from '../components/LoadingSkeleton';
import { ErrorState } from '../components/ErrorState';

export function ScanProperties() {
  const { scanId } = useParams();
  const [scan, setScan] = useState<Scan | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [engineResult, setEngineResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(() => {
    if (!scanId) return;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchScan(scanId),
      fetchFindings(scanId),
      fetchEngineResult(scanId).catch(() => null),
    ])
      .then(([s, f, r]) => { setScan(s); setFindings(f); setEngineResult(r); })
      .catch((err) => setError(err?.message ?? 'Failed to load properties'))
      .finally(() => setLoading(false));
  }, [scanId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <ScanDetailSkeleton />;
  if (error || !scan) return <ErrorState title="Scan not found" message={error ?? 'This scan could not be loaded.'} onRetry={load} />;

  // ---- Cost calculation (same logic as ScanResults) ----
  const findingCosts = new Map<number, number>();
  const totalCost = scan.total_cost ?? 0;

  const amplifiedCosts = engineResult?.amplifiedCosts ?? engineResult?.result?.amplifiedCosts;
  if (amplifiedCosts) {
    findings.forEach((f) => {
      let cost = 0;
      if (f.costWeights && Object.keys(f.costWeights).length > 0) {
        for (const [cat, weight] of Object.entries(f.costWeights)) {
          cost += ((amplifiedCosts as any)[cat] ?? 0) * (weight as number);
        }
      }
      findingCosts.set(f.id, cost);
    });
  }
  if (findingCosts.size === 0 || [...findingCosts.values()].every(v => v === 0)) {
    const weights: Record<string, number> = { critical: 3, major: 2, minor: 1, info: 0.5 };
    const totalWeight = findings.reduce((s, f) => s + (weights[f.severity] ?? 1), 0);
    findings.forEach((f) => {
      findingCosts.set(f.id, totalWeight > 0 ? totalCost * (weights[f.severity] ?? 1) / totalWeight : 0);
    });
  }
  const getFindingCost = (f: Finding) => findingCosts.get(f.id) ?? 0;

  // ---- Property data ----
  const propertyData = [1, 2, 3, 4, 5, 6, 7].map((pNum) => {
    const pFindings = findings.filter((f) => f.property === pNum);
    const avgSeverity = pFindings.length > 0
      ? pFindings.reduce((s, f) => s + f.raw_score, 0) / pFindings.length
      : 0;
    const score = Math.round((1 - avgSeverity) * 100);
    const cost = pFindings.reduce((s, f) => s + getFindingCost(f), 0);
    return { num: pNum, id: `P${pNum}`, name: PROPERTY_NAMES[pNum] ?? `Property ${pNum}`, score, findingCount: pFindings.length, cost, findings: pFindings };
  });

  const avgScore = Math.round(propertyData.reduce((s, p) => s + p.score, 0) / propertyData.length);

  return (
    <div>
      <PageHeader
        title="Property Health"
        subtitle={`${avgScore}/100 average across 7 properties · ${findings.length} findings`}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 20, alignItems: 'start' }}>
        {/* Radar chart */}
        <Card style={{ padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'sticky', top: 24 }}>
          <div className="label-text" style={{ marginBottom: 8, alignSelf: 'flex-start' }}>Radar Overview</div>
          <PropertyRadar properties={propertyData} size={320} />
          <div style={{ width: '100%', marginTop: 12 }}>
            {propertyData.map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', fontSize: 11 }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#10B981', fontWeight: 700, width: 24 }}>{p.id}</span>
                <span style={{ color: '#D1D5DB', flex: 1 }}>{p.name}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: scoreColor(p.score), fontWeight: 700, width: 28, textAlign: 'right' }}>{p.score}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Property cards grid */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {propertyData.map((p) => {
            const isExpanded = expanded === p.num;
            const sortedFindings = [...p.findings].sort((a, b) => getFindingCost(b) - getFindingCost(a));

            return (
              <Card key={p.num} style={{ overflow: 'hidden' }}>
                {/* Card header — always visible */}
                <div
                  onClick={() => setExpanded(isExpanded ? null : p.num)}
                  style={{
                    padding: 16, cursor: 'pointer', transition: 'background 0.1s',
                    display: 'flex', alignItems: 'center', gap: 14,
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  {/* Property ID */}
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 800,
                    color: '#10B981', width: 36, textAlign: 'center', flexShrink: 0,
                  }}>
                    {p.id}
                  </div>

                  {/* Name + score bar */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                      <span style={{ color: 'white', fontSize: 14, fontWeight: 600 }}>{p.name}</span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 700, color: scoreColor(p.score) }}>
                        {p.score}<span style={{ fontSize: 11, color: '#6B7280', fontWeight: 400 }}>/100</span>
                      </span>
                    </div>
                    <ScoreBar score={p.score} height={6} />
                  </div>

                  {/* Stats */}
                  <div style={{ display: 'flex', gap: 16, flexShrink: 0, alignItems: 'center' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 600, color: '#D1D5DB' }}>
                        {p.findingCount}
                      </div>
                      <div style={{ fontSize: 9, color: '#6B7280', textTransform: 'uppercase', fontWeight: 500 }}>findings</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 600, color: '#F59E0B' }}>
                        {formatCost(p.cost)}
                      </div>
                      <div style={{ fontSize: 9, color: '#6B7280', textTransform: 'uppercase', fontWeight: 500 }}>cost/yr</div>
                    </div>
                    {/* Expand chevron */}
                    <span style={{
                      color: '#6B7280', fontSize: 14, transition: 'transform 0.2s',
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      display: 'inline-block', width: 16, textAlign: 'center',
                    }}>
                      ▾
                    </span>
                  </div>
                </div>

                {/* Expanded findings list */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    {sortedFindings.length === 0 ? (
                      <div style={{ padding: 16, color: '#6B7280', fontSize: 12, textAlign: 'center' }}>
                        No findings for this property.
                      </div>
                    ) : (
                      <>
                        {/* Column header */}
                        <div style={{
                          display: 'grid', gridTemplateColumns: '1fr 70px 80px 90px',
                          gap: 8, padding: '8px 16px', background: 'rgba(255,255,255,0.02)',
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                        }}>
                          <span className="label-text">Finding</span>
                          <span className="label-text">Severity</span>
                          <span className="label-text" style={{ textAlign: 'right' }}>Objects</span>
                          <span className="label-text" style={{ textAlign: 'right' }}>Est. Cost</span>
                        </div>
                        {sortedFindings.map((f, i) => (
                          <div key={f.id} style={{
                            display: 'grid', gridTemplateColumns: '1fr 70px 80px 90px',
                            gap: 8, padding: '10px 16px', alignItems: 'center',
                            borderBottom: i < sortedFindings.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                          }}>
                            <span style={{ color: '#E5E7EB', fontSize: 13, fontWeight: 500 }}>{f.title}</span>
                            <SeverityBadge severity={f.severity as SeverityKey} compact />
                            <span style={{ color: '#9CA3AF', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", textAlign: 'right' }}>
                              {f.affected_objects}
                            </span>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#F59E0B', fontSize: 13, fontWeight: 600, textAlign: 'right' }}>
                              {formatCost(getFindingCost(f))}
                            </span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
