/**
 * In-memory ElectroRaid store.
 *
 * Mirrors the PostGIS schema. The singleton is hung off `globalThis` so
 * Next.js hot-reload does not wipe the control-room state.
 *
 * Production swap: replace method bodies with SQL against db/schema.sql.
 * The engines (spatial, anomaly, dispatch, audit, roi) stay unchanged.
 */

import {
  investigationFromHit,
  nextInvestigationReference,
  scanZeroConsumption,
  estimateBackbillZar,
} from "./engines/anomaly";
import { appendAudit, verifyAuditChain } from "./engines/audit";
import {
  pickBestCrew,
  recommendCrews,
  recommendationForCrew,
  specializationForJob,
  type JobKind,
} from "./engines/dispatch";
import { refreshIncidentPriority } from "./engines/priority";
import { computeRoi } from "./engines/roi";
import { ingestReport } from "./engines/spatial";
import { distanceMetres, etaMinutes, lerpPoint } from "./geo";
import { hoursAgo, newId, nowIso } from "./id";
import { seedPlatform } from "./seed";
import type {
  AuditLog,
  DispatchRecommendation,
  EvidencePhoto,
  FieldCrew,
  GeoPoint,
  IngestReportInput,
  InvestigationStatus,
  InvestigationType,
  LiveEvent,
  MasterIncident,
  PlatformSnapshot,
  PriorityWeights,
  RevenueInvestigation,
  User,
} from "./types";
import { DEFAULT_WEIGHTS } from "./types";

const MAX_EVENTS = 80;

class ElectroRaidStore {
  users: User[] = [];
  crews: FieldCrew[] = [];
  feeders: PlatformSnapshot["feeders"] = [];
  meters: PlatformSnapshot["meters"] = [];
  vending: PlatformSnapshot["vending"] = [];
  incidents: MasterIncident[] = [];
  reports: PlatformSnapshot["reports"] = [];
  investigations: RevenueInvestigation[] = [];
  audit: AuditLog[] = [];
  events: LiveEvent[] = [];
  weights: PriorityWeights = { ...DEFAULT_WEIGHTS };
  listeners = new Set<(event: LiveEvent, snapshot: PlatformSnapshot) => void>();
  private chaseTimers = new Map<string, ReturnType<typeof setInterval>>();

  constructor() {
    this.reset();
  }

  reset() {
    this.stopAllChases();
    const seeded = seedPlatform();
    this.users = seeded.users;
    this.crews = seeded.crews;
    this.feeders = seeded.feeders;
    this.meters = seeded.meters;
    this.vending = seeded.vending;
    this.incidents = seeded.incidents;
    this.reports = seeded.reports;
    this.investigations = seeded.investigations;
    this.audit = seeded.audit;
    this.events = seeded.events;
    this.weights = { ...DEFAULT_WEIGHTS };
    this.emit({
      type: "platform.reset",
      title: "Ops floor reset",
      detail: "Baseline Tshwane grid state loaded for the prototype.",
      severity: "info",
    });
    this.bootChases();
  }

  snapshot(): PlatformSnapshot {
    this.recomputePriorities();
    return {
      users: this.users,
      crews: this.crews,
      feeders: this.feeders,
      meters: this.meters,
      vending: this.vending,
      incidents: [...this.incidents].sort(
        (a, b) => b.priorityScore - a.priorityScore,
      ),
      reports: this.reports,
      investigations: [...this.investigations].sort(
        (a, b) => b.anomalyRiskScore - a.anomalyRiskScore,
      ),
      audit: [...this.audit].reverse(),
      events: [...this.events].reverse(),
      weights: this.weights,
    };
  }

