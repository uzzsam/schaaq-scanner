import { useDisplayMode } from '../config/DisplayModeContext';

export function DisplayModeToggle({ collapsed }: { collapsed?: boolean }) {
  const { mode, toggleMode } = useDisplayMode();

  if (collapsed) {
    return (
      <button
        onClick={toggleMode}
        title={mode === 'executive' ? 'Switch to Technical labels' : 'Switch to Executive labels'}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '8px 0', borderRadius: 6, border: 'none',
          background: 'rgba(255,255,255,0.04)', cursor: 'pointer',
          fontSize: 11, fontWeight: 600, color: '#9CA3AF',
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        {mode === 'executive' ? 'Ex' : 'Te'}
      </button>
    );
  }

  return (
    <div style={{
      display: 'flex', borderRadius: 6, overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.08)',
      background: 'rgba(255,255,255,0.03)',
    }}>
      <button
        onClick={mode !== 'executive' ? toggleMode : undefined}
        style={{
          flex: 1, padding: '5px 8px', border: 'none', cursor: 'pointer',
          fontSize: 10, fontWeight: 600, fontFamily: 'inherit',
          background: mode === 'executive' ? 'rgba(16,185,129,0.15)' : 'transparent',
          color: mode === 'executive' ? '#10B981' : '#6B7280',
          transition: 'all 0.15s',
        }}
      >
        Executive
      </button>
      <button
        onClick={mode !== 'technical' ? toggleMode : undefined}
        style={{
          flex: 1, padding: '5px 8px', border: 'none', cursor: 'pointer',
          fontSize: 10, fontWeight: 600, fontFamily: 'inherit',
          background: mode === 'technical' ? 'rgba(129,140,248,0.15)' : 'transparent',
          color: mode === 'technical' ? '#818CF8' : '#6B7280',
          transition: 'all 0.15s',
        }}
      >
        Technical
      </button>
    </div>
  );
}
