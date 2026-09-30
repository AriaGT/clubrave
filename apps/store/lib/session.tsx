"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { CART_EMAIL_KEY } from "./env";
import { decodeJwt, type CustomerTokenClaims } from "./jwt";

interface SessionState {
  accessToken: string | null;
  userId: string | null;
  status: "loading" | "authenticated" | "anonymous";
}

interface SessionContextValue extends SessionState {
  /** Verifica el código/token y abre sesión. */
  verify: (payload: { email?: string; code?: string; token?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<string | null>;
  /** Último email usado: la segunda compra ya empieza identificada (§11.5). */
  rememberedEmail: string | null;
  setRememberedEmail: (email: string) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

async function requestRefresh(): Promise<string | null> {
  const res = await fetch("/api/auth/refresh", { method: "POST" });
  if (!res.ok) return null;
  const data = await res.json();
  return data.access as string;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>({ accessToken: null, userId: null, status: "loading" });
  const [rememberedEmail, setRememberedEmailState] = useState<string | null>(null);

  const applyToken = useCallback((accessToken: string | null) => {
    const claims = accessToken ? decodeJwt<CustomerTokenClaims>(accessToken) : null;
    setState({ accessToken, userId: claims?.user_id ?? null, status: accessToken ? "authenticated" : "anonymous" });
  }, []);

  useEffect(() => {
    requestRefresh().then(applyToken);
    try {
      setRememberedEmailState(localStorage.getItem(CART_EMAIL_KEY));
    } catch {
      // localStorage puede fallar en privado/incógnito: no es crítico
    }
  }, [applyToken]);

  const setRememberedEmail = useCallback((email: string) => {
    setRememberedEmailState(email);
    try {
      localStorage.setItem(CART_EMAIL_KEY, email);
    } catch {
      // idem
    }
  }, []);

  const verify = useCallback(
    async (payload: { email?: string; code?: string; token?: string }) => {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "El código no es válido.");
      applyToken(data.access);
      if (payload.email) setRememberedEmail(payload.email);
    },
    [applyToken, setRememberedEmail]
  );

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    applyToken(null);
  }, [applyToken]);

  const refresh = useCallback(async () => {
    const token = await requestRefresh();
    applyToken(token);
    return token;
  }, [applyToken]);

  const value = useMemo(
    () => ({ ...state, verify, logout, refresh, rememberedEmail, setRememberedEmail }),
    [state, verify, logout, refresh, rememberedEmail, setRememberedEmail]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession debe usarse dentro de <SessionProvider>");
  return ctx;
}
