import Database from 'better-sqlite3';
import { join } from 'path';

const SCHEMA_VERSION = 4;

const SCHEMA_SQL = `
  -- Projects represent client organisations
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sector TEXT NOT NULL CHECK (sector IN ('mining', 'environmental', 'energy')),
    revenue_aud REAL NOT NULL,
    total_fte INTEGER NOT NULL,
    data_engineers INTEGER NOT NULL,
    avg_salary_aud REAL NOT NULL,
    avg_fte_salary_aud REAL NOT NULL,
    ai_budget_aud REAL DEFAULT 0,
    csrd_in_scope INTEGER NOT NULL DEFAULT 0,
    canonical_investment_aud REAL NOT NULL DEFAULT 1350000,

    -- Database connection (encrypted at rest via application layer)
    db_type TEXT DEFAULT 'postgresql' CHECK (db_type IN ('postgresql', 'mysql', 'mssql')),
    db_host TEXT,
    db_port INTEGER,
    db_name TEXT,
    db_username TEXT,
    db_password TEXT,
    db_ssl INTEGER DEFAULT 0,
    db_schemas TEXT DEFAULT '["public"]',
    db_connection_uri TEXT,

    -- Scan thresholds (JSON blob)
    thresholds_json TEXT DEFAULT '{}',

    -- Metadata
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    archived INTEGER NOT NULL DEFAULT 0
  );

  -- Scans represent individual scan executions
  CREATE TABLE IF NOT EXISTS scans (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- Status
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    progress REAL NOT NULL DEFAULT 0,
    current_step TEXT,
    error_message TEXT,

    -- Timing
    started_at TEXT,
    completed_at TEXT,

    -- Input snapshot (captures the config at scan time)
    config_snapshot TEXT NOT NULL,

    -- Schema metadata captured during scan
    schema_tables INTEGER,
    schema_columns INTEGER,
    schema_count INTEGER,
    db_version TEXT,

    -- Engine results (JSON blobs)
    engine_input_json TEXT,
    engine_result_json TEXT,

    -- Findings summary
    total_findings INTEGER DEFAULT 0,
    critical_count INTEGER DEFAULT 0,
    major_count INTEGER DEFAULT 0,
    minor_count INTEGER DEFAULT 0,
    info_count INTEGER DEFAULT 0,

    -- Cost summary (denormalised for quick display)
    total_cost REAL,
    amplification_ratio REAL,

    -- Derived approach
    derived_approach TEXT,

    -- Data source: 'database' or 'csv'
    source TEXT NOT NULL DEFAULT 'database',

    -- Transform check summary
    transform_total INTEGER DEFAULT 0,
    transform_sd_count INTEGER DEFAULT 0,
    transform_ob_count INTEGER DEFAULT 0,
    transform_critical INTEGER DEFAULT 0,
    transform_major INTEGER DEFAULT 0,
    transform_minor INTEGER DEFAULT 0,
    transform_mappings INTEGER DEFAULT 0,

    -- Metadata
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    is_dry_run INTEGER NOT NULL DEFAULT 0
  );

  -- Individual findings for each scan
  CREATE TABLE IF NOT EXISTS scan_findings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    check_id TEXT NOT NULL,
    property INTEGER NOT NULL CHECK (property BETWEEN 1 AND 7),
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'major', 'minor', 'info')),
    raw_score REAL NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    affected_objects INTEGER,
    total_objects INTEGER,
    ratio REAL,
    remediation TEXT,
    evidence_json TEXT,
    cost_categories_json TEXT,
    cost_weights_json TEXT
  );

  -- Transform clarity findings (separate from schema checks)
  CREATE TABLE IF NOT EXISTS transform_findings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    check_id TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('semantic-drift', 'ontological-break')),
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'major', 'minor', 'info')),
    title TEXT NOT NULL,
    description TEXT,
    affected_mappings INTEGER,
    total_mappings INTEGER,
    ratio REAL,
    remediation TEXT,
    evidence_json TEXT,
    cost_categories_json TEXT,
    cost_weights_json TEXT
  );

  -- Pipeline mappings (persisted pipeline metadata)
  CREATE TABLE IF NOT EXISTS pipeline_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    source_format TEXT NOT NULL,
    extracted_at TEXT NOT NULL,
    mappings_json TEXT NOT NULL,
    metadata_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Indexes
  CREATE INDEX IF NOT EXISTS idx_scans_project ON scans(project_id);
  CREATE INDEX IF NOT EXISTS idx_scans_status ON scans(status);
  CREATE INDEX IF NOT EXISTS idx_findings_scan ON scan_findings(scan_id);
  CREATE INDEX IF NOT EXISTS idx_findings_property ON scan_findings(property);
  CREATE INDEX IF NOT EXISTS idx_findings_severity ON scan_findings(severity);
  CREATE INDEX IF NOT EXISTS idx_transform_findings_scan ON transform_findings(scan_id);
  CREATE INDEX IF NOT EXISTS idx_transform_findings_category ON transform_findings(category);
  CREATE INDEX IF NOT EXISTS idx_transform_findings_severity ON transform_findings(severity);
  CREATE INDEX IF NOT EXISTS idx_pipeline_mappings_scan ON pipeline_mappings(scan_id);

  -- Schema version tracking
  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY
  );
`;