  ingest(input: IngestReportInput) {
    if (
      input.classification === "izinyoka_tip" ||
      input.channel === "anonymous_tip"
    ) {
      return this.ingestTip(input);
    }

    const result = ingestReport(
      this.incidents,
      this.reports,
      input,
      this.weights,
    );
    this.reports.push(result.report);

    const idx = this.incidents.findIndex((i) => i.id === result.incident.id);
    if (idx >= 0) this.incidents[idx] = result.incident;
    else this.incidents.push(result.incident);

    const actor = this.systemUser();
    this.recordAudit({
      actorId: actor.id,
      actorRole: "system",
      actionType: result.merged
        ? "REPORT_MERGED_INTO_MASTER"
        : "MASTER_INCIDENT_OPENED",
      entityType: "master_incident",
      entityId: result.incident.id,
      location: input.location,
      payload: {
        reportId: result.report.id,
        reference: result.incident.reference,
        merged: result.merged,
        matchDistanceM: result.matchDistanceM,
        affectedHouseholds: result.incident.affectedHouseholds,
        channel: input.channel,
        accountNumber: input.accountNumber ?? null,
        classification: input.classification,
      },
    });

    this.emit({
      type: result.merged ? "incident.merged" : "incident.opened",
      title: result.merged
        ? `Report clustered into ${result.incident.reference}`
        : `New master ticket ${result.incident.reference}`,
      detail: result.merged
        ? `${result.matchDistanceM} m from existing incident · ${result.incident.affectedHouseholds} households now affected`
        : `${input.address} · ${input.classification.replaceAll("_", " ")}`,
      severity: result.merged ? "warn" : "critical",
      entityType: "master_incident",
      entityId: result.incident.id,
    });

    return { kind: "outage" as const, ...result };
  }

  private ingestTip(input: IngestReportInput) {
    const tipType: InvestigationType =
      input.investigationType && input.investigationType !== "other"
        ? input.investigationType
        : "izinyoka_tip";
    const ticket: RevenueInvestigation = {
      id: newId("inv"),
      reference: nextInvestigationReference(this.investigations),
      type: tipType,
      status: "flagged",
      meterId: null,
      feederId: input.feederId ?? null,
      location: input.location,
      address: input.address,
      suburb: input.suburb ?? "Tshwane",
      anomalyRiskScore: 72,
      daysZeroConsumption: null,
      assignedCrewId: null,
      dispatchedAt: null,
      onSiteAt: null,
      fineAmountZar: 0,
      backbillZar: 0,
      penaltyZar: 0,
      evidence: [],
      notes:
        input.notes ??
        "Anonymous Izinyoka tip. Dispatch a revenue protection inspector.",
      createdAt: nowIso(),
      closedAt: null,
    };
    this.investigations.push(ticket);

    this.recordAudit({
      actorId: this.systemUser().id,
      actorRole: "resident",
      actionType: "ANONYMOUS_IZINYOKA_TIP",
      entityType: "revenue_investigation",
      entityId: ticket.id,
      location: input.location,
      payload: {
        reference: ticket.reference,
        channel: input.channel,
        address: input.address,
        notes: input.notes ?? null,
      },
    });

    this.emit({
      type: "tip.received",
      title: `Anonymous Izinyoka tip ${ticket.reference}`,
      detail: ticket.address,
      severity: "warn",
      entityType: "revenue_investigation",
      entityId: ticket.id,
    });

    return { kind: "tip" as const, investigation: ticket, merged: false };
  }

  scanAnomalies() {
    const hits = scanZeroConsumption(
      this.meters,
      this.feeders,
      this.vending,
    );
    const created: RevenueInvestigation[] = [];
    const actor = this.systemUser();

    for (const hit of hits) {
      const ticket = investigationFromHit(hit, this.investigations);
      if (!ticket) continue;
      this.investigations.push(ticket);
      created.push(ticket);

      const meterIdx = this.meters.findIndex((m) => m.id === hit.meter.id);
      if (meterIdx >= 0) {
        this.meters[meterIdx] = {
          ...this.meters[meterIdx],
          status: "suspected_bypass",
        };
      }

      this.recordAudit({
        actorId: actor.id,
        actorRole: "system",
        actionType: "ANOMALY_ZERO_CONSUMPTION_FLAGGED",
        entityType: "revenue_investigation",
        entityId: ticket.id,
        location: hit.meter.location,
        payload: {
          reference: ticket.reference,
          meterNumber: hit.meter.meterNumber,
          accountNumber: hit.meter.accountNumber,
          feeder: hit.feeder.code,
          feederStatus: hit.feeder.status,
          daysZero: hit.daysZero,
          riskScore: hit.riskScore,
        },
      });

      this.emit({
        type: "anomaly.flagged",
        title: `Izinyoka flag ${ticket.reference}`,
        detail: `${hit.meter.householdName} · ${hit.daysZero} days silent · feeder ${hit.feeder.code} ENERGIZED · risk ${hit.riskScore}`,
        severity: "critical",
        entityType: "revenue_investigation",
        entityId: ticket.id,
      });
    }

    return { hits, created };
  }

