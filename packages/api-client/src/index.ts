import createClient, { type Middleware } from "openapi-fetch";

import type { paths } from "./schema";

export type { paths as ApiPaths } from "./schema";
export type { components as ApiComponents } from "./schema";
export * from "./images";

export interface ApiClientOptions {
  baseUrl: string;
  getAccessToken?: () => string | null;
  /**
   * Se llama ante un 401. Si devuelve (o resuelve) un access token nuevo, la
   * petición se reintenta UNA vez con él y el llamador nunca ve el 401. Si
   * devuelve `void`/`null`, el 401 llega tal cual al llamador.
   */
  onUnauthorized?: () => void | string | null | Promise<string | null | void>;
}

/**
 * Cliente tipado desde el esquema OpenAPI. Cada app (organizador, tienda)
 * crea el suyo con la base URL y la fuente de token que le corresponda —
 * un token de comprador jamás debe llegar a un endpoint /org/ y viceversa
 * (regla A6 del plan).
 */
export function createApiClient({ baseUrl, getAccessToken, onUnauthorized }: ApiClientOptions) {
  const client = createClient<paths>({ baseUrl });
  // Copia intacta de cada petición (el cuerpo se consume al enviarla) para
  // poder reintentarla tras un refresh.
  const pending = new WeakMap<Request, Request>();

  const authMiddleware: Middleware = {
    async onRequest({ request }) {
      const token = getAccessToken?.();
      if (token) {
        request.headers.set("Authorization", `Bearer ${token}`);
      }
      pending.set(request, request.clone());
      return request;
    },
    async onResponse({ request, response }) {
      const copy = pending.get(request);
      pending.delete(request);
      if (response.status !== 401 || !onUnauthorized) return response;

      const fresh = await onUnauthorized();
      if (typeof fresh !== "string" || !copy) return response;
      copy.headers.set("Authorization", `Bearer ${fresh}`);
      return fetch(copy);
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
