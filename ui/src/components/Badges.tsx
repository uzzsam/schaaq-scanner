import { formatCost, scoreColor, SECTOR_CONFIG } from '../utils';

export function CostDisplay({ amount, size = 'md' }: { amount: number | null | undefined; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const sizes = { sm: 13, md: 16, lg: 24, xl: 36 };
  return (
    <span style={{
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: sizes[size], fontWeight: 600,
      color: '#F59E0B', letterSpacing: '-0.02em',
    }}>
      {formatCost(amount ?? 0)}
    </span>
  );
}

export function ScoreBar({ score, maxScore = 100, height = 6 }: { score: number; maxScore?: number; height?: number }) {
  const pct = Math.min(100, (score / maxScore) * 100);
  return (
    <div style={{ width: '100%', height, background: 'rgba(255,255,255,0.06)', borderRadius: height / 2, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: scoreColor(pct), borderRadius: height / 2, transition: 'width 0.8s ease' }} />
    </div>
  );
}

export function SectorBadge({ sector }: { sector: string }) {
  const cfg = SECTOR_CONFIG[sector as keyof typeof SECTOR_CONFIG] ?? { label: sector, color: '#9CA3AF', bg: 'rgba(156,163,175,0.12)' };
  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      padding: '2px 8px', borderRadius: 4,
      fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
      letterSpacing: '0.03em', whiteSpace: 'nowrap',
    }}>
      {cfg.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { color: string; bg: string }> = {
    completed: { color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
    running:   { color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
    pending:   { color: '#9CA3AF', bg: 'rgba(156,163,175,0.12)' },
    failed:    { color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
    cancelled: { color: '#6B7280', bg: 'rgba(107,114,128,0.12)' },
  };
  const cfg = configs[status] ?? configs.pending;
  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      padding: '2px 8px', borderRadius: 4,
      fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
    }}>
      {status}
    </span>
  );
}
