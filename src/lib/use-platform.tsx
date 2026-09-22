"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { RoiMetrics } from "@/lib/engines/roi";
import { syncLocalStaff } from "@/lib/staff";
import type { LiveEvent, PlatformSnapshot } from "@/lib/types";

export interface PlatformState {
  snapshot: PlatformSnapshot | null;
  roi: RoiMetrics | null;
  chain: { ok: boolean; brokenAt: number | null } | null;
  liveEvent: LiveEvent | null;
  connected: boolean;
  error: string | null;
}

const empty: PlatformState = {
  snapshot: null,
  roi: null,
  chain: null,
  liveEvent: null,
  connected: false,
  error: null,
};

const PlatformContext = createContext<PlatformState>(empty);

function laterStamp(next: string | null | undefined, prev: string | null | undefined) {
  return (next ?? "") >= (prev ?? "");
}

function mergeRows<T>(
  prevRows: T[],
  nextRows: T[],
  idOf: (row: T) => string,
  stampOf: (row: T) => string | null | undefined,
): T[] {
  const byId = new Map<string, T>();
  for (const row of prevRows) byId.set(idOf(row), row);
  for (const row of nextRows) {
    const previous = byId.get(idOf(row));
    if (!previous || laterStamp(stampOf(row), stampOf(previous))) byId.set(idOf(row), row);
  }
  return [...byId.values()];
}

/** Keep a ticket that is already on screen when an older copy of the floor arrives. */
function applySnapshot(
  prev: PlatformSnapshot | null,
  next: PlatformSnapshot | undefined,
): PlatformSnapshot | null {
  if (!next) return prev;
  if (!prev) return next;
  const prevRev = prev.floorRevision ?? 0;
  const nextRev = next.floorRevision ?? 0;
  if (nextRev < prevRev) return prev;
  if (nextRev > prevRev) return next;
  return {
    ...next,
    users: mergeRows(prev.users, next.users, (row) => row.id, () => null),
    crews: mergeRows(prev.crews, next.crews, (row) => row.id, (row) => row.lastGpsAt),
    incidents: mergeRows(
      prev.incidents,
      next.incidents,
      (row) => row.id,
      (row) => row.lastActivityAt,
    ),
    reports: mergeRows(prev.reports, next.reports, (row) => row.id, (row) => row.reportedAt),
    investigations: mergeRows(
      prev.investigations,
      next.investigations,
      (row) => row.id,
      (row) => row.closedAt ?? row.dispatchedAt ?? row.createdAt,
    ),
    autoDispatchEnabled:
      next.autoDispatchEnabled ?? prev.autoDispatchEnabled ?? false,
    floorRevision: nextRev,
  };
}

export function PlatformProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PlatformState>(empty);

  useEffect(() => {
    let source: EventSource | null = null;
    let cancelled = false;

    async function loadState() {
      try {
        const res = await fetch("/api/state", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          snapshot: applySnapshot(prev.snapshot, data.snapshot),
          roi: data.roi ?? prev.roi,
          chain: data.chain ?? prev.chain,
          error: null,
        }));
      } catch (error) {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            error: error instanceof Error ? error.message : "Failed to load ops state",
          }));
        }
      }
    }

    async function bootstrap() {
      await syncLocalStaff().catch(() => {
        /* staff directory is reapplied on the next successful sync */
      });
      await loadState();
    }

    bootstrap();

    const poll = window.setInterval(() => {
      loadState();
    }, 2000);

    source = new EventSource("/api/events");
    source.onopen = () => {
      setState((prev) => ({ ...prev, connected: true }));
    };
    source.onerror = () => {
      setState((prev) => ({ ...prev, connected: false }));
    };
    source.onmessage = (message) => {
      const payload = JSON.parse(message.data) as {
        type: string;
        snapshot?: PlatformSnapshot;
        roi?: RoiMetrics;
        chain?: { ok: boolean; brokenAt: number | null };
        event?: LiveEvent;
      };
      setState((prev) => ({
        ...prev,
        connected: true,
        snapshot: applySnapshot(prev.snapshot, payload.snapshot),
        roi: payload.roi ?? prev.roi,
        chain: payload.chain ?? prev.chain,
        liveEvent:
          payload.event?.type === "crew.gps"
            ? prev.liveEvent
            : (payload.event ?? prev.liveEvent),
        error: null,
      }));
    };

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      source?.close();
    };
  }, []);

  return (
    <PlatformContext.Provider value={state}>{children}</PlatformContext.Provider>
  );
}

export function usePlatform() {
  return useContext(PlatformContext);
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}
