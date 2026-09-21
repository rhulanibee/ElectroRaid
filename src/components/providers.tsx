"use client";

import { useEffect } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ResidentNoticesProvider } from "@/lib/use-resident-notices";
import { PlatformProvider } from "@/lib/use-platform";
import { SessionProvider } from "@/lib/use-session";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* prototype: field PWA still works without the worker */
      });
    }
  }, []);

  return (
    <TooltipProvider>
      <SessionProvider>
        <PlatformProvider>
          <ResidentNoticesProvider>{children}</ResidentNoticesProvider>
        </PlatformProvider>
      </SessionProvider>
    </TooltipProvider>
  );
}
