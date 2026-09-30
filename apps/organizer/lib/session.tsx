"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { decodeJwt, type OrgTokenClaims } from "./jwt";

interface SessionState {
  accessToken: string | null;
  organizationId: string | null;
  status: "loading" | "authenticated" | "anonymous";
}

interface SessionContextValue extends SessionState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Fuerza una rotación del access token (llamado tras un 401). */
  refresh: () => Promise<string | null>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

async function requestRefresh(): Promise<string | null> {
  const res = await fetch("/api/auth/refresh", { method: "POST" });
  if (!res.ok) return null;
  const data = await res.json();
  return data.access as string;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>({
    accessToken: null,
    organizationId: null,
    status: "loading",
  });

  const applyToken = useCallback((accessToken: string | null) => {
    const claims = accessToken ? decodeJwt<OrgTokenClaims>(accessToken) : null;
    setState({
      accessToken,
      organizationId: claims?.organization_id ?? null,
      status: accessToken ? "authenticated" : "anonymous",
    });
  }, []);

  useEffect(() => {
    requestRefresh().then(applyToken);
  }, [applyToken]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message ?? "No se pudo iniciar sesión.");
      }
      applyToken(data.access);
    },
    [applyToken]
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
    () => ({ ...state, login, logout, refresh }),
    [state, login, logout, refresh]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession debe usarse dentro de <SessionProvider>");
  return ctx;
}
