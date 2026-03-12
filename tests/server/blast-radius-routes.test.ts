/**
 * Route / Read-Model Tests for Blast-Radius Endpoint
 *
 * Verifies the blast-radius API route:
 *   GET /api/scan-results/:id/blast-radius
 *
 * Uses the same db + repository infrastructure as scan-results.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { initDatabase } from '../../src/server/db/schema';
import { Repository } from '../../src/server/db/repository';
import { ScanResultRepository } from '../../src/server/db/scan-result-repository';
import type { NewResultFindingInput } from '../../src/server/db/scan-result-types';
import type Database from 'better-sqlite3';
import {
  buildBlastRadiusGraph,
  buildBlastRadiusSummary,
  buildBlastRadiusDetail,
} from '../../src/blast-radius';
import type { BlastRadiusFindingInput } from '../../src/blast-radius';

describe('Blast-Radius Route Read-Model', () => {
  let dataDir: string;
  let db: Database.Database;
  let repo: Repository;
  let scanResultRepo: ScanResultRepository;
  let projectId: string;
  let scanId: string;

  const validProject = {
    name: 'Blast Corp',
    sector: 'mining' as const,
    revenueAUD: 100_000_000,
    totalFTE: 500,
    dataEngineers: 10,
    avgSalaryAUD: 150_000,
    avgFTESalaryAUD: 100_000,
  };

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'dalc-blast-radius-routes-test-'));
    db = initDatabase(dataDir);
    repo = new Repository(db);
    scanResultRepo = new ScanResultRepository(db);

    const project = repo.createProject(validProject);
    projectId = project.id;
    const scan = repo.createScan(projectId, {}, false);
    scanId = scan.id;
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function createResultSet(overrides: {
    dalcTotalUsd?: number;
    scanId?: string | null;
  } = {}): string {
    return scanResultRepo.createScanResultSet({
      projectId,
      scanId: overrides.scanId !== undefined ? overrides.scanId : scanId,
      runLabel: 'Blast Radius Test Run',
      adapterType: 'postgresql',
      appVersion: '3.7.1',
      rulesetVersion: '1.0',
      dalcVersion: 'v4.0.0',
      status: 'completed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 5000,
      totalFindings: 5,
      criticalCount: 1,
      majorCount: 2,
      minorCount: 1,
      infoCount: 1,
      dalcTotalUsd: overrides.dalcTotalUsd ?? 100_000,
      dalcBaseUsd: overrides.dalcTotalUsd ?? 100_000,
      amplificationRatio: 1.5,
      derivedApproach: 'kimball',
      summary: { schemaTables: 10, schemaColumns: 50 },
    });
  }

  function makeFinding(overrides: Partial<NewResultFindingInput> & { checkId: string }): NewResultFindingInput {
    return {
      checkId: overrides.checkId,
      property: overrides.property ?? 1,
      severity: overrides.severity ?? 'major',
      rawScore: overrides.rawScore ?? 0.5,
      title: overrides.title ?? 'Test Finding',
      description: overrides.description ?? 'A test finding',
      affectedObjects: overrides.affectedObjects ?? 10,
      totalObjects: overrides.totalObjects ?? 50,
      ratio: overrides.ratio ?? 0.2,
      remediation: overrides.remediation ?? 'Fix it',
      evidence: overrides.evidence ?? [],
      costCategories: overrides.costCategories ?? ['firefighting'],
      costWeights: overrides.costWeights ?? { firefighting: 1.0 },
    };
  }

  /** Simulate the route handler logic: fetch findings, map, build graph/summary/detail */
  function simulateRouteHandler(resultSetId: string, dalcTotalUsd: number) {
    const findings = scanResultRepo.getFindingsParsed(resultSetId);
    const blastFindings: BlastRadiusFindingInput[] = findings.map(f => ({
      checkId: f.check_id,
      property: f.property,
      severity: f.severity,
      raw_score: f.raw_score,
      costCategories: f.costCategories,
      costWeights: f.costWeights,
    }));
    const graph = buildBlastRadiusGraph(blastFindings, null, dalcTotalUsd);
    const summary = buildBlastRadiusSummary(graph);
    const detail = buildBlastRadiusDetail(graph);
    return { graph, summary, detail };
  }

  // =========================================================================
  // GET /:id/blast-radius — full integration from DB through service
  // =========================================================================

  describe('Blast-Radius (read-model for GET /:id/blast-radius)', () => {
    it('returns empty graph when result set has no findings', () => {
      const rsId = createResultSet();
      const { graph, summary, detail } = simulateRouteHandler(rsId, 100_000);

      expect(graph.nodes).toHaveLength(0);
      expect(graph.edges).toHaveLength(0);
      expect(graph.totalImpactUsd).toBe(0);
      expect(summary.totalImpactUsd).toBe(0);
      expect(detail.edges).toHaveLength(0);
    });

    it('builds graph from single finding with one cost category', () => {
      const rsId = createResultSet({ dalcTotalUsd: 60_000 });
      scanResultRepo.bulkInsertFindings(rsId, projectId, [
        makeFinding({
          checkId: 'P1_IDENTITY_01',
          property: 1,
          severity: 'critical',
          rawScore: 0.8,
          costCategories: ['firefighting'],
          costWeights: { firefighting: 1.0 },
        }),
      ]);

      const { graph, summary, detail } = simulateRouteHandler(rsId, 60_000);

      // Graph has 2 nodes: property P1 + cost category firefighting
      expect(graph.nodes).toHaveLength(2);
      expect(graph.edges).toHaveLength(1);
      expect(graph.totalImpactUsd).toBeGreaterThan(0);

      // Summary is non-empty
      expect(summary.totalEdgeCount).toBe(1);
      expect(summary.topHotEdges).toHaveLength(1);
      expect(summary.keyMessage).toBeTruthy();

      // Detail has one edge
      expect(detail.edges).toHaveLength(1);
      expect(detail.edges[0].property).toBe(1);
      expect(detail.edges[0].costCategory).toBe('firefighting');
      expect(detail.propertyTotals).toHaveLength(1);
      expect(detail.categoryTotals).toHaveLength(1);
    });

    it('builds graph from multiple findings spanning different properties and categories', () => {
      const rsId = createResultSet({ dalcTotalUsd: 120_000 });
      scanResultRepo.bulkInsertFindings(rsId, projectId, [
        makeFinding({
          checkId: 'P1_IDENTITY_01',
          property: 1,
          severity: 'critical',
          rawScore: 0.9,
          costCategories: ['firefighting', 'dataQuality'],
          costWeights: { firefighting: 0.6, dataQuality: 0.4 },
        }),
        makeFinding({
          checkId: 'P3_OWNERSHIP_01',
          property: 3,
          severity: 'major',
          rawScore: 0.5,
          costCategories: ['integration', 'productivity'],
          costWeights: { integration: 0.7, productivity: 0.3 },
        }),
        makeFinding({
          checkId: 'P5_GOVERNANCE_01',
          property: 5,
          severity: 'minor',
          rawScore: 0.3,
          costCategories: ['regulatory'],
          costWeights: { regulatory: 1.0 },
        }),
      ]);

      const { graph, summary, detail } = simulateRouteHandler(rsId, 120_000);

      // 3 property nodes + 5 cost category nodes
      const propertyNodes = graph.nodes.filter(n => n.type === 'property');
      const categoryNodes = graph.nodes.filter(n => n.type === 'costCategory');
      expect(propertyNodes).toHaveLength(3);
      expect(categoryNodes.length).toBeGreaterThanOrEqual(4); // ff, dq, int, prod, reg

      // 5 edges: P1→ff, P1→dq, P3→int, P3→prod, P5→reg
      expect(graph.edges).toHaveLength(5);
      expect(graph.totalImpactUsd).toBeGreaterThan(0);

      // Summary
      expect(summary.totalPropertyNodesActive).toBe(3);
      expect(summary.topHotEdges.length).toBeLessThanOrEqual(3);

      // Detail
      expect(detail.edges).toHaveLength(5);
      expect(detail.propertyTotals).toHaveLength(3);
      expect(detail.categoryTotals.length).toBeGreaterThanOrEqual(4);
    });

    it('shareOfTotal across all edges sums to ~1.0', () => {
      const rsId = createResultSet({ dalcTotalUsd: 80_000 });
      scanResultRepo.bulkInsertFindings(rsId, projectId, [
        makeFinding({
          checkId: 'P2_REF_01',
          property: 2,
          severity: 'major',
          rawScore: 0.6,
          costCategories: ['firefighting', 'dataQuality'],
          costWeights: { firefighting: 0.5, dataQuality: 0.5 },
        }),
        makeFinding({
          checkId: 'P4_ANTI_01',
          property: 4,
          severity: 'critical',
          rawScore: 0.7,
          costCategories: ['integration'],
          costWeights: { integration: 1.0 },
        }),
      ]);

      const { graph } = simulateRouteHandler(rsId, 80_000);
      const shareSum = graph.edges.reduce((s, e) => s + e.shareOfTotal, 0);
      expect(shareSum).toBeCloseTo(1.0, 5);
    });

    it('is deterministic across repeated calls', () => {
      const rsId = createResultSet({ dalcTotalUsd: 50_000 });
      scanResultRepo.bulkInsertFindings(rsId, projectId, [
        makeFinding({
          checkId: 'P1_ID_01',
          property: 1,
          severity: 'major',
          rawScore: 0.4,
          costCategories: ['firefighting', 'productivity'],
          costWeights: { firefighting: 0.6, productivity: 0.4 },
        }),
        makeFinding({
          checkId: 'P6_QUALITY_01',
          property: 6,
          severity: 'minor',
          rawScore: 0.2,
          costCategories: ['dataQuality'],
          costWeights: { dataQuality: 1.0 },
        }),
      ]);

      const r1 = simulateRouteHandler(rsId, 50_000);
      const r2 = simulateRouteHandler(rsId, 50_000);

      expect(r1.graph.totalImpactUsd).toBe(r2.graph.totalImpactUsd);
      expect(r1.graph.edges.length).toBe(r2.graph.edges.length);
      for (let i = 0; i < r1.graph.edges.length; i++) {
        expect(r1.graph.edges[i].weightUsd).toBe(r2.graph.edges[i].weightUsd);
        expect(r1.graph.edges[i].shareOfTotal).toBe(r2.graph.edges[i].shareOfTotal);
      }
      expect(r1.summary.keyMessage).toBe(r2.summary.keyMessage);
    });

    it('handles result set with zero dalcTotalUsd', () => {
      const rsId = createResultSet({ dalcTotalUsd: 0 });
      scanResultRepo.bulkInsertFindings(rsId, projectId, [
        makeFinding({
          checkId: 'P1_ZERO_01',
          property: 1,
          severity: 'info',
          rawScore: 0.1,
          costCategories: ['firefighting'],
          costWeights: { firefighting: 1.0 },
        }),
      ]);

      const { graph, summary } = simulateRouteHandler(rsId, 0);
      // With zero DALC, edges should have zero weight
      expect(graph.totalImpactUsd).toBe(0);
      expect(summary.totalImpactUsd).toBe(0);
    });

    it('severity distribution is propagated correctly from DB findings', () => {
      const rsId = createResultSet({ dalcTotalUsd: 100_000 });
      scanResultRepo.bulkInsertFindings(rsId, projectId, [
        makeFinding({
          checkId: 'P1_SEV_01',
          property: 1,
          severity: 'critical',
          rawScore: 0.9,
          costCategories: ['firefighting'],
          costWeights: { firefighting: 1.0 },
        }),
        makeFinding({
          checkId: 'P1_SEV_02',
          property: 1,
          severity: 'major',
          rawScore: 0.5,
          costCategories: ['firefighting'],
          costWeights: { firefighting: 1.0 },
        }),
        makeFinding({
          checkId: 'P1_SEV_03',
          property: 1,
          severity: 'info',
          rawScore: 0.1,
          costCategories: ['firefighting'],
          costWeights: { firefighting: 1.0 },
        }),
      ]);

      const { graph } = simulateRouteHandler(rsId, 100_000);

      // Single edge P1→firefighting merging 3 findings
      expect(graph.edges).toHaveLength(1);
      const edge = graph.edges[0];
      expect(edge.findingCount).toBe(3);
      expect(edge.severityDistribution.critical).toBe(1);
      expect(edge.severityDistribution.major).toBe(1);
      expect(edge.severityDistribution.info).toBe(1);
      expect(edge.severityDistribution.minor).toBe(0);
    });
  });
});
