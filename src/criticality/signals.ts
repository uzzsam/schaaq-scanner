/**
 * Criticality Signal Derivation — Deterministic Signal Extraction
 *
 * Each function extracts one signal from schema metadata / finding data.
 * All signals return normalised 0–1 values with human-readable evidence strings.
 */

import type { CriticalitySignal, CriticalitySignalType } from './types';
import type { ResultFindingRow } from '../server/db/scan-result-types';

// =============================================================================
// Signal Weights (sum to ~1.0 for active signals; re-normalised at scoring)
// =============================================================================

export const SIGNAL_BASE_WEIGHTS: Record<CriticalitySignalType, number> = {
  'naming-convention':      0.10,
  'constraint-density':     0.08,
  'reference-target':       0.12,
  'column-count':           0.05,
  'index-coverage':         0.06,
  'pii-pattern':            0.12,
  'financial-pattern':      0.10,
  'audit-pattern':          0.05,
  'soft-delete-pattern':    0.04,
  'junction-table':         0.04,
  'enum-lookup':            0.04,
  'null-ratio':             0.03,
  'finding-severity-load':  0.08,
  'relationship-centrality': 0.06,
  'schema-position':        0.03,
};

// =============================================================================
// Naming Pattern Dictionaries
// =============================================================================

/** Table name patterns that suggest critical business entities. */
const CRITICAL_TABLE_PATTERNS = [
  /^(customer|client|user|member|account|patient|employee|person)s?$/i,
  /^(order|invoice|payment|transaction|billing|subscription)s?$/i,
  /^(product|item|asset|inventory|stock)s?$/i,
  /^(contract|agreement|policy|claim)s?$/i,
  /^(ledger|journal|balance|revenue|expense)s?$/i,
];

/** Column name patterns suggesting PII. */
const PII_COLUMN_PATTERNS = [
  /email/i, /phone/i, /mobile/i, /ssn/i, /social.?sec/i,
  /passport/i, /driver.?lic/i, /national.?id/i, /tax.?id/i,
  /date.?of.?birth|dob|birth.?date/i, /address/i, /zip.?code|postal/i,
  /first.?name|last.?name|full.?name|surname/i,
  /ip.?address/i, /credit.?card|card.?number/i,
];

/** Column name patterns suggesting financial data. */
const FINANCIAL_COLUMN_PATTERNS = [
  /amount|price|cost|total|balance|revenue|fee|charge/i,
  /salary|wage|compensation|rate|discount/i,
  /tax|vat|gst|duty/i,
  /currency|exchange.?rate/i,
  /credit|debit|payment/i,
];

/** Column name patterns suggesting audit trail. */
const AUDIT_COLUMN_PATTERNS = [
  /created.?(at|on|date|time|by)/i,
  /updated.?(at|on|date|time|by)/i,
  /modified.?(at|on|date|time|by)/i,
  /^(created|updated|modified)$/i,
];

/** Column name patterns suggesting soft delete. */
const SOFT_DELETE_PATTERNS = [
  /deleted.?(at|on|date|time)/i,
  /is.?deleted/i,
  /^(active|enabled|disabled|archived)$/i,
];

// =============================================================================
// Asset Metadata — extracted from findings per table
// =============================================================================

export interface TableMetadata {
  tableKey: string;        // schema.table
  tableName: string;
  schemaName: string;
  columnNames: string[];
  columnCount: number;
  indexCount: number;
  constraintCount: number;
  fkInCount: number;       // how many tables reference this table
  fkOutCount: number;      // how many tables this table references
  uniqueConstraintCount: number;
  checkConstraintCount: number;
  hasAuditColumns: boolean;
  hasSoftDelete: boolean;
  piiColumnCount: number;
  financialColumnCount: number;
  avgNullRate: number;     // average null ratio across columns (from findings)
  findingSeveritySum: number; // sum of severity weights for findings on this table
  findingCount: number;
}

/**
 * Extract table-level metadata from persisted findings.
 * This is the sole source of schema knowledge — no catalog queries.
 */
