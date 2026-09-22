"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DEMO_SCRIPT } from "@/lib/demo-script";
import { postJson } from "@/lib/use-platform";

const ACTS = [
  {
    n: 1,
    title: "Spatial cluster",
    copy: "Three Mamelodi reports within 500 m collapse into one master ticket.",
  },
  {
    n: 2,
    title: "Zero-consumption",
    copy: "Silent prepaid meter on an ENERGIZED feeder becomes an Izinyoka flag.",
  },
  {
    n: 3,
    title: "Audit trail",
    copy: "Inspector on-site photos and a tamper fine hash into the ledger.",
  },
  {
    n: 4,
    title: "ROI in ZAR",
    copy: "Fleet savings + recovered revenue land on the executive board.",
  },
];

export function DemoRail() {
  const [running, setRunning] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const [log, setLog] = useState<string>("Ready when you are.");
  const abortRef = useRef(false);

  async function runStep(id: string, index: number) {
    setCursor(index);
    const result = await postJson<{ ok: boolean; message: string }>(
      "/api/demo/step",
      { step: id },
    );
    setLog(result.message);
    return result.ok;
  }

  async function playAll() {
    abortRef.current = false;
    setRunning(true);
    await runStep("reset", 0);
    for (let i = 1; i < DEMO_SCRIPT.length; i += 1) {
      if (abortRef.current) break;
      await wait(1100);
      await runStep(DEMO_SCRIPT[i].id, i);
    }
    setRunning(false);
  }

  return (
    <div className="border-b border-border bg-card/60 px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-medium">Hackathon demo sequence</div>
        <div className="flex gap-1.5">
          <Button
            size="xs"
            variant="outline"
            onClick={() => runStep("reset", 0)}
            loading={running && cursor === 0}
            disabled={running}
          >
            Reset
          </Button>
          <Button size="xs" onClick={playAll} loading={running && cursor > 0} disabled={running}>
            {running ? "Playing…" : "Play all 4 acts"}
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {ACTS.map((act) => (
          <div
            key={act.n}
            className="rounded-md border border-border/80 px-2 py-1.5"
          >
            <div className="text-primary text-[10px] tracking-wide uppercase">
              Act {act.n}
            </div>
            <div className="text-[11px] font-medium">{act.title}</div>
            <div className="text-muted-foreground text-[10px] leading-snug">
              {act.copy}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {DEMO_SCRIPT.map((step, index) => (
          <button
            key={step.id}
            type="button"
            disabled={running}
            onClick={() => runStep(step.id, index)}
            className={`rounded-full border px-2 py-0.5 text-[10px] ${
              cursor === index
                ? "border-primary bg-primary/20 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {index}. {step.label}
          </button>
        ))}
      </div>
      <p className="text-muted-foreground mt-2 text-[11px]">{log}</p>
    </div>
  );
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
