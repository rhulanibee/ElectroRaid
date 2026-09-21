import type { UserRole } from "./types";

export const SIGNIN_PASSWORD = "electroraid";
export const ADMIN_USERNAME = "admin";
export const ADMIN_PASSWORD = "Admin123";
export const SESSION_KEY = "electroraid.session";
export const REGISTERED_KEY = "electroraid.registered";
export const PROFILE_KEY = "electroraid.profiles";
export const STAFF_REMOVED_KEY = "electroraid.staff.removed";
export const STAFF_OVERRIDE_KEY = "electroraid.staff.overrides";

const SEEDED_PASSWORDS: Record<string, string> = {
  usr_admin: ADMIN_PASSWORD,
};

export interface DemoPersona {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  role: UserRole;
  title: string;
  email: string;
  phone?: string;
  home: string;
  suburb?: string;
  address?: string;
  accountNumber?: string;
  crewId?: string;
  callsign?: string;
  verified?: boolean;
  blurb: string;
  duties: string[];
}

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  accountNumber: string;
  phone: string;
  password: string;
}

export interface StoredResident {
  persona: DemoPersona;
  password: string;
  proofName?: string;
}

export const PERSONAS: DemoPersona[] = [
  {
    id: "usr_sibusiso",
    name: "Sibusiso Mabena",
    firstName: "Sibusiso",
    lastName: "Mabena",
    role: "resident",
    title: "Resident · Mamelodi Ext 11",
    email: "sibusiso@resident.tshwane",
    phone: "+27 82 441 0190",
    home: "/resident",
    suburb: "Mamelodi",
    address: "12 Tsamaya Road, Mamelodi Ext 11",
    accountNumber: "3218840441",
    verified: true,
    blurb:
      "Report a fault, wait for dispatch, then track the technician live on a map. Confirm when power is back.",
    duties: ["Report", "Live track van", "Confirm restore"],
  },
  {
    id: "usr_thandiwe",
    name: "Thandiwe Nkosi",
    firstName: "Thandiwe",
    lastName: "Nkosi",
    role: "dispatcher",
    title: "Control room dispatcher",
    email: "t.nkosi@tshwane.gov.za",
    home: "/ops",
    verified: true,
    blurb:
      "Assign a named technician to the resident’s ticket. The job lands on that handset immediately and the household tracks the van live.",
    duties: ["Assign technician", "Live map", "Work queue"],
  },
  {
    id: "usr_sipho",
    name: "Sipho Dlamini",
    firstName: "Sipho",
    lastName: "Dlamini",
    role: "technician",
    title: "Field technician · MT-12",
    email: "s.dlamini@tshwane.gov.za",
    home: "/tech",
    crewId: "crew_mt_mamelodi",
    verified: true,
    blurb:
      "The moment control room assigns your crew, the job appears here and the resident tracks your GPS.",
    duties: ["Assigned jobs", "On site", "Sign off"],
  },
  {
    id: "usr_nomsa",
    name: "Nomsa Khumalo",
    firstName: "Nomsa",
    lastName: "Khumalo",
    role: "revenue_inspector",
    title: "Revenue protection investigator · RP-03",
    email: "n.khumalo@tshwane.gov.za",
    home: "/inspect",
    crewId: "crew_rp_east",
    verified: true,
    blurb:
      "Zero-kWh audits, seal checks, digital tamper fines, and quality-assurance scores on what the technician repaired.",
    duties: ["Meter audit", "Izinyoka", "Repair QA"],
  },
  {
    id: "usr_admin",
    name: "Admin",
    firstName: "Admin",
    role: "admin",
    title: "Municipal administrator",
    email: ADMIN_USERNAME,
    home: "/admin",
    verified: true,
    blurb:
      "Add dispatchers, field technicians, and revenue-protection inspectors.",
    duties: ["Add dispatcher", "Add technician", "Add inspector"],
  },
];

export interface ProfilePatch {
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone?: string;
  suburb?: string;
  address?: string;
  title?: string;
}

export function loadProfiles(): Record<string, ProfilePatch> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ProfilePatch>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveProfile(id: string, patch: ProfilePatch) {
  const all = loadProfiles();
  all[id] = patch;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(all));
}

export interface StaffOverride {
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  title: string;
  home: string;
  callsign?: string;
  crewId?: string;
  password?: string;
}

