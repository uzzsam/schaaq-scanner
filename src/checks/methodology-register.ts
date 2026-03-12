/**
 * Methodology & Assumption Register
 *
 * Static, auditable catalogue describing how each scanner check works,
 * what it assumes, and where it may produce false positives or negatives.
 *
 * This register is:
 *   - Immutable per app version (versioned alongside the checks)
 *   - Attached to every finding via the evidence builder
 *   - Surfaced in reports and UI for transparency / regulatory audit
 *   - Keyed by check ID (case-insensitive match)
 */

// =============================================================================
// Types
// =============================================================================

/** Methodology card for a single scanner check. */
export interface CheckMethodology {
  /** Check ID this methodology describes (e.g. "P1-SEMANTIC-IDENTITY") */
  checkId: string;
  /** DALC property number 1–8 */
  property: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  /** Human-readable check name */
  checkName: string;
  /** Detection technique classification */
  technique: 'deterministic' | 'heuristic' | 'statistical';
  /** Plain-English description of what the check does and how */
  methodology: string;
  /** Assumptions the check makes about the input data or environment */
  assumptions: string[];
  /** Known limitations, edge cases, false-positive/negative scenarios */
  limitations: string[];
  /** What inputs / metadata the check inspects */
  dataInputs: string[];
  /** Academic or industry references underpinning the technique (if any) */
  references?: string[];
}

/** The full register: one entry per check. */
export type MethodologyRegister = ReadonlyMap<string, CheckMethodology>;

// =============================================================================
// Normalise key for case-insensitive lookup
// =============================================================================

function normaliseCheckId(id: string): string {
  return id.toUpperCase();
}

// =============================================================================
// Register Entries
// =============================================================================

