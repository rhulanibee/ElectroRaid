import type { FieldCrew, StaffProvision, User, UserRole } from "@/lib/types";
import type { DemoPersona } from "@/lib/session";
import { staffHome, staffTitle } from "@/lib/staff-meta";

const STAFF_ROLES: UserRole[] = [
  "dispatcher",
  "technician",
  "revenue_inspector",
  "admin",
];

export function isLoginStaffRole(role: UserRole) {
  return STAFF_ROLES.includes(role);
}

export function personaFromStaffUser(
  user: User,
  crew: FieldCrew | undefined,
): DemoPersona {
  const callsign = crew?.callsign ?? "";
  const role = user.role;
  const [firstName, ...rest] = user.fullName.trim().split(/\s+/);
  const lastName = rest.join(" ");
  return {
    id: user.id,
    name: user.fullName,
    firstName: firstName || user.fullName,
    lastName,
    role,
    title:
      role === "admin"
        ? "System administrator"
        : role === "dispatcher" || role === "technician" || role === "revenue_inspector"
          ? staffTitle(role, callsign)
          : user.fullName,
    email: user.email ?? user.id,
    phone: user.phone ?? undefined,
    home:
      role === "admin"
        ? "/admin"
        : role === "dispatcher" || role === "technician" || role === "revenue_inspector"
          ? staffHome(role)
          : "/ops",
    crewId: crew?.id,
    callsign: callsign || undefined,
    verified: true,
    blurb: "Municipal staff account.",
    duties:
      role === "technician"
        ? ["Assigned jobs", "On site", "Sign off"]
        : role === "revenue_inspector"
          ? ["Meter audit", "Izinyoka", "Repair QA"]
          : role === "admin"
            ? ["Staff"]
            : ["Assign technician", "Live map", "Work queue"],
  };
}

export function mergeStaffPassword(
  next: StaffProvision,
  previous: StaffProvision | undefined,
): StaffProvision {
  const incoming = next.password?.trim() || null;
  const kept = previous?.password?.trim() || null;
  return {
    ...next,
    password: incoming || kept || null,
  };
}
