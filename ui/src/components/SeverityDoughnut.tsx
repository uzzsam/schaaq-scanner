import { SEVERITY_CONFIG, type SeverityKey } from '../utils';

interface SeverityCounts {
  critical: number;
  major: number;
  minor: number;
  info: number;
}

export function SeverityDoughnut({ counts, size = 160 }: { counts: SeverityCounts; size?: number }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const cx = size / 2, cy = size / 2, r = size * 0.35, strokeW = size * 0.12;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  const segments = (Object.entries(counts) as [SeverityKey, number][]).map(([sev, count]) => {
    const pct = count / total;
    const dashArray = `${pct * circumference} ${circumference}`;
    const seg = { severity: sev, count, pct, dashArray, offset: -offset * circumference };
    offset += pct;
    return seg;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={strokeW} />
        {segments.map((seg) => (
          <circle key={seg.severity} cx={cx} cy={cy} r={r} fill="none"
            stroke={SEVERITY_CONFIG[seg.severity].color}
            strokeWidth={strokeW} strokeDasharray={seg.dashArray}
            strokeDashoffset={seg.offset} strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: 'stroke-dasharray 0.8s ease' }}
          />
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" fill="white" fontSize={24} fontWeight={700}
          fontFamily="'JetBrains Mono', monospace">{total}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="#6B7280" fontSize={10} fontWeight={500}>findings</text>
      </svg>
      <div style={{ marginTop: 8, width: '100%' }}>
        {(Object.entries(counts) as [SeverityKey, number][]).map(([sev, count]) => (
          <div key={sev} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: SEVERITY_CONFIG[sev].color }} />
              <span style={{ color: '#D1D5DB', fontSize: 11 }}>{SEVERITY_CONFIG[sev].label}</span>
            </div>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#9CA3AF', fontSize: 11, fontWeight: 600 }}>{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
