import Database from 'better-sqlite3';
import { join } from 'path';

const SCHEMA_VERSION = 13;

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

    -- Database connection (AES-256-GCM encrypted at rest — see src/server/db/crypto.ts)
    db_type TEXT DEFAULT 'postgresql' CHECK (db_type IN ('postgresql', 'mysql', 'mssql', 'demo')),
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
    property INTEGER NOT NULL CHECK (property BETWEEN 1 AND 8),
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

  -- Scan strengths (positive observations)
  CREATE TABLE IF NOT EXISTS scan_strengths (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    check_id TEXT NOT NULL,
    property INTEGER NOT NULL CHECK (property BETWEEN 1 AND 8),
    title TEXT NOT NULL,
    description TEXT,
    detail TEXT,
    metric TEXT
  );

  -- Application settings (key-value store for branding, etc.)
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
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
  CREATE INDEX IF NOT EXISTS idx_strengths_scan ON scan_strengths(scan_id);
  CREATE INDEX IF NOT EXISTS idx_strengths_property ON scan_strengths(property);

  -- Immutable scan result sets (one per scan run — completed or failed)
  CREATE TABLE IF NOT EXISTS scan_result_sets (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    scan_id TEXT REFERENCES scans(id) ON DELETE SET NULL,
    run_label TEXT NOT NULL,
    adapter_type TEXT NOT NULL DEFAULT 'unknown',
    source_name TEXT,
    source_fingerprint TEXT,
    app_version TEXT NOT NULL,
    ruleset_version TEXT NOT NULL DEFAULT '1.0',
    dalc_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed'
      CHECK (status IN ('completed', 'failed', 'partial')),
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    duration_ms INTEGER,
    total_findings INTEGER NOT NULL DEFAULT 0,
    critical_count INTEGER NOT NULL DEFAULT 0,
    major_count INTEGER NOT NULL DEFAULT 0,
    minor_count INTEGER NOT NULL DEFAULT 0,
    info_count INTEGER NOT NULL DEFAULT 0,
    dalc_total_usd REAL NOT NULL DEFAULT 0,
    dalc_base_usd REAL,
    dalc_low_usd REAL,
    dalc_high_usd REAL,
    amplification_ratio REAL NOT NULL DEFAULT 0,
    derived_approach TEXT,
    summary_json TEXT NOT NULL DEFAULT '{}',
    criticality_json TEXT,
    methodology_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Result findings (immutable snapshot per result set)
  CREATE TABLE IF NOT EXISTS result_findings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    result_set_id TEXT NOT NULL REFERENCES scan_result_sets(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    check_id TEXT NOT NULL,
    property INTEGER NOT NULL CHECK (property BETWEEN 1 AND 8),
    severity TEXT NOT NULL CHECK (severity IN ('critical', 'major', 'minor', 'info')),
    raw_score REAL NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    asset_type TEXT,
    asset_key TEXT,
    asset_name TEXT,
    affected_objects INTEGER NOT NULL DEFAULT 0,
    total_objects INTEGER NOT NULL DEFAULT 0,
    ratio REAL NOT NULL DEFAULT 0,
    threshold_value REAL,
    observed_value REAL,
    metric_unit TEXT,
    remediation TEXT,
    evidence_json TEXT NOT NULL DEFAULT '[]',
    cost_categories_json TEXT NOT NULL DEFAULT '[]',
    cost_weights_json TEXT NOT NULL DEFAULT '{}',
    confidence_level TEXT,
    confidence_score REAL,
    explanation TEXT,
    why_it_matters TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_result_sets_project ON scan_result_sets(project_id);
  CREATE INDEX IF NOT EXISTS idx_result_sets_scan ON scan_result_sets(scan_id);
  CREATE INDEX IF NOT EXISTS idx_result_sets_created ON scan_result_sets(created_at);
  CREATE INDEX IF NOT EXISTS idx_result_sets_status ON scan_result_sets(status);
  CREATE INDEX IF NOT EXISTS idx_result_findings_set ON result_findings(result_set_id);
  CREATE INDEX IF NOT EXISTS idx_result_findings_project ON result_findings(project_id);
  CREATE INDEX IF NOT EXISTS idx_result_findings_severity ON result_findings(severity);
  CREATE INDEX IF NOT EXISTS idx_result_findings_check ON result_findings(check_id);
  CREATE INDEX IF NOT EXISTS idx_result_findings_confidence ON result_findings(confidence_level);

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

    if (currentVersion < 5) {
      // v5: add scan_strengths table
      const stTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='scan_strengths'").get();
      if (!stTable) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS scan_strengths (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
            check_id TEXT NOT NULL,
            property INTEGER NOT NULL CHECK (property BETWEEN 1 AND 8),
            title TEXT NOT NULL,
            description TEXT,
            detail TEXT,
            metric TEXT
          );
          CREATE INDEX IF NOT EXISTS idx_strengths_scan ON scan_strengths(scan_id);
          CREATE INDEX IF NOT EXISTS idx_strengths_property ON scan_strengths(property);
        `);
      }
      db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(5);
    }

    if (currentVersion < 6) {
      // v6: add settings table
      const settingsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'").get();
      if (!settingsTable) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT DEFAULT (datetime('now'))
          );
        `);
      }
      // Seed default settings
      db.exec(`
        INSERT OR IGNORE INTO settings (key, value) VALUES
          ('consultant_name', ''),
          ('consultant_tagline', ''),
          ('report_title', ''),
          ('report_subtitle', ''),
          ('consultant_logo', ''),
          ('client_logo', '');
      `);
      db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(6);
    }

    if (currentVersion < 7) {
      // v7: add 'demo' to db_type CHECK constraint
      // SQLite cannot ALTER CHECK constraints, so we recreate the projects table.
      // Use a transaction for atomicity; drop stale temp table if a prior run was interrupted.
      db.exec(`BEGIN TRANSACTION`);
      try {
        db.exec(`DROP TABLE IF EXISTS projects_new`);
        db.exec(`
          CREATE TABLE projects_new (
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
            db_type TEXT DEFAULT 'postgresql' CHECK (db_type IN ('postgresql', 'mysql', 'mssql', 'demo')),
            db_host TEXT,
            db_port INTEGER,
            db_name TEXT,
            db_username TEXT,
            db_password TEXT,
            db_ssl INTEGER DEFAULT 0,
            db_schemas TEXT DEFAULT '["public"]',
            db_connection_uri TEXT,
            thresholds_json TEXT DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            archived INTEGER NOT NULL DEFAULT 0
          )
        `);
        db.exec(`INSERT INTO projects_new SELECT * FROM projects`);
        db.exec(`DROP TABLE projects`);
        db.exec(`ALTER TABLE projects_new RENAME TO projects`);
        db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(7);
        db.exec(`COMMIT`);
      } catch (err) {
        db.exec(`ROLLBACK`);
        throw err;
      }
    }

    if (currentVersion < 8) {
      // v8: widen property CHECK constraint from 1-7 to 1-8 for P8 AI Readiness
      // SQLite cannot ALTER CHECK constraints, so recreate affected tables.
      db.exec(`BEGIN TRANSACTION`);
      try {
        // --- scan_findings ---
        db.exec(`DROP TABLE IF EXISTS scan_findings_new`);
        db.exec(`
          CREATE TABLE scan_findings_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
            check_id TEXT NOT NULL,
            property INTEGER NOT NULL CHECK (property BETWEEN 1 AND 8),
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
          )
        `);
        db.exec(`INSERT INTO scan_findings_new SELECT * FROM scan_findings`);
        db.exec(`DROP TABLE scan_findings`);
        db.exec(`ALTER TABLE scan_findings_new RENAME TO scan_findings`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_findings_scan ON scan_findings(scan_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_findings_property ON scan_findings(property)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_findings_severity ON scan_findings(severity)`);

        // --- scan_strengths ---
        db.exec(`DROP TABLE IF EXISTS scan_strengths_new`);
        db.exec(`
          CREATE TABLE scan_strengths_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
            check_id TEXT NOT NULL,
            property INTEGER NOT NULL CHECK (property BETWEEN 1 AND 8),
            title TEXT NOT NULL,
            description TEXT,
            detail TEXT,
            metric TEXT
          )
        `);
        db.exec(`INSERT INTO scan_strengths_new SELECT * FROM scan_strengths`);
        db.exec(`DROP TABLE scan_strengths`);
        db.exec(`ALTER TABLE scan_strengths_new RENAME TO scan_strengths`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_strengths_scan ON scan_strengths(scan_id)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_strengths_property ON scan_strengths(property)`);

        db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(8);
        db.exec(`COMMIT`);
      } catch (err) {
        db.exec(`ROLLBACK`);
        throw err;
      }
    }

    if (currentVersion < 9) {
      // v9: add scan_result_sets and result_findings tables for persistent scan history
      const rsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='scan_result_sets'").get();
      if (!rsTable) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS scan_result_sets (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
            run_label TEXT NOT NULL,
            adapter_type TEXT NOT NULL DEFAULT 'unknown',
            source_name TEXT,
            source_fingerprint TEXT,
            app_version TEXT NOT NULL,
            ruleset_version TEXT NOT NULL DEFAULT '1.0',
            dalc_version TEXT NOT NULL,
            total_findings INTEGER NOT NULL DEFAULT 0,
            critical_count INTEGER NOT NULL DEFAULT 0,
            major_count INTEGER NOT NULL DEFAULT 0,
            minor_count INTEGER NOT NULL DEFAULT 0,
            info_count INTEGER NOT NULL DEFAULT 0,
            dalc_total_usd REAL NOT NULL DEFAULT 0,
            amplification_ratio REAL NOT NULL DEFAULT 0,
            derived_approach TEXT,
            summary_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          );
          CREATE INDEX IF NOT EXISTS idx_result_sets_project ON scan_result_sets(project_id);
          CREATE INDEX IF NOT EXISTS idx_result_sets_scan ON scan_result_sets(scan_id);
          CREATE INDEX IF NOT EXISTS idx_result_sets_created ON scan_result_sets(created_at);
        `);
      }

      const rfTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='result_findings'").get();
      if (!rfTable) {
        db.exec(`
          CREATE TABLE IF NOT EXISTS result_findings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            result_set_id TEXT NOT NULL REFERENCES scan_result_sets(id) ON DELETE CASCADE,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            check_id TEXT NOT NULL,
            property INTEGER NOT NULL CHECK (property BETWEEN 1 AND 8),
            severity TEXT NOT NULL CHECK (severity IN ('critical', 'major', 'minor', 'info')),
            raw_score REAL NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            asset_type TEXT,
            asset_key TEXT,
            asset_name TEXT,
            affected_objects INTEGER NOT NULL DEFAULT 0,
            total_objects INTEGER NOT NULL DEFAULT 0,
            ratio REAL NOT NULL DEFAULT 0,
            threshold_value REAL,
            observed_value REAL,
            metric_unit TEXT,
            remediation TEXT,
            evidence_json TEXT NOT NULL DEFAULT '[]',
            cost_categories_json TEXT NOT NULL DEFAULT '[]',
            cost_weights_json TEXT NOT NULL DEFAULT '{}'
          );
          CREATE INDEX IF NOT EXISTS idx_result_findings_set ON result_findings(result_set_id);
          CREATE INDEX IF NOT EXISTS idx_result_findings_project ON result_findings(project_id);
          CREATE INDEX IF NOT EXISTS idx_result_findings_severity ON result_findings(severity);
          CREATE INDEX IF NOT EXISTS idx_result_findings_check ON result_findings(check_id);
        `);
      }

      db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(9);
    }

    if (currentVersion < 10) {
      // v10: scan_result_sets — add lifecycle fields, dalc bands, make scan_id nullable
      //      SQLite cannot ALTER FKs or change NOT NULL→NULL, so we rebuild the table.
      const rsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='scan_result_sets'").get();
      if (rsTable) {
        db.exec(`BEGIN TRANSACTION`);
        try {
          db.exec(`DROP TABLE IF EXISTS scan_result_sets_new`);
          db.exec(`
            CREATE TABLE scan_result_sets_new (
              id TEXT PRIMARY KEY,
              project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
              scan_id TEXT REFERENCES scans(id) ON DELETE SET NULL,
              run_label TEXT NOT NULL,
              adapter_type TEXT NOT NULL DEFAULT 'unknown',
              source_name TEXT,
              source_fingerprint TEXT,
              app_version TEXT NOT NULL,
              ruleset_version TEXT NOT NULL DEFAULT '1.0',
              dalc_version TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'completed'
                CHECK (status IN ('completed', 'failed', 'partial')),
              started_at TEXT NOT NULL DEFAULT (datetime('now')),
              completed_at TEXT,
              duration_ms INTEGER,
              total_findings INTEGER NOT NULL DEFAULT 0,
              critical_count INTEGER NOT NULL DEFAULT 0,
              major_count INTEGER NOT NULL DEFAULT 0,
              minor_count INTEGER NOT NULL DEFAULT 0,
              info_count INTEGER NOT NULL DEFAULT 0,
              dalc_total_usd REAL NOT NULL DEFAULT 0,
              dalc_base_usd REAL,
              dalc_low_usd REAL,
              dalc_high_usd REAL,
              amplification_ratio REAL NOT NULL DEFAULT 0,
              derived_approach TEXT,
              summary_json TEXT NOT NULL DEFAULT '{}',
              created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
          `);

          // Migrate existing rows: map old columns, set defaults for new ones
          db.exec(`
            INSERT INTO scan_result_sets_new (
              id, project_id, scan_id, run_label,
              adapter_type, source_name, source_fingerprint,
              app_version, ruleset_version, dalc_version,
              status, started_at, completed_at, duration_ms,
              total_findings, critical_count, major_count, minor_count, info_count,
              dalc_total_usd, dalc_base_usd, dalc_low_usd, dalc_high_usd,
              amplification_ratio, derived_approach, summary_json, created_at
            )
            SELECT
              id, project_id, scan_id, run_label,
              adapter_type, source_name, source_fingerprint,
              app_version, ruleset_version, dalc_version,
              'completed', created_at, created_at, NULL,
              total_findings, critical_count, major_count, minor_count, info_count,
              dalc_total_usd, dalc_total_usd, NULL, NULL,
              amplification_ratio, derived_approach, summary_json, created_at
            FROM scan_result_sets
          `);

          // Update result_findings FK to point to new table
          db.exec(`DROP TABLE scan_result_sets`);
          db.exec(`ALTER TABLE scan_result_sets_new RENAME TO scan_result_sets`);

          // Re-create indexes
          db.exec(`CREATE INDEX IF NOT EXISTS idx_result_sets_project ON scan_result_sets(project_id)`);
          db.exec(`CREATE INDEX IF NOT EXISTS idx_result_sets_scan ON scan_result_sets(scan_id)`);
          db.exec(`CREATE INDEX IF NOT EXISTS idx_result_sets_created ON scan_result_sets(created_at)`);
          db.exec(`CREATE INDEX IF NOT EXISTS idx_result_sets_status ON scan_result_sets(status)`);

          db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(10);
          db.exec(`COMMIT`);
        } catch (err) {
          db.exec(`ROLLBACK`);
          throw err;
        }
      } else {
        // Fresh install on v10 — tables created by SCHEMA_SQL, just bump version
        db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(10);
      }
    }

    // ── v11: result_findings — add evidence columns ────────────────────────
    if (currentVersion < 11) {
      const rfTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='result_findings'").get();
      if (rfTable) {
        // ALTER TABLE ADD COLUMN is safe in SQLite — no rebuild needed
        const existingCols = db.prepare('PRAGMA table_info(result_findings)').all() as { name: string }[];
        const colNames = new Set(existingCols.map(c => c.name));

        if (!colNames.has('confidence_level')) {
          db.exec(`ALTER TABLE result_findings ADD COLUMN confidence_level TEXT`);
        }
        if (!colNames.has('confidence_score')) {
          db.exec(`ALTER TABLE result_findings ADD COLUMN confidence_score REAL`);
        }
        if (!colNames.has('explanation')) {
          db.exec(`ALTER TABLE result_findings ADD COLUMN explanation TEXT`);
        }
        if (!colNames.has('why_it_matters')) {
          db.exec(`ALTER TABLE result_findings ADD COLUMN why_it_matters TEXT`);
        }

        db.exec(`CREATE INDEX IF NOT EXISTS idx_result_findings_confidence ON result_findings(confidence_level)`);
      }

      db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(11);
    }

    // ── v12: scan_result_sets — add criticality_json column ────────────────
    if (currentVersion < 12) {
      const rsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='scan_result_sets'").get();
      if (rsTable) {
        const existingCols = db.prepare('PRAGMA table_info(scan_result_sets)').all() as { name: string }[];
        const colNames = new Set(existingCols.map(c => c.name));

        if (!colNames.has('criticality_json')) {
          db.exec(`ALTER TABLE scan_result_sets ADD COLUMN criticality_json TEXT`);
        }
      }

      db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(12);
    }

    // ── v13: scan_result_sets — add methodology_json column ────────────────
    if (currentVersion < 13) {
      const rsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='scan_result_sets'").get();
      if (rsTable) {
        const existingCols = db.prepare('PRAGMA table_info(scan_result_sets)').all() as { name: string }[];
        const colNames = new Set(existingCols.map(c => c.name));

        if (!colNames.has('methodology_json')) {
          db.exec(`ALTER TABLE scan_result_sets ADD COLUMN methodology_json TEXT`);
        }
      }

      db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(13);
    }
  }

  return db;
}
