import { readyStore } from "@/lib/store";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = await readyStore();
  return json({
    ok: true,
    snapshot: store.snapshot(),
    roi: store.roi(),
    chain: store.chainStatus(),
    serverTime: new Date().toISOString(),
  });
}
