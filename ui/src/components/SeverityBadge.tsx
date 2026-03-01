import { SEVERITY_CONFIG, type SeverityKey } from '../utils';

export function SeverityBadge({ severity, compact }: { severity: SeverityKey; compact?: boolean }) {
  const s = SEVERITY_CONFIG[severity];
  if (!s) return null;
  return (
    <span style={{
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      padding: compact ? '1px 6px' : '2px 10px', borderRadius: 4,
      fontSize: compact ? 10 : 11, fontWeight: 600,
      letterSpacing: '0.03em', textTransform: 'uppercase', whiteSpace: 'nowrap',
      display: 'inline-block',
    }}>
      {s.label}
    </span>
  );
}
