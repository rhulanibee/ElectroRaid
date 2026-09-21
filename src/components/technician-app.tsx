"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { TrackLiveMap, navigateUrl, technicianNameForCrew } from "@/components/track-live-map";
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

  const crew = snapshot?.crews.find((c) => c.id === persona?.crewId);
  const assigned = snapshot?.incidents.find(
    (i) => i.assignedCrewId === persona?.crewId && i.status !== "resolved" && i.status !== "closed",
  );
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
    const body = { ...payload, actorId: persona?.id };
    if (!online) {
      await enqueue(body);
      setQueued(await pendingCount());
      setStatus("Saved on this handset. Will sync when coverage returns.");
      return;
    }
    await postJson("/api/field/action", body);
    setStatus(successMessage ?? "Written to the immutable audit log.");
  }

  return (
    <div className="mx-auto min-h-full max-w-md px-4 py-6">
      <div className="mb-1 text-[10px] tracking-[0.2em] text-primary uppercase">
        Field technician PWA
      </div>
      <div className="flex items-start justify-between gap-2">
        <h1 className="font-heading text-xl font-semibold">Repair jobs</h1>
        <Badge variant={online ? "secondary" : "destructive"}>
          {online ? "Online" : "Offline"}
          {queued ? ` · ${queued}` : ""}
        </Badge>
      </div>
      <p className="text-muted-foreground mt-1 text-xs">
        {crew
          ? `${crew.callsign} · ${crew.vehicleReg} · ${crew.status.replaceAll("_", " ")}`
          : "No vehicle assigned."}{" "}
        Offline-first IndexedDB queue.
      </p>

      {assigned ? (
        <>
          <div className="border-primary/40 bg-primary/10 mt-4 rounded-xl border px-3 py-2 text-xs">
            <div className="font-medium text-primary">
              Control room assigned this job to you
            </div>
            <div className="text-muted-foreground mt-0.5">
              Drive to {assigned.address}. The resident sees this same van on their map.
            </div>
          </div>
          {/* Hero: map on the left, site card on the right — stacked on phones. */}
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start">
            {crew ? (
              <TrackLiveMap
                incident={assigned}
                crew={crew}
                technicianName={technicianNameForCrew(
                  crew,
                  snapshot?.users ?? [],
                )}
                perspective="technician"
              />
            ) : null}
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
          </div>
        </>
      ) : (
        <div className="mt-4 space-y-2">
          <div className="text-sm font-medium">Unassigned faults near you</div>
          {pool.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              No open maintenance jobs. Control room will assign the next cable fault.
            </p>
          ) : (
            pool.map((incident) => (
              <button
                key={incident.id}
                type="button"
                className="w-full rounded-xl border border-border bg-card p-3 text-left"
                onClick={() =>
                  postJson("/api/dispatch", {
                    kind: "outage",
                    targetId: incident.id,
                    crewId: persona?.crewId,
                  })
                }
              >
                <div className="font-mono text-[11px]">{incident.reference}</div>
                <div className="text-sm font-medium">{incident.address}</div>
                <div className="text-muted-foreground text-xs">
                  {incident.affectedHouseholds} hh
                  {crew
                    ? ` · ${formatKm(distanceMetres(crew.location, incident.location))} · ${etaMinutes(distanceMetres(crew.location, incident.location))} min`
                    : ""}{" "}
                  · tap to take this job
                </div>
                {crew ? (
                  <a
                    href={navigateUrl(crew.location, incident.location)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary mt-2 inline-block text-xs underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Preview route to this fault
                  </a>
                ) : null}
              </button>
            ))
          )}
        </div>
      )}
      {status ? <p className="text-primary mt-4 text-xs">{status}</p> : null}
    </div>
  );
}

function JobCard({
  incident,
  crew,
  notes,
  serial,
  signature,
  photo,
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
        <Button onClick={onOnSite} disabled={incident.status === "on_site"}>
          Mark On Site
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
          onClick={() =>
            onComplete()
          }
        >
          Sign off restoration
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

