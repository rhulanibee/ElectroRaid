"use client";

import { useEffect, useRef, useState } from "react";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { formatWhen, relativeMinutes } from "@/lib/format";
import { pointForSuburb } from "@/lib/geo";
import { go } from "@/lib/hard-nav";
import { noticeLabel } from "@/lib/resident-notices";
import { postJson, usePlatform } from "@/lib/use-platform";
import { useResidentNotices } from "@/lib/use-resident-notices";
import { useSession } from "@/lib/use-session";

export function ResidentNotifications() {
  const { persona } = useSession();
  const { snapshot } = usePlatform();
  const { items, connected, markAllRead, dismissNotice } = useResidentNotices();
  const highlighted = useRef(new Set<string>());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    for (const item of items) {
      if (!item.read) highlighted.current.add(item.id);
    }
    markAllRead();
  }, [items, markAllRead]);

  async function joinSame(incidentId: string, noticeId: string) {
    if (!persona?.accountNumber || !persona.suburb || !persona.address) {
      setMessage("Add suburb and address in Settings before joining an outage.");
      return;
    }
    const incident = snapshot?.incidents.find((row) => row.id === incidentId);
    setBusyId(noticeId);
    setMessage(null);
    try {
      const result = await postJson<{
        ok: boolean;
        error?: string;
        incident?: { reference: string; affectedHouseholds: number };
      }>("/api/reports", {
        joinIncidentId: incidentId,
        accountNumber: persona.accountNumber,
        reporterName: persona.name,
        contactPhone: persona.phone ?? null,
        location: pointForSuburb(persona.suburb),
        address: persona.address,
        suburb: persona.suburb,
        classification: incident?.classification ?? "no_power",
        channel: "app",
        notes: "Neighbour confirmed same situation.",
      });
      if (!result.ok) {
        setMessage(result.error ?? "Could not join that outage. Try again.");
        return;
      }
      dismissNotice(noticeId);
      setMessage(
        `Joined ${result.incident?.reference ?? "the ticket"}. ${result.incident?.affectedHouseholds ?? ""} households on this outage.`,
      );
      go("/resident/track");
    } catch {
      setMessage("Could not join. Check the connection and try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Notifications</h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            Live updates for account {persona?.accountNumber ?? "your household"}
            {persona?.suburb ? ` · ${persona.suburb}` : ""}. Same-area outages ask
            you to confirm if you are affected.
          </p>
        </div>
        <div
          className={`mt-1 inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            connected
              ? "bg-[#E8F6EC] text-[#167a34]"
              : "bg-[#F3F4F6] text-[#6B7280]"
          }`}
        >
          <span
            className={`size-1.5 rounded-full ${connected ? "bg-[#24A148]" : "bg-[#9CA3AF]"}`}
          />
          {connected ? "Live" : "Reconnecting"}
        </div>
      </div>

      {message ? (
        <div className="mt-4 rounded-xl bg-[#E8F6EC] px-3 py-2 text-sm text-[#167a34]">
          {message}
        </div>
      ) : null}

      <div className="mt-5 space-y-2">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#E5E7EB] bg-white px-4 py-10 text-center text-sm text-[#6B7280]">
            You are up to date. We will alert you when a neighbour reports nearby,
            when a technician is assigned, or when you must confirm restore.
          </div>
        ) : (
          items.map((notice) => {
            const fresh = highlighted.current.has(notice.id);
            const busy = busyId === notice.id;
            return (
              <div
                key={notice.id}
                className={`w-full rounded-2xl border bg-white p-4 text-left shadow-sm ${
                  fresh
                    ? "border-[#C6EBD3] bg-[#F4FBF6]"
                    : "border-[#E5E7EB]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (notice.actionable === "same_situation") return;
                    if (notice.entityId) go("/resident/track");
                  }}
                  className="w-full text-left"
                >
                  <div className="text-[11px] font-bold tracking-[0.16em] text-[#24A148] uppercase">
                    {noticeLabel(notice.type)}
                  </div>
                  <div className="mt-1 text-sm font-semibold">{notice.title}</div>
                  <div className="mt-0.5 text-sm text-[#6B7280]">{notice.detail}</div>
                  <div className="mt-2 text-xs text-[#9CA3AF]">
                    {relativeMinutes(notice.at)} · {formatWhen(notice.at)}
                  </div>
                </button>

                {notice.actionable === "same_situation" && notice.entityId ? (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => joinSame(notice.entityId!, notice.id)}
                      className="inline-flex h-10 items-center justify-center rounded-xl bg-[#24A148] text-sm font-semibold text-white hover:bg-[#1e8a3c] disabled:opacity-60"
                    >
                      {busy ? (
                        <ButtonSpinner label="Joining…" />
                      ) : (
                        "Yes — same situation"
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        dismissNotice(notice.id);
                        setMessage("Noted. We will not add you to that ticket.");
                      }}
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-sm font-semibold text-[#374151] hover:bg-[#F3F5F4] disabled:opacity-60"
                    >
                      No — not me
                    </button>
                  </div>
                ) : null}

                {notice.actionable === "confirm_restore" ? (
                  <button
                    type="button"
                    onClick={() => go("/resident/track")}
                    className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl bg-[#DC2626] text-sm font-semibold text-white hover:bg-[#B91C1C]"
                  >
                    Confirm or dispute restore
                  </button>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
