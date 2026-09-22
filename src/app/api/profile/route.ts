import { fail, json } from "@/lib/http";
import { readyStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      userId?: string;
      fullName?: string;
      email?: string;
      phone?: string | null;
      suburb?: string;
      address?: string;
      accountNumber?: string | null;
    };
    if (!body.userId || !body.fullName || !body.email) {
      return fail("Name and email are required.");
    }
    (await readyStore()).updateHousehold({
      userId: body.userId,
      fullName: body.fullName.trim(),
      email: body.email.trim().toLowerCase(),
      phone: body.phone?.trim() || null,
      suburb: body.suburb?.trim() || "",
      address: body.address?.trim() || "",
      accountNumber: body.accountNumber?.trim() || null,
    });
    return json({ ok: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not save profile", 500);
  }
}
