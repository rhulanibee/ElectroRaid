"use client";

import { useSession } from "@/lib/use-session";
import { go } from "@/lib/hard-nav";

export function ResidentSettings() {
  const { persona, logout } = useSession();

  return (
    <div className="mx-auto max-w-xl px-4 py-6 md:px-6">
      <h1 className="font-heading text-2xl font-bold">Settings</h1>
      <p className="mt-1 text-sm text-[#6B7280]">
        Household profile linked to your municipal electricity account.
      </p>

      <div className="mt-5 space-y-3 rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm">
        {[
          ["Name", persona?.name],
          ["Email", persona?.email],
          ["Account number", persona?.accountNumber],
          ["Phone", persona?.phone ?? "—"],
          ["Suburb", persona?.suburb],
          ["Proof of residence", persona?.verified ? "Verified" : "Pending"],
        ].map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-4 border-b border-[#F3F4F6] py-2 last:border-0"
          >
            <div className="text-sm text-[#6B7280]">{label}</div>
            <div className="text-sm font-medium text-[#121417]">{value}</div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => {
          logout();
          go("/");
        }}
        className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-sm font-semibold text-[#121417] hover:bg-[#F3F5F4]"
      >
        Sign out
      </button>
    </div>
  );
}
