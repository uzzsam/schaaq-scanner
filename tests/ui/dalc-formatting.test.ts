/**
 * Tests for DALC range formatting helpers in ui/src/utils.ts
 *
 * These helpers are used across ScanHistoryPanel, ScanResults, and ComparisonSummary
 * to display DALC low/base/high bands consistently.
 */

import { describe, it, expect } from 'vitest';

// We test the pure functions directly — they have no React dependencies.
// The source lives in ui/src/utils.ts but we import from a path relative to this test.
import {
  formatCost,
  formatDalcRange,
  formatDalcRangeShort,
} from '../../ui/src/utils';

describe('formatCost', () => {
  it('formats null/undefined as $0', () => {
    expect(formatCost(null)).toBe('$0');
    expect(formatCost(undefined)).toBe('$0');
  });

  it('formats millions', () => {
    expect(formatCost(1_500_000)).toBe('$1.5M');
    expect(formatCost(10_000_000)).toBe('$10.0M');
  });

  it('formats thousands', () => {
    expect(formatCost(50_000)).toBe('$50K');
    expect(formatCost(1_000)).toBe('$1K');
  });

  it('formats sub-thousand values with locale string', () => {
    const result = formatCost(999);
    expect(result).toMatch(/^\$999$/);
  });

  it('formats exactly 1M', () => {
    expect(formatCost(1_000_000)).toBe('$1.0M');
  });
});

describe('formatDalcRange', () => {
  it('shows full range when low/high are distinct', () => {
    const result = formatDalcRange(3_000_000, 5_000_000, 7_000_000);
    expect(result).toBe('$3.0M – $7.0M (base: $5.0M)');
  });

  it('falls back to base when low/high are equal', () => {
    const result = formatDalcRange(5_000_000, 5_000_000, 5_000_000);
    expect(result).toBe('$5.0M');
  });

  it('falls back to base when low is null', () => {
    const result = formatDalcRange(null, 5_000_000, 7_000_000);
    expect(result).toBe('$5.0M');
  });

  it('falls back to base when high is null', () => {
    const result = formatDalcRange(3_000_000, 5_000_000, null);
    expect(result).toBe('$5.0M');
  });

  it('falls back to $0 when all are null', () => {
    const result = formatDalcRange(null, null, null);
    expect(result).toBe('$0');
  });

  it('uses base when low/high are undefined', () => {
    const result = formatDalcRange(undefined, 4_000_000, undefined);
    expect(result).toBe('$4.0M');
  });
});

describe('formatDalcRangeShort', () => {
  it('shows abbreviated range when low/high are distinct', () => {
    const result = formatDalcRangeShort(3_000_000, 7_000_000, 5_000_000);
    expect(result).toBe('$3.0M – $7.0M');
  });

  it('falls back to base when low/high are equal', () => {
    const result = formatDalcRangeShort(5_000_000, 5_000_000, 5_000_000);
    expect(result).toBe('$5.0M');
  });

  it('falls back to base when low is null', () => {
    const result = formatDalcRangeShort(null, 7_000_000, 5_000_000);
    expect(result).toBe('$5.0M');
  });

  it('falls back to base when high is null', () => {
    const result = formatDalcRangeShort(3_000_000, null, 5_000_000);
    expect(result).toBe('$5.0M');
  });

  it('returns $0 when all are null', () => {
    const result = formatDalcRangeShort(null, null, null);
    expect(result).toBe('$0');
  });

  it('handles thousands-range values', () => {
    const result = formatDalcRangeShort(50_000, 150_000, 100_000);
    expect(result).toBe('$50K – $150K');
  });
});
