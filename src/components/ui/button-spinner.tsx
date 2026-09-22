"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Pressed / locked look for plain `<button>` actions while a request runs.
 * Pair with `pressLockProps(locked)` so `data-loading` flips the pressed color.
 */
export const pressLock = {
  base: "transition-all disabled:pointer-events-none data-[loading]:cursor-wait data-[loading]:scale-[0.98] data-[loading]:shadow-inner",
  primary:
    "bg-[#24A148] text-white hover:bg-[#1e8a3c] disabled:opacity-60 data-[loading]:bg-[#1a7a36] data-[loading]:hover:bg-[#1a7a36] data-[loading]:opacity-100",
  danger:
    "bg-[#DC2626] text-white hover:bg-[#B91C1C] disabled:opacity-60 data-[loading]:bg-[#991B1B] data-[loading]:hover:bg-[#991B1B] data-[loading]:opacity-100",
  outline:
    "border border-[#E5E7EB] bg-white text-[#374151] hover:bg-[#F3F5F4] disabled:opacity-60 data-[loading]:bg-[#E5E7EB] data-[loading]:hover:bg-[#E5E7EB] data-[loading]:opacity-100",
  soft:
    "border border-[#E5E7EB] bg-white text-[#121417] hover:border-[#24A148] disabled:opacity-60 data-[loading]:border-[#24A148] data-[loading]:bg-[#E8F6EC] data-[loading]:hover:bg-[#E8F6EC] data-[loading]:opacity-100",
  dangerOutline:
    "border border-[#FECACA] bg-white text-[#DC2626] hover:bg-[#FEF2F2] disabled:opacity-60 data-[loading]:bg-[#FEE2E2] data-[loading]:hover:bg-[#FEE2E2] data-[loading]:opacity-100",
} as const;

export function pressLockProps(locked: boolean) {
  return {
    "aria-busy": locked || undefined,
    "data-loading": locked ? ("" as const) : undefined,
  };
}

/** Spinning wait mark for plain buttons (not the shared Button). */
export function ButtonSpinner({
  className,
  label = "Working…",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