export function extractTableMetadata(
  findings: ResultFindingRow[],
  sourceSystem: string,
): TableMetadata[] {
  // Group findings by table key
  const tableMap = new Map<string, {
    tableName: string;
    schemaName: string;
    columns: Set<string>;
    severitySum: number;
    findingCount: number;
    nullRates: number[];
    indexMentions: number;
    constraintMentions: number;
    fkInMentions: number;
    fkOutMentions: number;
    uniqueConstraintMentions: number;
    checkConstraintMentions: number;
  }>();

  const severityWeight: Record<string, number> = {
    critical: 4, major: 3, minor: 2, info: 1,
  };

  for (const f of findings) {
    // Derive table key from asset_key or check context
    const tableKey = deriveTableKey(f);
    if (!tableKey) continue;

    const schemaName = tableKey.split('.')[0] ?? 'public';
    const tableName = tableKey.split('.').slice(1).join('.') || f.asset_name || tableKey;

    let entry = tableMap.get(tableKey);
    if (!entry) {
      entry = {
        tableName,
        schemaName,
        columns: new Set<string>(),
        severitySum: 0,
        findingCount: 0,
        nullRates: [],
        indexMentions: 0,
        constraintMentions: 0,
        fkInMentions: 0,
        fkOutMentions: 0,
        uniqueConstraintMentions: 0,
        checkConstraintMentions: 0,
      };
      tableMap.set(tableKey, entry);
    }

    entry.findingCount++;
    entry.severitySum += severityWeight[f.severity] ?? 1;

    // Extract column info from asset_key
    if (f.asset_type === 'column' && f.asset_key) {
      const parts = f.asset_key.split('.');
      if (parts.length >= 3) {
        entry.columns.add(parts[parts.length - 1]);
      }
    }

    // Extract schema signals from check_id patterns
    const checkLower = f.check_id.toLowerCase();
    if (checkLower.includes('missing-pk') || checkLower.includes('no-index')) {
      entry.indexMentions++;
    }
    if (checkLower.includes('no-constraints') || checkLower.includes('missing-fk')) {
      entry.constraintMentions++;
    }
    if (checkLower.includes('island') || checkLower.includes('orphan')) {
      entry.fkOutMentions = 0; // island = no FK out
    }

    // Null rate from P6 checks
    if (checkLower.includes('null') && f.observed_value != null) {
      entry.nullRates.push(f.observed_value);
    }
  }

  // Convert to TableMetadata
  const result: TableMetadata[] = [];

  for (const [tableKey, entry] of tableMap) {
    const columnNames = [...entry.columns];
    const piiCount = columnNames.filter(c => PII_COLUMN_PATTERNS.some(p => p.test(c))).length;
    const finCount = columnNames.filter(c => FINANCIAL_COLUMN_PATTERNS.some(p => p.test(c))).length;
    const hasAudit = columnNames.some(c => AUDIT_COLUMN_PATTERNS.some(p => p.test(c)));
    const hasSoftDel = columnNames.some(c => SOFT_DELETE_PATTERNS.some(p => p.test(c)));
    const avgNull = entry.nullRates.length > 0
      ? entry.nullRates.reduce((a, b) => a + b, 0) / entry.nullRates.length
      : 0;

    result.push({
      tableKey,
      tableName: entry.tableName,
      schemaName: entry.schemaName,
      columnNames,
      columnCount: Math.max(columnNames.length, 1),
      indexCount: Math.max(0, entry.indexMentions > 0 ? 0 : 1), // if index issues found, likely 0 indexes
      constraintCount: entry.constraintMentions,
      fkInCount: entry.fkInMentions,
      fkOutCount: entry.fkOutMentions,
      uniqueConstraintCount: entry.uniqueConstraintMentions,
      checkConstraintCount: entry.checkConstraintMentions,
      hasAuditColumns: hasAudit,
      hasSoftDelete: hasSoftDel,
      piiColumnCount: piiCount,
      financialColumnCount: finCount,
      avgNullRate: avgNull,
      findingSeveritySum: entry.severitySum,
      findingCount: entry.findingCount,
    });
  }

  return result;
}

