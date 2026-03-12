import type { SchemaData } from '../adapters/types';
import type {
  CostCategory,
  Evidence,
  Finding,
  ScannerCheck,
  ScannerConfig,
} from './types';

// =============================================================================
// P3-DOMAIN-OVERLAP
// Find table names that appear in 2+ different schemas. Count distinct shared
// names.
// =============================================================================

const DOMAIN_OVERLAP_COST_WEIGHTS: Record<CostCategory, number> = {
  firefighting: 0.3,
  dataQuality: 0.1,
  integration: 0.4,
  productivity: 0.2,
  regulatory: 0,
  aiMlRiskExposure: 0,
};

const DOMAIN_OVERLAP_ACTIVE_CATEGORIES: CostCategory[] = [
  'firefighting',
  'dataQuality',
  'integration',
  'productivity',
];

export const p3DomainOverlap: ScannerCheck = {
  id: 'P3-DOMAIN-OVERLAP',
  property: 3,
  name: 'Domain Overlap',
  description:
    'Detect table names that appear in multiple schemas, indicating overlapping domain boundaries.',

  execute(schema: SchemaData, _config: ScannerConfig): Finding[] {
    // Group tables by name (lowercased) → set of schemas
    const tableSchemas = new Map<string, Set<string>>();
    for (const tbl of schema.tables) {
      const key = tbl.name.toLowerCase();
      if (!tableSchemas.has(key)) {
        tableSchemas.set(key, new Set());
      }
      tableSchemas.get(key)!.add(tbl.schema);
    }

    // Find table names appearing in 2+ schemas
    const sharedTables: { name: string; schemas: string[] }[] = [];
    for (const [name, schemas] of tableSchemas) {
      if (schemas.size >= 2) {
        sharedTables.push({ name, schemas: Array.from(schemas).sort() });
      }
    }

    if (sharedTables.length === 0) {
      return [];
    }

    const affectedCount = sharedTables.length;
    const totalDistinctNames = tableSchemas.size;

    // Severity: 10+ → critical, 5+ → major, else minor
    let sev: 'critical' | 'major' | 'minor';
    if (affectedCount >= 10) {
      sev = 'critical';
    } else if (affectedCount >= 5) {
      sev = 'major';
    } else {
      sev = 'minor';
    }

    const evidence: Evidence[] = sharedTables.map((st) => ({
      schema: st.schemas.join(', '),
      table: st.name,
      detail: `Table "${st.name}" exists in ${st.schemas.length} schemas: [${st.schemas.join(', ')}]`,
      metadata: { schemas: st.schemas },
    }));

    const ratio = totalDistinctNames > 0 ? affectedCount / totalDistinctNames : 0;

    return [
      {
        checkId: 'P3-DOMAIN-OVERLAP',
        property: 3,
        severity: sev,
        rawScore: 0,
        title: `${affectedCount} table names duplicated across schemas`,
        description:
          `${affectedCount} table names appear in 2 or more schemas, indicating overlapping domain boundaries. ` +
          `Duplicated tables increase maintenance burden and create ambiguity about the authoritative source.`,
        evidence,
        affectedObjects: affectedCount,
        totalObjects: totalDistinctNames,
        ratio,
        remediation:
          'Define clear domain boundaries with each table owned by a single schema. ' +
          'Use cross-schema views or FKs instead of duplicating tables.',
        costCategories: DOMAIN_OVERLAP_ACTIVE_CATEGORIES,
        costWeights: { ...DOMAIN_OVERLAP_COST_WEIGHTS },
        evidenceInput: {
          asset: {
            type: 'schema',
            key: sharedTables[0].schemas[0],
            name: sharedTables[0].schemas[0],
            schema: sharedTables[0].schemas[0],
          },
          metric: {
            name: 'domain_overlap_tables',
            observed: affectedCount,
            unit: 'table names',
            displayText: `${affectedCount} of ${totalDistinctNames} table names are duplicated across schemas`,
          },
          samples: sharedTables.slice(0, 10).map(st => ({
            label: `In ${st.schemas.length} schemas: [${st.schemas.join(', ')}]`,
            value: st.name,
            context: { schemas: st.schemas.join(', ') },
          })),
          explanation: {
            whatWasFound: `${affectedCount} table names appear in 2 or more schemas, indicating overlapping domain boundaries`,
            whyItMatters: 'Duplicated table names across schemas create ambiguity about the authoritative data source and increase maintenance burden',
            howDetected: 'Grouped all table names (case-insensitive) and identified names appearing in 2+ schemas',
          },
        },
      },
    ];
  },
};

// =============================================================================
// P3-CROSS-SCHEMA-COUPLING
// Count FKs where source schema != referenced schema.
// ratio = cross-schema FKs / total FKs. If no FKs, return empty.
// =============================================================================

