import type { Repository } from './db/repository';
import type { DatabaseAdapter, SchemaData } from '../adapters/types';
import type { ScannerConfig, Finding } from '../checks/types';
import type { PipelineMapping } from '../types/pipeline';
import type { ScanResultRepository } from './db/scan-result-repository';
import type { NewResultFindingInput } from './db/scan-result-types';
import { ALL_CHECKS, computeStrengths } from '../checks/index';
import { checkMappingDrift } from '../checks/p1-mapping-drift';
import { checkLineageGaps } from '../checks/p4-lineage-gaps';
import { scoreFindings } from '../scoring/severity-scorer';
import { mapToEngineInput } from '../scoring/mapper';
import { calculateDALC } from '../engine/index';
import { ENGINE_VERSION } from '../engine/constants';
import { createMockSchema } from '../mock/schema-factory';
import { EventEmitter } from 'events';
import { buildFindingEvidence } from '../checks/evidence-builder';
import type { ScanContext } from '../checks/evidence-builder';
import type { FindingEvidence } from '../checks/finding-evidence';
import { assessCriticality } from '../criticality';
import { buildMethodologySummary } from '../methodology';
import type { MethodologyBuilderInput } from '../methodology';

export interface ScanProgress {
  scanId: string;
  status: 'running' | 'completed' | 'failed';
  progress: number;        // 0.0 - 1.0
  currentStep: string;
  message?: string;
  data?: any;
}

export class ScanRunner extends EventEmitter {
  private scanResultRepo: ScanResultRepository | null = null;

  constructor(private repo: Repository) {
    super();
  }

  /** Attach the persistent scan-result repository (optional — degrades gracefully). */
  setScanResultRepo(scanResultRepo: ScanResultRepository): void {
    this.scanResultRepo = scanResultRepo;
  }

