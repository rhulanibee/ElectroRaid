/**
 * In-memory ElectroRaid store.
 *
 * Mirrors the PostGIS schema. The singleton is hung off `globalThis` so
 * Next.js hot-reload does not wipe the control-room state.
 *
 * Production swap: replace method bodies with SQL against db/schema.sql.
 * The engines (spatial, anomaly, dispatch, audit, roi) stay unchanged.
 */

import fs from "node:fs";
import path from "node:path";
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
import { ingestReport, joinExistingIncident } from "./engines/spatial";
import { distanceMetres, etaMinutes, lerpPoint, pointForSuburb } from "./geo";
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
  Specialization,
  StaffProvision,
  User,
} from "./types";
import { DEFAULT_WEIGHTS } from "./types";

const MAX_EVENTS = 80;
const SEEDED_STAFF = new Set(["usr_thandiwe", "usr_sipho", "usr_nomsa"]);
const LIVE_PATH = path.join(process.cwd(), "data", "live-floor.json");

function keepNewer<T>(
  memory: T[],
  disk: T[],
  idOf: (row: T) => string,
  stampOf: (row: T) => string | null,
): T[] {
  const byId = new Map<string, T>();
  for (const row of disk) byId.set(idOf(row), row);
  for (const row of memory) {
    const prev = byId.get(idOf(row));
    if (!prev || (stampOf(row) ?? "") >= (stampOf(prev) ?? "")) {
      byId.set(idOf(row), row);
    }
  }
  return [...byId.values()];
}

