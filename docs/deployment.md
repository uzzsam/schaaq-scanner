# DALC Scanner — Deployment Guide

This guide covers installing, configuring, and running the DALC Scanner in production environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation Options](#installation-options)
- [Configuration](#configuration)
- [Running a Scan](#running-a-scan)
- [Output & Reports](#output--reports)
- [Docker Deployment](#docker-deployment)
- [Air-Gap Deployment](#air-gap-deployment)
- [Database Permissions](#database-permissions)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Node.js 20+** (if running without Docker)
- **Docker 24+** (recommended for production)
- **PostgreSQL 12+** target database (read-only access)

## Installation Options

### Option 1: Docker (Recommended)

```bash
# Build the image
docker build -t dalc-scanner .

# Or use docker compose
docker compose build scanner
```

### Option 2: npm

```bash
npm install
npm run build
```

### Option 3: Direct from source

```bash
git clone <repository-url>
cd dalc-scanner
npm ci
```

---

## Configuration

Copy the example configuration and edit with your values:

```bash
cp config.example.yml config.yml
```

### Required Fields

```yaml
database:
  type: postgresql            # postgresql | mysql | mssql
  host: your-db-host
  port: 5432
  database: your_database
  username: dalc_scanner      # Read-only user recommended
  password: your_password
  ssl: true                   # Enable for production

organisation:
  name: "Your Organisation"
  sector: mining              # mining | environmental | energy
  revenueAUD: 500000000      # Annual revenue in AUD
  totalFTE: 2500             # Total full-time equivalent employees
  dataEngineers: 12          # Number of data/analytics engineers
  avgEngineerSalaryAUD: 185000
  avgFTESalaryAUD: 125000
```

### Optional Fields

```yaml
database:
  connectionUri: postgresql://user:pass@host:port/db  # Alternative to host/port

scan:
  schemas:
    - public
    - analytics
  excludeTables: ["^tmp_", "_backup$"]   # Regex patterns
  maxTablesPerSchema: 500

organisation:
  csrdInScope: false                      # CSRD regulatory exposure
  canonicalInvestmentAUD: 1800000         # Planned architecture investment
  aiBudgetAUD: 2500000                    # AI/analytics budget

thresholds:
  entitySimilarityThreshold: 0.7
  namingConvention: snake_case
  nullRateThreshold: 0.3

output:
  directory: ./output
  format: html                             # html | json
  filename: dalc-report
```

### Connection URI

You can use a connection URI instead of individual host/port/database fields:

```yaml
database:
  type: postgresql
  connectionUri: postgresql://scanner:password@db.example.com:5432/production
```

---

## Running a Scan

### Docker

```bash
# Full scan
docker run --rm \
  -v $(pwd)/config.yml:/app/config/config.yml:ro \
  -v $(pwd)/output:/app/output \
  dalc-scanner --config /app/config/config.yml --output /app/output

# Dry-run (no database needed)
docker run --rm \
  -v $(pwd)/output:/app/output \
  dalc-scanner --dry-run --verbose --output /app/output

# JSON output
docker run --rm \
  -v $(pwd)/config.yml:/app/config/config.yml:ro \
  -v $(pwd)/output:/app/output \
  dalc-scanner --config /app/config/config.yml --json --output /app/output
```

### Docker Compose

```bash
# Full scan (requires config.yml at project root)
docker compose up scanner

# Dry-run
docker compose up scanner-dry
```

### npm

```bash
# Full scan
npx tsx src/cli.ts --config config.yml --output ./output

# Dry-run with verbose output
npx tsx src/cli.ts --dry-run --verbose --output ./output

# JSON report
npx tsx src/cli.ts --config config.yml --json --output ./output
```

### CLI Options

| Flag | Description |
|------|-------------|
| `--config <path>` | Path to YAML configuration file |
| `--output <dir>` | Output directory for reports (default: `./output`) |
| `--dry-run` | Run with mock data (no database needed) |
| `--verbose` | Show detailed progress output |
| `--json` | Generate JSON report instead of HTML |
| `--version` | Show version number |
| `--help` | Show help |

---

## Output & Reports

### HTML Report

The default HTML report is a single self-contained file with:
- Executive summary with headline disorder cost
- Property maturity scores (7 properties, 0-4 scale)
- Cost category breakdown (Firefighting, Data Quality, Integration, Productivity, Regulatory)
- Five-year cost projection
- Detailed findings with severity and remediation guidance
- Print-friendly CSS (print to PDF from browser)
- **No external dependencies** — works offline, air-gap safe

### JSON Report

The JSON report contains machine-readable data including:
- Engine result with all financial calculations
- Individual findings with severity scores
- Property scores and maturity ratings
- Five-year projection data

---

## Docker Deployment

### Build

```bash
docker build -t dalc-scanner .
```

The multi-stage build:
1. **Build stage**: Installs all dependencies, compiles TypeScript
2. **Runtime stage**: Node.js 20 Alpine, production dependencies only, non-root `dalc` user

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Node.js environment |

### Volume Mounts

| Mount Point | Purpose |
|-------------|---------|
| `/app/config/config.yml` | Configuration file (read-only recommended) |
| `/app/output` | Report output directory |

### Docker Compose with Test Database

For development/testing with a local PostgreSQL:

```bash
# Start test database
docker compose --profile test up -d test-db

# Wait for healthy
docker compose --profile test ps

# Run scan against test database
docker compose --profile test up scanner
```

---

## Air-Gap Deployment

The DALC Scanner is designed for air-gap (offline) environments:

1. **No runtime network access required** — all code is bundled in the Docker image
2. **No external URLs in reports** — HTML reports are fully self-contained
3. **No telemetry** — no data leaves the environment
4. **No CDN dependencies** — no external CSS, fonts, or JavaScript

### Offline Docker Deployment

```bash
# On a connected machine: save the image
docker save dalc-scanner:latest | gzip > dalc-scanner.tar.gz

# Transfer to air-gapped machine, then:
docker load < dalc-scanner.tar.gz
docker run --rm \
  -v /path/to/config.yml:/app/config/config.yml:ro \
  -v /path/to/output:/app/output \
  dalc-scanner --config /app/config/config.yml
```

---

## Database Permissions

The scanner requires **read-only** access to system catalogs only. It does not read application data.

### PostgreSQL

```sql
-- Create a dedicated read-only user
CREATE USER dalc_scanner WITH PASSWORD 'your_secure_password';

-- Grant access to system catalogs (these are already readable by default)
GRANT USAGE ON SCHEMA information_schema TO dalc_scanner;
GRANT USAGE ON SCHEMA pg_catalog TO dalc_scanner;

-- Grant access to target schemas
GRANT USAGE ON SCHEMA public TO dalc_scanner;
GRANT USAGE ON SCHEMA your_schema TO dalc_scanner;

-- Grant SELECT on all tables in target schemas (for row counts/statistics)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO dalc_scanner;
GRANT SELECT ON ALL TABLES IN SCHEMA your_schema TO dalc_scanner;
```

### What the Scanner Reads

| Catalog | Purpose |
|---------|---------|
| `information_schema.tables` | Table metadata |
| `information_schema.columns` | Column metadata |
| `information_schema.table_constraints` | Constraint metadata |
| `information_schema.key_column_usage` | Primary/foreign key columns |
| `information_schema.referential_constraints` | Foreign key references |
| `pg_catalog.pg_stat_user_tables` | Table statistics (row counts, analyze dates) |
| `pg_catalog.pg_stats` | Column statistics (null fractions, distinct counts) |
| `pg_catalog.pg_indexes` | Index metadata |
| `pg_catalog.pg_class` | Table sizes |
| `pg_catalog.pg_description` | Object comments |
| `pg_catalog.pg_version()` | Database version |

### What the Scanner Does NOT Do

- Does **not** read application data rows
- Does **not** modify any tables or schemas
- Does **not** create temporary tables
- Does **not** execute ANALYZE (but checks if it has been run)
- Does **not** make any network calls beyond the database connection

---

## Troubleshooting

### Common Issues

**"Config file not found"**
- Ensure the config path is correct and the file exists
- In Docker: check volume mount path (`-v /host/path:/app/config/config.yml:ro`)

**"Connection refused"**
- Verify database host and port are accessible
- In Docker: use host machine's IP (not `localhost`) or Docker network
- Check firewall rules

**"Permission denied"**
- Ensure the database user has `USAGE` on target schemas
- Ensure `SELECT` permission on system catalogs

**"Statistics are stale"**
- Run `ANALYZE` on the target database before scanning
- The scanner checks `pg_stat_user_tables.last_analyze` for freshness

**"No tables found"**
- Verify `scan.schemas` in config matches actual schema names
- Check `excludeTables` patterns aren't too broad
- Verify the database user can see the schemas

### Dry-Run Mode

Use `--dry-run` to test the scanner without a database connection:

```bash
npx tsx src/cli.ts --dry-run --verbose
```

This runs the full pipeline with mock data and produces a sample report.

### Verbose Output

Use `--verbose` for detailed progress:

```bash
npx tsx src/cli.ts --config config.yml --verbose
```

This shows schema statistics, check progress, and engine calculation details.
