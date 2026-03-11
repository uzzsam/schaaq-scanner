import type { SchemaData } from '../adapters/types';

// =============================================================================
// Database-specific context for remediation messaging
// =============================================================================

export type DbType = 'postgresql' | 'mysql' | 'mssql' | 'csv' | 'generic';

export interface DbContext {
  /** Human-readable label: "PostgreSQL", "MySQL", etc. */
  label: string;
  /** Short engine identifier for evidence strings */
  engine: string;
  /** Database-specific remediation strings keyed by check */
  remediation: {
    typeInconsistency: string;
    csvImportPattern: string;
    islandTables: string;
    wideTables: string;
    namingViolations: string;
    missingPk: string;
    undocumented: string;
    highNullRate: string;
    noIndexes: string;
    missingAudit: string;
    noConstraints: string;
    aiLineageCompleteness: string;
    aiBiasAttributeDocumentation: string;
    aiReproducibility: string;
  };
}

/**
 * Return a DbContext with remediation strings tailored to the database engine
 * that produced the schema data being scanned.
 */
export function getDbContext(schema: SchemaData): DbContext {
  const dbType: DbType =
    schema.databaseType === 'postgresql' ? 'postgresql' :
    schema.databaseType === 'mysql'      ? 'mysql' :
    schema.databaseType === 'mssql'      ? 'mssql' :
    schema.databaseType === 'csv'        ? 'csv' :
    'generic';

  switch (dbType) {
    // ------------------------------------------------------------------ PG
    case 'postgresql':
      return {
        label: 'PostgreSQL',
        engine: 'PostgreSQL',
        remediation: {
          typeInconsistency:
            'Standardise column types using PostgreSQL DOMAIN types or explicit ALTER TABLE … ALTER COLUMN … TYPE to enforce a canonical type across all tables. Document the canonical types in a shared data dictionary.',
          csvImportPattern:
            'Replace ad-hoc CSV imports with PostgreSQL COPY … FROM or a managed ETL tool (e.g. pgloader). Stage data into a dedicated import schema before promoting to production tables.',
          islandTables:
            'Review island tables for missing foreign-key relationships. Use ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY to link them to their parent entities, or consolidate orphan lookup data into a reference schema.',
          wideTables:
            'Decompose wide tables using CREATE TABLE … AS SELECT or by splitting columns into normalised child tables joined by the original primary key. Consider PostgreSQL table inheritance or partitioning for large datasets.',
          namingViolations:
            'Adopt a consistent naming convention (e.g. snake_case) and enforce it with a pre-commit DDL linter. Rename deviating columns with ALTER TABLE … RENAME COLUMN.',
          missingPk:
            'Add primary key constraints using ALTER TABLE … ADD PRIMARY KEY (column). For tables without a natural key, add a BIGSERIAL or UUID column as a surrogate key.',
          undocumented:
            'Add documentation using COMMENT ON TABLE schema.table IS \'description\' and COMMENT ON COLUMN schema.table.column IS \'description\' for every table and key column.',
          highNullRate:
            'Investigate high-null columns for missing data pipelines or incorrect NULL defaults. Use ALTER TABLE … ALTER COLUMN … SET DEFAULT and backfill with UPDATE … WHERE column IS NULL. Run ANALYZE after bulk updates.',
          noIndexes:
            'Add indexes using CREATE INDEX CONCURRENTLY on columns used in WHERE, JOIN, and ORDER BY clauses. At minimum ensure primary key indexes exist. Use pg_stat_user_tables to identify hot scan paths.',
          missingAudit:
            'Add created_at TIMESTAMPTZ DEFAULT now() and updated_at TIMESTAMPTZ DEFAULT now() columns. Create a trigger function (using CREATE FUNCTION + CREATE TRIGGER) to automatically set updated_at on each UPDATE.',
          noConstraints:
            'Add appropriate constraints: ALTER TABLE … ADD PRIMARY KEY, ADD CONSTRAINT … FOREIGN KEY, ADD CONSTRAINT … CHECK, ADD CONSTRAINT … UNIQUE. Use pg_catalog views to verify constraint coverage.',
          aiLineageCompleteness:
            'Add source tracking columns and use pg_depend or a lineage tool like dbt to document data flow into ML feature tables. EU AI Act Article 12 requires automatic event recording across the AI system lifetime.',
          aiBiasAttributeDocumentation:
            'Add COMMENT ON COLUMN for all bias-sensitive attributes. Create a data classification view using pg_description to flag protected attributes. EU AI Act Article 10 requires bias examination of training datasets.',
          aiReproducibility:
            'Add temporal columns using TIMESTAMPTZ DEFAULT now(). For full EU AI Act Art 12 compliance, consider PostgreSQL temporal table extensions or SCD Type 2 patterns to support point-in-time reconstruction of training datasets.',
        },
      };

    // ------------------------------------------------------------------ MY
    case 'mysql':
      return {
        label: 'MySQL',
        engine: 'MySQL',
        remediation: {
          typeInconsistency:
            'Standardise column types using ALTER TABLE … MODIFY COLUMN to enforce canonical types across all tables. Document the canonical types in a shared data dictionary and use strict SQL mode to catch type mismatches.',
          csvImportPattern:
            'Replace ad-hoc CSV imports with LOAD DATA INFILE or a managed ETL tool. Stage data into a dedicated import schema before promoting to production tables. Use SET sql_mode=STRICT_TRANS_TABLES to catch truncation.',
          islandTables:
            'Review island tables for missing foreign-key relationships. Use ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY (InnoDB only) to link them to their parent entities, or consolidate orphan lookup data into a reference schema.',
          wideTables:
            'Decompose wide tables into normalised child tables joined by the original primary key. Use CREATE TABLE … SELECT to migrate data. Consider MySQL partitioning for very large tables.',
          namingViolations:
            'Adopt a consistent naming convention (e.g. snake_case) and enforce it with a pre-commit DDL linter. Rename deviating columns with ALTER TABLE … CHANGE COLUMN.',
          missingPk:
            'Add primary key constraints using ALTER TABLE … ADD PRIMARY KEY (column). For tables without a natural key, add an INT AUTO_INCREMENT or UUID column as a surrogate key.',
          undocumented:
            'Add documentation using ALTER TABLE … COMMENT \'description\' and ALTER TABLE … MODIFY COLUMN … COMMENT \'description\' for every table and key column.',
          highNullRate:
            'Investigate high-null columns for missing data pipelines or incorrect NULL defaults. Use ALTER TABLE … ALTER COLUMN … SET DEFAULT and backfill with UPDATE … WHERE column IS NULL. Run ANALYZE TABLE after bulk updates.',
          noIndexes:
            'Add indexes using CREATE INDEX on columns used in WHERE, JOIN, and ORDER BY clauses. At minimum ensure primary key indexes exist on InnoDB tables. Use EXPLAIN to identify full table scans.',
          missingAudit:
            'Add created_at DATETIME DEFAULT CURRENT_TIMESTAMP and updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP columns to all tables to support audit and compliance requirements.',
          noConstraints:
            'Add appropriate constraints: ALTER TABLE … ADD PRIMARY KEY, ADD CONSTRAINT … FOREIGN KEY (InnoDB), ADD CONSTRAINT … CHECK (MySQL 8.0+), ADD CONSTRAINT … UNIQUE. Verify engine supports the constraint type.',
          aiLineageCompleteness:
            'Add source_table and source_query columns to feature tables. Consider implementing a metadata schema to track data lineage for AI audit requirements.',
          aiBiasAttributeDocumentation:
            'Use ALTER TABLE … MODIFY COLUMN … COMMENT to document bias-sensitive columns. Consider a separate data_classification table.',
          aiReproducibility:
            'Add created_at DATETIME DEFAULT CURRENT_TIMESTAMP and updated_at ON UPDATE CURRENT_TIMESTAMP. These enable the dataset version reconstruction required by EU AI Act Article 12.',
        },
      };

    // ------------------------------------------------------------------ MS
    case 'mssql':
      return {
        label: 'SQL Server',
        engine: 'SQL Server',
        remediation: {
          typeInconsistency:
            'Standardise column types using ALTER TABLE … ALTER COLUMN to enforce canonical types. Use SQL Server user-defined data types (CREATE TYPE) for enterprise-wide consistency. Document in a shared data dictionary.',
          csvImportPattern:
            'Replace ad-hoc CSV imports with BULK INSERT, OPENROWSET(BULK …), or SSIS packages. Stage data into a dedicated import schema before promoting to production tables.',
          islandTables:
            'Review island tables for missing foreign-key relationships. Use ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY to link them to their parent entities, or consolidate orphan lookup data into a reference schema.',
          wideTables:
            'Decompose wide tables into normalised child tables joined by the original primary key. Use SELECT INTO to migrate data. Consider SQL Server partitioned views or table partitioning for large datasets.',
          namingViolations:
            'Adopt a consistent naming convention (e.g. snake_case or PascalCase) and enforce it with a DDL linter or SQL Server Policy-Based Management. Rename deviating columns with sp_rename.',
          missingPk:
            'Add primary key constraints using ALTER TABLE … ADD CONSTRAINT … PRIMARY KEY (column). For tables without a natural key, add an INT IDENTITY or UNIQUEIDENTIFIER column as a surrogate key.',
          undocumented:
            'Add documentation using sp_addextendedproperty @name=N\'MS_Description\', @value=N\'description\' for every table and key column.',
          highNullRate:
            'Investigate high-null columns for missing data pipelines or incorrect NULL defaults. Use ALTER TABLE … ADD DEFAULT … FOR column and backfill with UPDATE … WHERE column IS NULL. Update statistics after bulk changes.',
          noIndexes:
            'Add indexes using CREATE INDEX on columns used in WHERE, JOIN, and ORDER BY clauses. At minimum ensure clustered indexes exist. Use the Missing Indexes DMVs (sys.dm_db_missing_index_*) to identify candidates.',
          missingAudit:
            'Add created_at DATETIME2 DEFAULT GETDATE() and updated_at DATETIME2 DEFAULT GETDATE() columns. Use triggers or temporal tables (WITH SYSTEM_VERSIONING) for automatic updated_at tracking.',
          noConstraints:
            'Add appropriate constraints: ALTER TABLE … ADD PRIMARY KEY, FOREIGN KEY, CHECK, UNIQUE. Use sys.objects and sys.check_constraints to audit constraint coverage across all tables.',
          aiLineageCompleteness:
            'Use SQL Server\'s built-in Extended Properties to document data sources for ML input tables. Consider SSIS lineage tracking. MSSQL 2016+ temporal tables support point-in-time queries required by EU AI Act Article 12.',
          aiBiasAttributeDocumentation:
            'Use sp_addextendedproperty to add \'sensitivity_classification\' metadata. SQL Server 2019+ supports built-in data classification (sys.sensitivity_classifications). Required for EU AI Act Art 10 representativeness.',
          aiReproducibility:
            'Enable system-versioned temporal tables (ALTER TABLE … ADD PERIOD FOR SYSTEM_TIME). This provides built-in point-in-time query support — the strongest architectural pattern for EU AI Act Article 12 compliance.',
        },
      };

    // ------------------------------------------------------------------ CSV
    case 'csv':
      return {
        label: 'CSV / Excel',
        engine: 'CSV',
        remediation: {
          typeInconsistency:
            'Standardise column formats across all CSV files. Create a shared data dictionary defining canonical formats (e.g. dates as YYYY-MM-DD, booleans as TRUE/FALSE). Use data validation tools or templates to enforce consistency.',
          csvImportPattern:
            'Establish a standard CSV template with fixed column headers and validated data types. Use a data validation step (e.g. a linting script or import tool) before loading data into downstream systems.',
          islandTables:
            'Review standalone CSV files for missing relationships. Consider adding a shared key column (e.g. entity_id) across related files to enable joins and cross-referencing during analysis.',
          wideTables:
            'Split wide CSV files into multiple related files with a shared key column. Group columns logically (e.g. contact info, financial data, metadata) to improve manageability and reduce data entry errors.',
          namingViolations:
            'Adopt a consistent column naming convention across all CSV files (e.g. snake_case). Document the convention in a README or data dictionary and update existing column headers to match.',
          missingPk:
            'Consider adding an explicit ID or key column to each CSV file to uniquely identify rows. This enables data lineage tracking, deduplication, and reliable joins between related files.',
          undocumented:
            'Create a data dictionary document describing each CSV file\'s purpose, column definitions, and expected value ranges. Store it alongside the CSV files for easy reference.',
          highNullRate:
            'Review columns with high blank/null rates. Consider whether the column is truly optional, whether data collection processes need improvement, or whether the column should be removed from the template.',
          noIndexes:
            'Indexing does not apply to CSV files. Consider migrating frequently queried data to a database to gain performance benefits from indexing.',
          missingAudit:
            'Add last_updated_date and updated_by columns to your CSV template to track when and by whom each row was last modified. Consider adding a version or revision column for change tracking.',
          noConstraints:
            'CSV files do not support native constraints. Consider adding data validation rules in your import process, or migrate to a database for enforced integrity. Use a validation script to check referential integrity between related CSV files.',
          aiLineageCompleteness:
            'Add \'data_source\', \'extraction_date\', and \'pipeline_version\' columns to CSV files used as ML inputs. Australia\'s Privacy Act reforms (Dec 2026) require ADM transparency — lineage metadata supports this.',
          aiBiasAttributeDocumentation:
            'Create a companion data dictionary CSV that classifies each column\'s sensitivity level (PII, bias-relevant, public). Australia\'s Dec 2026 ADM transparency requirements mandate disclosure of personal information types used in automated decisions.',
          aiReproducibility:
            'Include extraction timestamps in file names (data_YYYYMMDD_HHMMSS.csv) and add a \'snapshot_date\' column. Store historical versions rather than overwriting. Australia\'s Dec 2026 ADM transparency requirements will need this for audit trails.',
        },
      };

    // ------------------------------------------------------------------ DEFAULT
    default:
      return {
        label: 'Database',
        engine: 'database',
        remediation: {
          typeInconsistency:
            'Standardise the column type across all tables. Create a shared data dictionary defining canonical types for common columns.',
          csvImportPattern:
            'Replace ad-hoc CSV imports with proper ETL pipelines. Stage imported data in a landing schema before promoting to production tables.',
          islandTables:
            'Review island tables for missing FK relationships. Add foreign-key constraints to link orphan tables to their parent entities, or consolidate them into a reference schema.',
          wideTables:
            'Decompose wide tables into normalised entities. Group related columns into separate tables joined by the original primary key.',
          namingViolations:
            'Adopt a consistent naming convention across all schemas and enforce it through DDL review or linting tools.',
          missingPk:
            'Add primary key constraints to all tables to ensure row uniqueness and support efficient joins.',
          undocumented:
            'Add COMMENT ON TABLE statements to describe the purpose and contents of each table.',
          highNullRate:
            'Investigate high-null columns for missing data pipelines, incorrect NULL defaults, or unused columns that should be removed.',
          noIndexes:
            'Add appropriate indexes based on query patterns. At minimum, ensure primary key indexes exist and consider indexes on frequently filtered or joined columns.',
          missingAudit:
            'Add created_at/updated_at timestamp columns and optionally created_by/updated_by user-tracking columns to all tables to support audit and compliance requirements.',
          noConstraints:
            'Add appropriate constraints (primary keys, foreign keys, check constraints, unique constraints) to enforce data integrity at the database level.',
          aiLineageCompleteness:
            'Document the full data lineage from source to ML input. Add source tracking metadata to all tables feeding AI/ML pipelines.',
          aiBiasAttributeDocumentation:
            'Document all columns containing demographic or proxy demographic data. Classify as bias-relevant and implement controlled vocabularies.',
          aiReproducibility:
            'Add temporal columns to all tables. Implement point-in-time query patterns (temporal tables or SCD Type 2) to support AI model audit and reproducibility.',
        },
      };
  }
}
