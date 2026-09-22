import { json } from "@/lib/http";
import { readyStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST() {
  const result = (await readyStore()).scanAnomalies();
  return json({
    ok: true,
    created: result.created,
    hits: result.hits.map((h) => ({
      meterNumber: h.meter.meterNumber,
      accountNumber: h.meter.accountNumber,
      daysZero: h.daysZero,
      riskScore: h.riskScore,
      feeder: h.feeder.code,
      feederStatus: h.feeder.status,
    })),
  });
}