  recommend(kind: JobKind, targetId: string) {
    const target = this.jobLocation(kind, targetId);
    if (!target) return [];
    return recommendCrews(this.crews, this.users, target.location, kind);
  }

  dispatch(kind: JobKind, targetId: string, crewId?: string) {
    const target = this.jobLocation(kind, targetId);
    if (!target) throw new Error("Unknown job");

    const spec = specializationForJob(kind);
    let pick: DispatchRecommendation | null = null;
    if (crewId) {
      const chosen = this.crews.find((c) => c.id === crewId);
      if (!chosen) throw new Error("Unknown crew");
      if (chosen.specialization !== spec) {
        throw new Error("That crew cannot take this job type");
      }
      if (chosen.status === "off_duty") throw new Error("Crew is off duty");
      pick = recommendationForCrew(chosen, this.users, target.location);
    } else {
      pick = pickBestCrew(this.crews, this.users, target.location, kind);
    }

    if (!pick) throw new Error("No available crew matches this specialisation");

    const prevCrewId =
      kind === "outage"
        ? this.incidents.find((i) => i.id === targetId)?.assignedCrewId
        : this.investigations.find((i) => i.id === targetId)?.assignedCrewId;
    if (prevCrewId && prevCrewId !== pick.crewId) {
      this.releaseCrew(prevCrewId, { kind, targetId });
    }

    const crewIdx = this.crews.findIndex((c) => c.id === pick.crewId);
    const crew = this.crews[crewIdx];
    this.crews[crewIdx] = {
      ...crew,
      status: "en_route",
      activeQueueSize:
        prevCrewId === pick.crewId ? crew.activeQueueSize : crew.activeQueueSize + 1,
    };

    const dispatcher = this.users.find((u) => u.role === "dispatcher")!;
    const now = nowIso();

    if (kind === "outage") {
      const idx = this.incidents.findIndex((i) => i.id === targetId);
      this.incidents[idx] = {
        ...this.incidents[idx],
        status: "en_route",
        assignedCrewId: pick.crewId,
        dispatchedAt: now,
        lastActivityAt: now,
      };
    } else {
      const idx = this.investigations.findIndex((i) => i.id === targetId);
      this.investigations[idx] = {
        ...this.investigations[idx],
        status: "en_route",
        assignedCrewId: pick.crewId,
        dispatchedAt: now,
      };
    }

    this.recordAudit({
      actorId: dispatcher.id,
      actorRole: "dispatcher",
      actionType: "DISPATCHER_ASSIGNED_CREW",
      entityType: kind === "outage" ? "master_incident" : "revenue_investigation",
      entityId: targetId,
      location: target.location,
      payload: {
        crewId: pick.crewId,
        callsign: pick.callsign,
        technicianName: pick.technicianName,
        specialization: pick.specialization,
        distanceM: pick.distanceM,
        etaMinutes: pick.etaMinutes,
        score: pick.score,
        jobKind: kind,
      },
    });

    this.emit({
      type: "dispatch.assigned",
      title: `${pick.callsign} dispatched`,
      detail: `${pick.technicianName} · ${pick.etaMinutes} min ETA · job assigned · resident can track live`,
      severity: "info",
      entityType: kind === "outage" ? "master_incident" : "revenue_investigation",
      entityId: targetId,
    });

    this.startChase(pick.crewId, target.location, {
      entityType: kind === "outage" ? "master_incident" : "revenue_investigation",
      entityId: targetId,
      callsign: pick.callsign,
    });

    return { recommendation: pick, kind, targetId };
  }

