import type { ApiComponents } from "@repo/api-client";

import { serverFetch } from "./server-api";

export type SiteSettings = ApiComponents["schemas"]["SiteSettings"];

export const BRAND_NAME = "Club Rave";

/** Configuración del sitio (panel → Sitio web). Cacheada 5 min: cambia poco
 * y aparece en todas las páginas. Si la API no responde, la tienda sigue
 * funcionando con la marca en texto y sin datos de contacto. */
export async function getSiteSettings(): Promise<SiteSettings | null> {
  return serverFetch<SiteSettings>("/api/site/", 300);
}

/** `wa.me` solo acepta dígitos con código de país. */
export function whatsappLink(number: string): string {
  return `https://wa.me/${number.replace(/\D/g, "")}`;
}
