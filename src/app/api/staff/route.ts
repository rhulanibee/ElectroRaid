import { fail, json } from "@/lib/http";
import { readyStore } from "@/lib/store";
import type { StaffProvision, StaffRole } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROLES = new Set<StaffRole>([
  "dispatcher",
  "technician",
  "revenue_inspector",
]);

function asProvision(value: unknown): StaffProvision | null {
  if (!value || typeof value !== "object") return null;
  const row = value as StaffProvision;
  if (!ROLES.has(row.role)) return null;
  if (typeof row.id !== "string" || !/^usr_[a-z0-9_]+$/i.test(row.id)) return null;
  if (typeof row.fullName !== "string" || row.fullName.trim().length < 3) return null;
  if (typeof row.email !== "string" || row.email.trim().length < 3) return null;
  const crewId =
    row.role === "dispatcher"
      ? null
      : typeof row.crewId === "string" && /^crew_[a-z0-9_]+$/i.test(row.crewId)
        ? row.crewId
        : null;
  if (row.role !== "dispatcher" && !crewId) return null;
  return {
    id: row.id,
    fullName: row.fullName.trim(),
    email: row.email.trim().toLowerCase(),
    phone: typeof row.phone === "string" ? row.phone : null,
    role: row.role,
    crewId,
    callsign: typeof row.callsign === "string" ? row.callsign.trim() : null,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { people?: unknown; removeIds?: unknown };
    const people = Array.isArray(body.people) ? body.people : [];
    const valid = people
      .map(asProvision)
      .filter((row): row is StaffProvision => row !== null);
    const removeIds = Array.isArray(body.removeIds)
      ? body.removeIds.filter((id): id is string => typeof id === "string")
      : [];
    if (!valid.length && !removeIds.length) return fail("No valid staff records.");
    const store = await readyStore();
    const created = valid.length ? store.ensureStaff(valid) : [];
    const removed = removeIds.length ? store.removeStaff(removeIds) : [];
    return json({
      ok: true,
      created: created.length,
      removed: removed.length,
      staff: valid.length,
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not add staff", 500);
  }
}
