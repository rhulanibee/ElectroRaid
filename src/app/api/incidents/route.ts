import { json } from "@/lib/http";
import { readyStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return json({ ok: true, incidents: (await readyStore()).snapshot().incidents });
}
