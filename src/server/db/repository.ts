import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { encrypt, decrypt } from './crypto';
import { safeJsonParse } from '../../utils/safe-json';

// --- Project types ---
export interface ProjectRow {
  id: string;
  name: string;
  sector: string;
  revenue_aud: number;
  total_fte: number;
  data_engineers: number;
  avg_salary_aud: number;
  avg_fte_salary_aud: number;
  ai_budget_aud: number;
  csrd_in_scope: number;
  canonical_investment_aud: number;
  db_type: string;
  db_host: string | null;
  db_port: number | null;
  db_name: string | null;
  db_username: string | null;
  db_password: string | null;
  db_ssl: number;
  db_schemas: string;          // JSON array
  db_connection_uri: string | null;
  thresholds_json: string;     // JSON object
  created_at: string;
  updated_at: string;
  archived: number;
}

export interface CreateProjectInput {
  name: string;
  sector: 'mining' | 'environmental' | 'energy';
  revenueAUD: number;
  totalFTE: number;
  dataEngineers: number;
  avgSalaryAUD: number;
  avgFTESalaryAUD: number;
  aiBudgetAUD?: number;
  csrdInScope?: boolean;
  canonicalInvestmentAUD?: number;
  database?: {
    type: string;
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    ssl?: boolean;
    schemas?: string[];
    connectionUri?: string;
  };
  thresholds?: Record<string, unknown>;
}

export interface ScanRow {
  id: string;
  project_id: string;
  status: string;
  progress: number;
  current_step: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  config_snapshot: string;
  schema_tables: number | null;
  schema_columns: number | null;
  schema_count: number | null;
  db_version: string | null;
  engine_input_json: string | null;
  engine_result_json: string | null;
  total_findings: number;
  critical_count: number;
  major_count: number;
  minor_count: number;
  info_count: number;
  total_cost: number | null;
  amplification_ratio: number | null;
  derived_approach: string | null;
  source: string;
  transform_total: number;
  transform_sd_count: number;
  transform_ob_count: number;
  transform_critical: number;
  transform_major: number;
  transform_minor: number;
  transform_mappings: number;
  created_at: string;
  is_dry_run: number;
}

export class Repository {
  constructor(private db: Database.Database) {}

  // =========================================================================
  // CREDENTIAL ENCRYPTION HELPERS
  // =========================================================================

  /** Encrypt a credential value before storing. Returns null passthrough. */
  private encryptCredential(value: string | null | undefined): string | null {
    if (value == null || value === '') return value as string | null;
    return encrypt(value);
  }

  /** Decrypt credential fields on a ProjectRow after reading from DB. */
  private decryptProjectRow(row: ProjectRow): ProjectRow {
    return {
      ...row,
      db_password: row.db_password ? decrypt(row.db_password) : null,
      db_connection_uri: row.db_connection_uri ? decrypt(row.db_connection_uri) : null,
    };
  }

  // =========================================================================
  // PROJECTS
  // =========================================================================

  createProject(input: CreateProjectInput): ProjectRow {
    const id = uuid();
    const stmt = this.db.prepare(`
      INSERT INTO projects (
        id, name, sector, revenue_aud, total_fte, data_engineers,
        avg_salary_aud, avg_fte_salary_aud, ai_budget_aud,
        csrd_in_scope, canonical_investment_aud,
        db_type, db_host, db_port, db_name, db_username, db_password,
        db_ssl, db_schemas, db_connection_uri, thresholds_json
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?
      )
    `);

    const dbConfig = input.database;
    stmt.run(
      id, input.name, input.sector, input.revenueAUD, input.totalFTE, input.dataEngineers,
      input.avgSalaryAUD, input.avgFTESalaryAUD, input.aiBudgetAUD ?? input.revenueAUD * 0.005,
      input.csrdInScope ? 1 : 0, input.canonicalInvestmentAUD ?? 1_350_000,
      dbConfig?.type ?? 'postgresql',
      dbConfig?.host ?? null,
      dbConfig?.port ?? null,
      dbConfig?.database ?? null,
      dbConfig?.username ?? null,
      this.encryptCredential(dbConfig?.password ?? null),
      dbConfig?.ssl ? 1 : 0,
      JSON.stringify(dbConfig?.schemas ?? ['public']),
      this.encryptCredential(dbConfig?.connectionUri ?? null),
      JSON.stringify(input.thresholds ?? {}),
    );

    return this.getProject(id)!;
  }

  getProject(id: string): ProjectRow | undefined {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ? AND archived = 0').get(id) as ProjectRow | undefined;
    return row ? this.decryptProjectRow(row) : undefined;
  }

