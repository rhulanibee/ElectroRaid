import { formatZar, roleLabel } from "./format";
import type { AuditLog, User } from "./types";

export interface AuditStory {
  title: string;
  detail: string;
  ticket: string | null;
  kind: "outage" | "revenue" | "system";
}

function str(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function num(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function prettyChannel(value: string | null): string {
  if (!value) return "the app";
  switch (value) {
    case "call_centre":
      return "the call centre";
    case "anonymous_tip":
      return "an anonymous tip";
    case "whatsapp":
      return "WhatsApp";
    case "walk_in":
      return "a walk-in";
    case "system_anomaly":
      return "the anomaly scanner";
    default:
      return value.replaceAll("_", " ");
  }
}

function prettyClassification(value: string | null): string {
  if (!value) return "a fault";
  return value.replaceAll("_", " ");
}

function prettyClose(value: string | null): string {
  if (value === "closed_recovered") return "closed — money recovered";
  if (value === "closed_no_finding") return "closed — no tamper found";
  return value?.replaceAll("_", " ") ?? "closed";
}

export function auditStory(row: AuditLog): AuditStory {
  const p = row.payload;
  const reference = str(p, "reference");
  const kind: AuditStory["kind"] =
    row.entityType === "revenue_investigation"
      ? "revenue"
      : row.entityType === "master_incident"
        ? "outage"
        : "system";

  switch (row.actionType) {
    case "PLATFORM_SEEDED":
      return {
        title: "Ops floor loaded",
        detail: "Baseline City of Tshwane tickets, crews, and meters were loaded.",
        ticket: null,
        kind: "system",
      };
    case "MASTER_INCIDENT_OPENED":
      return {
        title: "New outage ticket opened",
        detail: `${reference ?? "A ticket"} was opened for ${prettyClassification(str(p, "classification"))} via ${prettyChannel(str(p, "channel"))}.`,
        ticket: reference,
        kind: "outage",
      };
    case "REPORT_MERGED_INTO_MASTER":
      return {
        title: "Nearby report joined an existing ticket",
        detail: `${num(p, "matchDistanceM") ?? "?"} m from ${reference ?? "the ticket"} · now ${num(p, "affectedHouseholds") ?? "?"} households on one job.`,
        ticket: reference,
        kind: "outage",
      };
    case "DISPATCHER_ASSIGNED_CREW": {
      const name = str(p, "technicianName") ?? "A crew";
      const callsign = str(p, "callsign") ?? "unit";
      const eta = num(p, "etaMinutes");
      const job = str(p, "jobKind") === "investigation" ? "revenue case" : "repair";
      return {
        title: "Dispatcher sent a crew",
        detail: `${name} (${callsign}) is on the way for this ${job}${eta != null ? ` · about ${eta} min` : ""}.`,
        ticket: reference,
        kind,
      };
    }
    case "FIELD_UNIT_ON_SITE":
      return {
        title: "Crew logged on site",
        detail: "GPS clocked the van at the job. The household was notified.",
        ticket: reference,
        kind,
      };
    case "TECHNICIAN_WORK_COMPLETED":
      return {
        title: "Technician finished the repair",
        detail:
          str(p, "notes") ??
          `${reference ?? "The ticket"} is waiting for the resident to confirm power is back.`,
        ticket: reference,
        kind: "outage",
      };
    case "NEIGHBOUR_SAME_SITUATION":
      return {
        title: "Neighbour confirmed same outage",
        detail: `${reference ?? "The ticket"} gained another household in the area.`,
        ticket: reference,
        kind: "outage",
      };
    case "RESIDENT_CONFIRMED_RESTORE":
      return {
        title: "Resident confirmed power is back",
        detail: `${reference ?? "The ticket"} is closed. The household said lights are on.`,
        ticket: reference,
        kind: "outage",
      };
    case "RESIDENT_STILL_NO_POWER":
      return {
        title: "Resident said still no power",
        detail: `${reference ?? "The ticket"} was reopened so dispatch can send a crew again.`,
        ticket: reference,
        kind: "outage",
      };
    case "INSPECTOR_QA_ON_REPAIR":
      return {
        title: "Inspector scored the repair",
        detail: `Quality score ${num(p, "rating") ?? "?"}/5${str(p, "notes") ? ` · ${str(p, "notes")}` : ""}.`,
        ticket: reference,
        kind: "outage",
      };
    case "ANONYMOUS_IZINYOKA_TIP":
      return {
        title: "Anonymous tip received",
        detail: `${str(p, "address") ?? str(p, "suburb") ?? "A location"} · number stays hidden. ${str(p, "notes") ?? ""}`.trim(),
        ticket: reference,
        kind: "revenue",
      };
    case "ANOMALY_ZERO_CONSUMPTION_FLAGGED":
      return {
        title: "Silent prepaid meter flagged",
        detail: `Account ${str(p, "accountNumber") ?? "unknown"} bought 0 units for ${num(p, "daysZero") ?? "?"} days while feeder ${str(p, "feeder") ?? "?"} is still live. Risk ${num(p, "riskScore") ?? "?"}.`,
        ticket: reference,
        kind: "revenue",
      };
    case "INSPECTOR_EVIDENCE_UPLOADED":
      return {
        title: "Photo evidence saved",
        detail: str(p, "caption") ?? "A field photo was hashed into the chain.",
        ticket: reference,
        kind: "revenue",
      };
    case "TAMPER_FINE_ISSUED": {
      const total =
        (num(p, "totalZar") ??
          (num(p, "fineAmountZar") ?? 0) +
            (num(p, "backbillZar") ?? 0) +
            (num(p, "penaltyZar") ?? 0));
      return {
        title: "Tamper fine issued",
        detail: `${formatZar(total)} · fine + back-bill + penalty.`,
        ticket: reference,
        kind: "revenue",
      };
    }
    case "INVESTIGATION_CLOSED":
      return {
        title: "Revenue case closed",
        detail: `${reference ?? "The case"} was ${prettyClose(str(p, "status"))}.`,
        ticket: reference,
        kind: "revenue",
      };
    default:
      return {
        title: row.actionType.replaceAll("_", " ").toLowerCase(),
        detail: `${roleLabel(row.actorRole)} updated this record.`,
        ticket: reference,
        kind,
      };
  }
}

export function actorName(row: AuditLog, users: User[]): string {
  const user = users.find((u) => u.id === row.actorId);
  if (user) return user.fullName;
  return roleLabel(row.actorRole);
}

export function entityKindLabel(kind: AuditStory["kind"]): string {
  if (kind === "outage") return "Outage";
  if (kind === "revenue") return "Revenue";
  return "System";
}
