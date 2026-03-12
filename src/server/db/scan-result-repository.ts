/**
 * Scan Result Repository — Persistent Scan History
 *
 * Owns all reads/writes for scan_result_sets and result_findings.
 * Each completed scan creates exactly one immutable result set.
 * Never overwrites prior runs.
 */

import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { safeJsonParse } from '../../utils/safe-json';
import type {
  ScanResultSetRow,
  ResultFindingRow,
  NewScanResultSetInput,
  NewResultFindingInput,
  ScanHistoryListItem,
  ScanSummaryComparison,
  FindingDiffEntry,
} from './scan-result-types';
import type { CriticalityAssessmentSummary } from '../../criticality/types';
import type { MethodologySummary } from '../../methodology/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowToListItem(row: ScanResultSetRow): ScanHistoryListItem {
  return {
    resultSetId: row.id,
    scanId: row.scan_id,
    projectId: row.project_id,
    runLabel: row.run_label,
    adapterType: row.adapter_type,
    sourceName: row.source_name,
    appVersion: row.app_version,
    dalcVersion: row.dalc_version,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
    totalFindings: row.total_findings,
    criticalCount: row.critical_count,
    majorCount: row.major_count,
    minorCount: row.minor_count,
    infoCount: row.info_count,
    dalcTotalUsd: row.dalc_total_usd,
    dalcBaseUsd: row.dalc_base_usd,
    dalcLowUsd: row.dalc_low_usd,
    dalcHighUsd: row.dalc_high_usd,
    amplificationRatio: row.amplification_ratio,
    derivedApproach: row.derived_approach,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class ScanResultRepository {
  constructor(private db: Database.Database) {}

  // =========================================================================
  // WRITE
  // =========================================================================

  /**
   * Create an immutable result set for a completed scan.
   * Returns the generated result set ID.
   */
  createScanResultSet(input: NewScanResultSetInput): string {
    const id = uuid();
    this.db.prepare(`
      INSERT INTO scan_result_sets (
        id, project_id, scan_id, run_label,
        adapter_type, source_name, source_fingerprint,
        app_version, ruleset_version, dalc_version,
        status, started_at, completed_at, duration_ms,
        total_findings, critical_count, major_count, minor_count, info_count,
        dalc_total_usd, dalc_base_usd, dalc_low_usd, dalc_high_usd,
        amplification_ratio, derived_approach,
        summary_json
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?
      )
    `).run(
      id, input.projectId, input.scanId ?? null, input.runLabel,
      input.adapterType, input.sourceName ?? null, input.sourceFingerprint ?? null,
      input.appVersion, input.rulesetVersion, input.dalcVersion,
      input.status ?? 'completed', input.startedAt, input.completedAt ?? null, input.durationMs ?? null,
      input.totalFindings, input.criticalCount, input.majorCount, input.minorCount, input.infoCount,
      input.dalcTotalUsd, input.dalcBaseUsd ?? null, input.dalcLowUsd ?? null, input.dalcHighUsd ?? null,
      input.amplificationRatio, input.derivedApproach ?? null,
      JSON.stringify(input.summary),
    );
    return id;
  }

  /**
   * Bulk-insert findings for a result set. Runs inside a transaction.
   */
  bulkInsertFindings(resultSetId: string, projectId: string, findings: NewResultFindingInput[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO result_findings (
        result_set_id, project_id,
        check_id, property, severity, raw_score,
        title, description,
        asset_type, asset_key, asset_name,
        affected_objects, total_objects, ratio,
        threshold_value, observed_value, metric_unit,
        remediation, evidence_json, cost_categories_json, cost_weights_json,
        confidence_level, confidence_score, explanation, why_it_matters
      ) VALUES (
        ?, ?,
        ?, ?, ?, ?,
        ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?
      )
    `);

    const insertMany = this.db.transaction((rows: NewResultFindingInput[]) => {
      for (const f of rows) {
        stmt.run(
          resultSetId, projectId,
          f.checkId, f.property, f.severity, f.rawScore,
          f.title, f.description ?? null,
          f.assetType ?? null, f.assetKey ?? null, f.assetName ?? null,
          f.affectedObjects, f.totalObjects, f.ratio,
          f.thresholdValue ?? null, f.observedValue ?? null, f.metricUnit ?? null,
          f.remediation ?? null,
          JSON.stringify(f.evidence ?? []),
          JSON.stringify(f.costCategories ?? []),
          JSON.stringify(f.costWeights ?? {}),
          f.confidenceLevel ?? null,
          f.confidenceScore ?? null,
          f.explanation ?? null,
          f.whyItMatters ?? null,
        );
      }
    });

    insertMany(findings);
  }

  // =========================================================================
  // READ — Single
  // =========================================================================

  /** Get a result set by its ID. */
  getResultSetById(id: string): ScanResultSetRow | undefined {
    return this.db.prepare(
      'SELECT * FROM scan_result_sets WHERE id = ?'
    ).get(id) as ScanResultSetRow | undefined;
  }

  /** Get findings for a result set, ordered by raw_score DESC. */
  getFindingsByResultSetId(resultSetId: string): ResultFindingRow[] {
    return this.db.prepare(
      'SELECT * FROM result_findings WHERE result_set_id = ? ORDER BY raw_score DESC'
    ).all(resultSetId) as ResultFindingRow[];
  }

  /** Get a single finding by its auto-increment ID. */
  getFindingById(findingId: number): ResultFindingRow | undefined {
    return this.db.prepare(
      'SELECT * FROM result_findings WHERE id = ?'
    ).get(findingId) as ResultFindingRow | undefined;
  }

  /** Get findings with parsed JSON fields. */
  getFindingsParsed(resultSetId: string): Array<ResultFindingRow & {
    evidence: unknown[];
    costCategories: string[];
    costWeights: Record<string, number>;
  }> {
    const rows = this.getFindingsByResultSetId(resultSetId);
    return rows.map(r => ({
      ...r,
      evidence: safeJsonParse(r.evidence_json, [], 'result_findings.evidence_json'),
      costCategories: safeJsonParse(r.cost_categories_json, [], 'result_findings.cost_categories_json'),
      costWeights: safeJsonParse(r.cost_weights_json, {}, 'result_findings.cost_weights_json'),
    }));
  }

  // =========================================================================
  // READ — Lists
  // =========================================================================

  /** List scan history for a project, newest first. */
  getScanHistoryForProject(projectId: string, limit: number = 50): ScanHistoryListItem[] {
    const rows = this.db.prepare(
      'SELECT * FROM scan_result_sets WHERE project_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(projectId, limit) as ScanResultSetRow[];

    return rows.map(rowToListItem);
  }

  /** Get the latest (most recent) result set for a project. */
  getLatestResultSetForProject(projectId: string): ScanResultSetRow | undefined {
    return this.db.prepare(
      'SELECT * FROM scan_result_sets WHERE project_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(projectId) as ScanResultSetRow | undefined;
  }

  /** Get the second-most-recent result set for a project (the "previous" run). */
  getPreviousResultSetForProject(projectId: string): ScanResultSetRow | undefined {
    return this.db.prepare(
      'SELECT * FROM scan_result_sets WHERE project_id = ? ORDER BY created_at DESC LIMIT 1 OFFSET 1'
    ).get(projectId) as ScanResultSetRow | undefined;
  }

  /** Get a result set by scan ID (each scan maps to at most one result set). */
  getResultSetByScanId(scanId: string): ScanResultSetRow | undefined {
    return this.db.prepare(
      'SELECT * FROM scan_result_sets WHERE scan_id = ?'
    ).get(scanId) as ScanResultSetRow | undefined;
  }

  // =========================================================================
  // DELETE
  // =========================================================================

  /** Delete a result set and cascade-delete its findings. */
  deleteResultSet(id: string): boolean {
    const result = this.db.prepare('DELETE FROM scan_result_sets WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // =========================================================================
  // CRITICALITY
  // =========================================================================

  /** Persist a criticality assessment summary for a result set. */
  saveCriticalityAssessment(resultSetId: string, summary: CriticalityAssessmentSummary): void {
    this.db.prepare(
      'UPDATE scan_result_sets SET criticality_json = ? WHERE id = ?'
    ).run(JSON.stringify(summary), resultSetId);
  }

  /** Load the criticality assessment for a result set, if any. */
  getCriticalityAssessment(resultSetId: string): CriticalityAssessmentSummary | null {
    const row = this.db.prepare(
      'SELECT criticality_json FROM scan_result_sets WHERE id = ?'
    ).get(resultSetId) as { criticality_json: string | null } | undefined;

    if (!row?.criticality_json) return null;
    return safeJsonParse(row.criticality_json, null, 'scan_result_sets.criticality_json');
  }

  // =========================================================================
  // METHODOLOGY
  // =========================================================================

  /** Persist a methodology summary for a result set. */
  saveMethodologySummary(resultSetId: string, summary: MethodologySummary): void {
    this.db.prepare(
      'UPDATE scan_result_sets SET methodology_json = ? WHERE id = ?'
    ).run(JSON.stringify(summary), resultSetId);
  }

  /** Load the methodology summary for a result set, if any. */
  getMethodologySummary(resultSetId: string): MethodologySummary | null {
    const row = this.db.prepare(
      'SELECT methodology_json FROM scan_result_sets WHERE id = ?'
    ).get(resultSetId) as { methodology_json: string | null } | undefined;

    if (!row?.methodology_json) return null;
    return safeJsonParse(row.methodology_json, null, 'scan_result_sets.methodology_json');
  }

  // =========================================================================
  // COMPARISON
  // =========================================================================

  /**
   * Compare the latest result set to the previous one for a project.
   * Returns null if no completed scans exist.
   *
   * Diff logic: compares findings by the (check_id, asset_key, severity) tuple.
   * - "added" = in latest but not in previous
   * - "removed" = in previous but not in latest
   * - "unchanged" = in both
   */
  compareLatestToPrevious(projectId: string): ScanSummaryComparison | null {
    const latest = this.getLatestResultSetForProject(projectId);
    if (!latest) return null;

    const latestItem = rowToListItem(latest);
    const previous = this.getPreviousResultSetForProject(projectId);

    if (!previous) {
      return {
        latest: latestItem,
        previous: null,
        delta: null,
        findingsDiff: null,
      };
    }

    const previousItem = rowToListItem(previous);

    // Helper: null-safe numeric delta — returns null if either operand is null
    const nullDelta = (a: number | null, b: number | null): number | null =>
      a != null && b != null ? a - b : null;

    // Numeric deltas
    const delta = {
      totalFindings: latest.total_findings - previous.total_findings,
      criticalCount: latest.critical_count - previous.critical_count,
      majorCount: latest.major_count - previous.major_count,
      minorCount: latest.minor_count - previous.minor_count,
      infoCount: latest.info_count - previous.info_count,
      dalcTotalUsd: latest.dalc_total_usd - previous.dalc_total_usd,
      dalcBaseUsd: nullDelta(latest.dalc_base_usd, previous.dalc_base_usd),
      dalcLowUsd: nullDelta(latest.dalc_low_usd, previous.dalc_low_usd),
      dalcHighUsd: nullDelta(latest.dalc_high_usd, previous.dalc_high_usd),
      amplificationRatio: latest.amplification_ratio - previous.amplification_ratio,
    };

    // Finding-level diff by (check_id, asset_key, severity) tuple
    const latestFindings = this.getFindingsByResultSetId(latest.id);
    const previousFindings = this.getFindingsByResultSetId(previous.id);

    const tupleKey = (f: ResultFindingRow): string =>
      `${f.check_id}|${f.asset_key ?? ''}|${f.severity}`;

    const latestSet = new Map<string, ResultFindingRow>();
    for (const f of latestFindings) latestSet.set(tupleKey(f), f);

    const previousSet = new Map<string, ResultFindingRow>();
    for (const f of previousFindings) previousSet.set(tupleKey(f), f);

    const added: FindingDiffEntry[] = [];
    const removed: FindingDiffEntry[] = [];
    let unchanged = 0;

    for (const [key, f] of latestSet) {
      if (previousSet.has(key)) {
        unchanged++;
      } else {
        added.push({
          checkId: f.check_id,
          severity: f.severity,
          assetKey: f.asset_key,
          title: f.title,
        });
      }
    }

    for (const [key, f] of previousSet) {
      if (!latestSet.has(key)) {
        removed.push({
          checkId: f.check_id,
          severity: f.severity,
          assetKey: f.asset_key,
          title: f.title,
        });
      }
    }

    return {
      latest: latestItem,
      previous: previousItem,
      delta,
      findingsDiff: { added, removed, unchanged },
    };
  }
}
