/**
 * Constraint-based field-force dispatch.
 *
 * Maintenance technicians are matched to physical equipment / cable faults.
 * Revenue protection investigators are matched to high-risk zero-consumption
 * houses and anonymous Izinyoka tip-offs.
 *
 * Ranking (lowest score wins):
 *   score = (distance_km * 12) + (active_queue_size * 18)
 *         + busy_penalty − skill_bonus
 *
 * Only crews whose specialisation matches the job are considered. Off-duty and
 * on-site crews are excluded from auto-assign. Auto-assign also enforces a
 * proximity cap so a far van is skipped until a closer skilled crew is free.
 */

import { distanceMetres, etaMinutes } from "../geo";
import type {
  DispatchRecommendation,
  FieldCrew,
  GeoPoint,
  InvestigationType,
  OutageClassification,
  Specialization,
  User,
} from "../types";

/** Auto-assign will not send a crew farther than this (metres). */
export const AUTO_DISPATCH_MAX_M = 25_000;

export function recommendationForCrew(
  crew: FieldCrew,
  users: User[],
  jobLocation: GeoPoint,
  preferredSkills: string[] = [],
): DispatchRecommendation {
  const distanceM = distanceMetres(crew.location, jobLocation);
  const busyPenalty =
    crew.status === "available" ? 0 : crew.status === "en_route" ? 8 : 40;
  const skillBonus = skillOverlapBonus(crew.skillCertifications, preferredSkills);
  const score =
    Math.round(
      ((distanceM / 1000) * 12 +
        crew.activeQueueSize * 18 +
        busyPenalty -
        skillBonus) *
        100,
    ) / 100;
  return {
    crewId: crew.id,
    callsign: crew.callsign,
    technicianName: users.find((u) => u.id === crew.userId)?.fullName ?? crew.callsign,
    specialization: crew.specialization,
    distanceM: Math.round(distanceM),
    queueSize: crew.activeQueueSize,
    score,
    etaMinutes: etaMinutes(distanceM),
  };
}

export type JobKind = "outage" | "investigation";

export type PickOptions = {
  /** Auto mode: proximity cap + only available/en_route crews. */
  mode?: "manual" | "auto";
  /** Certifications that suit this ticket (bonus when the crew holds them). */
  preferredSkills?: string[];
  /** Override the default auto proximity cap. */
  maxDistanceM?: number;
};

export function specializationForJob(kind: JobKind): Specialization {
  return kind === "investigation" ? "revenue_protection" : "maintenance";
}

/** Preferred skill tags for an outage classification. */
export function skillsForOutage(classification: OutageClassification): string[] {
  switch (classification) {
    case "cable_fault":
      return ["OHL_REPAIR", "MV_JOINTING"];
    case "transformer_fault":
      return ["MINI_SUB", "MV_JOINTING"];
    case "streetlight":
      return ["OHL_REPAIR"];
    case "meter_issue":
      return ["MV_JOINTING", "MINI_SUB"];
    case "voltage_fluctuation":
    case "partial_outage":
      return ["MV_JOINTING", "MINI_SUB", "OHL_REPAIR"];
    case "no_power":
    case "other":
    case "izinyoka_tip":
    default:
      return ["MV_JOINTING", "OHL_REPAIR", "MINI_SUB"];
  }
}

/** Preferred skill tags for a revenue / tip investigation. */
export function skillsForInvestigation(type: InvestigationType): string[] {
  switch (type) {
    case "izinyoka_tip":
    case "illegal_connection":
      return ["IZINYOKA", "METER_TAMPER"];
    case "meter_tamper":
      return ["METER_TAMPER", "PREPAID_AUDIT"];
    case "zero_consumption":
      return ["PREPAID_AUDIT", "METER_TAMPER"];
    default:
      return ["IZINYOKA", "METER_TAMPER", "PREPAID_AUDIT"];
  }
}

function skillOverlapBonus(certs: string[], preferred: string[]) {
  if (!preferred.length) return 0;
  const held = new Set(certs.map((c) => c.toUpperCase()));
  let hits = 0;
  for (const skill of preferred) {
    if (held.has(skill.toUpperCase())) hits += 1;
  }
  if (hits === 0) return 0;
  return Math.min(12, hits * 6);
}

function isEligible(crew: FieldCrew, mode: "manual" | "auto") {
  if (crew.status === "off_duty") return false;
  if (mode === "auto") {
    // Match SQL recommend_crew: only vans that can still take work.
    return crew.status === "available" || crew.status === "en_route";
  }
  return crew.status !== "on_site";
}

export function recommendCrews(
  crews: FieldCrew[],
  users: User[],
  jobLocation: GeoPoint,
  kind: JobKind,
  limit = 5,
  options: PickOptions = {},
): DispatchRecommendation[] {
  const spec = specializationForJob(kind);
  const mode = options.mode ?? "manual";
  const preferred = options.preferredSkills ?? [];
  const maxM =
    mode === "auto"
      ? (options.maxDistanceM ?? AUTO_DISPATCH_MAX_M)
      : options.maxDistanceM;

  return crews
    .filter((c) => c.specialization === spec)
    .filter((c) => isEligible(c, mode))
    .map((crew) => recommendationForCrew(crew, users, jobLocation, preferred))
    .filter((rec) => (maxM == null ? true : rec.distanceM <= maxM))
    .sort((a, b) => a.score - b.score || a.distanceM - b.distanceM)
    .slice(0, limit);
}

export function pickBestCrew(
  crews: FieldCrew[],
  users: User[],
  jobLocation: GeoPoint,
  kind: JobKind,
  options: PickOptions = {},
): DispatchRecommendation | null {
  return recommendCrews(crews, users, jobLocation, kind, 1, options)[0] ?? null;
}
