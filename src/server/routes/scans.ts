import { Router } from 'express';
import multer from 'multer';
import type { Repository, ProjectRow } from '../db/repository';
import type { ScanRunner } from '../scan-runner';
import type { ScannerConfig } from '../../checks/types';
import type { Response as ExpressResponse } from 'express';
import { buildReportData, generateReport } from '../../report/generator';
import { parseCsvFiles, type CsvFile } from '../../adapters/csv-adapter';
import { parsePowerBITemplate } from '../../adapters/powerbi-adapter';
import { parseTableauWorkbook } from '../../adapters/tableau-adapter';
import { parseTransformFiles, runTransformChecks, type TransformFile } from '../../transforms/index';
import { parseStmFiles, type StmFile } from '../../adapters/stm-adapter';
import { parseDbtManifest } from '../../adapters/dbt-adapter';
import { parseOpenLineageEvents } from '../../adapters/openlineage-adapter';
import { checkMappingDrift } from '../../checks/p1-mapping-drift';
import { checkLineageGaps } from '../../checks/p4-lineage-gaps';
import type { SchemaData } from '../../adapters/types';
import type { PipelineMapping } from '../../types/pipeline';
import { safeError } from '../middleware/safe-error';
import { safeJsonParse } from '../../utils/safe-json';
import { validateBody, validateQuery } from '../middleware/validate';
import {
  validateUploadedFiles,
  SCHEMA_UPLOAD_CONFIG,
  PIPELINE_UPLOAD_CONFIG,
} from '../middleware/validate-upload';
import {
  triggerScanSchema,
  uploadScanBodySchema,
  pipelineUploadBodySchema,
  findingsQuerySchema,
  transformFindingsQuerySchema,
} from '../schemas';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 50 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.csv', '.tsv', '.xlsx', '.xls', '.pbit', '.twb', '.twbx'];
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    if (ext && allowed.includes(`.${ext}`)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: .${ext}. Allowed: ${allowed.join(', ')}`));
    }
  },
});

const pipelineUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.csv', '.tsv', '.json'];
    const ext = file.originalname.split('.').pop()?.toLowerCase();
    if (ext && allowed.includes(`.${ext}`)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported pipeline file type: .${ext}. Allowed: ${allowed.join(', ')}`));
    }
  },
});

