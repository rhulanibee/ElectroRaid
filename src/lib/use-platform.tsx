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

export function PlatformProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PlatformState>(empty);

  useEffect(() => {
    let source: EventSource | null = null;
    let cancelled = false;

    async function bootstrap() {
      try {
        await syncLocalStaff().catch(() => {
          /* staff directory is reapplied on the next successful sync */
        });
        const res = await fetch("/api/state", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          snapshot: data.snapshot,
          roi: data.roi,
          chain: data.chain,
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

    bootstrap();

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
        snapshot: payload.snapshot ?? prev.snapshot,
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
