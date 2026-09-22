"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Lightbulb } from "lucide-react";
import { priorityBand } from "@/lib/engines/priority";
import { Button } from "@/components/ui/button";
import { ButtonSpinner, pressLock, pressLockProps } from "@/components/ui/button-spinner";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { evidenceSvg } from "@/lib/evidence";
import { postJson, usePlatform } from "@/lib/use-platform";
import { useSession } from "@/lib/use-session";
import { enqueue, flushOutbox, pendingCount } from "@/lib/offline";
import {
  REPAIR_PHOTO_ACCEPT,
  repairPhotoError,
  repairPhotoMeta,
  type RepairPhoto,
} from "@/lib/repair-photo";
import { CommandMap } from "@/components/command-map";
import { TrackLiveMap, navigateUrl, technicianNameForCrew } from "@/components/track-live-map";
import { cn } from "@/lib/utils";
import { distanceMetres, formatKm, etaMinutes } from "@/lib/geo";
import type { FieldCrew, MasterIncident } from "@/lib/types";

export function TechnicianApp() {
  const { persona } = useSession();
  const { snapshot } = usePlatform();
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const [notes, setNotes] = useState("Replaced failed 11 kV cable joint. Supply restored.");
  const [serial, setSerial] = useState("JV-11KV-44190");
  const [signature, setSignature] = useState<string | null>(null);
  const [photo, setPhoto] = useState<RepairPhoto | null>(null);
  const [status, setStatus] = useState<string | null>(null);
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

  const myCrewIds = new Set(
    [
      persona?.crewId,
      ...(snapshot?.crews ?? [])
        .filter((c) => c.userId === persona?.id)
        .map((c) => c.id),
    ].filter((id): id is string => Boolean(id)),
  );
  const assigned = snapshot?.incidents.find(
    (i) =>
      Boolean(i.assignedCrewId) &&
      myCrewIds.has(i.assignedCrewId as string) &&
      i.status !== "resolved" &&
      i.status !== "closed",
  );
  const crew =
    (assigned?.assignedCrewId
      ? snapshot?.crews.find((c) => c.id === assigned.assignedCrewId)
      : undefined) ??
    snapshot?.crews.find((c) => c.userId === persona?.id) ??
    snapshot?.crews.find((c) => c.id === persona?.crewId);
  const pool = useMemo(
    () =>
      (snapshot?.incidents ?? []).filter(
        (i) =>
          !i.assignedCrewId &&
          i.status !== "resolved" &&
          i.status !== "closed" &&
          i.classification !== "izinyoka_tip",
      ),
    [snapshot],
  );

  async function act(payload: Record<string, unknown>, successMessage?: string) {
    const key = String(payload.action ?? "act");
    setBusy(key);
    try {
      const body = { ...payload, actorId: persona?.id };
      if (!online) {
        await enqueue(body);
        setQueued(await pendingCount());
        setStatus("Saved on this handset. Will sync when coverage returns.");
        return;
      }
      await postJson("/api/field/action", body);
      setStatus(successMessage ?? "Written to the immutable audit log.");
    } finally {
      setBusy(null);
    }
  }

  async function takeJob(incident: MasterIncident) {
    const crewId = crew?.id ?? persona?.crewId;
    if (!crewId) {
      setStatus("No vehicle linked to this technician sign-in.");
      return;
    }
    setBusy(`take:${incident.id}`);
    try {
      await postJson("/api/dispatch", {
        kind: "outage",
        targetId: incident.id,
        crewId,
      });
      setStatus("Job assigned to your van.");
    } finally {
      setBusy(null);
    }
  }

  const vanLine = crew
    ? `${crew.callsign} · ${crew.vehicleReg} · ${crew.status.replaceAll("_", " ")}`
    : "No vehicle assigned.";

  return (
    <div className="flex min-h-0 flex-col gap-4 px-4 py-4 md:px-6 md:py-6 lg:h-full">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Repair jobs</h1>
          <p className="mt-1 text-sm text-[#6B7280]">{vanLine}</p>
        </div>
        <Badge variant={online ? "secondary" : "destructive"}>
          {online ? "Online" : "Offline"}
          {queued ? ` · ${queued} waiting` : ""}
        </Badge>
      </div>

      {assigned ? (
        <div className="flex items-start justify-between gap-4 rounded-2xl border border-[#C6EBD3] bg-[#E8F6EC] px-4 py-3">
          <div className="min-w-0">
            <div className="text-[11px] font-bold tracking-[0.16em] text-[#167a34] uppercase">
              Assigned to you
            </div>
            <div className="mt-1 text-sm font-semibold text-[#121417]">
              {assigned.address}
            </div>
            <div className="text-sm text-[#3F5A48]">
              The household is tracking this van on their map.
            </div>
          </div>
          <PriorityBulb score={assigned.priorityScore} />
        </div>
      ) : null}

      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div
          className={
            assigned && crew
              ? "min-h-0"
              : "overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm"
          }
        >
          {assigned && crew ? (
            <TrackLiveMap
              incident={assigned}
              crew={crew}
              technicianName={technicianNameForCrew(crew, snapshot?.users ?? [])}
              perspective="technician"
              mapClassName="h-52 w-full min-h-[208px] sm:h-64 sm:min-h-[256px] lg:h-[calc(100dvh-300px)] lg:min-h-[320px]"
            />
          ) : crew ? (
            <CommandMap
              incidents={pool}
              investigations={[]}
              crews={[crew]}
              selectedId={null}
              onSelect={() => {}}
              showInvestigations={false}
              className="h-52 min-h-[208px] w-full sm:h-64 sm:min-h-[256px] lg:h-full lg:min-h-[calc(100dvh-220px)]"
            />
          ) : (
            <div className="flex h-52 min-h-[208px] items-center justify-center text-sm text-[#6B7280] sm:h-64">
              No vehicle is linked to this sign-in.
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 pb-6 lg:min-h-0 lg:overflow-auto lg:pb-0">
          {assigned ? (
            <JobCard
              incident={assigned}
              crew={crew}
              notes={notes}
              serial={serial}
              signature={signature}
              onNotes={setNotes}
              onSerial={setSerial}
              onSignature={setSignature}
              photo={photo}
              onPhoto={setPhoto}
              busy={busy}
              onOnSite={() =>
                act({ action: "onsite", kind: "outage", targetId: assigned.id })
              }
              onComplete={() =>
                act(
                  {
                    action: "complete",
                    kind: "outage",
                    targetId: assigned.id,
                    notes,
                    serialNumber: serial,
                    dataUri: signature,
                    repairPhoto: photo ? repairPhotoMeta(photo) : undefined,
                  },
                  photo ? "Repair evidence uploaded successfully." : undefined,
                )
              }
            />
          ) : (
            <IdlePanel
              crew={crew}
              pool={pool}
              busy={busy}
              onTake={takeJob}
            />
          )}
          {status ? <p className="text-sm font-medium text-[#167a34]">{status}</p> : null}
        </div>
      </div>
    </div>
  );
}

function PriorityBulb({ score }: { score: number }) {
  const band = priorityBand(score);
  const level = band === "low" ? "low" : band === "medium" ? "medium" : "high";
  const tone = {
    high: { color: "#DC2626", wash: "#FEE2E2", label: "Highest priority" },
    medium: { color: "#D97706", wash: "#FEF3C7", label: "Medium priority" },
    low: { color: "#24A148", wash: "#E8F6EC", label: "Lowest priority" },
  }[level];

  return (
    <div className="flex shrink-0 items-center gap-2" title={tone.label}>
      <span className="text-right text-[11px] font-semibold" style={{ color: tone.color }}>
        {tone.label}
      </span>
      <span
        className="flex size-11 items-center justify-center rounded-full"
        style={{ background: tone.wash }}
      >
        <Lightbulb className="size-6" style={{ color: tone.color }} fill={tone.color} />
      </span>
    </div>
  );
}

function IdlePanel({
  crew,
  pool,
  busy,
  onTake,
}: {
  crew?: FieldCrew;
  pool: MasterIncident[];
  busy: string | null;
  onTake: (incident: MasterIncident) => void;
}) {
  return (
    <>
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <div className="text-[11px] font-bold tracking-[0.16em] text-[#24A148] uppercase">
          Ready
        </div>
        <h2 className="font-heading mt-2 text-lg font-bold">No job assigned</h2>
        <p className="mt-1 text-sm text-[#6B7280]">
          Control room will send the next fault here.
        </p>
        {crew ? (
          <dl className="mt-4 space-y-2 border-t border-[#F3F4F6] pt-4 text-sm">
            {[
              ["Callsign", crew.callsign],
              ["Vehicle", crew.vehicleReg],
              ["Status", crew.status.replaceAll("_", " ")],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3">
                <dt className="text-[#6B7280]">{label}</dt>
                <dd className="font-medium text-[#121417] capitalize">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>

      {pool.length > 0 ? (
        <div className="space-y-2">
          <h2 className="font-heading text-sm font-bold">Unassigned faults near you</h2>
          {pool.map((incident) => {
            const taking = busy === `take:${incident.id}`;
            return (
            <button
              key={incident.id}
              type="button"
              disabled={busy !== null}
              {...pressLockProps(taking)}
              className={cn(
                "w-full rounded-2xl p-4 text-left shadow-sm",
                pressLock.base,
                pressLock.soft,
              )}
              onClick={() => onTake(incident)}
            >
              <div className="font-mono text-[11px] text-[#6B7280]">{incident.reference}</div>
              <div className="mt-1 text-sm font-semibold">{incident.address}</div>
              <div className="mt-1 text-xs text-[#6B7280]">
                {taking ? (
                  <ButtonSpinner label="Taking this job…" />
                ) : (
                  `${incident.affectedHouseholds} households${
                    crew
                      ? ` · ${formatKm(distanceMetres(crew.location, incident.location))} · ${etaMinutes(distanceMetres(crew.location, incident.location))} min`
                      : ""
                  } · Take this job`
                )}
              </div>
              {crew ? (
                <a
                  href={navigateUrl(crew.location, incident.location)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-xs font-semibold text-[#24A148] underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Preview route
                </a>
              ) : null}
            </button>
            );
          })}
        </div>
      ) : null}
    </>
  );
}

function JobCard({
  incident,
  crew,
  notes,
  serial,
  signature,
  photo,
  busy,
  onNotes,
  onSerial,
  onSignature,
  onPhoto,
  onOnSite,
  onComplete,
}: {
  incident: MasterIncident;
  crew?: FieldCrew;
  notes: string;
  serial: string;
  signature: string | null;
  photo: RepairPhoto | null;
  busy: string | null;
  onNotes: (v: string) => void;
  onSerial: (v: string) => void;
  onSignature: (v: string) => void;
  onPhoto: (photo: RepairPhoto | null) => void;
  onOnSite: () => void;
  onComplete: () => void;
}) {
  const maps = crew
    ? navigateUrl(crew.location, incident.location)
    : `https://www.google.com/maps/dir/?api=1&destination=${incident.location.lat},${incident.location.lon}&travelmode=driving`;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="font-mono text-xs">{incident.reference}</div>
      <div className="mt-1 text-base font-semibold">{incident.address}</div>
      <div className="text-muted-foreground mt-1 text-xs">
        {incident.affectedHouseholds} households · {incident.status.replaceAll("_", " ")}
        {crew
          ? ` · ${formatKm(distanceMetres(crew.location, incident.location))} from your van`
          : ""}
      </div>
      <a
        href={maps}
        target="_blank"
        rel="noreferrer"
        className="text-primary mt-2 inline-block text-xs underline"
      >
        Open driving directions
      </a>
      <div className="mt-4 flex flex-col gap-2">
        <Button
          onClick={onOnSite}
          loading={busy === "onsite"}
          disabled={incident.status === "on_site" || busy !== null}
        >
          {busy === "onsite" ? "Marking on site…" : "Mark On Site"}
        </Button>
        <label className="text-muted-foreground text-[11px]">
          Completion notes
          <Input className="mt-1" value={notes} onChange={(e) => onNotes(e.target.value)} />
        </label>
        <label className="text-muted-foreground text-[11px]">
          New component serial
          <Input className="mt-1" value={serial} onChange={(e) => onSerial(e.target.value)} />
        </label>
        <SignPad onChange={onSignature} value={signature} />
        <RepairEvidence value={photo} onChange={onPhoto} />
        <Button
          variant="outline"
          loading={busy === "complete"}
          disabled={busy !== null}
          onClick={() => onComplete()}
        >
          {busy === "complete" ? "Signing off…" : "Sign off restoration"}
        </Button>
        <p className="text-muted-foreground text-[10px]">
          Closure photo is attached automatically. Serial and signature hash
          into the audit chain.
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={evidenceSvg("Joint replaced", `Serial ${serial}`)}
          alt="Completion photo"
          className="mt-1 h-24 w-full rounded-md object-cover ring-1 ring-border"
        />
      </div>
    </div>
  );
}

function SignPad({
  onChange,
  value,
}: {
  onChange: (dataUri: string) => void;
  value: string | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#0b1210";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#3dd6a0";
    ctx.lineWidth = 2;
    let drawing = false;
    const pos = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const down = (e: PointerEvent) => {
      drawing = true;
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    };
    const move = (e: PointerEvent) => {
      if (!drawing) return;
      const p = pos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    };
    const up = () => {
      drawing = false;
      onChange(canvas.toDataURL("image/png"));
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [onChange]);

  return (
    <label className="text-muted-foreground text-[11px]">
      Technician signature {value ? "· captured" : ""}
      <canvas
        ref={ref}
        width={320}
        height={90}
        className="mt-1 w-full rounded-md border border-border touch-none"
      />
    </label>
  );
}

function RepairEvidence({
  onChange,
  value,
}: {
  onChange: (photo: RepairPhoto | null) => void;
  value: RepairPhoto | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  function chosen(file: File | undefined) {
    if (!file) return;
    const problem = repairPhotoError(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setReading(true);
    const reader = new FileReader();
    reader.onload = () => {
      setReading(false);
      const dataUri = reader.result;
      if (typeof dataUri === "string") {
        onChange({ dataUri, name: file.name, type: file.type, bytes: file.size });
      } else {
        setError("That photo could not be read. Try another one.");
      }
    };
    reader.onerror = () => {
      setReading(false);
      setError("That photo could not be read. Try another one.");
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="text-muted-foreground text-[11px]">
      <span className="block">Repair evidence</span>
      <input
        ref={inputRef}
        type="file"
        accept={REPAIR_PHOTO_ACCEPT}
        className="hidden"
        onChange={(e) => {
          chosen(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {value ? (
        <div className="mt-1 flex flex-col gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value.dataUri}
            alt="Repair evidence preview"
            className="h-24 w-full rounded-md object-cover ring-1 ring-border"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={reading}
              onClick={() => inputRef.current?.click()}
            >
              Change photo
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setError(null);
                onChange(null);
              }}
            >
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="mt-1 w-full"
          disabled={reading}
          onClick={() => inputRef.current?.click()}
        >
          <Camera className="size-3.5" />
          {reading ? "Reading photo…" : "Upload photo"}
        </Button>
      )}
      {error ? <p className="text-destructive mt-1">{error}</p> : null}
    </div>
  );
}

