export function PropertyBadge({ property }: { property: number }) {
  return (
    <span style={{
      background: 'rgba(99,102,241,0.1)', color: '#818CF8',
      border: '1px solid rgba(99,102,241,0.2)',
      padding: '2px 8px', borderRadius: 4,
      fontSize: 11, fontWeight: 500,
      display: 'inline-block', whiteSpace: 'nowrap',
    }}>
      P{property}
    </span>
  );
}
