"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  PERSONAS,
  SESSION_KEY,
  findSignIn,
  loadRegistered,
  personaById,
  saveRegistered,
  type DemoPersona,
  type RegisterInput,
} from "./session";

interface SessionValue {
  persona: DemoPersona | null;
  ready: boolean;
  login: (id: string) => DemoPersona | null;
  loginWithPassword: (identifier: string, password: string) => DemoPersona | null;
  loginWithGoogle: () => DemoPersona | null;
  register: (input: RegisterInput) => { persona: DemoPersona | null; error?: string };
  completeVerification: (proofName: string) => DemoPersona | null;
  logout: () => void;
}

const SessionContext = createContext<SessionValue>({
  persona: null,
  ready: false,
  login: () => null,
  loginWithPassword: () => null,
  loginWithGoogle: () => null,
  register: () => ({ persona: null }),
  completeVerification: () => null,
  logout: () => {},
});

function persist(id: string) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ id }));
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [persona, setPersona] = useState<DemoPersona | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { id?: string };
        const found = parsed.id ? personaById(parsed.id) : undefined;
        if (found) setPersona(found);
      }
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  const value = useMemo<SessionValue>(
    () => ({
      persona,
      ready,
      login: (id: string) => {
        const found = personaById(id) ?? null;
        setPersona(found);
        if (found) persist(found.id);
        return found;
      },
      loginWithPassword: (identifier: string, password: string) => {
        const match = findSignIn(identifier);
        if (!match || match.password !== password.trim()) return null;
        setPersona(match.persona);
        persist(match.persona.id);
        return match.persona;
      },
      loginWithGoogle: () => {
        const found = PERSONAS.find((p) => p.id === "usr_sibusiso") ?? null;
        setPersona(found);
        if (found) persist(found.id);
        return found;
      },
      register: (input: RegisterInput) => {
        const email = input.email.trim().toLowerCase();
        const account = input.accountNumber.trim();
        if (!input.firstName.trim() || !input.lastName.trim()) {
          return { persona: null, error: "Enter your first and last name." };
        }
        if (!email.includes("@")) {
          return { persona: null, error: "Enter a valid email address." };
        }
        if (account.length < 6) {
          return { persona: null, error: "Enter the 10-digit municipal account number." };
        }
        if (input.password.length < 8) {
          return { persona: null, error: "Password must be at least 8 characters." };
        }
        if (findSignIn(email) || findSignIn(account)) {
          return {
            persona: null,
            error: "An account already exists for that email or account number. Sign in instead.",
          };
        }
        const persona: DemoPersona = {
          id: `usr_${Date.now()}`,
          name: `${input.firstName.trim()} ${input.lastName.trim()}`,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          role: "resident",
          title: `Resident · ${input.firstName.trim()}`,
          email,
          phone: input.phone.trim(),
          home: "/resident",
          suburb: "Mamelodi",
          accountNumber: account,
          verified: false,
          blurb: "Report a fault and track restoration.",
          duties: ["Report", "Track", "Confirm"],
        };
        saveRegistered([...loadRegistered(), { persona, password: input.password }]);
        setPersona(persona);
        persist(persona.id);
        return { persona };
      },
      completeVerification: (proofName: string) => {
        if (!persona) return null;
        const next = { ...persona, verified: true };
        const rows = loadRegistered();
        const idx = rows.findIndex((r) => r.persona.id === persona.id);
        if (idx >= 0) {
          rows[idx] = { ...rows[idx], persona: next, proofName };
          saveRegistered(rows);
        }
        setPersona(next);
        persist(next.id);
        return next;
      },
      logout: () => {
        setPersona(null);
        localStorage.removeItem(SESSION_KEY);
      },
    }),
    [persona, ready],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}

export { PERSONAS, SIGNIN_PASSWORD, afterLoginPath } from "./session";
