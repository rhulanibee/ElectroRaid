import { fail, json } from "@/lib/http";
import { readyStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = await readyStore();
  const snapshot = store.snapshot();
  return json({
    ok: true,
    enabled: snapshot.autoDispatchEnabled,
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      enabled?: boolean;
      actorId?: string;
    };
    if (typeof body.enabled !== "boolean") {
      return fail("enabled (boolean) is required.");
    }
    const store = await readyStore();
    const result = store.setAutoDispatch(body.enabled, body.actorId);
    return json({
      ok: true,
      ...result,
      snapshot: store.snapshot(),
      roi: store.roi(),
    });
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Could not update auto-dispatch",
      500,
    );
  }
}
