"use client";

import { useEffect, useState } from "react";
import { ButtonSpinner, pressLock, pressLockProps } from "@/components/ui/button-spinner";
import { postJson } from "@/lib/use-platform";
import { useSession } from "@/lib/use-session";
import { go } from "@/lib/hard-nav";
import { cn } from "@/lib/utils";

export function ResidentSettings() {
  const { persona, logout, updateProfile } = useSession();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [suburb, setSuburb] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!persona) return;
    setFirstName(persona.firstName ?? persona.name.split(" ")[0] ?? "");
    setLastName(
      persona.lastName ?? persona.name.split(" ").slice(1).join(" "),
    );
    setEmail(persona.email);
    setPhone(persona.phone ?? "");
    setSuburb(persona.suburb ?? "");
    setAddress(persona.address ?? "");
  }, [persona]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const result = updateProfile({
        firstName,
        lastName,
        email,
        phone,
        suburb,
        address,
      });
      if (!result.persona) {
        setError(result.error ?? "Could not save your details.");
        return;
      }
      try {
        await postJson("/api/profile", {
          userId: result.persona.id,
          fullName: result.persona.name,
          email: result.persona.email,
          phone: result.persona.phone ?? null,
          suburb: result.persona.suburb,
          address: result.persona.address,
          accountNumber: result.persona.accountNumber,
        });
      } catch {
        setNotice("Saved on this device. The control room will pick it up when you are back online.");
        return;
      }
      setNotice("Your details are saved. The account number stays the same.");
    } finally {
      setBusy(false);
    }
  }

  const fieldClass =
    "h-11 w-full rounded-xl border border-[#E5E7EB] px-3 text-sm outline-none focus:border-[#24A148]";

  return (
    <div className="mx-auto max-w-xl px-4 py-6 md:px-6">
      <h1 className="font-heading text-2xl font-bold">Settings</h1>
      <p className="mt-1 text-sm text-[#6B7280]">
        Update your household details. Your municipal account number cannot be changed.
      </p>

      <form
        onSubmit={save}
        className="mt-5 space-y-3 rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-sm"
      >
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">First name</span>
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Last name</span>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Phone</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Suburb</span>
          <input
            value={suburb}
            onChange={(e) => setSuburb(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Street address</span>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium">Account number</span>
          <input
            value={persona?.accountNumber ?? ""}
            readOnly
            className="h-11 w-full rounded-xl border border-[#E5E7EB] bg-[#F3F5F4] px-3 text-sm text-[#6B7280]"
          />
        </label>
        <div className="flex items-center justify-between gap-4 border-t border-[#F3F4F6] pt-3">
          <div className="text-sm text-[#6B7280]">Proof of residence</div>
          <div className="text-sm font-medium text-[#121417]">
            {persona?.verified ? "Verified" : "Pending"}
          </div>
        </div>
        {error ? <p className="text-sm text-[#DC2626]">{error}</p> : null}
        {notice ? <p className="text-sm font-medium text-[#167a34]">{notice}</p> : null}
        <button
          type="submit"
          disabled={busy}
          {...pressLockProps(busy)}
          className={cn(
            "inline-flex h-11 w-full items-center justify-center rounded-xl text-sm font-semibold",
            pressLock.base,
            pressLock.primary,
          )}
        >
          {busy ? <ButtonSpinner label="Saving…" /> : "Save details"}
        </button>
      </form>

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
