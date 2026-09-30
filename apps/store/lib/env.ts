/** URL de la API accesible desde el servidor de Next (SSR / route handlers). */
export const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** URL de la API accesible desde el navegador. */
export const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** URL pública de esta tienda (Open Graph, enlaces canónicos). */
export const PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const REFRESH_COOKIE = "customer_refresh_token";

export const CART_EMAIL_KEY = "umbral.buyer_email";