  markOnSite(kind: JobKind, targetId: string) {
    const now = nowIso();
    const crewId =
      kind === "outage"
        ? this.incidents.find((i) => i.id === targetId)?.assignedCrewId
        : this.investigations.find((i) => i.id === targetId)?.assignedCrewId;
    if (crewId) {
      const idx = this.crews.findIndex((c) => c.id === crewId);
      if (idx >= 0) this.crews[idx] = { ...this.crews[idx], status: "on_site" };
      this.stopChase(crewId);
    }

    if (kind === "outage") {
      const idx = this.incidents.findIndex((i) => i.id === targetId);
      this.incidents[idx] = {
        ...this.incidents[idx],
        status: "on_site",
        onSiteAt: now,
        lastActivityAt: now,
      };
    } else {
      const idx = this.investigations.findIndex((i) => i.id === targetId);
      this.investigations[idx] = {
        ...this.investigations[idx],
        status: "on_site",
        onSiteAt: now,
      };
    }

    const inspector = this.actorForKind(kind);
    this.recordAudit({
      actorId: inspector.id,
      actorRole: inspector.role,
      actionType: "FIELD_UNIT_ON_SITE",
      entityType: kind === "outage" ? "master_incident" : "revenue_investigation",
      entityId: targetId,
      location: this.jobLocation(kind, targetId)?.location ?? null,
      payload: { status: "on_site", crewId },
    });

    this.emit({
      type: "field.onsite",
      title:
        kind === "outage"
          ? `Technician logged on site · ${this.incidents.find((i) => i.id === targetId)?.suburb}`
          : `Inspector logged on site · ${this.investigations.find((i) => i.id === targetId)?.suburb}`,
      detail:
        kind === "outage"
          ? `${this.incidents.find((i) => i.id === targetId)?.address}. Please watch for the crew and confirm when power returns.`
          : `Inspector on site at ${this.investigations.find((i) => i.id === targetId)?.reference}`,
      severity: "info",
      entityType: kind === "outage" ? "master_incident" : "revenue_investigation",
      entityId: targetId,
    });
  }

  addEvidence(investigationId: string, photo: Omit<EvidencePhoto, "id">) {
    const idx = this.investigations.findIndex((i) => i.id === investigationId);
    if (idx < 0) throw new Error("Unknown investigation");
    const evidence: EvidencePhoto = { ...photo, id: newId("evd") };
    const inv = this.investigations[idx];
    this.investigations[idx] = {
      ...inv,
      status: "evidence_captured",
      evidence: [...inv.evidence, evidence],
    };

    const inspector = this.users.find((u) => u.role === "revenue_inspector")!;
    this.recordAudit({
      actorId: inspector.id,
      actorRole: "revenue_inspector",
      actionType: "INSPECTOR_EVIDENCE_UPLOADED",
      entityType: "revenue_investigation",
      entityId: investigationId,
      location: inv.location,
      payload: {
        evidenceId: evidence.id,
        caption: evidence.caption,
        photoCount: this.investigations[idx].evidence.length,
      },
    });

    this.emit({
      type: "investigation.evidence",
      title: "On-site evidence logged",
      detail: `${evidence.caption} · ${this.investigations[idx].reference}`,
      severity: "warn",
      entityType: "revenue_investigation",
      entityId: investigationId,
    });

    return this.investigations[idx];
  }

  issueFine(
    investigationId: string,
    amounts?: { fine?: number; backbill?: number; penalty?: number },
  ) {
    const idx = this.investigations.findIndex((i) => i.id === investigationId);
    if (idx < 0) throw new Error("Unknown investigation");
    const inv = this.investigations[idx];
    const meter = this.meters.find((m) => m.id === inv.meterId);
    const days = inv.daysZeroConsumption ?? 60;
    const backbill =
      amounts?.backbill ??
      (meter ? estimateBackbillZar(days, meter.tariffCentsKwh) : 12480);
    const fine = amounts?.fine ?? 15000;
    const penalty = amounts?.penalty ?? 3500;

    this.investigations[idx] = {
      ...inv,
      status: "fine_issued",
      fineAmountZar: fine,
      backbillZar: backbill,
      penaltyZar: penalty,
    };

    if (meter) {
      const mIdx = this.meters.findIndex((m) => m.id === meter.id);
      this.meters[mIdx] = { ...meter, status: "confirmed_tamper" };
    }

    const inspector = this.users.find((u) => u.role === "revenue_inspector")!;
    this.recordAudit({
      actorId: inspector.id,
      actorRole: "revenue_inspector",
      actionType: "TAMPER_FINE_ISSUED",
      entityType: "revenue_investigation",
      entityId: investigationId,
      location: inv.location,
      payload: {
        reference: inv.reference,
        fineAmountZar: fine,
        backbillZar: backbill,
        penaltyZar: penalty,
        totalZar: fine + backbill + penalty,
        accountNumber: meter?.accountNumber ?? null,
      },
    });

    this.emit({
      type: "investigation.fined",
      title: `Fine issued · R${(fine + backbill + penalty).toLocaleString("en-ZA")}`,
      detail: `${inv.reference} · tamper fine + back-bill + penalty`,
      severity: "success",
      entityType: "revenue_investigation",
      entityId: investigationId,
    });

    return this.investigations[idx];
  }