interface LiveFloorFile {
  version: 1;
  users: User[];
  crews: FieldCrew[];
  feeders?: PlatformSnapshot["feeders"];
  meters: PlatformSnapshot["meters"];
  vending: PlatformSnapshot["vending"];
  incidents: MasterIncident[];
  reports: PlatformSnapshot["reports"];
  investigations: RevenueInvestigation[];
  audit: AuditLog[];
  events: LiveEvent[];
  provisioned: StaffProvision[];
  removedIds: string[];
  floorRevision?: number;
  weights?: PlatformSnapshot["weights"];
}

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
  /** Staff the administrator added. Re-applied after a floor reset. */
  private provisioned: StaffProvision[] = [];
  /** Sign-in accounts the administrator removed. */
  private removedIds: string[] = [];

  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** mtime of the live file this process last read or wrote. */
  private diskMtime = 0;
  /** Bumps when a ticket changes. Van GPS does not bump it. */
  private floorRevision = 0;
  /** True after the Postgres floor has been loaded or seeded. */
  private sqlOn = false;

  constructor() {
    this.hydrate(true);
  }

  reset() {
    this.hydrate(false);
  }

  /** Load the Postgres floor, or seed it from the current memory on first run. */
  async attachSql() {
    try {
      const {
        enableSqlSaves,
        floorIsPopulated,
        loadFloor,
        seedFloor,
        supabaseConfigured,
      } = await import("./sql-floor");
      if (!supabaseConfigured()) return;

      let live = await loadFloor();
      // Brief retry: a concurrent save used to clear tables first; avoid
      // treating a mid-write empty read as "brand new database".
      if (!floorIsPopulated(live)) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        live = await loadFloor();
      }

      if (floorIsPopulated(live)) {
        this.replaceFloor(live!);
      } else {
        await seedFloor({
          ...this.toLiveFile(),
          feeders: this.feeders,
          weights: this.weights,
          removedIds: this.removedIds,
          floorRevision: this.floorRevision,
        });
      }
      enableSqlSaves();
      this.sqlOn = true;
    } catch (error) {
      console.error("Supabase floor unavailable; keeping the file floor.", error);
    }
  }

  private replaceFloor(live: LiveFloorFile) {
    this.stopAllChases();
    this.users = live.users ?? [];
    this.crews = live.crews ?? [];
    if (live.feeders?.length) this.feeders = live.feeders;
    this.meters = live.meters ?? [];
    this.vending = live.vending ?? [];
    this.incidents = live.incidents ?? [];
    this.reports = live.reports ?? [];
    this.investigations = live.investigations ?? [];
    this.audit = live.audit ?? [];
    this.events = live.events ?? [];
    this.provisioned = live.provisioned ?? [];
    this.removedIds = live.removedIds ?? [];
    this.floorRevision = live.floorRevision ?? 0;
    if (live.weights) this.weights = { ...live.weights };
    this.bootChases();
  }

  private toLiveFile(): LiveFloorFile {
    return {
      version: 1,
      users: this.users,
      crews: this.crews,
      feeders: this.feeders,
      meters: this.meters,
      vending: this.vending,
      incidents: this.incidents,
      reports: this.reports,
      investigations: this.investigations,
      audit: this.audit,
      events: this.events,
      provisioned: this.provisioned,
      removedIds: this.removedIds,
      floorRevision: this.floorRevision,
      weights: this.weights,
    };
  }

  private hydrate(restore: boolean) {
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
    this.provisioned = [];
    this.removedIds = [];
    if (restore) this.readLive();
    else {
      this.deleteLive();
      // Beat any older Supabase floor_revision so the clear actually persists.
      this.floorRevision = Math.max(this.floorRevision + 1, Date.now());
    }
    for (const person of this.provisioned) {
      this.insertStaff(person, false);
    }
    this.emit(
      {
        type: "platform.reset",
        title: restore ? "Live floor ready" : "Floor cleared",
        detail: restore
          ? "Sign-in accounts loaded. Tickets are only the ones people have filed."
          : "Sign-in accounts kept. Filed tickets were cleared.",
        severity: "info",
      },
      false,
    );
    this.bootChases();
  }

  snapshot(): PlatformSnapshot {
    this.refreshFromDisk();
    return this.view();
  }

  private view(): PlatformSnapshot {
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
      floorRevision: this.floorRevision,
    };
  }

  ingest(input: IngestReportInput) {
    if (
      input.classification === "izinyoka_tip" ||
      input.channel === "anonymous_tip"
    ) {
      return this.ingestTip(input);
    }

    if (input.joinIncidentId) {
      return this.joinSameSituation(input.joinIncidentId, input);
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

    // Neighbours in the same suburb are asked if they face the same fault.
    this.emit({
      type: "area.outage_ask",
      title: `Outage reported in ${result.incident.suburb}`,
      detail: `A household reported ${result.incident.classification.replaceAll("_", " ")}. Confirm if you are facing the same situation.`,
      severity: "warn",
      entityType: "master_incident",
      entityId: result.incident.id,
    });

    return { kind: "outage" as const, ...result };
  }

  /** Neighbour taps “Yes, me too” on a same-area alert. */
  joinSameSituation(incidentId: string, input: IngestReportInput) {
    const incident = this.incidents.find((row) => row.id === incidentId);
    if (!incident) throw new Error("Unknown outage ticket.");

    const suburb = (input.suburb ?? "").trim().toLowerCase();
    if (suburb && suburb !== incident.suburb.trim().toLowerCase()) {
      throw new Error("That outage is not in your suburb.");
    }

    if (input.accountNumber) {
      const already = this.reports.some(
        (report) =>
          report.masterIncidentId === incidentId &&
          report.accountNumber === input.accountNumber,
      );
      if (already) {
        throw new Error("Your household is already on this ticket.");
      }
    }

    const result = joinExistingIncident(
      incident,
      this.reports,
      {
        ...input,
        classification: input.classification || incident.classification,
        notes: input.notes ?? "Neighbour confirmed same situation.",
        channel: input.channel || "app",
      },
      this.weights,
    );
    this.reports.push(result.report);
    const idx = this.incidents.findIndex((row) => row.id === incidentId);
    if (idx >= 0) this.incidents[idx] = result.incident;

    this.recordAudit({
      actorId: this.systemUser().id,
      actorRole: "resident",
      actionType: "NEIGHBOUR_SAME_SITUATION",
      entityType: "master_incident",
      entityId: incidentId,
      location: input.location,
      payload: {
        reportId: result.report.id,
        reference: result.incident.reference,
        accountNumber: input.accountNumber ?? null,
        affectedHouseholds: result.incident.affectedHouseholds,
        matchDistanceM: result.matchDistanceM,
      },
    });

    this.emit({
      type: "incident.merged",
      title: `Neighbour joined ${result.incident.reference}`,
      detail: `${result.incident.affectedHouseholds} households now on this ticket in ${result.incident.suburb}.`,
      severity: "warn",
      entityType: "master_incident",
      entityId: incidentId,
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
    if (incident.status !== "resolved") {
      throw new Error(
        "Confirm is only allowed after the technician signs off restore.",
      );
    }
    if (incident.residentConfirmedAt) {
      throw new Error("This household already confirmed restore.");
    }
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
    if (incident.status !== "resolved") {
      throw new Error(
        "Dispute is only allowed after the technician claims restore.",
      );
    }
    this.incidents[idx] = {
      ...incident,
      status: "open",
      resolvedAt: null,
      residentConfirmedAt: null,
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
      this.floorRevision += 1;
    }
    this.absorbNewerDisk();
    const snapshot = this.view();
    for (const fn of this.listeners) fn(live, snapshot);
    if (recordInFeed) this.writeLive();
    else this.scheduleSave();
  }

  updateHousehold(input: {
    userId: string;
    fullName: string;
    email: string;
    phone: string | null;
    suburb: string;
    address: string;
    accountNumber: string | null;
  }) {
    const idx = this.users.findIndex((user) => user.id === input.userId);
    if (idx >= 0) {
      this.users[idx] = {
        ...this.users[idx],
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
      };
    }
    if (input.accountNumber) {
      const location = pointForSuburb(input.suburb);
      this.meters = this.meters.map((meter) =>
        meter.accountNumber === input.accountNumber
          ? {
              ...meter,
              householdName: input.fullName,
              address: input.address || meter.address,
              suburb: input.suburb || meter.suburb,
              location,
            }
          : meter,
      );
    }
    this.recordAudit({
      actorId: input.userId,
      actorRole: "resident",
      actionType: "RESIDENT_UPDATED_PROFILE",
      entityType: "user",
      entityId: input.userId,
      location: null,
      payload: {
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        suburb: input.suburb,
        address: input.address,
      },
    });
    this.emit({
      type: "resident.profile",
      title: `${input.fullName} updated household details`,
      detail: input.address || input.suburb,
      severity: "info",
      entityType: "user",
      entityId: input.userId,
    });
  }

  private refreshFromDisk() {
    this.absorbNewerDisk();
  }

  private scheduleSave() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.writeLive();
    }, 400);
  }

  private absorbNewerDisk() {
    try {
      if (!fs.existsSync(LIVE_PATH)) return;
      const mtime = fs.statSync(LIVE_PATH).mtimeMs;
      if (mtime <= this.diskMtime + 1) return;
      const live = JSON.parse(fs.readFileSync(LIVE_PATH, "utf8")) as LiveFloorFile;
      if (!live || live.version !== 1) return;
      this.incidents = keepNewer(this.incidents, live.incidents ?? [], (row) => row.id, (row) => row.lastActivityAt);
      this.reports = keepNewer(this.reports, live.reports ?? [], (row) => row.id, (row) => row.reportedAt);
      this.investigations = keepNewer(
        this.investigations,
        live.investigations ?? [],
        (row) => row.id,
        (row) => row.closedAt ?? row.dispatchedAt ?? row.createdAt,
      );
      for (const crew of live.crews ?? []) {
        const idx = this.crews.findIndex((row) => row.id === crew.id);
        if (idx < 0) this.crews.push(crew);
        else if (crew.lastGpsAt > this.crews[idx].lastGpsAt) this.crews[idx] = crew;
      }
      const eventIds = new Set(this.events.map((event) => event.id));
      for (const event of live.events ?? []) {
        if (!eventIds.has(event.id)) this.events.push(event);
      }
      const auditIds = new Set(this.audit.map((row) => row.eventId));
      for (const row of live.audit ?? []) {
        if (!auditIds.has(row.eventId)) this.audit.push(row);
      }
      const removed = new Set([...(this.removedIds), ...(live.removedIds ?? [])]);
      this.removedIds = [...removed];
      for (const user of live.users ?? []) {
        if (removed.has(user.id)) continue;
        const idx = this.users.findIndex((row) => row.id === user.id);
        if (idx >= 0) {
          this.users[idx] = {
            ...this.users[idx],
            fullName: user.fullName,
            email: user.email,
            phone: user.phone,
            role: user.role,
            isActive: user.isActive,
          };
        } else if (user.role !== "system") {
          this.users.push(user);
        }
      }
      this.users = this.users.filter((user) => !removed.has(user.id));
      const meters = new Map(this.meters.map((meter) => [meter.id, meter]));
      for (const meter of live.meters ?? []) meters.set(meter.id, meter);
      this.meters = [...meters.values()];
      const provisionedIds = new Set(this.provisioned.map((person) => person.id));
      for (const person of live.provisioned ?? []) {
        if (!provisionedIds.has(person.id)) this.provisioned.push(person);
      }
      this.floorRevision = Math.max(this.floorRevision, live.floorRevision ?? 0);
      this.diskMtime = mtime;
    } catch {
      /* keep the in-memory floor */
    }
  }

  private writeLive() {
    this.absorbNewerDisk();
    const body = this.toLiveFile();
    if (this.sqlOn) {
      const floor = {
        ...body,
        feeders: this.feeders,
        weights: this.weights,
        removedIds: this.removedIds,
        floorRevision: this.floorRevision,
      };
      void import("./sql-floor").then((sql) => sql.queueSqlSave(floor));
    }
    try {
      fs.mkdirSync(path.dirname(LIVE_PATH), { recursive: true });
      fs.writeFileSync(LIVE_PATH, JSON.stringify(body));
      this.diskMtime = fs.statSync(LIVE_PATH).mtimeMs;
    } catch {
      /* the in-memory floor still serves this process */
    }
  }

  private readLive() {
    try {
      if (!fs.existsSync(LIVE_PATH)) return;
      const live = JSON.parse(fs.readFileSync(LIVE_PATH, "utf8")) as LiveFloorFile;
      if (!live || live.version !== 1) return;
      const removed = new Set(live.removedIds ?? []);
      this.removedIds = [...removed];
      for (const user of live.users ?? []) {
        if (removed.has(user.id)) continue;
        const idx = this.users.findIndex((row) => row.id === user.id);
        if (idx >= 0) {
          this.users[idx] = {
            ...this.users[idx],
            fullName: user.fullName,
            email: user.email,
            phone: user.phone,
            role: user.role,
            isActive: user.isActive,
          };
        } else if (user.role !== "system") {
          this.users.push(user);
        }
      }
      this.users = this.users.filter((user) => !removed.has(user.id));
      if (Array.isArray(live.crews)) {
        const liveCrewIds = new Set(live.crews.map((crew) => crew.id));
        this.crews = this.crews.filter((crew) => liveCrewIds.has(crew.id));
        for (const crew of live.crews) {
          if (removed.has(crew.userId)) continue;
          const idx = this.crews.findIndex((row) => row.id === crew.id);
          if (idx >= 0) this.crews[idx] = crew;
          else this.crews.push(crew);
        }
      }
      this.crews = this.crews.filter((crew) => !removed.has(crew.userId));
      const meters = new Map(this.meters.map((meter) => [meter.id, meter]));
      for (const meter of live.meters ?? []) meters.set(meter.id, meter);
      this.meters = [...meters.values()];
      this.vending = live.vending ?? [];
      this.incidents = live.incidents ?? [];
      this.reports = live.reports ?? [];
      this.investigations = live.investigations ?? [];
      this.audit = live.audit ?? [];
      this.events = live.events ?? [];
      this.provisioned = live.provisioned ?? [];
      this.floorRevision = live.floorRevision ?? 0;
      this.diskMtime = fs.statSync(LIVE_PATH).mtimeMs;
    } catch {
      /* keep the sign-in floor if the file is unreadable */
    }
  }

  private deleteLive() {
    try {
      fs.unlinkSync(LIVE_PATH);
    } catch {
      /* already absent */
    }
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

  ensureStaff(people: StaffProvision[]) {
    const created: StaffProvision[] = [];
    let changed = false;
    for (const person of people) {
      if (!person.id || !person.fullName || !person.role) continue;
      if (this.removedIds.includes(person.id)) continue;
      const existing = this.users.find((user) => user.id === person.id);
      if (existing) {
        if (this.applyStaffUpdate(person)) changed = true;
      } else {
        const added = this.insertStaff(person, true);
        if (added) created.push(person);
      }
      if (!SEEDED_STAFF.has(person.id)) {
        const idx = this.provisioned.findIndex((row) => row.id === person.id);
        if (idx >= 0) this.provisioned[idx] = person;
        else this.provisioned.push(person);
      }
    }
    if (changed) this.scheduleSave();
    return created;
  }

  removeStaff(ids: string[]) {
    const removed: string[] = [];
    for (const id of ids) {
      if (id === "usr_system" || id === "usr_sibusiso" || id === "usr_admin") continue;
      const user = this.users.find((row) => row.id === id);
      if (
        user &&
        user.role !== "technician" &&
        user.role !== "dispatcher" &&
        user.role !== "revenue_inspector"
      ) {
        continue;
      }
      if (user) this.detachStaff(id);
      this.users = this.users.filter((row) => row.id !== id);
      this.provisioned = this.provisioned.filter((row) => row.id !== id);
      if (!this.removedIds.includes(id)) this.removedIds.push(id);
      removed.push(id);
      if (user) {
        this.recordAudit({
          actorId: this.systemUser().id,
          actorRole: "admin",
          actionType: "ADMIN_REMOVED_STAFF",
          entityType: "user",
          entityId: id,
          location: null,
          payload: { fullName: user.fullName, role: user.role },
        });
        const label =
          user.role === "technician"
            ? "Technician"
            : user.role === "revenue_inspector"
              ? "Inspector"
              : "Dispatcher";
        this.emit({
          type: "staff.removed",
          title: `${label} ${user.fullName} removed`,
          detail: "Their sign-in and crew assignment were withdrawn.",
          severity: "warn",
          entityType: "user",
          entityId: id,
        });
      }
    }
    if (removed.length) this.scheduleSave();
    return removed;
  }

  private applyStaffUpdate(person: StaffProvision) {
    const idx = this.users.findIndex((user) => user.id === person.id);
    if (idx < 0) return false;
    const current = this.users[idx];
    const allowed =
      person.role === "technician" ||
      person.role === "dispatcher" ||
      person.role === "revenue_inspector";
    if (!allowed) return false;
    const crew = this.crews.find((row) => row.userId === person.id);
    const nextSpec: Specialization =
      person.role === "revenue_inspector" ? "revenue_protection" : "maintenance";
    const profileSame =
      current.fullName === person.fullName &&
      current.email === person.email &&
      (current.phone ?? null) === (person.phone ?? null) &&
      current.role === person.role;
    const crewSame =
      person.role === "dispatcher"
        ? !crew
        : Boolean(
            crew &&
              crew.callsign === (person.callsign || crew.callsign) &&
              crew.specialization === nextSpec &&
              crew.id === person.crewId,
          );
    const same = profileSame && crewSame;
    this.users[idx] = {
      ...current,
      fullName: person.fullName,
      email: person.email,
      phone: person.phone,
      role: person.role,
      isActive: true,
    };
    this.syncCrew(person);
    return !same;
  }

  private syncCrew(person: StaffProvision) {
    if (person.role === "dispatcher") {
      this.detachStaff(person.id);
      return;
    }
    if (!person.crewId) return;
    const specialization: Specialization =
      person.role === "revenue_inspector" ? "revenue_protection" : "maintenance";
    const others = this.crews.filter(
      (crew) => crew.userId === person.id && crew.id !== person.crewId,
    );
    for (const crew of others) this.pullCrewOffJobs(crew.id);
    this.crews = this.crews.filter(
      (crew) => crew.userId !== person.id || crew.id === person.crewId,
    );
    const idx = this.crews.findIndex((crew) => crew.id === person.crewId);
    if (idx >= 0) {
      this.crews[idx] = {
        ...this.crews[idx],
        userId: person.id,
        callsign: person.callsign || this.crews[idx].callsign,
        specialization,
      };
      return;
    }
    this.crews.push({
      id: person.crewId,
      userId: person.id,
      callsign: person.callsign || (person.role === "technician" ? "MT-NEW" : "RP-NEW"),
      specialization,
      skillCertifications:
        person.role === "revenue_inspector"
          ? ["METER_AUDIT", "SEAL_CHECK"]
          : ["LV_BOARD", "OHL_REPAIR"],
      status: "available",
      location: { lon: 28.1881, lat: -25.7461 },
      vehicleReg: `CT ${100 + this.crews.length} GP`,
      activeQueueSize: 0,
      lastGpsAt: nowIso(),
    });
  }

  private detachStaff(userId: string) {
    const crews = this.crews.filter((crew) => crew.userId === userId);
    for (const crew of crews) this.pullCrewOffJobs(crew.id);
    this.crews = this.crews.filter((crew) => crew.userId !== userId);
  }

  private pullCrewOffJobs(crewId: string) {
    this.stopChase(crewId);
    const now = nowIso();
    this.incidents = this.incidents.map((incident) => {
      if (incident.assignedCrewId !== crewId) return incident;
      if (incident.status === "resolved" || incident.status === "closed") return incident;
      return {
        ...incident,
        assignedCrewId: null,
        status: "open" as const,
        dispatchedAt: null,
        onSiteAt: null,
        lastActivityAt: now,
      };
    });
    this.investigations = this.investigations.map((investigation) => {
      if (investigation.assignedCrewId !== crewId) return investigation;
      if (
        investigation.status === "closed_recovered" ||
        investigation.status === "closed_no_finding"
      ) {
        return investigation;
      }
      return {
        ...investigation,
        assignedCrewId: null,
        status: "flagged" as const,
        dispatchedAt: null,
        onSiteAt: null,
      };
    });
  }

  private insertStaff(person: StaffProvision, announce: boolean) {
    const allowed =
      person.role === "technician" ||
      person.role === "dispatcher" ||
      person.role === "revenue_inspector";
    if (!allowed) return false;

    let added = false;
    if (!this.users.some((user) => user.id === person.id)) {
      this.users.push({
        id: person.id,
        employeeNo: null,
        fullName: person.fullName,
        email: person.email,
        phone: person.phone,
        role: person.role,
        isActive: true,
        createdAt: nowIso(),
      });
      added = true;
    }

    if (person.role !== "dispatcher" && person.crewId) {
      if (!this.crews.some((crew) => crew.id === person.crewId)) {
        const specialization: Specialization =
          person.role === "revenue_inspector"
            ? "revenue_protection"
            : "maintenance";
        this.crews.push({
          id: person.crewId,
          userId: person.id,
          callsign: person.callsign || (person.role === "technician" ? "MT-NEW" : "RP-NEW"),
          specialization,
          skillCertifications:
            person.role === "revenue_inspector"
              ? ["METER_AUDIT", "SEAL_CHECK"]
              : ["LV_BOARD", "OHL_REPAIR"],
          status: "available",
          location: { lon: 28.1881, lat: -25.7461 },
          vehicleReg: `CT ${100 + this.crews.length} GP`,
          activeQueueSize: 0,
          lastGpsAt: nowIso(),
        });
        added = true;
      }
    }

    if (added && announce) {
      this.recordAudit({
        actorId: this.systemUser().id,
        actorRole: "admin",
        actionType: "ADMIN_ADDED_STAFF",
        entityType: "user",
        entityId: person.id,
        location: null,
        payload: {
          fullName: person.fullName,
          role: person.role,
          callsign: person.callsign,
          username: person.email,
        },
      });
      const label =
        person.role === "technician"
          ? "Technician"
          : person.role === "revenue_inspector"
            ? "Inspector"
            : "Dispatcher";
      this.emit({
        type: "staff.added",
        title: `${label} ${person.fullName} added`,
        detail: person.callsign
          ? `${person.callsign} can sign in as ${person.email}`
          : `${person.fullName} can sign in as ${person.email}`,
        severity: "info",
        entityType: "user",
        entityId: person.id,
      });
    }
    return added;
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

const globalForStore = globalThis as unknown as {
  __electroraid_v7?: ElectroRaidStore;
  __electroraid_sql_ready?: Promise<ElectroRaidStore>;
};

export function getStore(): ElectroRaidStore {
  if (!globalForStore.__electroraid_v7) {
    globalForStore.__electroraid_v7 = new ElectroRaidStore();
  }
  return globalForStore.__electroraid_v7;
}

/** Store after the Postgres floor has been loaded. API routes await this. */
export function readyStore(): Promise<ElectroRaidStore> {
  if (!globalForStore.__electroraid_sql_ready) {
    const store = getStore();
    globalForStore.__electroraid_sql_ready = store.attachSql().then(() => store);
  }
  return globalForStore.__electroraid_sql_ready;
}

export { hoursAgo };