/** Derive table key from a finding row's asset info. */
function deriveTableKey(f: ResultFindingRow): string | null {
  if (!f.asset_key) return null;

  const parts = f.asset_key.split('.');
  if (f.asset_type === 'table' || f.asset_type === 'schema') {
    // Already at table level or higher
    return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : f.asset_key;
  }
  if (f.asset_type === 'column' && parts.length >= 3) {
    // Column: schema.table.column → schema.table
    return `${parts[0]}.${parts[1]}`;
  }
  if (f.asset_type === 'constraint' || f.asset_type === 'index') {
    // Constraint/index: schema.table.constraint → schema.table
    return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : null;
  }
  if (f.asset_type === 'relationship') {
    // Relationship: take the first table
    return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : null;
  }

  // Fallback: try schema.table from first two parts
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : null;
}

// =============================================================================
// Signal Extraction Functions
// =============================================================================

export function signalNamingConvention(meta: TableMetadata): CriticalitySignal {
  const matches = CRITICAL_TABLE_PATTERNS.some(p => p.test(meta.tableName));
  return {
    signalType: 'naming-convention',
    signalLabel: 'Critical Entity Name',
    weight: SIGNAL_BASE_WEIGHTS['naming-convention'],
    value: matches ? 1.0 : 0.0,
    evidence: matches
      ? `Table "${meta.tableName}" matches critical business entity naming pattern`
      : `Table "${meta.tableName}" does not match known critical entity patterns`,
  };
}

export function signalPiiPattern(meta: TableMetadata): CriticalitySignal {
  const ratio = meta.columnCount > 0 ? meta.piiColumnCount / meta.columnCount : 0;
  const value = Math.min(ratio * 3, 1.0); // amplify: even 1 PII column in 3 is high
  return {
    signalType: 'pii-pattern',
    signalLabel: 'PII Column Density',
    weight: SIGNAL_BASE_WEIGHTS['pii-pattern'],
    value,
    evidence: `${meta.piiColumnCount} of ${meta.columnCount} known columns match PII naming patterns`,
  };
}

export function signalFinancialPattern(meta: TableMetadata): CriticalitySignal {
  const ratio = meta.columnCount > 0 ? meta.financialColumnCount / meta.columnCount : 0;
  const value = Math.min(ratio * 3, 1.0);
  return {
    signalType: 'financial-pattern',
    signalLabel: 'Financial Data Density',
    weight: SIGNAL_BASE_WEIGHTS['financial-pattern'],
    value,
    evidence: `${meta.financialColumnCount} of ${meta.columnCount} known columns match financial data patterns`,
  };
}

export function signalFindingSeverityLoad(meta: TableMetadata, maxSeveritySum: number): CriticalitySignal {
  const value = maxSeveritySum > 0 ? Math.min(meta.findingSeveritySum / maxSeveritySum, 1.0) : 0;
  return {
    signalType: 'finding-severity-load',
    signalLabel: 'Finding Severity Load',
    weight: SIGNAL_BASE_WEIGHTS['finding-severity-load'],
    value,
    evidence: `${meta.findingCount} findings with total severity weight ${meta.findingSeveritySum}`,
  };
}

export function signalRelationshipCentrality(meta: TableMetadata, maxRelCount: number): CriticalitySignal {
  const totalRels = meta.fkInCount + meta.fkOutCount;
  const value = maxRelCount > 0 ? Math.min(totalRels / maxRelCount, 1.0) : 0;
  return {
    signalType: 'relationship-centrality',
    signalLabel: 'Relationship Centrality',
    weight: SIGNAL_BASE_WEIGHTS['relationship-centrality'],
    value,
    evidence: `${totalRels} direct relationships (${meta.fkInCount} inbound, ${meta.fkOutCount} outbound)`,
  };
}

export function signalAuditPattern(meta: TableMetadata): CriticalitySignal {
  return {
    signalType: 'audit-pattern',
    signalLabel: 'Audit Trail Presence',
    weight: SIGNAL_BASE_WEIGHTS['audit-pattern'],
    value: meta.hasAuditColumns ? 0.8 : 0.0,
    evidence: meta.hasAuditColumns
      ? 'Table has audit trail columns (created_at, updated_at, etc.)'
      : 'No audit trail columns detected',
  };
}

