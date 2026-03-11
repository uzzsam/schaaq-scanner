import type { SchemaData } from '../adapters/types';
import type { Finding, Evidence, ScannerCheck, ScannerConfig, CostCategory } from './types';
import { getDbContext } from './db-context';

// =============================================================================
// ML-adjacent table detection heuristics
// =============================================================================
const ML_TABLE_PATTERNS = [
  'feature', 'features', 'feature_store',
  'ml_', 'model_', 'training', 'prediction',
  'score', 'embedding', 'vector',
];

const ML_SCHEMA_NAMES = ['ml', 'ai', 'analytics', 'data_science', 'features'];

function isMlAdjacentTable(
  schema: string,
  tableName: string,
  columnCount: number,
): boolean {
  const lower = tableName.toLowerCase();
  if (ML_TABLE_PATTERNS.some((p) => lower.includes(p))) return true;
  if (columnCount > 50 && ML_SCHEMA_NAMES.includes(schema.toLowerCase())) return true;
  return false;
}

// =============================================================================
// Audit / lineage column patterns
// =============================================================================
const AUDIT_PATTERNS = [
  'created_at', 'create_date', 'created_date',
  'updated_at', 'update_date', 'modified_date',
  'loaded_at', 'ingested_at', 'last_modified',
];

const LINEAGE_PATTERNS = [
  'source', 'origin', 'source_table', 'source_system',
  'source_query', 'data_source', 'pipeline', 'etl_job',
];

function hasPattern(columnNames: string[], patterns: string[]): boolean {
  return columnNames.some((c) => {
    const lower = c.toLowerCase();
    return patterns.some((p) => lower.includes(p));
  });
}

// =============================================================================
// p8AiLineageCompleteness
// =============================================================================
export const p8AiLineageCompleteness: ScannerCheck = {
  id: 'p8-ai-lineage-completeness',
  property: 8,
  name: 'Data Lineage Completeness for AI/ML Inputs',
  description:
    'Checks whether ML-adjacent tables (feature stores, training data, model inputs) have audit columns and source lineage metadata. EU AI Act Article 12 requires automatic event recording across the AI system lifetime.',

  execute(schema: SchemaData, _config: ScannerConfig): Finding[] {
    const ctx = getDbContext(schema);
    const tables = schema.tables.filter((t) => t.type === 'table');
    if (tables.length === 0) return [];

    // Group columns by table
    const columnsByTable = new Map<string, string[]>();
    for (const col of schema.columns) {
      const key = `${col.schema}.${col.table}`;
      const list = columnsByTable.get(key) ?? [];
      list.push(col.name);
      columnsByTable.set(key, list);
    }

    // FK targets — tables that are referenced by foreign keys
    const fkSources = new Set<string>();
    for (const fk of schema.foreignKeys) {
      fkSources.add(`${fk.schema}.${fk.table}`);
    }

    // Identify ML-adjacent tables and assess lineage
    const mlTables: {
      schema: string;
      name: string;
      hasAudit: boolean;
      hasLineage: boolean;
      hasFk: boolean;
    }[] = [];

    for (const table of tables) {
      const key = `${table.schema}.${table.name}`;
      const colNames = columnsByTable.get(key) ?? [];
      if (!isMlAdjacentTable(table.schema, table.name, colNames.length)) continue;

      mlTables.push({
        schema: table.schema,
        name: table.name,
        hasAudit: hasPattern(colNames, AUDIT_PATTERNS),
        hasLineage: hasPattern(colNames, LINEAGE_PATTERNS),
        hasFk: fkSources.has(key),
      });
    }

    // If no ML-adjacent tables found, that itself is a finding (medium severity)
    if (mlTables.length === 0) {
      const costWeights: Record<CostCategory, number> = {
        firefighting: 0,
        dataQuality: 0.1,
        integration: 0.1,
        productivity: 0,
        regulatory: 0.3,
        aiMlRiskExposure: 0.5,
      };
      const costCategories: CostCategory[] = (
        Object.entries(costWeights) as [CostCategory, number][]
      ).filter(([, w]) => w > 0).map(([k]) => k);

      return [{
        checkId: 'p8-ai-lineage-completeness',
        property: 8,
        severity: 'minor',
        rawScore: 0,
        title: 'No ML/AI data infrastructure detected',
        description:
          'No tables matching ML/AI patterns (feature stores, training data, model inputs) were found. Absence of AI infrastructure means no data governance for AI — which is itself a risk signal as AI adoption grows.',
        evidence: [{
          schema: '*',
          table: '*',
          detail: `Scanned ${tables.length} tables — none match ML-adjacent patterns (feature, model, training, embedding, vector, prediction)`,
        }],
        affectedObjects: tables.length,
        totalObjects: tables.length,
        ratio: 1,
        remediation: ctx.remediation.aiLineageCompleteness,
        costCategories,
        costWeights,
      }];
    }

    // Assess ML tables
    const noAuditNoFk = mlTables.filter((t) => !t.hasAudit && !t.hasFk);
    const auditNoLineage = mlTables.filter((t) => t.hasAudit && !t.hasLineage && !noAuditNoFk.includes(t));

    const affected = noAuditNoFk.length + auditNoLineage.length;
    if (affected === 0) return []; // all ML tables have audit + lineage

    const totalObjects = mlTables.length;
    const ratio = totalObjects > 0 ? affected / totalObjects : 0;

    let severity: Finding['severity'];
    if (noAuditNoFk.length > 0) severity = 'critical';
    else if (auditNoLineage.length > 0) severity = 'major';
    else severity = 'minor';

    const costWeights: Record<CostCategory, number> = {
      firefighting: 0.1,
      dataQuality: 0.1,
      integration: 0.1,
      productivity: 0,
      regulatory: 0.3,
      aiMlRiskExposure: 0.4,
    };
    const costCategories: CostCategory[] = (
      Object.entries(costWeights) as [CostCategory, number][]
    ).filter(([, w]) => w > 0).map(([k]) => k);

    const evidence: Evidence[] = [];
    for (const t of noAuditNoFk) {
      evidence.push({
        schema: t.schema,
        table: t.name,
        detail: `ML-adjacent table "${t.schema}"."${t.name}" has NO audit columns AND no FK relationships — no lineage traceability`,
      });
    }
    for (const t of auditNoLineage) {
      evidence.push({
        schema: t.schema,
        table: t.name,
        detail: `ML-adjacent table "${t.schema}"."${t.name}" has audit columns but no source lineage metadata`,
      });
    }

    return [{
      checkId: 'p8-ai-lineage-completeness',
      property: 8,
      severity,
      rawScore: 0,
      title: 'ML/AI tables missing data lineage',
      description: `${affected} of ${totalObjects} ML-adjacent tables (${(ratio * 100).toFixed(1)}%) lack complete data lineage. EU AI Act Article 12 requires automatic event recording across the AI system lifetime.`,
      evidence,
      affectedObjects: affected,
      totalObjects,
      ratio,
      remediation: ctx.remediation.aiLineageCompleteness,
      costCategories,
      costWeights,
    }];
  },
};

