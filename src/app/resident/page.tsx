import { ResidentShell } from "@/components/resident-shell";
import { ResidentDashboard } from "@/components/resident-dashboard";

export default function ResidentPage() {
  return (
    <ResidentShell>
      <ResidentDashboard />
    </ResidentShell>
  );
}
