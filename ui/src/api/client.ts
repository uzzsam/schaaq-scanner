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

export function getExportPdfUrl(scanId: string): string {
  return `${BASE}/scans/${scanId}/export/pdf`;
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
// Settings (branding / white-label)
// ---------------------------------------------------------------------------

export async function fetchSettings(): Promise<Record<string, string>> {
  return request('/settings');
}

export async function updateSetting(key: string, value: string): Promise<void> {
  await request(`/settings/${key}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });
}

export async function uploadLogo(type: 'consultant' | 'client', file: File): Promise<void> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${BASE}/settings/logo/${type}`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
}

export async function deleteLogo(type: 'consultant' | 'client'): Promise<void> {
  const res = await fetch(`${BASE}/settings/logo/${type}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
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

// ---------------------------------------------------------------------------
// Scan Result Types (persistent scan history)
// ---------------------------------------------------------------------------

/** Lightweight list item for the scan history sidebar/table */
export interface ScanHistoryListItem {
  resultSetId: string;
  scanId: string | null;
  projectId: string;
  runLabel: string;
  adapterType: string;
  sourceName: string | null;
  appVersion: string;
  dalcVersion: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  totalFindings: number;
  criticalCount: number;
  majorCount: number;
  minorCount: number;
  infoCount: number;
  dalcTotalUsd: number;
  dalcBaseUsd: number | null;
  dalcLowUsd: number | null;
  dalcHighUsd: number | null;
  amplificationRatio: number;
  derivedApproach: string | null;
  createdAt: string;
}

export interface FindingDiffEntry {
  checkId: string;
  severity: string;
  assetKey: string | null;
  title: string;
}

/** Comparison between latest and previous scan */
export interface ScanSummaryComparison {
  latest: ScanHistoryListItem;
  previous: ScanHistoryListItem | null;
  delta: {
    totalFindings: number;
    criticalCount: number;
    majorCount: number;
    minorCount: number;
    infoCount: number;
    dalcTotalUsd: number;
    dalcBaseUsd: number | null;
    dalcLowUsd: number | null;
    dalcHighUsd: number | null;
    amplificationRatio: number;
  } | null;
  findingsDiff: {
    added: FindingDiffEntry[];
    removed: FindingDiffEntry[];
    unchanged: number;
  } | null;
}

/** Finding row from a persisted result set */
export interface ResultFinding {
  id: number;
  result_set_id: string;
  project_id: string;
  check_id: string;
  property: number;
  severity: SeverityLevel;
  raw_score: number;
  title: string;
  description: string | null;
  asset_type: string | null;
  asset_key: string | null;
  asset_name: string | null;
  affected_objects: number;
  total_objects: number;
  ratio: number;
  threshold_value: number | null;
  observed_value: number | null;
  metric_unit: string | null;
  remediation: string | null;
  evidence: unknown[];
  costCategories: string[];
  costWeights: Record<string, number>;
  // v11 evidence columns
  confidence_level: string | null;
  confidence_score: number | null;
  explanation: string | null;
  why_it_matters: string | null;
}

/** Sample evidence item from the evidence envelope */
export interface FindingSampleItem {
  label: string;
  value: string;
  context?: Record<string, string | number | boolean>;
}

/** Provenance info from the evidence envelope */
export interface FindingProvenanceInfo {
  adapterType: string;
  sourceName: string;
  sourceFingerprint?: string;
  extractedAt: string;
}

/** Methodology card attached to a finding for auditability */
export interface FindingMethodologyInfo {
  technique: 'deterministic' | 'heuristic' | 'statistical';
  methodology: string;
  assumptions: string[];
  limitations: string[];
  dataInputs: string[];
  references: string[];
}

/** UI-ready view model for a single finding's full evidence detail */
export interface FindingDetailViewModel {
  id: number;
  checkId: string;
  property: number;
  severity: string;
  title: string;
  description: string | null;
  assetType: string | null;
  assetKey: string | null;
  assetName: string | null;
  affectedObjects: number;
  totalObjects: number;
  ratio: number;
  ratioPercent: string;
  thresholdValue: number | null;
  observedValue: number | null;
  metricUnit: string | null;
  thresholdDisplay: string | null;
  whatWasFound: string | null;
  whyItMatters: string | null;
  howDetected: string | null;
  confidenceLevel: string | null;
  confidenceScore: number | null;
  confidenceReason: string | null;
  samples: FindingSampleItem[];
  provenance: FindingProvenanceInfo | null;
  remediation: string | null;
  costCategories: string[];
  costWeights: Record<string, number>;
  methodology: FindingMethodologyInfo | null;
}

/** Result set with parsed summary */
export interface ScanResultSet {
  id: string;
  project_id: string;
  scan_id: string | null;
  run_label: string;
  adapter_type: string;
  source_name: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  total_findings: number;
  critical_count: number;
  major_count: number;
  minor_count: number;
  info_count: number;
  dalc_total_usd: number;
  dalc_base_usd: number | null;
  dalc_low_usd: number | null;
  dalc_high_usd: number | null;
  amplification_ratio: number;
  derived_approach: string | null;
  summary: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Scan Results API
// ---------------------------------------------------------------------------

export async function fetchScanHistory(
  projectId: string,
  limit: number = 50,
): Promise<{ items: ScanHistoryListItem[]; total: number }> {
  return request(`/scan-results/project/${projectId}/history?limit=${limit}`);
}

export async function fetchScanComparison(
  projectId: string,
): Promise<ScanSummaryComparison> {
  return request(`/scan-results/project/${projectId}/comparison`);
}

export async function fetchResultSetById(
  id: string,
): Promise<ScanResultSet> {
  return request(`/scan-results/${id}`);
}

export async function fetchResultSetByScanId(
  scanId: string,
): Promise<ScanResultSet> {
  return request(`/scan-results/by-scan/${scanId}`);
}

export async function fetchResultFindings(
  resultSetId: string,
): Promise<{ resultSetId: string; findings: ResultFinding[] }> {
  return request(`/scan-results/${resultSetId}/findings`);
}

export async function fetchResultFindingsDetail(
  resultSetId: string,
): Promise<{ resultSetId: string; findings: FindingDetailViewModel[] }> {
  return request(`/scan-results/${resultSetId}/findings-detail`);
}

export async function fetchFindingDetail(
  findingId: number,
): Promise<FindingDetailViewModel> {
  return request(`/scan-results/findings/${findingId}`);
}

// ---------------------------------------------------------------------------
// Remediation Plan
// ---------------------------------------------------------------------------

export type RemediationEffortBand = 'S' | 'M' | 'L';
export type RemediationOwnerType =
  | 'data-engineer'
  | 'data-architect'
  | 'data-steward'
  | 'dba'
  | 'analytics-engineer'
  | 'compliance-officer';
export type RemediationConfidenceLevel = 'high' | 'medium' | 'low';
export type RemediationSequenceGroup = 1 | 2 | 3;

export interface RemediationAction {
  id: string;
  resultSetId: string;
  title: string;
  description: string;
  rationale: string;
  theme: string;
  relatedFindingIds: string[];
  relatedFindingCodes: string[];
  affectedAssets: number;
  priorityRank: number;
  priorityScore: number;
  severityWeight: number;
  estimatedImpactUsd: { low: number; base: number; high: number };
  effortBand: RemediationEffortBand;
  likelyOwnerType: RemediationOwnerType;
  sequenceGroup: RemediationSequenceGroup;
  blockedByActionIds: string[];
  quickWin: boolean;
  confidenceLevel: RemediationConfidenceLevel;
  explanation: string;
}

export interface RemediationPlan {
  resultSetId: string;
  generatedAt: string;
  actions: RemediationAction[];
  totalEstimatedImpactUsd: { low: number; base: number; high: number };
  quickWinCount: number;
  sequenceGroups: Array<{
    group: RemediationSequenceGroup;
    label: string;
    actionIds: string[];
  }>;
}

export async function fetchRemediationPlan(
  resultSetId: string,
): Promise<RemediationPlan> {
  return request(`/scan-results/${resultSetId}/remediation-plan`);
}

// ---------------------------------------------------------------------------
// Criticality Assessment
// ---------------------------------------------------------------------------

export type CriticalityTier = 'low' | 'medium' | 'high' | 'critical';

export const CRITICALITY_TIER_LABELS: Record<CriticalityTier, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export const CRITICALITY_TIER_COLORS: Record<CriticalityTier, string> = {
  low: '#6b7280',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
};

export type CriticalitySignalType =
  | 'naming-convention' | 'constraint-density' | 'reference-target'
  | 'column-count' | 'index-coverage' | 'pii-pattern'
  | 'financial-pattern' | 'audit-pattern' | 'soft-delete-pattern'
  | 'junction-table' | 'enum-lookup' | 'null-ratio'
  | 'finding-severity-load' | 'relationship-centrality' | 'schema-position';

export interface CriticalitySignal {
  signalType: CriticalitySignalType;
  signalLabel: string;
  weight: number;
  value: number;
  evidence: string;
}

export type CdeReasonType =
  | 'pii-name-match' | 'financial-name-match' | 'regulatory-name-match'
  | 'high-uniqueness' | 'fk-target-column' | 'primary-key' | 'low-null-high-use';

export interface CdeCandidate {
  columnKey: string;
  columnName: string;
  tableKey: string;
  tableName: string;
  schemaName: string;
  reasons: CdeReasonType[];
  rationale: string;
  confidenceLevel: 'high' | 'medium' | 'low';
}

export interface AssetCriticalityRecord {
  assetKey: string;
  assetName: string;
  assetType: 'table' | 'schema';
  sourceSystem: string;
  criticalityScore: number;
  criticalityTier: CriticalityTier;
  cdeCandidate: boolean;
  cdeCandidates: CdeCandidate[];
  signals: CriticalitySignal[];
  rationale: string;
  confidenceLevel: 'high' | 'medium' | 'low';
}

export interface CriticalityAssessmentSummary {
  resultSetId: string;
  assessedAt: string;
  totalAssetsAssessed: number;
  tierDistribution: Record<CriticalityTier, number>;
  totalCdeCandidates: number;
  topCriticalAssets: AssetCriticalityRecord[];
  allAssets: AssetCriticalityRecord[];
  allCdeCandidates: CdeCandidate[];
  averageCriticalityScore: number;
  methodDescription: string;
}

export async function fetchCriticalityAssessment(
  resultSetId: string,
): Promise<CriticalityAssessmentSummary | null> {
  try {
    return await request(`/scan-results/${resultSetId}/criticality`);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Methodology Summary
// ---------------------------------------------------------------------------

export type AssumptionSourceType = 'empirical' | 'expert_estimated' | 'client_configured' | 'inferred' | 'system_default';
export type MaterialityLevel = 'high' | 'medium' | 'low';
export type MethodologyConfidenceLevel = 'high' | 'medium' | 'low' | 'very_low';
export type ConfidenceArea = 'detection' | 'coverage' | 'economic' | 'criticality';

export interface AssumptionRecord {
  id: string;
  category: string;
  assumption: string;
  sourceType: AssumptionSourceType;
  materialityLevel: MaterialityLevel;
  currentValue: string;
  affectedOutputs: string[];
}

export interface CoverageGapRecord {
  id: string;
  category: string;
  description: string;
  impact: string;
  mitigationHint: string;
}

export interface ConfidenceAssessmentRecord {
  area: ConfidenceArea;
  confidenceLevel: MethodologyConfidenceLevel;
  rationale: string;
  keyDrivers: string[];
}

export interface ScanCoverageSummary {
  totalTables: number;
  totalColumns: number;
  schemaCount: number;
  checksRun: number;
  checksAvailable: number;
  propertiesCovered: number[];
  hasPipelineMapping: boolean;
  hasExternalLineage: boolean;
  adapterType: string;
}

export interface MethodologySummary {
  version: string;
  generatedAt: string;
  assumptions: AssumptionRecord[];
  coverageGaps: CoverageGapRecord[];
  confidenceAssessments: ConfidenceAssessmentRecord[];
  scanCoverage: ScanCoverageSummary;
  overallConfidence: MethodologyConfidenceLevel;
  overallConfidenceRationale: string;
}

export async function fetchMethodologySummary(
  resultSetId: string,
): Promise<MethodologySummary | null> {
  try {
    return await request(`/scan-results/${resultSetId}/methodology`);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Trend & Regression Types
// ---------------------------------------------------------------------------

export type TrendDirection = 'improving' | 'worsening' | 'stable' | 'insufficient_data';
export type FindingDeltaStatus = 'new' | 'resolved' | 'worsened' | 'improved' | 'unchanged';

export interface TrendPoint {
  resultSetId: string;
  runLabel: string;
  timestamp: string;
  value: number;
}

export interface DalcTrendPoint extends TrendPoint {
  lowUsd: number;
  baseUsd: number;
  highUsd: number;
}

export interface DalcTrendSeries {
  points: DalcTrendPoint[];
  direction: TrendDirection;
  latestBaseUsd: number;
  earliestBaseUsd: number;
  percentChange: number | null;
}

export interface PropertyTrendRecord {
  property: number;
  propertyName: string;
  series: TrendPoint[];
  direction: TrendDirection;
  latestFindingCount: number;
  previousFindingCount: number | null;
  latestBySeverity: Record<string, number>;
}

export interface FindingDeltaRecord {
  status: FindingDeltaStatus;
  checkId: string;
  assetKey: string | null;
  title: string;
  property: number;
  currentSeverity: string;
  previousSeverity: string | null;
  currentRawScore: number;
  previousRawScore: number | null;
}

export interface RegressionSummary {
  targetResultSetId: string;
  baselineResultSetId: string;
  targetLabel: string;
  baselineLabel: string;
  targetTimestamp: string;
  baselineTimestamp: string;
  counts: {
    new: number;
    resolved: number;
    worsened: number;
    improved: number;
    unchanged: number;
    total: number;
  };
  deltas: FindingDeltaRecord[];
  topRegressions: FindingDeltaRecord[];
  topImprovements: FindingDeltaRecord[];
  dalcDelta: {
    baselineLowUsd: number;
    baselineBaseUsd: number;
    baselineHighUsd: number;
    targetLowUsd: number;
    targetBaseUsd: number;
    targetHighUsd: number;
    changeLowUsd: number;
    changeBaseUsd: number;
    changeHighUsd: number;
    percentChange: number | null;
  };
  overallDirection: TrendDirection;
}

export interface HistoricalComparisonWindow {
  projectId: string;
  windowSize: number;
  resultSets: Array<{
    resultSetId: string;
    runLabel: string;
    timestamp: string;
    totalFindings: number;
    criticalCount: number;
    majorCount: number;
    dalcBaseUsd: number;
    dalcLowUsd: number;
    dalcHighUsd: number;
  }>;
  dalcTrend: DalcTrendSeries;
  propertyTrends: PropertyTrendRecord[];
  regressionVsBaseline: RegressionSummary | null;
  regressionVsPrevious: RegressionSummary | null;
}

// ---------------------------------------------------------------------------
// Trend & Regression Fetch Functions
// ---------------------------------------------------------------------------

export async function fetchTrendWindow(
  projectId: string,
  windowSize: number = 10,
): Promise<HistoricalComparisonWindow | null> {
  try {
    return await request(`/scan-results/project/${projectId}/trend?window=${windowSize}`);
  } catch {
    return null;
  }
}

export async function fetchRegressionSummary(
  targetResultSetId: string,
  baselineResultSetId: string,
): Promise<RegressionSummary | null> {
  try {
    return await request(`/scan-results/${targetResultSetId}/regression/${baselineResultSetId}`);
  } catch {
    return null;
  }
}

// ===========================================================================
// Benchmark / Comparative Context Types
// ===========================================================================

export type BenchmarkPosition = 'below_range' | 'within_range' | 'above_range' | 'unknown';
export type PropertyBenchmarkPosition = 'better_than_range' | 'near_range' | 'worse_than_range' | 'unknown';

export interface BenchmarkMetric {
  key: string;
  label: string;
  low: number;
  high: number;
  unit: string;
  lowerIsBetter: boolean;
}

export interface BenchmarkPack {
  id: string;
  name: string;
  description: string;
  sector: string;
  version: string;
  calibratedAt: string;
  dalcBaseUsd: BenchmarkMetric;
  totalFindings: BenchmarkMetric;
  highSeverityFindings: BenchmarkMetric;
  highSeverityDensity: BenchmarkMetric;
  propertyFindings: Record<number, BenchmarkMetric>;
  methodNote: string;
}

export interface BenchmarkComparisonRecord {
  metric: BenchmarkMetric;
  actualValue: number;
  position: BenchmarkPosition;
  message: string;
  percentFromRange: number | null;
}

export interface PropertyBenchmarkComparison {
  property: number;
  propertyName: string;
  actualFindingCount: number;
  benchmarkLow: number;
  benchmarkHigh: number;
  position: PropertyBenchmarkPosition;
  message: string;
}

export interface ProjectBaselineComparison {
  baselineAvailable: boolean;
  baselineResultSetId: string | null;
  baselineLabel: string | null;
  baselineTimestamp: string | null;
  dalcDirection: TrendDirection;
  dalcDirectionLabel: string;
  dalcPercentChange: number | null;
  findingCountDirection: TrendDirection;
  findingCountDirectionLabel: string;
  findingCountDelta: number | null;
  highSeverityDirection: TrendDirection;
  highSeverityDirectionLabel: string;
  highSeverityDelta: number | null;
}

export interface BenchmarkSummary {
  packId: string;
  packName: string;
  packSector: string;
  packVersion: string;
  overallPosition: BenchmarkPosition;
  overallMessage: string;
  dalcComparison: BenchmarkComparisonRecord;
  totalFindingsComparison: BenchmarkComparisonRecord;
  highSeverityComparison: BenchmarkComparisonRecord;
  highSeverityDensityComparison: BenchmarkComparisonRecord;
  propertyComparisons: PropertyBenchmarkComparison[];
  baselineComparison: ProjectBaselineComparison | null;
  keyMessages: string[];
}

export const BENCHMARK_POSITION_COLORS: Record<BenchmarkPosition, string> = {
  below_range: '#27AE60',
  within_range: '#3498DB',
  above_range: '#E74C3C',
  unknown: '#95A5A6',
};

export const BENCHMARK_POSITION_LABELS: Record<BenchmarkPosition, string> = {
  below_range: 'Better Than Expected',
  within_range: 'Within Expected Range',
  above_range: 'Worse Than Expected',
  unknown: 'Insufficient Data',
};

export const PROPERTY_POSITION_COLORS: Record<PropertyBenchmarkPosition, string> = {
  better_than_range: '#27AE60',
  near_range: '#3498DB',
  worse_than_range: '#E74C3C',
  unknown: '#95A5A6',
};

export const PROPERTY_POSITION_LABELS: Record<PropertyBenchmarkPosition, string> = {
  better_than_range: 'Better',
  near_range: 'Near Expected',
  worse_than_range: 'Worse',
  unknown: 'Unknown',
};

// ---------------------------------------------------------------------------
// Benchmark Fetch Functions
// ---------------------------------------------------------------------------

export async function fetchBenchmarkPacks(): Promise<BenchmarkPack[]> {
  try {
    const data = await request<{ packs: BenchmarkPack[] }>('/scan-results/benchmark-packs');
    return data.packs;
  } catch {
    return [];
  }
}

export async function fetchBenchmarkComparison(
  resultSetId: string,
  packId?: string,
  sector?: string,
): Promise<BenchmarkSummary | null> {
  try {
    const params = new URLSearchParams();
    if (packId) params.set('packId', packId);
    if (sector) params.set('sector', sector);
    const qs = params.toString();
    return await request(`/scan-results/${resultSetId}/benchmark-comparison${qs ? `?${qs}` : ''}`);
  } catch {
    return null;
  }
}

export async function fetchBaselineComparison(
  resultSetId: string,
): Promise<ProjectBaselineComparison | null> {
  try {
    return await request(`/scan-results/${resultSetId}/baseline-comparison`);
  } catch {
    return null;
  }
}

// ===========================================================================
// Blast-Radius Graph Types
// ===========================================================================

export type BlastRadiusNodeType = 'property' | 'costCategory';
export type BlastRadiusSeverityDistribution = Record<'critical' | 'major' | 'minor' | 'info', number>;

export interface BlastRadiusNode {
  id: string;
  type: BlastRadiusNodeType;
  label: string;
  totalImpactUsd: number;
  findingCount: number;
  severityDistribution: BlastRadiusSeverityDistribution;
  key: string | number;
}

export interface BlastRadiusEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  property: number;
  costCategory: string;
  weightUsd: number;
  findingCount: number;
  severityDistribution: BlastRadiusSeverityDistribution;
  shareOfTotal: number;
}

export interface BlastRadiusGraph {
  nodes: BlastRadiusNode[];
  edges: BlastRadiusEdge[];
  totalImpactUsd: number;
  totalEdgeCount: number;
  totalFindingCount: number;
}

export interface BlastRadiusHotEdge {
  property: number;
  propertyName: string;
  costCategory: string;
  costCategoryLabel: string;
  weightUsd: number;
  shareOfTotal: number;
  findingCount: number;
  topSeverity: string;
}

export interface BlastRadiusSummary {
  totalImpactUsd: number;
  totalEdgeCount: number;
  totalPropertyNodesActive: number;
  totalCostCategoryNodesActive: number;
  topHotEdges: BlastRadiusHotEdge[];
  concentrationRatio: number;
  keyMessage: string;
}

export interface BlastRadiusDetail {
  edges: Array<{
    property: number;
    propertyName: string;
    costCategory: string;
    costCategoryLabel: string;
    weightUsd: number;
    shareOfTotal: number;
    findingCount: number;
  }>;
  propertyTotals: Array<{
    property: number;
    propertyName: string;
    totalUsd: number;
    findingCount: number;
  }>;
  categoryTotals: Array<{
    category: string;
    categoryLabel: string;
    totalUsd: number;
    findingCount: number;
  }>;
}

export interface BlastRadiusResponse {
  resultSetId: string;
  graph: BlastRadiusGraph;
  summary: BlastRadiusSummary;
  detail: BlastRadiusDetail;
}

// ---------------------------------------------------------------------------
// Blast-Radius Fetch
// ---------------------------------------------------------------------------

export async function fetchBlastRadius(
  resultSetId: string,
): Promise<BlastRadiusResponse | null> {
  try {
    return await request(`/scan-results/${resultSetId}/blast-radius`);
  } catch {
    return null;
  }
}

// =============================================================================
// Assessment Manifest Types
// =============================================================================

export interface ManifestVersionInfo {
  appVersion: string;
  dalcVersion: string;
  rulesetVersion: string;
  schemaVersion: number;
}

export interface ManifestRunMetadata {
  resultSetId: string;
  scanId: string | null;
  runLabel: string;
  adapterType: string;
  sourceName: string | null;
  sourceFingerprint: string | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  durationLabel: string | null;
}

export interface ManifestScanCoverage {
  totalFindings: number;
  criticalCount: number;
  majorCount: number;
  minorCount: number;
  infoCount: number;
  propertiesCovered: number;
  totalProperties: number;
  dalcTotalUsd: number;
  dalcBaseUsd: number | null;
  dalcLowUsd: number | null;
  dalcHighUsd: number | null;
  amplificationRatio: number;
  derivedApproach: string | null;
}

export interface ManifestComponentAvailability {
  coreFindings: boolean;
  criticalityAssessment: boolean;
  methodologySummary: boolean;
  trendDataAvailable: boolean;
  benchmarkAvailable: boolean;
  blastRadiusAvailable: boolean;
  remediationAvailable: boolean;
}

export interface AssessmentManifest {
  manifestVersion: string;
  generatedAt: string;
  versions: ManifestVersionInfo;
  run: ManifestRunMetadata;
  coverage: ManifestScanCoverage;
  components: ManifestComponentAvailability;
}

// ---------------------------------------------------------------------------
// Assessment Manifest Fetch
// ---------------------------------------------------------------------------

export async function fetchManifest(
  resultSetId: string,
): Promise<AssessmentManifest | null> {
  try {
    return await request(`/scan-results/${resultSetId}/manifest`);
  } catch {
    return null;
  }
}
