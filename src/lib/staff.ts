import {
  ADMIN_USERNAME,
  clearStaffOverride,
  loadRegistered,
  loadStaffOverrides,
  loadStaffRemoved,
  PERSONAS,
  presentStaff,
  saveRegistered,
  saveStaffOverride,
  saveStaffRemoved,
  type DemoPersona,
  type StaffOverride,
} from "@/lib/session";
import type { StaffProvision, StaffRole } from "@/lib/types";

export interface StaffDraft {
  firstName: string;
  lastName: string;
  username: string;
  password: string;
  phone: string;
  role: StaffRole;
  callsign: string;
}

const STAFF_ROLES: StaffRole[] = [
  "dispatcher",
  "technician",
  "revenue_inspector",
];

export function isStaffRole(role: string): role is StaffRole {
  return STAFF_ROLES.includes(role as StaffRole);
}

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

function nextCallsign(role: StaffRole) {
  if (role === "dispatcher") return "";
  const prefix = role === "revenue_inspector" ? "RP" : "MT";
  const used = new Set(
    [...PERSONAS, ...loadRegistered().map((row) => row.persona)]
      .map((persona) => persona.callsign)
      .filter((value): value is string => Boolean(value)),
  );
  let n = 20;
  let sign = `${prefix}-${n}`;
  while (used.has(sign)) {
    n += 1;
    sign = `${prefix}-${n}`;
  }
  return sign;
}

export interface ManagedStaff {
  persona: DemoPersona;
  builtin: boolean;
}

function usernameTaken(username: string, exceptId?: string) {
  if (username === ADMIN_USERNAME) return true;
  for (const base of PERSONAS) {
    const view = presentStaff(base);
    if (!view || view.id === exceptId) continue;
    if (view.email.toLowerCase() === username) return true;
  }
  for (const row of loadRegistered()) {
    if (row.persona.id === exceptId) continue;
    if (loadStaffRemoved().includes(row.persona.id)) continue;
    if (row.persona.email.toLowerCase() === username) return true;
  }
  return false;
}

