"use client";

import { Loader2 } from "lucide-react";
import { cn } from "cn";

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
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
