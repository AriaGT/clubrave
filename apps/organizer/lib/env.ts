/** URL de la API accesible desde el servidor de Next (SSR / route handlers). */
export const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** URL de la API accesible desde el navegador. */
export const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** URL pública de la tienda del comprador, para construir el enlace del evento. */
export const PUBLIC_STORE_URL = process.env.NEXT_PUBLIC_STORE_URL ?? "http://localhost:3000";

export const REFRESH_COOKIE = "org_refresh_token";