const CROSS_SCHEMA_COST_WEIGHTS: Record<CostCategory, number> = {
  firefighting: 0.3,
  dataQuality: 0,
  integration: 0.5,
  productivity: 0.2,
  regulatory: 0,
  aiMlRiskExposure: 0,
};

const CROSS_SCHEMA_ACTIVE_CATEGORIES: CostCategory[] = [
  'firefighting',
  'integration',
  'productivity',
];

export const p3CrossSchemaCoupling: ScannerCheck = {
  id: 'P3-CROSS-SCHEMA-COUPLING',
  property: 3,
  name: 'Cross-Schema Coupling',
  description:
    'Measure the proportion of foreign keys that cross schema boundaries, indicating tight coupling between domains.',

  execute(schema: SchemaData, _config: ScannerConfig): Finding[] {
    const totalFKs = schema.foreignKeys.length;
    if (totalFKs === 0) {
      return [];
    }

    const crossSchemaFKs = schema.foreignKeys.filter(
      (fk) => fk.schema.toLowerCase() !== fk.referencedSchema.toLowerCase(),
    );

    const crossCount = crossSchemaFKs.length;
    if (crossCount === 0) {
      return [];
    }

    const ratio = totalFKs > 0 ? crossCount / totalFKs : 0;

    // Severity: ratio >= 0.5 → critical, >= 0.25 → major, else minor
    let sev: 'critical' | 'major' | 'minor';
    if (ratio >= 0.5) {
      sev = 'critical';
    } else if (ratio >= 0.25) {
      sev = 'major';
    } else {
      sev = 'minor';
    }

    const evidence: Evidence[] = crossSchemaFKs.map((fk) => ({
      schema: fk.schema,
      table: fk.table,
      column: fk.column,
      detail:
        `FK "${fk.constraintName}" references ${fk.referencedSchema}.${fk.referencedTable}.${fk.referencedColumn} ` +
        `(cross-schema: ${fk.schema} → ${fk.referencedSchema})`,
      metadata: {
        constraintName: fk.constraintName,
        referencedSchema: fk.referencedSchema,
        referencedTable: fk.referencedTable,
        referencedColumn: fk.referencedColumn,
      },
    }));

    return [
      {
        checkId: 'P3-CROSS-SCHEMA-COUPLING',
        property: 3,
        severity: sev,
        rawScore: 0,
        title: `${crossCount} of ${totalFKs} foreign keys cross schema boundaries (${(ratio * 100).toFixed(1)}%)`,
        description:
          `${crossCount} foreign keys reference tables in a different schema (${(ratio * 100).toFixed(1)}% of all FKs). ` +
          `High cross-schema coupling makes independent schema evolution difficult and increases deployment risk.`,
        evidence,
        affectedObjects: crossCount,
        totalObjects: totalFKs,
        ratio,
        remediation:
          'Reduce cross-schema dependencies by introducing shared reference schemas or event-based integration. ' +
          'Where cross-schema FKs are necessary, document them in a dependency map.',
        costCategories: CROSS_SCHEMA_ACTIVE_CATEGORIES,
        costWeights: { ...CROSS_SCHEMA_COST_WEIGHTS },
        evidenceInput: {
          asset: {
            type: 'table',
            key: `${crossSchemaFKs[0].schema}.${crossSchemaFKs[0].table}`,
            name: crossSchemaFKs[0].table,
            schema: crossSchemaFKs[0].schema,
            table: crossSchemaFKs[0].table,
          },
          metric: {
            name: 'cross_schema_fk_ratio',
            observed: ratio,
            unit: 'ratio',
            displayText: `${crossCount} of ${totalFKs} foreign keys cross schema boundaries (${(ratio * 100).toFixed(1)}%)`,
          },
          threshold: {
            value: 0.25,
            operator: 'gt',
            displayText: 'Cross-schema FK ratio above 25% indicates tight coupling',
          },
          samples: crossSchemaFKs.slice(0, 10).map(fk => ({
            label: `${fk.schema} → ${fk.referencedSchema}`,
            value: `${fk.schema}.${fk.table}.${fk.column} → ${fk.referencedSchema}.${fk.referencedTable}.${fk.referencedColumn}`,
            context: { constraintName: fk.constraintName },
          })),
          explanation: {
            whatWasFound: `${crossCount} of ${totalFKs} foreign keys (${(ratio * 100).toFixed(1)}%) reference tables in a different schema`,
            whyItMatters: 'High cross-schema coupling makes independent schema evolution difficult and increases deployment risk',
            howDetected: 'Compared source and referenced schema names on all foreign key constraints',
          },
        },
      },
    ];
  },
};
