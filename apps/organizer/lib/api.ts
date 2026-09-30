"use client";

import { createApiClient } from "@repo/api-client";
import { useMemo } from "react";

import { PUBLIC_API_URL } from "./env";
import { useSession } from "./session";

export function useApi() {
  const { getAccessToken, refresh } = useSession();

  // Cliente estable: lee el token de un ref, así una consulta en curso no se
  // queda con un token viejo capturado en su closure.
  return useMemo(
    () =>
      createApiClient({
        baseUrl: PUBLIC_API_URL,
        getAccessToken,
        // Ante un 401: un único refresh compartido por todas las peticiones
        // que fallaron a la vez, y reintento transparente con el token nuevo.
        // Si el refresh es rechazado de verdad, `refresh()` deja la sesión en
        // "anonymous" y el layout manda a /login; si solo no hay red, la
        // sesión se conserva.
        onUnauthorized: () => refresh(),
      }),
    [getAccessToken, refresh]
  );
}