  /**
   * Run a full scan. Emits 'progress' events throughout.
   * Can run with a real database adapter or mock data (dry-run).
   */
  async run(
    scanId: string,
    config: ScannerConfig,
    adapter: DatabaseAdapter | null,
    isDryRun: boolean = false,
    schemaDataOverride?: SchemaData,
    pipelineMapping?: PipelineMapping,
  ): Promise<void> {
    const startTime = Date.now();

    try {
      this.emitProgress(scanId, 0.0, 'Initialising', 'Starting scan...');
      this.repo.updateScanStatus(scanId, {
        status: 'running',
        startedAt: new Date().toISOString(),
        progress: 0,
        currentStep: 'Initialising',
      });

      // --- Step 1: Extract schema ---
      let schemaData: SchemaData;

      if (schemaDataOverride) {
        this.emitProgress(scanId, 0.1, 'Extracting Schema', 'Using uploaded CSV/Excel data');
        schemaData = schemaDataOverride;
      } else if (isDryRun || !adapter) {
        const reason = isDryRun ? 'dry-run mode' : 'no database adapter configured';
        console.warn(`[ScanRunner] Scan ${scanId}: using mock schema data (${reason})`);
        this.emitProgress(scanId, 0.1, 'Extracting Schema', `Using mock schema data (${reason})`);
        schemaData = createMockSchema();
      } else {
        this.emitProgress(scanId, 0.05, 'Connecting', 'Connecting to database...');
        await adapter.connect();

        this.emitProgress(scanId, 0.1, 'Checking Statistics', 'Verifying database statistics freshness...');
        const freshness = await adapter.checkStatsFreshness();
        if (freshness.stale) {
          this.emitProgress(scanId, 0.12, 'Warning', `Stats stale: ${freshness.warning}`);
        }

        this.emitProgress(scanId, 0.15, 'Extracting Schema', 'Reading tables, columns, constraints, indexes...');
        schemaData = await adapter.extractSchema();
        await adapter.disconnect();
      }

      const totalTables = schemaData.tables.filter(t => t.type === 'table').length;
      const totalColumns = schemaData.columns.length;
      const schemaCount = new Set(schemaData.tables.map(t => t.schema)).size;

      this.emitProgress(scanId, 0.25, 'Schema Extracted',
        `Found ${totalTables} tables, ${totalColumns} columns across ${schemaCount} schemas`);

      // --- Step 2: Run checks ---
      const allFindings: Finding[] = [];
      const totalChecks = ALL_CHECKS.length;

      for (let i = 0; i < totalChecks; i++) {
        const check = ALL_CHECKS[i];
        const checkProgress = 0.25 + (i / totalChecks) * 0.40;  // 0.25 -> 0.65
        this.emitProgress(scanId, checkProgress,
          `Running Check ${i + 1}/${totalChecks}`,
          `${check.id}: ${check.name}`);

        this.repo.updateScanStatus(scanId, {
          progress: checkProgress,
          currentStep: `${check.id}: ${check.name}`,
        });

        const findings = check.execute(schemaData, config);
        allFindings.push(...findings);
      }

      this.emitProgress(scanId, 0.65, 'Checks Complete',
        `Found ${allFindings.length} findings across ${new Set(allFindings.map(f => f.property)).size} properties`);

      // --- Step 2b: Run pipeline checks (if pipeline mapping provided) ---
      let pipelineFindings: any[] = [];
      if (pipelineMapping && pipelineMapping.mappings.length > 0) {
        this.emitProgress(scanId, 0.67, 'Pipeline Checks', 'Running pipeline mapping analysis...');

        const driftFindings = checkMappingDrift(pipelineMapping);
        const gapFindings = checkLineageGaps(pipelineMapping, schemaData);
        pipelineFindings = [...driftFindings, ...gapFindings];

        if (pipelineFindings.length > 0) {
          this.repo.insertTransformFindings(scanId, pipelineFindings.map(f => ({
            ...f,
            category: f.category ?? 'mapping-drift',
          })));

          const driftCount = driftFindings.length;
          const gapCount = gapFindings.length;
          const criticalCount = pipelineFindings.filter(f => f.severity === 'critical').length;
          const majorCount = pipelineFindings.filter(f => f.severity === 'major').length;
          const minorCount = pipelineFindings.filter(f => f.severity === 'minor').length;

          this.repo.updateScanTransformSummary(scanId, {
            transformTotal: pipelineFindings.length,
            transformSdCount: driftCount,
            transformObCount: gapCount,
            transformCritical: criticalCount,
            transformMajor: majorCount,
            transformMinor: minorCount,
            transformMappings: pipelineMapping.mappings.length,
          });
        }

        this.emitProgress(scanId, 0.69, 'Pipeline Checks Complete',
          `Found ${pipelineFindings.length} pipeline findings across ${pipelineMapping.mappings.length} mappings`);
      }

      // --- Step 3: Score findings ---
      this.emitProgress(scanId, 0.70, 'Scoring', 'Computing severity scores...');
      const scored = scoreFindings(allFindings, schemaData);

      // --- Step 4: Map to engine input ---
      this.emitProgress(scanId, 0.75, 'Mapping', 'Converting findings to cost engine input...');
      const engineInput = mapToEngineInput(scored, schemaData, config);

      // --- Step 5: Calculate costs ---
      this.emitProgress(scanId, 0.80, 'Calculating', 'Running cost engine...');
      const result = calculateDALC(engineInput);

      // --- Step 5b: Compute strengths ---
      this.emitProgress(scanId, 0.85, 'Strengths', 'Detecting positive observations...');
      const strengths = computeStrengths(schemaData, config, scored.findings);

      // --- Step 6: Persist results ---
      this.emitProgress(scanId, 0.90, 'Saving', 'Persisting findings and results...');

      // Store findings
      this.repo.insertFindings(scanId, scored.findings);

      // Store strengths
      if (strengths.length > 0) {
        this.repo.insertStrengths(scanId, strengths);
      }

      // Compute severity counts
      const severityCounts = { critical: 0, major: 0, minor: 0, info: 0 };
      for (const f of scored.findings) {
        if (f.severity in severityCounts) {
          severityCounts[f.severity as keyof typeof severityCounts]++;
        }
      }

      // Get total cost from engine result — derive low/base/high bands
      const totalCost = result.finalTotal;
      const amplificationRatio = result.amplificationRatio;

      // DALC range derivation (from existing engine layers):
      //   low  = adjustedTotal  (direct cost, before Leontief amplification)
      //   base = finalTotal     (canonical DALC figure, amplified + sanity-bounded)
      //   high = amplifiedTotal (full amplification, before sanity caps)
      const dalcLowUsd  = result.adjustedTotal;
      const dalcBaseUsd = result.finalTotal;
      const dalcHighUsd = result.amplifiedTotal;

      this.repo.completeScan(scanId, {
        engineInput,
        engineResult: result,
        totalFindings: scored.findings.length,
        criticalCount: severityCounts.critical,
        majorCount: severityCounts.major,
        minorCount: severityCounts.minor,
        infoCount: severityCounts.info,
        totalCost,
        amplificationRatio,
        derivedApproach: engineInput.modellingApproach,
        schemaTables: totalTables,
        schemaColumns: totalColumns,
        schemaCount,
        dbVersion: schemaData.databaseVersion,
      });

      // --- Step 7: Persist immutable result set (scan history) ---
      if (this.scanResultRepo) {
        try {
          this.emitProgress(scanId, 0.95, 'Archiving', 'Persisting immutable result set...');

          const scanRow = this.repo.getScan(scanId);
          const projectId = scanRow?.project_id ?? '';
          const adapterType = scanRow?.source ?? (isDryRun ? 'dry-run' : 'unknown');

          const completedAt = new Date().toISOString();
          const durationMs = Date.now() - startTime;

          const resultSetId = this.scanResultRepo.createScanResultSet({
            projectId,
            scanId,
            runLabel: `Scan ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
            adapterType,
            sourceName: schemaData.databaseVersion ?? undefined,
            appVersion: '3.7.1',
            rulesetVersion: '1.0',
            dalcVersion: ENGINE_VERSION,
            status: 'completed',
            startedAt: new Date(startTime).toISOString(),
            completedAt,
            durationMs,
            totalFindings: scored.findings.length,
            criticalCount: severityCounts.critical,
            majorCount: severityCounts.major,
            minorCount: severityCounts.minor,
            infoCount: severityCounts.info,
            dalcTotalUsd: totalCost,
            dalcBaseUsd,
            dalcLowUsd,
            dalcHighUsd,
            amplificationRatio,
            derivedApproach: engineInput.modellingApproach,
            summary: {
              schemaTables: totalTables,
              schemaColumns: totalColumns,
              schemaCount,
              dbVersion: schemaData.databaseVersion,
              pipelineFindings: pipelineFindings.length,
              strengthsCount: strengths.length,
            },
          });

          // Build scan context for evidence builder
          const scanCtx: ScanContext = {
            appVersion: '3.7.1',
            rulesetVersion: '1.0',
            adapterType,
            sourceName: schemaData.databaseVersion ?? adapterType,
            scanStartedAt: new Date(startTime).toISOString(),
          };

          // Map scored findings to NewResultFindingInput[]
          const resultFindings: NewResultFindingInput[] = scored.findings.map((f: Finding) => {
            // Build structured evidence if detector provided evidenceInput
            let evidenceEnvelope: FindingEvidence | null = null;
            let confidenceLevel: string | undefined;
            let confidenceScore: number | undefined;
            let explanation: string | undefined;
            let whyItMatters: string | undefined;

            if (f.evidenceInput) {
              // Find the check name from ALL_CHECKS
              const checkDef = ALL_CHECKS.find(c => c.id === f.checkId);
              evidenceEnvelope = buildFindingEvidence({
                ...f.evidenceInput,
                checkId: f.checkId,
                property: f.property,
                checkName: checkDef?.name ?? f.checkId,
                severity: f.severity,
              }, scanCtx);

              confidenceLevel = evidenceEnvelope.confidence.level;
              confidenceScore = evidenceEnvelope.confidence.score;
              explanation = evidenceEnvelope.explanation.whatWasFound;
              whyItMatters = evidenceEnvelope.explanation.whyItMatters;
            }

            // Merge structured evidence into legacy evidence array for backward compat
            const evidenceArray = evidenceEnvelope
              ? [evidenceEnvelope, ...(f.evidence ?? [])]
              : (f.evidence ?? []);

            return {
              checkId: f.checkId,
              property: f.property,
              severity: f.severity,
              rawScore: f.rawScore,
              title: f.title,
              description: f.description,
              assetType: f.evidenceInput?.asset?.type ?? undefined,
              assetKey: f.evidenceInput?.asset?.key ?? f.evidence?.[0]?.table ?? undefined,
              assetName: f.evidenceInput?.asset?.name ?? f.evidence?.[0]?.table ?? undefined,
              affectedObjects: f.affectedObjects,
              totalObjects: f.totalObjects,
              ratio: f.ratio,
              thresholdValue: f.evidenceInput?.threshold?.value ?? undefined,
              observedValue: f.evidenceInput?.metric?.observed ?? undefined,
              metricUnit: f.evidenceInput?.metric?.unit ?? undefined,
              remediation: f.remediation,
              evidence: evidenceArray,
              costCategories: f.costCategories ?? [],
              costWeights: f.costWeights ?? {},
              confidenceLevel,
              confidenceScore,
              explanation,
              whyItMatters,
            };
          });

          this.scanResultRepo.bulkInsertFindings(resultSetId, projectId, resultFindings);

          // --- Step 7b: Run criticality assessment ---
          try {
            const persistedFindings = this.scanResultRepo.getFindingsByResultSetId(resultSetId);
            const sourceName = schemaData.databaseVersion ?? adapterType;
            const criticalitySummary = assessCriticality({
              resultSetId,
              findings: persistedFindings,
              sourceSystem: sourceName,
            });
            this.scanResultRepo.saveCriticalityAssessment(resultSetId, criticalitySummary);
          } catch (critErr: any) {
            console.warn(`[ScanRunner] Criticality assessment failed for ${scanId}:`, critErr.message);
          }

          // --- Step 7c: Build methodology summary ---
          try {
            const criticalityData = this.scanResultRepo.getCriticalityAssessment(resultSetId);
            const methodologyInput: MethodologyBuilderInput = {
              checksRun: totalChecks,
              checksAvailable: ALL_CHECKS.length,
              propertiesCovered: [...new Set(scored.findings.map((f: Finding) => f.property))].sort(),
              totalTables,
              totalColumns,
              schemaCount,
              adapterType,
              hasPipelineMapping: !!(pipelineMapping && pipelineMapping.mappings.length > 0),
              hasExternalLineage: false,
              isDryRun: isDryRun || !adapter,
              totalFindings: scored.findings.length,
              severityCounts,
              highSeverityWithEvidence: scored.findings.filter(
                (f: Finding) => (f.severity === 'critical' || f.severity === 'major') && f.evidenceInput
              ).length,
              totalHighSeverity: severityCounts.critical + severityCounts.major,
              derivedApproach: engineInput.modellingApproach,
              configuredThresholds: {
                entitySimilarityThreshold: config.thresholds?.entitySimilarityThreshold,
                nullRateThreshold: config.thresholds?.nullRateThreshold,
                canonicalInvestmentAUD: config.organisation?.canonicalInvestmentAUD,
              },
              criticalityContext: {
                wasRun: !!criticalityData,
                totalAssetsAssessed: criticalityData?.totalAssetsAssessed ?? 0,
                signalTypesUsed: criticalityData
                  ? new Set(criticalityData.allAssets?.flatMap(
                      (a: any) => (a.signals ?? []).map((s: any) => s.signalType)
                    ) ?? []).size
                  : 0,
                cdeIdentificationMethod: criticalityData
                  ? (criticalityData.methodDescription?.includes('naming') ? 'naming-heuristic' : 'signal-composite')
                  : 'none',
                tierDistribution: criticalityData?.tierDistribution ?? {},
              },
            };

            const methodologySummary = buildMethodologySummary(methodologyInput);
            this.scanResultRepo.saveMethodologySummary(resultSetId, methodologySummary);
          } catch (methErr: any) {
            console.warn(`[ScanRunner] Methodology summary failed for ${scanId}:`, methErr.message);
          }
        } catch (archiveErr: any) {
          // Non-fatal — the scan itself succeeded, result archiving is best-effort
          console.warn(`[ScanRunner] Failed to archive result set for scan ${scanId}:`, archiveErr.message);
        }
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      this.emitProgress(scanId, 1.0, 'Complete',
        `Scan complete in ${elapsed}s — ${scored.findings.length} findings, estimated annual cost: $${(totalCost / 1_000_000).toFixed(1)}M`);

    } catch (error: any) {
      this.repo.failScan(scanId, error.message ?? String(error));
      this.emitProgress(scanId, -1, 'Failed', error.message ?? String(error));

      // Persist a failed result set so history captures the attempt
      if (this.scanResultRepo) {
        try {
          const scanRow = this.repo.getScan(scanId);
          const projectId = scanRow?.project_id ?? '';
          const adapterType = scanRow?.source ?? (isDryRun ? 'dry-run' : 'unknown');
          const failedAt = new Date().toISOString();

          this.scanResultRepo.createScanResultSet({
            projectId,
            scanId,
            runLabel: `Scan ${failedAt.slice(0, 16).replace('T', ' ')} (failed)`,
            adapterType,
            appVersion: '3.7.1',
            rulesetVersion: '1.0',
            dalcVersion: ENGINE_VERSION,
            status: 'failed',
            startedAt: new Date(startTime).toISOString(),
            completedAt: failedAt,
            durationMs: Date.now() - startTime,
            totalFindings: 0,
            criticalCount: 0,
            majorCount: 0,
            minorCount: 0,
            infoCount: 0,
            dalcTotalUsd: 0,
            amplificationRatio: 0,
            summary: { error: error.message ?? String(error) },
          });
        } catch (archiveErr: unknown) {
          // Best-effort — don't mask the original error
          const msg = archiveErr instanceof Error ? archiveErr.message : String(archiveErr);
          console.warn(`[ScanRunner] Failed to archive failed result set for scan ${scanId}:`, msg);
        }
      }

      throw error;
    }
  }

  private emitProgress(scanId: string, progress: number, currentStep: string, message: string): void {
    const event: ScanProgress = {
      scanId,
      status: progress >= 1.0 ? 'completed' : progress < 0 ? 'failed' : 'running',
      progress: Math.max(0, Math.min(1, progress)),
      currentStep,
      message,
    };
    this.emit('progress', event);
  }
}
