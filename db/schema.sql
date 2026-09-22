-- =============================================================================
-- ElectroRaid — City of Tshwane
-- Smart Outage Management & Revenue Protection
-- PostgreSQL 16 + PostGIS 3.4 schema
--
-- This file is the production contract. The Next.js app mirrors these
-- structures in an in-memory store so the platform can run without a
-- database, while remaining a 1:1 mapping of tables, constraints, and GIS
-- functions.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- -----------------------------------------------------------------------------
-- Enumerations
-- -----------------------------------------------------------------------------

CREATE TYPE user_role AS ENUM (
  'resident',
  'dispatcher',
  'technician',
  'revenue_inspector',
  'executive',
  'admin',
  'system'
);

CREATE TYPE outage_classification AS ENUM (
  'no_power',
  'partial_outage',
  'voltage_fluctuation',
  'cable_fault',
  'transformer_fault',
  'streetlight',
  'meter_issue',
  'izinyoka_tip',
  'other'
);

CREATE TYPE incident_status AS ENUM (
  'open',
  'clustered',
  'dispatched',
  'en_route',
  'on_site',
  'resolved',
  'closed'
);

CREATE TYPE crew_status AS ENUM (
  'available',
  'en_route',
  'on_site',
  'off_duty'
);

CREATE TYPE specialization AS ENUM (
  'maintenance',
  'revenue_protection'
);

CREATE TYPE feeder_status AS ENUM (
  'ENERGIZED',
  'DEENERGIZED',
  'FAULT'
);

CREATE TYPE meter_status AS ENUM (
  'active',
  'disconnected',
  'suspected_bypass',
  'confirmed_tamper'
);

CREATE TYPE investigation_type AS ENUM (
  'zero_consumption',
  'izinyoka_tip',
  'meter_tamper',
  'illegal_connection'
);

CREATE TYPE investigation_status AS ENUM (
  'flagged',
  'assigned',
  'en_route',
  'on_site',
  'evidence_captured',
  'fine_issued',
  'closed_no_finding',
  'closed_recovered'
);

CREATE TYPE report_channel AS ENUM (
  'app',
  'call_centre',
  'sms',
  'whatsapp',
  'walk_in',
  'anonymous_tip',
  'system_anomaly'
);

-- -----------------------------------------------------------------------------
-- Users & field force
-- -----------------------------------------------------------------------------

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_no     TEXT UNIQUE,
  full_name       TEXT NOT NULL,
  email           TEXT UNIQUE,
  phone           TEXT,
  role            user_role NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE field_crews (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users (id),
  callsign              TEXT NOT NULL UNIQUE,
  specialization        specialization NOT NULL,
  skill_certifications  TEXT[] NOT NULL DEFAULT '{}',
  status                crew_status NOT NULL DEFAULT 'available',
  -- Live GPS. Geography (not geometry) so ST_DWithin uses metres on the spheroid.
  location              GEOGRAPHY(POINT, 4326) NOT NULL,
  vehicle_reg           TEXT,
  active_queue_size     INTEGER NOT NULL DEFAULT 0 CHECK (active_queue_size >= 0),
  last_gps_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX field_crews_location_gix ON field_crews USING GIST (location);
CREATE INDEX field_crews_spec_status_idx ON field_crews (specialization, status);

-- -----------------------------------------------------------------------------
-- Grid topology (feeders / transformers) — used by the anomaly engine
-- -----------------------------------------------------------------------------

CREATE TABLE feeders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  suburb      TEXT NOT NULL,
  status      feeder_status NOT NULL DEFAULT 'ENERGIZED',
  location    GEOGRAPHY(POINT, 4326) NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE meters (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_number    TEXT NOT NULL UNIQUE,
  meter_number      TEXT NOT NULL UNIQUE,
  household_name    TEXT NOT NULL,
  address           TEXT NOT NULL,
  suburb            TEXT NOT NULL,
  location          GEOGRAPHY(POINT, 4326) NOT NULL,
  feeder_id         UUID NOT NULL REFERENCES feeders (id),
  status            meter_status NOT NULL DEFAULT 'active',
  tariff_cents_kwh  INTEGER NOT NULL DEFAULT 285,
  installed_at      TIMESTAMPTZ NOT NULL,
  last_purchase_at  TIMESTAMPTZ
);

CREATE INDEX meters_location_gix ON meters USING GIST (location);
CREATE INDEX meters_feeder_idx ON meters (feeder_id);

-- Every prepaid vend is an immutable telemetry row. The anomaly scanner
-- derives "days since last purchase" from this log, never from a mutable
-- meter.balance field.
CREATE TABLE vending_telemetry_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meter_id      UUID NOT NULL REFERENCES meters (id),
  purchased_at  TIMESTAMPTZ NOT NULL,
  kwh           NUMERIC(12, 3) NOT NULL CHECK (kwh >= 0),
  amount_zar    NUMERIC(12, 2) NOT NULL CHECK (amount_zar >= 0),
  vendor_id     TEXT NOT NULL,
  token_masked  TEXT NOT NULL
);

