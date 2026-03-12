/**
 * Shared fixtures for methodology tests.
 */

import type { MethodologyBuilderInput } from '../../src/methodology/types';

/** A "healthy" scan input: 20 checks, 50 tables, no dry-run, pipeline mapping present. */
export function makeInput(overrides: Partial<MethodologyBuilderInput> = {}): MethodologyBuilderInput {
  return {
    checksRun: 20,
    checksAvailable: 21,
    propertiesCovered: [1, 2, 3, 4, 5, 6, 7, 8],
    totalTables: 50,
    totalColumns: 300,
    schemaCount: 3,
    adapterType: 'postgres',
    hasPipelineMapping: true,
    hasExternalLineage: false,
    isDryRun: false,
    totalFindings: 12,
    severityCounts: { critical: 1, major: 3, minor: 5, info: 3 },
    highSeverityWithEvidence: 4,
    totalHighSeverity: 4,
    derivedApproach: 'full_v4',
    configuredThresholds: {},
    criticalityContext: {
      wasRun: true,
      totalAssetsAssessed: 50,
      signalTypesUsed: 10,
      cdeIdentificationMethod: 'naming-heuristic',
      tierDistribution: { low: 20, medium: 15, high: 10, critical: 5 },
    },
    ...overrides,
  };
}

/** Dry-run input: mock data, no pipeline, small schema. */
export function makeDryRunInput(): MethodologyBuilderInput {
  return makeInput({
    isDryRun: true,
    hasPipelineMapping: false,
    hasExternalLineage: false,
    totalTables: 5,
    totalColumns: 20,
    schemaCount: 1,
    adapterType: 'mock',
    totalFindings: 3,
    severityCounts: { critical: 0, major: 1, minor: 1, info: 1 },
    highSeverityWithEvidence: 0,
    totalHighSeverity: 1,
    criticalityContext: {
      wasRun: false,
      totalAssetsAssessed: 0,
      signalTypesUsed: 0,
      cdeIdentificationMethod: 'none',
      tierDistribution: {},
    },
  });
}

/** Sparse scan: partial checks, sparse evidence, no pipeline. */
export function makeSparseInput(): MethodologyBuilderInput {
  return makeInput({
    checksRun: 10,
    checksAvailable: 21,
    propertiesCovered: [1, 2, 5, 6],
    totalTables: 15,
    totalColumns: 80,
    hasPipelineMapping: false,
    hasExternalLineage: false,
    totalFindings: 8,
    severityCounts: { critical: 2, major: 3, minor: 2, info: 1 },
    highSeverityWithEvidence: 2,
    totalHighSeverity: 5,
    criticalityContext: {
      wasRun: true,
      totalAssetsAssessed: 15,
      signalTypesUsed: 3,
      cdeIdentificationMethod: 'naming-heuristic',
      tierDistribution: { medium: 15 },
    },
  });
}
