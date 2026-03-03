// =============================================================================
// DALC Scanner API Client
// =============================================================================

const BASE = '/api';

// ---------------------------------------------------------------------------
// Types — mirror server-side row types
// ---------------------------------------------------------------------------

export type Sector = 'mining' | 'environmental' | 'energy';
export type SeverityLevel = 'critical' | 'major' | 'minor' | 'info';

export interface Project {
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
  db_schemas: string;
  db_connection_uri: string | null;
  thresholds_json: string;
  created_at: string;
  updated_at: string;
  archived: number;
}

export interface CreateProjectInput {
  name: string;
  sector: Sector;
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

export interface Scan {
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
  // Joined fields from dashboard
  project_name?: string;
}

export interface Finding {
  id: number;
  scan_id: string;
  check_id: string;
  property: number;
  severity: SeverityLevel;
  raw_score: number;
  title: string;
  description: string | null;
  affected_objects: number;
  total_objects: number;
  ratio: number;
  remediation: string | null;
  evidence: Evidence[];
  costCategories: string[];
  costWeights: Record<string, number>;
}

export interface Evidence {
  schema: string;
  table: string;
  column?: string;
  detail: string;
  metadata?: Record<string, unknown>;
}

export interface DashboardStats {
  totalProjects: number;
  totalScans: number;
  recentScans: Scan[];
  averageCost: number | null;
}

// Strength — positive observation
export interface Strength {
  id: number;
  scan_id: string;
  check_id: string;
  property: number;
  title: string;
  description: string | null;
  detail: string | null;
  metric: string | null;
}

// Engine result types (parsed from engine_result_json)
export interface CostVector {
  firefighting: number;
  dataQuality: number;
  integration: number;
  productivity: number;
  regulatory: number;
}

export interface PropertyScore {
  propertyId: string;
  name: string;
  score: number;
  maturityLabel: string;
  totalCost: number;
  findingCosts: FindingCostResult[];
}

export interface FindingCostResult {
  id: string;
  severity: string;
  totalCost: number;
  categoryCosts: CostVector;
}

export interface YearProjection {
  year: number;
  doNothingCost: number;
  withCanonicalCost: number;
  cumulativeSaving: number;
}

export interface EngineResult {
  engineVersion: string;
  baseMaturity: number;
  disorderScore: number;
  adjustedMaturity: number;
  shannonEntropy: number;
  maxEntropy: number;
  baseCosts: CostVector;
  baseTotal: number;
  findingsAdjustment: CostVector;
  adjustedCosts: CostVector;
  adjustedTotal: number;
  amplifiedCosts: CostVector;
  amplifiedTotal: number;
  amplificationRatio: number;
  spectralRadius: number;
  sanityCapped: boolean;
  finalCosts: CostVector;
  finalTotal: number;
  propertyScores: PropertyScore[];
  overallMaturity: number;
  canonicalInvestment: number;
  withCanonicalTotal: number;
  annualSaving: number;
  paybackMonths: number;
  fiveYearProjection: YearProjection[];
  fiveYearCumulativeSaving: number;
  findingResults: FindingCostResult[];
  input: any;
  sectorConfig: any;
}

// SSE progress event
export interface ScanProgressEvent {
  scanId: string;
  status: 'running' | 'completed' | 'failed';
  progress: number;
  currentStep: string;
  message?: string;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export async function fetchDashboard(): Promise<DashboardStats> {
  return request('/dashboard');
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function fetchProjects(): Promise<Project[]> {
  return request('/projects');
}

export async function fetchProject(id: string): Promise<Project> {
  return request(`/projects/${id}`);
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  return request('/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateProject(
  id: string,
  updates: Partial<CreateProjectInput>,
): Promise<Project> {
  return request(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function deleteProject(id: string): Promise<void> {
  await fetch(`${BASE}/projects/${id}`, { method: 'DELETE' });
}

export async function fetchProjectScans(projectId: string): Promise<Scan[]> {
  return request(`/projects/${projectId}/scans`);
}

// ---------------------------------------------------------------------------
// Scans
// ---------------------------------------------------------------------------

export async function triggerScan(
  projectId: string,
  dryRun: boolean = false,
): Promise<{ scanId: string; status: string }> {
  return request('/scans', {
    method: 'POST',
    body: JSON.stringify({ projectId, dryRun }),
  });
}

export async function fetchScan(id: string): Promise<Scan> {
  return request(`/scans/${id}`);
}

export async function fetchFindings(
  scanId: string,
  property?: number,
): Promise<Finding[]> {
  const qs = property !== undefined ? `?property=${property}` : '';
  return request(`/scans/${scanId}/findings${qs}`);
}

export async function uploadCsvFiles(
  projectId: string,
  files: File[],
): Promise<{ scanId: string; status: string; fileCount: number; totalRows: number; tables: number; warnings: string[] }> {
  const formData = new FormData();
  formData.append('projectId', projectId);
  for (const file of files) {
    formData.append('files', file);
  }
  const res = await fetch(`${BASE}/scans/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  return res.json();
}

export async function fetchEngineResult(scanId: string): Promise<EngineResult> {
  return request(`/scans/${scanId}/result`);
}

export async function fetchStrengths(scanId: string): Promise<Strength[]> {
  return request(`/scans/${scanId}/strengths`);
}

export function getExportHtmlUrl(scanId: string): string {
  return `${BASE}/scans/${scanId}/export/html`;
}

// ---------------------------------------------------------------------------
// Transform Findings
// ---------------------------------------------------------------------------

export interface TransformEvidence {
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  detail: string;
  metadata?: Record<string, unknown>;
}

export interface TransformFinding {
  id: number;
  scan_id: string;
  check_id: string;
  category: 'semantic-drift' | 'ontological-break';
  severity: SeverityLevel;
  title: string;
  description: string | null;
  affected_mappings: number;
  total_mappings: number;
  ratio: number;
  remediation: string | null;
  evidence: TransformEvidence[];
  costCategories: string[];
  costWeights: Record<string, number>;
}

export interface TransformUploadResult {
  totalMappings: number;
  totalFindings: number;
  semanticDrift: number;
  ontologicalBreaks: number;
  critical: number;
  major: number;
  minor: number;
  fileCount: number;
  warnings: string[];
}

export async function uploadTransformFiles(
  scanId: string,
  files: File[],
): Promise<TransformUploadResult> {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }
  const res = await fetch(`${BASE}/scans/${scanId}/transform-upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  return res.json();
}

export interface PipelineUploadResult {
  totalMappings: number;
  totalFindings: number;
  driftFindings: number;
  gapFindings: number;
  critical: number;
  major: number;
  minor: number;
  sourceFormat: string;
  fileCount: number;
}

export async function uploadPipelineFiles(
  scanId: string,
  files: File[],
  pipelineType: 'stm' | 'dbt' | 'openlineage' = 'stm',
): Promise<PipelineUploadResult> {
  const formData = new FormData();
  formData.append('pipelineType', pipelineType);
  for (const file of files) {
    formData.append('files', file);
  }
  const res = await fetch(`${BASE}/scans/${scanId}/pipeline-upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  return res.json();
}

export async function fetchTransformFindings(
  scanId: string,
  category?: 'semantic-drift' | 'ontological-break',
): Promise<TransformFinding[]> {
  const qs = category ? `?category=${category}` : '';
  return request(`/scans/${scanId}/transform-findings${qs}`);
}

// ---------------------------------------------------------------------------
// SSE — scan progress stream
// ---------------------------------------------------------------------------

export function subscribeScanProgress(
  scanId: string,
  onEvent: (event: ScanProgressEvent) => void,
  onError?: (error: Event) => void,
): () => void {
  const es = new EventSource(`${BASE}/scans/${scanId}/progress`);

  es.onmessage = (e) => {
    try {
      const data: ScanProgressEvent = JSON.parse(e.data);
      onEvent(data);
      if (data.status === 'completed' || data.status === 'failed') {
        es.close();
      }
    } catch {
      // Ignore parse errors
    }
  };

  es.onerror = (e) => {
    onError?.(e);
    es.close();
  };

  return () => es.close();
}
