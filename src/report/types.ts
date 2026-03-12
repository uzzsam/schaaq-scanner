/**
 * Two-Layer Report System — Type Definitions
 *
 * Executive Board Pack: concise, decision-oriented, CFO/board audience
 * Technical Appendix: evidence-backed, auditable, data architect audience
 */

import type { ReportData } from './generator';
import type { RemediationAction } from '../remediation/types';
import type { CriticalityTier } from '../criticality/types';
import type { CheckMethodology } from '../checks/methodology-register';
import type { MethodologySummary } from '../methodology/types';
import type { TrendDirection, FindingDeltaStatus } from '../trend/types';
import type { BenchmarkSummary } from '../benchmark/types';
import type { BlastRadiusSummary, BlastRadiusDetail } from '../blast-radius/types';

// =============================================================================
// Methodology Register Entry (for report templates)
// =============================================================================

export interface MethodologyRegisterEntry extends CheckMethodology {
  propertyName: string;
}

// =============================================================================
// Remediation Priority
// =============================================================================

export type EffortBand = 'Quick Win' | 'Medium' | 'Major';

export interface RemediationPriority {
  rank: number;
  findingTitle: string;
  checkId: string;
  property: number;
  propertyName: string;
  severity: string;
  severityColor: string;
  actionText: string;           // first sentence of finding.remediation
  businessImpact: string;       // from whyItMatters or description
  effortBand: EffortBand;
  estimatedWeeks: string;       // '1-2' | '2-4' | '4-8'
  sequencingNote: string | null; // "After P1 remediation" etc.
}

// =============================================================================
// Trend Summary (for executive report)
// =============================================================================

export interface ReportTrendSummary {
  /** Overall direction from latest vs previous regression. */
  overallDirection: TrendDirection;
  /** Human-readable label for the direction. */
  directionLabel: string;
  /** CSS color for the direction indicator. */
  directionColor: string;
  /** DALC trend direction. */
  dalcDirection: TrendDirection;
  dalcDirectionLabel: string;
  dalcDirectionColor: string;
  /** DALC percentage change across the trend window. Null if insufficient data. */
  dalcPercentChange: number | null;
  /** Number of scans in the trend window. */
  windowSize: number;
  /** Finding delta counts (latest vs previous). */
  deltaCounts: {
    new: number;
    resolved: number;
    worsened: number;
    improved: number;
    unchanged: number;
  };
}

// =============================================================================
// Regression Detail (for technical report)
// =============================================================================

export interface ReportRegressionDetail {
  targetLabel: string;
  baselineLabel: string;
  targetTimestamp: string;
  baselineTimestamp: string;
  overallDirection: TrendDirection;
  directionLabel: string;
  directionColor: string;
  deltaCounts: {
    new: number;
    resolved: number;
    worsened: number;
    improved: number;
    unchanged: number;
    total: number;
  };
  topRegressions: Array<{
    checkId: string;
    title: string;
    property: number;
    propertyName: string;
    status: FindingDeltaStatus;
    statusLabel: string;
    currentSeverity: string;
    previousSeverity: string | null;
    severityColor: string;
  }>;
  topImprovements: Array<{
    checkId: string;
    title: string;
    property: number;
    propertyName: string;
    status: FindingDeltaStatus;
    statusLabel: string;
    currentSeverity: string;
    previousSeverity: string | null;
    severityColor: string;
  }>;
  dalcDelta: {
    baselineBaseUsd: number;
    targetBaseUsd: number;
    changeBaseUsd: number;
    percentChange: number | null;
  };
}

// =============================================================================
// Executive Report Data (extends ReportData)
// =============================================================================

