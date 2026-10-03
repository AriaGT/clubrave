"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { fetchRefresh, msUntilRefresh, singleFlight, withCrossTabLock } from "./auth-refresh";
import { decodeJwt, type OrgTokenClaims } from "./jwt";

/** "owner": organizador (todo el panel). "security": portero
 * (solo el escáner; el backend le responde 403 a todo lo demás). */
export type PanelRole = "owner" | "security";

interface SessionState {
  accessToken: string | null;
  organizationId: string | null;
  role: PanelRole | null;
  status: "loading" | "authenticated" | "anonymous";
}

interface SessionContextValue extends SessionState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Refresca el access token (single-flight). Devuelve el token nuevo, o
   * null si la sesión terminó o no hay red (en ese caso la sesión sigue). */
  refresh: () => Promise<string | null>;
  /** Lector estable del token vigente (no cambia de identidad entre renders). */
  getAccessToken: () => string | null;
}

const SessionContext = createContext<SessionContextValue | null>(null);

// Un único refresh en vuelo por pestaña, y serializado entre pestañas.
const refreshOnce = singleFlight(() => withCrossTabLock("org-session-refresh", () => fetchRefresh()));

const RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 30_000];

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const tokenRef = useRef<string | null>(null);
  const retryRef = useRef(0);
  const [state, setState] = useState<SessionState>({
    accessToken: null,
    organizationId: null,
    role: null,
    status: "loading",
  });

  const applyToken = useCallback((accessToken: string | null) => {
    tokenRef.current = accessToken;
    const claims = accessToken ? decodeJwt<OrgTokenClaims>(accessToken) : null;
    setState({
      accessToken,
      organizationId: claims?.organization_id ?? null,
      role: claims ? (claims.scope === "door" ? "security" : "owner") : null,
      status: accessToken ? "authenticated" : "anonymous",
    });
  }, []);

  const refresh = useCallback(async () => {
    const outcome = await refreshOnce();
    if (outcome.kind === "ok") {
      retryRef.current = 0;
      applyToken(outcome.access);
      return outcome.access;
    }
    if (outcome.kind === "unauthenticated") {
      applyToken(null);
      return null;
    }
    // Transitorio (sin red / backend caído): NO se cierra la sesión. Se
    // conserva el token actual y se reintenta al volver la red o el foco.
    return null;
  }, [applyToken]);

  const getAccessToken = useCallback(() => tokenRef.current, []);

  // Arranque: recupera la sesión desde la cookie httpOnly. Si no hay red,
  // reintenta con espera creciente en vez de mandar al login.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attempt = async () => {
      const outcome = await refreshOnce();
      if (cancelled) return;
      if (outcome.kind === "ok") applyToken(outcome.access);
      else if (outcome.kind === "unauthenticated") applyToken(null);
      else {
        const delay = RETRY_DELAYS_MS[Math.min(retryRef.current, RETRY_DELAYS_MS.length - 1)];
        retryRef.current += 1;
        timer = setTimeout(attempt, delay);
      }
    };
    attempt();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [applyToken]);

  // Refresh proactivo un minuto antes del vencimiento, y al volver a primer
  // plano: en iOS los timers se congelan con la app en segundo plano, así
  // que `visibilitychange`/`pageshow`/`online` son los que de verdad avisan.
  useEffect(() => {
    if (state.status !== "authenticated") return;
    const timer = setTimeout(() => void refresh(), msUntilRefresh(state.accessToken));
    const onWake = () => {
      if (document.visibilityState === "visible" && msUntilRefresh(tokenRef.current) === 0) {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("pageshow", onWake);
    window.addEventListener("online", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("pageshow", onWake);
      window.removeEventListener("online", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [state.status, state.accessToken, refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error?.message ?? "No se pudo iniciar sesión.");
      }
      queryClient.clear(); // nada en caché de una sesión anterior (p. ej. otro rol)
      applyToken(data.access);
    },
    [applyToken, queryClient]
  );

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    queryClient.clear();
    applyToken(null);
  }, [applyToken, queryClient]);

  const value = useMemo(
    () => ({ ...state, login, logout, refresh, getAccessToken }),
    [state, login, logout, refresh, getAccessToken]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession debe usarse dentro de <SessionProvider>");
  return ctx;
}
