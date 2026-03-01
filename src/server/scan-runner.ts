import type { Repository } from './db/repository';
import type { DatabaseAdapter, SchemaData } from '../adapters/types';
import type { ScannerConfig, Finding } from '../checks/types';
import type { PipelineMapping } from '../types/pipeline';
import { ALL_CHECKS } from '../checks/index';
import { checkMappingDrift } from '../checks/p1-mapping-drift';
import { checkLineageGaps } from '../checks/p4-lineage-gaps';
import { scoreFindings } from '../scoring/severity-scorer';
import { mapToEngineInput } from '../scoring/mapper';
import { calculateDALC } from '../engine/index';
import { createMockSchema } from '../mock/schema-factory';
import { EventEmitter } from 'events';

export interface ScanProgress {
  scanId: string;
  status: 'running' | 'completed' | 'failed';
  progress: number;        // 0.0 - 1.0
  currentStep: string;
  message?: string;
  data?: any;
}

export class ScanRunner extends EventEmitter {
  constructor(private repo: Repository) {
    super();
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
        this.emitProgress(scanId, 0.1, 'Extracting Schema', 'Using mock schema data (dry-run)');
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

      // --- Step 6: Persist results ---
      this.emitProgress(scanId, 0.90, 'Saving', 'Persisting findings and results...');

      // Store findings
      this.repo.insertFindings(scanId, scored.findings);

      // Compute severity counts
      const severityCounts = { critical: 0, major: 0, minor: 0, info: 0 };
      for (const f of scored.findings) {
        if (f.severity in severityCounts) {
          severityCounts[f.severity as keyof typeof severityCounts]++;
        }
      }

      // Get total cost from engine result
      const totalCost = result.finalTotal;
      const amplificationRatio = result.amplificationRatio;

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

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      this.emitProgress(scanId, 1.0, 'Complete',
        `Scan complete in ${elapsed}s — ${scored.findings.length} findings, estimated annual cost: $${(totalCost / 1_000_000).toFixed(1)}M`);

    } catch (error: any) {
      this.repo.failScan(scanId, error.message ?? String(error));
      this.emitProgress(scanId, -1, 'Failed', error.message ?? String(error));
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
