// =============================================================================
// dbt Adapter — Parse dbt manifest.json (+ optional catalog.json) into
// PipelineMapping
// =============================================================================

import type { PipelineMapping, ColumnMapping, TransformType } from '../types/pipeline';

// ---------------------------------------------------------------------------
// dbt Manifest types (subset — we only parse what we need)
// ---------------------------------------------------------------------------

interface DbtNode {
  unique_id: string;
  name: string;
  resource_type: string;       // 'model' | 'source' | 'seed' | 'snapshot' | 'test'
  schema: string;
  database?: string;
  relation_name?: string;
  depends_on?: {
    nodes?: string[];
    macros?: string[];
  };
  columns?: Record<string, DbtColumn>;
  raw_sql?: string;            // v1.x
  raw_code?: string;           // v1.5+
  compiled_sql?: string;       // v1.x
  compiled_code?: string;      // v1.5+
  config?: {
    materialized?: string;
    [key: string]: unknown;
  };
}

interface DbtColumn {
  name: string;
  description?: string;
  data_type?: string;
  meta?: Record<string, unknown>;
}

interface DbtSource {
  unique_id: string;
  name: string;
  source_name: string;
  schema: string;
  database?: string;
  columns?: Record<string, DbtColumn>;
}

interface DbtManifest {
  metadata?: {
    project_name?: string;
    dbt_version?: string;
    [key: string]: unknown;
  };
  nodes?: Record<string, DbtNode>;
  sources?: Record<string, DbtSource>;
}

interface DbtCatalog {
  nodes?: Record<string, {
    columns?: Record<string, {
      name: string;
      type: string;
      index: number;
    }>;
  }>;
  sources?: Record<string, {
    columns?: Record<string, {
      name: string;
      type: string;
      index: number;
    }>;
  }>;
}

// ---------------------------------------------------------------------------
// SQL-based transform classification (regex, no AST)
// ---------------------------------------------------------------------------

