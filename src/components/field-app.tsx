"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { evidenceSvg } from "@/lib/evidence";
import { formatZar } from "@/lib/format";
import { postJson, usePlatform } from "@/lib/use-platform";
import { enqueue, flushOutbox, pendingCount } from "@/lib/offline";
import type { FieldCrew, MasterIncident, RevenueInvestigation } from "@/lib/types";

type RoleView = "technician" | "inspector";

export function FieldApp() {
  const { snapshot } = usePlatform();
  const [role, setRole] = useState<RoleView>("technician");
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    pendingCount().then(setQueued);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    if (!online) return;
    flushOutbox((payload) => postJson("/api/field/action", payload)).then(() =>
      pendingCount().then(setQueued),
    );
  }, [online, snapshot]);

  const crew: FieldCrew | undefined = snapshot?.crews.find((c) =>
    role === "technician"
      ? c.specialization === "maintenance" && c.status !== "off_duty"
      : c.specialization === "revenue_protection" && c.status !== "off_duty",
  );

  const job = useMemo(() => {
    if (!snapshot || !crew) return null;
    if (role === "technician") {
      const incident = snapshot.incidents.find(
        (i) =>
          i.assignedCrewId === crew.id &&
          i.status !== "resolved" &&
          i.status !== "closed",
      );
      return incident ? { kind: "outage" as const, incident } : null;
    }
    const inv = snapshot.investigations.find(
      (i) =>
        i.assignedCrewId === crew.id &&
        i.status !== "closed_recovered" &&
        i.status !== "closed_no_finding",
    );
    return inv ? { kind: "investigation" as const, inv } : null;
  }, [snapshot, crew, role]);

  async function act(key: string, payload: Record<string, unknown>) {
    setBusy(key);
    try {
      if (!online) {
        await enqueue(payload);
        setQueued(await pendingCount());
        setNote("Saved to device. Will sync when the radio returns.");
        return;
      }
      await postJson("/api/field/action", payload);
      setNote("Logged to the immutable audit chain.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto min-h-full max-w-md px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-[10px] tracking-[0.2em] text-primary uppercase">
            Field PWA
          </div>
          <h1 className="font-heading text-xl font-semibold">On-shift kit</h1>
        </div>
        <Badge variant={online ? "secondary" : "destructive"}>
          {online ? "Online" : "Offline"}
          {queued ? ` · ${queued} queued` : ""}
        </Badge>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <Button
          variant={role === "technician" ? "default" : "outline"}
          onClick={() => setRole("technician")}
        >
          Technician
        </Button>
        <Button
          variant={role === "inspector" ? "default" : "outline"}
          onClick={() => setRole("inspector")}
        >
          Inspector
        </Button>
      </div>

      <div className="text-muted-foreground mb-3 text-xs">
        {crew
          ? `${crew.callsign} · ${crew.status.replaceAll("_", " ")} · queue ${crew.activeQueueSize}`
          : "No crew on this specialisation."}
      </div>

      {!job ? (
        <EmptyJob role={role} />
      ) : job.kind === "outage" ? (
        <OutageCard
          incident={job.incident}
          busy={busy}
          onOnSite={() =>
            act("onsite", {
              action: "onsite",
              kind: "outage",
              targetId: job.incident.id,
            })
          }
          onComplete={() =>
            act("complete", {
              action: "complete",
              kind: "outage",
              targetId: job.incident.id,
              notes: "11 kV joint replaced. Supply restored.",
            })
          }
        />
      ) : (
        <InvestigationCard
          inv={job.inv}
          busy={busy}
          onOnSite={() =>
            act("onsite", {
              action: "onsite",
              kind: "investigation",
              targetId: job.inv.id,
            })
          }
          onEvidence={() =>
            act("evidence", {
              action: "evidence",
              kind: "investigation",
              targetId: job.inv.id,
              caption: "Field photo — suspected bypass",
              dataUri: evidenceSvg(
                "On-device capture",
                "Photo stored locally, then hashed into the audit log.",
              ),
            })
          }
          onFine={() =>
            act("fine", {
              action: "fine",
              kind: "investigation",
              targetId: job.inv.id,
            })
          }
        />
      )}

      {note ? <p className="text-primary mt-4 text-xs">{note}</p> : null}
      <p className="text-muted-foreground mt-6 text-[11px] leading-relaxed">
        Offline-first: actions land in IndexedDB on this device when the
        network drops, then flush to the audit log when coverage returns. The
        same PWA is used by maintenance technicians and revenue inspectors —
        the job card changes with the role.
      </p>
    </div>
  );
}

function EmptyJob({ role }: { role: RoleView }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-6 text-sm">
      <div className="font-medium">No active job</div>
      <p className="text-muted-foreground mt-1 text-xs">
        {role === "technician"
          ? "Wait for control room to assign a maintenance job. It will appear on this card."
          : "Wait for a revenue-protection assignment. Evidence and fines live on this card."}
      </p>
    </div>
  );
}

