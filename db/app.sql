-- ElectroRaid application database.
-- Postgres SQL that the Next.js server runs locally (embedded Postgres).
-- Map points are lon/lat. db/schema.sql remains the PostGIS contract for a
-- full PostgreSQL install; this file matches the identifiers the app already uses.

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

CREATE TABLE IF NOT EXISTS floor_meta (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  floor_revision  INTEGER NOT NULL
);
