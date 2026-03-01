// =============================================================================
// Zod Schemas — Input validation for all Scanner API routes
// =============================================================================

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Project schemas
// ---------------------------------------------------------------------------

const databaseConfigSchema = z.object({
  type: z.enum(['postgresql', 'mysql', 'mssql']).optional(),
  host: z.string().min(1).max(255).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  database: z.string().min(1).max(255).optional(),
  username: z.string().max(255).optional(),
  password: z.string().max(1000).optional(),
  ssl: z.boolean().optional(),
  schemas: z.array(z.string().min(1).max(255)).max(100).optional(),
  connectionUri: z.string().max(2000).optional(),
});

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(200),
  sector: z.enum(['mining', 'environmental', 'energy'], {
    message: 'Sector must be one of: mining, environmental, energy',
  }),
  revenueAUD: z.number().positive('Revenue must be positive').max(1e12),
  totalFTE: z.number().int().positive('Total FTE must be a positive integer').max(1_000_000),
  dataEngineers: z.number().int().nonnegative().max(100_000),
  avgSalaryAUD: z.number().positive().max(10_000_000),
  avgFTESalaryAUD: z.number().positive().max(10_000_000),
  aiBudgetAUD: z.number().nonnegative().optional(),
  csrdInScope: z.boolean().optional(),
  canonicalInvestmentAUD: z.number().positive().optional(),
  database: databaseConfigSchema.optional(),
  thresholds: z.record(z.string(), z.unknown()).optional(),
});

export const updateProjectSchema = createProjectSchema.partial();

// ---------------------------------------------------------------------------
// Scan schemas
// ---------------------------------------------------------------------------

export const triggerScanSchema = z.object({
  projectId: z.string().min(1, 'projectId is required'),
  dryRun: z.boolean().optional(),
});

/** Body for POST /api/scans/upload (multipart — projectId comes as string) */
export const uploadScanBodySchema = z.object({
  projectId: z.string().min(1, 'projectId is required'),
});

/** Body for POST /api/scans/:id/pipeline-upload */
export const pipelineUploadBodySchema = z.object({
  pipelineType: z.enum(['stm', 'dbt', 'openlineage']).optional().default('stm'),
});

// ---------------------------------------------------------------------------
// Query parameter schemas
// ---------------------------------------------------------------------------

/** Query for GET /api/scans/:id/findings */
export const findingsQuerySchema = z.object({
  property: z.coerce.number().int().min(1).max(7).optional(),
});

/** Query for GET /api/scans/:id/transform-findings */
export const transformFindingsQuerySchema = z.object({
  category: z.enum(['semantic-drift', 'ontological-break']).optional(),
});
