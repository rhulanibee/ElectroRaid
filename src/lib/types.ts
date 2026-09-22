/**
 * Domain types for ElectroRaid. These mirror the PostGIS schema in db/schema.sql
 * so the in-memory prototype and a future Postgres deployment share one model.
 */

export type UserRole =
  | "resident"
  | "dispatcher"
  | "technician"
  | "revenue_inspector"
  | "executive"
  | "admin"
  | "system";

export type StaffRole = "dispatcher" | "technician" | "revenue_inspector";

/** A municipal user an administrator provisions onto the live ops floor. */
export interface StaffProvision {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: StaffRole;
  crewId: string | null;
  callsign: string | null;
  /** Sign-in password. Stored on the live floor so any device can authenticate. */
  password?: string | null;
}

export type OutageClassification =
  | "no_power"
  | "partial_outage"
  | "voltage_fluctuation"
  | "cable_fault"
  | "transformer_fault"
  | "streetlight"
  | "meter_issue"
  | "izinyoka_tip"
  | "other";

export type IncidentStatus =
  | "open"
  | "clustered"
  | "dispatched"
  | "en_route"
  | "on_site"
  | "resolved"
  | "closed";

export type CrewStatus = "available" | "en_route" | "on_site" | "off_duty";
export type Specialization = "maintenance" | "revenue_protection";
export type FeederStatus = "ENERGIZED" | "DEENERGIZED" | "FAULT";
export type MeterStatus =
  | "active"
  | "disconnected"
  | "suspected_bypass"
  | "confirmed_tamper";

export type InvestigationType =
  | "zero_consumption"
  | "izinyoka_tip"
  | "meter_tamper"
  | "illegal_connection";

export type InvestigationStatus =
  | "flagged"
  | "assigned"
  | "en_route"
  | "on_site"
  | "evidence_captured"
  | "fine_issued"
  | "closed_no_finding"
  | "closed_recovered";

export type ReportChannel =
  | "app"
  | "call_centre"
  | "sms"
  | "whatsapp"
  | "walk_in"
  | "anonymous_tip"
  | "system_anomaly";

/** WGS-84 point. lon/lat order matches PostGIS ST_MakePoint(lon, lat). */
export interface GeoPoint {
  lon: number;
  lat: number;
}

export interface User {
  id: string;
  employeeNo: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export interface FieldCrew {
  id: string;
  userId: string;
  callsign: string;
  specialization: Specialization;
  skillCertifications: string[];
  status: CrewStatus;
  location: GeoPoint;
  vehicleReg: string;
  activeQueueSize: number;
  lastGpsAt: string;
}

export interface Feeder {
  id: string;
  code: string;
  name: string;
  suburb: string;
  status: FeederStatus;
  location: GeoPoint;
  updatedAt: string;
}

export interface Meter {
  id: string;
  accountNumber: string;
  meterNumber: string;
  householdName: string;
  address: string;
  suburb: string;
  location: GeoPoint;
  feederId: string;
  status: MeterStatus;
  tariffCentsKwh: number;
  installedAt: string;
  lastPurchaseAt: string | null;
}

export interface VendingTelemetryLog {
  id: string;
  meterId: string;
  purchasedAt: string;
  kwh: number;
  amountZar: number;
  vendorId: string;
  tokenMasked: string;
}

export interface MasterIncident {
  id: string;
  reference: string;
  classification: OutageClassification;
  status: IncidentStatus;
  location: GeoPoint;
  address: string;
  suburb: string;
  feederId: string | null;
  affectedHouseholds: number;
  criticalInfrastructure: boolean;
  priorityScore: number;
  assignedCrewId: string | null;
  dispatchedAt: string | null;
  onSiteAt: string | null;
  resolvedAt: string | null;
  firstReportedAt: string;
  lastActivityAt: string;
  residentConfirmedAt?: string | null;
  qaRating?: number | null;
  qaNotes?: string | null;
  qaBy?: string | null;
}

export interface OutageReport {
  id: string;
  masterIncidentId: string;
  accountNumber: string | null;
  reporterName: string | null;
  contactPhone: string | null;
  location: GeoPoint;
  address: string;
  classification: OutageClassification;
  channel: ReportChannel;
  notes: string | null;
  reportedAt: string;
}

export interface EvidencePhoto {
  id: string;
  caption: string;
  /** SVG data URI or public path — prototype stores the image inline. */
  dataUri: string;
  capturedAt: string;
  capturedBy: string;
}

export interface RevenueInvestigation {
  id: string;
  reference: string;
  type: InvestigationType;
  status: InvestigationStatus;
  meterId: string | null;
  feederId: string | null;
  location: GeoPoint;
  address: string;
  suburb: string;
  anomalyRiskScore: number;
  daysZeroConsumption: number | null;
  assignedCrewId: string | null;
  dispatchedAt: string | null;
  onSiteAt: string | null;
  fineAmountZar: number;
  backbillZar: number;
  penaltyZar: number;
  evidence: EvidencePhoto[];
  notes: string | null;
  createdAt: string;
  closedAt: string | null;
}

export interface AuditLog {
  id: number;
  eventId: string;
  actorId: string | null;
  actorRole: UserRole;
  actionType: string;
  entityType: string;
  entityId: string;
  location: GeoPoint | null;
  occurredAt: string;
  payload: Record<string, unknown>;
  prevHash: string | null;
  entryHash: string;
}

export interface PriorityWeights {
  wHouseholds: number;
  wCritical: number;
  wElapsed: number;
}

export interface IngestReportInput {
  accountNumber?: string | null;
  reporterName?: string | null;
  contactPhone?: string | null;
  location: GeoPoint;
  address: string;
  suburb?: string;
  classification: OutageClassification;
  channel: ReportChannel;
  notes?: string | null;
  /** Used when the resident picks a type on an anonymous tip. */
  investigationType?: InvestigationType | "other";
  criticalInfrastructure?: boolean;
  feederId?: string | null;
  reportedAt?: string;
  /** Neighbour “same situation” join onto an existing open ticket. */
  joinIncidentId?: string;
}

export interface DispatchRecommendation {
  crewId: string;
  callsign: string;
  technicianName: string;
  specialization: Specialization;
  distanceM: number;
  queueSize: number;
  score: number;
  etaMinutes: number;
}

export interface LiveEvent {
  id: string;
  type: string;
  title: string;
  detail: string;
  at: string;
  severity: "info" | "warn" | "critical" | "success";
  entityType?: string;
  entityId?: string;
}

export interface PlatformSnapshot {
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
  weights: PriorityWeights;
  /** Increases when a ticket is filed or updated. GPS ticks do not change it. */
  floorRevision: number;
  /** Dispatcher toggle: auto-assign best crew to open tickets. */
  autoDispatchEnabled: boolean;
}

export const DEDUP_RADIUS_M = 500;
export const DEDUP_WINDOW_HOURS = 2;
export const ZERO_CONSUMPTION_DAYS = 60;
export const DEFAULT_WEIGHTS: PriorityWeights = {
  wHouseholds: 12,
  wCritical: 280,
  wElapsed: 1.8,
};