export function scanRoutes(
  repo: Repository,
  scanRunner: ScanRunner,
  sseConnections: Map<string, Set<ExpressResponse>>,
): Router {
  const router = Router();

  // Get scan details
  router.get('/:id', (req, res) => {
    try {
      const scan = repo.getScan(req.params.id);
      if (!scan) {
        res.status(404).json({ error: 'Scan not found' });
        return;
      }
      res.json(scan);
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'GET /api/scans/:id') });
    }
  });

  // Get scan findings
  router.get('/:id/findings', validateQuery(findingsQuerySchema), (req, res) => {
    try {
      const { property } = res.locals.query as { property?: number };
      const scanId = req.params.id as string;
      const findings = property
        ? repo.getFindingsByProperty(scanId, property)
        : repo.getFindings(scanId);
      res.json(findings);
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'GET /api/scans/:id/findings') });
    }
  });

  // Get engine result for a scan
  router.get('/:id/result', (req, res) => {
    try {
      const scan = repo.getScan(req.params.id);
      if (!scan) {
        res.status(404).json({ error: 'Scan not found' });
        return;
      }
      if (!scan.engine_result_json) {
        res.status(404).json({ error: 'No results yet' });
        return;
      }
      const result = safeJsonParse(scan.engine_result_json, null, 'scans.engine_result_json');
      if (result === null) {
        res.status(500).json({ error: 'Engine result data is corrupted' });
        return;
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'GET /api/scans/:id/result') });
    }
  });

  // Trigger a new scan
  router.post('/', validateBody(triggerScanSchema), async (req, res) => {
    try {
      const { projectId, dryRun } = req.body;

      // Get project
      const project = repo.getProject(projectId);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      // Build scanner config from project
      const config = buildScannerConfig(project);

      // Create scan record
      const scan = repo.createScan(projectId, config, dryRun ?? false);

      // Return scan ID immediately
      res.status(201).json({ scanId: scan.id, status: 'pending' });

      // Run scan asynchronously (don't await - client will use SSE for progress)
      setImmediate(async () => {
        try {
          let adapter: import('../../adapters/types').DatabaseAdapter | null = null;
          if (!dryRun && project.db_host) {
            // Dynamic import to avoid requiring pg when not using postgres
            const { PostgreSQLAdapter } = await import('../../adapters/postgres');
            adapter = new PostgreSQLAdapter({
              type: project.db_type as any,
              connectionUri: project.db_connection_uri ?? undefined,
              host: project.db_host ?? 'localhost',
              port: project.db_port ?? 5432,
              database: project.db_name ?? undefined,
              username: project.db_username ?? undefined,
              password: project.db_password ?? undefined,
              ssl: project.db_ssl === 1,
              schemas: safeJsonParse<string[]>(project.db_schemas ?? '["public"]', ['public'], 'projects.db_schemas'),
              excludeTables: [],
              maxTablesPerSchema: 500,
            });
          }

          await scanRunner.run(scan.id, config, adapter, dryRun ?? false);
        } catch (error: any) {
          // Error already handled in scanRunner.run()
          console.error(`Scan ${scan.id} failed:`, error.message);
        }
      });

    } catch (err: any) {
      res.status(400).json({ error: safeError(err, 'POST /api/scans') });
    }
  });

  // Upload CSV/Excel/BI files and trigger a scan
  router.post('/upload', upload.array('files', 50), validateUploadedFiles(SCHEMA_UPLOAD_CONFIG), validateBody(uploadScanBodySchema), async (req, res) => {
    try {
      const { projectId } = req.body;

      const project = repo.getProject(projectId);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }

      const uploadedFiles = req.files as Express.Multer.File[];
      if (!uploadedFiles || uploadedFiles.length === 0) {
        res.status(400).json({ error: 'No files uploaded' });
        return;
      }

      // Detect file type from the first uploaded file
      const fileType = getFileType(uploadedFiles[0].originalname);

      let schemaData: SchemaData;
      let source: string;
      let fileCount = uploadedFiles.length;
      let totalRows = 0;
      let warnings: string[] = [];

      if (fileType === 'powerbi') {
        // Parse Power BI template
        schemaData = parsePowerBITemplate(uploadedFiles[0].buffer);
        source = 'powerbi';
      } else if (fileType === 'tableau') {
        // Parse Tableau workbook
        schemaData = parseTableauWorkbook(uploadedFiles[0].buffer, uploadedFiles[0].originalname);
        source = 'tableau';
      } else {
        // Parse CSV/Excel files into SchemaData
        const csvFiles: CsvFile[] = uploadedFiles.map((f) => ({
          originalname: f.originalname,
          buffer: f.buffer,
          mimetype: f.mimetype,
        }));

        const parseResult = await parseCsvFiles(csvFiles);
        schemaData = parseResult.schemaData;
        source = 'csv';
        fileCount = parseResult.fileCount;
        totalRows = parseResult.totalRows;
        warnings = parseResult.warnings;
      }

      if (schemaData.tables.length === 0) {
        res.status(400).json({ error: 'No valid tables found in uploaded files' });
        return;
      }

      // Build scanner config from project
      const config = buildScannerConfig(project);

      // Create scan record
      const scan = repo.createScan(projectId, config, false, source);

      // Return scan ID immediately
      res.status(201).json({
        scanId: scan.id,
        status: 'pending',
        fileCount,
        totalRows,
        tables: schemaData.tables.length,
        warnings,
      });

      // Run scan asynchronously with parsed schema data
      setImmediate(async () => {
        try {
          await scanRunner.run(scan.id, config, null, false, schemaData);
        } catch (error: any) {
          console.error(`${source} scan ${scan.id} failed:`, error.message);
        }
      });

    } catch (err: any) {
      res.status(400).json({ error: safeError(err, 'POST /api/scans/upload') });
    }
  });

  // Upload transform mapping files and run transform checks against a scan
  router.post('/:id/transform-upload', upload.array('files', 20), validateUploadedFiles(SCHEMA_UPLOAD_CONFIG), async (req, res) => {
    try {
      const scanId = req.params.id as string;
      const scan = repo.getScan(scanId);
      if (!scan) {
        res.status(404).json({ error: 'Scan not found' });
        return;
      }

      const uploadedFiles = req.files as Express.Multer.File[];
      if (!uploadedFiles || uploadedFiles.length === 0) {
        res.status(400).json({ error: 'No files uploaded' });
        return;
      }

      // Parse mapping files into TransformData
      const transformFiles: TransformFile[] = uploadedFiles.map((f) => ({
        originalname: f.originalname,
        buffer: f.buffer,
        mimetype: f.mimetype,
      }));

      const parseResult = await parseTransformFiles(transformFiles);

      if (parseResult.totalMappings === 0) {
        res.status(400).json({
          error: 'No valid mappings found in uploaded files',
          warnings: parseResult.warnings,
        });
        return;
      }

      // Run transform checks
      const findings = runTransformChecks(parseResult.data);

      // Persist findings
      repo.insertTransformFindings(scanId, findings);

      // Compute summary counts
      const sdCount = findings.filter((f) => f.category === 'semantic-drift').length;
      const obCount = findings.filter((f) => f.category === 'ontological-break').length;
      const criticalCount = findings.filter((f) => f.severity === 'critical').length;
      const majorCount = findings.filter((f) => f.severity === 'major').length;
      const minorCount = findings.filter((f) => f.severity === 'minor').length;

      // Update scan with transform summary
      repo.updateScanTransformSummary(scanId, {
        transformTotal: findings.length,
        transformSdCount: sdCount,
        transformObCount: obCount,
        transformCritical: criticalCount,
        transformMajor: majorCount,
        transformMinor: minorCount,
        transformMappings: parseResult.totalMappings,
      });

      res.json({
        totalMappings: parseResult.totalMappings,
        totalFindings: findings.length,
        semanticDrift: sdCount,
        ontologicalBreaks: obCount,
        critical: criticalCount,
        major: majorCount,
        minor: minorCount,
        fileCount: parseResult.fileCount,
        warnings: parseResult.warnings,
      });
    } catch (err: any) {
      res.status(400).json({ error: safeError(err, 'POST /api/scans/:id/transform-upload') });
    }
  });

  // Upload pipeline mapping files and run pipeline checks
  router.post('/:id/pipeline-upload', pipelineUpload.array('files', 10), validateUploadedFiles(PIPELINE_UPLOAD_CONFIG), validateBody(pipelineUploadBodySchema), async (req, res) => {
    try {
      const scanId = req.params.id as string;
      const scan = repo.getScan(scanId);
      if (!scan) {
        res.status(404).json({ error: 'Scan not found' });
        return;
      }

      const uploadedFiles = req.files as Express.Multer.File[];
      if (!uploadedFiles || uploadedFiles.length === 0) {
        res.status(400).json({ error: 'No files uploaded' });
        return;
      }

      const pipelineType = req.body.pipelineType as string; // default 'stm' set by schema
      let pipelineMapping: PipelineMapping;

      if (pipelineType === 'dbt') {
        // Expect manifest.json (required) + optional catalog.json
        const manifestFile = uploadedFiles.find(f => f.originalname.toLowerCase().includes('manifest'));
        if (!manifestFile) {
          res.status(400).json({ error: 'manifest.json file required for dbt pipeline type' });
          return;
        }
        const catalogFile = uploadedFiles.find(f => f.originalname.toLowerCase().includes('catalog'));
        pipelineMapping = parseDbtManifest(manifestFile.buffer, catalogFile?.buffer);
      } else if (pipelineType === 'openlineage') {
        // Can be single file or multiple
        if (uploadedFiles.length === 1) {
          pipelineMapping = parseOpenLineageEvents(uploadedFiles[0].buffer);
        } else {
          // Merge multiple OL files into one array and parse
          const allEvents: unknown[] = [];
          for (const f of uploadedFiles) {
            let parsed: unknown;
            try {
              parsed = JSON.parse(f.buffer.toString('utf-8'));
            } catch {
              res.status(400).json({
                error: `Invalid JSON in uploaded file: ${f.originalname}`,
              });
              return;
            }
            if (Array.isArray(parsed)) {
              allEvents.push(...parsed);
            } else {
              allEvents.push(parsed);
            }
          }
          pipelineMapping = parseOpenLineageEvents(Buffer.from(JSON.stringify(allEvents)));
        }
      } else {
        // STM (CSV files)
        const stmFiles: StmFile[] = uploadedFiles.map(f => ({
          originalname: f.originalname,
          buffer: f.buffer,
          mimetype: f.mimetype,
        }));
        const stmResult = await parseStmFiles(stmFiles);
        pipelineMapping = stmResult.pipelineMapping;
      }

      if (pipelineMapping.mappings.length === 0) {
        res.status(400).json({ error: 'No valid mappings found in uploaded files' });
        return;
      }

      // Persist pipeline mapping
      repo.insertPipelineMapping(scanId, {
        sourceFormat: pipelineMapping.sourceFormat,
        extractedAt: pipelineMapping.extractedAt,
        mappingsJson: JSON.stringify(pipelineMapping.mappings),
        metadataJson: JSON.stringify(pipelineMapping.metadata),
      });

      // Run pipeline checks
      const driftFindings = checkMappingDrift(pipelineMapping);

      // Try to get schema data for cross-reference (if scan has completed)
      let schemaData: SchemaData | null = null;
      if (scan.engine_input_json) {
        // Schema data isn't persisted, but we can check gaps with empty schema if needed
      }
      const gapFindings = checkLineageGaps(pipelineMapping, schemaData);
      const allFindings = [...driftFindings, ...gapFindings];

      // Persist findings
      if (allFindings.length > 0) {
        repo.insertTransformFindings(scanId, allFindings);
      }

      // Update scan summary
      const criticalCount = allFindings.filter(f => f.severity === 'critical').length;
      const majorCount = allFindings.filter(f => f.severity === 'major').length;
      const minorCount = allFindings.filter(f => f.severity === 'minor').length;

      repo.updateScanTransformSummary(scanId, {
        transformTotal: allFindings.length,
        transformSdCount: driftFindings.length,
        transformObCount: gapFindings.length,
        transformCritical: criticalCount,
        transformMajor: majorCount,
        transformMinor: minorCount,
        transformMappings: pipelineMapping.mappings.length,
      });

      res.json({
        totalMappings: pipelineMapping.mappings.length,
        totalFindings: allFindings.length,
        driftFindings: driftFindings.length,
        gapFindings: gapFindings.length,
        critical: criticalCount,
        major: majorCount,
        minor: minorCount,
        sourceFormat: pipelineMapping.sourceFormat,
        fileCount: uploadedFiles.length,
      });
    } catch (err: any) {
      res.status(400).json({ error: safeError(err, 'POST /api/scans/:id/pipeline-upload') });
    }
  });

  // Get strengths (positive observations) for a scan
  router.get('/:id/strengths', (req, res) => {
    try {
      const scanId = req.params.id as string;
      const scan = repo.getScan(scanId);
      if (!scan) {
        res.status(404).json({ error: 'Scan not found' });
        return;
      }
      const strengths = repo.getStrengths(scanId);
      res.json(strengths);
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'GET /api/scans/:id/strengths') });
    }
  });

  // Get transform findings for a scan
  router.get('/:id/transform-findings', validateQuery(transformFindingsQuerySchema), (req, res) => {
    try {
      const { category } = res.locals.query as { category?: string };
      const scanId = req.params.id as string;
      const findings = category
        ? repo.getTransformFindingsByCategory(scanId, category)
        : repo.getTransformFindings(scanId);
      res.json(findings);
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'GET /api/scans/:id/transform-findings') });
    }
  });

  // Export scan as HTML report
  router.get('/:id/export/html', (req, res) => {
    try {
      const scan = repo.getScan(req.params.id);
      if (!scan) {
        res.status(404).json({ error: 'Scan not found' });
        return;
      }
      if (scan.status !== 'completed') {
        res.status(400).json({ error: 'Scan not completed' });
        return;
      }

      const engineResult = safeJsonParse<any>(scan.engine_result_json!, null, 'scans.engine_result_json');
      const configSnapshot = safeJsonParse<any>(scan.config_snapshot, null, 'scans.config_snapshot');
      if (!engineResult || !configSnapshot) {
        res.status(500).json({ error: 'Scan result data is corrupted' });
        return;
      }

      // Reconstruct a ScoredFindings-like object for the report generator
      const findings = repo.getFindings(scan.id);
      const scoredFindings = {
        findings: findings.map((f: any) => ({
          checkId: f.check_id,
          property: f.property,
          severity: f.severity,
          rawScore: f.raw_score,
          title: f.title,
          description: f.description ?? '',
          evidence: f.evidence ?? [],
          affectedObjects: f.affected_objects ?? 0,
          totalObjects: f.total_objects ?? 0,
          ratio: f.ratio ?? 0,
          remediation: f.remediation ?? '',
          costCategories: f.costCategories ?? [],
          costWeights: f.costWeights ?? {},
        })),
        propertyScores: new Map<number, number>(),
        totalTables: scan.schema_tables ?? 0,
        totalRowCount: 0,
        zeroRowDowngrade: false,
        complexityFloorApplied: false,
      };

      const reportData = buildReportData(
        engineResult,
        scoredFindings,
        configSnapshot.organisation?.name ?? 'Unknown',
        scan.source,
      );
      const html = generateReport(reportData);

      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Disposition', `attachment; filename="dalc-report-${scan.id.slice(0, 8)}.html"`);
      res.send(html);
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'GET /api/scans/:id/export/html') });
    }
  });

  return router;
}

