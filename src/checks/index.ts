import type { ScannerCheck } from './types';
import { p1SemanticIdentity } from './p1-semantic-identity';
import { p2TypeInconsistency, p2UncontrolledVocab } from './p2-reference-data';
import { p3DomainOverlap, p3CrossSchemaCoupling } from './p3-domain-ownership';
import { p4CsvImportPattern, p4IslandTables, p4WideTables } from './p4-anti-corruption';
import { p5NamingViolations, p5MissingPk, p5Undocumented } from './p5-schema-governance';
import { p6HighNullRate, p6NoIndexes } from './p6-quality-measurement';
import { p6ZScoreOutliers, p6IqrOutliers, p6NullRateSpike } from './p6-anomaly-detection';
import { p7MissingAudit, p7NoConstraints } from './p7-regulatory-traceability';

export const ALL_CHECKS: ScannerCheck[] = [
  p1SemanticIdentity,
  p2TypeInconsistency,
  p2UncontrolledVocab,
  p3DomainOverlap,
  p3CrossSchemaCoupling,
  p4CsvImportPattern,
  p4IslandTables,
  p4WideTables,
  p5NamingViolations,
  p5MissingPk,
  p5Undocumented,
  p6HighNullRate,
  p6NoIndexes,
  p6ZScoreOutliers,
  p6IqrOutliers,
  p6NullRateSpike,
  p7MissingAudit,
  p7NoConstraints,
];

export {
  p1SemanticIdentity,
  p2TypeInconsistency,
  p2UncontrolledVocab,
  p3DomainOverlap,
  p3CrossSchemaCoupling,
  p4CsvImportPattern,
  p4IslandTables,
  p4WideTables,
  p5NamingViolations,
  p5MissingPk,
  p5Undocumented,
  p6HighNullRate,
  p6NoIndexes,
  p6ZScoreOutliers,
  p6IqrOutliers,
  p6NullRateSpike,
  p7MissingAudit,
  p7NoConstraints,
};

export { computeStrengths } from './strengths';
export type { ScannerCheck, Finding, Evidence, ScannerConfig, SynonymGroup, CostCategory, Strength } from './types';
