import type { UserRole } from "./types";

export const SIGNIN_PASSWORD = "electroraid";
export const SESSION_KEY = "electroraid.session";
export const REGISTERED_KEY = "electroraid.registered";

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
  accountNumber?: string;
  crewId?: string;
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
];

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
  if (seeded) return seeded;
  return loadRegistered().find((r) => r.persona.id === id)?.persona;
}

export function personaByEmail(email: string): DemoPersona | undefined {
  const needle = email.trim().toLowerCase();
  const seeded = PERSONAS.find((p) => p.email.toLowerCase() === needle);
  if (seeded) return seeded;
  return loadRegistered().find((r) => r.persona.email.toLowerCase() === needle)
    ?.persona;
}

export function personaByAccount(account: string): DemoPersona | undefined {
  const needle = account.trim();
  const seeded = PERSONAS.find((p) => p.accountNumber === needle);
  if (seeded) return seeded;
  return loadRegistered().find((r) => r.persona.accountNumber === needle)
    ?.persona;
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

  const seeded = PERSONAS.find((p) =>
    matches(p.email, p.accountNumber, p.name),
  );
  if (seeded) {
    return { persona: seeded, password: SIGNIN_PASSWORD };
  }
  return loadRegistered().find((r) =>
    matches(r.persona.email, r.persona.accountNumber, r.persona.name),
  );
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
