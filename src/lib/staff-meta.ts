import type { StaffRole } from "@/lib/types";

export const SIGNIN_PASSWORD = "electroraid";
export const ADMIN_USERNAME = "admin";
export const ADMIN_PASSWORD = "Admin123";

export function staffHome(role: StaffRole) {
  switch (role) {
    case "technician":
      return "/tech";
    case "revenue_inspector":
      return "/inspect";
    default:
      return "/ops";
  }
}

export function staffTitle(role: StaffRole, callsign: string) {
  switch (role) {
    case "technician":
      return `Field technician · ${callsign}`;
    case "revenue_inspector":
      return `Revenue protection investigator · ${callsign}`;
    default:
      return "Control room dispatcher";
  }
}
