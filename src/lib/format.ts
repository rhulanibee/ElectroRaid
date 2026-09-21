import type { IncidentStatus, OutageClassification, UserRole } from "./types";

const zarFmt = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  maximumFractionDigits: 0,
});

export function formatZar(amount: number): string {
  return zarFmt.format(amount);
}

export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeMinutes(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return `${hours}h ago`;
}

export function classificationLabel(value: OutageClassification): string {
  switch (value) {
    case "no_power":
      return "no power";
    case "partial_outage":
      return "partial outage";
    case "voltage_fluctuation":
      return "voltage fluctuation";
    case "cable_fault":
      return "cable fault";
    case "transformer_fault":
      return "transformer / mini-sub";
    case "streetlight":
      return "streetlight";
    case "meter_issue":
      return "meter issue";
    case "izinyoka_tip":
      return "Izinyoka tip";
    case "other":
      return "other";
  }
}

export function roleLabel(role: UserRole): string {
  switch (role) {
    case "revenue_inspector":
      return "Revenue inspector";
    case "dispatcher":
      return "Dispatcher";
    case "technician":
      return "Technician";
    case "executive":
      return "Executive";
    case "resident":
      return "Resident";
    case "admin":
      return "Administrator";
    default:
      return "System";
  }
}

export function actionLabel(action: string): string {
  return action.replaceAll("_", " ").toLowerCase();
}

export function formatMinutes(value: number | null): string {
  if (value === null) return "—";
  if (value < 60) return `${value} min`;
  const h = Math.floor(value / 60);
  const m = Math.round(value % 60);
  return `${h}h ${m}m`;
}

/** Plain-language ticket status for dispatchers, residents, and inspectors. */
export function incidentStatusLabel(status: IncidentStatus): string {
  switch (status) {
    case "open":
      return "Open — waiting for a crew";
    case "clustered":
      return "Clustered — nearby reports merged";
    case "dispatched":
      return "Dispatched — crew assigned";
    case "en_route":
      return "En route — technician driving";
    case "on_site":
      return "On site — technician logged in";
    case "resolved":
      return "Tech done — waiting for resident confirm";
    case "closed":
      return "Closed — resident confirmed restore";
  }
}

export function incidentStatusColor(status: IncidentStatus): string {
  switch (status) {
    case "open":
    case "clustered":
      return "#e24b4b";
    case "dispatched":
    case "en_route":
      return "#5ec8ff";
    case "on_site":
      return "#3dd6a0";
    case "resolved":
      return "#e4c35a";
    case "closed":
      return "#7aa0b3";
  }
}