export function initDatabase(dataDir: string): Database.Database {
  const dbPath = join(dataDir, 'dalc-scanner.db');
  const db = new Database(dbPath);

  // WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Check if schema exists
  const versionRow = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
  ).get();

  if (!versionRow) {
    db.exec(SCHEMA_SQL);
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
  } else {
    // Run migrations
    const currentVersion = (db.prepare('SELECT MAX(version) as v FROM schema_version').get() as any)?.v ?? 1;

    if (currentVersion < 2) {
      // v2: add source column to scans
      const cols = db.prepare("PRAGMA table_info('scans')").all() as any[];
      if (!cols.some((c: any) => c.name === 'source')) {
        db.exec("ALTER TABLE scans ADD COLUMN source TEXT NOT NULL DEFAULT 'database'");
      }
      db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(2);
    }

    if (currentVersion < 3) {
      // v3: add transform_findings table and transform columns on scans
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='transform_findings'").get();
      if (!tables) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS transform_findings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
            check_id TEXT NOT NULL,
            category TEXT NOT NULL CHECK (category IN ('semantic-drift', 'ontological-break')),
            severity TEXT NOT NULL CHECK (severity IN ('critical', 'major', 'minor', 'info')),
            title TEXT NOT NULL,
            description TEXT,
            affected_mappings INTEGER,
            total_mappings INTEGER,
            ratio REAL,
            remediation TEXT,
            evidence_json TEXT,
            cost_categories_json TEXT,
            cost_weights_json TEXT
          );
          CREATE INDEX IF NOT EXISTS idx_transform_findings_scan ON transform_findings(scan_id);
          CREATE INDEX IF NOT EXISTS idx_transform_findings_category ON transform_findings(category);
          CREATE INDEX IF NOT EXISTS idx_transform_findings_severity ON transform_findings(severity);
        `);
      }
      // Add transform summary columns to scans
      const scanCols = db.prepare("PRAGMA table_info('scans')").all() as any[];
      if (!scanCols.some((c: any) => c.name === 'transform_total')) {
        db.exec("ALTER TABLE scans ADD COLUMN transform_total INTEGER DEFAULT 0");
        db.exec("ALTER TABLE scans ADD COLUMN transform_sd_count INTEGER DEFAULT 0");
        db.exec("ALTER TABLE scans ADD COLUMN transform_ob_count INTEGER DEFAULT 0");
        db.exec("ALTER TABLE scans ADD COLUMN transform_critical INTEGER DEFAULT 0");
        db.exec("ALTER TABLE scans ADD COLUMN transform_major INTEGER DEFAULT 0");
        db.exec("ALTER TABLE scans ADD COLUMN transform_minor INTEGER DEFAULT 0");
        db.exec("ALTER TABLE scans ADD COLUMN transform_mappings INTEGER DEFAULT 0");
      }
      db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(3);
    }

    if (currentVersion < 4) {
      // v4: add pipeline_mappings table
      const pmTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='pipeline_mappings'").get();
      if (!pmTable) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS pipeline_mappings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
            source_format TEXT NOT NULL,
            extracted_at TEXT NOT NULL,
            mappings_json TEXT NOT NULL,
            metadata_json TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          );
          CREATE INDEX IF NOT EXISTS idx_pipeline_mappings_scan ON pipeline_mappings(scan_id);
        `);
      }
      db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(4);
    }
  }

  return db;
}
