"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { postJson } from "@/lib/use-platform";
import type { IngestReportInput, OutageClassification, ReportChannel } from "@/lib/types";

const SUBURBS: { label: string; address: string; lon: number; lat: number }[] = [
  {
    label: "Mamelodi Ext 11",
    address: "Tsamaya Road, Mamelodi Ext 11",
    lon: 28.3948,
    lat: -25.7238,
  },
  {
    label: "Atteridgeville",
    address: "Maunde Street, Atteridgeville",
    lon: 28.071,
    lat: -25.776,
  },
  {
    label: "Soshanguve Block L",
    address: "Block L, Soshanguve",
    lon: 28.103,
    lat: -25.529,
  },
  {
    label: "Pretoria CBD",
    address: "Church Square, Pretoria",
    lon: 28.1879,
    lat: -25.7463,
  },
];

export function ReportForm() {
  const [mode, setMode] = useState<"outage" | "tip">("outage");
  const [account, setAccount] = useState("3218840701");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [suburb, setSuburb] = useState(SUBURBS[0].label);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const place = SUBURBS.find((s) => s.label === suburb) ?? SUBURBS[0];
    const jitter = () => (Math.random() - 0.5) * 0.002;
    const body: IngestReportInput = {
      accountNumber: mode === "outage" ? account : null,
      reporterName: mode === "tip" ? "Anonymous tip" : name || "Resident",
      contactPhone: mode === "tip" ? null : phone || null,
      location: { lon: place.lon + jitter(), lat: place.lat + jitter() },
      address: place.address,
      suburb: place.label,
      classification: (mode === "tip" ? "izinyoka_tip" : "no_power") as OutageClassification,
      channel: (mode === "tip" ? "anonymous_tip" : "app") as ReportChannel,
      notes: notes || null,
    };
    const result = await postJson<{
      ok: boolean;
      kind?: string;
      merged?: boolean;
      matchDistanceM?: number | null;
      incident?: { reference: string; affectedHouseholds: number };
      investigation?: { reference: string };
    }>("/api/reports", body);
    setBusy(false);
    if (!result.ok) {
      setMessage("The control room could not accept this report.");
      return;
    }
    if (result.kind === "tip") {
      setMessage(
        `Tip opened ${result.investigation?.reference}. Revenue protection will see it on the live map.`,
      );
      return;
    }
    setMessage(
      result.merged
        ? `Merged into ${result.incident?.reference} (${result.matchDistanceM} m from the master ticket). Households now ${result.incident?.affectedHouseholds}.`
        : `Opened ${result.incident?.reference}. Dispatchers see it on the live map.`,
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="text-[10px] tracking-[0.2em] text-primary uppercase">
        Resident channel
      </div>
      <h1 className="font-heading text-2xl font-semibold">Report an outage</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Account number, GPS, and classification go through the same 500 m / 2 h
        spatial merge as the call centre. Anonymous Izinyoka tips open a
        revenue-protection ticket instead of a maintenance job.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button
          variant={mode === "outage" ? "default" : "outline"}
          onClick={() => setMode("outage")}
        >
          Power outage
        </Button>
        <Button
          variant={mode === "tip" ? "default" : "outline"}
          onClick={() => setMode("tip")}
        >
          Anonymous tip
        </Button>
      </div>

      <div className="mt-5 space-y-3">
        {mode === "outage" ? (
          <>
            <Field label="Account number">
              <Input value={account} onChange={(e) => setAccount(e.target.value)} />
            </Field>
            <Field label="Your name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
            </Field>
            <Field label="Contact number">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
            </Field>
          </>
        ) : null}
        <Field label="Suburb">
          <select
            className="border-input bg-input/30 h-8 w-full rounded-lg border px-2 text-sm"
            value={suburb}
            onChange={(e) => setSuburb(e.target.value)}
          >
            {SUBURBS.map((s) => (
              <option key={s.label} value={s.label}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="What are you seeing?">
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              mode === "tip"
                ? "Overhead tap, bypassed meter, illegal connection…"
                : "Whole street dark, transformer noise, cable down…"
            }
          />
        </Field>
        <Button className="w-full" onClick={submit} loading={busy}>
          {busy ? "Submitting…" : mode === "tip" ? "Send anonymous tip" : "Submit outage report"}
        </Button>
        {message ? <p className="text-primary text-sm">{message}</p> : null}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs">
      <span className="text-muted-foreground mb-1 block">{label}</span>
      {children}
    </label>
  );
}