CREATE INDEX vending_meter_time_idx ON vending_telemetry_logs (meter_id, purchased_at DESC);

-- -----------------------------------------------------------------------------
-- Outage ingestion & spatially-deduplicated master incidents
-- -----------------------------------------------------------------------------

CREATE TABLE master_incidents (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference               TEXT NOT NULL UNIQUE,
  classification          outage_classification NOT NULL,
  status                  incident_status NOT NULL DEFAULT 'open',
  -- Centroid recomputed on every merge (see merge_report_into_incident).
  location                GEOGRAPHY(POINT, 4326) NOT NULL,
  address                 TEXT NOT NULL,
  suburb                  TEXT NOT NULL,
  feeder_id               UUID REFERENCES feeders (id),
  affected_households     INTEGER NOT NULL DEFAULT 1 CHECK (affected_households >= 1),
  critical_infrastructure BOOLEAN NOT NULL DEFAULT FALSE,
  priority_score          NUMERIC(10, 2) NOT NULL DEFAULT 0,
  assigned_crew_id        UUID REFERENCES field_crews (id),
  dispatched_at           TIMESTAMPTZ,
  on_site_at              TIMESTAMPTZ,
  resolved_at             TIMESTAMPTZ,
  resident_confirmed_at   TIMESTAMPTZ,
  qa_rating               SMALLINT CHECK (qa_rating IS NULL OR qa_rating BETWEEN 1 AND 5),
  qa_notes                TEXT,
  qa_by                   UUID REFERENCES users (id),
  first_reported_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX master_incidents_location_gix ON master_incidents USING GIST (location);
CREATE INDEX master_incidents_active_idx
  ON master_incidents (last_activity_at DESC)
  WHERE status NOT IN ('resolved', 'closed');

CREATE TABLE outage_reports (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_incident_id  UUID NOT NULL REFERENCES master_incidents (id),
  account_number      TEXT,
  reporter_name       TEXT,
  contact_phone       TEXT,
  location            GEOGRAPHY(POINT, 4326) NOT NULL,
  address             TEXT NOT NULL,
  classification      outage_classification NOT NULL,
  channel             report_channel NOT NULL,
  notes               TEXT,
  reported_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX outage_reports_incident_idx ON outage_reports (master_incident_id);
CREATE INDEX outage_reports_location_gix ON outage_reports USING GIST (location);

-- -----------------------------------------------------------------------------
-- Revenue protection investigations
-- -----------------------------------------------------------------------------

CREATE TABLE revenue_investigations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference             TEXT NOT NULL UNIQUE,
  type                  investigation_type NOT NULL,
  status                investigation_status NOT NULL DEFAULT 'flagged',
  meter_id              UUID REFERENCES meters (id),
  feeder_id             UUID REFERENCES feeders (id),
  location              GEOGRAPHY(POINT, 4326) NOT NULL,
  address               TEXT NOT NULL,
  suburb                TEXT NOT NULL,
  anomaly_risk_score    NUMERIC(5, 2) NOT NULL CHECK (anomaly_risk_score BETWEEN 0 AND 100),
  days_zero_consumption INTEGER,
  assigned_crew_id      UUID REFERENCES field_crews (id),
  dispatched_at         TIMESTAMPTZ,
  on_site_at            TIMESTAMPTZ,
  fine_amount_zar       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  backbill_zar          NUMERIC(12, 2) NOT NULL DEFAULT 0,
  penalty_zar           NUMERIC(12, 2) NOT NULL DEFAULT 0,
  evidence              JSONB NOT NULL DEFAULT '[]'::JSONB,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at             TIMESTAMPTZ
);

CREATE INDEX investigations_status_idx ON revenue_investigations (status, anomaly_risk_score DESC);
CREATE INDEX investigations_location_gix ON revenue_investigations USING GIST (location);

-- -----------------------------------------------------------------------------
-- Immutable audit log — append-only, hash-chained
-- -----------------------------------------------------------------------------
-- No UPDATE or DELETE grants are issued to application roles. A BEFORE UPDATE
-- OR DELETE trigger hard-fails any mutation attempt. Each row stores the SHA-256
-- of (prev_hash || canonical_payload) so tampering is detectable.

CREATE TABLE immutable_audit_logs (
  id            BIGSERIAL PRIMARY KEY,
  event_id      UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  actor_id      UUID REFERENCES users (id),
  actor_role    user_role NOT NULL,
  action_type   TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  location      GEOGRAPHY(POINT, 4326),
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload       JSONB NOT NULL,
  prev_hash     TEXT,
  entry_hash    TEXT NOT NULL
);

CREATE INDEX audit_entity_idx ON immutable_audit_logs (entity_type, entity_id, occurred_at);
CREATE INDEX audit_actor_idx ON immutable_audit_logs (actor_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION forbid_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'immutable_audit_logs is append-only';
END;
$$;

CREATE TRIGGER immutable_audit_no_update
  BEFORE UPDATE OR DELETE ON immutable_audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutation();

-- -----------------------------------------------------------------------------
-- Priority scoring
--   Priority = (affected_households * w1)
--            + (critical_infrastructure_flag * w2)
--            + (elapsed_minutes * w3)
--
-- Weights are stored so the control room can retune without a deploy.
-- -----------------------------------------------------------------------------

CREATE TABLE priority_weights (
  id         SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  w_households NUMERIC(8, 3) NOT NULL DEFAULT 12.0,
  w_critical   NUMERIC(8, 3) NOT NULL DEFAULT 280.0,
  w_elapsed    NUMERIC(8, 3) NOT NULL DEFAULT 1.8
);

INSERT INTO priority_weights (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION compute_priority_score(
  p_households INTEGER,
  p_critical   BOOLEAN,
  p_first_reported_at TIMESTAMPTZ,
  p_now        TIMESTAMPTZ DEFAULT NOW()
) RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
  SELECT
    (p_households * w.w_households)
    + ((CASE WHEN p_critical THEN 1 ELSE 0 END) * w.w_critical)
    + ((EXTRACT(EPOCH FROM (p_now - p_first_reported_at)) / 60.0) * w.w_elapsed)
  FROM priority_weights w
  WHERE w.id = 1;
$$;

-- -----------------------------------------------------------------------------
-- Spatial deduplication — 500 m geofence, 2-hour active window
-- Equivalent TypeScript: src/lib/engines/spatial.ts
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION find_matching_master_incident(
  p_lon        DOUBLE PRECISION,
  p_lat        DOUBLE PRECISION,
  p_radius_m   DOUBLE PRECISION DEFAULT 500,
  p_window_h   INTEGER DEFAULT 2
) RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT mi.id
  FROM master_incidents mi
  WHERE mi.status NOT IN ('resolved', 'closed')
    AND mi.last_activity_at >= NOW() - make_interval(hours => p_window_h)
    AND ST_DWithin(
      mi.location,
      ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography,
      p_radius_m
    )
  ORDER BY ST_Distance(
    mi.location,
    ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography
  )
  LIMIT 1;
$$;

-- -----------------------------------------------------------------------------
-- Constraint-based dispatch: nearest available crew of the required
-- specialisation, penalised by current queue size.
--   score = distance_km * 12 + queue * 18
-- Equivalent TypeScript: src/lib/engines/dispatch.ts
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION recommend_crew(
  p_lon             DOUBLE PRECISION,
  p_lat             DOUBLE PRECISION,
  p_specialization  specialization
) RETURNS TABLE (
  crew_id     UUID,
  callsign    TEXT,
  distance_m  DOUBLE PRECISION,
  queue_size  INTEGER,
  score       NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    fc.id,
    fc.callsign,
    ST_Distance(
      fc.location,
      ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography
    ) AS distance_m,
    fc.active_queue_size,
    (
      (ST_Distance(
        fc.location,
        ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography
      ) / 1000.0) * 12
      + (fc.active_queue_size * 18)
    )::NUMERIC AS score
  FROM field_crews fc
  WHERE fc.specialization = p_specialization
    AND fc.status IN ('available', 'en_route')
  ORDER BY score ASC, distance_m ASC
  LIMIT 5;
$$;

-- -----------------------------------------------------------------------------
-- Zero-consumption anomaly scan
-- Trigger: active meter, 0 kWh purchased for >= 60 days
-- Cross-check: linked feeder status IS ENERGIZED
-- Equivalent TypeScript: src/lib/engines/anomaly.ts
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW zero_consumption_candidates AS
SELECT
  m.id AS meter_id,
  m.account_number,
  m.address,
  m.suburb,
  f.status AS feeder_status,
  COALESCE(v.last_purchase_at, m.installed_at) AS last_energy_at,
  EXTRACT(DAY FROM NOW() - COALESCE(v.last_purchase_at, m.installed_at))::INTEGER AS days_zero,
  -- Risk 0–100: days beyond the 60-day floor, feeder confirmation, suburb density.
  LEAST(100, GREATEST(0,
    40
    + LEAST(40, ((EXTRACT(DAY FROM NOW() - COALESCE(v.last_purchase_at, m.installed_at)) - 60) * 0.8))
    + (CASE WHEN f.status = 'ENERGIZED' THEN 20 ELSE 0 END)
  )) AS anomaly_risk_score
FROM meters m
JOIN feeders f ON f.id = m.feeder_id
LEFT JOIN LATERAL (
  SELECT MAX(purchased_at) AS last_purchase_at
  FROM vending_telemetry_logs
  WHERE meter_id = m.id AND kwh > 0
) v ON TRUE
WHERE m.status = 'active'
  AND f.status = 'ENERGIZED'
  AND COALESCE(v.last_purchase_at, m.installed_at) <= NOW() - INTERVAL '60 days';

-- Application role: write path for ops, read-only on the audit table.
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO electroraid_app;
-- REVOKE UPDATE, DELETE ON immutable_audit_logs FROM electroraid_app;
-- GRANT INSERT, SELECT ON immutable_audit_logs TO electroraid_app;
