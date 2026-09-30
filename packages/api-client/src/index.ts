import createClient, { type Middleware } from "openapi-fetch";

import type { paths } from "./schema";

export type { paths as ApiPaths } from "./schema";
export type { components as ApiComponents } from "./schema";
export * from "./images";

export interface ApiClientOptions {
  baseUrl: string;
  getAccessToken?: () => string | null;
  onUnauthorized?: () => void;
}

/**
 * Cliente tipado desde el esquema OpenAPI. Cada app (organizador, tienda)
 * crea el suyo con la base URL y la fuente de token que le corresponda —
 * un token de comprador jamás debe llegar a un endpoint /org/ y viceversa
 * (regla A6 del plan).
 */
export function createApiClient({ baseUrl, getAccessToken, onUnauthorized }: ApiClientOptions) {
  const client = createClient<paths>({ baseUrl });

  const authMiddleware: Middleware = {
    async onRequest({ request }) {
      const token = getAccessToken?.();
      if (token) {
        request.headers.set("Authorization", `Bearer ${token}`);
      }
      return request;
    },
    async onResponse({ response }) {
      if (response.status === 401) {
        onUnauthorized?.();
      }
      return response;
    },
  };

  client.use(authMiddleware);
  return client;
}

/** Forma única de error de la API (ver apps/common/errors.py en el backend). */
export interface ApiErrorShape {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export function isApiError(value: unknown): value is ApiErrorShape {
  return typeof value === "object" && value !== null && "error" in value;
}
