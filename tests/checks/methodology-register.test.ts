import { describe, it, expect } from 'vitest';
import {
  METHODOLOGY_REGISTER,
  getCheckMethodology,
  getAllMethodologies,
  type CheckMethodology,
} from '../../src/checks/methodology-register';

// =============================================================================
// Known check IDs — must stay in sync with the scanner check catalogue
// =============================================================================

const ALL_CHECK_IDS = [
  'P1-SEMANTIC-IDENTITY',
  'P2-TYPE-INCONSISTENCY',
  'P2-UNCONTROLLED-VOCAB',
  'P3-DOMAIN-OVERLAP',
  'P3-CROSS-SCHEMA-COUPLING',
  'P4-CSV-IMPORT-PATTERN',
  'P4-ISLAND-TABLES',
  'P4-WIDE-TABLES',
  'P5-NAMING-VIOLATIONS',
  'P5-MISSING-PK',
  'P5-UNDOCUMENTED',
  'P6-HIGH-NULL-RATE',
  'P6-NO-INDEXES',
  'P6-ZSCORE-OUTLIERS',
  'P6-IQR-OUTLIERS',
  'P6-NULL-RATE-SPIKE',
  'P7-MISSING-AUDIT',
  'P7-NO-CONSTRAINTS',
  'P8-AI-LINEAGE-COMPLETENESS',
  'P8-AI-BIAS-ATTRIBUTE-DOCUMENTATION',
  'P8-AI-REPRODUCIBILITY',
];

// =============================================================================
// Tests
// =============================================================================

describe('Methodology Register', () => {
  it('contains an entry for every known check ID', () => {
    for (const id of ALL_CHECK_IDS) {
      const entry = getCheckMethodology(id);
      expect(entry, `Missing methodology for ${id}`).toBeDefined();
    }
  });

  it('has exactly 21 entries (one per scanner check)', () => {
    expect(METHODOLOGY_REGISTER.size).toBe(21);
  });

  it('lookup is case-insensitive', () => {
    const upper = getCheckMethodology('P1-SEMANTIC-IDENTITY');
    const lower = getCheckMethodology('p1-semantic-identity');
    const mixed = getCheckMethodology('P1-Semantic-Identity');
    expect(upper).toBeDefined();
    expect(lower).toBe(upper);
    expect(mixed).toBe(upper);
  });

  it('returns undefined for unknown check IDs', () => {
    expect(getCheckMethodology('DOES-NOT-EXIST')).toBeUndefined();
    expect(getCheckMethodology('')).toBeUndefined();
  });

  it('every entry has required fields populated', () => {
    for (const entry of METHODOLOGY_REGISTER.values()) {
      expect(entry.checkId).toBeTruthy();
      expect(entry.property).toBeGreaterThanOrEqual(1);
      expect(entry.property).toBeLessThanOrEqual(8);
      expect(entry.checkName).toBeTruthy();
      expect(['deterministic', 'heuristic', 'statistical']).toContain(entry.technique);
      expect(entry.methodology.length).toBeGreaterThan(10);
      expect(entry.assumptions.length).toBeGreaterThan(0);
      expect(entry.limitations.length).toBeGreaterThan(0);
      expect(entry.dataInputs.length).toBeGreaterThan(0);
    }
  });

  it('every entry has non-empty assumptions, limitations, and dataInputs', () => {
    for (const entry of METHODOLOGY_REGISTER.values()) {
      for (const a of entry.assumptions) expect(a.length, `empty assumption in ${entry.checkId}`).toBeGreaterThan(0);
      for (const l of entry.limitations) expect(l.length, `empty limitation in ${entry.checkId}`).toBeGreaterThan(0);
      for (const d of entry.dataInputs) expect(d.length, `empty dataInput in ${entry.checkId}`).toBeGreaterThan(0);
    }
  });

  it('references, when present, are non-empty strings', () => {
    for (const entry of METHODOLOGY_REGISTER.values()) {
      if (entry.references) {
        for (const r of entry.references) {
          expect(r.length, `empty reference in ${entry.checkId}`).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('getAllMethodologies()', () => {
  it('returns all entries as a sorted array', () => {
    const all = getAllMethodologies();
    expect(all.length).toBe(21);
  });

  it('is sorted by property number, then check name', () => {
    const all = getAllMethodologies();
    for (let i = 1; i < all.length; i++) {
      const prev = all[i - 1];
      const curr = all[i];
      if (prev.property === curr.property) {
        expect(
          prev.checkName.localeCompare(curr.checkName),
          `${prev.checkName} should come before ${curr.checkName}`,
        ).toBeLessThanOrEqual(0);
      } else {
        expect(prev.property).toBeLessThan(curr.property);
      }
    }
  });

  it('returns a fresh array (not the internal Map reference)', () => {
    const a = getAllMethodologies();
    const b = getAllMethodologies();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe('property coverage', () => {
  it('all 8 properties have at least one methodology entry', () => {
    const all = getAllMethodologies();
    const covered = new Set(all.map(e => e.property));
    for (let p = 1; p <= 8; p++) {
      expect(covered.has(p as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8), `Property P${p} has no methodology entries`).toBe(true);
    }
  });
});
