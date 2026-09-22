"use client";

import { useMemo, useState } from "react";
import {
  TrackLiveMap,
  technicianNameForCrew,
} from "@/components/track-live-map";
import { SeverityBadge, StatusBadge } from "@/components/status-badge";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { postJson, usePlatform } from "@/lib/use-platform";
import { useSession } from "@/lib/use-session";
import { classificationLabel, relativeMinutes } from "@/lib/format";
import type { MasterIncident } from "@/lib/types";

export function ResidentTrack() {
  const { persona } = useSession();
  const { snapshot } = usePlatform();
  const account = persona?.accountNumber;
  const tickets = useMemo(() => {
    const mine = new Set(
      (snapshot?.reports ?? [])
        .filter((report) => account && report.accountNumber === account)
        .map((report) => report.masterIncidentId),
    );
    return (snapshot?.incidents ?? []).filter(
      (incident) => mine.has(incident.id) && incident.status !== "closed",
    );
  }, [snapshot, account]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"confirm" | "dispute" | null>(null);
  const [ackLights, setAckLights] = useState(false);

  const selected: MasterIncident | undefined =
    tickets.find((t) => t.id === selectedId) ?? tickets[0];
  const crew = snapshot?.crews.find((c) => c.id === selected?.assignedCrewId);
  const techName = crew
    ? technicianNameForCrew(crew, snapshot?.users ?? [])
    : null;

  async function confirm(id: string) {
    if (!ackLights) {
      setError("Tick the box to confirm your lights are back before closing.");
      return;
    }
    setBusy("confirm");
    setError(null);
    try {
      const result = await postJson<{ ok: boolean; error?: string }>(
        "/api/field/action",
        {
          action: "confirm",
          kind: "outage",
          targetId: id,
          actorId: persona?.id,
        },
      );
      if (!result.ok) {
        setError(result.error ?? "Confirm failed.");
        return;
      }
      setMessage("Thank you. You confirmed power is back. Ticket closed.");
      setAckLights(false);
    } finally {
      setBusy(null);
    }
  }

  async function dispute(id: string) {
    setBusy("dispute");
    setError(null);
    try {
      const result = await postJson<{ ok: boolean; error?: string }>(
        "/api/field/action",
        {
          action: "dispute",
          kind: "outage",
          targetId: id,
          actorId: persona?.id,
        },
      );
      if (!result.ok) {
        setError(result.error ?? "Dispute failed.");
        return;
      }
      setMessage("Still no power logged. Dispatch will send a crew again.");
      setAckLights(false);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 md:p-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Active Reports</h1>
        <p className="mt-1 text-sm text-[#6B7280]">
          Live technician tracking for reports on your account. After sign-off
          you must Confirm or Dispute — tickets do not close without you.
        </p>
      </div>

      {tickets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#E5E7EB] bg-white px-4 py-12 text-center text-sm text-[#6B7280]">
          No active reports to track. Report an outage, or answer a same-area
          alert if a neighbour already reported nearby.
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {tickets.map((incident) => (
            <button
              key={incident.id}
              type="button"
              onClick={() => {
                setSelectedId(incident.id);
                setAckLights(false);
                setError(null);
              }}
              className={`min-w-[260px] rounded-2xl border bg-white p-4 text-left shadow-sm transition ${
                selected?.id === incident.id
                  ? "border-[#24A148] ring-2 ring-[#24A148]/20"
                  : "border-[#E5E7EB] hover:border-[#24A148]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-[#6B7280]">
                  {incident.reference}
                </span>
                <StatusBadge status={incident.status} />
              </div>
              <div className="mt-2 text-sm font-semibold">{incident.address}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <SeverityBadge
                  households={incident.affectedHouseholds}
                  classification={incident.classification}
                />
                <span className="text-xs text-[#6B7280]">
                  {classificationLabel(incident.classification)} ·{" "}
                  {relativeMinutes(incident.firstReportedAt)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected ? (
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-h-[280px] overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
            {crew ? (
              <TrackLiveMap
                incident={selected}
                crew={crew}
                technicianName={techName ?? crew.callsign}
              />
            ) : (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center px-6 text-center">
                <div className="text-sm font-semibold text-[#121417]">
                  Waiting for a technician
                </div>
                <p className="mt-1 max-w-sm text-sm text-[#6B7280]">
                  Control room has your ticket. The live map appears the moment a
                  crew is assigned to this job.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm">
              <div className="text-[11px] font-bold tracking-[0.16em] text-[#24A148] uppercase">
                Technician
              </div>
              {crew && techName ? (
                <>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex size-12 items-center justify-center rounded-full bg-[#E8F6EC] text-sm font-bold text-[#24A148]">
                      {techName
                        .split(" ")
                        .map((p) => p[0])
                        .slice(0, 2)
                        .join("")}
                    </div>
                    <div>
                      <div className="font-semibold">{techName}</div>
                      <div className="text-xs text-[#6B7280]">
                        {crew.callsign} · {crew.vehicleReg}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <StatusBadge status={selected.status} />
                  </div>
                </>
              ) : (
                <p className="mt-2 text-sm text-[#6B7280]">
                  No crew assigned yet.
                </p>
              )}
            </div>

            {selected.status === "resolved" ? (
              <div className="rounded-2xl border-2 border-[#DC2626]/40 bg-[#FEF2F2] p-4 shadow-sm">
                <div className="text-[11px] font-bold tracking-[0.16em] text-[#B91C1C] uppercase">
                  Required — household confirm
                </div>
                <div className="mt-2 text-sm font-semibold text-[#121417]">
                  Technician says supply is restored. Is your power back?
                </div>
                <p className="mt-1 text-xs text-[#6B7280]">
                  This ticket stays open until you Confirm (lights on) or Dispute
                  (still no power). Dispatch cannot close it for you.
                </p>
                <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2.5 text-sm text-[#121417]">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-[#24A148]"
                    checked={ackLights}
                    onChange={(e) => {
                      setAckLights(e.target.checked);
                      setError(null);
                    }}
                  />
                  <span>
                    I confirm the lights are back on at{" "}
                    <strong>{selected.address}</strong>.
                  </span>
                </label>
                <div className="mt-3 grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    disabled={busy !== null || !ackLights}
                    onClick={() => confirm(selected.id)}
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-[#24A148] text-sm font-semibold text-white hover:bg-[#1e8a3c] disabled:opacity-60"
                  >
                    {busy === "confirm" ? (
                      <ButtonSpinner label="Confirming…" />
                    ) : (
                      "Confirm — power restored"
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => dispute(selected.id)}
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-[#DC2626] text-sm font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-60"
                  >
                    {busy === "dispute" ? (
                      <ButtonSpinner label="Sending…" />
                    ) : (
                      "Dispute — still no power"
                    )}
                  </button>
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="rounded-xl bg-[#FEF2F2] px-3 py-2 text-sm text-[#B91C1C]">
                {error}
              </div>
            ) : null}
            {message ? (
              <div className="rounded-xl bg-[#E8F6EC] px-3 py-2 text-sm text-[#167a34]">
                {message}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