  completeOutage(
    incidentId: string,
    notes: string,
    extras?: {
      serialNumber?: string;
      actorId?: string;
      /** Photo the technician attached as repair evidence. */
      repairPhoto?: { name: string; type: string; bytes: number };
    },
  ) {
    const idx = this.incidents.findIndex((i) => i.id === incidentId);
    if (idx < 0) throw new Error("Unknown incident");
    const now = nowIso();
    const incident = this.incidents[idx];
    this.incidents[idx] = {
      ...incident,
      status: "resolved",
      resolvedAt: now,
      lastActivityAt: now,
    };
    if (incident.assignedCrewId) {
      this.stopChase(incident.assignedCrewId);
      const cIdx = this.crews.findIndex((c) => c.id === incident.assignedCrewId);
      if (cIdx >= 0) {
        const crew = this.crews[cIdx];
        this.crews[cIdx] = {
          ...crew,
          status: "available",
          activeQueueSize: Math.max(0, crew.activeQueueSize - 1),
        };
      }
    }

    const tech =
      this.users.find((u) => u.id === extras?.actorId) ??
      this.users.find((u) => u.role === "technician")!;
    this.recordAudit({
      actorId: tech.id,
      actorRole: "technician",
      actionType: "TECHNICIAN_WORK_COMPLETED",
      entityType: "master_incident",
      entityId: incidentId,
      location: incident.location,
      payload: {
        reference: incident.reference,
        notes,
        component: "11kV cable joint replaced",
        serialNumber: extras?.serialNumber ?? null,
        repairPhoto: extras?.repairPhoto ?? null,
      },
    });

    this.emit({
      type: "incident.resolved",
      title: `${incident.reference} — technician finished`,
      detail: `${incident.suburb}: crew says supply is restored. Please confirm if your lights are back.`,
      severity: "success",
      entityType: "master_incident",
      entityId: incidentId,
    });
  }

  residentConfirm(incidentId: string, actorId?: string) {
    const idx = this.incidents.findIndex((i) => i.id === incidentId);
    if (idx < 0) throw new Error("Unknown incident");
    const now = nowIso();
    const incident = this.incidents[idx];
    this.incidents[idx] = {
      ...incident,
      status: "closed",
      residentConfirmedAt: now,
      lastActivityAt: now,
    };
    this.recordAudit({
      actorId: actorId ?? "usr_sibusiso",
      actorRole: "resident",
      actionType: "RESIDENT_CONFIRMED_RESTORE",
      entityType: "master_incident",
      entityId: incidentId,
      location: incident.location,
      payload: { reference: incident.reference },
    });
    this.emit({
      type: "incident.resident_confirmed",
      title: `${incident.reference} closed by resident`,
      detail: "Household confirmed power is back.",
      severity: "success",
      entityType: "master_incident",
      entityId: incidentId,
    });
  }

  residentDispute(incidentId: string, actorId?: string) {
    const idx = this.incidents.findIndex((i) => i.id === incidentId);
    if (idx < 0) throw new Error("Unknown incident");
    const now = nowIso();
    const incident = this.incidents[idx];
    this.incidents[idx] = {
      ...incident,
      status: "open",
      resolvedAt: null,
      lastActivityAt: now,
    };
    this.recordAudit({
      actorId: actorId ?? "usr_sibusiso",
      actorRole: "resident",
      actionType: "RESIDENT_STILL_NO_POWER",
      entityType: "master_incident",
      entityId: incidentId,
      location: incident.location,
      payload: { reference: incident.reference },
    });
    this.emit({
      type: "incident.resident_dispute",
      title: `${incident.reference} — still no power`,
      detail: "Resident rejected the restore. Ticket reopened for dispatch.",
      severity: "critical",
      entityType: "master_incident",
      entityId: incidentId,
    });
  }

