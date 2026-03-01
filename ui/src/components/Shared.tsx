import type { ReactNode } from 'react';

export function MetricCard({ label, value, color, sub }: {
  label: string; value: string | number; color: string; sub?: string;
}) {
  return (
    <div style={{
      background: '#111827', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 8, padding: 16,
    }}>
      <div className="label-text" style={{ marginBottom: 8 }}>{label}</div>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 20, fontWeight: 700, color, letterSpacing: '-0.02em',
      }}>{value}</div>
      {sub && <div style={{ color: '#6B7280', fontSize: 11, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function Card({ children, style, onClick }: {
  children: ReactNode; style?: React.CSSProperties; onClick?: () => void;
}) {
  return (
    <div onClick={onClick} style={{
      background: '#111827', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 8, cursor: onClick ? 'pointer' : undefined,
      ...style,
    }}>
      {children}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: {
  icon: string; title: string; description: string; action?: ReactNode;
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '60px 20px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 48, opacity: 0.3, marginBottom: 16 }}>{icon}</div>
      <div style={{ color: '#E5E7EB', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{title}</div>
      <div style={{ color: '#6B7280', fontSize: 13, maxWidth: 400, marginBottom: 20 }}>{description}</div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: {
  title: string; subtitle?: string; action?: ReactNode;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
      <div>
        <h1 style={{ color: 'white', fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>{title}</h1>
        {subtitle && <p style={{ color: '#6B7280', fontSize: 12, margin: '4px 0 0' }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PrimaryButton({ children, onClick, style }: {
  children: ReactNode; onClick?: () => void; style?: React.CSSProperties;
}) {
  return (
    <button onClick={onClick} style={{
      background: 'rgba(16,185,129,0.1)', color: '#10B981',
      border: '1px solid rgba(16,185,129,0.25)',
      padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600,
      cursor: 'pointer', fontFamily: 'inherit', ...style,
    }}>
      {children}
    </button>
  );
}

export function SecondaryButton({ children, onClick, style }: {
  children: ReactNode; onClick?: () => void; style?: React.CSSProperties;
}) {
  return (
    <button onClick={onClick} style={{
      background: 'rgba(255,255,255,0.06)', color: '#D1D5DB',
      border: '1px solid rgba(255,255,255,0.1)',
      padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600,
      cursor: 'pointer', fontFamily: 'inherit', ...style,
    }}>
      {children}
    </button>
  );
}
