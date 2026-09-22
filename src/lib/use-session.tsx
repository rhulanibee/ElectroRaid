"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  PERSONAS,
  SESSION_KEY,
  findSignIn,
  loadRegistered,
  personaById,
  saveProfile,
  saveRegistered,
  withProfile,
  type DemoPersona,
  type RegisterInput,
} from "./session";
import { cacheStaffLogin } from "./staff";

interface SessionValue {
  persona: DemoPersona | null;
  ready: boolean;
  login: (id: string) => DemoPersona | null;
  loginWithPassword: (
    identifier: string,
    password: string,
  ) => Promise<DemoPersona | null>;
  loginWithGoogle: () => DemoPersona | null;
  register: (input: RegisterInput) => { persona: DemoPersona | null; error?: string };
  completeVerification: (proofName: string) => DemoPersona | null;
  updateProfile: (input: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    suburb: string;
    address: string;
  }) => { persona: DemoPersona | null; error?: string };
  logout: () => void;
}

const SessionContext = createContext<SessionValue>({
  persona: null,
  ready: false,
  login: () => null,
  loginWithPassword: async () => null,
  loginWithGoogle: () => null,
  register: () => ({ persona: null }),
  completeVerification: () => null,
  updateProfile: () => ({ persona: null }),
  logout: () => {},
});

function persist(id: string) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ id }));
}

async function loginAgainstServer(identifier: string, password: string) {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      persona?: DemoPersona;
    };
    if (!res.ok || !data.ok || !data.persona) return null;
    return data.persona;
  } catch {
    return null;
  }
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
      loginWithPassword: async (identifier: string, password: string) => {
        const secret = password.trim();
        const local = findSignIn(identifier);
        if (local && local.password === secret) {
          setPersona(local.persona);
          persist(local.persona.id);
          return local.persona;
        }
        const remote = await loginAgainstServer(identifier, secret);
        if (!remote) return null;
        cacheStaffLogin(remote, secret);
        setPersona(remote);
        persist(remote.id);
        return remote;
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
        const nextPersona: DemoPersona = {
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
        saveRegistered([...loadRegistered(), { persona: nextPersona, password: input.password }]);
        setPersona(nextPersona);
        persist(nextPersona.id);
        return { persona: nextPersona };
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
      updateProfile: (input) => {
        if (!persona) return { persona: null, error: "Sign in again to save your details." };
        const firstName = input.firstName.trim();
        const lastName = input.lastName.trim();
        const email = input.email.trim().toLowerCase();
        const phone = input.phone.trim();
        const suburb = input.suburb.trim();
        const address = input.address.trim();
        if (!firstName || !lastName) {
          return { persona: null, error: "Enter your first and last name." };
        }
        if (!email.includes("@")) {
          return { persona: null, error: "Enter a valid email address." };
        }
        if (!suburb) {
          return { persona: null, error: "Enter your suburb." };
        }
        if (!address) {
          return { persona: null, error: "Enter your street address." };
        }
        const taken = [...PERSONAS, ...loadRegistered().map((row) => row.persona)]
          .map(withProfile)
          .some((row) => row.id !== persona.id && row.email.toLowerCase() === email);
        if (taken) {
          return { persona: null, error: "That email is already used by another account." };
        }
        const patch = {
          firstName,
          lastName,
          name: `${firstName} ${lastName}`,
          email,
          phone,
          suburb,
          address,
          title: `Resident · ${suburb}`,
        };
        saveProfile(persona.id, patch);
        const rows = loadRegistered();
        const idx = rows.findIndex((row) => row.persona.id === persona.id);
        if (idx >= 0) {
          rows[idx] = {
            ...rows[idx],
            persona: {
              ...rows[idx].persona,
              ...patch,
              accountNumber: rows[idx].persona.accountNumber,
            },
          };
          saveRegistered(rows);
        }
        const next = withProfile({ ...persona, ...patch, accountNumber: persona.accountNumber });
        setPersona(next);
        return { persona: next };
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
