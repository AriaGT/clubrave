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
          refresh().catch(() => logout());
        },
      }),
    [accessToken, refresh, logout]
  );
}
