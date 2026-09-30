import { API_URL } from "./env";

/** Fetch simple para datos públicos en Server Components (cartelera, evento). */
export async function serverFetch<T>(path: string, revalidate = 60): Promise<T | null> {
  const res = await fetch(`${API_URL}${path}`, { next: { revalidate } });
  if (!res.ok) return null;
  return res.json() as Promise<T>;
}
