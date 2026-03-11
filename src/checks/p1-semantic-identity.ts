import type { SchemaData } from '../adapters/types';
import { similarity } from '../utils/string-distance';
import type {
  CostCategory,
  Evidence,
  Finding,
  ScannerCheck,
  ScannerConfig,
  SynonymGroup,
} from './types';

// =============================================================================
// Default synonym groups for entity name clustering
// =============================================================================
const DEFAULT_SYNONYM_GROUPS: SynonymGroup[] = [
  { canonical: 'site', variants: ['location', 'facility', 'place', 'loc', 'venue', 'premises'] },
  { canonical: 'person', variants: ['employee', 'staff', 'worker', 'user', 'contact', 'individual'] },
  { canonical: 'organisation', variants: ['company', 'org', 'corporation', 'entity', 'business', 'client', 'customer', 'vendor', 'supplier'] },
  { canonical: 'asset', variants: ['equipment', 'device', 'instrument', 'unit', 'machine'] },
  { canonical: 'project', variants: ['program', 'initiative', 'campaign', 'engagement'] },
  { canonical: 'document', variants: ['doc', 'file', 'record', 'report', 'attachment'] },
  { canonical: 'transaction', variants: ['txn', 'event', 'activity', 'action', 'operation'] },
  { canonical: 'bore', variants: ['well', 'hole', 'drill_hole', 'drillhole', 'borehole', 'collar'] },
  { canonical: 'sample', variants: ['specimen', 'assay', 'test_result'] },
  { canonical: 'tenement', variants: ['lease', 'licence', 'permit', 'concession', 'mining_right'] },
  { canonical: 'deposit', variants: ['ore_body', 'orebody', 'mineral_occurrence', 'resource'] },
  { canonical: 'monitoring_point', variants: ['sampling_site', 'observation_point', 'station', 'gauge'] },
  { canonical: 'emission', variants: ['discharge', 'effluent', 'release', 'output'] },
  { canonical: 'parameter', variants: ['analyte', 'constituent', 'measure', 'metric', 'indicator'] },
  { canonical: 'meter', variants: ['metering_point', 'nmi', 'connection_point', 'poi'] },
  { canonical: 'transformer', variants: ['trafo', 'xfmr', 'trf'] },
  { canonical: 'feeder', variants: ['circuit', 'line', 'conductor'] },
];

// =============================================================================
// Entity suffixes used to extract stems from column names
// =============================================================================
const ENTITY_SUFFIXES = [
  '_id', '_code', '_key', '_ref', '_name', '_type', '_no', '_number', '_num',
];

// =============================================================================
// Cost weights for P1 findings
// =============================================================================
const COST_WEIGHTS: Record<CostCategory, number> = {
  firefighting: 0.3,
  dataQuality: 0,
  integration: 0.5,
  productivity: 0.2,
  regulatory: 0,
  aiMlRiskExposure: 0,
};

const ACTIVE_COST_CATEGORIES: CostCategory[] = (['firefighting', 'integration', 'productivity'] as CostCategory[]);

// =============================================================================
// Helpers
// =============================================================================

/** Normalize a stem: lowercase, replace hyphens/spaces with underscore */
function normalizeStem(raw: string): string {
  return raw.toLowerCase().replace(/[-\s]+/g, '_');
}

/** Extract entity stem from a column name by stripping known suffixes */
function extractStem(columnName: string): string | null {
  const lower = columnName.toLowerCase();
  for (const suffix of ENTITY_SUFFIXES) {
    if (lower.endsWith(suffix)) {
      const raw = lower.slice(0, lower.length - suffix.length);
      if (raw.length > 0) {
        return normalizeStem(raw);
      }
    }
  }
  return null;
}

/** Build a mapping from every term (canonical + variant) → canonical */
function buildSynonymMap(groups: SynonymGroup[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const group of groups) {
    const canon = normalizeStem(group.canonical);
    map.set(canon, canon);
    for (const variant of group.variants) {
      map.set(normalizeStem(variant), canon);
    }
  }
  return map;
}

/** Union-Find data structure for clustering stems */
class UnionFind {
  private parent: Map<string, string> = new Map();

  find(x: string): string {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
    }
    let root = x;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    // Path compression
    let current = x;
    while (current !== root) {
      const next = this.parent.get(current)!;
      this.parent.set(current, root);
      current = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) {
      this.parent.set(rb, ra);
    }
  }

  getClusters(): Map<string, Set<string>> {
    const clusters = new Map<string, Set<string>>();
    for (const key of this.parent.keys()) {
      const root = this.find(key);
      if (!clusters.has(root)) {
        clusters.set(root, new Set());
      }
      clusters.get(root)!.add(key);
    }
    return clusters;
  }
}