const AGG_RE = [
  /\bSUM\s*\(/i, /\bCOUNT\s*\(/i, /\bAVG\s*\(/i,
  /\bMIN\s*\(/i, /\bMAX\s*\(/i, /\bGROUP\s+BY\b/i,
];

const COND_RE = [
  /\bCASE\b/i, /\bWHEN\b/i, /\bIF\s*\(/i, /\bCOALESCE\s*\(/i,
  /\bIIF\s*\(/i, /\bNULLIF\s*\(/i,
];

const CAST_RE = [
  /\bCAST\s*\(/i, /\bCONVERT\s*\(/i, /::[\w]+/,
  /\bTRY_CAST\s*\(/i, /\bSAFE_CAST\s*\(/i,
];

const DERIVE_RE = [
  /\bCONCAT\s*\(/i, /\|\|/, /\bSUBSTRING\s*\(/i, /\bTRIM\s*\(/i,
  /\bREPLACE\s*\(/i, /\bUPPER\s*\(/i, /\bLOWER\s*\(/i,
  /\bROUND\s*\(/i, /\bDATEDIFF\s*\(/i,
];

/**
 * Classify transform type from raw SQL or compiled SQL.
 */
export function classifyFromSql(sql: string | null | undefined): TransformType {
  if (!sql || sql.trim().length === 0) return 'unknown';
  const s = sql.trim();
  if (AGG_RE.some(r => r.test(s))) return 'aggregate';
  if (COND_RE.some(r => r.test(s))) return 'conditional';
  if (CAST_RE.some(r => r.test(s))) return 'cast';
  if (DERIVE_RE.some(r => r.test(s))) return 'derive';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a qualified table name from a dbt node.
 */
function qualifiedName(node: DbtNode | DbtSource): string {
  if ('relation_name' in node && node.relation_name) {
    return node.relation_name.replace(/"/g, '').replace(/`/g, '');
  }
  if ('source_name' in node) {
    return `${(node as DbtSource).source_name}.${node.name}`;
  }
  const schema = node.schema ?? 'public';
  return `${schema}.${node.name}`;
}

/**
 * Get column names for a node, optionally enriched from catalog.
 */
function getColumns(
  nodeId: string,
  node: DbtNode | DbtSource,
  catalog: DbtCatalog | null,
): { name: string; type: string | null }[] {
  // Prefer catalog columns (has actual DB types)
  const catNode = catalog?.nodes?.[nodeId] ?? catalog?.sources?.[nodeId];
  if (catNode?.columns) {
    return Object.values(catNode.columns)
      .sort((a, b) => a.index - b.index)
      .map(c => ({ name: c.name, type: c.type ?? null }));
  }
  // Fall back to manifest columns
  if (node.columns) {
    return Object.values(node.columns).map(c => ({
      name: c.name,
      type: c.data_type ?? null,
    }));
  }
  return [];
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/**
 * Parse a dbt manifest.json buffer (and optional catalog.json) into
 * a PipelineMapping.
 */
export function parseDbtManifest(
  manifestBuffer: Buffer,
  catalogBuffer?: Buffer,
): PipelineMapping {
  let manifest: DbtManifest;
  try {
    manifest = JSON.parse(manifestBuffer.toString('utf-8'));
  } catch {
    throw new Error('Invalid dbt manifest.json: not valid JSON');
  }

  if (!manifest.nodes && !manifest.sources) {
    throw new Error('Invalid dbt manifest.json: no nodes or sources found');
  }

  let catalog: DbtCatalog | null = null;
  if (catalogBuffer) {
    try {
      catalog = JSON.parse(catalogBuffer.toString('utf-8'));
    } catch {
      // Catalog is optional, just ignore if unparseable
    }
  }

  const nodes = manifest.nodes ?? {};
  const sources = manifest.sources ?? {};
  const allMappings: ColumnMapping[] = [];

  // Build a lookup for all node/source IDs to their data
  const nodeMap = new Map<string, DbtNode | DbtSource>();
  for (const [id, node] of Object.entries(nodes)) {
    nodeMap.set(id, node);
  }
  for (const [id, src] of Object.entries(sources)) {
    nodeMap.set(id, src);
  }

  // Process model nodes — trace columns through parent dependencies
  let modelCount = 0;
  for (const [nodeId, node] of Object.entries(nodes)) {
    if (node.resource_type !== 'model') continue;
    modelCount++;

    const targetName = qualifiedName(node);
    const targetColumns = getColumns(nodeId, node, catalog);
    const parentIds = node.depends_on?.nodes ?? [];
    const sql = node.compiled_code ?? node.compiled_sql ?? node.raw_code ?? node.raw_sql ?? null;
    const sqlClassification = classifyFromSql(sql);

    if (parentIds.length === 0 || targetColumns.length === 0) continue;

    // For each parent, try to match columns
    for (const parentId of parentIds) {
      const parent = nodeMap.get(parentId);
      if (!parent) continue;

      const parentName = qualifiedName(parent);
      const parentColumns = getColumns(parentId, parent, catalog);
      const parentColNames = new Set(parentColumns.map(c => c.name.toLowerCase()));
      const parentColMap = new Map(parentColumns.map(c => [c.name.toLowerCase(), c]));

      for (const targetCol of targetColumns) {
        const targetColLower = targetCol.name.toLowerCase();

        // Check if this column exists in the parent (by name match)
        if (parentColNames.has(targetColLower)) {
          const parentCol = parentColMap.get(targetColLower)!;
          let transformType: TransformType;

          // Determine transform type
          if (parentCol.type && targetCol.type &&
              parentCol.type.toLowerCase() !== targetCol.type.toLowerCase()) {
            transformType = 'cast';
          } else if (sqlClassification !== 'unknown') {
            transformType = sqlClassification;
          } else {
            transformType = 'identity';
          }

          allMappings.push({
            sourceTable: parentName,
            sourceColumn: parentCol.name,
            targetTable: targetName,
            targetColumn: targetCol.name,
            transformType,
            transformLogic: sql ? `[dbt model: ${node.name}]` : null,
            sourceType: parentCol.type,
            targetType: targetCol.type,
            pipelineName: node.name,
          });
        }
      }
    }
  }

  return {
    sourceFormat: 'dbt',
    extractedAt: new Date().toISOString(),
    mappings: allMappings,
    metadata: {
      dbtProjectName: manifest.metadata?.project_name ?? undefined,
      totalModels: modelCount,
    },
  };
}