function OutageCard({
  incident,
  busy,
  onOnSite,
  onComplete,
}: {
  incident: MasterIncident;
  busy: string | null;
  onOnSite: () => void;
  onComplete: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="font-mono text-xs">{incident.reference}</div>
      <div className="mt-1 text-base font-semibold">{incident.address}</div>
      <div className="text-muted-foreground mt-1 text-xs">
        {incident.affectedHouseholds} households ·{" "}
        {incident.status.replaceAll("_", " ")}
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <Button
          onClick={onOnSite}
          loading={busy === "onsite"}
          disabled={incident.status === "on_site" || busy !== null}
        >
          {busy === "onsite" ? "Marking on site…" : "Mark on site"}
        </Button>
        <Button
          variant="outline"
          onClick={onComplete}
          loading={busy === "complete"}
          disabled={busy !== null}
        >
          {busy === "complete" ? "Signing off…" : "Sign off restoration"}
        </Button>
      </div>
    </div>
  );
}

function InvestigationCard({
  inv,
  busy,
  onOnSite,
  onEvidence,
  onFine,
}: {
  inv: RevenueInvestigation;
  busy: string | null;
  onOnSite: () => void;
  onEvidence: () => void;
  onFine: () => void;
}) {
  const total = inv.fineAmountZar + inv.backbillZar + inv.penaltyZar;
  return (
    <div className="rounded-xl border border-gold/40 bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="font-mono text-xs">{inv.reference}</div>
        <span className="text-gold text-xs font-semibold">
          risk {inv.anomalyRiskScore}
        </span>
      </div>
      <div className="mt-1 text-base font-semibold">{inv.address}</div>
      <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
        {inv.notes}
      </p>
      {inv.evidence.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {inv.evidence.map((photo) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={photo.id}
              src={photo.dataUri}
              alt={photo.caption}
              className="h-24 w-full rounded-md object-cover ring-1 ring-border"
            />
          ))}
        </div>
      ) : null}
      <div className="mt-4 flex flex-col gap-2">
        <Button
          onClick={onOnSite}
          loading={busy === "onsite"}
          disabled={busy !== null}
        >
          {busy === "onsite" ? "Arriving…" : "Arrive on site"}
        </Button>
        <Button
          variant="outline"
          onClick={onEvidence}
          loading={busy === "evidence"}
          disabled={busy !== null}
        >
          {busy === "evidence" ? "Saving…" : "Capture evidence"}
        </Button>
        <Button
          variant="secondary"
          onClick={onFine}
          loading={busy === "fine"}
          disabled={busy !== null}
        >
          {busy === "fine"
            ? "Issuing fine…"
            : `Issue tamper fine${total ? ` · ${formatZar(total)}` : ""}`}
        </Button>
      </div>
    </div>
  );
}
