"use client";

import { useMemo, useState } from "react";
import { Bell, Plus, Search } from "lucide-react";
import { CommandMap } from "@/components/command-map";
import { StatusBadge, SeverityBadge } from "@/components/status-badge";
import { noticeLabel } from "@/lib/resident-notices";
import { usePlatform } from "@/lib/use-platform";
import { useResidentNotices } from "@/lib/use-resident-notices";
import { useSession } from "@/lib/use-session";
import { classificationLabel, relativeMinutes } from "@/lib/format";
import { go } from "@/lib/hard-nav";

export function ResidentDashboard() {
  const { persona } = useSession();
  const { snapshot, connected } = usePlatform();
  const { items: notices, unread } = useResidentNotices();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const suburb = persona?.suburb ?? "";
  const account = persona?.accountNumber;

  const ownIncidents = useMemo(() => {
    const mine = new Set(
      (snapshot?.reports ?? [])
        .filter((report) => account && report.accountNumber === account)
        .map((report) => report.masterIncidentId),
    );
    return (snapshot?.incidents ?? []).filter(
      (incident) => mine.has(incident.id) && incident.status !== "closed",
    );
  }, [snapshot, account]);

  const tickets = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ownIncidents;
    return ownIncidents.filter(
      (incident) =>
        incident.reference.toLowerCase().includes(q) ||
        incident.address.toLowerCase().includes(q) ||
        classificationLabel(incident.classification).includes(q),
    );
  }, [ownIncidents, query]);

  const alert = notices.find((notice) => !notice.read) ?? notices[0];
  const initials = (persona?.name ?? "R")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-[#E5E7EB] bg-white px-4 py-3 md:px-6">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#9CA3AF]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reports, streets, ticket numbers"
            className="h-11 w-full rounded-xl border border-[#E5E7EB] bg-[#F8FAF8] pr-3 pl-10 text-sm outline-none focus:border-[#24A148] focus:ring-3 focus:ring-[#24A148]/15"
          />
        </div>
        <button
          type="button"
          onClick={() => go("/resident/notifications")}
          className="relative hidden size-11 items-center justify-center rounded-xl border border-[#E5E7EB] text-[#374151] hover:bg-[#F3F5F4] md:inline-flex"
        >
          <Bell className="size-4" />
          {unread ? (
            <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#24A148] px-1 text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
        <div className="hidden size-11 items-center justify-center rounded-full bg-[#E8F6EC] text-xs font-bold text-[#24A148] md:flex">
          {initials}
        </div>
        <button
          type="button"
          onClick={() => go("/resident/report")}
          className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-[#24A148] px-4 text-sm font-semibold text-white hover:bg-[#1e8a3c]"
        >
          <Plus className="size-4" />
          Report Outage
        </button>
      </div>

      <div className="px-4 pt-4 md:px-6">
        {alert ? (
          <div className="rounded-2xl border border-[#C6EBD3] bg-[#E8F6EC] px-4 py-3">
            <div className="text-[11px] font-bold tracking-[0.16em] text-[#167a34] uppercase">
              {noticeLabel(alert.type)}
            </div>
            <div className="mt-1 text-sm font-semibold text-[#121417]">
              {alert.title}
            </div>
            <div className="text-sm text-[#3F5A48]">{alert.detail}</div>
          </div>
        ) : (
          <div className="rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-[#6B7280]">
            No new alerts. We will tell you when a crew is assigned near {suburb}.
          </div>
        )}
      </div>

      <div className="grid min-h-0 flex-1 gap-4 p-4 md:p-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-h-[280px] overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
          {snapshot ? (
            <CommandMap
              incidents={ownIncidents}
              investigations={[]}
              crews={snapshot.crews}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id);
                const hit = snapshot.incidents.find((i) => i.id === id);
                if (hit) go("/resident/track");
              }}
              showInvestigations={false}
              className="h-full min-h-[280px] rounded-2xl"
            />
          ) : (
            <div className="flex h-full min-h-[280px] items-center justify-center text-sm text-[#6B7280]">
              {connected ? "Loading the live map…" : "Reconnecting to operations…"}
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#E5E7EB] px-4 py-3">
            <h2 className="font-heading text-sm font-bold">Active reports</h2>
            <span className="text-xs text-[#6B7280]">{tickets.length} open</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3">
            {tickets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#E5E7EB] px-3 py-8 text-center text-sm text-[#6B7280]">
                No open outage on your feeder. Use Report Outage if the lights are
                out.
              </div>
            ) : (
              <div className="space-y-2">
                {tickets.map((incident) => (
                  <button
                    key={incident.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(incident.id);
                      go("/resident/track");
                    }}
                    className="w-full rounded-xl border border-[#E5E7EB] p-3 text-left transition hover:border-[#24A148] hover:bg-[#F8FAF8]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-mono text-xs text-[#6B7280]">
                        {incident.reference}
                      </div>
                      <StatusBadge status={incident.status} />
                    </div>
                    <div className="mt-1 text-sm font-semibold text-[#121417]">
                      {incident.address}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[#6B7280]">
                      <SeverityBadge
                        households={incident.affectedHouseholds}
                        classification={incident.classification}
                      />
                      <span>{classificationLabel(incident.classification)}</span>
                      <span>· {relativeMinutes(incident.firstReportedAt)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
