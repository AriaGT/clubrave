"use client";

import { createApiClient } from "@repo/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { fetchRefresh, msUntilRefresh, singleFlight, withCrossTabLock } from "./auth-refresh";
import { PUBLIC_API_URL } from "./env";

/**
 * Sesión de la consola de administración (`/admin`). Versión reducida de
 * `session.tsx`: sin roles ni organización. El refresh vive en una cookie
 * propia (`admin_refresh_token`) y la sesión es absoluta (12 h): al vencer hay
 * que volver a iniciar sesión.
 */

interface AdminSessionState {
  accessToken: string | null;
  status: "loading" | "authenticated" | "anonymous";
}

interface AdminSessionValue extends AdminSessionState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<string | null>;
  getAccessToken: () => string | null;
}

const AdminSessionContext = createContext<AdminSessionValue | null>(null);

const REFRESH_URL = "/api/admin-auth/refresh";
const refreshOnce = singleFlight(() =>
  withCrossTabLock("admin-session-refresh", () => fetchRefresh(fetch, REFRESH_URL))
);

const RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 30_000];

export function AdminSessionProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const tokenRef = useRef<string | null>(null);
  const retryRef = useRef(0);
  const [state, setState] = useState<AdminSessionState>({ accessToken: null, status: "loading" });

  const applyToken = useCallback((accessToken: string | null) => {
    tokenRef.current = accessToken;
    setState({ accessToken, status: accessToken ? "authenticated" : "anonymous" });
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
    return null; // transitorio: la sesión sigue, se reintenta al volver la red o el foco
  }, [applyToken]);

  const getAccessToken = useCallback(() => tokenRef.current, []);

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

  useEffect(() => {
    if (state.status !== "authenticated") return;
    const timer = setTimeout(() => void refresh(), msUntilRefresh(state.accessToken));
    const onWake = () => {
      if (document.visibilityState === "visible" && msUntilRefresh(tokenRef.current) === 0) {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [state.status, state.accessToken, refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch("/api/admin-auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error?.message ?? "No se pudo iniciar sesión.");
      queryClient.clear();
      applyToken(data.access);
    },
    [applyToken, queryClient]
  );

  const logout = useCallback(async () => {
    await fetch("/api/admin-auth/logout", { method: "POST" }).catch(() => undefined);
    queryClient.clear();
    applyToken(null);
  }, [applyToken, queryClient]);

  const value = useMemo(
    () => ({ ...state, login, logout, refresh, getAccessToken }),
    [state, login, logout, refresh, getAccessToken]
  );

  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>;
}

export function useAdminSession() {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) throw new Error("useAdminSession debe usarse dentro de <AdminSessionProvider>");
  return ctx;
}

/** Cliente tipado con el token del administrador. */
export function useAdminApi() {
  const { getAccessToken, refresh } = useAdminSession();
  return useMemo(
    () => createApiClient({ baseUrl: PUBLIC_API_URL, getAccessToken, onUnauthorized: () => refresh() }),
    [getAccessToken, refresh]
  );
}
