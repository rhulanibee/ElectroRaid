import { fail, json } from "@/lib/http";
import { readyStore } from "@/lib/store";
import type { JobKind } from "@/lib/engines/dispatch";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action: "onsite" | "evidence" | "fine" | "complete" | "close" | "confirm" | "dispute" | "qa";
      kind: JobKind;
      targetId: string;
      notes?: string;
      caption?: string;
      dataUri?: string;
      serialNumber?: string;
      /** Repair evidence captured on the handset for this job. */
      repairPhoto?: { name: string; type: string; bytes: number };
      actorId?: string;
      rating?: number;
    };

    const store = await readyStore();
    switch (body.action) {
      case "onsite":
        store.markOnSite(body.kind, body.targetId);
        break;
      case "evidence": {
        if (body.kind !== "investigation") {
          return fail("Evidence is captured on investigations.");
        }
        store.addEvidence(body.targetId, {
          caption: body.caption ?? "Field photo",
          dataUri: body.dataUri ?? "",
          capturedAt: new Date().toISOString(),
          capturedBy: body.actorId ?? "usr_nomsa",
        });
        break;
      }
      case "fine":
        store.issueFine(body.targetId);
        store.closeInvestigation(body.targetId, "closed_recovered");
        break;
      case "complete":
        store.completeOutage(body.targetId, body.notes ?? "Work completed.", {
          serialNumber: body.serialNumber,
          actorId: body.actorId,
          repairPhoto: body.repairPhoto,
        });
        break;
      case "close":
        store.closeInvestigation(body.targetId, "closed_no_finding");
        break;
      case "confirm":
        store.residentConfirm(body.targetId, body.actorId);
        break;
      case "dispute":
        store.residentDispute(body.targetId, body.actorId);
        break;
      case "qa":
        store.submitQa(
          body.targetId,
          body.rating ?? 3,
          body.notes ?? "",
          body.actorId,
        );
        break;
      default:
        return fail("Unknown field action.");
    }

    return json({ ok: true, snapshot: store.snapshot(), roi: store.roi() });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Field action failed", 500);
  }
}
