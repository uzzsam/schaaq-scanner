/**
 * Scan Result Routes — Read Pipeline for Persistent Scan History
 *
 * Endpoints:
 *   GET /api/scan-results/project/:projectId/history      — list scan history
 *   GET /api/scan-results/project/:projectId/comparison   — latest vs previous
 *   GET /api/scan-results/project/:projectId/trend        — historical trend window
 *   GET /api/scan-results/:id                              — get result set by ID
 *   GET /api/scan-results/:id/findings                     — get findings for a result set
 *   GET /api/scan-results/:id/findings-detail               — get findings with full evidence view models
 *   GET /api/scan-results/:id/methodology                   — get methodology summary for a result set
 *   GET /api/scan-results/:id/remediation-plan             — get remediation plan for a result set
 *   GET /api/scan-results/:id/regression/:baselineId       — regression summary between two result sets
 *   GET /api/scan-results/:id/benchmark-comparison         — benchmark comparison for a result set
 *   GET /api/scan-results/:id/baseline-comparison          — project baseline comparison for a result set
 *   GET /api/scan-results/:id/blast-radius                — economic blast-radius graph for a result set
 *   GET /api/scan-results/:id/manifest                    — audit/reproducibility manifest for a result set
 *   GET /api/scan-results/benchmark-packs                  — list available benchmark packs
 *   GET /api/scan-results/findings/:findingId               — get single finding detail
 *   GET /api/scan-results/by-scan/:scanId                  — get result set by scan ID
 *   DELETE /api/scan-results/:id                           — delete a result set
 */

import { Router } from 'express';
import type { ScanResultRepository } from '../db/scan-result-repository';
import { safeError } from '../middleware/safe-error';
import { safeJsonParse } from '../../utils/safe-json';
import { getFindingDetail, getFindingsForResultSet } from '../services/finding-evidence-service';
import { buildRemediationPlan } from '../../remediation';
import { buildHistoricalComparisonWindow, buildRegressionBetween } from '../../trend';
import {
  getAvailablePacks,
  getPackById,
  getPackForSector,
  buildBenchmarkSummary,
  buildBaselineComparison,
} from '../../benchmark';
import {
  buildBlastRadiusGraph,
  buildBlastRadiusSummary,
  buildBlastRadiusDetail,
} from '../../blast-radius';
import type { BlastRadiusFindingInput } from '../../blast-radius';
import { buildAssessmentManifest } from '../../manifest';