function validateStaff(input: StaffDraft, exceptId?: string, passwordRequired = true) {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const username = input.username.trim().toLowerCase();
  const phone = input.phone.trim();
  if (!firstName || !lastName) return { error: "Enter a first and last name." };
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    return { error: "Username must be 3–32 letters, numbers, dots, or hyphens." };
  }
  if (passwordRequired && input.password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (!passwordRequired && input.password && input.password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (!isStaffRole(input.role)) {
    return { error: "Choose a dispatcher, technician, or inspector." };
  }
  if (usernameTaken(username, exceptId)) {
    return { error: "That username is already in use." };
  }
  return { firstName, lastName, username, phone };
}

export function listStaffAccounts(): ManagedStaff[] {
  const removed = new Set(loadStaffRemoved());
  const people: ManagedStaff[] = [];
  for (const base of PERSONAS) {
    if (!isStaffRole(base.role)) continue;
    const view = presentStaff(base);
    if (!view || !isStaffRole(view.role)) continue;
    people.push({ persona: view, builtin: true });
  }
  for (const row of loadRegistered()) {
    if (!isStaffRole(row.persona.role) || removed.has(row.persona.id)) continue;
    people.push({ persona: row.persona, builtin: false });
  }
  return people;
}

export function updateStaffAccount(
  id: string,
  input: StaffDraft,
): { persona: DemoPersona | null; error?: string } {
  const builtin = PERSONAS.find((persona) => persona.id === id);
  const registered = loadRegistered().find((row) => row.persona.id === id);
  const current = builtin ? presentStaff(builtin) : registered?.persona;
  if (!current || !isStaffRole(current.role)) {
    return { persona: null, error: "That staff account was not found." };
  }
  const checked = validateStaff(input, id, false);
  if ("error" in checked) return { persona: null, error: checked.error };

  const callsign =
    input.role === "dispatcher"
      ? ""
      : input.callsign.trim() || current.callsign || nextCallsign(input.role);
  if (input.role !== "dispatcher" && callsign.length < 2) {
    return { persona: null, error: "Enter a callsign for this field crew." };
  }
  const crewId =
    input.role === "dispatcher"
      ? undefined
      : current.crewId ?? `crew_${Date.now().toString(36)}`;
  const persona: DemoPersona = {
    ...current,
    name: `${checked.firstName} ${checked.lastName}`,
    firstName: checked.firstName,
    lastName: checked.lastName,
    role: input.role,
    title: staffTitle(input.role, callsign),
    email: checked.username,
    phone: checked.phone || undefined,
    home: staffHome(input.role),
    crewId,
    callsign: callsign || undefined,
  };

  if (builtin) {
    const previous = loadStaffOverrides()[id];
    const patch: StaffOverride = {
      firstName: persona.firstName ?? checked.firstName,
      lastName: persona.lastName ?? checked.lastName,
      name: persona.name,
      email: persona.email,
      phone: persona.phone,
      role: persona.role,
      title: persona.title,
      home: persona.home,
      callsign: persona.callsign,
      crewId: persona.crewId,
      password: input.password ? input.password : previous?.password,
    };
    saveStaffOverride(id, patch);
  } else if (registered) {
    const rows = loadRegistered();
    const idx = rows.findIndex((row) => row.persona.id === id);
    rows[idx] = {
      persona,
      password: input.password || registered.password,
    };
    saveRegistered(rows);
  }
  return { persona };
}

export function removeStaffAccount(id: string): { ok: boolean; error?: string } {
  const builtin = PERSONAS.find((persona) => persona.id === id);
  const registered = loadRegistered().some((row) => row.persona.id === id);
  if (builtin && !isStaffRole(builtin.role)) {
    return { ok: false, error: "Only technicians, dispatchers, and inspectors can be removed." };
  }
  if (!builtin && !registered) {
    return { ok: false, error: "That staff account was not found." };
  }
  if (builtin && isStaffRole(builtin.role)) {
    saveStaffRemoved([...loadStaffRemoved(), id]);
    clearStaffOverride(id);
  }
  saveRegistered(loadRegistered().filter((row) => row.persona.id !== id));
  return { ok: true };
}

export function addStaffAccount(
  input: StaffDraft,
): { persona: DemoPersona | null; error?: string } {
  const checked = validateStaff(input);
  if ("error" in checked) {
    return { persona: null, error: checked.error };
  }

  const callsign =
    input.role === "dispatcher"
      ? ""
      : input.callsign.trim() || nextCallsign(input.role);
  if (input.role !== "dispatcher" && callsign.length < 2) {
    return { persona: null, error: "Enter a callsign for this field crew." };
  }

  const stamp = Date.now().toString(36);
  const persona: DemoPersona = {
    id: `usr_${stamp}`,
    name: `${checked.firstName} ${checked.lastName}`,
    firstName: checked.firstName,
    lastName: checked.lastName,
    role: input.role,
    title: staffTitle(input.role, callsign),
    email: checked.username,
    phone: checked.phone || undefined,
    home: staffHome(input.role),
    crewId: input.role === "dispatcher" ? undefined : `crew_${stamp}`,
    callsign: callsign || undefined,
    verified: true,
    blurb: "Municipal staff account created by the administrator.",
    duties:
      input.role === "dispatcher"
        ? ["Assign technician", "Live map", "Work queue"]
        : input.role === "technician"
          ? ["Assigned jobs", "On site", "Sign off"]
          : ["Meter audit", "Izinyoka", "Repair QA"],
  };
  saveRegistered([
    ...loadRegistered(),
    { persona, password: input.password },
  ]);
  return { persona };
}

export function staffProvisions(): StaffProvision[] {
  const people: StaffProvision[] = [];
  for (const row of listStaffAccounts()) {
    const role = row.persona.role;
    if (!isStaffRole(role)) continue;
    people.push({
      id: row.persona.id,
      fullName: row.persona.name,
      email: row.persona.email,
      phone: row.persona.phone ?? null,
      role,
      crewId: row.persona.crewId ?? null,
      callsign: row.persona.callsign ?? null,
    });
  }
  return people;
}

/** Push the staff directory onto the live ops floor, including removals. */
export async function syncLocalStaff() {
  const people = staffProvisions();
  const removeIds = loadStaffRemoved();
  if (!people.length && !removeIds.length) return;
  await fetch("/api/staff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ people, removeIds }),
  });
}
