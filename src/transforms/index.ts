// =============================================================================
// Transform Clarity Checks — Index
//
// Exports the full list of transform checks and a convenience runner function.
// =============================================================================

import type { TransformCheck, TransformData, TransformFinding } from './types';
import { sd1AliasCheck } from './checks/sd1-alias-misalignment';
import { sd2TypeCoercionCheck } from './checks/sd2-type-coercion';
import { sd3AggregationCheck } from './checks/sd3-undocumented-aggregation';
import { sd4UnitConversionCheck } from './checks/sd4-unit-conversion';
import { sd5NullMaskingCheck } from './checks/sd5-null-masking';
import { ob1EntityMergingCheck } from './checks/ob1-entity-merging';
import { ob2EntitySplittingCheck } from './checks/ob2-entity-splitting';
import { ob3CategoryFlatteningCheck } from './checks/ob3-category-flattening';
import { ob4FanoutJoinCheck } from './checks/ob4-fanout-join';

/**
 * All 9 transform clarity checks.
 */
export const TRANSFORM_CHECKS: TransformCheck[] = [
  // Semantic Drift (SD-1 through SD-5)
  sd1AliasCheck,
  sd2TypeCoercionCheck,
  sd3AggregationCheck,
  sd4UnitConversionCheck,
  sd5NullMaskingCheck,
  // Ontological Breaks (OB-1 through OB-4)
  ob1EntityMergingCheck,
  ob2EntitySplittingCheck,
  ob3CategoryFlatteningCheck,
  ob4FanoutJoinCheck,
];

/**
 * Run all transform checks against parsed transform data.
 * Returns all findings from all checks.
 */
export function runTransformChecks(data: TransformData): TransformFinding[] {
  const allFindings: TransformFinding[] = [];

  for (const check of TRANSFORM_CHECKS) {
    const findings = check.evaluate(data);
    allFindings.push(...findings);
  }

  return allFindings;
}

// Re-export types and checks
export {
  sd1AliasCheck,
  sd2TypeCoercionCheck,
  sd3AggregationCheck,
  sd4UnitConversionCheck,
  sd5NullMaskingCheck,
  ob1EntityMergingCheck,
  ob2EntitySplittingCheck,
  ob3CategoryFlatteningCheck,
  ob4FanoutJoinCheck,
};

export type {
  TransformCheck,
  TransformData,
  TransformFinding,
  TransformMapping,
  TransformEvidence,
  TransformSeverity,
  TransformCostCategory,
} from './types';

export { parseTransformFiles, type TransformFile, type TransformParseResult } from './parser';
