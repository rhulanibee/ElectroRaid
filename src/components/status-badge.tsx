import type { IncidentStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StatusBadge({
  status,
  className,
}: {
  status: IncidentStatus | string;
  className?: string;
}) {
  const label =
    status === "closed"
      ? "Completed"
      : status === "resolved"
        ? "Awaiting confirm"
        : status === "en_route" || status === "dispatched"
          ? "En Route"
          : status === "on_site"
            ? "On Site"
            : "In Progress";

  const tone =
    status === "closed"
      ? "bg-[#E8F6EC] text-[#167a34]"
      : status === "resolved"
        ? "bg-[#FEF3C7] text-[#92400E]"
        : status === "on_site"
          ? "bg-[#DBEAFE] text-[#1D4ED8]"
          : "bg-[#FEF3C7] text-[#B45309]";

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        tone,
        className,
      )}
    >
      {label}
    </span>
  );
}

export function SeverityBadge({
  households,
  classification,
}: {
  households: number;
  classification: string;
}) {
  const high =
    households >= 40 ||
    classification === "transformer_fault" ||
    classification === "cable_fault";
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        high ? "bg-[#FEE2E2] text-[#B91C1C]" : "bg-[#F3F4F6] text-[#4B5563]",
      )}
    >
      {high ? "High" : "Standard"}
    </span>
  );
}
