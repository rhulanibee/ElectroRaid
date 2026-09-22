"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CommandMap } from "@/components/command-map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { priorityBand } from "@/lib/engines/priority";
import {
  classificationLabel,
  formatZar,
  formatMinutes,
  incidentStatusColor,
  incidentStatusLabel,
  relativeMinutes,
} from "@/lib/format";
import { usePlatform, postJson } from "@/lib/use-platform";
import { useSession } from "@/lib/use-session";
import { recommendCrews } from "@/lib/engines/dispatch";
import { TrackLiveMap } from "@/components/track-live-map";
import type {
  DispatchRecommendation,
  FieldCrew,
  MasterIncident,
  RevenueInvestigation,
  User,
} from "@/lib/types";

export function CommandCenter() {
  const { snapshot, roi, liveEvent, error } = usePlatform();
  const { persona } = useSession();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);

  const selectedIncident = snapshot?.incidents.find((i) => i.id === selectedId);
  const selectedInv = snapshot?.investigations.find((i) => i.id === selectedId);

  const openIncidents = useMemo(
    () =>
      (snapshot?.incidents ?? []).filter(
        (i) => i.status !== "resolved" && i.status !== "closed",
      ),
    [snapshot],
  );
  const needsCrew = openIncidents.filter((i) => !i.assignedCrewId);
  const inField = openIncidents.filter((i) => i.assignedCrewId);
  const awaitingResident = (snapshot?.incidents ?? []).filter(
    (i) => i.status === "resolved",
  );
  const autoOn = Boolean(snapshot?.autoDispatchEnabled);

  async function toggleAutoAssign() {
    setAutoBusy(true);
    try {
      await postJson("/api/dispatch/auto", {
        enabled: !autoOn,
        actorId: persona?.id,
      });
    } finally {
      setAutoBusy(false);
    }
  }

  if (error && !snapshot) {
    return (
      <div className="text-destructive p-8">
        Command centre could not load: {error}
      </div>
    );
  }

  if (!snapshot || !roi) {
    return (
      <div className="text-muted-foreground p-8 text-sm">
        Connecting to the Tshwane ops floor…
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="relative min-h-[52vh] lg:min-h-0">
        <CommandMap
          incidents={snapshot.incidents}
          investigations={snapshot.investigations}
          crews={snapshot.crews}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <div className="pointer-events-none absolute inset-x-3 top-3 z-[400] flex flex-wrap gap-2">
          <Kpi label="Open outages" value={String(roi.openIncidents)} hint="Tickets not yet restored" />
          <Kpi label="Revenue cases" value={String(roi.openInvestigations)} tone="gold" hint="Izinyoka / zero-kWh queue" />
          <Kpi label="Revenue recovered" value={formatZar(roi.recoveredZar)} tone="gold" hint="Fines + back-bill + penalties" />
          <Kpi label="Duplicate vans avoided" value={formatZar(roi.fleetSavingsZar)} hint="500 m merge savings" />
          <Kpi label="Avg time to send a crew" value={formatMinutes(roi.mttdMinutes)} hint="MTTD — first report to dispatch" />
        </div>
        <MapLegend />
        {liveEvent && liveEvent.type !== "crew.gps" ? (
          <div className="absolute right-3 bottom-14 z-[400] max-w-xs rounded-lg border border-primary/30 bg-background/90 px-3 py-2 text-xs shadow-lg backdrop-blur">
            <div className="text-[10px] tracking-wide text-primary uppercase">
              Live update
            </div>
            <div className="text-primary mt-0.5 font-medium">{liveEvent.title}</div>
            <div className="text-muted-foreground mt-0.5">{liveEvent.detail}</div>
          </div>
        ) : null}
      </section>

      <aside className="flex min-h-0 flex-col border-t border-border lg:border-t-0 lg:border-l">
        <div className="border-b border-border px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs font-medium">Work queue</div>
              <div className="text-muted-foreground text-[11px]">
                Coloured dots match the map. 500 m / 2 h nearby reports merge into
                one ticket.
              </div>
            </div>
            <button
              type="button"
              disabled={autoBusy}
              onClick={() => toggleAutoAssign()}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide uppercase transition ${
                autoOn
                  ? "bg-[#24A148] text-white"
                  : "border border-border bg-background text-muted-foreground hover:border-[#24A148] hover:text-[#24A148]"
              } disabled:opacity-60`}
              title={
                autoOn
                  ? "Auto-assign is on — tap to switch to manual"
                  : "Turn on auto-assign — best crew gets open tickets"
              }
            >
              {autoBusy ? "…" : autoOn ? "Auto on" : "Auto off"}
            </button>
          </div>
          {autoOn ? (
            <p className="text-muted-foreground mt-1.5 text-[11px] leading-snug">
              Automation is assigning the best available crew to open tickets.
              Turn off anytime to assign by hand.
            </p>
          ) : null}
        </div>

        <QueueKey />

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-2 p-3">
            <SectionTitle>Needs a crew (open tickets)</SectionTitle>
            {needsCrew.length === 0 ? (
              <EmptyNote>Every open outage already has a van.</EmptyNote>
            ) : (
              needsCrew.map((incident) => (
                <IncidentRow
                  key={incident.id}
                  incident={incident}
                  reportCount={
                    snapshot.reports.filter((r) => r.masterIncidentId === incident.id)
                      .length
                  }
                  active={selectedId === incident.id}
                  onClick={() => setSelectedId(incident.id)}
                />
              ))
            )}
            <SectionTitle>Crews in the field</SectionTitle>
            {inField.length === 0 ? (
              <EmptyNote>No technician is en route or on site right now.</EmptyNote>
            ) : (
              inField.map((incident) => (
                <IncidentRow
                  key={incident.id}
                  incident={incident}
                  reportCount={
                    snapshot.reports.filter((r) => r.masterIncidentId === incident.id)
                      .length
                  }
                  active={selectedId === incident.id}
                  onClick={() => setSelectedId(incident.id)}
                />
              ))
            )}
            <SectionTitle>Waiting for resident to confirm restore</SectionTitle>
            {awaitingResident.length === 0 ? (
              <EmptyNote>No technician has signed off a job that still needs a household confirm.</EmptyNote>
            ) : (
              awaitingResident.map((incident) => (
                <IncidentRow
                  key={incident.id}
                  incident={incident}
                  reportCount={
                    snapshot.reports.filter((r) => r.masterIncidentId === incident.id)
                      .length
                  }
                  active={selectedId === incident.id}
                  onClick={() => setSelectedId(incident.id)}
                />
              ))
            )}
            <SectionTitle>Revenue protection (inspectors, not repair techs)</SectionTitle>
            {snapshot.investigations
              .filter(
                (i) =>
                  i.status !== "closed_recovered" && i.status !== "closed_no_finding",
              )
              .map((inv) => (
                <InvestigationRow
                  key={inv.id}
                  inv={inv}
                  active={selectedId === inv.id}
                  onClick={() => setSelectedId(inv.id)}
                />
              ))}
          </div>
        </ScrollArea>

        {(selectedIncident || selectedInv) && (
          <DetailPane
            incident={selectedIncident}
            investigation={selectedInv}
            crews={snapshot.crews}
            users={snapshot.users}
            reportCount={
              selectedIncident
                ? snapshot.reports.filter(
                    (r) => r.masterIncidentId === selectedIncident.id,
                  ).length
                : 0
            }
          />
        )}
      </aside>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: "gold";
  hint?: string;
}) {
  return (
    <div className="pointer-events-auto rounded-lg border border-border/80 bg-background/85 px-3 py-1.5 shadow backdrop-blur">
      <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
        {label}
      </div>
      <div
        className={`tabular text-sm font-semibold ${tone === "gold" ? "text-gold" : "text-foreground"}`}
      >
        {value}
      </div>
      {hint ? <div className="text-muted-foreground text-[10px]">{hint}</div> : null}
    </div>
  );
}

function MapLegend() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pointer-events-auto absolute bottom-3 left-3 z-[400] rounded-lg border border-border/80 bg-background/92 px-3 py-1.5 text-[11px] font-medium shadow-lg backdrop-blur"
      >
        Map key
      </button>
    );
  }

  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 z-[400] max-w-[280px] rounded-lg border border-border/80 bg-background/92 px-3 py-2 text-[11px] shadow-lg backdrop-blur">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <div className="font-medium">Map key — what each mark means</div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-muted-foreground hover:text-foreground shrink-0 text-[10px] tracking-wide uppercase"
        >
          Minimize
        </button>
      </div>
      <ul className="space-y-1.5">
        <li className="flex items-start gap-2">
          <span className="mt-0.5 size-3 shrink-0 rounded-full bg-[#e24b4b]" />
          <span>
            <span className="text-foreground font-medium">Red circle</span> — critical
            outage. Bigger = more households.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-0.5 size-3 shrink-0 rounded-full bg-[#f0a202]" />
          <span>
            <span className="text-foreground font-medium">Orange circle</span> — high
            priority outage.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-0.5 size-3 shrink-0 rounded-full bg-[#3dd6a0]" />
          <span>
            <span className="text-foreground font-medium">Teal circle</span> — medium /
            on-site job.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-0.5 size-3 shrink-0 rounded-full bg-[#7aa0b3]/40 ring-1 ring-[#7aa0b3]" />
          <span>
            <span className="text-foreground font-medium">Faded circle</span> — technician
            finished, waiting for the resident to confirm.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-0.5 size-2.5 shrink-0 rotate-45 bg-[#e4c35a]" />
          <span>
            <span className="text-foreground font-medium">Gold diamond</span> — Izinyoka /
            revenue investigation (not a cable fault).
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-0.5 size-2.5 shrink-0 rounded-full bg-[#5ec8ff]" />
          <span>
            <span className="text-foreground font-medium">Blue dot + Tech</span> —
            maintenance technician van.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-0.5 size-2.5 shrink-0 rounded-full bg-[#e4c35a]" />
          <span>
            <span className="text-foreground font-medium">Gold dot + Inspector</span> —
            revenue-protection vehicle.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-0.5 size-3 shrink-0 rounded-full border border-dashed border-[#3dd6a0]" />
          <span>
            <span className="text-foreground font-medium">Teal dashed ring</span> — 500 m
            merge geofence around the selected ticket.
          </span>
        </li>
      </ul>
    </div>
  );
}

function QueueKey() {
  return (
    <div className="border-b border-border px-3 py-2 text-[11px]">
      <div className="text-muted-foreground mb-1 tracking-wide uppercase">
        Queue icons
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[#e24b4b]" /> Open — needs a crew
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[#5ec8ff]" /> En route — driving
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[#3dd6a0]" /> On site — logged in
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[#e4c35a]" /> Tech done — confirm
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rotate-45 bg-[#e4c35a]" /> Diamond — inspector job
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-[#7aa0b3]" /> Closed — resident OK
        </span>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="text-muted-foreground pt-1 text-[11px] tracking-wide uppercase">
      {children}
    </div>
  );
}

function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground px-1 text-[11px]">{children}</p>;
}

function IncidentRow({
  incident,
  reportCount,
  active,
  onClick,
}: {
  incident: MasterIncident;
  reportCount: number;
  active: boolean;
  onClick: () => void;
}) {
  const band = priorityBand(incident.priorityScore);
  const color = incidentStatusColor(incident.status);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
        active ? "border-primary/60 bg-primary/10" : "border-border bg-card hover:bg-muted/60"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-mono text-[11px]">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: color }}
            title={incidentStatusLabel(incident.status)}
          />
          {incident.reference}
        </span>
        <Badge
          variant={band === "critical" || band === "high" ? "destructive" : "secondary"}
        >
          {band} · {incident.priorityScore}
        </Badge>
      </div>
      <div className="mt-1 text-[12px] font-medium">{incident.suburb}</div>
      <div className="text-muted-foreground mt-0.5">
        {incidentStatusLabel(incident.status)}
      </div>
      <div className="text-muted-foreground mt-0.5">
        {incident.affectedHouseholds} households · {reportCount} reports ·{" "}
        {classificationLabel(incident.classification)}
        {incident.qaRating ? ` · QA ${incident.qaRating}/5` : ""}
      </div>
      <div className="text-muted-foreground mt-0.5">
        First report {relativeMinutes(incident.firstReportedAt)}
        {incident.criticalInfrastructure ? " · hospital / critical infra" : ""}
      </div>
    </button>
  );
}

function InvestigationRow({
  inv,
  active,
  onClick,
}: {
  inv: RevenueInvestigation;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
        active ? "border-gold/60 bg-gold/10" : "border-border bg-card hover:bg-muted/60"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-mono text-[11px]">
          <span className="size-2.5 shrink-0 rotate-45 bg-[#e4c35a]" title="Revenue investigation" />
          {inv.reference}
        </span>
        <span className="text-gold tabular font-semibold">risk {inv.anomalyRiskScore}</span>
      </div>
      <div className="mt-1 text-[12px] font-medium">{inv.suburb}</div>
      <div className="text-muted-foreground mt-0.5">
        {inv.type.replaceAll("_", " ")} · {inv.status.replaceAll("_", " ")}
        {inv.daysZeroConsumption ? ` · ${inv.daysZeroConsumption}d silent` : ""}
      </div>
    </button>
  );
}

function DetailPane({
  incident,
  investigation,
  crews,
  users,
  reportCount,
}: {
  incident?: MasterIncident;
  investigation?: RevenueInvestigation;
  crews: FieldCrew[];
  users: User[];
  reportCount: number;
}) {
  const [busyCrew, setBusyCrew] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function assign(
    kind: "outage" | "investigation",
    targetId: string,
    crewId?: string,
  ) {
    setBusyCrew(crewId ?? "nearest");
    setMessage(null);
    try {
      const result = await postJson<{
        ok?: boolean;
        error?: string;
        recommendation?: DispatchRecommendation;
      }>("/api/dispatch", { kind, targetId, crewId });
      if (result.error || result.ok === false) {
        setMessage(result.error ?? "Dispatch failed.");
        return;
      }
      const rec = result.recommendation;
      setMessage(
        rec
          ? `${rec.callsign} has the job now · ${rec.technicianName} · ${rec.etaMinutes} min. The resident is tracking the van live.`
          : "Job assigned. The resident can track the technician live.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Dispatch failed.");
    } finally {
      setBusyCrew(null);
    }
  }

  if (incident) {
    const recs = recommendCrews(crews, users, incident.location, "outage", 8);
    const assigned = crews.find((c) => c.id === incident.assignedCrewId);
    const assignedName = assigned
      ? (users.find((u) => u.id === assigned.userId)?.fullName ?? assigned.callsign)
      : null;
    const canAssign =
      incident.status === "open" ||
      incident.status === "clustered" ||
      incident.status === "dispatched" ||
      incident.status === "en_route";
    return (
      <div className="border-t border-border p-3 text-xs">
        <div className="font-medium">{incident.address}</div>
        <div className="text-muted-foreground mt-1">
          {incidentStatusLabel(incident.status)} · {reportCount} channelled reports
          spatially merged · score {incident.priorityScore}
        </div>
        {incident.qaRating ? (
          <div className="text-gold mt-1">
            Inspector QA {incident.qaRating}/5
            {incident.qaNotes ? ` · ${incident.qaNotes}` : ""}
          </div>
        ) : null}
        {incident.status === "resolved" ? (
          <div className="text-gold mt-2">
            Technician signed off. The household must tap Confirm restored (or Still no
            power) before this ticket closes.
          </div>
        ) : assigned ? (
          <div className="mt-3 space-y-2">
            <div className="text-primary">
              {assignedName} ({assigned.callsign}) has this job. The resident is tracking
              the van live on their map.
            </div>
            <TrackLiveMap
              incident={incident}
              crew={assigned}
              technicianName={assignedName ?? assigned.callsign}
              perspective="resident"
            />
          </div>
        ) : null}
        {canAssign ? (
          <AssignCrewList
            recs={recs}
            assignedCrewId={incident.assignedCrewId}
            busyCrew={busyCrew}
            nearestLabel="Assign nearest technician"
            onNearest={() => assign("outage", incident.id)}
            onAssign={(crewId) => assign("outage", incident.id, crewId)}
          />
        ) : incident.status === "on_site" ? (
          <div className="text-primary mt-2">Technician is on site.</div>
        ) : null}
        {message ? <p className="text-muted-foreground mt-2">{message}</p> : null}
      </div>
    );
  }

  if (investigation) {
    const recs = recommendCrews(
      crews,
      users,
      investigation.location,
      "investigation",
      8,
    );
    const assigned = crews.find((c) => c.id === investigation.assignedCrewId);
    const canAssign =
      investigation.status === "flagged" ||
      investigation.status === "assigned" ||
      investigation.status === "en_route";
    return (
      <div className="border-t border-border p-3 text-xs">
        <div className="font-medium">{investigation.address}</div>
        <div className="text-muted-foreground mt-1">{investigation.notes}</div>
        {assigned ? (
          <div className="text-gold mt-2">
            {assigned.callsign} is on this case · {investigation.status.replaceAll("_", " ")}
            {investigation.fineAmountZar
              ? ` · ${formatZar(
                  investigation.fineAmountZar +
                    investigation.backbillZar +
                    investigation.penaltyZar,
                )}`
              : ""}
          </div>
        ) : investigation.status !== "flagged" ? (
          <div className="text-gold mt-2">
            {investigation.status.replaceAll("_", " ")}
            {investigation.fineAmountZar
              ? ` · ${formatZar(
                  investigation.fineAmountZar +
                    investigation.backbillZar +
                    investigation.penaltyZar,
                )}`
              : ""}
          </div>
        ) : null}
        {canAssign ? (
          <AssignCrewList
            recs={recs}
            assignedCrewId={investigation.assignedCrewId}
            busyCrew={busyCrew}
            nearestLabel="Assign nearest inspector"
            onNearest={() => assign("investigation", investigation.id)}
            onAssign={(crewId) => assign("investigation", investigation.id, crewId)}
          />
        ) : null}
        {message ? <p className="text-muted-foreground mt-2">{message}</p> : null}
      </div>
    );
  }

  return null;
}

function AssignCrewList({
  recs,
  assignedCrewId,
  busyCrew,
  nearestLabel,
  onNearest,
  onAssign,
}: {
  recs: DispatchRecommendation[];
  assignedCrewId: string | null;
  busyCrew: string | null;
  nearestLabel: string;
  onNearest: () => void;
  onAssign: (crewId: string) => void;
}) {
  return (
    <div className="mt-2 space-y-1.5">
      <div className="text-muted-foreground text-[10px] tracking-wide uppercase">
        Assign this job — technician gets it immediately, resident tracks live
      </div>
      {recs.length === 0 ? (
        <p className="text-muted-foreground">No matching crew on duty.</p>
      ) : (
        recs.map((rec) => {
          const mine = rec.crewId === assignedCrewId;
          return (
            <Button
              key={rec.crewId}
              size="sm"
              variant={mine ? "secondary" : "outline"}
              className="h-auto w-full justify-between gap-2 py-1.5 text-left whitespace-normal"
              loading={busyCrew === rec.crewId}
              disabled={busyCrew !== null || mine}
              onClick={() => onAssign(rec.crewId)}
            >
              <span>
                {mine ? "Assigned · " : busyCrew === rec.crewId ? "Assigning · " : "Assign "}
                {rec.callsign}
                <span className="text-muted-foreground mt-0.5 block text-[10px] font-normal">
                  {rec.technicianName} · {rec.etaMinutes} min ·{" "}
                  {Math.round(rec.distanceM / 100) / 10} km
                  {rec.queueSize ? ` · queue ${rec.queueSize}` : ""}
                </span>
              </span>
            </Button>
          );
        })
      )}
      {!assignedCrewId ? (
        <Button
          size="sm"
          className="w-full"
          loading={busyCrew === "nearest"}
          disabled={busyCrew !== null}
          onClick={onNearest}
        >
          {busyCrew === "nearest" ? "Assigning nearest…" : nearestLabel}
        </Button>
      ) : null}
    </div>
  );
}
