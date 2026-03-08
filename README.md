# DALC Scanner — Data Architecture Loss Calculator (Phase 2)

A standalone diagnostic tool that analyses your database schema against the 7-property data architecture framework and quantifies the annual financial cost of structural gaps.

**Engine version:** v4.0.0 (Archimedes) | **Scanner version:** 0.1.0

## Quick Start

### Docker (Recommended)

```bash
docker build -t dalc-scanner .
cp config.example.yml config.yml
# Edit config.yml with your database credentials

docker run --rm \
  -v $(pwd)/config.yml:/app/config/config.yml:ro \
  -v $(pwd)/output:/app/output \
  dalc-scanner --config /app/config/config.yml --output /app/output

open output/dalc-report.html
```

### npm

```bash
npm install
cp config.example.yml config.yml
# Edit config.yml

npx tsx src/cli.ts --config config.yml --output ./output
```

### Dry-Run (No Database Needed)

```bash
npx tsx src/cli.ts --dry-run --verbose --output ./output
```

## Architecture

```
src/
  engine/       Zero-dependency DALC v4 calculation engine
  adapters/     Database-specific schema extractors (PostgreSQL)
  checks/       15 checks across 7 properties (pure functions)
  scoring/      Severity scoring + mapper to engine input
  report/       Self-contained HTML report generator (Handlebars)
  mock/         Mock schema factory for dry-run/testing
  config.ts     YAML configuration parser
  cli.ts        Commander.js CLI entry point
```

### Pipeline

```
Config → Adapter.connect() → Adapter.extractSchema()
  → ALL_CHECKS.execute() → scoreFindings() → mapToEngineInput()
  → calculateDALC() → buildReportData() → generateReport()
  → Write HTML/JSON report
```

### The 7 Properties

| # | Property | What It Measures |
|---|----------|-----------------|
| P1 | Semantic Identity | Entity name consistency across schemas |
| P2 | Controlled Reference | Reference data type and vocabulary consistency |
| P3 | Domain Ownership | Cross-schema entity duplication |
| P4 | Anti-Corruption | CSV imports, wide tables, island tables |
| P5 | Schema Governance | Naming conventions, PKs, documentation |
| P6 | Quality Measurement | Null rates, orphaned tables, index coverage |
| P7 | Regulatory Traceability | Audit columns, constraint coverage |

### Engine Layers

1. **Shannon Entropy** — Measures disorder across the 7 properties
2. **Base Cost Model** — Revenue-scaled cost allocation across 5 categories
3. **Findings Adjustment** — Applies scanner-detected issues to cost model
4. **Leontief Amplification** — Models cross-category cost cascading via Neumann series inversion
5. **5-Year Projection** — Do-nothing vs canonical architecture comparison

## CLI Options

| Flag | Description |
|------|-------------|
| `--config <path>` | Path to YAML configuration file |
| `--output <dir>` | Output directory for reports (default: `./output`) |
| `--dry-run` | Run with mock data (no database needed) |
| `--verbose` | Show detailed progress output |
| `--json` | Generate JSON report instead of HTML |
| `--version` | Show version number |
| `--help` | Show help |

## Docker

### Build

```bash
docker build -t dalc-scanner .
```

Multi-stage build: Node.js 20 Alpine, non-root `dalc` user, production dependencies only.

### Docker Compose

```bash
# Dry-run
docker compose up scanner-dry

# Full scan (requires config.yml)
docker compose up scanner

# With test database
docker compose --profile test up -d test-db
docker compose --profile test up scanner
```

## Development

```bash
npm install
npm test                        # Run all tests (207+ tests)
npm run test:smoke              # Engine smoke tests
npm run test:adapter            # PostgreSQL adapter unit tests
npm run test:adapter:integration # Adapter integration (Testcontainers)
npm run test:checks             # All 15 checks
npm run test:scoring            # Severity scorer + mapper
npm run test:config             # Config parser
npm run test:report             # Report generator
npm run test:cli                # CLI dry-run tests
npm run test:integration        # Cross-validation tests
npm run build                   # TypeScript compilation
npm run lint                    # Type checking
npm run scan:dry                # Quick dry-run
```

### Test Suites

| Suite | Tests | Description |
|-------|-------|-------------|
| Engine Smoke | 31 | Core DALC v4 calculation engine |
| PostgreSQL Adapter | 73 | Schema extraction + Testcontainers |
| Checks | ~30 | 15 checks across 7 properties |
| Scoring | ~15 | Severity scorer + engine mapper |
| Config | 19 | YAML config parser + validation |
| Report | 17 | HTML report generator |
| CLI | 6 | CLI dry-run integration |
| Pipeline | 5 | End-to-end pipeline integration |
| Cross-Validation | 14 | Scanner vs self-assessment equivalence |
| Docker Scan | 6 | Testcontainers full pipeline |

### Project Structure

```
dalc-scanner/
  src/
    adapters/         Database adapters (PostgreSQL)
    checks/           15 scanner checks (P1-P7)
    engine/           DALC v4 engine (zero-dep)
    mock/             Mock schema factory
    report/           HTML report generator
    scoring/          Severity scorer + mapper
    utils/            String distance, helpers
    cli.ts            CLI entry point
    config.ts         Config parser
  tests/
    adapters/         Adapter unit + integration tests
    checks/           Check unit tests
    cli/              CLI integration tests
    config/           Config parser tests
    fixtures/         PostgreSQL test fixture
    integration/      Pipeline, docker-scan, cross-validation
    report/           Report generator tests
    scoring/          Scoring tests
    engine.smoke.test.ts  Engine smoke tests
  docs/
    deployment.md     Production deployment guide
  config.example.yml  Example configuration
  Dockerfile          Multi-stage Docker build
  docker-compose.yml  Docker Compose services
  config.test.yml     Test database configuration
```

## Security

- **Read-only** database access (SELECT on information_schema/pg_catalog only)
- **Credentials encrypted at rest** — AES-256-GCM encryption for stored database passwords
- **No data exfiltration** — no data leaves the client environment
- **Air-gap capable** — works with zero internet connection
- **No telemetry** — no external API calls, no analytics
- **Non-root Docker** — runs as unprivileged `dalc` user
- **Self-contained reports** — no external URLs, CDN, or JavaScript
- **API credential redaction** — database passwords are never returned in API responses

### Credential Encryption

Database connection passwords and connection URIs are encrypted at rest using AES-256-GCM before being stored in the local SQLite database.

**Key management** (in priority order):

1. `DALC_ENCRYPTION_KEY` environment variable — 64 hex characters (32 bytes)
2. `{dataDir}/encryption.key` file — auto-generated on first server start

To generate a key manually:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Important:** Back up your encryption key. If the key is lost, encrypted credentials cannot be recovered and must be re-entered.

### Upgrading from Pre-Encryption Versions

If you have an existing database with plaintext credentials, run the one-time migration script after upgrading:

```bash
npx tsx src/migrations/encrypt-existing-credentials.ts --data-dir ./data
```

This script is idempotent — already-encrypted values are skipped. The `--data-dir` flag should point to the directory containing `dalc-scanner.db` (defaults to `./data`).

## Configuration Reference

See [`config.example.yml`](config.example.yml) for a fully documented example.
See [`docs/deployment.md`](docs/deployment.md) for detailed deployment instructions.

## Supported Databases

| Database | Status | Adapter |
|----------|--------|---------|
| PostgreSQL 12+ | Supported | `PostgreSQLAdapter` |
| MySQL 8+ | Planned | — |
| SQL Server 2019+ | Planned | — |

## License

Proprietary. All rights reserved.
