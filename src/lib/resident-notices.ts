import { classificationLabel } from "@/lib/format";
import type { LiveEvent, PlatformSnapshot } from "@/lib/types";

export const NOTICES_KEY_PREFIX = "electroraid.notices.";
const MAX_NOTICES = 80;

/** Stages already stored from the incident record itself. */
const STATUS_EVENT_TYPES = new Set([
  "incident.opened",
  "dispatch.assigned",
  "field.onsite",
  "incident.resolved",
  "incident.resident_confirmed",
  "area.outage_ask",
  "area.same_situation",
]);

/** Extra live events that have no matching timestamp on the ticket. */
const KEEP_EVENT_TYPES = new Set([
  "incident.merged",
  "crew.arrived",
  "incident.resident_dispute",
]);

export interface ResidentNotice {
  id: string;
  type: string;
  title: string;
  detail: string;
  at: string;
  severity: LiveEvent["severity"];
  entityId?: string;
  read: boolean;
  /** Neighbour can confirm same outage from the notice. */
  actionable?: "same_situation" | "confirm_restore";
}

export function noticesKey(userId: string) {
  return `${NOTICES_KEY_PREFIX}${userId}`;
}

function isNotice(value: unknown): value is ResidentNotice {
  if (!value || typeof value !== "object") return false;
  const row = value as ResidentNotice;
  return (
    typeof row.id === "string" &&
    typeof row.title === "string" &&
    typeof row.at === "string" &&
    typeof row.read === "boolean"
  );
}

export function loadNotices(userId: string): ResidentNotice[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(noticesKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isNotice) : [];
  } catch {
    return [];
  }
}

export function saveNotices(userId: string, items: ResidentNotice[]) {
  localStorage.setItem(
    noticesKey(userId),
    JSON.stringify(items.slice(0, MAX_NOTICES)),
  );
}

export function noticeLabel(type: string): string {
  switch (type) {
    case "incident.opened":
      return "Report received";
    case "incident.merged":
      return "Added to an existing outage";
    case "dispatch.assigned":
      return "Technician assigned";
    case "crew.arrived":
      return "Technician arrived";
    case "field.onsite":
      return "On site";
    case "incident.resolved":
      return "Confirm restore required";
    case "incident.resident_confirmed":
      return "You confirmed";
    case "incident.resident_dispute":
      return "Still no power";
    case "area.outage_ask":
    case "area.same_situation":
      return "Same situation?";
    default:
      return "Update";
  }
}

function crewLabel(snapshot: PlatformSnapshot, crewId: string | null) {
  if (!crewId) return "A technician";
  const crew = snapshot.crews.find((c) => c.id === crewId);
  if (!crew) return "A technician";
  const name = snapshot.users.find((u) => u.id === crew.userId)?.fullName;
  return name ? `${name} · ${crew.callsign}` : crew.callsign;
}

function byNewest(a: ResidentNotice, b: ResidentNotice) {
  const time = b.at.localeCompare(a.at);
  if (time !== 0) return time;
  return a.id.localeCompare(b.id);
}

function sameSuburb(a: string | undefined, b: string | undefined) {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Notices for the signed-in household: own tickets, restore confirm, and
 * same-suburb outages asking “are you facing the same?”.
 */
export function deriveResidentNotices(
  snapshot: PlatformSnapshot,
  accountNumber: string | undefined,
  suburb?: string,
): ResidentNotice[] {
  if (!accountNumber) return [];
  const reports = snapshot.reports.filter(
    (report) => report.accountNumber === accountNumber,
  );
  const incidentIds = new Set(reports.map((report) => report.masterIncidentId));
  const notices: ResidentNotice[] = [];

  for (const incident of snapshot.incidents) {
    if (!incidentIds.has(incident.id)) continue;
    const who = crewLabel(snapshot, incident.assignedCrewId);
    notices.push({
      id: `${incident.id}:opened`,
      type: "incident.opened",
      title: `We received ${incident.reference}`,
      detail: incident.address,
      at: incident.firstReportedAt,
      severity: "info",
      entityId: incident.id,
      read: false,
    });
    if (incident.dispatchedAt) {
      notices.push({
        id: `${incident.id}:assigned`,
        type: "dispatch.assigned",
        title: `${who} is assigned`,
        detail: `${incident.reference} · ${incident.address}`,
        at: incident.dispatchedAt,
        severity: "info",
        entityId: incident.id,
        read: false,
      });
    }
    if (incident.onSiteAt) {
      notices.push({
        id: `${incident.id}:onsite`,
        type: "field.onsite",
        title: `${who} is on site`,
        detail: incident.address,
        at: incident.onSiteAt,
        severity: "info",
        entityId: incident.id,
        read: false,
      });
    }
    if (incident.resolvedAt && !incident.residentConfirmedAt) {
      notices.push({
        id: `${incident.id}:resolved`,
        type: "incident.resolved",
        title: `${incident.reference} — confirm your lights`,
        detail:
          "Technician signed off. You must Confirm or Dispute on Track Reports. The ticket cannot close without your answer.",
        at: incident.resolvedAt,
        severity: "critical",
        entityId: incident.id,
        read: false,
        actionable: "confirm_restore",
      });
    }
    if (incident.residentConfirmedAt) {
      notices.push({
        id: `${incident.id}:confirmed`,
        type: "incident.resident_confirmed",
        title: `You confirmed ${incident.reference}`,
        detail: "This ticket is closed on your side.",
        at: incident.residentConfirmedAt,
        severity: "success",
        entityId: incident.id,
        read: false,
      });
    }
  }

  // Same-area: open tickets in your suburb that you have not joined yet.
  if (suburb) {
    for (const incident of snapshot.incidents) {
      if (incidentIds.has(incident.id)) continue;
      if (incident.status === "closed" || incident.status === "resolved") {
        continue;
      }
      if (!sameSuburb(incident.suburb, suburb)) continue;
      notices.push({
        id: `${incident.id}:area:${accountNumber}`,
        type: "area.same_situation",
        title: `Outage reported in ${incident.suburb}`,
        detail: `Someone nearby reported ${classificationLabel(incident.classification)}. Are you facing the same situation? Tap Yes to join ticket ${incident.reference}.`,
        at: incident.lastActivityAt || incident.firstReportedAt,
        severity: "warn",
        entityId: incident.id,
        read: false,
        actionable: "same_situation",
      });
    }
  }

  for (const event of snapshot.events) {
    if (!event.entityId || !incidentIds.has(event.entityId)) continue;
    if (STATUS_EVENT_TYPES.has(event.type)) continue;
    if (!KEEP_EVENT_TYPES.has(event.type)) continue;
    notices.push({
      id: event.id,
      type: event.type,
      title: event.title,
      detail: event.detail,
      at: event.at,
      severity: event.severity,
      entityId: event.entityId,
      read: false,
    });
  }

  return notices.sort(byNewest);
}

export function mergeNotices(
  stored: ResidentNotice[],
  derived: ResidentNotice[],
): ResidentNotice[] {
  const readById = new Map(stored.map((notice) => [notice.id, notice.read]));
  const fresh = derived.map((notice) => ({
    ...notice,
    read: readById.get(notice.id) ?? false,
  }));
  return fresh.sort(byNewest).slice(0, MAX_NOTICES);
}

export function noticesEqual(a: ResidentNotice[], b: ResidentNotice[]) {
  return JSON.stringify(a) === JSON.stringify(b);
}