export interface ExecutiveReportData extends ReportData {
  reportMode: 'executive';
  topRisks: ReportData['findings'];           // top 3-5, critical/major only, sorted by rawScore desc
  remediationPriorities: RemediationPriority[]; // max 10 (legacy per-finding)
  remediationActions: RemediationAction[];      // grouped remediation actions from planner
  methodLimits: string[];                      // static disclaimers
  methodologyRegister: MethodologyRegisterEntry[]; // full methodology cards
  coverageSummary: string;                     // e.g. "21 checks across 8 properties"
  // Result-set level methodology summary (optional — available after methodology build)
  methodologySummary?: MethodologySummary;
  // Trend summary (optional — available when >=2 scans exist for the project)
  trendSummary?: ReportTrendSummary;
  // Benchmark comparison (optional — available when benchmark pack is loaded)
  benchmarkSummary?: BenchmarkSummary;
  // Blast-radius summary (optional — executive key message + top 3 hot edges)
  blastRadiusSummary?: BlastRadiusSummary;
  // Asset criticality summary (optional — available when criticality engine ran)
  criticalitySummary?: {
    totalAssetsAssessed: number;
    totalCdeCandidates: number;
    averageCriticalityScore: number;
    tierDistribution: Record<CriticalityTier, number>;
    topCriticalAssets: Array<{
      assetName: string;
      criticalityTier: CriticalityTier;
      tierColor: string;
      tierLabel: string;
      cdeCandidate: boolean;
    }>;
  };
}

// =============================================================================
// Technical Appendix Data (extends ReportData)
// =============================================================================

export interface TechnicalAppendixData extends ReportData {
  reportMode: 'technical';
  remediationActions: RemediationAction[];      // grouped remediation actions from planner
  methodologyRegister: MethodologyRegisterEntry[]; // full methodology cards for all checks
  // Result-set level methodology summary (optional — full detail for technical audience)
  methodologySummary?: MethodologySummary;
  // Trend summary (optional — condensed for header)
  trendSummary?: ReportTrendSummary;
  // Benchmark comparison (optional — available when benchmark pack is loaded)
  benchmarkSummary?: BenchmarkSummary;
  // Blast-radius summary + detail (optional — full edge table for technical audience)
  blastRadiusSummary?: BlastRadiusSummary;
  blastRadiusDetail?: BlastRadiusDetail;
  // Regression detail (optional — full regression analysis for technical audience)
  regressionDetail?: ReportRegressionDetail;
  // Reproducibility & audit trail (optional — manifest-derived)
  manifestSummary?: {
    manifestVersion: string;
    generatedAt: string;
    schemaVersion: number;
    status: string;
    componentAvailability: Array<{ label: string; available: boolean }>;
    propertiesCovered: number;
    totalProperties: number;
    amplificationRatio: number;
    resultSetId: string;
  };
  // Full criticality assessment (optional — richer detail for technical audience)
  criticalityDetail?: {
    totalAssetsAssessed: number;
    totalCdeCandidates: number;
    averageCriticalityScore: number;
    tierDistribution: Record<CriticalityTier, number>;
    topCriticalAssets: Array<{
      assetName: string;
      assetType: string;
      criticalityScore: number;
      criticalityTier: CriticalityTier;
      tierColor: string;
      tierLabel: string;
      cdeCandidate: boolean;
    }>;
  };
  assessmentMetadata: {
    appVersion: string;
    rulesetVersion: string;
    dalcVersion: string;
    adapterType: string;
    scanDuration?: string;
    startedAt?: string;
    completedAt?: string;
    totalChecksRun: number;
    totalStrengths: number;
  };
  findingsByProperty: Array<{
    propertyNumber: number;
    propertyName: string;
    propertyScore: number;
    maturityLabel: string;
    findings: ReportData['findings'];
  }>;
  dalcExplanation: {
    dalcLowUsd: number;
    dalcBaseUsd: number;
    dalcHighUsd: number;
    spectralRadius: number;
    amplificationRatio: number;
    shannonEntropy: number;
    maxEntropy: number;
    baseTotal: number;
    adjustedTotal: number;
    amplifiedTotal: number;
    sanityCapped: boolean;
  };
  coverageDetail: {
    schemasScanned: number;
    tablesScanned: number;
    columnsScanned: number;
    checksRun: number;
    checksWithFindings: number;
    propertiesCovered: number;
  };
}
