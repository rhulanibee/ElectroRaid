/**
 * Persists the ops floor in the Supabase Postgres project.
 * Tables are created by db/supabase.sql. The publishable key can read and
 * write rows after that script has been run.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  AuditLog,
  Feeder,
  FieldCrew,
  LiveEvent,
  MasterIncident,
  Meter,
  OutageReport,
  PriorityWeights,
  RevenueInvestigation,
  StaffProvision,
  User,
  VendingTelemetryLog,
} from "./types";

export interface SqlFloor {
  version: 1;
  users: User[];
  crews: FieldCrew[];
  feeders: Feeder[];
  meters: Meter[];
  vending: VendingTelemetryLog[];
  incidents: MasterIncident[];
  reports: OutageReport[];
  investigations: RevenueInvestigation[];
  audit: AuditLog[];
  events: LiveEvent[];
  provisioned: StaffProvision[];
  removedIds: string[];
  floorRevision: number;
  weights: PriorityWeights;
}

let client: SupabaseClient | null = null;
let acceptingSaves = false;
let saveChain: Promise<void> = Promise.resolve();

function supabaseUrl() {
  return (
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ""
  );
}

function supabaseKey() {
  return (
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ""
  );
}

export function supabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseKey());
}

function db(): SupabaseClient {
  if (!client) {
    const url = supabaseUrl();
    const key = supabaseKey();
    if (!url || !key) throw new Error("Supabase env is not set");
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

async function tableRows(table: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await db().from(table).select("*");
  if (error) {
    if (error.code === "PGRST205" || /schema cache/i.test(error.message)) {
      throw new Error(
        "Supabase is connected, but the ElectroRaid tables are not there yet. Run db/supabase.sql in the Supabase SQL editor.",
      );
    }
    throw new Error(`${table}: ${error.message}`);
  }
  return (data ?? []) as Record<string, unknown>[];
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date(String(value)).toISOString();
}

function isoOrNull(value: unknown): string | null {
  if (value == null) return null;
  return iso(value);
}

function num(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

function numOrNull(value: unknown): number | null {
  if (value == null) return null;
  return num(value);
}

function jsonValue(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

export function queueSqlSave(floor: SqlFloor) {
  if (!acceptingSaves || !supabaseConfigured()) return;
  saveChain = saveChain
    .then(() => writeFloor(floor))
    .catch((error: unknown) => {
      console.error("Supabase floor save failed", error);
    });
}

export async function loadFloor(): Promise<SqlFloor | null> {
  if (!supabaseConfigured()) return null;
  const users = await tableRows("users");
  if (users.length === 0) return null;
  const [
    crews,
    feeders,
    meters,
    vending,
    incidents,
    reports,
    investigations,
    audit,
    events,
    removed,
    provisioned,
    meta,
    weights,
  ] = await Promise.all([
    tableRows("field_crews"),
    tableRows("feeders"),
    tableRows("meters"),
    tableRows("vending_telemetry_logs"),
    tableRows("master_incidents"),
    tableRows("outage_reports"),
    tableRows("revenue_investigations"),
    tableRows("immutable_audit_logs"),
    tableRows("live_events"),
    tableRows("removed_staff"),
    tableRows("staff_provisions"),
    tableRows("floor_meta"),
    tableRows("priority_weights"),
  ]);
  const weight = weights[0];
  return {
    version: 1,
    users: users.map(mapUser),
    crews: crews.map(mapCrew),
    feeders: feeders.map(mapFeeder),
    meters: meters.map(mapMeter),
    vending: vending.map(mapVend),
    incidents: incidents.map(mapIncident),
    reports: reports.map(mapReport),
    investigations: investigations.map(mapInvestigation),
    audit: audit.map(mapAudit).sort((a, b) => a.id - b.id),
    events: events.map(mapEvent).sort((a, b) => a.at.localeCompare(b.at)),
    provisioned: provisioned.map(mapProvision),
    removedIds: removed.map((row) => String(row.user_id)),
    floorRevision: num(meta[0]?.floor_revision ?? 0),
    weights: {
      wHouseholds: num(weight?.w_households ?? 12),
      wCritical: num(weight?.w_critical ?? 280),
      wElapsed: num(weight?.w_elapsed ?? 1.8),
    },
  };
}

export async function seedFloor(floor: SqlFloor) {
  if (!supabaseConfigured()) return;
  await writeFloor(floor);
  acceptingSaves = true;
}

export function enableSqlSaves() {
  if (supabaseConfigured()) acceptingSaves = true;
}

async function clearTable(table: string, column = "id", mode: "text" | "int" = "text") {
  const query = db().from(table).delete();
  const { error } =
    mode === "int" ? await query.gte(column, 0) : await query.neq(column, "");
  if (error) throw new Error(`${table} clear: ${error.message}`);
}

async function insertRows(table: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const chunkSize = 100;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await db().from(table).insert(chunk);
    if (error) throw new Error(`${table} insert: ${error.message}`);
  }
}

async function writeFloor(floor: SqlFloor) {
  await clearTable("outage_reports");
  await clearTable("vending_telemetry_logs");
  await clearTable("revenue_investigations");
  await clearTable("master_incidents");
  await clearTable("meters");
  await clearTable("field_crews");
  await clearTable("feeders");
  await clearTable("users");
  await clearTable("live_events");
  await clearTable("removed_staff", "user_id");
  await clearTable("staff_provisions");
  await clearTable("immutable_audit_logs", "id", "int");
  await clearTable("priority_weights", "id", "int");
  await clearTable("floor_meta", "id", "int");

  await insertRows(
    "users",
    floor.users.map((user) => ({
      id: user.id,
      employee_no: user.employeeNo,
      full_name: user.fullName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      is_active: user.isActive,
      created_at: user.createdAt,
    })),
  );
  await insertRows(
    "feeders",
    floor.feeders.map((feeder) => ({
      id: feeder.id,
      code: feeder.code,
      name: feeder.name,
      suburb: feeder.suburb,
      status: feeder.status,
      lon: feeder.location.lon,
      lat: feeder.location.lat,
      updated_at: feeder.updatedAt,
    })),
  );
  await insertRows(
    "field_crews",
    floor.crews.map((crew) => ({
      id: crew.id,
      user_id: crew.userId,
      callsign: crew.callsign,
      specialization: crew.specialization,
      skill_certifications: crew.skillCertifications,
      status: crew.status,
      lon: crew.location.lon,
      lat: crew.location.lat,
      vehicle_reg: crew.vehicleReg,
      active_queue_size: crew.activeQueueSize,
      last_gps_at: crew.lastGpsAt,
    })),
  );
  await insertRows(
    "meters",
    floor.meters.map((meter) => ({
      id: meter.id,
      account_number: meter.accountNumber,
      meter_number: meter.meterNumber,
      household_name: meter.householdName,
      address: meter.address,
      suburb: meter.suburb,
      lon: meter.location.lon,
      lat: meter.location.lat,
      feeder_id: meter.feederId,
      status: meter.status,
      tariff_cents_kwh: meter.tariffCentsKwh,
      installed_at: meter.installedAt,
      last_purchase_at: meter.lastPurchaseAt,
    })),
  );
  await insertRows(
    "vending_telemetry_logs",
    floor.vending.map((vend) => ({
      id: vend.id,
      meter_id: vend.meterId,
      purchased_at: vend.purchasedAt,
      kwh: vend.kwh,
      amount_zar: vend.amountZar,
      vendor_id: vend.vendorId,
      token_masked: vend.tokenMasked,
    })),
  );
  await insertRows(
    "master_incidents",
    floor.incidents.map((incident) => ({
      id: incident.id,
      reference: incident.reference,
      classification: incident.classification,
      status: incident.status,
      lon: incident.location.lon,
      lat: incident.location.lat,
      address: incident.address,
      suburb: incident.suburb,
      feeder_id: incident.feederId,
      affected_households: incident.affectedHouseholds,
      critical_infrastructure: incident.criticalInfrastructure,
      priority_score: incident.priorityScore,
      assigned_crew_id: incident.assignedCrewId,
      dispatched_at: incident.dispatchedAt,
      on_site_at: incident.onSiteAt,
      resolved_at: incident.resolvedAt,
      resident_confirmed_at: incident.residentConfirmedAt ?? null,
      qa_rating: incident.qaRating ?? null,
      qa_notes: incident.qaNotes ?? null,
      qa_by: incident.qaBy ?? null,
      first_reported_at: incident.firstReportedAt,
      last_activity_at: incident.lastActivityAt,
    })),
  );
  await insertRows(
    "outage_reports",
    floor.reports.map((report) => ({
      id: report.id,
      master_incident_id: report.masterIncidentId,
      account_number: report.accountNumber,
      reporter_name: report.reporterName,
      contact_phone: report.contactPhone,
      lon: report.location.lon,
      lat: report.location.lat,
      address: report.address,
      classification: report.classification,
      channel: report.channel,
      notes: report.notes,
      reported_at: report.reportedAt,
    })),
  );
  await insertRows(
    "revenue_investigations",
    floor.investigations.map((item) => ({
      id: item.id,
      reference: item.reference,
      type: item.type,
      status: item.status,
      meter_id: item.meterId,
      feeder_id: item.feederId,
      lon: item.location.lon,
      lat: item.location.lat,
      address: item.address,
      suburb: item.suburb,
      anomaly_risk_score: item.anomalyRiskScore,
      days_zero_consumption: item.daysZeroConsumption,
      assigned_crew_id: item.assignedCrewId,
      dispatched_at: item.dispatchedAt,
      on_site_at: item.onSiteAt,
      fine_amount_zar: item.fineAmountZar,
      backbill_zar: item.backbillZar,
      penalty_zar: item.penaltyZar,
      evidence: item.evidence ?? [],
      notes: item.notes,
      created_at: item.createdAt,
      closed_at: item.closedAt,
    })),
  );
  await insertRows(
    "immutable_audit_logs",
    floor.audit.map((row) => ({
      id: row.id,
      event_id: row.eventId,
      actor_id: row.actorId,
      actor_role: row.actorRole,
      action_type: row.actionType,
      entity_type: row.entityType,
      entity_id: row.entityId,
      lon: row.location?.lon ?? null,
      lat: row.location?.lat ?? null,
      occurred_at: row.occurredAt,
      payload: row.payload ?? {},
      prev_hash: row.prevHash,
      entry_hash: row.entryHash,
    })),
  );
  await insertRows(
    "live_events",
    floor.events.map((event) => ({
      id: event.id,
      type: event.type,
      title: event.title,
      detail: event.detail,
      at: event.at,
      severity: event.severity,
      entity_type: event.entityType ?? null,
      entity_id: event.entityId ?? null,
    })),
  );
  await insertRows(
    "removed_staff",
    floor.removedIds.map((userId) => ({ user_id: userId })),
  );
  await insertRows(
    "staff_provisions",
    floor.provisioned.map((person) => ({
      id: person.id,
      full_name: person.fullName,
      email: person.email,
      phone: person.phone,
      role: person.role,
      crew_id: person.crewId,
      callsign: person.callsign,
    })),
  );
  await insertRows("priority_weights", [
    {
      id: 1,
      w_households: floor.weights.wHouseholds,
      w_critical: floor.weights.wCritical,
      w_elapsed: floor.weights.wElapsed,
    },
  ]);
  await insertRows("floor_meta", [{ id: 1, floor_revision: floor.floorRevision }]);
}

function mapUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    employeeNo: row.employee_no == null ? null : String(row.employee_no),
    fullName: String(row.full_name),
    email: row.email == null ? null : String(row.email),
    phone: row.phone == null ? null : String(row.phone),
    role: row.role as User["role"],
    isActive: Boolean(row.is_active),
    createdAt: iso(row.created_at),
  };
}

function mapCrew(row: Record<string, unknown>): FieldCrew {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    callsign: String(row.callsign),
    specialization: row.specialization as FieldCrew["specialization"],
    skillCertifications: Array.isArray(row.skill_certifications) ? row.skill_certifications.map(String) : [],
    status: row.status as FieldCrew["status"],
    location: { lon: num(row.lon), lat: num(row.lat) },
    vehicleReg: row.vehicle_reg == null ? "" : String(row.vehicle_reg),
    activeQueueSize: num(row.active_queue_size),
    lastGpsAt: iso(row.last_gps_at),
  };
}

function mapFeeder(row: Record<string, unknown>): Feeder {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    suburb: String(row.suburb),
    status: row.status as Feeder["status"],
    location: { lon: num(row.lon), lat: num(row.lat) },
    updatedAt: iso(row.updated_at),
  };
}

function mapMeter(row: Record<string, unknown>): Meter {
  return {
    id: String(row.id),
    accountNumber: String(row.account_number),
    meterNumber: String(row.meter_number),
    householdName: String(row.household_name),
    address: String(row.address),
    suburb: String(row.suburb),
    location: { lon: num(row.lon), lat: num(row.lat) },
    feederId: String(row.feeder_id),
    status: row.status as Meter["status"],
    tariffCentsKwh: num(row.tariff_cents_kwh),
    installedAt: iso(row.installed_at),
    lastPurchaseAt: isoOrNull(row.last_purchase_at),
  };
}

function mapVend(row: Record<string, unknown>): VendingTelemetryLog {
  return {
    id: String(row.id),
    meterId: String(row.meter_id),
    purchasedAt: iso(row.purchased_at),
    kwh: num(row.kwh),
    amountZar: num(row.amount_zar),
    vendorId: String(row.vendor_id),
    tokenMasked: String(row.token_masked),
  };
}

function mapIncident(row: Record<string, unknown>): MasterIncident {
  return {
    id: String(row.id),
    reference: String(row.reference),
    classification: row.classification as MasterIncident["classification"],
    status: row.status as MasterIncident["status"],
    location: { lon: num(row.lon), lat: num(row.lat) },
    address: String(row.address),
    suburb: String(row.suburb),
    feederId: row.feeder_id == null ? null : String(row.feeder_id),
    affectedHouseholds: num(row.affected_households),
    criticalInfrastructure: Boolean(row.critical_infrastructure),
    priorityScore: num(row.priority_score),
    assignedCrewId: row.assigned_crew_id == null ? null : String(row.assigned_crew_id),
    dispatchedAt: isoOrNull(row.dispatched_at),
    onSiteAt: isoOrNull(row.on_site_at),
    resolvedAt: isoOrNull(row.resolved_at),
    firstReportedAt: iso(row.first_reported_at),
    lastActivityAt: iso(row.last_activity_at),
    residentConfirmedAt: isoOrNull(row.resident_confirmed_at),
    qaRating: numOrNull(row.qa_rating),
    qaNotes: row.qa_notes == null ? null : String(row.qa_notes),
    qaBy: row.qa_by == null ? null : String(row.qa_by),
  };
}

function mapReport(row: Record<string, unknown>): OutageReport {
  return {
    id: String(row.id),
    masterIncidentId: String(row.master_incident_id),
    accountNumber: row.account_number == null ? null : String(row.account_number),
    reporterName: row.reporter_name == null ? null : String(row.reporter_name),
    contactPhone: row.contact_phone == null ? null : String(row.contact_phone),
    location: { lon: num(row.lon), lat: num(row.lat) },
    address: String(row.address),
    classification: row.classification as OutageReport["classification"],
    channel: row.channel as OutageReport["channel"],
    notes: row.notes == null ? null : String(row.notes),
    reportedAt: iso(row.reported_at),
  };
}

function mapInvestigation(row: Record<string, unknown>): RevenueInvestigation {
  const evidence = jsonValue(row.evidence);
  return {
    id: String(row.id),
    reference: String(row.reference),
    type: row.type as RevenueInvestigation["type"],
    status: row.status as RevenueInvestigation["status"],
    meterId: row.meter_id == null ? null : String(row.meter_id),
    feederId: row.feeder_id == null ? null : String(row.feeder_id),
    location: { lon: num(row.lon), lat: num(row.lat) },
    address: String(row.address),
    suburb: String(row.suburb),
    anomalyRiskScore: num(row.anomaly_risk_score),
    daysZeroConsumption: numOrNull(row.days_zero_consumption),
    assignedCrewId: row.assigned_crew_id == null ? null : String(row.assigned_crew_id),
    dispatchedAt: isoOrNull(row.dispatched_at),
    onSiteAt: isoOrNull(row.on_site_at),
    fineAmountZar: num(row.fine_amount_zar),
    backbillZar: num(row.backbill_zar),
    penaltyZar: num(row.penalty_zar),
    evidence: Array.isArray(evidence) ? evidence : [],
    notes: row.notes == null ? null : String(row.notes),
    createdAt: iso(row.created_at),
    closedAt: isoOrNull(row.closed_at),
  };
}

function mapAudit(row: Record<string, unknown>): AuditLog {
  const payload = jsonValue(row.payload);
  return {
    id: num(row.id),
    eventId: String(row.event_id),
    actorId: row.actor_id == null ? null : String(row.actor_id),
    actorRole: row.actor_role as AuditLog["actorRole"],
    actionType: String(row.action_type),
    entityType: String(row.entity_type),
    entityId: String(row.entity_id),
    location:
      row.lon == null || row.lat == null ? null : { lon: num(row.lon), lat: num(row.lat) },
    occurredAt: iso(row.occurred_at),
    payload: payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {},
    prevHash: row.prev_hash == null ? null : String(row.prev_hash),
    entryHash: String(row.entry_hash),
  };
}

function mapEvent(row: Record<string, unknown>): LiveEvent {
  return {
    id: String(row.id),
    type: String(row.type),
    title: String(row.title),
    detail: String(row.detail),
    at: iso(row.at),
    severity: row.severity as LiveEvent["severity"],
    entityType: row.entity_type == null ? undefined : String(row.entity_type),
    entityId: row.entity_id == null ? undefined : String(row.entity_id),
  };
}

function mapProvision(row: Record<string, unknown>): StaffProvision {
  return {
    id: String(row.id),
    fullName: String(row.full_name),
    email: String(row.email),
    phone: row.phone == null ? null : String(row.phone),
    role: row.role as StaffProvision["role"],
    crewId: row.crew_id == null ? null : String(row.crew_id),
    callsign: row.callsign == null ? null : String(row.callsign),
  };
}
