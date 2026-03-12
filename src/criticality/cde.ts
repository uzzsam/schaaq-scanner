/**
 * CDE (Critical Data Element) Candidate Identification
 *
 * Deterministic column-level analysis to flag likely CDEs
 * based on naming patterns, structural role, and data characteristics.
 */

import type { CdeCandidate, CdeReasonType } from './types';
import type { TableMetadata } from './signals';

// =============================================================================
// Pattern Dictionaries
// =============================================================================

const PII_PATTERNS = [
  /email/i, /phone/i, /mobile/i, /ssn/i, /social.?sec/i,
  /passport/i, /driver.?lic/i, /national.?id/i, /tax.?id/i,
  /date.?of.?birth|dob|birth.?date/i, /address/i, /zip.?code|postal/i,
  /first.?name|last.?name|full.?name|surname/i,
  /ip.?address/i, /credit.?card|card.?number/i,
];

const FINANCIAL_PATTERNS = [
  /amount|price|cost|total|balance|revenue|fee|charge/i,
  /salary|wage|compensation|rate|discount/i,
  /tax|vat|gst|duty/i,
  /currency|exchange.?rate/i,
  /credit|debit|payment/i,
];

const REGULATORY_PATTERNS = [
  /consent/i, /opt.?in|opt.?out/i, /gdpr/i, /hipaa/i,
  /compliance/i, /retention/i, /classification/i,
  /sensitive/i, /restricted/i, /confidential/i,
];

const PK_PATTERNS = [
  /^id$/i, /^pk$/i, /_id$/i, /^uuid$/i, /^guid$/i,
];

// =============================================================================
// CDE Identification
// =============================================================================

/**
 * Identify CDE candidates within a single table's known columns.
 * Conservative: only flags columns with clear deterministic signals.
 */
export function identifyCdeCandidates(meta: TableMetadata): CdeCandidate[] {
  const candidates: CdeCandidate[] = [];

  for (const col of meta.columnNames) {
    const reasons: CdeReasonType[] = [];
    const rationaleFragments: string[] = [];

    // Check PII
    if (PII_PATTERNS.some(p => p.test(col))) {
      reasons.push('pii-name-match');
      rationaleFragments.push('column name matches PII pattern');
    }

    // Check financial
    if (FINANCIAL_PATTERNS.some(p => p.test(col))) {
      reasons.push('financial-name-match');
      rationaleFragments.push('column name matches financial data pattern');
    }

    // Check regulatory
    if (REGULATORY_PATTERNS.some(p => p.test(col))) {
      reasons.push('regulatory-name-match');
      rationaleFragments.push('column name matches regulatory data pattern');
    }

    // Check primary key
    if (PK_PATTERNS.some(p => p.test(col))) {
      reasons.push('primary-key');
      rationaleFragments.push('column appears to be a primary key');
    }

    // Only flag if at least one reason found
    if (reasons.length === 0) continue;

    // Confidence: more reasons = higher confidence
    const confidenceLevel: 'high' | 'medium' | 'low' =
      reasons.length >= 3 ? 'high' :
      reasons.length >= 2 ? 'medium' : 'low';

    candidates.push({
      columnKey: `${meta.tableKey}.${col}`,
      columnName: col,
      tableKey: meta.tableKey,
      tableName: meta.tableName,
      schemaName: meta.schemaName,
      reasons,
      rationale: rationaleFragments.join('; '),
      confidenceLevel,
    });
  }

  return candidates;
}
