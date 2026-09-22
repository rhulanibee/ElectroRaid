"use client";

import { useEffect, useState } from "react";
import { AuthField, AuthFrame, authControlClass, authPrimaryClass } from "@/components/auth-frame";
import { ButtonSpinner, pressLock, pressLockProps } from "@/components/ui/button-spinner";
import { GoogleSignInButton } from "@/components/google-sign-in";
import { presentStaff, PERSONAS } from "@/lib/session";
import { afterLoginPath, useSession } from "@/lib/use-session";
import { go, goReplace } from "@/lib/hard-nav";
import { cn } from "@/lib/utils";

function queryParam(name: string) {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

export function LoginScreen() {
  const { login, loginWithPassword, loginWithGoogle } = useSession();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [staffOpen, setStaffOpen] = useState(false);
  const [busy, setBusy] = useState<"form" | "google" | string | null>(null);

  useEffect(() => {
    if (queryParam("staff") === "1") setStaffOpen(true);
  }, []);

  function finish(home: string) {
    goReplace(home);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || !password.trim()) {
      setError("Enter your account number (or email) and password.");
      return;
    }
    setBusy("form");
    setError(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const persona = await loginWithPassword(identifier, password);
      if (!persona) {
        setError("Account number / email or password is incorrect.");
        return;
      }
      finish(afterLoginPath(persona, queryParam("next")));
    } finally {
      setBusy(null);
    }
  }

  async function google() {
    setBusy("google");
    setError(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const persona = loginWithGoogle();
      if (persona) finish(afterLoginPath(persona, queryParam("next")));
    } finally {
      setBusy(null);
    }
  }

  async function staff(id: string) {
    setBusy(id);
    setError(null);
    try {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const persona = login(id);
      if (persona) finish(afterLoginPath(persona, queryParam("next")));
    } finally {
      setBusy(null);
    }
  }

  const staffPersonas = PERSONAS.filter(
    (p) => p.role !== "resident" && p.role !== "admin",
  )
    .map((persona) => presentStaff(persona))
    .filter((persona): persona is NonNullable<typeof persona> => Boolean(persona));

  return (
    <AuthFrame title="Welcome Back" subtitle="Sign in with your municipal account.">
      <form onSubmit={submit} className="space-y-3">
        <AuthField label="Username / Account Number">
          <input
            className={authControlClass}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            placeholder="Username, account number, or email"
          />
        </AuthField>
        <AuthField label="Password">
          <input
            type="password"
            className={authControlClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="Enter password"
          />
        </AuthField>
        {error ? <p className="text-sm text-[#DC2626]">{error}</p> : null}
        <button
          type="submit"
          className={authPrimaryClass}
          disabled={busy !== null}
          {...pressLockProps(busy === "form")}
        >
          {busy === "form" ? <ButtonSpinner label="Signing in…" /> : "Login"}
        </button>
        <p className="text-center text-[11px] text-[#6B7280]">
          Household sign-in: account <span className="font-mono">3218840441</span> ·
          password <span className="font-mono">electroraid</span>
        </p>
      </form>

      <div className="relative my-4 text-center text-xs font-medium tracking-wide text-[#9CA3AF] uppercase">
        <span className="relative z-10 bg-white px-2">or</span>
        <div className="absolute inset-x-0 top-1/2 border-t border-[#E5E7EB]" />
      </div>

      <GoogleSignInButton onClick={google} disabled={busy !== null} loading={busy === "google"} />

      <p className="mt-5 text-center text-sm text-[#6B7280]">
        New household?{" "}
        <button
          type="button"
          className="font-semibold text-[#24A148] hover:underline"
          onClick={() => go("/register")}
          disabled={busy !== null}
        >
          Register
        </button>
      </p>

      <div className="mt-5 border-t border-[#E5E7EB] pt-4">
        <button
          type="button"
          onClick={() => setStaffOpen((v) => !v)}
          className="w-full text-center text-xs font-medium text-[#6B7280] hover:text-[#121417]"
        >
          Municipal staff sign-in
        </button>
        {staffOpen ? (
          <div className="mt-3 grid gap-2">
            <p className="text-center text-[11px] text-[#6B7280]">
              Administrator: username <span className="font-mono">admin</span>{" "}
              · password <span className="font-mono">Admin123</span>
            </p>
            {staffPersonas.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={busy !== null}
                onClick={() => staff(p.id)}
                {...pressLockProps(busy === p.id)}
                className={cn(
                  "rounded-xl px-3 py-2 text-left text-sm",
                  pressLock.base,
                  pressLock.soft,
                )}
              >
                {busy === p.id ? (
                  <ButtonSpinner label="Signing in…" />
                ) : (
                  <>
                    <div className="font-semibold text-[#121417]">{p.name}</div>
                    <div className="text-xs text-[#6B7280]">{p.title}</div>
                  </>
                )}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </AuthFrame>
  );
}
