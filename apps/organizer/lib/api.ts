"use client";

import { createApiClient } from "@repo/api-client";
import { useMemo } from "react";

import { PUBLIC_API_URL } from "./env";
import { useSession } from "./session";

export function useApi() {
  const { accessToken, refresh, logout } = useSession();

  return useMemo(
    () =>
      createApiClient({
        baseUrl: PUBLIC_API_URL,
        getAccessToken: () => accessToken,
        onUnauthorized: () => {
          // El access token expiró o es inválido: intenta rotarlo en segundo
          // plano. Si el refresh también falla, `refresh()` deja la sesión
          // en "anonymous" y las rutas protegidas redirigen a /login.
          refresh().catch(() => logout());
        },
      }),
    [accessToken, refresh, logout]
  );
}
