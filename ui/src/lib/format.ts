/**
 * Format a number as AUD currency.
 * e.g. 1234567 → "$1,234,567"
 */
export function formatCurrency(value: number, decimals = 0): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format a large number compactly.
 * e.g. 1234567 → "$1.2M"
 */
export function formatCurrencyCompact(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
}

/**
 * Format a number with commas.
 * e.g. 1234567 → "1,234,567"
 */
export function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat('en-AU', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format a ratio as a percentage.
 * e.g. 0.756 → "75.6%"
 */
export function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Format months into a human readable string.
 * e.g. 14 → "1y 2m"
 */
export function formatMonths(months: number): string {
  if (months < 1) return '< 1 month';
  if (months < 12) return `${Math.round(months)} months`;
  const y = Math.floor(months / 12);
  const m = Math.round(months % 12);
  if (m === 0) return `${y}y`;
  return `${y}y ${m}m`;
}

/**
 * Format an ISO date string to a readable format.
 */
export function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format an ISO date string to a readable format with time.
 */
export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