const ENTRIES: CheckMethodology[] = [
  // -------------------------------------------------------------------------
  // P1 — Semantic Identity
  // -------------------------------------------------------------------------
  {
    checkId: 'P1-SEMANTIC-IDENTITY',
    property: 1,
    checkName: 'Semantic Identity',
    technique: 'heuristic',
    methodology:
      'Extracts entity stems from table and column names, builds a synonym map from configurable synonym groups, ' +
      'clusters stems using Union-Find with configurable Levenshtein similarity threshold, ' +
      'and flags tables whose names resolve to the same semantic entity.',
    assumptions: [
      'Table and column names reflect the business entities they store.',
      'English-language naming conventions are used (synonym groups are English).',
      'Levenshtein distance is a meaningful proxy for semantic similarity of identifiers.',
      'Configurable synonym groups are representative of the organisation\u2019s domain vocabulary.',
    ],
    limitations: [
      'Non-English or domain-specific abbreviations may not cluster correctly.',
      'Tables that legitimately share entity prefixes (e.g. "order" and "order_line") may be flagged as duplicates.',
      'The check cannot assess whether duplicate-looking tables serve intentionally different bounded contexts.',
      'Synonym group coverage depends on configuration — missing synonyms produce false negatives.',
    ],
    dataInputs: ['Table names', 'Column names', 'Synonym groups (config)'],
  },

  // -------------------------------------------------------------------------
  // P2 — Reference Data
  // -------------------------------------------------------------------------
  {
    checkId: 'P2-TYPE-INCONSISTENCY',
    property: 2,
    checkName: 'Type Inconsistency',
    technique: 'deterministic',
    methodology:
      'Groups columns sharing the same name across different tables and compares their declared SQL data types. ' +
      'Flags column-name groups where more than one distinct data type is used.',
    assumptions: [
      'Same-named columns across tables are intended to represent the same concept.',
      'SQL data type declarations are accurate reflections of stored data.',
    ],
    limitations: [
      'Columns with the same name but legitimately different types across different domains will be flagged.',
      'Type aliases (e.g. VARCHAR vs TEXT in PostgreSQL) may cause false positives depending on adapter normalisation.',
      'Does not inspect actual stored values — only declared types.',
    ],
    dataInputs: ['Column names', 'Column data types'],
  },
  {
    checkId: 'P2-UNCONTROLLED-VOCAB',
    property: 2,
    checkName: 'Uncontrolled Vocabulary',
    technique: 'heuristic',
    methodology:
      'Identifies columns likely to contain categorical/enumerated values by examining column names for ' +
      'status/type/category patterns and checking for low distinct-value counts. ' +
      'Flags columns where the distinct-value count exceeds the configured threshold without a CHECK constraint or FK to a reference table.',
    assumptions: [
      'Columns named with status/type/category suffixes store enumerated values.',
      'Low distinct-value counts indicate categorical data.',
      'A CHECK constraint or FK reference indicates controlled vocabulary.',
    ],
    limitations: [
      'Columns with genuinely high-cardinality status fields (e.g. free-text status notes) may be missed.',
      'The heuristic depends on column-name patterns — unconventionally named enum columns are not detected.',
      'Adapter must provide column statistics (distinct count) for this check to function.',
    ],
    dataInputs: ['Column names', 'Column statistics (distinct count)', 'CHECK constraints', 'Foreign key relationships'],
  },

  // -------------------------------------------------------------------------
  // P3 — Domain Ownership
  // -------------------------------------------------------------------------
  {
    checkId: 'P3-DOMAIN-OVERLAP',
    property: 3,
    checkName: 'Domain Overlap',
    technique: 'heuristic',
    methodology:
      'Compares entity stems across schemas to detect the same logical entity appearing in multiple schemas. ' +
      'Uses configurable entity-similarity threshold to identify cross-schema duplication.',
    assumptions: [
      'Each schema represents a distinct bounded context or domain.',
      'Duplicate entity stems across schemas indicate ownership ambiguity.',
      'Schema boundaries are meaningful organisational/architectural boundaries.',
    ],
    limitations: [
      'Shared reference tables (e.g. "country", "currency") across schemas are expected and will be flagged.',
      'Multi-tenant architectures with identical schemas per tenant will generate false positives.',
      'The check does not distinguish intentional data sharing from accidental duplication.',
    ],
    dataInputs: ['Schema names', 'Table names', 'Similarity threshold (config)'],
  },
  {
    checkId: 'P3-CROSS-SCHEMA-COUPLING',
    property: 3,
    checkName: 'Cross-Schema Coupling',
    technique: 'deterministic',
    methodology:
      'Examines foreign key relationships that cross schema boundaries. ' +
      'Flags FK references where the referencing table and referenced table reside in different schemas.',
    assumptions: [
      'Cross-schema foreign keys indicate coupling between bounded contexts.',
      'Schema boundaries represent intentional architectural separation.',
    ],
    limitations: [
      'Some cross-schema FKs are architecturally correct (e.g. FK to shared reference schema).',
      'Databases using a single schema will produce zero findings regardless of coupling.',
      'Only detects explicit FK constraints — implicit joins without FKs are not detected.',
    ],
    dataInputs: ['Foreign key definitions', 'Schema names'],
  },

  // -------------------------------------------------------------------------
  // P4 — Anti-Corruption
  // -------------------------------------------------------------------------
  {
    checkId: 'P4-CSV-IMPORT-PATTERN',
    property: 4,
    checkName: 'CSV Import Pattern',
    technique: 'heuristic',
    methodology:
      'Identifies tables that appear to be direct imports from spreadsheets or CSV files. ' +
      'Detection signals include: all-VARCHAR column types, column names containing spaces or special characters, ' +
      'table names matching configurable CSV-indicator patterns, and absence of primary keys or constraints.',
    assumptions: [
      'Direct CSV/spreadsheet imports leave structural fingerprints (all-text types, no constraints).',
      'CSV-indicator naming patterns (e.g. "import", "upload", "staging") are configurable and representative.',
    ],
    limitations: [
      'Legitimate staging tables used in ETL pipelines may be flagged.',
      'Well-structured CSV imports that were later typed and constrained will not be detected.',
      'The check cannot verify whether the data actually originated from a spreadsheet.',
    ],
    dataInputs: ['Table names', 'Column data types', 'Column names', 'Primary key presence', 'CSV indicator patterns (config)'],
  },
  {
    checkId: 'P4-ISLAND-TABLES',
    property: 4,
    checkName: 'Island Tables',
    technique: 'deterministic',
    methodology:
      'Identifies tables with zero foreign key relationships (neither referencing nor referenced by other tables). ' +
      'These "island" tables have no declared relational ties to the rest of the schema.',
    assumptions: [
      'Tables in a relational database should participate in at least one foreign key relationship.',
      'Absence of FK relationships indicates either missing constraints or an unintegrated data silo.',
    ],
    limitations: [
      'Lookup/reference tables, audit log tables, and event stores may legitimately have no FKs.',
      'Application-layer joins (without FK constraints) are invisible to this check.',
      'Small databases with few tables may have a high island-table ratio by design.',
    ],
    dataInputs: ['Foreign key definitions', 'Table list'],
  },
  {
    checkId: 'P4-WIDE-TABLES',
    property: 4,
    checkName: 'Wide Tables',
    technique: 'deterministic',
    methodology:
      'Flags tables exceeding a column-count threshold (default: 30 columns). ' +
      'Wide tables often indicate denormalised schemas, merged imports, or missing entity decomposition.',
    assumptions: [
      'Tables with very high column counts are likely denormalised or improperly structured.',
      'The default threshold of 30 columns is a reasonable heuristic for most transactional schemas.',
    ],
    limitations: [
      'Data warehouse fact tables and wide-column analytical tables may legitimately be wide.',
      'The threshold is configurable but a single number cannot distinguish good vs bad width.',
      'EAV (Entity-Attribute-Value) patterns may produce narrow tables that are functionally wide.',
    ],
    dataInputs: ['Column count per table'],
  },

  // -------------------------------------------------------------------------
  // P5 — Schema Governance
  // -------------------------------------------------------------------------
  {
    checkId: 'P5-NAMING-VIOLATIONS',
    property: 5,
    checkName: 'Naming Convention Violations',
    technique: 'deterministic',
    methodology:
      'Checks table and column names against the configured naming convention (snake_case, camelCase, PascalCase). ' +
      'Flags identifiers that do not conform to the selected convention.',
    assumptions: [
      'A consistent naming convention has been adopted for the database.',
      'The configured convention applies uniformly to all schemas in scope.',
    ],
    limitations: [
      'Legacy tables or third-party schema objects may use different conventions legitimately.',
      'Database-generated names (e.g. constraint names) may not follow application naming conventions.',
      'The check does not assess whether names are semantically meaningful — only structural conformance.',
    ],
    dataInputs: ['Table names', 'Column names', 'Naming convention (config)'],
  },
  {
    checkId: 'P5-MISSING-PK',
    property: 5,
    checkName: 'Missing Primary Key',
    technique: 'deterministic',
    methodology:
      'Identifies tables that have no declared primary key constraint. ' +
      'A missing PK means the database cannot enforce entity uniqueness at the schema level.',
    assumptions: [
      'Every table should have a primary key for entity identity and referential integrity.',
      'The adapter correctly reports primary key constraints from the information schema.',
    ],
    limitations: [
      'Tables using unique indexes as surrogate PKs (without a formal PK constraint) will be flagged.',
      'Append-only event/log tables may intentionally lack PKs.',
      'Temporary or staging tables may not require PKs.',
    ],
    dataInputs: ['Primary key constraints per table'],
  },
  {
    checkId: 'P5-UNDOCUMENTED',
    property: 5,
    checkName: 'Undocumented Tables',
    technique: 'deterministic',
    methodology:
      'Checks for the presence of table-level or column-level comments/descriptions in the database metadata. ' +
      'Flags tables where no comment or description is defined.',
    assumptions: [
      'Database comments are the primary mechanism for schema documentation.',
      'The adapter correctly extracts comment metadata from the information schema.',
    ],
    limitations: [
      'Documentation may exist outside the database (e.g. in a data catalogue or wiki) and not be detected.',
      'A comment existing does not guarantee it is accurate, current, or useful.',
      'Some databases do not support native table/column comments.',
    ],
    dataInputs: ['Table comments/descriptions', 'Column comments/descriptions'],
  },

  // -------------------------------------------------------------------------
  // P6 — Quality Measurement
  // -------------------------------------------------------------------------
  {
    checkId: 'P6-HIGH-NULL-RATE',
    property: 6,
    checkName: 'High Null Rate',
    technique: 'deterministic',
    methodology:
      'Compares observed null fraction per column against the configured null-rate threshold (default: 30%). ' +
      'Flags columns where the null fraction exceeds the threshold.',
    assumptions: [
      'Column statistics (null fraction) are available and reasonably current.',
      'A high null rate indicates potential data quality or completeness issues.',
      'The configured threshold is appropriate for the organisation\u2019s data quality standards.',
    ],
    limitations: [
      'Columns that are intentionally nullable (e.g. optional fields) will be flagged if above threshold.',
      'Stale statistics may not reflect current data state.',
      'The check cannot distinguish between missing data and legitimately absent values.',
    ],
    dataInputs: ['Column statistics (null fraction)', 'Null rate threshold (config)'],
  },
  {
    checkId: 'P6-NO-INDEXES',
    property: 6,
    checkName: 'Missing Indexes',
    technique: 'deterministic',
    methodology:
      'Identifies tables that have no indexes defined (beyond an implicit PK index). ' +
      'Absence of indexes on frequently queried tables indicates potential performance and quality issues.',
    assumptions: [
      'Most tables benefit from at least one index beyond the primary key.',
      'The adapter correctly reports index metadata.',
    ],
    limitations: [
      'Small tables may not require indexes for acceptable performance.',
      'The check does not analyse query patterns — missing indexes may not affect actual workloads.',
      'Heap tables (intentionally unindexed) may be valid for specific use cases.',
    ],
    dataInputs: ['Index definitions per table'],
  },

  // -------------------------------------------------------------------------
  // P6 — Anomaly Detection
  // -------------------------------------------------------------------------
  {
    checkId: 'P6-ZSCORE-OUTLIERS',
    property: 6,
    checkName: 'Z-Score Outliers',
    technique: 'statistical',
    methodology:
      'Computes z-scores for numeric column statistics (mean, stddev) and flags columns ' +
      'where the z-score indicates values beyond \u00b13 standard deviations from the population mean. ' +
      'Uses the standard z = (x \u2212 \u03bc) / \u03c3 formula.',
    assumptions: [
      'Numeric column statistics (mean, standard deviation) are available from the adapter.',
      'The underlying data distribution is approximately normal for z-score to be meaningful.',
      'A z-score threshold of 3 is appropriate for identifying outliers.',
    ],
    limitations: [
      'Non-normal distributions (skewed, bimodal) may produce misleading z-scores.',
      'The check uses aggregate statistics, not individual row values — it detects distributional anomalies, not single outliers.',
      'Stale statistics may not reflect recent data changes.',
    ],
    dataInputs: ['Column statistics (mean, standard deviation, min, max)'],
    references: ['Grubbs, F.E. (1969). Procedures for Detecting Outlying Observations in Samples. Technometrics.'],
  },
  {
    checkId: 'P6-IQR-OUTLIERS',
    property: 6,
    checkName: 'IQR Outliers',
    technique: 'statistical',
    methodology:
      'Applies the interquartile range (IQR) method to detect outlier columns. ' +
      'Computes Q1, Q3, and IQR from column statistics, then flags columns with values ' +
      'outside [Q1 \u2212 1.5\u00d7IQR, Q3 + 1.5\u00d7IQR].',
    assumptions: [
      'Column statistics include quartile information or can be approximated.',
      'The 1.5\u00d7IQR rule is appropriate for the data distribution.',
    ],
    limitations: [
      'The IQR method is robust to non-normal distributions but may be too conservative for heavy-tailed data.',
      'Approximated quartiles from limited statistics may reduce accuracy.',
      'Like z-score, this operates on aggregate statistics, not individual rows.',
    ],
    dataInputs: ['Column statistics (quartiles or percentiles)'],
    references: ['Tukey, J.W. (1977). Exploratory Data Analysis. Addison-Wesley.'],
  },
  {
    checkId: 'P6-NULL-RATE-SPIKE',
    property: 6,
    checkName: 'Null Rate Spike',
    technique: 'statistical',
    methodology:
      'Compares the current null rate of a column against its historical baseline (from previous scan results). ' +
      'Flags columns where the null rate has increased by more than a configured delta threshold.',
    assumptions: [
      'Previous scan results are available for baseline comparison.',
      'A sudden increase in null rate indicates a data quality regression.',
      'The delta threshold is appropriate for distinguishing normal variation from anomalies.',
    ],
    limitations: [
      'First scan has no baseline — this check produces no findings on initial run.',
      'Gradual null-rate drift below the delta threshold will not be detected.',
      'Schema changes (new nullable columns) may cause false positives.',
    ],
    dataInputs: ['Current column null fractions', 'Historical scan null fractions'],
  },

  // -------------------------------------------------------------------------
  // P7 — Regulatory Traceability
  // -------------------------------------------------------------------------
  {
    checkId: 'P7-MISSING-AUDIT',
    property: 7,
    checkName: 'Missing Audit Columns',
    technique: 'deterministic',
    methodology:
      'Checks each table for the presence of audit trail columns (created_at, updated_at, created_by, etc.) ' +
      'using configurable column-name patterns. Flags tables missing standard audit columns.',
    assumptions: [
      'Audit columns are the primary mechanism for change traceability at the database level.',
      'The configured audit column patterns are representative of the organisation\u2019s conventions.',
    ],
    limitations: [
      'Audit may be implemented via triggers, CDC, or external audit tables — not detected by this check.',
      'Column names matching audit patterns do not guarantee the columns are actually populated.',
      'Reference/lookup tables may not require audit columns.',
    ],
    dataInputs: ['Column names', 'Audit column patterns (config)'],
  },
  {
    checkId: 'P7-NO-CONSTRAINTS',
    property: 7,
    checkName: 'Missing Constraints',
    technique: 'deterministic',
    methodology:
      'Identifies tables with no CHECK constraints, no UNIQUE constraints, and no foreign key constraints ' +
      '(beyond the primary key). Absence of constraints means the database cannot enforce business rules.',
    assumptions: [
      'Business rules should be enforced at the database level via constraints.',
      'The adapter correctly reports CHECK, UNIQUE, and FK constraints.',
    ],
    limitations: [
      'Application-layer validation is invisible to this check.',
      'Some databases support different constraint mechanisms (e.g. domain types) not captured here.',
      'Simple tables with only a PK and data columns may not need additional constraints.',
    ],
    dataInputs: ['CHECK constraints', 'UNIQUE constraints', 'Foreign key constraints'],
  },

  // -------------------------------------------------------------------------
  // P8 — AI Readiness
  // -------------------------------------------------------------------------
  {
    checkId: 'P8-AI-LINEAGE-COMPLETENESS',
    property: 8,
    checkName: 'AI Lineage Completeness',
    technique: 'deterministic',
    methodology:
      'Assesses whether tables that could serve as ML feature sources have sufficient lineage metadata. ' +
      'Checks for: documented column descriptions, foreign key relationships establishing provenance, ' +
      'and audit columns enabling temporal traceability.',
    assumptions: [
      'Tables with numeric or categorical columns are potential ML feature sources.',
      'Lineage is approximated by FK relationships, column documentation, and audit columns.',
      'AI-readiness requires knowing where data came from and when it changed.',
    ],
    limitations: [
      'External lineage tools (e.g. dbt, Marquez, DataHub) are not consulted.',
      'The check cannot assess actual ML pipeline integration or feature store registration.',
      'A table having lineage metadata does not guarantee the metadata is accurate.',
    ],
    dataInputs: ['Column descriptions', 'Foreign key relationships', 'Audit columns', 'Column data types'],
  },
  {
    checkId: 'P8-AI-BIAS-ATTRIBUTE-DOCUMENTATION',
    property: 8,
    checkName: 'Bias Attribute Documentation',
    technique: 'heuristic',
    methodology:
      'Identifies columns that may contain protected/sensitive attributes relevant to AI fairness ' +
      '(e.g. gender, age, ethnicity, disability) using column-name pattern matching. ' +
      'Flags tables where such columns exist but lack documentation (comments/descriptions).',
    assumptions: [
      'Column names indicate the presence of protected attributes.',
      'Undocumented protected attributes create AI bias risk.',
      'The built-in pattern list covers common protected attribute names.',
    ],
    limitations: [
      'Encoded or obfuscated column names (e.g. "col_47") will not be detected.',
      'The presence of a protected attribute column does not mean the data is actually used for ML.',
      'Documentation existing does not guarantee bias has been assessed or mitigated.',
    ],
    dataInputs: ['Column names', 'Column descriptions', 'Protected attribute patterns'],
  },
  {
    checkId: 'P8-AI-REPRODUCIBILITY',
    property: 8,
    checkName: 'AI Reproducibility',
    technique: 'deterministic',
    methodology:
      'Evaluates whether tables have the structural prerequisites for ML experiment reproducibility: ' +
      'primary keys (for deterministic row identification), timestamps (for point-in-time snapshots), ' +
      'and constraints (for data integrity during feature extraction).',
    assumptions: [
      'Reproducible ML requires deterministic data access (PKs), temporal anchoring (timestamps), and integrity (constraints).',
      'These structural prerequisites are necessary conditions for reproducibility.',
    ],
    limitations: [
      'Reproducibility also depends on code versioning, hyperparameter tracking, and environment management — not assessed.',
      'The check measures structural prerequisites, not actual reproducibility of any ML pipeline.',
      'Tables not intended for ML use will still be assessed.',
    ],
    dataInputs: ['Primary key constraints', 'Timestamp columns', 'CHECK/UNIQUE/FK constraints'],
  },
];

// =============================================================================
// Build the register
// =============================================================================

const _register = new Map<string, CheckMethodology>();
for (const entry of ENTRIES) {
  _register.set(normaliseCheckId(entry.checkId), entry);
}

/** Immutable methodology register — one entry per scanner check. */
export const METHODOLOGY_REGISTER: MethodologyRegister = _register;

// =============================================================================
// Lookup helper
// =============================================================================

/**
 * Look up the methodology card for a check ID (case-insensitive).
 * Returns undefined if the check ID is not in the register.
 */
export function getCheckMethodology(checkId: string): CheckMethodology | undefined {
  return METHODOLOGY_REGISTER.get(normaliseCheckId(checkId));
}

/**
 * Return all methodology entries as an array, sorted by property then check name.
 */
export function getAllMethodologies(): CheckMethodology[] {
  return [...METHODOLOGY_REGISTER.values()].sort((a, b) => {
    if (a.property !== b.property) return a.property - b.property;
    return a.checkName.localeCompare(b.checkName);
  });
}
