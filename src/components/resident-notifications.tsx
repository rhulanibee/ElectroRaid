"use client";

import { useMemo } from "react";
import { usePlatform } from "@/lib/use-platform";
import { useSession } from "@/lib/use-session";
import { formatWhen } from "@/lib/format";

export function ResidentNotifications() {
  const { persona } = useSession();
  const { snapshot } = usePlatform();
  const suburb = persona?.suburb ?? "Mamelodi";

  const items = useMemo(() => {
    const ids = new Set(
      (snapshot?.incidents ?? [])
        .filter((i) => i.suburb === suburb)
        .map((i) => i.id),
    );
    return (snapshot?.events ?? []).filter(
      (e) =>
        (e.type === "field.onsite" ||
          e.type === "incident.resolved" ||
          e.type === "dispatch.assigned" ||
          e.type === "crew.arrived" ||
          e.type === "incident.resident_confirmed" ||
          e.type === "incident.resident_dispute") &&
        (!e.entityId || ids.has(e.entityId)),
    );
  }, [snapshot, suburb]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-6">
      <h1 className="font-heading text-2xl font-bold">Notifications</h1>
      <p className="mt-1 text-sm text-[#6B7280]">
        Crew assignment, on-site, and restoration alerts for {suburb}.
      </p>
      <div className="mt-5 space-y-2">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#E5E7EB] bg-white px-4 py-10 text-center text-sm text-[#6B7280]">
            You are up to date. We will alert you when a technician is assigned
            or when they finish the job.
          </div>
        ) : (
          items.map((evt) => (
            <div
              key={evt.id}
              className="rounded-2xl border border-[#E5E7EB] bg-white p-4 shadow-sm"
            >
              <div className="text-[11px] font-bold tracking-[0.16em] text-[#24A148] uppercase">
                {evt.type.replaceAll(".", " ")}
              </div>
              <div className="mt-1 text-sm font-semibold">{evt.title}</div>
              <div className="mt-0.5 text-sm text-[#6B7280]">{evt.detail}</div>
              <div className="mt-2 text-xs text-[#9CA3AF]">
                {formatWhen(evt.at)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
