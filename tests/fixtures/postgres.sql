-- ============================================================
-- DALC Scanner Test Fixture — PostgreSQL
-- Creates schemas with known violations for testing all 7 checks.
-- Expected counts documented per section.
-- ============================================================

-- Clean slate
DROP SCHEMA IF EXISTS public CASCADE;
DROP SCHEMA IF EXISTS mining CASCADE;
DROP SCHEMA IF EXISTS environmental CASCADE;
CREATE SCHEMA public;
CREATE SCHEMA mining;
CREATE SCHEMA environmental;

-- ============================================================
-- P1 VIOLATIONS: Entity name variants
-- Expected: 2 findings (site × 4, bore × 3)
-- ============================================================

-- "site" variants
CREATE TABLE public.sites (site_id SERIAL PRIMARY KEY, site_name TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE mining.locations (location_id SERIAL PRIMARY KEY, location_name TEXT, lat NUMERIC, lng NUMERIC);
CREATE TABLE environmental.facilities (facility_id SERIAL PRIMARY KEY, facility_name TEXT, facility_type TEXT);
CREATE TABLE mining.places (place_id SERIAL PRIMARY KEY, place_name TEXT, place_code VARCHAR(20));

-- "bore" variants
CREATE TABLE mining.bores (bore_id SERIAL PRIMARY KEY, bore_name TEXT, depth_m NUMERIC);
CREATE TABLE mining.drill_holes (hole_id SERIAL PRIMARY KEY, hole_name TEXT, total_depth NUMERIC);
CREATE TABLE mining.wells (well_id SERIAL PRIMARY KEY, well_code VARCHAR(20), depth_metres NUMERIC);

-- ============================================================
-- P2 VIOLATIONS: Type inconsistencies and uncontrolled vocab
-- Expected: 2 findings (status type mismatch, uncontrolled enums)
-- ============================================================

CREATE TABLE public.orders (
  order_id SERIAL PRIMARY KEY,
  status VARCHAR(20),
  amount NUMERIC(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE mining.work_orders (
  work_order_id SERIAL PRIMARY KEY,
  status INTEGER,
  priority VARCHAR(10),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE environmental.samples (
  sample_id SERIAL PRIMARY KEY,
  status BOOLEAN,
  sample_date DATE,
  parameter TEXT,
  unit TEXT,
  method TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO environmental.samples (status, sample_date, parameter, unit, method)
SELECT
  (random() > 0.5),
  NOW() - (random() * 365 * INTERVAL '1 day'),
  (ARRAY['pH', 'EC', 'TDS', 'TSS', 'BOD', 'COD', 'DO', 'Turbidity'])[floor(random() * 8 + 1)],
  (ARRAY['mg/L', 'µS/cm', 'NTU', 'pH units', 'ppm'])[floor(random() * 5 + 1)],
  (ARRAY['APHA 4500', 'AS 3550', 'ISO 7027', 'USEPA 180.1'])[floor(random() * 4 + 1)]
FROM generate_series(1, 500);

-- ============================================================
-- P3 VIOLATIONS: Domain overlap
-- Expected: 1 finding (table name "reports" in 2 schemas)
-- ============================================================

CREATE TABLE mining.reports (
  report_id SERIAL PRIMARY KEY, report_type TEXT, report_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE environmental.reports (
  report_id SERIAL PRIMARY KEY, report_type TEXT, submitted_date DATE, status VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- P4 VIOLATIONS: CSV import patterns and island tables
-- Expected: 2 findings (import tables, island tables)
-- ============================================================

CREATE TABLE public.import_daily_production (
  id SERIAL, source_file TEXT, import_date TIMESTAMPTZ, csv_row INTEGER, production_tonnes NUMERIC
);
CREATE TABLE mining.stg_assay_results (batch_id TEXT, load_timestamp TIMESTAMPTZ, raw_data JSONB);
CREATE TABLE mining.external_survey_data (
  upload_id SERIAL, surveyor TEXT, survey_date DATE, easting NUMERIC, northing NUMERIC, elevation NUMERIC, notes TEXT
);

CREATE TABLE public.legacy_data (id SERIAL PRIMARY KEY, data_key TEXT, data_value TEXT, source TEXT);
INSERT INTO public.legacy_data (data_key, data_value, source)
SELECT 'key_' || i, 'value_' || i, 'legacy_system' FROM generate_series(1, 200) i;

-- ============================================================
-- P5 VIOLATIONS: Naming and governance
-- Expected: 3 findings (naming violations, missing PKs, undocumented)
-- ============================================================

CREATE TABLE mining."DrillProgram" (
  "ProgramID" SERIAL PRIMARY KEY, "programName" TEXT, start_date DATE, "END_DATE" DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.sites IS 'Master site register';
COMMENT ON TABLE mining.bores IS 'Bore/drill hole master data';

-- ============================================================
-- P6 VIOLATIONS: Quality measurement
-- Expected: 2 findings (high null rates, no indexes)
-- ============================================================

CREATE TABLE environmental.monitoring_results (
  result_id SERIAL PRIMARY KEY, monitoring_point_id INTEGER, parameter_code VARCHAR(20),
  result_value NUMERIC, detection_limit NUMERIC, uncertainty NUMERIC, qualifier TEXT,
  lab_reference TEXT, analyst TEXT, sample_method TEXT, preservation TEXT,
  chain_of_custody TEXT, notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO environmental.monitoring_results
  (monitoring_point_id, parameter_code, result_value, detection_limit, uncertainty, qualifier)
SELECT
  floor(random() * 20 + 1),
  (ARRAY['pH', 'EC', 'TDS'])[floor(random() * 3 + 1)],
  random() * 100,
  CASE WHEN random() > 0.3 THEN NULL ELSE random() * 0.1 END,
  CASE WHEN random() > 0.2 THEN NULL ELSE random() * 5 END,
  CASE WHEN random() > 0.4 THEN NULL ELSE 'J' END
FROM generate_series(1, 1000);

ANALYZE;

-- ============================================================
-- P7 VIOLATIONS: Missing audit trails
-- Expected: 2 findings (missing audit columns, no constraints)
-- ============================================================

CREATE TABLE public.scratch_data (col1 TEXT, col2 TEXT, col3 INTEGER, col4 NUMERIC, col5 DATE);
INSERT INTO public.scratch_data
SELECT 'a', 'b', i, random() * 100, NOW()::DATE FROM generate_series(1, 100) i;

-- ============================================================
-- CLEAN tables (should NOT produce findings)
-- ============================================================

CREATE TABLE public.organisations (
  organisation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL, abn VARCHAR(11) UNIQUE,
  sector TEXT NOT NULL CHECK (sector IN ('mining', 'environmental', 'energy')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system', modified_by TEXT NOT NULL DEFAULT 'system'
);
COMMENT ON TABLE public.organisations IS 'Canonical organisation register';

CREATE TABLE public.organisation_contacts (
  contact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES public.organisations(organisation_id),
  name TEXT NOT NULL, email TEXT NOT NULL, role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
COMMENT ON TABLE public.organisation_contacts IS 'Contact persons linked to organisations';

CREATE INDEX idx_org_contacts_org ON public.organisation_contacts(organisation_id);
CREATE INDEX idx_monitoring_results_point ON environmental.monitoring_results(monitoring_point_id);
