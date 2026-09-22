"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { postJson, usePlatform } from "@/lib/use-platform";
import { useSession } from "@/lib/use-session";
import { OUTAGE_REPORT_OPTIONS, TIP_REPORT_OPTIONS } from "@/lib/report-options";
import { pointForSuburb } from "@/lib/geo";
import { go } from "@/lib/hard-nav";
import type { IngestReportInput, InvestigationType, OutageClassification } from "@/lib/types";

export function ResidentReport() {
  const { persona } = useSession();
  const { snapshot } = usePlatform();
  const [mode, setMode] = useState<"outage" | "tip">("outage");
  const [outageType, setOutageType] = useState<OutageClassification>("no_power");
  const [tipType, setTipType] = useState<string>("illegal_connection");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const suburb = persona?.suburb ?? "";
  const account = persona?.accountNumber ?? "";
  const address = persona?.address ?? "";
  const needsOther = mode === "outage" ? outageType === "other" : tipType === "other";
  const nearby = useMemo(
    () =>
      (snapshot?.incidents ?? []).filter(
        (i) => i.suburb === suburb && i.status !== "closed" && i.status !== "resolved",
      ).length,
    [snapshot, suburb],
  );

  async function submit() {
    if (!persona) return;
    if (!account || !address || !suburb) {
      setMessage("Add your suburb and street address in Settings before you report.");
      return;
    }
    if (needsOther && !notes.trim()) {
      setMessage("Other needs a short description of what you are seeing.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const chosen =
        mode === "tip"
          ? TIP_REPORT_OPTIONS.find((o) => o.value === tipType)
          : OUTAGE_REPORT_OPTIONS.find((o) => o.value === outageType);
      const detail = needsOther
        ? `Other: ${notes.trim()}`
        : mode === "tip"
          ? `[${chosen?.label}] ${notes}`.trim()
          : notes || null;
      const body: IngestReportInput = {
        accountNumber: mode === "outage" ? account : null,
        reporterName: mode === "tip" ? "Anonymous tip" : persona.name,
        contactPhone: mode === "tip" ? null : persona.phone ?? null,
        location: pointForSuburb(suburb),
        address,
        suburb,
        classification: mode === "tip" ? "izinyoka_tip" : outageType,
        channel: mode === "tip" ? "anonymous_tip" : "app",
        notes: detail,
        feederId:
          snapshot?.feeders.find(
            (feeder) => feeder.suburb.toLowerCase() === suburb.toLowerCase(),
          )?.id ?? null,
        investigationType:
          mode === "tip" ? (tipType as InvestigationType | "other") : undefined,
      };
      const result = await postJson<{
        ok: boolean;
        kind?: string;
        merged?: boolean;
        matchDistanceM?: number | null;
        incident?: { reference: string; affectedHouseholds: number; id: string };
        investigation?: { reference: string; id: string };
      }>("/api/reports", body);

      if (!result.ok) {
        setMessage("Could not reach the control room. Try again.");
        return;
      }
      if (result.kind === "tip") {
        setMessage(
          `Tip ${result.investigation?.reference} is with Revenue Protection. Your number stays hidden.`,
        );
        return;
      }
      setMessage(
        result.merged
          ? `Your report joined ${result.incident?.reference} (${result.matchDistanceM} m). ${result.incident?.affectedHouseholds} households on this ticket.`
          : `Opened ${result.incident?.reference}. Track the crew as soon as dispatch assigns one.`,
      );
      if (needsOther) setNotes("");
    } catch {
      setMessage("Could not send. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Report Outage</h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            Account {account} · {suburb}
            {nearby ? ` · ${nearby} open ticket${nearby === 1 ? "" : "s"} nearby` : ""}
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={mode === "outage" ? "default" : "outline"}
            className="h-10"
            onClick={() => setMode("outage")}
          >
            Fault / outage
          </Button>
          <Button
            variant={mode === "tip" ? "default" : "outline"}
            className="h-10"
            onClick={() => setMode("tip")}
          >
            Anonymous tip
          </Button>
        </div>
        <div className="mt-4 space-y-3">
          <div className="text-sm font-medium text-[#121417]">
            {mode === "tip" ? "What do you want to report?" : "What is happening?"}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(mode === "outage" ? OUTAGE_REPORT_OPTIONS : TIP_REPORT_OPTIONS).map(
              (opt) => {
                const selected =
                  mode === "outage" ? outageType === opt.value : tipType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      if (mode === "outage") {
                        setOutageType(opt.value as OutageClassification);
                      } else {
                        setTipType(opt.value);
                      }
                      setMessage(null);
                    }}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                      selected
                        ? "border-[#24A148] bg-[#24A148] text-white"
                        : "border-[#E5E7EB] bg-white hover:bg-[#F3F5F4]"
                    }`}
                  >
                    {opt.short}
                  </button>
                );
              },
            )}
          </div>
          <p className="text-xs text-[#6B7280]">
            {mode === "outage"
              ? OUTAGE_REPORT_OPTIONS.find((o) => o.value === outageType)?.hint
              : TIP_REPORT_OPTIONS.find((o) => o.value === tipType)?.hint}
          </p>
          {needsOther ? (
            <label className="block text-sm">
              <span className="mb-1 block font-medium">
                Other — type what you want to report
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm outline-none focus:border-[#24A148] focus:ring-3 focus:ring-[#24A148]/15"
                placeholder="e.g. Burning smell from the pole, sparks on the roof…"
              />
            </label>
          ) : (
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-11"
              placeholder={
                mode === "tip"
                  ? "Where is it? Street, landmark, what you saw. Your number stays hidden."
                  : "Optional extra detail for the crew…"
              }
            />
          )}
          <button
            type="button"
            disabled={busy}
            onClick={submit}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#24A148] text-sm font-semibold text-white hover:bg-[#1e8a3c] disabled:opacity-60"
          >
            {busy ? (
              <ButtonSpinner label="Sending…" />
            ) : mode === "tip" ? (
              "Send anonymous tip"
            ) : (
              "Report"
            )}
          </button>
          {message ? (
            <div className="rounded-xl bg-[#E8F6EC] px-3 py-2 text-sm text-[#167a34]">
              {message}{" "}
              {message.startsWith("Opened") || message.includes("joined") ? (
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={() => go("/resident/track")}
                >
                  Track report
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