  submitQa(
    incidentId: string,
    rating: number,
    notes: string,
    actorId?: string,
  ) {
    const idx = this.incidents.findIndex((i) => i.id === incidentId);
    if (idx < 0) throw new Error("Unknown incident");
    const incident = this.incidents[idx];
    const clamped = Math.min(5, Math.max(1, Math.round(rating)));
    this.incidents[idx] = {
      ...incident,
      qaRating: clamped,
      qaNotes: notes,
      qaBy: actorId ?? "usr_nomsa",
      lastActivityAt: nowIso(),
    };
    this.recordAudit({
      actorId: actorId ?? "usr_nomsa",
      actorRole: "revenue_inspector",
      actionType: "INSPECTOR_QA_ON_REPAIR",
      entityType: "master_incident",
      entityId: incidentId,
      location: incident.location,
      payload: { reference: incident.reference, rating: clamped, notes },
    });
    this.emit({
      type: "incident.qa",
      title: `QA ${clamped}/5 on ${incident.reference}`,
      detail: notes || "Inspector scored the technician's repair.",
      severity: "info",
      entityType: "master_incident",
      entityId: incidentId,
    });
    return this.incidents[idx];
  }

  closeInvestigation(investigationId: string, status: InvestigationStatus) {
    const idx = this.investigations.findIndex((i) => i.id === investigationId);
    if (idx < 0) throw new Error("Unknown investigation");
    const inv = this.investigations[idx];
    this.investigations[idx] = {
      ...inv,
      status,
      closedAt: nowIso(),
    };
    if (inv.assignedCrewId) {
      const cIdx = this.crews.findIndex((c) => c.id === inv.assignedCrewId);
      if (cIdx >= 0) {
        const crew = this.crews[cIdx];
        this.crews[cIdx] = {
          ...crew,
          status: "available",
          activeQueueSize: Math.max(0, crew.activeQueueSize - 1),
        };
      }
    }
    const inspector = this.users.find((u) => u.role === "revenue_inspector")!;
    this.recordAudit({
      actorId: inspector.id,
      actorRole: "revenue_inspector",
      actionType: "INVESTIGATION_CLOSED",
      entityType: "revenue_investigation",
      entityId: investigationId,
      location: inv.location,
      payload: { status, reference: inv.reference },
    });
  }

  updateCrewGps(crewId: string, lon: number, lat: number, status?: FieldCrew["status"]) {
    const idx = this.crews.findIndex((c) => c.id === crewId);
    if (idx < 0) throw new Error("Unknown crew");
    this.crews[idx] = {
      ...this.crews[idx],
      location: { lon, lat },
      lastGpsAt: nowIso(),
      status: status ?? this.crews[idx].status,
    };
    this.emit(
      {
        type: "crew.gps",
        title: this.crews[idx].callsign,
        detail: "Live GPS",
        severity: "info",
        entityType: "field_crew",
        entityId: crewId,
      },
      false,
    );
  }

  roi() {
    return computeRoi(this.incidents, this.reports, this.investigations);
  }

  chainStatus() {
    return verifyAuditChain(this.audit);
  }