export function scanResultRoutes(scanResultRepo: ScanResultRepository): Router {
  const router = Router();

  // -------------------------------------------------------------------------
  // List scan history for a project (newest first)
  // -------------------------------------------------------------------------
  router.get('/project/:projectId/history', (req, res) => {
    try {
      const { projectId } = req.params;
      const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
      const history = scanResultRepo.getScanHistoryForProject(projectId, limit);
      res.json({ items: history, total: history.length });
    } catch (err: unknown) {
      res.status(500).json({ error: safeError(err, 'GET /api/scan-results/project/:projectId/history') });
    }
  });

  // -------------------------------------------------------------------------
  // Compare latest vs previous scan for a project
  // -------------------------------------------------------------------------
  router.get('/project/:projectId/comparison', (req, res) => {
    try {
      const { projectId } = req.params;
      const comparison = scanResultRepo.compareLatestToPrevious(projectId);
      if (!comparison) {
        res.status(404).json({ error: 'No completed scans found for this project' });
        return;
      }
      res.json(comparison);
    } catch (err: unknown) {
      res.status(500).json({ error: safeError(err, 'GET /api/scan-results/project/:projectId/comparison') });
    }
  });

  // -------------------------------------------------------------------------
  // Historical trend window for a project
  // -------------------------------------------------------------------------
  router.get('/project/:projectId/trend', (req, res) => {
    try {
      const { projectId } = req.params;
      const windowSize = Math.min(Math.max(parseInt(req.query.window as string) || 10, 2), 50);
      const window = buildHistoricalComparisonWindow(scanResultRepo, projectId, windowSize);
      if (!window) {
        res.status(404).json({ error: 'No completed scans found for this project' });
        return;
      }
      res.json(window);
    } catch (err: unknown) {
      res.status(500).json({ error: safeError(err, 'GET /api/scan-results/project/:projectId/trend') });
    }
  });

  // -------------------------------------------------------------------------
  // Get a result set by ID (with parsed summary)
  // -------------------------------------------------------------------------
  router.get('/:id', (req, res) => {
    try {
      const row = scanResultRepo.getResultSetById(req.params.id);
      if (!row) {
        res.status(404).json({ error: 'Result set not found' });
        return;
      }
      res.json({
        ...row,
        summary: safeJsonParse(row.summary_json, {}, 'scan_result_sets.summary_json'),
      });
    } catch (err: unknown) {
      res.status(500).json({ error: safeError(err, 'GET /api/scan-results/:id') });
    }
  });

  // -------------------------------------------------------------------------
  // Get findings for a result set (with parsed JSON fields)
  // -------------------------------------------------------------------------
  router.get('/:id/findings', (req, res) => {
    try {
      const resultSet = scanResultRepo.getResultSetById(req.params.id);
      if (!resultSet) {
        res.status(404).json({ error: 'Result set not found' });
        return;
      }
      const findings = scanResultRepo.getFindingsParsed(req.params.id);
      res.json({ resultSetId: req.params.id, findings });
    } catch (err: unknown) {
      res.status(500).json({ error: safeError(err, 'GET /api/scan-results/:id/findings') });
    }
  });

  // -------------------------------------------------------------------------
  // Get findings for a result set as FindingDetailViewModels (full evidence)
  // -------------------------------------------------------------------------
  router.get('/:id/findings-detail', (req, res) => {
    try {
      const resultSet = scanResultRepo.getResultSetById(req.params.id);
      if (!resultSet) {
        res.status(404).json({ error: 'Result set not found' });
        return;
      }
      const viewModels = getFindingsForResultSet(scanResultRepo, req.params.id);
      res.json({ resultSetId: req.params.id, findings: viewModels });
    } catch (err: unknown) {
      res.status(500).json({ error: safeError(err, 'GET /api/scan-results/:id/findings-detail') });
    }
  });

  // -------------------------------------------------------------------------
  // Get remediation plan for a result set
  // -------------------------------------------------------------------------
  router.get('/:id/remediation-plan', (req, res) => {
    try {
      const resultSet = scanResultRepo.getResultSetById(req.params.id);
      if (!resultSet) {
        res.status(404).json({ error: 'Result set not found' });
        return;
      }
      const findings = scanResultRepo.getFindingsParsed(req.params.id);
      const criticalityAssessment = scanResultRepo.getCriticalityAssessment(req.params.id) ?? undefined;
      const benchmarkSummary = buildBenchmarkSummary(scanResultRepo, req.params.id, getPackForSector(null));
      const plan = buildRemediationPlan({
        resultSetId: req.params.id,
        findings,
        dalcLowUsd: resultSet.dalc_low_usd ?? resultSet.dalc_total_usd * 0.7,
        dalcBaseUsd: resultSet.dalc_base_usd ?? resultSet.dalc_total_usd,
        dalcHighUsd: resultSet.dalc_high_usd ?? resultSet.dalc_total_usd * 1.4,
        criticalityAssessment,
        benchmarkSummary: benchmarkSummary ? {
          overallPosition: benchmarkSummary.overallPosition,
          dalcComparison: { position: benchmarkSummary.dalcComparison.position },
        } : undefined,
      });
      res.json(plan);
    } catch (err: unknown) {
      res.status(500).json({ error: safeError(err, 'GET /api/scan-results/:id/remediation-plan') });
    }
  });

  // -------------------------------------------------------------------------
  // Get criticality assessment for a result set
  // -------------------------------------------------------------------------
  router.get('/:id/criticality', (req, res) => {
    try {
      const resultSet = scanResultRepo.getResultSetById(req.params.id);
      if (!resultSet) {
        res.status(404).json({ error: 'Result set not found' });
        return;
      }
      const assessment = scanResultRepo.getCriticalityAssessment(req.params.id);
      if (!assessment) {
        res.status(404).json({ error: 'No criticality assessment available for this result set' });
        return;
      }
      res.json(assessment);
    } catch (err: unknown) {
      res.status(500).json({ error: safeError(err, 'GET /api/scan-results/:id/criticality') });
    }
  });

  // -------------------------------------------------------------------------
  // Get methodology summary for a result set
  // -------------------------------------------------------------------------
  router.get('/:id/methodology', (req, res) => {
    try {
      const resultSet = scanResultRepo.getResultSetById(req.params.id);
      if (!resultSet) {
        res.status(404).json({ error: 'Result set not found' });
        return;
      }
      const summary = scanResultRepo.getMethodologySummary(req.params.id);
      if (!summary) {
        res.status(404).json({ error: 'No methodology summary available for this result set' });
        return;
      }
      res.json(summary);
    } catch (err: unknown) {
      res.status(500).json({ error: safeError(err, 'GET /api/scan-results/:id/methodology') });
    }
  });

  // -------------------------------------------------------------------------
  // Regression summary between two result sets
  // -------------------------------------------------------------------------
  router.get('/:id/regression/:baselineId', (req, res) => {
    try {
      const summary = buildRegressionBetween(scanResultRepo, req.params.id, req.params.baselineId);
      if (!summary) {
        res.status(404).json({ error: 'One or both result sets not found' });
        return;
      }
      res.json(summary);
    } catch (err: unknown) {
      res.status(500).json({ error: safeError(err, 'GET /api/scan-results/:id/regression/:baselineId') });
    }
  });

  // -------------------------------------------------------------------------
  // List available benchmark packs
  // -------------------------------------------------------------------------
  router.get('/benchmark-packs', (_req, res) => {
    try {
      const packs = getAvailablePacks();
      res.json({ packs });
    } catch (err: unknown) {
      res.status(500).json({ error: safeError(err, 'GET /api/scan-results/benchmark-packs') });
    }
  });

  // -------------------------------------------------------------------------
  // Benchmark comparison for a result set
  // -------------------------------------------------------------------------
  router.get('/:id/benchmark-comparison', (req, res) => {
    try {
      const resultSet = scanResultRepo.getResultSetById(req.params.id);
      if (!resultSet) {
        res.status(404).json({ error: 'Result set not found' });
        return;
      }

      // Resolve pack: explicit packId > sector from result set > default
      let pack = req.query.packId
        ? getPackById(req.query.packId as string)
        : null;
      if (!pack) {
        const sector = req.query.sector as string | undefined;
        pack = getPackForSector(sector ?? null);
      }

      const summary = buildBenchmarkSummary(scanResultRepo, req.params.id, pack);
      if (!summary) {
        res.status(404).json({ error: 'Could not build benchmark comparison' });
        return;
      }
      res.json(summary);
    } catch (err: unknown) {
      res.status(500).json({ error: safeError(err, 'GET /api/scan-results/:id/benchmark-comparison') });
    }
  });

  // -------------------------------------------------------------------------
  // Project baseline comparison for a result set
  // -------------------------------------------------------------------------
  router.get('/:id/baseline-comparison', (req, res) => {
    try {
      const resultSet = scanResultRepo.getResultSetById(req.params.id);
      if (!resultSet) {
        res.status(404).json({ error: 'Result set not found' });
        return;
      }
      const baseline = buildBaselineComparison(scanResultRepo, resultSet.project_id);
      if (!baseline) {
        res.status(404).json({ error: 'No baseline comparison available (need at least 2 completed scans)' });
        return;
      }
      res.json(baseline);
    } catch (err: unknown) {
      res.status(500).json({ error: safeError(err, 'GET /api/scan-results/:id/baseline-comparison') });
    }
  });

  // -------------------------------------------------------------------------
  // Economic blast-radius graph for a result set
  // -------------------------------------------------------------------------
  router.get('/:id/blast-radius', (req, res) => {
    try {
      const resultSet = scanResultRepo.getResultSetById(req.params.id);
      if (!resultSet) {
        res.status(404).json({ error: 'Result set not found' });
        return;
      }
      const findings = scanResultRepo.getFindingsParsed(req.params.id);
      const blastFindings: BlastRadiusFindingInput[] = findings.map(f => ({
        checkId: f.check_id,
        property: f.property,
        severity: f.severity,
        raw_score: f.raw_score,
        costCategories: f.costCategories,
        costWeights: f.costWeights,
      }));

      // categoryTotalsUsd not available on result set row; derive from dalc total
      const dalcTotalUsd = resultSet.dalc_total_usd ?? 0;
      const graph = buildBlastRadiusGraph(blastFindings, null, dalcTotalUsd);
      const summary = buildBlastRadiusSummary(graph);
      const detail = buildBlastRadiusDetail(graph);

      res.json({ resultSetId: req.params.id, graph, summary, detail });
    } catch (err: unknown) {
      res.status(500).json({ error: safeError(err, 'GET /api/scan-results/:id/blast-radius') });
    }
  });

  // -------------------------------------------------------------------------
  // Audit / reproducibility manifest for a result set
  // -------------------------------------------------------------------------
  router.get('/:id/manifest', (req, res) => {
    try {
      const resultSet = scanResultRepo.getResultSetById(req.params.id);
      if (!resultSet) {
        res.status(404).json({ error: 'Result set not found' });
        return;
      }
      const findings = scanResultRepo.getFindingsByResultSetId(req.params.id);
      // Count completed scans for the project (for trend availability)
      const history = scanResultRepo.getScanHistoryForProject(resultSet.project_id, 200);
      const completedCount = history.filter(h => h.status === 'completed').length;
      const manifest = buildAssessmentManifest(resultSet, findings, completedCount);
      res.json(manifest);
    } catch (err: unknown) {
      res.status(500).json({ error: safeError(err, 'GET /api/scan-results/:id/manifest') });
    }
  });

  // -------------------------------------------------------------------------
  // Get a single finding by ID with full evidence detail
  // -------------------------------------------------------------------------
  router.get('/findings/:findingId', (req, res) => {
    try {
      const findingId = parseInt(req.params.findingId, 10);
      if (isNaN(findingId)) {
        res.status(400).json({ error: 'Invalid finding ID' });
        return;
      }
      const detail = getFindingDetail(scanResultRepo, findingId);
      if (!detail) {
        res.status(404).json({ error: 'Finding not found' });
        return;
      }
      res.json(detail);
    } catch (err: unknown) {
      res.status(500).json({ error: safeError(err, 'GET /api/scan-results/findings/:findingId') });
    }
  });

  // -------------------------------------------------------------------------
  // Get result set by scan ID
  // -------------------------------------------------------------------------
  router.get('/by-scan/:scanId', (req, res) => {
    try {
      const row = scanResultRepo.getResultSetByScanId(req.params.scanId);
      if (!row) {
        res.status(404).json({ error: 'No result set found for this scan' });
        return;
      }
      res.json({
        ...row,
        summary: safeJsonParse(row.summary_json, {}, 'scan_result_sets.summary_json'),
      });
    } catch (err: unknown) {
      res.status(500).json({ error: safeError(err, 'GET /api/scan-results/by-scan/:scanId') });
    }
  });

  // -------------------------------------------------------------------------
  // Delete a result set (cascade-deletes findings)
  // -------------------------------------------------------------------------
  router.delete('/:id', (req, res) => {
    try {
      const deleted = scanResultRepo.deleteResultSet(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: 'Result set not found' });
        return;
      }
      res.json({ deleted: true });
    } catch (err: unknown) {
      res.status(500).json({ error: safeError(err, 'DELETE /api/scan-results/:id') });
    }
  });

  return router;
}
