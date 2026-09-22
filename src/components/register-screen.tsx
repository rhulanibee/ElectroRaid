"use client";

import { useState } from "react";
import { AuthField, AuthFrame, authControlClass, authPrimaryClass } from "@/components/auth-frame";
import { ButtonSpinner } from "@/components/ui/button-spinner";
import { GoogleSignInButton } from "@/components/google-sign-in";
import { afterLoginPath, useSession } from "@/lib/use-session";
import { go, goReplace } from "@/lib/hard-nav";

export function RegisterScreen() {
  const { register, loginWithGoogle } = useSession();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"form" | "google" | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy("form");
    setError(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const result = register({
        firstName,
        lastName,
        email,
        accountNumber,
        phone,
        password,
      });
      if (!result.persona) {
        setError(result.error ?? "Could not create the account.");
        return;
      }
      goReplace("/verify");
    } finally {
      setBusy(null);
    }
  }

  async function google() {
    setBusy("google");
    try {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const persona = loginWithGoogle();
      if (persona) goReplace(afterLoginPath(persona, null));
    } finally {
      setBusy(null);
    }
  }

  return (
    <AuthFrame
      title="Create Account"
      subtitle="Use your City of Tshwane electricity account."
    >
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AuthField label="First Name">
            <input
              className={authControlClass}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
            />
          </AuthField>
          <AuthField label="Last Name">
            <input
              className={authControlClass}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
            />
          </AuthField>
        </div>
        <AuthField label="Email">
          <input
            type="email"
            className={authControlClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@email.com"
          />
        </AuthField>
        <AuthField label="Account Number">
          <input
            className={authControlClass}
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            inputMode="numeric"
            placeholder="10-digit municipal account"
          />
        </AuthField>
        <AuthField label="Phone Number">
          <input
            className={authControlClass}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            placeholder="+27 …"
          />
        </AuthField>
        <AuthField label="Password">
          <input
            type="password"
            className={authControlClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="At least 8 characters"
          />
        </AuthField>
        {error ? <p className="text-sm text-[#DC2626]">{error}</p> : null}
        <button type="submit" className={authPrimaryClass} disabled={busy !== null}>
          {busy === "form" ? <ButtonSpinner label="Creating account…" /> : "Register"}
        </button>
      </form>

      <div className="relative my-4 text-center text-xs font-medium tracking-wide text-[#9CA3AF] uppercase">
        <span className="relative z-10 bg-white px-2">or</span>
        <div className="absolute inset-x-0 top-1/2 border-t border-[#E5E7EB]" />
      </div>

      <GoogleSignInButton
        onClick={google}
        label="Sign up with Google"
        disabled={busy !== null}
        loading={busy === "google"}
      />

      <p className="mt-5 text-center text-sm text-[#6B7280]">
        Already registered?{" "}
        <button
          type="button"
          className="font-semibold text-[#24A148] hover:underline"
          onClick={() => go("/login")}
        >
          Login
        </button>
      </p>
    </AuthFrame>
  );
}
