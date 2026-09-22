/**
 * Real-time spatial deduplication.
 *
 * Incoming resident reports are geofenced against open master incidents
 * from the last two hours. A match within 500 m merges the report into
 * the existing ticket and increments the affected-household count.
 *
 * Production PostGIS (db/schema.sql):
 *
 *   SELECT id FROM master_incidents
 *   WHERE status NOT IN ('resolved', 'closed')
 *     AND last_activity_at >= NOW() - INTERVAL '2 hours'
 *     AND ST_DWithin(location, ST_MakePoint($lon, $lat)::geography, 500)
 *   ORDER BY ST_Distance(location, ST_MakePoint($lon, $lat)::geography)
 *   LIMIT 1;
 */

import { centroid, distanceMetres, withinMetres } from "../geo";
import { newId, nowIso } from "../id";
import type {
  IngestReportInput,
  MasterIncident,
  OutageReport,
} from "../types";
import { DEDUP_RADIUS_M, DEDUP_WINDOW_HOURS } from "../types";
import { computePriorityScore } from "./priority";
import type { PriorityWeights } from "../types";
import { DEFAULT_WEIGHTS } from "../types";

export interface SpatialMatch {
  incident: MasterIncident;
  distanceM: number;
}

export function findMatchingIncident(
  incidents: MasterIncident[],
  point: { lon: number; lat: number },
  now: Date = new Date(),
  radiusM = DEDUP_RADIUS_M,
  windowHours = DEDUP_WINDOW_HOURS,
): SpatialMatch | null {
  const windowMs = windowHours * 3_600_000;
  const candidates = incidents
    .filter((inc) => inc.status !== "resolved" && inc.status !== "closed")
    .filter(
      (inc) => now.getTime() - new Date(inc.lastActivityAt).getTime() <= windowMs,
    )
    .map((inc) => ({
      incident: inc,
      distanceM: distanceMetres(inc.location, point),
    }))
    .filter((row) => row.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM);

  return candidates[0] ?? null;
}

export interface MergeResult {
  report: OutageReport;
  incident: MasterIncident;
  merged: boolean;
  matchDistanceM: number | null;
}

/**
 * Ingest a single outage report. Either opens a new master incident or
 * folds the report into the spatially matching ticket.
 */
export function ingestReport(
  incidents: MasterIncident[],
  reports: OutageReport[],
  input: IngestReportInput,
  weights: PriorityWeights = DEFAULT_WEIGHTS,
  now: Date = new Date(),
): MergeResult {
  const reportedAt = input.reportedAt ?? now.toISOString();
  const match = findMatchingIncident(incidents, input.location, now);

  if (match) {
    const clusteredReports = [
      ...reports.filter((r) => r.masterIncidentId === match.incident.id),
    ];
    const report: OutageReport = {
      id: newId("rpt"),
      masterIncidentId: match.incident.id,
      accountNumber: input.accountNumber ?? null,
      reporterName: input.reporterName ?? null,
      contactPhone: input.contactPhone ?? null,
      location: input.location,
      address: input.address,
      classification: input.classification,
      channel: input.channel,
      notes: input.notes ?? null,
      reportedAt,
    };
    clusteredReports.push(report);

    const nextHouseholds = match.incident.affectedHouseholds + 1;
    const nextCentroid = centroid([
      match.incident.location,
      ...clusteredReports.map((r) => r.location),
    ]);
    const critical =
      match.incident.criticalInfrastructure ||
      Boolean(input.criticalInfrastructure);

    const incident: MasterIncident = {
      ...match.incident,
      location: nextCentroid,
      affectedHouseholds: nextHouseholds,
      criticalInfrastructure: critical,
      status:
        match.incident.status === "open" ? "clustered" : match.incident.status,
      lastActivityAt: nowIso(),
      priorityScore: computePriorityScore(
        nextHouseholds,
        critical,
        match.incident.firstReportedAt,
        now,
        weights,
      ),
    };

    return {
      report,
      incident,
      merged: true,
      matchDistanceM: Math.round(match.distanceM),
    };
  }

  const incidentId = newId("inc");
  const report: OutageReport = {
    id: newId("rpt"),
    masterIncidentId: incidentId,
    accountNumber: input.accountNumber ?? null,
    reporterName: input.reporterName ?? null,
    contactPhone: input.contactPhone ?? null,
    location: input.location,
    address: input.address,
    classification: input.classification,
    channel: input.channel,
    notes: input.notes ?? null,
    reportedAt,
  };

  const critical = Boolean(input.criticalInfrastructure);
  const incident: MasterIncident = {
    id: incidentId,
    reference: nextIncidentReference(incidents),
    classification: input.classification,
    status: "open",
    location: input.location,
    address: input.address,
    suburb: input.suburb ?? inferSuburb(input.address),
    feederId: input.feederId ?? null,
    affectedHouseholds: 1,
    criticalInfrastructure: critical,
    priorityScore: computePriorityScore(1, critical, reportedAt, now, weights),
    assignedCrewId: null,
    dispatchedAt: null,
    onSiteAt: null,
    resolvedAt: null,
    firstReportedAt: reportedAt,
    lastActivityAt: reportedAt,
  };

  return { report, incident, merged: false, matchDistanceM: null };
}

/**
 * Neighbour confirms they have the same outage — join a known open ticket
 * by id (suburb match), without relying on the 500 m window alone.
 */
export function joinExistingIncident(
  incident: MasterIncident,
  reports: OutageReport[],
  input: IngestReportInput,
  weights: PriorityWeights = DEFAULT_WEIGHTS,
  now: Date = new Date(),
): MergeResult {
  if (incident.status === "resolved" || incident.status === "closed") {
    throw new Error("That outage is already closed or waiting for restore confirm.");
  }
  const reportedAt = input.reportedAt ?? now.toISOString();
  const clusteredReports = [
    ...reports.filter((r) => r.masterIncidentId === incident.id),
  ];
  const report: OutageReport = {
    id: newId("rpt"),
    masterIncidentId: incident.id,
    accountNumber: input.accountNumber ?? null,
    reporterName: input.reporterName ?? null,
    contactPhone: input.contactPhone ?? null,
    location: input.location,
    address: input.address,
    classification: input.classification ?? incident.classification,
    channel: input.channel,
    notes: input.notes ?? "Neighbour confirmed same situation.",
    reportedAt,
  };
  clusteredReports.push(report);

  const nextHouseholds = incident.affectedHouseholds + 1;
  const nextCentroid = centroid([
    incident.location,
    ...clusteredReports.map((r) => r.location),
  ]);
  const critical =
    incident.criticalInfrastructure || Boolean(input.criticalInfrastructure);
  const distanceM = Math.round(distanceMetres(incident.location, input.location));

  const next: MasterIncident = {
    ...incident,
    location: nextCentroid,
    affectedHouseholds: nextHouseholds,
    criticalInfrastructure: critical,
    status: incident.status === "open" ? "clustered" : incident.status,
    lastActivityAt: nowIso(),
    priorityScore: computePriorityScore(
      nextHouseholds,
      critical,
      incident.firstReportedAt,
      now,
      weights,
    ),
  };

  return {
    report,
    incident: next,
    merged: true,
    matchDistanceM: distanceM,
  };
}

export function nextIncidentReference(incidents: MasterIncident[]): string {
  const year = new Date().getFullYear();
  const seq = incidents.length + 1;
  return `TSH-OUT-${year}-${String(seq).padStart(4, "0")}`;
}

function inferSuburb(address: string): string {
  const parts = address.split(",").map((p) => p.trim());
  return parts[parts.length - 1] || "Tshwane";
}

export { withinMetres };
