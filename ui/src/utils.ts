// Shared formatting utilities

export function formatCost(n: number | null | undefined): string {
  if (n == null) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

export function formatCostFull(n: number | null | undefined): string {
  if (n == null) return '$0';
  return '$' + Math.round(n).toLocaleString();
}

export function formatNumber(n: number): string {
  return n.toLocaleString();
}

export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export const SEVERITY_CONFIG = {
  critical: { label: 'Critical', color: '#EF4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.25)' },
  major:    { label: 'Major',    color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)' },
  minor:    { label: 'Minor',    color: '#FBBF24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.25)' },
  info:     { label: 'Info',     color: '#10B981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.25)' },
} as const;

export type SeverityKey = keyof typeof SEVERITY_CONFIG;

export const PROPERTY_NAMES: Record<number, string> = {
  1: 'Semantic Identity',
  2: 'Controlled Reference',
  3: 'Domain Ownership',
  4: 'Anti-Corruption',
  5: 'Schema Governance',
  6: 'Quality Measurement',
  7: 'Regulatory Traceability',
  8: 'AI Readiness',
};

export const COST_CATEGORY_COLORS: Record<string, string> = {
  firefighting: '#EF4444',
  dataQuality: '#3B82F6',
  integration: '#F59E0B',
  productivity: '#06B6D4',
  regulatory: '#818CF8',
  aiMlRiskExposure: '#A855F7',
};

export const COST_CATEGORY_LABELS: Record<string, string> = {
  firefighting: 'Engineering Firefighting',
  dataQuality: 'Data Quality',
  integration: 'Failed Integration',
  productivity: 'Productivity Drain',
  regulatory: 'Regulatory Exposure',
  aiMlRiskExposure: 'AI/ML Risk Exposure',
};

export const SECTOR_CONFIG = {
  mining:        { label: 'Mining & Resources',       color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
  environmental: { label: 'Environmental & Sustainability', color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  energy:        { label: 'Energy & Utilities',       color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
} as const;

export function scoreColor(score: number): string {
  if (score > 60) return '#10B981';
  if (score > 40) return '#F59E0B';
  return '#EF4444';
}