  listProjects(): ProjectRow[] {
    const rows = this.db.prepare('SELECT * FROM projects WHERE archived = 0 ORDER BY updated_at DESC').all() as ProjectRow[];
    return rows.map(row => this.decryptProjectRow(row));
  }

  updateProject(id: string, updates: Partial<CreateProjectInput>): ProjectRow | undefined {
    // Build dynamic SET clause from provided fields
    const setClauses: string[] = ["updated_at = datetime('now')"];
    const values: any[] = [];

    if (updates.name !== undefined) { setClauses.push('name = ?'); values.push(updates.name); }
    if (updates.sector !== undefined) { setClauses.push('sector = ?'); values.push(updates.sector); }
    if (updates.revenueAUD !== undefined) { setClauses.push('revenue_aud = ?'); values.push(updates.revenueAUD); }
    if (updates.totalFTE !== undefined) { setClauses.push('total_fte = ?'); values.push(updates.totalFTE); }
    if (updates.dataEngineers !== undefined) { setClauses.push('data_engineers = ?'); values.push(updates.dataEngineers); }
    if (updates.avgSalaryAUD !== undefined) { setClauses.push('avg_salary_aud = ?'); values.push(updates.avgSalaryAUD); }
    if (updates.avgFTESalaryAUD !== undefined) { setClauses.push('avg_fte_salary_aud = ?'); values.push(updates.avgFTESalaryAUD); }
    if (updates.aiBudgetAUD !== undefined) { setClauses.push('ai_budget_aud = ?'); values.push(updates.aiBudgetAUD); }
    if (updates.csrdInScope !== undefined) { setClauses.push('csrd_in_scope = ?'); values.push(updates.csrdInScope ? 1 : 0); }
    if (updates.canonicalInvestmentAUD !== undefined) { setClauses.push('canonical_investment_aud = ?'); values.push(updates.canonicalInvestmentAUD); }

    if (updates.database) {
      const d = updates.database;
      if (d.type !== undefined) { setClauses.push('db_type = ?'); values.push(d.type); }
      if (d.host !== undefined) { setClauses.push('db_host = ?'); values.push(d.host); }
      if (d.port !== undefined) { setClauses.push('db_port = ?'); values.push(d.port); }
      if (d.database !== undefined) { setClauses.push('db_name = ?'); values.push(d.database); }
      if (d.username !== undefined) { setClauses.push('db_username = ?'); values.push(d.username); }
      if (d.password !== undefined) { setClauses.push('db_password = ?'); values.push(this.encryptCredential(d.password)); }
      if (d.ssl !== undefined) { setClauses.push('db_ssl = ?'); values.push(d.ssl ? 1 : 0); }
      if (d.schemas !== undefined) { setClauses.push('db_schemas = ?'); values.push(JSON.stringify(d.schemas)); }
      if (d.connectionUri !== undefined) { setClauses.push('db_connection_uri = ?'); values.push(this.encryptCredential(d.connectionUri)); }
    }

    if (updates.thresholds !== undefined) {
      setClauses.push('thresholds_json = ?');
      values.push(JSON.stringify(updates.thresholds));
    }

    values.push(id);
    this.db.prepare(`UPDATE projects SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);

    return this.getProject(id);
  }

  archiveProject(id: string): void {
    this.db.prepare("UPDATE projects SET archived = 1, updated_at = datetime('now') WHERE id = ?").run(id);
  }

  // =========================================================================
  // SCANS
  // =========================================================================

  createScan(projectId: string, configSnapshot: object, isDryRun: boolean = false, source: string = 'database'): ScanRow {
    const id = uuid();
    this.db.prepare(`
      INSERT INTO scans (id, project_id, config_snapshot, is_dry_run, source, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `).run(id, projectId, JSON.stringify(configSnapshot), isDryRun ? 1 : 0, source);

    return this.getScan(id)!;
  }

  getScan(id: string): ScanRow | undefined {
    return this.db.prepare('SELECT * FROM scans WHERE id = ?').get(id) as ScanRow | undefined;
  }

  listScans(projectId: string): ScanRow[] {
    return this.db.prepare(
      'SELECT * FROM scans WHERE project_id = ? ORDER BY created_at DESC'
    ).all(projectId) as ScanRow[];
  }

  updateScanStatus(id: string, updates: {
    status?: string;
    progress?: number;
    currentStep?: string;
    errorMessage?: string;
    startedAt?: string;
    completedAt?: string;
  }): void {
    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.status !== undefined) { setClauses.push('status = ?'); values.push(updates.status); }
    if (updates.progress !== undefined) { setClauses.push('progress = ?'); values.push(updates.progress); }
    if (updates.currentStep !== undefined) { setClauses.push('current_step = ?'); values.push(updates.currentStep); }
    if (updates.errorMessage !== undefined) { setClauses.push('error_message = ?'); values.push(updates.errorMessage); }
    if (updates.startedAt !== undefined) { setClauses.push('started_at = ?'); values.push(updates.startedAt); }
    if (updates.completedAt !== undefined) { setClauses.push('completed_at = ?'); values.push(updates.completedAt); }

    if (setClauses.length === 0) return;
    values.push(id);
    this.db.prepare(`UPDATE scans SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
  }

  completeScan(id: string, data: {
    engineInput: object;
    engineResult: object;
    totalFindings: number;
    criticalCount: number;
    majorCount: number;
    minorCount: number;
    infoCount: number;
    totalCost: number;
    amplificationRatio: number;
    derivedApproach: string;
    schemaTables: number;
    schemaColumns: number;
    schemaCount: number;
    dbVersion?: string;
  }): void {
    this.db.prepare(`
      UPDATE scans SET
        status = 'completed',
        completed_at = datetime('now'),
        engine_input_json = ?,
        engine_result_json = ?,
        total_findings = ?,
        critical_count = ?,
        major_count = ?,
        minor_count = ?,
        info_count = ?,
        total_cost = ?,
        amplification_ratio = ?,
        derived_approach = ?,
        schema_tables = ?,
        schema_columns = ?,
        schema_count = ?,
        db_version = ?,
        progress = 1.0,
        current_step = 'Complete'
      WHERE id = ?
    `).run(
      JSON.stringify(data.engineInput),
      JSON.stringify(data.engineResult),
      data.totalFindings,
      data.criticalCount,
      data.majorCount,
      data.minorCount,
      data.infoCount,
      data.totalCost,
      data.amplificationRatio,
      data.derivedApproach,
      data.schemaTables,
      data.schemaColumns,
      data.schemaCount,
      data.dbVersion ?? null,
      id,
    );
  }

  failScan(id: string, errorMessage: string): void {
    this.db.prepare(`
      UPDATE scans SET
        status = 'failed',
        completed_at = datetime('now'),
        error_message = ?,
        current_step = 'Failed'
      WHERE id = ?
    `).run(errorMessage, id);
  }

  // =========================================================================
  // FINDINGS
  // =========================================================================

  insertFindings(scanId: string, findings: any[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO scan_findings (
        scan_id, check_id, property, severity, raw_score,
        title, description, affected_objects, total_objects, ratio,
        remediation, evidence_json, cost_categories_json, cost_weights_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((rows: any[]) => {
      for (const f of rows) {
        stmt.run(
          scanId, f.checkId, f.property, f.severity, f.rawScore,
          f.title, f.description ?? null,
          f.affectedObjects ?? 0, f.totalObjects ?? 0, f.ratio ?? 0,
          f.remediation ?? null,
          JSON.stringify(f.evidence ?? []),
          JSON.stringify(f.costCategories ?? []),
          JSON.stringify(f.costWeights ?? {}),
        );
      }
    });

    insertMany(findings);
  }

  getFindings(scanId: string): any[] {
    const rows = this.db.prepare(
      'SELECT * FROM scan_findings WHERE scan_id = ? ORDER BY raw_score DESC'
    ).all(scanId) as any[];

    return rows.map(r => ({
      ...r,
      evidence: safeJsonParse(r.evidence_json ?? '[]', [], 'scan_findings.evidence_json'),
      costCategories: safeJsonParse(r.cost_categories_json ?? '[]', [], 'scan_findings.cost_categories_json'),
      costWeights: safeJsonParse(r.cost_weights_json ?? '{}', {}, 'scan_findings.cost_weights_json'),
    }));
  }

  getFindingsByProperty(scanId: string, property: number): any[] {
    const rows = this.db.prepare(
      'SELECT * FROM scan_findings WHERE scan_id = ? AND property = ? ORDER BY raw_score DESC'
    ).all(scanId, property) as any[];

    return rows.map(r => ({
      ...r,
      evidence: safeJsonParse(r.evidence_json ?? '[]', [], 'scan_findings.evidence_json'),
      costCategories: safeJsonParse(r.cost_categories_json ?? '[]', [], 'scan_findings.cost_categories_json'),
      costWeights: safeJsonParse(r.cost_weights_json ?? '{}', {}, 'scan_findings.cost_weights_json'),
    }));
  }

  // =========================================================================
  // TRANSFORM FINDINGS
  // =========================================================================

  insertTransformFindings(scanId: string, findings: any[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO transform_findings (
        scan_id, check_id, category, severity,
        title, description, affected_mappings, total_mappings, ratio,
        remediation, evidence_json, cost_categories_json, cost_weights_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((rows: any[]) => {
      for (const f of rows) {
        stmt.run(
          scanId, f.checkId, f.category, f.severity,
          f.title, f.description ?? null,
          f.affectedMappings ?? 0, f.totalMappings ?? 0, f.ratio ?? 0,
          f.remediation ?? null,
          JSON.stringify(f.evidence ?? []),
          JSON.stringify(f.costCategories ?? []),
          JSON.stringify(f.costWeights ?? {}),
        );
      }
    });

    insertMany(findings);
  }

  getTransformFindings(scanId: string): any[] {
    const rows = this.db.prepare(
      'SELECT * FROM transform_findings WHERE scan_id = ? ORDER BY severity, check_id'
    ).all(scanId) as any[];

    return rows.map(r => ({
      ...r,
      evidence: safeJsonParse(r.evidence_json ?? '[]', [], 'transform_findings.evidence_json'),
      costCategories: safeJsonParse(r.cost_categories_json ?? '[]', [], 'transform_findings.cost_categories_json'),
      costWeights: safeJsonParse(r.cost_weights_json ?? '{}', {}, 'transform_findings.cost_weights_json'),
    }));
  }

  getTransformFindingsByCategory(scanId: string, category: string): any[] {
    const rows = this.db.prepare(
      'SELECT * FROM transform_findings WHERE scan_id = ? AND category = ? ORDER BY severity, check_id'
    ).all(scanId, category) as any[];

    return rows.map(r => ({
      ...r,
      evidence: safeJsonParse(r.evidence_json ?? '[]', [], 'transform_findings.evidence_json'),
      costCategories: safeJsonParse(r.cost_categories_json ?? '[]', [], 'transform_findings.cost_categories_json'),
      costWeights: safeJsonParse(r.cost_weights_json ?? '{}', {}, 'transform_findings.cost_weights_json'),
    }));
  }

  updateScanTransformSummary(scanId: string, data: {
    transformTotal: number;
    transformSdCount: number;
    transformObCount: number;
    transformCritical: number;
    transformMajor: number;
    transformMinor: number;
    transformMappings: number;
  }): void {
    this.db.prepare(`
      UPDATE scans SET
        transform_total = ?,
        transform_sd_count = ?,
        transform_ob_count = ?,
        transform_critical = ?,
        transform_major = ?,
        transform_minor = ?,
        transform_mappings = ?
      WHERE id = ?
    `).run(
      data.transformTotal,
      data.transformSdCount,
      data.transformObCount,
      data.transformCritical,
      data.transformMajor,
      data.transformMinor,
      data.transformMappings,
      scanId,
    );
  }

  // =========================================================================
  // PIPELINE MAPPINGS
  // =========================================================================

  insertPipelineMapping(scanId: string, data: {
    sourceFormat: string;
    extractedAt: string;
    mappingsJson: string;
    metadataJson: string;
  }): void {
    this.db.prepare(`
      INSERT INTO pipeline_mappings (scan_id, source_format, extracted_at, mappings_json, metadata_json)
      VALUES (?, ?, ?, ?, ?)
    `).run(scanId, data.sourceFormat, data.extractedAt, data.mappingsJson, data.metadataJson);
  }

  getPipelineMapping(scanId: string): any | null {
    const row = this.db.prepare(
      'SELECT * FROM pipeline_mappings WHERE scan_id = ? ORDER BY created_at DESC LIMIT 1'
    ).get(scanId) as any;
    if (!row) return null;
    return {
      ...row,
      mappings: safeJsonParse(row.mappings_json, [], 'pipeline_mappings.mappings_json'),
      metadata: safeJsonParse(row.metadata_json ?? '{}', {}, 'pipeline_mappings.metadata_json'),
    };
  }

  // =========================================================================
  // DASHBOARD STATS
  // =========================================================================

  getDashboardStats(): {
    totalProjects: number;
    totalScans: number;
    recentScans: ScanRow[];
    averageCost: number | null;
  } {
    const totalProjects = (this.db.prepare('SELECT COUNT(*) as c FROM projects WHERE archived = 0').get() as any).c;
    const totalScans = (this.db.prepare("SELECT COUNT(*) as c FROM scans WHERE status = 'completed'").get() as any).c;
    const recentScans = this.db.prepare(`
      SELECT s.*, p.name as project_name
      FROM scans s JOIN projects p ON s.project_id = p.id
      WHERE s.status = 'completed'
      ORDER BY s.completed_at DESC LIMIT 5
    `).all() as ScanRow[];
    const avgRow = this.db.prepare(
      "SELECT AVG(total_cost) as avg FROM scans WHERE status = 'completed' AND total_cost IS NOT NULL"
    ).get() as any;

    return {
      totalProjects,
      totalScans,
      recentScans,
      averageCost: avgRow?.avg ?? null,
    };
  }
}