// =============================================================================
// Bias-sensitive attribute detection
// =============================================================================
const BIAS_DIRECT_PATTERNS = [
  'gender', 'sex', 'race', 'ethnicity', 'age', 'dob', 'date_of_birth',
  'nationality', 'religion', 'disability', 'marital_status',
  'postcode', 'zipcode', 'suburb', 'income', 'salary',
];

const BIAS_PROXY_PATTERNS = [
  'school', 'university', 'employer', 'neighbourhood',
];

function isBiasRelevant(columnName: string): boolean {
  const lower = columnName.toLowerCase();
  return (
    BIAS_DIRECT_PATTERNS.some((p) => lower === p || lower.includes(p)) ||
    BIAS_PROXY_PATTERNS.some((p) => lower === p || lower.includes(p))
  );
}

// =============================================================================
// p8AiBiasAttributeDocumentation
// =============================================================================
export const p8AiBiasAttributeDocumentation: ScannerCheck = {
  id: 'p8-ai-bias-attribute-documentation',
  property: 8,
  name: 'Bias-Relevant Attribute Documentation',
  description:
    'Checks whether columns containing demographic or proxy demographic data are documented and value-controlled. EU AI Act Article 10 requires training data to be "sufficiently representative".',

  execute(schema: SchemaData, _config: ScannerConfig): Finding[] {
    const ctx = getDbContext(schema);

    // Build a set of documented columns (from comments)
    const documentedColumns = new Set<string>();
    if (schema.comments) {
      for (const c of schema.comments) {
        if (c.objectType === 'column' && c.columnName) {
          documentedColumns.add(`${c.schema}.${c.objectName}.${c.columnName}`);
        }
      }
    }

    // Build set of columns with CHECK or ENUM constraints
    const constrainedColumns = new Set<string>();
    for (const c of schema.constraints) {
      if (c.type === 'check') {
        for (const col of c.columns) {
          constrainedColumns.add(`${c.schema}.${c.table}.${col}`);
        }
      }
    }

    // Find bias-relevant columns
    const biasColumns: {
      schema: string;
      table: string;
      column: string;
      isDocumented: boolean;
      isConstrained: boolean;
      isNullable: boolean;
    }[] = [];

    for (const col of schema.columns) {
      if (!isBiasRelevant(col.name)) continue;
      const key = `${col.schema}.${col.table}.${col.name}`;
      biasColumns.push({
        schema: col.schema,
        table: col.table,
        column: col.name,
        isDocumented: documentedColumns.has(key) || (col.comment !== null && col.comment !== ''),
        isConstrained: constrainedColumns.has(key),
        isNullable: col.isNullable,
      });
    }

    if (biasColumns.length === 0) return []; // no bias-relevant columns — pass

    const undocumented = biasColumns.filter((c) => !c.isDocumented);
    const documentedButUncontrolled = biasColumns.filter((c) => c.isDocumented && !c.isConstrained);

    const totalObjects = biasColumns.length;

    // Severity based on undocumented count
    let severity: Finding['severity'];
    let affected: number;
    let title: string;
    let description: string;

    if (undocumented.length >= 5) {
      severity = 'critical';
      affected = undocumented.length;
      title = 'Multiple undocumented bias-relevant attributes';
      description = `${undocumented.length} bias-sensitive columns lack documentation. SafeRent was fined $2.3M for systemic discrimination from undocumented bias features. EU AI Act Article 10 requires bias examination of training datasets.`;
    } else if (undocumented.length >= 2) {
      severity = 'major';
      affected = undocumented.length;
      title = 'Undocumented bias-relevant attributes';
      description = `${undocumented.length} bias-sensitive columns lack documentation. iTutorGroup paid $365K after a single undocumented age attribute triggered EEOC action. EU AI Act Article 10 requires bias examination.`;
    } else if (undocumented.length >= 1) {
      severity = 'minor';
      affected = undocumented.length;
      title = 'Undocumented bias-relevant attribute';
      description = `${undocumented.length} bias-sensitive column lacks documentation. EU AI Act Article 10 requires bias examination of training datasets.`;
    } else if (documentedButUncontrolled.length > 0) {
      severity = 'minor';
      affected = documentedButUncontrolled.length;
      title = 'Bias-relevant attributes documented but uncontrolled';
      description = `${documentedButUncontrolled.length} bias-sensitive columns are documented but lack value constraints (CHECK or ENUM). Uncontrolled values still carry bias risk.`;
    } else {
      return []; // all documented with constraints — pass
    }

    const ratio = totalObjects > 0 ? affected / totalObjects : 0;

    const costWeights: Record<CostCategory, number> = {
      firefighting: 0.05,
      dataQuality: 0.15,
      integration: 0,
      productivity: 0,
      regulatory: 0.3,
      aiMlRiskExposure: 0.5,
    };
    const costCategories: CostCategory[] = (
      Object.entries(costWeights) as [CostCategory, number][]
    ).filter(([, w]) => w > 0).map(([k]) => k);

    const evidence: Evidence[] = [];
    for (const c of undocumented) {
      evidence.push({
        schema: c.schema,
        table: c.table,
        column: c.column,
        detail: `Bias-relevant column "${c.schema}"."${c.table}"."${c.column}" is undocumented${c.isNullable ? ' and nullable (inconsistent data = hidden bias risk)' : ''}`,
      });
    }
    for (const c of documentedButUncontrolled) {
      if (undocumented.length === 0) {
        evidence.push({
          schema: c.schema,
          table: c.table,
          column: c.column,
          detail: `Bias-relevant column "${c.schema}"."${c.table}"."${c.column}" is documented but lacks value constraints`,
        });
      }
    }

    return [{
      checkId: 'p8-ai-bias-attribute-documentation',
      property: 8,
      severity,
      rawScore: 0,
      title,
      description,
      evidence,
      affectedObjects: affected,
      totalObjects,
      ratio,
      remediation: ctx.remediation.aiBiasAttributeDocumentation,
      costCategories,
      costWeights,
    }];
  },
};