function getFileType(filename: string): 'csv' | 'powerbi' | 'tableau' {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pbit') return 'powerbi';
  if (ext === 'twb' || ext === 'twbx') return 'tableau';
  return 'csv';
}

function buildScannerConfig(project: ProjectRow): ScannerConfig {
  const thresholds: any = safeJsonParse(project.thresholds_json ?? '{}', {}, 'projects.thresholds_json');

  return {
    organisation: {
      name: project.name,
      sector: project.sector as any,
      revenueAUD: project.revenue_aud,
      totalFTE: project.total_fte,
      dataEngineers: project.data_engineers,
      avgSalaryAUD: project.avg_salary_aud,
      avgFTESalaryAUD: project.avg_fte_salary_aud,
      aiBudgetAUD: project.ai_budget_aud,
      csrdInScope: project.csrd_in_scope === 1,
      canonicalInvestmentAUD: project.canonical_investment_aud,
    },
    thresholds: {
      entitySimilarityThreshold: thresholds.entitySimilarityThreshold ?? 0.7,
      synonymGroups: thresholds.synonymGroups ?? [],
      sharedEntityThreshold: thresholds.sharedEntityThreshold ?? 2,
      nullRateThreshold: thresholds.nullRateThreshold ?? 0.3,
      namingConvention: thresholds.namingConvention ?? 'snake_case',
      ...thresholds,
    },
  };
}
