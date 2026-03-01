interface PropertyData {
  id: string;
  name: string;
  score: number;
}

export function PropertyRadar({ properties, size = 280 }: { properties: PropertyData[]; size?: number }) {
  const cx = size / 2, cy = size / 2, r = size * 0.38;
  const n = properties.length;
  if (n === 0) return null;
  const angleStep = (2 * Math.PI) / n;

  const getPoint = (i: number, val: number) => {
    const angle = i * angleStep - Math.PI / 2;
    const dist = (val / 100) * r;
    return { x: cx + dist * Math.cos(angle), y: cy + dist * Math.sin(angle) };
  };

  const rings = [25, 50, 75, 100];
  const dataPoints = properties.map((p, i) => getPoint(i, p.score));
  const pathD = dataPoints.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ') + ' Z';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {rings.map((ring) => (
        <polygon key={ring}
          points={properties.map((_, i) => { const pt = getPoint(i, ring); return `${pt.x},${pt.y}`; }).join(' ')}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={1}
        />
      ))}
      {properties.map((p, i) => {
        const edgePt = getPoint(i, 105);
        const labelPt = getPoint(i, 122);
        return (
          <g key={i}>
            <line x1={cx} y1={cy} x2={edgePt.x} y2={edgePt.y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
            <text x={labelPt.x} y={labelPt.y} textAnchor="middle" dominantBaseline="middle"
              fill="#9CA3AF" fontSize={9} fontWeight={500} fontFamily="'JetBrains Mono', monospace">
              {p.id}
            </text>
          </g>
        );
      })}
      <polygon points={dataPoints.map((pt) => `${pt.x},${pt.y}`).join(' ')}
        fill="rgba(16,185,129,0.15)" stroke="#10B981" strokeWidth={2}
      />
      {dataPoints.map((pt, i) => (
        <circle key={i} cx={pt.x} cy={pt.y} r={4} fill="#10B981" stroke="#0A0F1A" strokeWidth={2} />
      ))}
    </svg>
  );
}
