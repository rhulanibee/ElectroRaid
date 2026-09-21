"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  Bell,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Settings,
  Zap,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { useResidentNotices } from "@/lib/use-resident-notices";
import { useSession } from "@/lib/use-session";
import { navForRole, navItemActive } from "@/lib/session";
import { go, goReplace } from "@/lib/hard-nav";
import { cn } from "@/lib/utils";

const ICONS: Record<string, typeof LayoutDashboard> = {
  "/resident": LayoutDashboard,
  "/resident/report": Zap,
  "/resident/track": MapPinned,
  "/resident/notifications": Bell,
  "/resident/settings": Settings,
};

export function ResidentShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { persona, ready, logout } = useSession();
  const { unread } = useResidentNotices();

  useEffect(() => {
    if (!ready) return;
    if (!persona) {
      goReplace("/login");
      return;
    }
    if (persona.role !== "resident") {
      goReplace(persona.home);
      return;
    }
    if (persona.verified === false) {
      goReplace("/verify");
    }
  }, [ready, persona]);

  if (!ready || !persona || persona.role !== "resident") {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-[#6B7280]">
        Opening your dashboard…
      </div>
    );
  }

  const nav = navForRole("resident");
  const initials = persona.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");

  return (
    <div className="flex min-h-dvh bg-[#F3F5F4]">
      <aside className="hidden w-[248px] shrink-0 flex-col bg-[#24A148] text-white md:flex">
        <div className="px-4 py-5">
          <BrandLogo tone="white" byline="City of Tshwane" />
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {nav.map((item) => {
            const Icon = ICONS[item.href] ?? LayoutDashboard;
            const active = navItemActive(pathname, item.href);
            return (
              <a
                key={item.href}
                href={item.href}
                onClick={(e) => {
                  e.preventDefault();
                  go(item.href);
                }}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                  active
                    ? "bg-white text-[#24A148] shadow-sm"
                    : "text-white/90 hover:bg-white/15",
                )}
              >
                <Icon className="size-4" />
                {item.label}
                {item.href === "/resident/notifications" && unread > 0 ? (
                  <span
                    className={cn(
                      "ml-auto min-w-5 rounded-full px-1.5 text-center text-[10px] font-bold",
                      active
                        ? "bg-[#24A148] text-white"
                        : "bg-white text-[#24A148]",
                    )}
                  >
                    {unread > 9 ? "9+" : unread}
                  </span>
                ) : null}
              </a>
            );
          })}
        </nav>
        <div className="px-4 py-4">
          <div className="flex items-center gap-3 rounded-xl bg-white/10 px-3 py-2.5">
            <div className="flex size-9 items-center justify-center rounded-full bg-white text-xs font-bold text-[#24A148]">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{persona.name}</div>
              <div className="truncate text-[11px] text-white/75">
                {persona.accountNumber}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              logout();
              go("/");
            }}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/25 py-2 text-sm font-medium text-white hover:bg-white/10"
          >
            <LogOut className="size-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-[#E5E7EB] bg-white px-4 py-3 md:hidden">
          <BrandLogo compact byline={null} />
          <div className="flex size-9 items-center justify-center rounded-full bg-[#E8F6EC] text-xs font-bold text-[#24A148]">
            {initials}
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
        <nav className="sticky bottom-0 z-20 grid grid-cols-5 border-t border-[#E5E7EB] bg-white md:hidden">
          {nav.map((item) => {
            const Icon = ICONS[item.href] ?? LayoutDashboard;
            const active = navItemActive(pathname, item.href);
            return (
              <a
                key={item.href}
                href={item.href}
                onClick={(e) => {
                  e.preventDefault();
                  go(item.href);
                }}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 text-[10px] font-medium",
                  active ? "text-[#24A148]" : "text-[#6B7280]",
                )}
              >
                <span className="relative">
                  <Icon className="size-4" />
                  {item.href === "/resident/notifications" && unread > 0 ? (
                    <span className="absolute -top-1 -right-2 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#24A148] px-0.5 text-[9px] font-bold text-white">
                      {unread > 9 ? "9+" : unread}
                    </span>
                  ) : null}
                </span>
                {item.label.replace("Outage", "").replace("Reports", "Track")}
              </a>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
