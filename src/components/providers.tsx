"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ResidentNoticesProvider } from "@/lib/use-resident-notices";
import { PlatformProvider } from "@/lib/use-platform";
import { SessionProvider } from "@/lib/use-session";
import {
  bindSoftNav,
  clearNavPending,
  subscribeNavPending,
} from "@/lib/hard-nav";

function SoftNavBridge({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    bindSoftNav({
      push: (href) => {
        router.push(href);
      },
      replace: (href) => {
        router.replace(href);
      },
    });
  }, [router]);

  useEffect(() => subscribeNavPending(setPending), []);

  useEffect(() => {
    clearNavPending();
  }, [pathname]);

  useEffect(() => {
    if (!pending) return;
    const id = window.setTimeout(() => clearNavPending(), 2500);
    return () => window.clearTimeout(id);
  }, [pending]);

  return (
    <>
      {pending ? (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden bg-[#24A148]/15"
        >
          <div className="nav-progress-bar h-full w-1/3 bg-[#24A148]" />
        </div>
      ) : null}
      {children}
    </>
  );
}

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
      <SoftNavBridge>
        <SessionProvider>
          <PlatformProvider>
            <ResidentNoticesProvider>{children}</ResidentNoticesProvider>
          </PlatformProvider>
        </SessionProvider>
      </SoftNavBridge>
    </TooltipProvider>
  );
}
