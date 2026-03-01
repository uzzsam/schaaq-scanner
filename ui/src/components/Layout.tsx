import { useState, useEffect, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { fetchScan } from '../api/client';

const NAV_ITEMS = [
  { id: '/', label: 'Dashboard', icon: '⬡' },
  { id: '/projects', label: 'Projects', icon: '▦' },
];

const SCAN_NAV = [
  { suffix: '/results', label: 'Findings', icon: '≡' },
  { suffix: '/properties', label: 'Properties', icon: '◇' },
  { suffix: '/report', label: 'Report', icon: '▤' },
];

function NavButton({
  active, icon, label, badge, collapsed, onClick,
}: {
  active: boolean; icon: string; label: string;
  badge?: number | null; collapsed: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px', borderRadius: 6, border: 'none',
      background: active ? 'rgba(16,185,129,0.1)' : 'transparent',
      color: active ? '#10B981' : '#9CA3AF', cursor: 'pointer',
      fontSize: 13, fontWeight: active ? 600 : 400, marginBottom: 2,
      transition: 'all 0.15s ease', textAlign: 'left', fontFamily: 'inherit',
      position: 'relative',
    }}
    onMouseEnter={(e) => { if (!active) (e.currentTarget.style.background = 'rgba(255,255,255,0.04)'); }}
    onMouseLeave={(e) => { if (!active) (e.currentTarget.style.background = 'transparent'); }}
    >
      <span style={{ fontSize: 16, width: 20, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
      {!collapsed && label}
      {badge != null && badge > 0 && (
        <span style={{
          marginLeft: 'auto', minWidth: 18, height: 18, borderRadius: 9,
          background: '#EF4444', color: 'white', fontSize: 10, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 5px', fontFamily: "'JetBrains Mono', monospace",
          flexShrink: 0,
        }}>
          {badge > 999 ? '999+' : badge}
        </span>
      )}
    </button>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Detect scan context from URL: /scans/:scanId/*
  const scanMatch = location.pathname.match(/\/scans\/([^/]+)/);
  const scanId = scanMatch?.[1] ?? null;

  // Fetch finding count when on a scan page
  const [findingCount, setFindingCount] = useState<number | null>(null);
  useEffect(() => {
    if (!scanId) { setFindingCount(null); return; }
    fetchScan(scanId)
      .then((s) => setFindingCount(s.total_findings ?? 0))
      .catch(() => setFindingCount(null));
  }, [scanId]);

  // Active-state detection
  const activePath = location.pathname;
  const isTopActive = (id: string) => {
    if (id === '/') return activePath === '/';
    return activePath.startsWith(id) && !activePath.startsWith('/scans');
  };
  const isScanItemActive = (suffix: string) =>
    scanId != null && activePath === `/scans/${scanId}${suffix}`;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0A0F1A' }}>
      {/* Sidebar */}
      <div style={{
        width: collapsed ? 56 : 200, minHeight: '100vh', background: '#0D1117',
        borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column',
        transition: 'width 0.2s ease', flexShrink: 0,
      }}>
        {/* Logo */}
        <div
          style={{
            padding: collapsed ? '16px 12px' : '16px 16px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
          }}
          onClick={() => setCollapsed(!collapsed)}
        >
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, #10B981, #059669)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <span style={{ color: 'white', fontWeight: 800, fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }}>S</span>
          </div>
          {!collapsed && (
            <div>
              <div style={{ color: 'white', fontWeight: 700, fontSize: 14, letterSpacing: '-0.02em' }}>Schaaq</div>
              <div style={{ color: '#6B7280', fontSize: 10, fontWeight: 500 }}>Scanner v0.1</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <div style={{ padding: '12px 8px', flex: 1 }}>
          {/* Dashboard */}
          <NavButton
            active={isTopActive('/')}
            icon={NAV_ITEMS[0].icon}
            label={NAV_ITEMS[0].label}
            collapsed={collapsed}
            onClick={() => navigate('/')}
          />

          {/* Scan-contextual items */}
          {scanId && (
            <div style={{ margin: '6px 0 4px' }}>
              {/* Divider + label */}
              <div style={{
                borderTop: '1px solid rgba(255,255,255,0.06)',
                margin: '4px 12px 8px',
              }} />
              {!collapsed && (
                <div style={{
                  padding: '0 12px 6px', fontSize: 9, fontWeight: 700,
                  color: '#6B7280', letterSpacing: '0.08em', textTransform: 'uppercase',
                }}>
                  Current Scan
                </div>
              )}
              {SCAN_NAV.map((item) => (
                <NavButton
                  key={item.suffix}
                  active={isScanItemActive(item.suffix)}
                  icon={item.icon}
                  label={item.label}
                  badge={item.suffix === '/results' ? findingCount : undefined}
                  collapsed={collapsed}
                  onClick={() => navigate(`/scans/${scanId}${item.suffix}`)}
                />
              ))}
              {/* Divider below scan items */}
              <div style={{
                borderTop: '1px solid rgba(255,255,255,0.06)',
                margin: '8px 12px 4px',
              }} />
            </div>
          )}

          {/* Projects */}
          <NavButton
            active={isTopActive('/projects')}
            icon={NAV_ITEMS[1].icon}
            label={NAV_ITEMS[1].label}
            collapsed={collapsed}
            onClick={() => navigate('/projects')}
          />
        </div>

        {/* Footer */}
        <div style={{ padding: collapsed ? '12px' : '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%', background: '#10B981',
              boxShadow: '0 0 8px rgba(16,185,129,0.4)', flexShrink: 0,
            }} />
            {!collapsed && (
              <div>
                <div style={{ color: '#D1D5DB', fontSize: 10, fontWeight: 600 }}>Ready</div>
                <div style={{ color: '#6B7280', fontSize: 9 }}>{window.location.host}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: 24, overflow: 'auto', minWidth: 0 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
