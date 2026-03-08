import { formatCost, COST_CATEGORY_COLORS, formatCostFull } from '../utils';
import { useDisplayMode } from '../config/DisplayModeContext';

interface CostCategory {
  key: string;
  amount: number;
}

export function CostBreakdownChart({ categories }: { categories: CostCategory[] }) {
  const { costCategoryLabels } = useDisplayMode();
  if (categories.length === 0) return null;
  const max = Math.max(...categories.map((c) => c.amount));
  const total = categories.reduce((s, c) => s + c.amount, 0);
  const defaultColors = ['#EF4444', '#F59E0B', '#818CF8', '#06B6D4', '#10B981'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {categories.map((cat, i) => {
        const color = COST_CATEGORY_COLORS[cat.key] ?? defaultColors[i % defaultColors.length];
        const label = costCategoryLabels[cat.key] ?? cat.key;
        return (
          <div key={cat.key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#D1D5DB', fontSize: 12, fontWeight: 500 }}>{label}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", color, fontSize: 12, fontWeight: 600 }}>
                {formatCost(cat.amount)}
              </span>
            </div>
            <div style={{ width: '100%', height: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 4 }}>
              <div style={{
                width: max > 0 ? `${(cat.amount / max) * 100}%` : '0%',
                height: '100%', background: color, borderRadius: 4, opacity: 0.85,
                transition: 'width 0.8s ease',
              }} />
            </div>
          </div>
        );
      })}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 6, paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 500 }}>Total Estimated</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#F59E0B', fontSize: 16, fontWeight: 700 }}>
          {formatCostFull(total)}
        </span>
      </div>
    </div>
  );
}
