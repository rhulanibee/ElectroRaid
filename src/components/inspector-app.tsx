"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { evidenceSvg } from "@/lib/evidence";
import { formatZar, incidentStatusLabel } from "@/lib/format";
import { postJson, usePlatform } from "@/lib/use-platform";
import { useSession } from "@/lib/use-session";
import { enqueue, flushOutbox, pendingCount } from "@/lib/offline";
import type { MasterIncident, RevenueInvestigation } from "@/lib/types";

type InspectTab = "audits" | "qa";

const QA_LABELS = ["Poor", "Fair", "Good", "Very good", "Excellent"];

export function InspectorApp() {
  const { persona } = useSession();
  const { snapshot } = usePlatform();
  const [tab, setTab] = useState<InspectTab>("audits");
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const [sealBroken, setSealBroken] = useState(true);
  const [bypass, setBypass] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qaId, setQaId] = useState<string | null>(null);
  const [rating, setRating] = useState(4);
  const [qaNotes, setQaNotes] = useState("");
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

  const crew = snapshot?.crews.find((c) => c.id === persona?.crewId);
  const mine = snapshot?.investigations.find(
    (i) =>
      i.assignedCrewId === persona?.crewId &&
      i.status !== "closed_recovered" &&
      i.status !== "closed_no_finding",
  );
  const queue = useMemo(
    () =>
      (snapshot?.investigations ?? []).filter(
        (i) => i.status === "flagged" || i.status === "assigned",
      ),
    [snapshot],
  );
  const active =
    mine ??
    snapshot?.investigations.find((i) => i.id === selectedId) ??
    queue[0];

  const qaJobs = useMemo(() => {
    const jobs = (snapshot?.incidents ?? []).filter(
      (i) => i.status === "resolved" || i.status === "closed",
    );
    return [...jobs].sort((a, b) => {
      const aPending = a.qaRating ? 1 : 0;
      const bPending = b.qaRating ? 1 : 0;
      return aPending - bPending;
    });
  }, [snapshot]);

  const selectedQa =
    qaJobs.find((i) => i.id === qaId) ?? qaJobs.find((i) => !i.qaRating) ?? qaJobs[0];

  async function act(payload: Record<string, unknown>) {
    const key = String(payload.action ?? "act");
    setBusy(key);
    try {
      const body = { ...payload, actorId: persona?.id };
      if (!online) {
        await enqueue(body);
        setQueued(await pendingCount());
        setStatus("Queued on-device until radio returns.");
        return;
      }
      await postJson("/api/field/action", body);
      setStatus("Hashed into the audit chain with GPS timestamp.");
    } finally {
      setBusy(null);
    }
  }

  async function submitQa() {
    if (!selectedQa) return;
    await act({
      action: "qa",
      kind: "outage",
      targetId: selectedQa.id,
      rating,
      notes: qaNotes.trim() || `${QA_LABELS[rating - 1]} workmanship on site.`,
    });
    setStatus(
      `QA ${rating}/5 recorded on ${selectedQa.reference}. Dispatcher and audit log can see it.`,
    );
    setQaNotes("");
  }

  return (
    <div className="mx-auto min-h-full max-w-md px-4 py-6">
      <div className="text-[10px] tracking-[0.2em] text-gold uppercase">
        Revenue protection · audit kit
      </div>
      <div className="flex items-start justify-between gap-2">
        <h1 className="font-heading text-xl font-semibold">
          {tab === "qa" ? "Repair quality assurance" : "Izinyoka audits"}
        </h1>
        <Badge variant={online ? "secondary" : "destructive"}>
          {online ? "Online" : "Offline"}
          {queued ? ` · ${queued}` : ""}
        </Badge>
      </div>
      <p className="text-muted-foreground mt-1 text-xs">
        {crew ? `${crew.callsign} · ${crew.status.replaceAll("_", " ")}` : "No unit"}{" "}
        · Score the technician&apos;s repair, or run a tamper audit.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button
          variant={tab === "audits" ? "default" : "outline"}
          onClick={() => setTab("audits")}
        >
          Tamper audits
        </Button>
        <Button
          variant={tab === "qa" ? "default" : "outline"}
          onClick={() => setTab("qa")}
        >
          Repair QA
        </Button>
      </div>

      {tab === "audits" ? (
        <>
          <div className="mt-4 space-y-2">
            {queue.map((inv) => (
              <button
                key={inv.id}
                type="button"
                onClick={() => setSelectedId(inv.id)}
                className={`w-full rounded-xl border p-3 text-left ${
                  active?.id === inv.id
                    ? "border-gold/60 bg-gold/10"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex justify-between gap-2">
                  <span className="font-mono text-[11px]">{inv.reference}</span>
                  <span className="text-gold text-xs">risk {inv.anomalyRiskScore}</span>
                </div>
                <div className="text-sm font-medium">{inv.suburb}</div>
                <div className="text-muted-foreground text-[11px]">
                  {inv.type.replaceAll("_", " ")} · {inv.status.replaceAll("_", " ")}
                  {inv.daysZeroConsumption ? ` · ${inv.daysZeroConsumption}d silent` : ""}
                </div>
              </button>
            ))}
          </div>

          {active ? (
            <AuditCard
              inv={active}
              claimed={active.assignedCrewId === persona?.crewId}
              sealBroken={sealBroken}
              bypass={bypass}
              busy={busy}
              onSeal={setSealBroken}
              onBypass={setBypass}
              onClaim={async () => {
                setBusy("claim");
                try {
                  await postJson("/api/dispatch", {
                    kind: "investigation",
                    targetId: active.id,
                    crewId: persona?.crewId,
                  });
                } finally {
                  setBusy(null);
                }
              }}
              onOnSite={() =>
                act({ action: "onsite", kind: "investigation", targetId: active.id })
              }
              onEvidence={() =>
                act({
                  action: "evidence",
                  kind: "investigation",
                  targetId: active.id,
                  caption: sealBroken
                    ? "Broken meter seal + bypass jumper"
                    : "Seal intact — no tamper visible",
                  dataUri: evidenceSvg(
                    bypass ? "Bypass confirmed" : "Meter kiosk",
                    `${active.address} · GPS ${active.location.lat.toFixed(5)}, ${active.location.lon.toFixed(5)}`,
                  ),
                })
              }
              onFine={() =>
                act({ action: "fine", kind: "investigation", targetId: active.id })
              }
            />
          ) : (
            <p className="text-muted-foreground mt-4 text-xs">
              No investigation on the queue. Ask dispatch to run the anomaly scan.
            </p>
          )}
        </>
      ) : (
        <QaPanel
          jobs={qaJobs}
          selected={selectedQa}
          snapshotCrews={snapshot?.crews ?? []}
          snapshotUsers={snapshot?.users ?? []}
          rating={rating}
          notes={qaNotes}
          onSelect={(id) => {
            setQaId(id);
            const job = qaJobs.find((j) => j.id === id);
            if (job?.qaRating) setRating(job.qaRating);
            setQaNotes(job?.qaNotes ?? "");
          }}
          onRating={setRating}
          onNotes={setQaNotes}
          onSubmit={submitQa}
          busy={busy}
        />
      )}
      {status ? <p className="text-gold mt-4 text-xs">{status}</p> : null}
    </div>
  );
}

function QaPanel({
  jobs,
  selected,
  snapshotCrews,
  snapshotUsers,
  rating,
  notes,
  busy,
  onSelect,
  onRating,
  onNotes,
  onSubmit,
}: {
  jobs: MasterIncident[];
  selected?: MasterIncident;
  snapshotCrews: { id: string; userId: string; callsign: string }[];
  snapshotUsers: { id: string; fullName: string }[];
  rating: number;
  notes: string;
  busy: string | null;
  onSelect: (id: string) => void;
  onRating: (n: number) => void;
  onNotes: (v: string) => void;
  onSubmit: () => void;
}) {
  if (jobs.length === 0) {
    return (
      <p className="text-muted-foreground mt-4 text-xs">
        No technician jobs waiting for quality assurance. Jobs appear here after a
        technician signs off restoration.
      </p>
    );
  }

  const crew = snapshotCrews.find((c) => c.id === selected?.assignedCrewId);
  const tech = snapshotUsers.find((u) => u.id === crew?.userId);

  return (
    <div className="mt-4 space-y-3">
      <p className="text-muted-foreground text-xs">
        Rate the physical repair the technician logged — joint quality, site left
        safe, serial captured. This is not a tamper fine.
      </p>
      {jobs.map((job) => (
        <button
          key={job.id}
          type="button"
          onClick={() => onSelect(job.id)}
          className={`w-full rounded-xl border p-3 text-left ${
            selected?.id === job.id
              ? "border-gold/60 bg-gold/10"
              : "border-border bg-card"
          }`}
        >
          <div className="flex justify-between gap-2">
            <span className="font-mono text-[11px]">{job.reference}</span>
            <span className="text-xs">
              {job.qaRating ? `QA ${job.qaRating}/5` : "Needs QA"}
            </span>
          </div>
          <div className="text-sm font-medium">{job.suburb}</div>
          <div className="text-muted-foreground text-[11px]">
            {incidentStatusLabel(job.status)}
          </div>
        </button>
      ))}

      {selected ? (
        <div className="rounded-xl border border-gold/40 bg-card p-4">
          <div className="font-mono text-xs">{selected.reference}</div>
          <div className="mt-1 font-semibold">{selected.address}</div>
          <div className="text-muted-foreground mt-1 text-xs">
            Technician {tech?.fullName ?? "unknown"}
            {crew ? ` · ${crew.callsign}` : ""} · {selected.affectedHouseholds}{" "}
            households
          </div>
          <div className="mt-3 text-xs font-medium">Workmanship score</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <Button
                key={n}
                size="sm"
                variant={rating === n ? "default" : "outline"}
                onClick={() => onRating(n)}
              >
                {n} · {QA_LABELS[n - 1]}
              </Button>
            ))}
          </div>
          <label className="text-muted-foreground mt-3 block text-[11px]">
            Inspector notes
            <Input
              className="mt-1"
              value={notes}
              onChange={(e) => onNotes(e.target.value)}
              placeholder="Joint quality, site left safe, serial captured…"
            />
          </label>
          <Button className="mt-3 w-full" loading={busy === "qa"} disabled={busy !== null} onClick={onSubmit}>
            {busy === "qa"
              ? "Submitting QA…"
              : selected.qaRating
                ? "Update QA on this repair"
                : "Submit quality assurance"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function AuditCard({
  inv,
  claimed,
  sealBroken,
  bypass,
  busy,
  onSeal,
  onBypass,
  onClaim,
  onOnSite,
  onEvidence,
  onFine,
}: {
  inv: RevenueInvestigation;
  claimed: boolean;
  sealBroken: boolean;
  bypass: boolean;
  busy: string | null;
  onSeal: (v: boolean) => void;
  onBypass: (v: boolean) => void;
  onClaim: () => void;
  onOnSite: () => void;
  onEvidence: () => void;
  onFine: () => void;
}) {
  const total = inv.fineAmountZar + inv.backbillZar + inv.penaltyZar;
  return (
    <div className="mt-4 rounded-xl border border-gold/40 bg-card p-4">
      <div className="font-mono text-xs">{inv.reference}</div>
      <div className="mt-1 font-semibold">{inv.address}</div>
      <p className="text-muted-foreground mt-2 text-xs leading-relaxed">{inv.notes}</p>
      <div className="text-muted-foreground mt-2 text-[11px]">
        GPS {inv.location.lat.toFixed(5)}, {inv.location.lon.toFixed(5)} · captured
        on device clock
      </div>
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

      <div className="mt-4 space-y-2 text-xs">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={sealBroken}
            onChange={(e) => onSeal(e.target.checked)}
          />
          Meter seal broken / missing
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={bypass}
            onChange={(e) => onBypass(e.target.checked)}
          />
          Incoming tails bypassed (Izinyoka)
        </label>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {!claimed ? (
          <Button onClick={onClaim} loading={busy === "claim"} disabled={busy !== null}>
            {busy === "claim" ? "Accepting…" : "Accept audit · En Route"}
          </Button>
        ) : (
          <Button onClick={onOnSite} loading={busy === "onsite"} disabled={busy !== null}>
            {busy === "onsite" ? "Logging arrival…" : "Arrive On Site"}
          </Button>
        )}
        <Button
          variant="outline"
          onClick={onEvidence}
          loading={busy === "evidence"}
          disabled={busy !== null}
        >
          {busy === "evidence" ? "Saving evidence…" : "Log GPS photo evidence"}
        </Button>
        <Button
          variant="secondary"
          onClick={onFine}
          loading={busy === "fine"}
          disabled={(!bypass && !sealBroken) || busy !== null}
        >
          {busy === "fine"
            ? "Issuing fine…"
            : `Issue tamper fine${total ? ` · ${formatZar(total)}` : " + back-bill"}`}
        </Button>
      </div>
    </div>
  );
}