// =============================================================================
// Reproducibility signal detection
// =============================================================================
const TIMESTAMP_PATTERNS = [
  'created_at', 'updated_at', 'valid_from', 'valid_to',
  'effective_date', 'snapshot_date', 'loaded_at', 'ingested_at',
];

const VERSION_PATTERNS = [
  'version', 'snapshot', 'revision', 'v_', 'ver_',
];

const DETERMINISTIC_ORDER_TYPES = ['integer', 'bigint', 'smallint'];

// =============================================================================
// p8AiReproducibility
// =============================================================================
export const p8AiReproducibility: ScannerCheck = {
  id: 'p8-ai-reproducibility',
  property: 8,
  name: 'Training Data Pipeline Reproducibility',
  description:
    'Assesses whether the data architecture supports reproducible AI/ML training by checking for temporal query support, versioning, and deterministic ordering. EU AI Act Articles 11-12 require technical documentation and record-keeping.',

  execute(schema: SchemaData, _config: ScannerConfig): Finding[] {
    const ctx = getDbContext(schema);
    const tables = schema.tables.filter((t) => t.type === 'table');
    if (tables.length === 0) return [];

    // Group columns by table
    const columnsByTable = new Map<string, typeof schema.columns>();
    for (const col of schema.columns) {
      const key = `${col.schema}.${col.table}`;
      const list = columnsByTable.get(key) ?? [];
      list.push(col);
      columnsByTable.set(key, list);
    }

    // Build PK columns set
    const pkColumns = new Set<string>();
    for (const c of schema.constraints) {
      if (c.type === 'primary_key') {
        for (const col of c.columns) {
          pkColumns.add(`${c.schema}.${c.table}.${col}`);
        }
      }
    }

    let zeroScore = 0;
    let partialScore = 0;
    let fullScore = 0;
    const zeroScoreTables: { schema: string; name: string; detail: string }[] = [];

    for (const table of tables) {
      const key = `${table.schema}.${table.name}`;
      const cols = columnsByTable.get(key) ?? [];
      const colNames = cols.map((c) => c.name);

      let score = 0;

      // A) Temporal query support — timestamps
      if (hasPattern(colNames, TIMESTAMP_PATTERNS)) score += 1;

      // B) Versioning indicators
      if (hasPattern(colNames, VERSION_PATTERNS)) score += 1;

      // C) Deterministic ordering — auto-increment/sequence-backed PKs
      const hasDeterministicPk = cols.some((c) => {
        const isPk = pkColumns.has(`${c.schema}.${c.table}.${c.name}`);
        const isIntType = DETERMINISTIC_ORDER_TYPES.includes(c.normalizedType);
        return isPk && isIntType;
      });
      if (hasDeterministicPk) score += 1;

      if (score === 0) {
        zeroScore++;
        zeroScoreTables.push({
          schema: table.schema,
          name: table.name,
          detail: `Table "${table.schema}"."${table.name}" has no reproducibility support (no timestamps, versioning, or deterministic PK)`,
        });
      } else if (score < 3) {
        partialScore++;
      } else {
        fullScore++;
      }
    }

    const totalObjects = tables.length;
    if (zeroScore === 0) return []; // all tables have at least some reproducibility support

    const ratio = totalObjects > 0 ? zeroScore / totalObjects : 0;

    let severity: Finding['severity'];
    if (ratio > 0.6) severity = 'critical';
    else if (ratio > 0.4) severity = 'major';
    else if (ratio > 0.2) severity = 'minor';
    else severity = 'info';

    const costWeights: Record<CostCategory, number> = {
      firefighting: 0.1,
      dataQuality: 0.15,
      integration: 0.05,
      productivity: 0.1,
      regulatory: 0.2,
      aiMlRiskExposure: 0.4,
    };
    const costCategories: CostCategory[] = (
      Object.entries(costWeights) as [CostCategory, number][]
    ).filter(([, w]) => w > 0).map(([k]) => k);

    // Limit evidence to first 20 tables
    const evidence: Evidence[] = zeroScoreTables.slice(0, 20).map((t) => ({
      schema: t.schema,
      table: t.name,
      detail: t.detail,
    }));

    if (zeroScoreTables.length > 20) {
      evidence.push({
        schema: '*',
        table: '*',
        detail: `... and ${zeroScoreTables.length - 20} more tables with zero reproducibility support`,
      });
    }

    return [{
      checkId: 'p8-ai-reproducibility',
      property: 8,
      severity,
      rawScore: 0,
      title: 'Tables lack reproducibility support for AI/ML',
      description: `${zeroScore} of ${totalObjects} tables (${(ratio * 100).toFixed(1)}%) have no reproducibility infrastructure (timestamps, versioning, or deterministic ordering). EU AI Act Articles 11-12 require technical documentation and record-keeping across the AI system lifetime.`,
      evidence,
      affectedObjects: zeroScore,
      totalObjects,
      ratio,
      remediation: ctx.remediation.aiReproducibility,
      costCategories,
      costWeights,
    }];
  },
};
