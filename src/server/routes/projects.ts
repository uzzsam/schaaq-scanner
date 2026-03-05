import { Router } from 'express';
import type { Repository, ProjectRow } from '../db/repository';
import { safeError } from '../middleware/safe-error';
import { validateBody } from '../middleware/validate';
import { createProjectSchema, updateProjectSchema } from '../schemas';

/**
 * Strip decrypted credentials from API responses.
 * Returns a boolean indicator so the UI knows whether a password is configured.
 */
function redactCredentials(project: ProjectRow): Record<string, unknown> {
  const { db_password, db_connection_uri, ...safe } = project;
  return {
    ...safe,
    db_password_set: db_password != null && db_password !== '',
    db_connection_uri_set: db_connection_uri != null && db_connection_uri !== '',
  };
}

export function projectRoutes(repo: Repository): Router {
  const router = Router();

  // -------------------------------------------------------------------------
  // Test database connection (wizard step 2)
  // -------------------------------------------------------------------------
  router.post('/test-connection', async (req, res) => {
    const { type, host, port, database, username, password, ssl } = req.body;
    if (!type) {
      res.status(400).json({ error: 'Database type is required' });
      return;
    }

    // Demo mode — instant success, no connection needed
    if (type === 'demo') {
      res.json({ ok: true, message: 'Demo database ready \u2014 no connection required' });
      return;
    }

    if (type !== 'postgresql' && type !== 'mssql' && type !== 'mysql') {
      res.status(400).json({ error: `Unsupported database type: ${type}` });
      return;
    }

    let adapter: import('../../adapters/types').DatabaseAdapter | null = null;
    try {
      if (type === 'mysql') {
        const { MySQLAdapter } = await import('../../adapters/mysql');
        adapter = new MySQLAdapter({
          type: 'mysql',
          host: host ?? 'localhost',
          port: port ?? 3306,
          database: database ?? undefined,
          username: username ?? undefined,
          password: password ?? undefined,
          ssl: ssl ?? false,
          schemas: database ? [database] : [],
          excludeTables: [],
          maxTablesPerSchema: 500,
        });
      } else if (type === 'mssql') {
        const { MSSQLAdapter } = await import('../../adapters/mssql');
        adapter = new MSSQLAdapter({
          type: 'mssql',
          host: host ?? 'localhost',
          port: port ?? 1433,
          database: database ?? undefined,
          username: username ?? undefined,
          password: password ?? undefined,
          ssl: ssl ?? false,
          schemas: ['dbo'],
          excludeTables: [],
          maxTablesPerSchema: 500,
        });
      } else {
        const { PostgreSQLAdapter } = await import('../../adapters/postgres');
        adapter = new PostgreSQLAdapter({
          type: 'postgresql',
          host: host ?? 'localhost',
          port: port ?? 5432,
          database: database ?? undefined,
          username: username ?? undefined,
          password: password ?? undefined,
          ssl: ssl ?? false,
          schemas: ['public'],
          excludeTables: [],
          maxTablesPerSchema: 500,
        });
      }

      await adapter.connect();
      await adapter.disconnect();
      adapter = null;
      res.json({ ok: true, message: 'Connection successful' });
    } catch (err: any) {
      // Return the real error message so the user can diagnose connection issues
      res.status(400).json({ error: err.message ?? 'Connection failed' });
    } finally {
      try { await adapter?.disconnect(); } catch { /* already closed or never opened */ }
    }
  });

  // -------------------------------------------------------------------------
  // List available schemas (wizard step 3)
  // -------------------------------------------------------------------------
  router.post('/schemas', async (req, res) => {
    const { type, host, port, database, username, password, ssl } = req.body;
    if (!type) {
      res.status(400).json({ error: 'Database type is required' });
      return;
    }

    if (type === 'mysql') {
      // MySQL conflates database and schema — list databases the user can access
      let conn: import('mysql2/promise').Connection | null = null;
      try {
        const mysql = await import('mysql2/promise');
        conn = await mysql.default.createConnection({
          host: host ?? 'localhost',
          port: port ?? 3306,
          database: database ?? undefined,
          user: username ?? undefined,
          password: password ?? undefined,
          ssl: ssl ? { rejectUnauthorized: false } : undefined,
          connectTimeout: 15_000,
        });

        const [rows] = await conn.query(
          `SELECT SCHEMA_NAME FROM information_schema.SCHEMATA
           WHERE SCHEMA_NAME NOT IN ('information_schema', 'performance_schema', 'mysql', 'sys')
           ORDER BY SCHEMA_NAME`,
        );
        res.json({ schemas: (rows as any[]).map((r: any) => r.SCHEMA_NAME) });
      } catch (err: any) {
        res.status(400).json({ error: err.message ?? 'Failed to list schemas' });
      } finally {
        try { await conn?.end(); } catch { /* ignore */ }
      }
      return;
    }

    if (type === 'mssql') {
      // Query sys.schemas for real schema list via mssql driver
      let pool: import('mssql').ConnectionPool | null = null;
      try {
        const mssql = await import('mssql');
        pool = new mssql.default.ConnectionPool({
          server: host ?? 'localhost',
          port: port ?? 1433,
          database: database ?? undefined,
          user: username ?? undefined,
          password: password ?? undefined,
          options: {
            encrypt: ssl ?? false,
            trustServerCertificate: true,
          },
          connectionTimeout: 15_000,
          requestTimeout: 15_000,
        });
        await pool.connect();

        const result = await pool.request().query(`
          SELECT name FROM sys.schemas
          WHERE name NOT IN (
            'guest', 'INFORMATION_SCHEMA', 'sys',
            'db_owner', 'db_accessadmin', 'db_securityadmin',
            'db_ddladmin', 'db_backupoperator', 'db_datareader',
            'db_datawriter', 'db_denydatareader', 'db_denydatawriter'
          )
          ORDER BY name
        `);
        res.json({ schemas: result.recordset.map((r: any) => r.name) });
      } catch (err: any) {
        res.status(400).json({ error: err.message ?? 'Failed to list schemas' });
      } finally {
        try { await pool?.close(); } catch { /* ignore */ }
      }
      return;
    }

    if (type !== 'postgresql') {
      res.status(400).json({ error: `Unsupported database type: ${type}` });
      return;
    }

    // PostgreSQL — query information_schema for real schema list
    let pgClient: import('pg').Client | null = null;
    try {
      const { Client } = await import('pg');
      pgClient = new Client({
        host: host ?? 'localhost',
        port: port ?? 5432,
        database: database ?? undefined,
        user: username ?? undefined,
        password: password ?? undefined,
        ssl: ssl ? { rejectUnauthorized: false } : false,
        connectionTimeoutMillis: 15_000,
      });
      await pgClient.connect();

      const result = await pgClient.query(
        `SELECT schema_name FROM information_schema.schemata
         WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
         ORDER BY schema_name`,
      );
      res.json({ schemas: result.rows.map((r: any) => r.schema_name) });
    } catch (err: any) {
      res.status(400).json({ error: err.message ?? 'Failed to list schemas' });
    } finally {
      try { await pgClient?.end(); } catch { /* ignore */ }
    }
  });

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  // List all projects
  router.get('/', (req, res) => {
    try {
      const projects = repo.listProjects();
      res.json(projects.map(redactCredentials));
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'GET /api/projects') });
    }
  });

  // Get single project
  router.get('/:id', (req, res) => {
    try {
      const project = repo.getProject(req.params.id);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      res.json(redactCredentials(project));
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'GET /api/projects/:id') });
    }
  });

  // Create project
  router.post('/', validateBody(createProjectSchema), (req, res) => {
    try {
      const project = repo.createProject(req.body);
      res.status(201).json(redactCredentials(project));
    } catch (err: any) {
      res.status(400).json({ error: safeError(err, 'POST /api/projects') });
    }
  });

  // Update project
  router.patch('/:id', validateBody(updateProjectSchema), (req, res) => {
    try {
      const project = repo.updateProject(req.params.id as string, req.body);
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      res.json(redactCredentials(project));
    } catch (err: any) {
      res.status(400).json({ error: safeError(err, 'PATCH /api/projects/:id') });
    }
  });

  // Archive project (soft delete)
  router.delete('/:id', (req, res) => {
    try {
      repo.archiveProject(req.params.id);
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'DELETE /api/projects/:id') });
    }
  });

  // List scans for a project
  router.get('/:id/scans', (req, res) => {
    try {
      const scans = repo.listScans(req.params.id);
      res.json(scans);
    } catch (err: any) {
      res.status(500).json({ error: safeError(err, 'GET /api/projects/:id/scans') });
    }
  });

  return router;
}