  subscribe(fn: (event: LiveEvent, snapshot: PlatformSnapshot) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private recomputePriorities() {
    const now = new Date();
    this.incidents = this.incidents.map((i) =>
      i.status === "resolved" || i.status === "closed"
        ? i
        : refreshIncidentPriority(i, now, this.weights),
    );
  }

  private jobLocation(kind: JobKind, targetId: string) {
    if (kind === "outage") {
      const incident = this.incidents.find((i) => i.id === targetId);
      return incident
        ? { location: incident.location, label: incident.reference }
        : null;
    }
    const inv = this.investigations.find((i) => i.id === targetId);
    return inv ? { location: inv.location, label: inv.reference } : null;
  }

  private actorForKind(kind: JobKind): User {
    return kind === "outage"
      ? this.users.find((u) => u.role === "technician")!
      : this.users.find((u) => u.role === "revenue_inspector")!;
  }

  private systemUser(): User {
    return this.users.find((u) => u.role === "system")!;
  }

  private recordAudit(
    write: Parameters<typeof appendAudit>[1],
  ) {
    this.audit.push(appendAudit(this.audit, write));
  }

  private emit(
    event: Omit<LiveEvent, "id" | "at"> & { at?: string },
    recordInFeed = true,
  ) {
    const live: LiveEvent = {
      id: newId("evt"),
      at: event.at ?? nowIso(),
      type: event.type,
      title: event.title,
      detail: event.detail,
      severity: event.severity,
      entityType: event.entityType,
      entityId: event.entityId,
    };
    if (recordInFeed) {
      this.events.push(live);
      if (this.events.length > MAX_EVENTS) {
        this.events.splice(0, this.events.length - MAX_EVENTS);
      }
    }
    const snapshot = this.snapshot();
    for (const fn of this.listeners) fn(live, snapshot);
  }

  private bootChases() {
    for (const incident of this.incidents) {
      if (
        incident.assignedCrewId &&
        (incident.status === "en_route" || incident.status === "dispatched")
      ) {
        const crew = this.crews.find((c) => c.id === incident.assignedCrewId);
        this.startChase(incident.assignedCrewId, incident.location, {
          entityType: "master_incident",
          entityId: incident.id,
          callsign: crew?.callsign ?? "Crew",
        });
      }
    }
  }

  private startChase(
    crewId: string,
    dest: GeoPoint,
    meta: { entityType: string; entityId: string; callsign: string },
  ) {
    this.stopChase(crewId);
    const tick = () => {
      const idx = this.crews.findIndex((c) => c.id === crewId);
      if (idx < 0) {
        this.stopChase(crewId);
        return;
      }
      const crew = this.crews[idx];
      if (crew.status === "on_site" || crew.status === "available" || crew.status === "off_duty") {
        this.stopChase(crewId);
        return;
      }
      const remaining = distanceMetres(crew.location, dest);
      if (remaining < 80) {
        this.crews[idx] = {
          ...crew,
          location: dest,
          lastGpsAt: nowIso(),
        };
        this.stopChase(crewId);
        this.emit({
          type: "crew.arrived",
          title: `${meta.callsign} is at your meter`,
          detail: "The technician has arrived. They will log On Site shortly.",
          severity: "success",
          entityType: meta.entityType,
          entityId: meta.entityId,
        });
        return;
      }
      const step = Math.min(0.16, 120 / remaining);
      const jitter = () => (Math.random() - 0.5) * 0.00007;
      const next = lerpPoint(crew.location, dest, step);
      this.crews[idx] = {
        ...crew,
        location: { lon: next.lon + jitter(), lat: next.lat + jitter() },
        lastGpsAt: nowIso(),
        status: "en_route",
      };
      this.emit(
        {
          type: "crew.gps",
          title: `${meta.callsign} moving`,
          detail: `${Math.round(remaining)} m · ETA ${etaMinutes(remaining)} min`,
          severity: "info",
          entityType: meta.entityType,
          entityId: meta.entityId,
        },
        false,
      );
    };
    this.chaseTimers.set(crewId, setInterval(tick, 1600));
    tick();
  }

  private stopChase(crewId: string) {
    const timer = this.chaseTimers.get(crewId);
    if (timer) {
      clearInterval(timer);
      this.chaseTimers.delete(crewId);
    }
  }

  private stopAllChases() {
    for (const id of this.chaseTimers.keys()) this.stopChase(id);
  }

  private releaseCrew(
    crewId: string,
    except?: { kind: JobKind; targetId: string },
  ) {
    this.stopChase(crewId);
    const idx = this.crews.findIndex((c) => c.id === crewId);
    if (idx < 0) return;
    const crew = this.crews[idx];
    const stillBusy =
      this.incidents.some(
        (i) =>
          i.assignedCrewId === crewId &&
          !(except?.kind === "outage" && except.targetId === i.id) &&
          i.status !== "resolved" &&
          i.status !== "closed",
      ) ||
      this.investigations.some(
        (i) =>
          i.assignedCrewId === crewId &&
          !(except?.kind === "investigation" && except.targetId === i.id) &&
          i.status !== "closed_recovered" &&
          i.status !== "closed_no_finding",
      );
    this.crews[idx] = {
      ...crew,
      status: stillBusy ? crew.status : "available",
      activeQueueSize: Math.max(0, crew.activeQueueSize - 1),
    };
  }
}

const globalForStore = globalThis as unknown as { __electroraid_v2?: ElectroRaidStore };

export function getStore(): ElectroRaidStore {
  if (!globalForStore.__electroraid_v2) {
    globalForStore.__electroraid_v2 = new ElectroRaidStore();
  }
  return globalForStore.__electroraid_v2;
}

export { hoursAgo };