export function signalSoftDeletePattern(meta: TableMetadata): CriticalitySignal {
  return {
    signalType: 'soft-delete-pattern',
    signalLabel: 'Soft Delete Pattern',
    weight: SIGNAL_BASE_WEIGHTS['soft-delete-pattern'],
    value: meta.hasSoftDelete ? 0.7 : 0.0,
    evidence: meta.hasSoftDelete
      ? 'Table uses soft delete pattern (data preservation concern)'
      : 'No soft delete pattern detected',
  };
}

export function signalColumnCount(meta: TableMetadata, maxColumns: number): CriticalitySignal {
  // Wide tables often hold core entities; normalise by max in scan
  const value = maxColumns > 0 ? Math.min(meta.columnCount / maxColumns, 1.0) : 0;
  return {
    signalType: 'column-count',
    signalLabel: 'Column Width',
    weight: SIGNAL_BASE_WEIGHTS['column-count'],
    value,
    evidence: `${meta.columnCount} known columns (relative to max ${maxColumns} in scan)`,
  };
}

export function signalSchemaPosition(meta: TableMetadata): CriticalitySignal {
  // Tables in public/dbo are typically more important
  const primary = /^(public|dbo|main)$/i.test(meta.schemaName);
  return {
    signalType: 'schema-position',
    signalLabel: 'Schema Position',
    weight: SIGNAL_BASE_WEIGHTS['schema-position'],
    value: primary ? 0.7 : 0.2,
    evidence: primary
      ? `Table is in primary schema "${meta.schemaName}"`
      : `Table is in auxiliary schema "${meta.schemaName}"`,
  };
}

export function signalEnumLookup(meta: TableMetadata): CriticalitySignal {
  // Small tables with few columns and names like _type, _status, _code → likely lookup
  const isLookup = meta.columnCount <= 4 &&
    /^(type|status|code|category|level|role|state|kind|enum|lookup)/i.test(meta.tableName);
  return {
    signalType: 'enum-lookup',
    signalLabel: 'Enum/Lookup Table',
    weight: SIGNAL_BASE_WEIGHTS['enum-lookup'],
    value: isLookup ? -0.5 : 0.0, // negative signal: reduces criticality
    evidence: isLookup
      ? `Small table "${meta.tableName}" with ${meta.columnCount} columns appears to be a lookup/enum table`
      : 'Not identified as a lookup/enum table',
  };
}

export function signalJunctionTable(meta: TableMetadata): CriticalitySignal {
  // Junction tables: typically 2-3 FK columns, small column count, name often contains underscore
  const isJunction = meta.columnCount <= 5 &&
    meta.fkOutCount >= 2 &&
    meta.tableName.includes('_');
  return {
    signalType: 'junction-table',
    signalLabel: 'Junction Table',
    weight: SIGNAL_BASE_WEIGHTS['junction-table'],
    value: isJunction ? 0.5 : 0.0,
    evidence: isJunction
      ? `Table "${meta.tableName}" appears to be a junction/bridge table with ${meta.fkOutCount} outbound FKs`
      : 'Not identified as a junction table',
  };
}

// =============================================================================
// Collect All Signals for a Table
// =============================================================================

export function collectSignals(
  meta: TableMetadata,
  allMeta: TableMetadata[],
): CriticalitySignal[] {
  const maxSeveritySum = Math.max(1, ...allMeta.map(m => m.findingSeveritySum));
  const maxRelCount = Math.max(1, ...allMeta.map(m => m.fkInCount + m.fkOutCount));
  const maxColumns = Math.max(1, ...allMeta.map(m => m.columnCount));

  return [
    signalNamingConvention(meta),
    signalPiiPattern(meta),
    signalFinancialPattern(meta),
    signalFindingSeverityLoad(meta, maxSeveritySum),
    signalRelationshipCentrality(meta, maxRelCount),
    signalAuditPattern(meta),
    signalSoftDeletePattern(meta),
    signalColumnCount(meta, maxColumns),
    signalSchemaPosition(meta),
    signalEnumLookup(meta),
    signalJunctionTable(meta),
  ];
}
