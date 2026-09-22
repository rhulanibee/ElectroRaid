"use client";

import { useMemo, useState } from "react";
import { ButtonSpinner, pressLock, pressLockProps } from "@/components/ui/button-spinner";
import { roleLabel } from "@/lib/format";
import {
  addStaffAccount,
  listStaffAccounts,
  removeStaffAccount,
  syncLocalStaff,
  updateStaffAccount,
  type StaffDraft,
} from "@/lib/staff";
import type { StaffRole } from "@/lib/types";
import { cn } from "@/lib/utils";

const EMPTY: StaffDraft = {
  firstName: "",
  lastName: "",
  username: "",
  password: "",
  phone: "",
  role: "technician",
  callsign: "",
};

function roleName(role: string) {
  if (role === "revenue_inspector") return "Inspector";
  if (role === "technician") return "Technician";
  if (role === "dispatcher") return "Dispatcher";
  return roleLabel(role as StaffRole);
}

export function AdminStaff() {
  const [draft, setDraft] = useState<StaffDraft>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState<"save" | string | null>(null);

  const staff = useMemo(() => {
    void version;
    return listStaffAccounts();
  }, [version]);

  function set<K extends keyof StaffDraft>(key: K, value: StaffDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setDraft(EMPTY);
    setEditingId(null);
  }

  function beginEdit(id: string) {
    const row = staff.find((item) => item.persona.id === id);
    if (!row) return;
    const [first, ...rest] = row.persona.name.split(" ");
    setEditingId(id);
    setError(null);
    setNotice(null);
    setDraft({
      firstName: row.persona.firstName ?? first ?? "",
      lastName: row.persona.lastName ?? rest.join(" "),
      username: row.persona.email,
      password: "",
      phone: row.persona.phone ?? "",
      role: row.persona.role as StaffRole,
      callsign: row.persona.callsign ?? "",
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy("save");
    try {
      const result = editingId
        ? updateStaffAccount(editingId, draft)
        : addStaffAccount(draft);
      if (!result.persona) {
        setError(result.error ?? "Could not save that person.");
        return;
      }
      try {
        await syncLocalStaff();
      } catch {
        setError(
          "Saved on this device, but the live ops floor did not accept the update. Try again.",
        );
        setVersion((n) => n + 1);
        return;
      }
      setNotice(
        editingId
          ? `${result.persona.name} is updated.`
          : `${result.persona.name} can sign in with username ${result.persona.email}.`,
      );
      resetForm();
      setVersion((n) => n + 1);
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Remove ${name}? They will no longer be able to sign in.`)) {
      return;
    }
    setError(null);
    setNotice(null);
    setBusy(`remove:${id}`);
    try {
      const result = removeStaffAccount(id);
      if (!result.ok) {
        setError(result.error ?? "Could not remove that person.");
        return;
      }
      try {
        await syncLocalStaff();
      } catch {
        setError("Removed on this device, but the live floor did not update. Try again.");
        setVersion((n) => n + 1);
        return;
      }
      if (editingId === id) resetForm();
      setNotice(`${name} was removed.`);
      setVersion((n) => n + 1);
    } finally {
      setBusy(null);
    }
  }

  const fieldClass =
    "h-11 w-full rounded-xl border border-[#E5E7EB] px-3 outline-none focus:border-[#24A148]";

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <h1 className="font-heading text-2xl font-bold">Staff</h1>
      <p className="mt-1 text-sm text-[#6B7280]">
        Add, edit, or remove dispatchers, technicians, and inspectors. Usernames
        and passwords sync to the live floor so staff can sign in from any device.
      </p>

      <form
        onSubmit={submit}
        className="mt-5 grid gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm sm:grid-cols-2"
      >
        <h2 className="font-heading text-sm font-bold sm:col-span-2">
          {editingId ? "Edit staff" : "Add staff"}
        </h2>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">First name</span>
          <input
            value={draft.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Last name</span>
          <input
            value={draft.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Username</span>
          <input
            value={draft.username}
            onChange={(e) => set("username", e.target.value)}
            autoComplete="off"
            placeholder="e.g. l.maseko"
            className={fieldClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Password</span>
          <input
            type="password"
            value={draft.password}
            onChange={(e) => set("password", e.target.value)}
            autoComplete="new-password"
            placeholder={editingId ? "Leave blank to keep the current password" : "At least 8 characters"}
            className={fieldClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Role</span>
          <select
            value={draft.role}
            onChange={(e) => set("role", e.target.value as StaffRole)}
            className={`${fieldClass} bg-white`}
          >
            <option value="technician">Technician</option>
            <option value="revenue_inspector">Inspector</option>
            <option value="dispatcher">Dispatcher</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Phone</span>
          <input
            value={draft.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="Optional"
            className={fieldClass}
          />
        </label>
        {draft.role === "dispatcher" ? null : (
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1.5 block font-medium">Callsign</span>
            <input
              value={draft.callsign}
              onChange={(e) => set("callsign", e.target.value)}
              placeholder="Leave blank to assign the next van number"
              className={fieldClass}
            />
          </label>
        )}
        {error ? <p className="text-sm text-[#DC2626] sm:col-span-2">{error}</p> : null}
        {notice ? (
          <p className="text-sm font-medium text-[#167a34] sm:col-span-2">{notice}</p>
        ) : null}
        <div className="flex gap-2 sm:col-span-2">
          <button
            type="submit"
            disabled={busy !== null}
            {...pressLockProps(busy === "save")}
            className={cn(
              "inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold",
              pressLock.base,
              pressLock.primary,
            )}
          >
            {busy === "save" ? (
              <ButtonSpinner label={editingId ? "Saving…" : "Adding…"} />
            ) : editingId ? (
              "Save changes"
            ) : (
              `Add ${roleName(draft.role).toLowerCase()}`
            )}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-[#E5E7EB] px-4 text-sm font-semibold text-[#121417]"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </form>

      <h2 className="font-heading mt-8 text-sm font-bold">Technicians, dispatchers, and inspectors</h2>
      <div className="mt-3 space-y-2">
        {staff.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#E5E7EB] bg-white px-4 py-8 text-center text-sm text-[#6B7280]">
            No staff yet. Add a technician, inspector, or dispatcher above.
          </div>
        ) : (
          staff.map((row) => (
            <div
              key={row.persona.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 shadow-sm"
            >
              <div>
                <div className="text-sm font-semibold">{row.persona.name}</div>
                <div className="mt-0.5 text-sm text-[#6B7280]">
                  {roleName(row.persona.role)} · username {row.persona.email}
                  {row.persona.callsign ? ` · ${row.persona.callsign}` : ""}
                  {row.persona.phone ? ` · ${row.persona.phone}` : ""}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => beginEdit(row.persona.id)}
                  className="inline-flex h-9 items-center rounded-xl border border-[#E5E7EB] px-3 text-sm font-semibold text-[#121417] hover:border-[#24A148]"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => remove(row.persona.id, row.persona.name)}
                  {...pressLockProps(busy === `remove:${row.persona.id}`)}
                  className={cn(
                    "inline-flex h-9 items-center rounded-xl px-3 text-sm font-semibold",
                    pressLock.base,
                    pressLock.dangerOutline,
                  )}
                >
                  {busy === `remove:${row.persona.id}` ? (
                    <ButtonSpinner label="Removing…" />
                  ) : (
                    "Remove"
                  )}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
