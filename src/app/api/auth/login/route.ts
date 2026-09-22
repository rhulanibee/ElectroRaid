import { fail, json } from "@/lib/http";
import { readyStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      identifier?: string;
      password?: string;
    };
    const identifier = typeof body.identifier === "string" ? body.identifier : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!identifier.trim() || !password.trim()) {
      return fail("Username and password are required.");
    }
    const store = await readyStore();
    const persona = store.authenticateStaff(identifier, password);
    if (!persona) {
      return fail("Username or password is incorrect.", 401);
    }
    return json({ ok: true, persona });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Sign-in failed", 500);
  }
}