// =============================================================================
// Check implementation
// =============================================================================
export const p1SemanticIdentity: ScannerCheck = {
  id: 'P1-SEMANTIC-IDENTITY',
  property: 1,
  name: 'Entity Name Variants',
  description:
    'Detect entity name variants across tables using synonym groups and Levenshtein similarity.',

  execute(schema: SchemaData, config: ScannerConfig): Finding[] {
    const threshold = config.thresholds.entitySimilarityThreshold ?? 0.7;

    // Merge default + config synonym groups
    const configGroups = config.thresholds.synonymGroups ?? [];
    const allGroups = [...DEFAULT_SYNONYM_GROUPS, ...configGroups];
    const synonymMap = buildSynonymMap(allGroups);

    // 1. Extract stems from all column names
    const stemSources = new Map<string, Set<string>>(); // stem → set of "schema.table.column"
    for (const col of schema.columns) {
      const stem = extractStem(col.name);
      if (stem) {
        if (!stemSources.has(stem)) {
          stemSources.set(stem, new Set());
        }
        stemSources.get(stem)!.add(`${col.schema}.${col.table}.${col.name}`);
      }
    }

    const allStems = Array.from(stemSources.keys());
    if (allStems.length === 0) {
      return [];
    }

    // 2. Cluster stems by synonym membership
    const uf = new UnionFind();
    // Initialize all stems in union-find
    for (const stem of allStems) {
      uf.find(stem);
    }

    // Merge stems that share a synonym group
    for (const stem of allStems) {
      const canon = synonymMap.get(stem);
      if (canon !== undefined) {
        // Find other stems in the same synonym group
        for (const other of allStems) {
          if (other !== stem) {
            const otherCanon = synonymMap.get(other);
            if (otherCanon !== undefined && otherCanon === canon) {
              uf.union(stem, other);
            }
          }
        }
      }
    }

    // 3. Merge stems by Levenshtein similarity
    for (let i = 0; i < allStems.length; i++) {
      for (let j = i + 1; j < allStems.length; j++) {
        const sim = similarity(allStems[i], allStems[j]);
        if (sim >= threshold) {
          uf.union(allStems[i], allStems[j]);
        }
      }
    }

    // 4. Extract clusters with 2+ distinct stems
    const clusters = uf.getClusters();
    const findings: Finding[] = [];
    const totalStems = allStems.length;

    for (const [, members] of clusters) {
      if (members.size < 2) continue;

      const memberArray = Array.from(members).sort();

      // Collect evidence from all columns contributing to this cluster
      const evidence: Evidence[] = [];
      const affectedColumns = new Set<string>();
      for (const stem of memberArray) {
        const sources = stemSources.get(stem);
        if (sources) {
          for (const src of sources) {
            affectedColumns.add(src);
            const [schemaName, tableName, columnName] = src.split('.');
            evidence.push({
              schema: schemaName,
              table: tableName,
              column: columnName,
              detail: `Entity stem "${stem}" found in column "${columnName}"`,
            });
          }
        }
      }

      // Determine severity
      const variantCount = members.size;
      let sev: 'critical' | 'major' | 'minor';
      if (variantCount >= 4) {
        sev = 'critical';
      } else if (variantCount >= 3) {
        sev = 'major';
      } else {
        sev = 'minor';
      }

      const ratio = totalStems > 0 ? memberArray.length / totalStems : 0;

      findings.push({
        checkId: 'P1-SEMANTIC-IDENTITY',
        property: 1,
        severity: sev,
        rawScore: 0,
        title: `Entity name variants detected: ${memberArray.join(', ')}`,
        description:
          `${variantCount} variant stems refer to the same logical entity: [${memberArray.join(', ')}]. ` +
          `This inconsistency increases integration cost and reduces data discoverability.`,
        evidence,
        affectedObjects: memberArray.length,
        totalObjects: totalStems,
        ratio,
        remediation:
          'Standardise entity naming to a single canonical term across all schemas. ' +
          'Create a naming convention guide and refactor column names to use the canonical form.',
        costCategories: ACTIVE_COST_CATEGORIES,
        costWeights: { ...COST_WEIGHTS },
      });
    }

    return findings;
  },
};
