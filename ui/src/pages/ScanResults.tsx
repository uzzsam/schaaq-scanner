import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  fetchScan, fetchFindings, fetchEngineResult, getExportHtmlUrl,
  fetchTransformFindings, uploadTransformFiles, fetchStrengths,
  fetchResultSetByScanId, fetchResultFindingsDetail,
  fetchCriticalityAssessment,
  fetchMethodologySummary,
  fetchTrendWindow,
  fetchBenchmarkComparison,
  fetchBlastRadius,
  fetchManifest,
  type Scan, type Finding, type TransformFinding, type Strength,
  type FindingDetailViewModel,
  type CriticalityAssessmentSummary, type CriticalityTier,
  type MethodologySummary,
  type HistoricalComparisonWindow,
  type BenchmarkSummary,
  type BlastRadiusResponse,
  type AssessmentManifest,
  CRITICALITY_TIER_COLORS, CRITICALITY_TIER_LABELS,
} from '../api/client';
import { MetricCard, PageHeader, PrimaryButton, Card } from '../components/Shared';
import { SeverityBadge } from '../components/SeverityBadge';
import { PropertyBadge } from '../components/PropertyBadge';
import { CostDisplay } from '../components/Badges';
import { PropertyRadar } from '../components/PropertyRadar';
import { SeverityDoughnut } from '../components/SeverityDoughnut';
import { CostBreakdownChart } from '../components/CostBreakdownChart';
import { ScanHistoryPanel } from '../components/ScanHistoryPanel';
import { FindingDetailPanel } from '../components/FindingDetailPanel';
import { RemediationPlanPanel } from '../components/RemediationPlanPanel';
import { MethodologyPanel } from '../components/MethodologyPanel';
import { TrendPanel } from '../components/TrendPanel';
import { BenchmarkPanel } from '../components/BenchmarkPanel';
import { BlastRadiusPanel } from '../components/BlastRadiusPanel';
import { ManifestPanel } from '../components/ManifestPanel';
import { useScanHistory } from '../hooks/useScanHistory';
import {
  formatCost, formatCostFull, formatDalcRange, PROPERTY_NAMES,
  scoreColor, type SeverityKey,
} from '../utils';
import { ScanDetailSkeleton } from '../components/LoadingSkeleton';
import { ErrorState } from '../components/ErrorState';

// ---------------------------------------------------------------------------
// Fallback: convert an in-memory Finding to a FindingDetailViewModel
// Used when the scan hasn't been persisted yet (still running).
// ---------------------------------------------------------------------------
function findingToViewModel(f: Finding): FindingDetailViewModel {
  return {
    id: f.id,
    checkId: f.check_id,
    property: f.property,
    severity: f.severity,
    title: f.title,
    description: f.description,
    assetType: null,
    assetKey: null,
    assetName: null,
    affectedObjects: f.affected_objects,
    totalObjects: f.total_objects,
    ratio: f.ratio,
    ratioPercent: `${(f.ratio * 100).toFixed(1)}%`,
    thresholdValue: null,
    observedValue: null,
    metricUnit: null,
    thresholdDisplay: null,
    whatWasFound: null,
    whyItMatters: null,
    howDetected: null,
    confidenceLevel: null,
    confidenceScore: null,
    confidenceReason: null,
    samples: [],
    provenance: null,
    remediation: f.remediation,
    costCategories: f.costCategories ?? [],
    costWeights: f.costWeights ?? {},
    methodology: null,
  };
}

// ---------------------------------------------------------------------------
// CriticalityBadge — compact tier chip
// ---------------------------------------------------------------------------
function CriticalityBadge({ tier, size = 'sm' }: { tier: CriticalityTier; size?: 'sm' | 'md' }) {
  const color = CRITICALITY_TIER_COLORS[tier];
  const label = CRITICALITY_TIER_LABELS[tier];
  const isMd = size === 'md';
  return (
    <span style={{
      display: 'inline-block', fontSize: isMd ? 11 : 9, fontWeight: 700,
      padding: isMd ? '2px 8px' : '1px 6px', borderRadius: 3, letterSpacing: '0.04em',
      background: `${color}18`, color,
      textTransform: 'uppercase',
    }}>
      {label}
    </span>
  );
}

// Sub-views
type ViewMode = 'overview' | 'findings' | 'detail' | 'transforms' | 'remediation' | 'methodology';

/** Look up the criticality tier for a finding's primary table/asset. */
function findingCriticalityTier(
  f: Finding,
  assessment: CriticalityAssessmentSummary | null,
): CriticalityTier | null {
  if (!assessment) return null;
  // Finding evidence[0].table is the primary asset key
  const assetKey = (f as any).evidence?.[0]?.table as string | undefined;
  if (!assetKey) return null;
  const match = assessment.allAssets.find(a => a.assetName === assetKey || a.assetKey === assetKey);
  return match?.criticalityTier ?? null;
}

const TRANSFORM_ACCEPTED = '.csv,.tsv,.xlsx,.xls';

