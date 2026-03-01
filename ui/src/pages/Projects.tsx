import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchProjects, triggerScan, type Project } from '../api/client';
import { PageHeader, PrimaryButton, SecondaryButton, EmptyState } from '../components/Shared';
import { SectorBadge } from '../components/Badges';

export function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    setLoading(true);
    fetchProjects().then(setProjects).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  const handleScan = async (projectId: string, dryRun: boolean) => {
    try {
      const { scanId } = await triggerScan(projectId, dryRun);
      navigate(`/scans/${scanId}/progress`);
    } catch (err: any) {
      alert('Failed to start scan: ' + err.message);
    }
  };

  if (loading) return <div style={{ color: '#6B7280', padding: 40, textAlign: 'center' }}>Loading...</div>;

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={'▦'}
        title="No projects yet"
        description="Create a project to configure a database connection and run your first scan."
        action={<PrimaryButton onClick={() => navigate('/projects/new')}>Create Project →</PrimaryButton>}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle={`${projects.length} project${projects.length !== 1 ? 's' : ''}`}
        action={<PrimaryButton onClick={() => navigate('/projects/new')}>+ New Project</PrimaryButton>}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
        {projects.map((p) => (
          <div key={p.id} style={{
            background: '#111827', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ color: 'white', fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{p.name}</div>
                <SectorBadge sector={p.sector} />
              </div>
              <SecondaryButton onClick={() => navigate(`/projects/${p.id}/edit`)} style={{ padding: '4px 10px', fontSize: 11 }}>
                Edit
              </SecondaryButton>
            </div>

            <div style={{ color: '#6B7280', fontSize: 12 }}>
              {p.db_type} &middot; {p.db_host ?? 'localhost'}:{p.db_port ?? '5432'}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
              <PrimaryButton onClick={() => handleScan(p.id, false)} style={{ flex: 1, textAlign: 'center' }}>
                Run Scan
              </PrimaryButton>
              <SecondaryButton onClick={() => handleScan(p.id, true)} style={{ textAlign: 'center' }}>
                Dry Run
              </SecondaryButton>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
