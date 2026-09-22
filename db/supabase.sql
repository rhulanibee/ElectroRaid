-- ElectroRaid tables for the Supabase project.
-- Run once in the Supabase SQL editor. The publishable key can read and write rows, but it cannot create tables.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  employee_no   TEXT,
  full_name     TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  role          TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS field_crews (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL,
  callsign              TEXT NOT NULL,
  specialization        TEXT NOT NULL,
  skill_certifications  TEXT[] NOT NULL DEFAULT '{}',
  status                TEXT NOT NULL,
  lon                   DOUBLE PRECISION NOT NULL,
  lat                   DOUBLE PRECISION NOT NULL,
  vehicle_reg           TEXT,
  active_queue_size     INTEGER NOT NULL DEFAULT 0,
  last_gps_at           TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS feeders (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL,
  name        TEXT NOT NULL,
  suburb      TEXT NOT NULL,
  status      TEXT NOT NULL,
  lon         DOUBLE PRECISION NOT NULL,
  lat         DOUBLE PRECISION NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS meters (
  id                TEXT PRIMARY KEY,
  account_number    TEXT NOT NULL,
  meter_number      TEXT NOT NULL,
  household_name    TEXT NOT NULL,
  address           TEXT NOT NULL,
  suburb            TEXT NOT NULL,
  lon               DOUBLE PRECISION NOT NULL,
  lat               DOUBLE PRECISION NOT NULL,
  feeder_id         TEXT NOT NULL,
  status            TEXT NOT NULL,
  tariff_cents_kwh  INTEGER NOT NULL,
  installed_at      TIMESTAMPTZ NOT NULL,
  last_purchase_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS vending_telemetry_logs (
  id            TEXT PRIMARY KEY,
  meter_id      TEXT NOT NULL,
  purchased_at  TIMESTAMPTZ NOT NULL,
  kwh           DOUBLE PRECISION NOT NULL,
  amount_zar    DOUBLE PRECISION NOT NULL,
  vendor_id     TEXT NOT NULL,
  token_masked  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS master_incidents (
  id                      TEXT PRIMARY KEY,
  reference               TEXT NOT NULL,
  classification          TEXT NOT NULL,
  status                  TEXT NOT NULL,
  lon                     DOUBLE PRECISION NOT NULL,
  lat                     DOUBLE PRECISION NOT NULL,
  address                 TEXT NOT NULL,
  suburb                  TEXT NOT NULL,
  feeder_id               TEXT,
  affected_households     INTEGER NOT NULL,
  critical_infrastructure BOOLEAN NOT NULL,
  priority_score          DOUBLE PRECISION NOT NULL,
  assigned_crew_id        TEXT,
  dispatched_at           TIMESTAMPTZ,
  on_site_at              TIMESTAMPTZ,
  resolved_at             TIMESTAMPTZ,
  resident_confirmed_at   TIMESTAMPTZ,
  qa_rating               INTEGER,
  qa_notes                TEXT,
  qa_by                   TEXT,
  first_reported_at       TIMESTAMPTZ NOT NULL,
  last_activity_at        TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS outage_reports (
  id                  TEXT PRIMARY KEY,
  master_incident_id  TEXT NOT NULL,
  account_number      TEXT,
  reporter_name       TEXT,
  contact_phone       TEXT,
  lon                 DOUBLE PRECISION NOT NULL,
  lat                 DOUBLE PRECISION NOT NULL,
  address             TEXT NOT NULL,
  classification      TEXT NOT NULL,
  channel             TEXT NOT NULL,
  notes               TEXT,
  reported_at         TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS revenue_investigations (
  id                    TEXT PRIMARY KEY,
  reference             TEXT NOT NULL,
  type                  TEXT NOT NULL,
  status                TEXT NOT NULL,
  meter_id              TEXT,
  feeder_id             TEXT,
  lon                   DOUBLE PRECISION NOT NULL,
  lat                   DOUBLE PRECISION NOT NULL,
  address               TEXT NOT NULL,
  suburb                TEXT NOT NULL,
  anomaly_risk_score    DOUBLE PRECISION NOT NULL,
  days_zero_consumption INTEGER,
  assigned_crew_id      TEXT,
  dispatched_at         TIMESTAMPTZ,
  on_site_at            TIMESTAMPTZ,
  fine_amount_zar       DOUBLE PRECISION NOT NULL,
  backbill_zar          DOUBLE PRECISION NOT NULL,
  penalty_zar           DOUBLE PRECISION NOT NULL,
  evidence              JSONB NOT NULL DEFAULT '[]',
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL,
  closed_at             TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS immutable_audit_logs (
  id           INTEGER PRIMARY KEY,
  event_id     TEXT NOT NULL UNIQUE,
  actor_id     TEXT,
  actor_role   TEXT NOT NULL,
  action_type  TEXT NOT NULL,
  entity_type  TEXT NOT NULL,
  entity_id    TEXT NOT NULL,
  lon          DOUBLE PRECISION,
  lat          DOUBLE PRECISION,
  occurred_at  TIMESTAMPTZ NOT NULL,
  payload      JSONB NOT NULL,
  prev_hash    TEXT,
  entry_hash   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS live_events (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  title        TEXT NOT NULL,
  detail       TEXT NOT NULL,
  at           TIMESTAMPTZ NOT NULL,
  severity     TEXT NOT NULL,
  entity_type  TEXT,
  entity_id    TEXT
);

CREATE TABLE IF NOT EXISTS priority_weights (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  w_households  DOUBLE PRECISION NOT NULL,
  w_critical    DOUBLE PRECISION NOT NULL,
  w_elapsed     DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS removed_staff (
  user_id TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS staff_provisions (
  id        TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email     TEXT NOT NULL,
  phone     TEXT,
  role      TEXT NOT NULL,
  crew_id   TEXT,
  callsign  TEXT,
  password  TEXT
);

-- Existing projects: allow staff to sign in from any device.
ALTER TABLE staff_provisions ADD COLUMN IF NOT EXISTS password TEXT;

CREATE TABLE IF NOT EXISTS floor_meta (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  floor_revision  INTEGER NOT NULL,
  auto_dispatch   BOOLEAN NOT NULL DEFAULT FALSE
);

-- Existing projects: add the auto-dispatch flag if the table already existed.
ALTER TABLE floor_meta ADD COLUMN IF NOT EXISTS auto_dispatch BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE floor_meta ADD COLUMN IF NOT EXISTS staff_passwords JSONB NOT NULL DEFAULT '{}'::jsonb;

-- The Next.js server signs in with the publishable key (anon).
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE users TO anon, authenticated, service_role;
ALTER TABLE field_crews DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE field_crews TO anon, authenticated, service_role;
ALTER TABLE feeders DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE feeders TO anon, authenticated, service_role;
ALTER TABLE meters DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE meters TO anon, authenticated, service_role;
ALTER TABLE vending_telemetry_logs DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE vending_telemetry_logs TO anon, authenticated, service_role;
ALTER TABLE master_incidents DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE master_incidents TO anon, authenticated, service_role;
ALTER TABLE outage_reports DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE outage_reports TO anon, authenticated, service_role;
ALTER TABLE revenue_investigations DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE revenue_investigations TO anon, authenticated, service_role;
ALTER TABLE immutable_audit_logs DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE immutable_audit_logs TO anon, authenticated, service_role;
ALTER TABLE live_events DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE live_events TO anon, authenticated, service_role;
ALTER TABLE priority_weights DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE priority_weights TO anon, authenticated, service_role;
ALTER TABLE removed_staff DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE removed_staff TO anon, authenticated, service_role;
ALTER TABLE staff_provisions DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE staff_provisions TO anon, authenticated, service_role;
ALTER TABLE floor_meta DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE floor_meta TO anon, authenticated, service_role;