export function loadStaffRemoved(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STAFF_REMOVED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

export function saveStaffRemoved(ids: string[]) {
  localStorage.setItem(STAFF_REMOVED_KEY, JSON.stringify([...new Set(ids)]));
}

export function loadStaffOverrides(): Record<string, StaffOverride> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STAFF_OVERRIDE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, StaffOverride>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveStaffOverride(id: string, patch: StaffOverride) {
  const all = loadStaffOverrides();
  all[id] = patch;
  localStorage.setItem(STAFF_OVERRIDE_KEY, JSON.stringify(all));
}

export function clearStaffOverride(id: string) {
  const all = loadStaffOverrides();
  delete all[id];
  localStorage.setItem(STAFF_OVERRIDE_KEY, JSON.stringify(all));
}

/** Built-in municipal staff after an admin edit or removal. Null means removed. */
export function presentStaff(persona: DemoPersona): DemoPersona | null {
  if (loadStaffRemoved().includes(persona.id)) return null;
  const patch = loadStaffOverrides()[persona.id];
  if (!patch) return persona;
  return {
    ...persona,
    ...patch,
    id: persona.id,
    accountNumber: persona.accountNumber,
    verified: persona.verified,
    blurb: persona.blurb,
    duties: persona.duties,
  };
}

/** Editable household fields saved on this device. Account number stays fixed. */
export function withProfile(persona: DemoPersona): DemoPersona {
  const patch = loadProfiles()[persona.id];
  if (!patch) return persona;
  return {
    ...persona,
    ...patch,
    id: persona.id,
    role: persona.role,
    home: persona.home,
    accountNumber: persona.accountNumber,
    crewId: persona.crewId,
    verified: persona.verified,
  };
}

export function loadRegistered(): StoredResident[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(REGISTERED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredResident[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRegistered(rows: StoredResident[]) {
  localStorage.setItem(REGISTERED_KEY, JSON.stringify(rows));
}

export function personaById(id: string): DemoPersona | undefined {
  const seeded = PERSONAS.find((p) => p.id === id);
  if (seeded) {
    const staff = presentStaff(seeded);
    return staff ? withProfile(staff) : undefined;
  }
  if (loadStaffRemoved().includes(id)) return undefined;
  const registered = loadRegistered().find((r) => r.persona.id === id)?.persona;
  return registered ? withProfile(registered) : undefined;
}

export function personaByEmail(email: string): DemoPersona | undefined {
  const needle = email.trim().toLowerCase();
  const seeded = PERSONAS.map(presentStaff)
    .filter((p): p is DemoPersona => Boolean(p))
    .map(withProfile)
    .find((p) => p.email.toLowerCase() === needle);
  if (seeded) return seeded;
  return loadRegistered()
    .map((r) => withProfile(r.persona))
    .find((p) => p.email.toLowerCase() === needle);
}

export function personaByAccount(account: string): DemoPersona | undefined {
  const needle = account.trim();
  const seeded = PERSONAS.map(withProfile).find((p) => p.accountNumber === needle);
  if (seeded) return seeded;
  return loadRegistered()
    .map((r) => withProfile(r.persona))
    .find((p) => p.accountNumber === needle);
}

function normalizeId(value: string) {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}

export function findSignIn(identifier: string): StoredResident | undefined {
  const needle = normalizeId(identifier);
  if (!needle) return undefined;
  const matches = (email: string, account?: string, name?: string) =>
    email.toLowerCase() === needle ||
    (account ? normalizeId(account) === needle : false) ||
    (name ? name.toLowerCase() === needle : false);

  for (const base of PERSONAS) {
    const staff = presentStaff(base);
    if (!staff) continue;
    const persona = withProfile(staff);
    if (!matches(persona.email, persona.accountNumber, persona.name)) continue;
    const override = loadStaffOverrides()[base.id];
    return {
      persona,
      password: override?.password ?? SEEDED_PASSWORDS[base.id] ?? SIGNIN_PASSWORD,
    };
  }
  const registered = loadRegistered().find((r) => {
    const persona = withProfile(r.persona);
    return matches(persona.email, persona.accountNumber, persona.name);
  });
  if (!registered) return undefined;
  return { ...registered, persona: withProfile(registered.persona) };
}

export type NavItem = { href: string; label: string };

export function navForRole(role: UserRole): NavItem[] {
  switch (role) {
    case "resident":
      return [
        { href: "/resident", label: "Dashboard" },
        { href: "/resident/report", label: "Report Outage" },
        { href: "/resident/track", label: "Track Reports" },
        { href: "/resident/notifications", label: "Notifications" },
        { href: "/resident/settings", label: "Settings" },
      ];
    case "technician":
      return [{ href: "/tech", label: "Jobs" }];
    case "revenue_inspector":
      return [{ href: "/inspect", label: "Audits & QA" }];
    case "admin":
      return [{ href: "/admin", label: "Staff" }];
    case "executive":
      return [
        { href: "/analytics", label: "ROI" },
        { href: "/ops", label: "Command" },
      ];
    default:
      return [
        { href: "/ops", label: "Command" },
        { href: "/audit", label: "Audit" },
        { href: "/analytics", label: "ROI" },
      ];
  }
}

export function roleHome(role: UserRole): string {
  return PERSONAS.find((p) => p.role === role)?.home ?? "/ops";
}

export function navItemActive(pathname: string, href: string) {
  if (href === "/resident") return pathname === "/resident";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const SAFE_NEXT = [
  "/resident",
  "/resident/report",
  "/resident/track",
  "/resident/notifications",
  "/resident/settings",
  "/ops",
  "/tech",
  "/inspect",
  "/admin",
  "/audit",
  "/analytics",
];

export function safeNext(raw: string | null, fallback: string) {
  if (!raw) return fallback;
  try {
    const path = decodeURIComponent(raw);
    if (SAFE_NEXT.some((p) => path === p || path.startsWith(`${p}?`))) {
      return path;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

export function afterLoginPath(persona: DemoPersona, next: string | null) {
  if (persona.role === "resident" && persona.verified === false) {
    return "/verify";
  }
  return safeNext(next, persona.home);
}
