import { API_URL } from "./env";

/** Fetch simple para datos públicos en Server Components (cartelera, evento).
 * Devuelve `null` si la API responde con error o no responde (p. ej. durante
 * el build sin API): la tienda renderiza su estado vacío en vez de caerse. */
export async function serverFetch<T>(path: string, revalidate = 60): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
