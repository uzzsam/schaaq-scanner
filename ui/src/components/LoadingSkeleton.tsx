/**
 * Animated skeleton placeholders shown while pages load.
 *
 * Variants mirror the most common page layouts so the transition
 * from skeleton → real content feels seamless.
 */

const PULSE_KEYFRAMES = `
@keyframes schaaq-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.5; }
}
`;

function injectKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('schaaq-pulse-kf')) return;
  const style = document.createElement('style');
  style.id = 'schaaq-pulse-kf';
  style.textContent = PULSE_KEYFRAMES;
  document.head.appendChild(style);
}

/* ── Primitives ─────────────────────────────────────────────── */

function Bar({ width = '100%', height = 14, radius = 4, style }: {
  width?: string | number; height?: number; radius?: number; style?: React.CSSProperties;
}) {
  injectKeyframes();
  return (
    <div style={{
      width, height, borderRadius: radius,
      background: 'linear-gradient(90deg, #1F2937 25%, #374151 50%, #1F2937 75%)',
      backgroundSize: '200% 100%',
      animation: 'schaaq-pulse 1.8s ease-in-out infinite',
      ...style,
    }} />
  );
}

/* ── Metric skeleton (single stat card) ─────────────────────── */

export function MetricSkeleton() {
  return (
    <div style={{
      background: '#111827', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 8, padding: 16,
    }}>
      <Bar width={80} height={10} style={{ marginBottom: 10 }} />
      <Bar width={48} height={22} />
    </div>
  );
}

/* ── Card skeleton (generic content block) ──────────────────── */

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div style={{
      background: '#111827', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 8, padding: 16,
    }}>
      <Bar width="40%" height={16} style={{ marginBottom: 14 }} />
      {Array.from({ length: lines }).map((_, i) => (
        <Bar
          key={i}
          width={i === lines - 1 ? '60%' : '100%'}
          height={12}
          style={{ marginTop: i > 0 ? 10 : 0 }}
        />
      ))}
    </div>
  );
}

/* ── Table skeleton (list of rows) ──────────────────────────── */

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div style={{
      background: '#111827', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 8, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', gap: 12,
      }}>
        <Bar width={100} height={12} />
        <Bar width={60} height={12} style={{ marginLeft: 'auto' }} />
      </div>

      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
          borderBottom: i < rows - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
        }}>
          <Bar width="35%" height={12} />
          <Bar width={50} height={18} radius={9} />
          <Bar width={60} height={12} style={{ marginLeft: 'auto' }} />
          <Bar width={48} height={12} />
        </div>
      ))}
    </div>
  );
}

/* ── Full-page skeletons (compose primitives) ───────────────── */

/** Dashboard: 4 metric cards + recent-scans table */
export function DashboardSkeleton() {
  return (
    <div>
      <Bar width={140} height={20} style={{ marginBottom: 6 }} />
      <Bar width={200} height={12} style={{ marginBottom: 20 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <MetricSkeleton />
        <MetricSkeleton />
        <MetricSkeleton />
        <MetricSkeleton />
      </div>
      <TableSkeleton rows={4} />
    </div>
  );
}

/** Projects: header + table of project rows */
export function ProjectsSkeleton() {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Bar width={120} height={20} />
        <Bar width={110} height={32} radius={6} />
      </div>
      <TableSkeleton rows={4} />
    </div>
  );
}

/** Scan detail pages: header + card body */
export function ScanDetailSkeleton() {
  return (
    <div>
      <Bar width={180} height={20} style={{ marginBottom: 6 }} />
      <Bar width={240} height={12} style={{ marginBottom: 20 }} />
      <CardSkeleton lines={5} />
    </div>
  );
}
