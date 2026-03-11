import type { SchemaData } from '../adapters/types';
import type { ScannerConfig, Finding, Strength } from './types';

/**
 * Compute positive observations ("strengths") from what checks DIDN'T find,
 * plus metric-based partial-pass messages when most objects are healthy.
 */
export function computeStrengths(
  schema: SchemaData,
  _config: ScannerConfig,
  findings: Finding[],
): Strength[] {
  const strengths: Strength[] = [];
  const byCheck = new Map<string, Finding[]>();
  for (const f of findings) {
    const list = byCheck.get(f.checkId) ?? [];
    list.push(f);
    byCheck.set(f.checkId, list);
  }

  const totalTables = schema.tables.filter((t) => t.type === 'table').length;
  const totalColumns = schema.columns.length;
  const isCsv = schema.databaseType === 'csv';

  // Helper: check produced 0 findings
  const clean = (checkId: string) => !byCheck.has(checkId);

  // Helper: check has findings but ratio is low (most objects pass)
  const mostlyClean = (checkId: string, threshold = 0.15) => {
    const f = byCheck.get(checkId);
    if (!f || f.length === 0) return false; // fully clean handled elsewhere
    return f.every((x) => x.ratio <= threshold);
  };

  // ---- P1: Semantic Identity ----
  if (clean('p1-semantic-identity')) {
    strengths.push({
      checkId: 'p1-semantic-identity',
      property: 1,
      title: 'Consistent entity naming',
      description: 'No duplicate or near-duplicate entity names detected across schemas.',
      detail: `All ${totalTables} tables have unique, distinguishable names.`,
    });
  } else if (mostlyClean('p1-semantic-identity')) {
    const f = byCheck.get('p1-semantic-identity')!;
    const affected = f.reduce((s, x) => s + x.affectedObjects, 0);
    strengths.push({
      checkId: 'p1-semantic-identity',
      property: 1,
      title: 'Mostly unique entity names',
      description: 'The vast majority of tables have unique, distinguishable names.',
      detail: `${totalTables - affected} of ${totalTables} tables have unique names.`,
      metric: `${Math.round(((totalTables - affected) / totalTables) * 100)}% unique`,
    });
  }

  // ---- P2: Reference Data ----
  if (clean('p2-type-inconsistency')) {
    strengths.push({
      checkId: 'p2-type-inconsistency',
      property: 2,
      title: 'Consistent data types',
      description: 'Same-named columns use identical data types across all tables.',
      detail: 'No type mismatches detected between columns sharing the same name.',
    });
  } else if (mostlyClean('p2-type-inconsistency')) {
    const f = byCheck.get('p2-type-inconsistency')!;
    const affected = f.reduce((s, x) => s + x.affectedObjects, 0);
    strengths.push({
      checkId: 'p2-type-inconsistency',
      property: 2,
      title: 'Mostly consistent data types',
      description: 'The vast majority of same-named columns share identical data types.',
      detail: `${totalColumns - affected} of ${totalColumns} columns are type-consistent.`,
      metric: `${Math.round(((totalColumns - affected) / totalColumns) * 100)}% consistent`,
    });
  }

  if (clean('p2-uncontrolled-vocab')) {
    strengths.push({
      checkId: 'p2-uncontrolled-vocab',
      property: 2,
      title: 'Controlled vocabulary',
      description: 'No uncontrolled "variant" column naming patterns detected.',
      detail: 'Column names follow consistent terminology without ad-hoc variants.',
    });
  }

  // ---- P3: Domain Ownership ----
  if (clean('p3-domain-overlap')) {
    strengths.push({
      checkId: 'p3-domain-overlap',
      property: 3,
      title: 'Clear domain boundaries',
      description: 'No overlapping entity names between schemas — domains are well-separated.',
      detail: 'Each schema contains unique entities without cross-domain duplication.',
    });
  }

  if (clean('p3-cross-schema-coupling')) {
    strengths.push({
      checkId: 'p3-cross-schema-coupling',
      property: 3,
      title: 'Well-isolated schemas',
      description: 'No excessive cross-schema foreign key coupling detected.',
      detail: 'Schemas maintain healthy boundaries with limited cross-references.',
    });
  }

  // ---- P4: Anti-Corruption ----
  if (!isCsv && clean('p4-csv-import-pattern')) {
    strengths.push({
      checkId: 'p4-csv-import-pattern',
      property: 4,
      title: 'Clean integration patterns',
      description: 'No tables show signs of raw CSV/flat-file dump patterns.',
      detail: 'Data appears to be properly transformed during ingestion.',
    });
  }

  if (clean('p4-island-tables')) {
    strengths.push({
      checkId: 'p4-island-tables',
      property: 4,
      title: 'All tables connected',
      description: 'Every table participates in at least one relationship.',
      detail: `All ${totalTables} tables are connected via foreign keys or naming conventions.`,
    });
  } else if (mostlyClean('p4-island-tables', 0.2)) {
    const f = byCheck.get('p4-island-tables')!;
    const affected = f.reduce((s, x) => s + x.affectedObjects, 0);
    const pct = Math.round(((totalTables - affected) / totalTables) * 100);
    strengths.push({
      checkId: 'p4-island-tables',
      property: 4,
      title: 'Most tables connected',
      description: 'The vast majority of tables participate in relationships.',
      detail: `${totalTables - affected} of ${totalTables} tables are connected.`,
      metric: `${pct}% connected`,
    });
  }

  if (clean('p4-wide-tables')) {
    strengths.push({
      checkId: 'p4-wide-tables',
      property: 4,
      title: 'Well-normalised tables',
      description: 'No excessively wide tables detected — schema is properly normalised.',
      detail: 'All tables have a reasonable number of columns.',
    });
  }

  // ---- P5: Schema Governance ----
  if (clean('p5-naming-violations')) {
    strengths.push({
      checkId: 'p5-naming-violations',
      property: 5,
      title: 'Consistent naming convention',
      description: 'All tables and columns follow the configured naming convention.',
      detail: 'Naming is uniform across the entire schema.',
    });
  } else if (mostlyClean('p5-naming-violations')) {
    const f = byCheck.get('p5-naming-violations')!;
    const affected = f.reduce((s, x) => s + x.affectedObjects, 0);
    const total = f[0]?.totalObjects ?? totalColumns;
    strengths.push({
      checkId: 'p5-naming-violations',
      property: 5,
      title: 'Mostly consistent naming',
      description: 'The vast majority of objects follow the naming convention.',
      detail: `${total - affected} of ${total} objects follow the convention.`,
      metric: `${Math.round(((total - affected) / total) * 100)}% compliant`,
    });
  }

  if (clean('p5-missing-pk')) {
    strengths.push({
      checkId: 'p5-missing-pk',
      property: 5,
      title: 'All tables have primary keys',
      description: 'Every table has a defined primary key constraint.',
      detail: `All ${totalTables} tables are properly keyed.`,
    });
  } else if (mostlyClean('p5-missing-pk', 0.2)) {
    const f = byCheck.get('p5-missing-pk')!;
    const affected = f.reduce((s, x) => s + x.affectedObjects, 0);
    strengths.push({
      checkId: 'p5-missing-pk',
      property: 5,
      title: 'Most tables have primary keys',
      description: 'The vast majority of tables have defined primary key constraints.',
      detail: `${totalTables - affected} of ${totalTables} tables have primary keys.`,
      metric: `${Math.round(((totalTables - affected) / totalTables) * 100)}% keyed`,
    });
  }

  if (clean('p5-undocumented') && !isCsv) {
    strengths.push({
      checkId: 'p5-undocumented',
      property: 5,
      title: 'Schema documentation present',
      description: 'Tables and columns have comments/descriptions in the database catalogue.',
      detail: 'Documentation is present across the schema.',
    });
  }

  // ---- P6: Quality Measurement ----
  if (clean('p6-high-null-rate')) {
    strengths.push({
      checkId: 'p6-high-null-rate',
      property: 6,
      title: 'Low null rates',
      description: 'No columns exceed the null-rate threshold — data completeness is strong.',
      detail: 'All columns maintain acceptable null rates.',
    });
  } else if (mostlyClean('p6-high-null-rate')) {
    const f = byCheck.get('p6-high-null-rate')!;
    const affected = f.reduce((s, x) => s + x.affectedObjects, 0);
    strengths.push({
      checkId: 'p6-high-null-rate',
      property: 6,
      title: 'Mostly complete data',
      description: 'The vast majority of columns maintain acceptable null rates.',
      detail: `${totalColumns - affected} of ${totalColumns} columns have low null rates.`,
      metric: `${Math.round(((totalColumns - affected) / totalColumns) * 100)}% complete`,
    });
  }

  if (!isCsv && clean('p6-no-indexes')) {
    strengths.push({
      checkId: 'p6-no-indexes',
      property: 6,
      title: 'Proper indexing',
      description: 'All tables have at least one index for query performance.',
      detail: `All ${totalTables} tables are indexed.`,
    });
  }

  // ---- P7: Regulatory Traceability ----
  if (!isCsv && clean('p7-missing-audit')) {
    strengths.push({
      checkId: 'p7-missing-audit',
      property: 7,
      title: 'Audit columns present',
      description: 'Tables include audit/timestamp columns for change tracking.',
      detail: 'Created/updated timestamps detected across the schema.',
    });
  } else if (!isCsv && mostlyClean('p7-missing-audit')) {
    const f = byCheck.get('p7-missing-audit')!;
    const affected = f.reduce((s, x) => s + x.affectedObjects, 0);
    strengths.push({
      checkId: 'p7-missing-audit',
      property: 7,
      title: 'Most tables have audit columns',
      description: 'The majority of tables include audit/timestamp columns.',
      detail: `${totalTables - affected} of ${totalTables} tables have audit columns.`,
      metric: `${Math.round(((totalTables - affected) / totalTables) * 100)}% audited`,
    });
  }

  if (!isCsv && clean('p7-no-constraints')) {
    strengths.push({
      checkId: 'p7-no-constraints',
      property: 7,
      title: 'Foreign key constraints defined',
      description: 'Tables use foreign key constraints to enforce referential integrity.',
      detail: 'Relationships are enforced at the database level.',
    });
  }

  // ---- P8: AI Readiness ----
  if (clean('p8-ai-lineage-completeness')) {
    strengths.push({
      checkId: 'p8-ai-lineage-completeness',
      property: 8,
      title: 'AI/ML data lineage tracked',
      description: 'AI/ML data lineage is tracked with source metadata — supports EU AI Act Article 12 record-keeping.',
      detail: 'ML-adjacent tables include audit columns and source lineage indicators.',
    });
  }

  if (clean('p8-ai-bias-attribute-documentation')) {
    strengths.push({
      checkId: 'p8-ai-bias-attribute-documentation',
      property: 8,
      title: 'Bias-sensitive attributes documented',
      description: 'Bias-sensitive attributes are documented and classified — supports EU AI Act Article 10 representativeness.',
      detail: 'Demographic and proxy demographic columns have documentation and value constraints.',
    });
  }

  if (clean('p8-ai-reproducibility')) {
    strengths.push({
      checkId: 'p8-ai-reproducibility',
      property: 8,
      title: 'Reproducible AI/ML pipelines',
      description: 'Data architecture supports reproducible AI/ML training pipelines — supports EU AI Act Article 12 audit requirements.',
      detail: 'Tables include temporal columns, versioning, and deterministic ordering for point-in-time reconstruction.',
    });
  }

  return strengths;
}
