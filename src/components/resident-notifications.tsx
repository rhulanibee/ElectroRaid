"use client";

import { useEffect, useRef } from "react";
import { formatWhen, relativeMinutes } from "@/lib/format";
import { go } from "@/lib/hard-nav";
import { noticeLabel } from "@/lib/resident-notices";
import { useResidentNotices } from "@/lib/use-resident-notices";
import { useSession } from "@/lib/use-session";

export function ResidentNotifications() {
  const { persona } = useSession();
  const { items, connected, markAllRead } = useResidentNotices();
  const highlighted = useRef(new Set<string>());

  useEffect(() => {
    for (const item of items) {
      if (!item.read) highlighted.current.add(item.id);
    }
    markAllRead();
  }, [items, markAllRead]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Notifications</h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            Live updates for account {persona?.accountNumber ?? "your household"}.
            Saved on this device.
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
      <div className="mt-5 space-y-2">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#E5E7EB] bg-white px-4 py-10 text-center text-sm text-[#6B7280]">
            You are up to date. We will alert you when a technician is assigned
            or when they finish the job.
          </div>
        ) : (
          items.map((notice) => {
            const fresh = highlighted.current.has(notice.id);
            return (
              <button
                key={notice.id}
                type="button"
                onClick={() => {
                  if (notice.entityId) go("/resident/track");
                }}
                className={`w-full rounded-2xl border bg-white p-4 text-left shadow-sm ${
                  fresh
                    ? "border-[#C6EBD3] bg-[#F4FBF6]"
                    : "border-[#E5E7EB]"
                }`}
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
            );
          })
        )}
      </div>
    </div>
  );
}