export function ScanResults() {
  const { scanId } = useParams();
  const navigate = useNavigate();
  const [scan, setScan] = useState<Scan | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [engineResult, setEngineResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('overview');
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [findingDetail, setFindingDetail] = useState<FindingDetailViewModel | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [resultSetId, setResultSetId] = useState<string | null>(null);

  // Strengths state
  const [strengths, setStrengths] = useState<Strength[]>([]);

  // Transform state
  const [transformFindings, setTransformFindings] = useState<TransformFinding[]>([]);
  const [transformUploading, setTransformUploading] = useState(false);
  const [transformDragOver, setTransformDragOver] = useState(false);
  const transformFileRef = useRef<HTMLInputElement>(null);

  // Filters for findings view
  const [severityFilter, setSeverityFilter] = useState('all');
  const [propertyFilter, setPropertyFilter] = useState('all');
  const [sortBy, setSortBy] = useState('cost');

  // Filters for transform view
  const [transformCategoryFilter, setTransformCategoryFilter] = useState('all');
  const [transformSeverityFilter, setTransformSeverityFilter] = useState('all');
  // Upload error banner
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Criticality assessment
  const [criticality, setCriticality] = useState<CriticalityAssessmentSummary | null>(null);

  // Methodology summary
  const [methodology, setMethodology] = useState<MethodologySummary | null>(null);

  // Trend data
  const [trendData, setTrendData] = useState<HistoricalComparisonWindow | null>(null);

  // Benchmark data
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkSummary | null>(null);

  // Blast-radius data
  const [blastRadiusData, setBlastRadiusData] = useState<BlastRadiusResponse | null>(null);

  // Assessment manifest
  const [manifestData, setManifestData] = useState<AssessmentManifest | null>(null);

  // History panel toggle
  const [showHistory, setShowHistory] = useState(false);

  // Scan history — resolve projectId from the loaded scan
  const scanHistory = useScanHistory(scan?.project_id, scanId);

  const loadScan = useCallback(() => {
    if (!scanId) return;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchScan(scanId),
      fetchFindings(scanId),
      fetchEngineResult(scanId).catch(() => null),
      fetchTransformFindings(scanId).catch(() => []),
      fetchStrengths(scanId).catch(() => []),
    ])
      .then(([s, f, r, tf, st]) => {
        setScan(s); setFindings(f); setEngineResult(r); setTransformFindings(tf); setStrengths(st);
        // Resolve resultSetId for remediation plan + criticality
        fetchResultSetByScanId(scanId!).then(rs => {
          setResultSetId(rs.id);
          fetchCriticalityAssessment(rs.id).then(c => setCriticality(c)).catch(() => {});
          fetchMethodologySummary(rs.id).then(m => setMethodology(m)).catch(() => {});
          fetchBenchmarkComparison(rs.id).then(b => setBenchmarkData(b)).catch(() => {});
          fetchBlastRadius(rs.id).then(br => setBlastRadiusData(br)).catch(() => {});
          fetchManifest(rs.id).then(m => setManifestData(m)).catch(() => {});
        }).catch(() => {});
        // Load trend data if we have a project
        if (s.project_id) {
          fetchTrendWindow(s.project_id, 10).then(t => setTrendData(t)).catch(() => {});
        }
      })
      .catch((err) => setError(err?.message ?? 'Failed to load scan results'))
      .finally(() => setLoading(false));
  }, [scanId]);

  useEffect(() => { loadScan(); }, [loadScan]);

  // ---------------------------------------------------------------------------
  // Open evidence detail for a finding
  // Tries to load from persisted result_findings (full evidence envelope).
  // Falls back to building a minimal view model from the in-memory Finding.
  // ---------------------------------------------------------------------------
  const openFindingDetail = useCallback(async (finding: Finding) => {
    setSelectedFinding(finding);
    setView('detail');
    setDetailLoading(true);

    try {
      // Try to get the persisted result set for this scan
      const resultSet = await fetchResultSetByScanId(scanId!);
      const { findings: details } = await fetchResultFindingsDetail(resultSet.id);
      // Match by check_id (unique per finding within a scan)
      const match = details.find(d => d.checkId === finding.check_id);
      if (match) {
        setFindingDetail(match);
        setDetailLoading(false);
        return;
      }
    } catch {
      // Result set may not exist yet (scan still running) — fall through
    }

    // Fallback: build a minimal view model from the in-memory Finding
    setFindingDetail(findingToViewModel(finding));
    setDetailLoading(false);
  }, [scanId]);

  const handleTransformUpload = useCallback(async (files: FileList | File[]) => {
    if (!scanId || files.length === 0) return;
    const valid = Array.from(files).filter((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase();
      return ext && ['csv', 'tsv', 'xlsx', 'xls'].includes(ext);
    });
    if (valid.length === 0) return;

    setTransformUploading(true);
    try {
      const result = await uploadTransformFiles(scanId, valid);
      // Reload transform findings and scan
      const [tf, s] = await Promise.all([
        fetchTransformFindings(scanId),
        fetchScan(scanId),
      ]);
      setTransformFindings(tf);
      setScan(s);
    } catch (err: any) {
      setUploadError(err?.message ?? 'Transform upload failed');
    } finally {
      setTransformUploading(false);
    }
  }, [scanId]);

  if (loading) return <ScanDetailSkeleton />;
  if (error || !scan) return <ErrorState title="Scan not found" message={error ?? 'This scan could not be loaded.'} onRetry={loadScan} />;

  // Calculate costs per finding
  const findingCosts = new Map<number, number>();
  const totalCost = scan.total_cost ?? 0;

  // Try to distribute costs from engine result
  const amplifiedCosts = engineResult?.amplifiedCosts ?? engineResult?.result?.amplifiedCosts;
  if (amplifiedCosts) {
    // Weight-based distribution
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
  // Fallback: severity-weighted distribution
  if (findingCosts.size === 0 || [...findingCosts.values()].every(v => v === 0)) {
    const weights: Record<string, number> = { critical: 3, major: 2, minor: 1, info: 0.5 };
    const totalWeight = findings.reduce((s, f) => s + (weights[f.severity] ?? 1), 0);
    findings.forEach((f) => {
      findingCosts.set(f.id, totalWeight > 0 ? totalCost * (weights[f.severity] ?? 1) / totalWeight : 0);
    });
  }

  const getFindingCost = (f: Finding) => findingCosts.get(f.id) ?? 0;

  // Property scores
  const propertyData = [1, 2, 3, 4, 5, 6, 7, 8].map((pNum) => {
    const pFindings = findings.filter((f) => f.property === pNum);
    const avgSeverity = pFindings.length > 0
      ? pFindings.reduce((s, f) => s + f.raw_score, 0) / pFindings.length
      : 0;
    const score = Math.round((1 - avgSeverity) * 100);
    const cost = pFindings.reduce((s, f) => s + getFindingCost(f), 0);
    return {
      id: `P${pNum}`, name: PROPERTY_NAMES[pNum] ?? `Property ${pNum}`,
      score, findings: pFindings.length, cost,
    };
  });

  const avgScore = Math.round(propertyData.reduce((s, p) => s + p.score, 0) / propertyData.length);

  // Severity counts
  const severityCounts = { critical: scan.critical_count, major: scan.major_count, minor: scan.minor_count, info: scan.info_count };

  // Cost categories for breakdown
  const costCategories = amplifiedCosts
    ? Object.entries(amplifiedCosts)
        .filter(([k]) => k !== 'total' && typeof (amplifiedCosts as any)[k] === 'number')
        .map(([key, amount]) => ({ key, amount: amount as number }))
        .sort((a, b) => b.amount - a.amount)
    : [];

  // Affected tables count
  const allAffected = new Set(findings.flatMap((f) => f.evidence?.map?.((e: any) => e.table ?? e.tableName) ?? []));
  const tablesAffected = allAffected.size || Math.round((scan.schema_tables ?? 0) * 0.38);

  // Sub-navigation tabs
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'findings', label: `Findings (${findings.length})` },
    { id: 'transforms', label: `Transforms${transformFindings.length > 0 ? ` (${transformFindings.length})` : ''}` },
    { id: 'remediation', label: 'Remediation' },
    ...(methodology ? [{ id: 'methodology', label: 'Methodology' }] : []),
  ];

  const selectStyle: React.CSSProperties = {
    background: '#1A1F2E', color: '#D1D5DB', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6, padding: '6px 10px', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', outline: 'none',
  };

  // Detail view — evidence-rich panel
  if (view === 'detail' && selectedFinding) {
    if (detailLoading) {
      return (
        <div>
          <button
            onClick={() => { setView('findings'); setSelectedFinding(null); setFindingDetail(null); }}
            style={{ color: '#9CA3AF', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', marginBottom: 16, fontFamily: 'inherit' }}
          >
            ← Back to findings
          </button>
          <Card style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ color: '#9CA3AF', fontSize: 13 }}>Loading finding detail…</div>
          </Card>
        </div>
      );
    }
    if (findingDetail) {
      return (
        <FindingDetailPanel
          detail={findingDetail}
          cost={getFindingCost(selectedFinding)}
          criticalityTier={findingCriticalityTier(selectedFinding, criticality)}
          onBack={() => { setView('findings'); setSelectedFinding(null); setFindingDetail(null); }}
        />
      );
    }
    // Fallback to legacy detail if somehow no view model (shouldn't happen)
    return <FindingDetail finding={selectedFinding} cost={getFindingCost(selectedFinding)} onBack={() => { setView('findings'); setSelectedFinding(null); setFindingDetail(null); }} />;
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ color: 'white', fontSize: 20, fontWeight: 700, margin: 0 }}>Scan Results</h1>
          <p style={{ color: '#6B7280', fontSize: 12, margin: '4px 0 0' }}>
            {scan.is_dry_run ? '(Dry Run) · ' : ''}{scan.db_version ? <span style={{ color: '#9CA3AF', fontWeight: 500 }}>{scan.db_version} &middot; </span> : scan.source === 'csv' ? 'CSV Upload · ' : scan.source === 'powerbi' ? 'Power BI Template · ' : scan.source === 'tableau' ? 'Tableau Workbook · ' : scan.source === 'pipeline' ? 'Pipeline Analysis · ' : ''}{scan.schema_count ?? '?'} schemas &middot; {scan.schema_tables ?? '?'} tables &middot; {scan.schema_columns ?? '?'} columns
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setView(t.id as ViewMode)} style={{
              padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
              border: 'none', cursor: 'pointer',
              background: view === t.id ? 'rgba(16,185,129,0.1)' : 'transparent',
              color: view === t.id ? '#10B981' : '#9CA3AF',
            }}>
              {t.label}
            </button>
          ))}
          <button
            onClick={() => setShowHistory((v) => !v)}
            data-testid="history-toggle"
            style={{
              padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
              border: 'none', cursor: 'pointer',
              background: showHistory ? 'rgba(129,140,248,0.1)' : 'transparent',
              color: showHistory ? '#818CF8' : '#9CA3AF',
            }}
          >
            History{scanHistory.history.length > 0 ? ` (${scanHistory.history.length})` : ''}
          </button>
          <a href={getExportHtmlUrl(scanId!)} download style={{
            background: 'rgba(16,185,129,0.1)', color: '#10B981', border: '1px solid rgba(16,185,129,0.25)',
            padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, textDecoration: 'none',
            display: 'inline-flex', alignItems: 'center',
          }}>
            Export ↓
          </a>
        </div>
      </div>

      {uploadError && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 8, padding: '10px 16px', marginBottom: 12,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ color: '#FCA5A5', fontSize: 13 }}>Upload failed: {uploadError}</span>
          <button onClick={() => setUploadError(null)} style={{
            background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer',
            fontSize: 16, fontFamily: 'inherit', padding: '0 4px',
          }}>×</button>
        </div>
      )}

      {/* === HISTORY PANEL === */}
      {showHistory && (
        <ScanHistoryPanel
          history={scanHistory.history}
          selectedResultSetId={scanHistory.selectedResultSetId}
          comparison={scanHistory.comparison}
          loading={scanHistory.historyLoading}
          onSelect={scanHistory.selectResultSet}
        />
      )}

      {/* Loading indicator for result set switch */}
      {scanHistory.resultLoading && (
        <div style={{
          background: 'rgba(129,140,248,0.08)', border: '1px solid rgba(129,140,248,0.2)',
          borderRadius: 8, padding: '8px 16px', marginBottom: 12,
          color: '#A5B4FC', fontSize: 12, textAlign: 'center',
        }}>
          Loading historical result set…
        </div>
      )}

      {/* === OVERVIEW === */}
      {view === 'overview' && (
        <>
          {/* Hero Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
            <MetricCard
              label="Estimated Annual Cost"
              value={formatCostFull(totalCost)}
              color="#F59E0B"
              sub={(() => {
                const low = engineResult?.adjustedTotal ?? engineResult?.result?.adjustedTotal;
                const high = engineResult?.amplifiedTotal ?? engineResult?.result?.amplifiedTotal;
                if (low != null && high != null && low !== high) {
                  return `Range: ${formatDalcRange(low, totalCost, high)}`;
                }
                return 'of poor data architecture';
              })()}
            />
            <MetricCard label="Total Findings" value={scan.total_findings} color="#EF4444" sub={`${scan.critical_count} critical · ${scan.major_count} major`} />
            <MetricCard label="Tables Affected" value={`${tablesAffected} / ${scan.schema_tables ?? '?'}`} color="#818CF8" sub={`${scan.schema_tables ? Math.round(tablesAffected / scan.schema_tables * 100) : '?'}% of scanned tables`} />
            <MetricCard label="Architecture Health" value={`${avgScore}/100`} color={scoreColor(avgScore)} sub="across 8 properties" />
          </div>

          {/* Asset Criticality Summary */}
          {criticality && criticality.totalAssetsAssessed > 0 && (
            <Card style={{ marginBottom: 20, overflow: 'hidden' }}>
              <div style={{
                padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontSize: 14 }}>◆</span>
                <span className="label-text" style={{ color: '#F59E0B' }}>Asset Criticality</span>
                <span style={{ color: '#6B7280', fontSize: 11, marginLeft: 'auto' }}>
                  {criticality.totalAssetsAssessed} assets assessed
                </span>
              </div>
              <div style={{ padding: 16 }}>
                {/* Tier distribution bar */}
                <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                  {(['critical', 'high', 'medium', 'low'] as CriticalityTier[]).map((tier) => {
                    const count = criticality.tierDistribution[tier] ?? 0;
                    const pct = criticality.totalAssetsAssessed > 0
                      ? Math.round((count / criticality.totalAssetsAssessed) * 100)
                      : 0;
                    return (
                      <div key={tier} style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: CRITICALITY_TIER_COLORS[tier] }}>
                            {CRITICALITY_TIER_LABELS[tier]}
                          </span>
                          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#9CA3AF' }}>
                            {count}
                          </span>
                        </div>
                        <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)' }}>
                          <div style={{
                            height: '100%', borderRadius: 3,
                            background: CRITICALITY_TIER_COLORS[tier],
                            width: `${pct}%`,
                            transition: 'width 0.3s ease',
                          }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Summary stats */}
                <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
                  <div>
                    <div style={{ color: '#6B7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Avg Score</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700, color: '#E5E7EB' }}>
                      {Math.round(criticality.averageCriticalityScore)}<span style={{ fontSize: 12, color: '#6B7280' }}>/100</span>
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#6B7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>CDE Candidates</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700, color: '#EF4444' }}>
                      {criticality.totalCdeCandidates}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#6B7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Critical Assets</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700, color: '#EF4444' }}>
                      {criticality.tierDistribution.critical ?? 0}
                    </div>
                  </div>
                </div>

                {/* Top critical assets list */}
                {criticality.topCriticalAssets.length > 0 && (
                  <div>
                    <div style={{ color: '#6B7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                      Top Critical Assets
                    </div>
                    {criticality.topCriticalAssets.slice(0, 5).map((asset) => (
                      <div key={asset.assetKey} style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                      }}>
                        <CriticalityBadge tier={asset.criticalityTier} />
                        <span style={{ color: '#E5E7EB', fontSize: 12, fontWeight: 500, flex: 1 }}>{asset.assetName}</span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#9CA3AF' }}>
                          {Math.round(asset.criticalityScore)}
                        </span>
                        {asset.cdeCandidate && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                            background: 'rgba(239,68,68,0.1)', color: '#EF4444', letterSpacing: '0.05em',
                          }}>CDE</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* What's Working Well */}
          {strengths.length > 0 && (
            <Card style={{ marginBottom: 20, overflow: 'hidden' }}>
              <div style={{
                padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontSize: 14 }}>✓</span>
                <span className="label-text" style={{ color: '#10B981' }}>What's Working Well</span>
                <span style={{ color: '#6B7280', fontSize: 11, marginLeft: 'auto' }}>
                  {strengths.length} positive observation{strengths.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 0 }}>
                {strengths.map((s) => (
                  <div key={s.id} style={{
                    padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                    borderRight: '1px solid rgba(255,255,255,0.04)',
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                  }}>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
                      color: '#10B981', background: 'rgba(16,185,129,0.1)',
                      padding: '2px 5px', borderRadius: 3, flexShrink: 0, marginTop: 1,
                    }}>P{s.property}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: '#E5E7EB', fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{s.title}</div>
                      <div style={{ color: '#9CA3AF', fontSize: 11, lineHeight: 1.4 }}>{s.detail ?? s.description}</div>
                      {s.metric && (
                        <span style={{
                          display: 'inline-block', marginTop: 4,
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
                          color: '#10B981', background: 'rgba(16,185,129,0.08)',
                          padding: '1px 6px', borderRadius: 3,
                        }}>{s.metric}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Middle Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 1fr', gap: 12, marginBottom: 20 }}>
            {/* Severity */}
            <Card style={{ padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div className="label-text" style={{ marginBottom: 12, alignSelf: 'flex-start' }}>By Severity</div>
              <SeverityDoughnut counts={severityCounts} size={140} />
            </Card>

            {/* Radar */}
            <Card style={{ padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div className="label-text" style={{ marginBottom: 4, alignSelf: 'flex-start' }}>Property Health</div>
              <PropertyRadar properties={propertyData} size={240} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, width: '100%', marginTop: 4 }}>
                {propertyData.map((p) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#9CA3AF' }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#10B981', fontWeight: 600, width: 20 }}>{p.id}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{p.name}</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", color: scoreColor(p.score), fontWeight: 600 }}>{p.score}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Cost Breakdown */}
            <Card style={{ padding: 16 }}>
              <div className="label-text" style={{ marginBottom: 16 }}>Cost Breakdown</div>
              {costCategories.length > 0 ? (
                <CostBreakdownChart categories={costCategories} />
              ) : (
                <div style={{ color: '#6B7280', fontSize: 12, textAlign: 'center', padding: 20 }}>
                  Cost breakdown not available
                </div>
              )}
            </Card>
          </div>

          {/* Top Findings by Cost */}
          <Card>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="label-text">Top Findings by Cost Impact</span>
              <button onClick={() => setView('findings')} style={{ color: '#10B981', fontSize: 11, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                View all {findings.length} →
              </button>
            </div>
            {[...findings].sort((a, b) => getFindingCost(b) - getFindingCost(a)).slice(0, 5).map((f, i) => (
              <div key={f.id}
                onClick={() => openFindingDetail(f)}
                style={{
                  padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
                  borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  cursor: 'pointer', transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#6B7280', fontSize: 11, width: 16 }}>{i + 1}</span>
                <SeverityBadge severity={f.severity as SeverityKey} compact />
                <PropertyBadge property={f.property} />
                {(() => { const t = findingCriticalityTier(f, criticality); return t ? <CriticalityBadge tier={t} /> : null; })()}
                <span style={{ color: '#E5E7EB', fontSize: 13, fontWeight: 500, flex: 1 }}>{f.title}</span>
                <span style={{ color: '#6B7280', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>{f.affected_objects} objects</span>
                <CostDisplay amount={getFindingCost(f)} size="sm" />
              </div>
            ))}
          </Card>

          {/* Trend & Regression Panel */}
          {trendData && trendData.windowSize >= 2 && (
            <div style={{ marginTop: 20 }}>
              <TrendPanel trend={trendData} />
            </div>
          )}

          {/* Benchmark Comparison Panel */}
          {benchmarkData && (
            <div style={{ marginTop: 20 }}>
              <BenchmarkPanel benchmark={benchmarkData} />
            </div>
          )}

          {/* Economic Blast-Radius Panel */}
          {blastRadiusData && (
            <div style={{ marginTop: 20 }}>
              <BlastRadiusPanel data={blastRadiusData} />
            </div>
          )}

          {/* Assessment Manifest Panel */}
          {manifestData && (
            <div style={{ marginTop: 20 }}>
              <ManifestPanel manifest={manifestData} />
            </div>
          )}
        </>
      )}

      {/* === FINDINGS LIST === */}
      {view === 'findings' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ color: '#6B7280', fontSize: 12 }}>
              {findings.length} findings &middot; {formatCostFull(totalCost)} estimated cost
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} style={selectStyle}>
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="major">Major</option>
                <option value="minor">Minor</option>
                <option value="info">Info</option>
              </select>
              <select value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)} style={selectStyle}>
                <option value="all">All Properties</option>
                {[1,2,3,4,5,6,7,8].map((n) => <option key={n} value={String(n)}>P{n} — {PROPERTY_NAMES[n]}</option>)}
              </select>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={selectStyle}>
                <option value="cost">Sort: Cost ↓</option>
                <option value="severity">Sort: Severity</option>
                <option value="name">Sort: Name</option>
              </select>
            </div>
          </div>

          <Card>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 50px 60px 80px 90px', gap: 12, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
              <span className="label-text">Finding</span>
              <span className="label-text">Severity</span>
              <span className="label-text">Prop</span>
              <span className="label-text">Crit.</span>
              <span className="label-text" style={{ textAlign: 'right' }}>Objects</span>
              <span className="label-text" style={{ textAlign: 'right' }}>Est. Cost/yr</span>
            </div>
            {[...findings]
              .filter((f) => severityFilter === 'all' || f.severity === severityFilter)
              .filter((f) => propertyFilter === 'all' || f.property === +propertyFilter)
              .sort((a, b) => {
                if (sortBy === 'cost') return getFindingCost(b) - getFindingCost(a);
                if (sortBy === 'severity') return a.raw_score > b.raw_score ? -1 : 1;
                return a.title.localeCompare(b.title);
              })
              .map((f, i, arr) => (
              <div key={f.id}
                onClick={() => openFindingDetail(f)}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr 70px 50px 60px 80px 90px', gap: 12, padding: '12px 16px',
                  borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                  cursor: 'pointer', transition: 'background 0.1s', alignItems: 'center',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ color: '#E5E7EB', fontSize: 13, fontWeight: 500 }}>{f.title}</span>
                <SeverityBadge severity={f.severity as SeverityKey} compact />
                <PropertyBadge property={f.property} />
                <span>{(() => { const t = findingCriticalityTier(f, criticality); return t ? <CriticalityBadge tier={t} /> : <span style={{ color: '#374151', fontSize: 9 }}>—</span>; })()}</span>
                <span style={{ color: '#9CA3AF', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", textAlign: 'right' }}>{f.affected_objects}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#F59E0B', fontSize: 13, fontWeight: 600, textAlign: 'right' }}>{formatCost(getFindingCost(f))}</span>
              </div>
            ))}
          </Card>
        </>
      )}

      {/* === TRANSFORM CLARITY === */}
      {view === 'transforms' && (
        <TransformView
          scanId={scanId!}
          findings={transformFindings}
          scan={scan}
          uploading={transformUploading}
          dragOver={transformDragOver}
          setDragOver={setTransformDragOver}
          fileRef={transformFileRef}
          onUpload={handleTransformUpload}
          categoryFilter={transformCategoryFilter}
          setCategoryFilter={setTransformCategoryFilter}
          severityFilter={transformSeverityFilter}
          setSeverityFilter={setTransformSeverityFilter}
          selectStyle={selectStyle}
        />
      )}

      {/* === REMEDIATION PLAN === */}
      {view === 'remediation' && (
        <RemediationPlanPanel resultSetId={resultSetId} />
      )}

      {/* === METHODOLOGY & CONFIDENCE === */}
      {view === 'methodology' && methodology && (
        <MethodologyPanel summary={methodology} />
      )}
    </div>
  );
}

// --- TRANSFORM VIEW ---

const CATEGORY_LABELS: Record<string, string> = {
  'semantic-drift': 'Semantic Drift',
  'ontological-break': 'Ontological Break',
};

const CATEGORY_COLORS: Record<string, string> = {
  'semantic-drift': '#818CF8',
  'ontological-break': '#F59E0B',
};

function CategoryBadge({ category }: { category: string }) {
  const color = CATEGORY_COLORS[category] ?? '#6B7280';
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
      background: `${color}22`, color, textTransform: 'uppercase', letterSpacing: '0.03em',
      whiteSpace: 'nowrap',
    }}>
      {category === 'semantic-drift' ? 'SD' : 'OB'}
    </span>
  );
}

function TransformView({
  scanId, findings, scan, uploading, dragOver, setDragOver, fileRef, onUpload,
  categoryFilter, setCategoryFilter, severityFilter, setSeverityFilter, selectStyle,
}: {
  scanId: string;
  findings: TransformFinding[];
  scan: Scan;
  uploading: boolean;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  fileRef: React.RefObject<HTMLInputElement>;
  onUpload: (files: FileList | File[]) => void;
  categoryFilter: string;
  setCategoryFilter: (v: string) => void;
  severityFilter: string;
  setSeverityFilter: (v: string) => void;
  selectStyle: React.CSSProperties;
}) {
  const hasFindings = findings.length > 0;
  const hasMappings = (scan.transform_mappings ?? 0) > 0;

  // Summary counts
  const sdCount = findings.filter((f) => f.category === 'semantic-drift').length;
  const obCount = findings.filter((f) => f.category === 'ontological-break').length;
  const critCount = findings.filter((f) => f.severity === 'critical').length;
  const majCount = findings.filter((f) => f.severity === 'major').length;

  return (
    <>
      {/* Upload zone or summary */}
      {!hasMappings ? (
        <Card style={{ padding: 32, textAlign: 'center', marginBottom: 16 }}>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); onUpload(e.dataTransfer.files); }}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? '#818CF8' : 'rgba(255,255,255,0.12)'}`,
              borderRadius: 8, padding: 40, cursor: uploading ? 'wait' : 'pointer',
              background: dragOver ? 'rgba(129,140,248,0.05)' : 'rgba(255,255,255,0.02)',
              transition: 'all 0.15s',
            }}
          >
            <div style={{ fontSize: 28, opacity: 0.3, marginBottom: 8 }}>+</div>
            <div style={{ color: '#D1D5DB', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
              {uploading ? 'Analysing mappings...' : 'Upload Transform Mapping Files'}
            </div>
            <div style={{ color: '#9CA3AF', fontSize: 12, marginBottom: 8 }}>
              Source-to-target mapping CSV or Excel files
            </div>
            <div style={{ color: '#6B7280', fontSize: 11 }}>
              Expected columns: Source Table, Source Column, Target Table, Target Column, Transform Rule, etc.
            </div>
            <input
              ref={fileRef}
              type="file"
              accept={TRANSFORM_ACCEPTED}
              multiple
              style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files) onUpload(e.target.files); e.target.value = ''; }}
            />
          </div>
        </Card>
      ) : (
        <>
          {/* Summary metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            <MetricCard label="Total Findings" value={scan.transform_total ?? 0} color="#EF4444" sub={`${critCount} critical \u00b7 ${majCount} major`} />
            <MetricCard label="Semantic Drift" value={sdCount} color="#818CF8" sub="naming, type, aggregation issues" />
            <MetricCard label="Ontological Breaks" value={obCount} color="#F59E0B" sub="entity merge, split, flatten" />
            <MetricCard label="Mappings Analysed" value={scan.transform_mappings ?? 0} color="#10B981" sub="source-to-target columns" />
          </div>

          {/* Re-upload option */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ color: '#6B7280', fontSize: 12 }}>
              {findings.length} transform findings across {scan.transform_mappings ?? '?'} mappings
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={selectStyle}>
                <option value="all">All Categories</option>
                <option value="semantic-drift">Semantic Drift</option>
                <option value="ontological-break">Ontological Break</option>
              </select>
              <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} style={selectStyle}>
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="major">Major</option>
                <option value="minor">Minor</option>
              </select>
            </div>
          </div>

          {/* Findings list */}
          <Card>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 40px 70px 80px', gap: 12, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
              <span className="label-text">Finding</span>
              <span className="label-text">Cat</span>
              <span className="label-text">Severity</span>
              <span className="label-text" style={{ textAlign: 'right' }}>Mappings</span>
            </div>
            {findings
              .filter((f) => categoryFilter === 'all' || f.category === categoryFilter)
              .filter((f) => severityFilter === 'all' || f.severity === severityFilter)
              .map((f, i, arr) => (
              <TransformFindingRow key={f.id} finding={f} isLast={i === arr.length - 1} />
            ))}
            {findings
              .filter((f) => categoryFilter === 'all' || f.category === categoryFilter)
              .filter((f) => severityFilter === 'all' || f.severity === severityFilter)
              .length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: '#6B7280', fontSize: 13 }}>
                No findings match the selected filters.
              </div>
            )}
          </Card>
        </>
      )}
    </>
  );
}

function TransformFindingRow({ finding, isLast }: { finding: TransformFinding; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'grid', gridTemplateColumns: '1fr 40px 70px 80px', gap: 12, padding: '12px 16px',
          borderBottom: !isLast && !expanded ? '1px solid rgba(255,255,255,0.04)' : 'none',
          cursor: 'pointer', transition: 'background 0.1s', alignItems: 'center',
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
      >
        <span style={{ color: '#E5E7EB', fontSize: 13, fontWeight: 500 }}>{finding.title}</span>
        <CategoryBadge category={finding.category} />
        <SeverityBadge severity={finding.severity as SeverityKey} compact />
        <span style={{ color: '#9CA3AF', fontSize: 12, fontFamily: "'JetBrains Mono', monospace", textAlign: 'right' }}>
          {finding.affected_mappings} / {finding.total_mappings}
        </span>
      </div>
      {expanded && (
        <div style={{
          padding: '0 16px 16px', borderBottom: !isLast ? '1px solid rgba(255,255,255,0.04)' : 'none',
          background: 'rgba(255,255,255,0.01)',
        }}>
          {finding.description && (
            <p style={{ color: '#D1D5DB', fontSize: 12, lineHeight: 1.6, margin: '0 0 12px' }}>{finding.description}</p>
          )}

          {/* Evidence */}
          {finding.evidence && finding.evidence.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div className="label-text" style={{ marginBottom: 6 }}>Evidence ({finding.evidence.length} mappings)</div>
              <div style={{ maxHeight: 200, overflow: 'auto' }}>
                {finding.evidence.slice(0, 10).map((e, i) => (
                  <div key={i} style={{
                    padding: '4px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 4, marginBottom: 2,
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#D1D5DB',
                    display: 'flex', justifyContent: 'space-between', gap: 8,
                  }}>
                    <span>{e.sourceTable}.{e.sourceColumn}</span>
                    <span style={{ color: '#6B7280' }}>{'\u2192'}</span>
                    <span>{e.targetTable}.{e.targetColumn}</span>
                    <span style={{ color: '#9CA3AF', flex: 1, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.detail}
                    </span>
                  </div>
                ))}
                {finding.evidence.length > 10 && (
                  <div style={{ color: '#6B7280', fontSize: 11, marginTop: 4 }}>
                    + {finding.evidence.length - 10} more
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Remediation */}
          {finding.remediation && (
            <div style={{
              padding: '8px 12px', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 6,
              background: 'rgba(16,185,129,0.03)',
            }}>
              <div style={{ color: '#10B981', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                Remediation
              </div>
              <p style={{ color: '#D1D5DB', fontSize: 12, lineHeight: 1.6, margin: 0 }}>{finding.remediation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- FINDING DETAIL ---

function FindingDetail({ finding, cost, onBack }: { finding: Finding; cost: number; onBack: () => void }) {
  const propertyName = PROPERTY_NAMES[finding.property] ?? `Property ${finding.property}`;

  // Extract table names from evidence
  const tables = (finding.evidence ?? []).slice(0, 10).map((e: any) => e.table ?? e.tableName ?? e.name ?? JSON.stringify(e));

  return (
    <div>
      <button onClick={onBack} style={{ color: '#9CA3AF', fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', marginBottom: 16, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
        ← Back to findings
      </button>

      {/* Header Card */}
      <Card style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <SeverityBadge severity={finding.severity as SeverityKey} />
              <PropertyBadge property={finding.property} />
              <span style={{ color: '#6B7280', fontSize: 11, padding: '2px 0' }}>{propertyName}</span>
            </div>
            <h2 style={{ color: 'white', fontSize: 18, fontWeight: 700, margin: 0 }}>{finding.title}</h2>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="label-text" style={{ marginBottom: 4 }}>Est. Annual Cost</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 28, fontWeight: 700, color: '#F59E0B' }}>
              {formatCostFull(cost)}
            </div>
          </div>
        </div>
        {finding.description && (
          <p style={{ color: '#D1D5DB', fontSize: 13, lineHeight: 1.7, margin: 0 }}>{finding.description}</p>
        )}
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Affected Objects */}
        <Card style={{ padding: 16 }}>
          <h3 className="label-text" style={{ margin: '0 0 12px' }}>Affected Objects ({finding.affected_objects})</h3>
          {tables.map((t: string, i: number) => (
            <div key={i} style={{
              padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 4, marginBottom: 4,
              fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#D1D5DB',
            }}>
              {t}
            </div>
          ))}
          {finding.affected_objects > tables.length && (
            <div style={{ color: '#6B7280', fontSize: 11, marginTop: 8 }}>
              + {finding.affected_objects - tables.length} more objects in full report
            </div>
          )}
        </Card>

        {/* Remediation */}
        <div>
          {finding.remediation && (
            <Card style={{ border: '1px solid rgba(16,185,129,0.2)', padding: 16, marginBottom: 16 }}>
              <h3 style={{ color: '#10B981', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>
                Remediation
              </h3>
              <p style={{ color: '#D1D5DB', fontSize: 13, lineHeight: 1.7, margin: 0 }}>{finding.remediation}</p>
            </Card>
          )}
          <Card style={{ border: '1px solid rgba(245,158,11,0.2)', padding: 16 }}>
            <h3 style={{ color: '#F59E0B', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>
              Scan Metrics
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <span style={{ color: '#6B7280', fontSize: 11 }}>Raw Score</span>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", color: '#D1D5DB', fontSize: 14 }}>{finding.raw_score.toFixed(3)}</div>
              </div>
              <div>
                <span style={{ color: '#6B7280', fontSize: 11 }}>Ratio</span>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", color: '#D1D5DB', fontSize: 14 }}>{(finding.ratio * 100).toFixed(1)}%</div>
              </div>
              <div>
                <span style={{ color: '#6B7280', fontSize: 11 }}>Affected</span>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", color: '#D1D5DB', fontSize: 14 }}>{finding.affected_objects} / {finding.total_objects}</div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
