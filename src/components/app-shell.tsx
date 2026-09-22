"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePlatform } from "@/lib/use-platform";
import { formatZar } from "@/lib/format";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/use-session";
import { navForRole, navItemActive } from "@/lib/session";
import { go, goReplace, markNavPending } from "@/lib/hard-nav";
import { BrandLogo } from "@/components/brand-logo";

const ICONS: Record<string, typeof LayoutDashboard> = {
  "/ops": LayoutDashboard,
  "/audit": ClipboardList,
  "/analytics": TrendingUp,
  "/tech": Wrench,
  "/inspect": ClipboardList,
  "/admin": Users,
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { connected, roi } = usePlatform();
  const { persona, ready, logout } = useSession();
  const [clock, setClock] = useState("");

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleString("en-ZA", {
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!persona) goReplace("/login");
  }, [ready, persona]);

  useEffect(() => {
    if (!ready || !persona) return;
    const allowed = navForRole(persona.role).map((item) => item.href);
    const ok = allowed.some(
      (href) => pathname === href || pathname.startsWith(`${href}/`),
    );
    if (!ok) goReplace(persona.home);
  }, [ready, persona, pathname]);

  if (!ready || !persona) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-[#6B7280]">
        Opening your ElectroRaid workspace…
      </div>
    );
  }

  const nav = navForRole(persona.role);
  const showRoi = persona.role === "dispatcher" || persona.role === "executive";
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
          <div className="mt-3 text-xs leading-relaxed text-white/80">{persona.title}</div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {nav.map((item) => {
            const Icon = ICONS[item.href] ?? Activity;
            const active = navItemActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                onClick={() => markNavPending()}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                  active
                    ? "bg-white text-[#24A148] shadow-sm"
                    : "text-white/90 hover:bg-white/15",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-4 text-sm">
          {persona.role === "technician" ? null : (
            <div className="flex items-center gap-3 rounded-xl bg-white/10 px-3 py-2.5">
              <div className="flex size-9 items-center justify-center rounded-full bg-white text-xs font-bold text-[#24A148]">
                {initials}
              </div>
              <div className="min-w-0">
                <div className="truncate font-semibold">{persona.name}</div>
                <div className="truncate text-[11px] text-white/75">{persona.email}</div>
              </div>
            </div>
          )}
          {showRoi ? (
            <div className="mt-3 rounded-xl bg-white/10 px-3 py-2">
              <div className="text-[11px] tracking-wide text-white/70 uppercase">
                Recovered this shift
              </div>
              <div className="tabular mt-0.5 text-base font-semibold">
                {roi ? formatZar(roi.recoveredZar) : "—"}
              </div>
            </div>
          ) : null}
          <button
            type="button"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/25 py-2 text-sm font-medium hover:bg-white/10"
            onClick={() => {
              logout();
              go("/");
            }}
          >
            <LogOut className="size-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-[#E5E7EB] bg-white px-3 py-2.5 md:px-5">
          <div className="flex items-center gap-2 md:hidden">
            <BrandLogo compact byline={null} />
          </div>
          <div className="hidden min-w-0 truncate text-sm text-[#6B7280] md:block">
            {persona.name} · {persona.title}
          </div>
          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              className="text-[#6B7280] hover:text-[#121417] md:hidden"
              onClick={() => {
                logout();
                go("/");
              }}
            >
              Sign out
            </button>
            <span className="tabular text-[#6B7280]">{clock}</span>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium",
                connected
                  ? "border-[#C6EBD3] bg-[#E8F6EC] text-[#167a34]"
                  : "border-red-200 bg-red-50 text-red-700",
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  connected ? "bg-[#24A148]" : "bg-red-600",
                )}
              />
              {connected ? "Live" : "Reconnecting"}
            </span>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>

      {nav.length > 1 ? (
        <nav className="sticky bottom-0 z-20 border-t border-[#E5E7EB] bg-white md:hidden">
          <div
            className="grid"
            style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}
          >
            {nav.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch
                  onClick={() => markNavPending()}
                  className={cn(
                    "py-2 text-center text-[10px] font-medium",
                    active ? "text-[#24A148]" : "text-[#6B7280]",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
