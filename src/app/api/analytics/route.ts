import { json } from "@/lib/http";
import { readyStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = await readyStore();
  return json({
    ok: true,
    roi: store.roi(),
    chain: store.chainStatus(),
  });
}
