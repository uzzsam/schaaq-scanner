import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchDashboard, fetchProjects, type DashboardStats, type Project } from '../api/client';
import { MetricCard, PageHeader, PrimaryButton, EmptyState } from '../components/Shared';
import { WelcomeWizard } from '../components/WelcomeWizard';
import { StatusBadge } from '../components/Badges';
import { formatCost, timeAgo } from '../utils';

export function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardDismissed, setWizardDismissed] = useState(false);

  useEffect(() => {
    Promise.all([fetchDashboard(), fetchProjects()])
      .then(([s, p]) => { setStats(s); setProjects(p); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div style={{ color: '#6B7280', padding: 40, textAlign: 'center' }}>Loading...</div>;
  }

  // First-time user: zero projects → show Welcome Wizard
  if (!stats || projects.length === 0) {
    if (!wizardDismissed) {
      return <WelcomeWizard onComplete={() => setWizardDismissed(true)} />;
    }

    // Wizard dismissed via "Skip" — show the fallback empty state
    return (
      <EmptyState
        icon={'\u2B21'}
        title="Welcome to Schaaq Scanner"
        description="Create your first project to start analysing data architecture costs."
        action={<PrimaryButton onClick={() => navigate('/projects/new')}>Create Project &rarr;</PrimaryButton>}
      />
    );
  }

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={`${stats.totalProjects} projects · ${stats.totalScans} scans completed`} />

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <MetricCard label="Total Projects" value={stats.totalProjects} color="#10B981" />
        <MetricCard label="Completed Scans" value={stats.totalScans} color="#818CF8" />
        <MetricCard label="Average Cost" value={formatCost(stats.averageCost)} color="#F59E0B" sub="per scan" />
        <MetricCard
          label="Last Scan"
          value={stats.recentScans.length > 0 ? timeAgo(stats.recentScans[0].completed_at) : 'None'}
          color="#9CA3AF"
        />
      </div>

      {/* Recent Scans */}
      {stats.recentScans.length > 0 && (
        <div style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="label-text">Recent Scans</span>
            <button onClick={() => navigate('/projects')} style={{ color: '#10B981', fontSize: 11, fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
              View all →
            </button>
          </div>
          {stats.recentScans.map((scan, i) => (
            <div key={scan.id}
              onClick={() => navigate(`/scans/${scan.id}/results`)}
              style={{
                padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
                borderBottom: i < stats.recentScans.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                cursor: 'pointer', transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <span style={{ color: '#E5E7EB', fontSize: 13, fontWeight: 500, flex: 1 }}>{scan.project_name ?? 'Unnamed'}</span>
              <StatusBadge status={scan.status} />
              <span style={{ color: '#6B7280', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>{scan.total_findings} findings</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#F59E0B', fontSize: 13, fontWeight: 600 }}>{formatCost(scan.total_cost)}</span>
              <span style={{ color: '#6B7280', fontSize: 11 }}>{timeAgo(scan.completed_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
