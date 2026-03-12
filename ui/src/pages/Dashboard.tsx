import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchDashboard, fetchProjects, type DashboardStats, type Project } from '../api/client';
import { MetricCard, Card, PageHeader, PrimaryButton, EmptyState } from '../components/Shared';
import { WelcomeWizard } from '../components/WelcomeWizard';
import { StatusBadge, SectorBadge } from '../components/Badges';
import { DashboardSkeleton } from '../components/LoadingSkeleton';
import { ErrorState } from '../components/ErrorState';
import { formatCost, formatNumber, timeAgo, SEVERITY_CONFIG, type SeverityKey } from '../utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert "#RRGGBB" to "rgba(r,g,b,alpha)" */
function hexAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ---------------------------------------------------------------------------
// ActionButton — used in Quick Actions panel
// ---------------------------------------------------------------------------

function ActionButton({ icon, label, description, color, onClick }: {
  icon: string; label: string; description: string; color: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 14px', borderRadius: 6,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
      }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 6,
        background: hexAlpha(color, 0.1),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, color, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div>
        <div style={{ color: '#E5E7EB', fontSize: 13, fontWeight: 600 }}>{label}</div>
        <div style={{ color: '#6B7280', fontSize: 11, marginTop: 1 }}>{description}</div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [wizardDismissed, setWizardDismissed] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([fetchDashboard(), fetchProjects()])
      .then(([s, p]) => { setStats(s); setProjects(p); })
      .catch((err) => setError(err?.message ?? 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // ---------------------------------------------------------------------------
  // Computed aggregates (across recentScans)
  // ---------------------------------------------------------------------------
  const agg = useMemo(() => {
    if (!stats) return null;
    const scans = stats.recentScans;

    let critical = 0, major = 0, minor = 0, info = 0;
    let totalCost = 0;
    let totalTables = 0, totalColumns = 0, totalSchemas = 0;
    const sources = new Set<string>();

    for (const s of scans) {
      critical += s.critical_count ?? 0;
      major += s.major_count ?? 0;
      minor += s.minor_count ?? 0;
      info += s.info_count ?? 0;
      totalCost += s.total_cost ?? 0;
      totalTables += s.schema_tables ?? 0;
      totalColumns += s.schema_columns ?? 0;
      totalSchemas += s.schema_count ?? 0;
      if (s.source) sources.add(s.source);
    }

    return {
      critical, major, minor, info,
      totalFindings: critical + major + minor + info,
      totalCost, totalTables, totalColumns, totalSchemas,
      sources: Array.from(sources),
    };
  }, [stats]);

  // ---------------------------------------------------------------------------
  // Loading / Error / Welcome gates
  // ---------------------------------------------------------------------------
  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  // First-time user: zero projects → show Welcome Wizard
  if (!stats || projects.length === 0) {
    if (!wizardDismissed) {
      return <WelcomeWizard onComplete={() => setWizardDismissed(true)} />;
    }
    return (
      <EmptyState
        icon={'\u2B21'}
        title="Welcome to Schaaq Scanner"
        description="Create your first project to start analysing data architecture costs."
        action={<PrimaryButton onClick={() => navigate('/projects/new')}>Create Project &rarr;</PrimaryButton>}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Severity data for charts
  // ---------------------------------------------------------------------------
  const severities: { key: SeverityKey; count: number }[] = [
    { key: 'critical', count: agg?.critical ?? 0 },
    { key: 'major', count: agg?.major ?? 0 },
    { key: 'minor', count: agg?.minor ?? 0 },
    { key: 'info', count: agg?.info ?? 0 },
  ];
  const barTotal = agg?.totalFindings ?? 0;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`${stats.totalProjects} project${stats.totalProjects !== 1 ? 's' : ''} · ${stats.totalScans} scan${stats.totalScans !== 1 ? 's' : ''} completed`}
      />

      {/* ===== ROW 1 — Hero Metrics ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <MetricCard label="Total Projects"       value={stats.totalProjects}           color="#818CF8" />
        <MetricCard label="Completed Scans"      value={stats.totalScans}              color="#10B981" />
        <MetricCard label="Total Cost Identified" value={formatCost(agg?.totalCost)}   color="#F59E0B" sub="across recent scans" />
        <MetricCard label="Average Cost"          value={formatCost(stats.averageCost)} color="#F59E0B" sub="per scan" />
      </div>

      {/* ===== ROW 2 — Severity Distribution (60%) + Data Landscape (40%) ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 12, marginBottom: 20 }}>

        {/* Severity Distribution */}
        <Card>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="label-text">Severity Distribution</span>
            <span style={{ color: '#6B7280', fontSize: 11 }}>
              {formatNumber(barTotal)} finding{barTotal !== 1 ? 's' : ''} across {stats.recentScans.length} recent scan{stats.recentScans.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div style={{ padding: 16 }}>
            {barTotal > 0 ? (
              <>
                {/* Stacked horizontal bar */}
                <div style={{
                  display: 'flex', height: 28, borderRadius: 6, overflow: 'hidden',
                  background: 'rgba(255,255,255,0.04)', marginBottom: 16,
                }}>
                  {severities.map(({ key, count }) => {
                    const pct = (count / barTotal) * 100;
                    if (pct === 0) return null;
                    return (
                      <div key={key} title={`${SEVERITY_CONFIG[key].label}: ${count}`} style={{
                        width: `${pct}%`, background: SEVERITY_CONFIG[key].color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 700, color: '#111827',
                        fontFamily: "'JetBrains Mono', monospace",
                        transition: 'width 0.6s ease',
                      }}>
                        {pct >= 8 ? count : ''}
                      </div>
                    );
                  })}
                </div>

                {/* Stat pills */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {severities.map(({ key, count }) => (
                    <div key={key} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: SEVERITY_CONFIG[key].bg,
                      border: `1px solid ${SEVERITY_CONFIG[key].border}`,
                      padding: '4px 10px', borderRadius: 6,
                    }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: SEVERITY_CONFIG[key].color, flexShrink: 0,
                      }} />
                      <span style={{
                        fontSize: 11, fontWeight: 600, color: SEVERITY_CONFIG[key].color,
                        fontFamily: "'JetBrains Mono', monospace",
                      }}>
                        {count}
                      </span>
                      <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                        {SEVERITY_CONFIG[key].label}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ color: '#6B7280', fontSize: 12, textAlign: 'center', padding: '20px 0' }}>
                No findings yet — run a scan to see severity distribution
              </div>
            )}
          </div>
        </Card>

        {/* Data Landscape */}
        <Card>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="label-text">Data Landscape</span>
          </div>
          <div style={{ padding: 16 }}>
            {/* Tables / Columns / Schemas counters */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
              {([
                { label: 'Tables',  value: agg?.totalTables ?? 0,  color: '#3B82F6' },
                { label: 'Columns', value: agg?.totalColumns ?? 0, color: '#818CF8' },
                { label: 'Schemas', value: agg?.totalSchemas ?? 0, color: '#06B6D4' },
              ] as const).map((item) => (
                <div key={item.label} style={{ textAlign: 'center' }}>
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 20, fontWeight: 700, color: item.color,
                    letterSpacing: '-0.02em',
                  }}>
                    {formatNumber(item.value)}
                  </div>
                  <div style={{ color: '#6B7280', fontSize: 10, marginTop: 2, fontWeight: 500 }}>
                    {item.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Source badges */}
            {agg && agg.sources.length > 0 && (
              <div>
                <div style={{
                  color: '#6B7280', fontSize: 10, fontWeight: 600,
                  marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em',
                }}>
                  Data Sources
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {agg.sources.map((src) => (
                    <span key={src} style={{
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      padding: '3px 8px', borderRadius: 4,
                      fontSize: 10, fontWeight: 600, color: '#D1D5DB',
                      textTransform: 'uppercase', letterSpacing: '0.03em',
                    }}>
                      {src}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ===== ROW 3 — Recent Scans Table ===== */}
      {stats.recentScans.length > 0 && (
        <Card style={{ marginBottom: 20 }}>
          <div style={{
            padding: '14px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span className="label-text">Recent Scans</span>
            <button onClick={() => navigate('/projects')} style={{
              color: '#10B981', fontSize: 11, fontWeight: 500,
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              View all →
            </button>
          </div>

          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 0.7fr 0.9fr 1.6fr 0.8fr 0.6fr 0.7fr',
            padding: '8px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}>
            {['Project', 'Source', 'Schema', 'Severity', 'Cost', 'Status', 'Time'].map((h) => (
              <span key={h} style={{
                color: '#6B7280', fontSize: 10, fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                {h}
              </span>
            ))}
          </div>

          {/* Table rows */}
          {stats.recentScans.map((scan, i) => (
            <div
              key={scan.id}
              onClick={() => navigate(`/scans/${scan.id}/results`)}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.4fr 0.7fr 0.9fr 1.6fr 0.8fr 0.6fr 0.7fr',
                padding: '10px 16px', alignItems: 'center',
                borderBottom: i < stats.recentScans.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                cursor: 'pointer', transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              {/* Project name */}
              <span style={{
                color: '#E5E7EB', fontSize: 13, fontWeight: 500,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {scan.project_name ?? 'Unnamed'}
              </span>

              {/* Source badge */}
              <span>
                <span style={{
                  background: scan.is_dry_run ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)',
                  color: scan.is_dry_run ? '#F59E0B' : '#10B981',
                  padding: '2px 6px', borderRadius: 3,
                  fontSize: 9, fontWeight: 600, textTransform: 'uppercase',
                }}>
                  {scan.is_dry_run ? 'Dry Run' : (scan.source ?? 'live')}
                </span>
              </span>

              {/* Schema info */}
              <span style={{
                color: '#9CA3AF', fontSize: 11,
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {scan.schema_tables ?? 0}T / {scan.schema_columns ?? 0}C
              </span>

              {/* Severity mini-pills */}
              <div style={{ display: 'flex', gap: 4 }}>
                {([
                  { key: 'critical' as SeverityKey, count: scan.critical_count },
                  { key: 'major' as SeverityKey, count: scan.major_count },
                  { key: 'minor' as SeverityKey, count: scan.minor_count },
                  { key: 'info' as SeverityKey, count: scan.info_count },
                ]).map(({ key, count }) => (
                  count > 0 ? (
                    <span key={key} style={{
                      background: SEVERITY_CONFIG[key].bg,
                      color: SEVERITY_CONFIG[key].color,
                      padding: '1px 5px', borderRadius: 3,
                      fontSize: 9, fontWeight: 700,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      {count}
                    </span>
                  ) : null
                ))}
                {scan.total_findings === 0 && (
                  <span style={{ color: '#6B7280', fontSize: 10 }}>—</span>
                )}
              </div>

              {/* Cost */}
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                color: '#F59E0B', fontSize: 13, fontWeight: 600,
              }}>
                {formatCost(scan.total_cost)}
              </span>

              {/* Status */}
              <StatusBadge status={scan.status} />

              {/* Time */}
              <span style={{ color: '#6B7280', fontSize: 11 }}>
                {timeAgo(scan.completed_at)}
              </span>
            </div>
          ))}
        </Card>
      )}

      {/* ===== ROW 4 — Projects + Quick Actions ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

        {/* Projects list (max 4) */}
        <Card>
          <div style={{
            padding: '14px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span className="label-text">Projects</span>
            <button onClick={() => navigate('/projects')} style={{
              color: '#10B981', fontSize: 11, fontWeight: 500,
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            }}>
              View all →
            </button>
          </div>
          {projects.slice(0, 4).map((p, i) => (
            <div
              key={p.id}
              onClick={() => navigate('/projects')}
              style={{
                padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10,
                borderBottom: i < Math.min(projects.length, 4) - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                cursor: 'pointer', transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ color: '#E5E7EB', fontSize: 13, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.name}
              </span>
              <SectorBadge sector={p.sector} />
              <span style={{
                color: '#6B7280', fontSize: 10, fontWeight: 600,
                textTransform: 'uppercase',
                fontFamily: "'JetBrains Mono', monospace",
              }}>
                {p.db_type}
              </span>
              <span style={{ color: '#6B7280', fontSize: 11 }}>
                {timeAgo(p.created_at)}
              </span>
            </div>
          ))}
          {projects.length === 0 && (
            <div style={{ padding: '24px 16px', color: '#6B7280', fontSize: 12, textAlign: 'center' }}>
              No projects yet
            </div>
          )}
        </Card>

        {/* Quick Actions */}
        <Card>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="label-text">Quick Actions</span>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <ActionButton
              icon="+"
              label="New Project"
              description="Configure a new database connection"
              color="#10B981"
              onClick={() => navigate('/projects/new')}
            />
            <ActionButton
              icon="▶"
              label="Run Scan"
              description="Analyse an existing project"
              color="#3B82F6"
              onClick={() => navigate('/projects')}
            />
            <ActionButton
              icon="⚙"
              label="Settings"
              description="Branding &amp; white-label configuration"
              color="#818CF8"
              onClick={() => navigate('/settings/branding')}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
