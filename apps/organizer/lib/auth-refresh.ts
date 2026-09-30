/**
 * Refresh del access token, sin dependencias de React ni de Next (se prueba
 * con `node --test`, ver auth-refresh.test.mts).
 *
 * Por qué existe (sesión que se cerraba seguido en la PWA, sobre todo iOS):
 *
 * - Antes cada 401 lanzaba su propio refresh. Al volver la app del segundo
 *   plano con el access vencido, varias consultas fallaban a la vez y
 *   refrescaban en paralelo con el mismo refresh token rotativo: una ganaba y
 *   las demás recibían 401 → logout. Ahora hay UN solo refresh en vuelo
 *   (single-flight en la pestaña + `navigator.locks` entre pestañas).
 * - Antes cualquier fallo (sin red, backend caído, 502 del proxy) se trataba
 *   como sesión inválida y se llamaba a logout, que además borraba la cookie.
 *   Ahora solo un rechazo explícito del refresh (401/403) cierra la sesión;
 *   lo demás es "transitorio" y se reintenta.
 */

export type RefreshOutcome =
  | { kind: "ok"; access: string }
  /** El refresh token ya no sirve (vencido, revocado, usuario desactivado). */
  | { kind: "unauthenticated" }
  /** Sin red, backend caído o respuesta inesperada: la sesión sigue viva. */
  | { kind: "transient" };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function fetchRefresh(fetchImpl: FetchLike = fetch): Promise<RefreshOutcome> {
  let res: Response;
  try {
    res = await fetchImpl("/api/auth/refresh", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    return { kind: "transient" };
  }
  if (res.status === 401 || res.status === 403) return { kind: "unauthenticated" };
  if (!res.ok) return { kind: "transient" };
  const data = (await res.json().catch(() => null)) as { access?: unknown } | null;
  return typeof data?.access === "string" ? { kind: "ok", access: data.access } : { kind: "transient" };
}

/** Envuelve `fn` para que las llamadas concurrentes compartan la misma promesa. */
export function singleFlight<T>(fn: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return () => {
    if (!inFlight) {
      inFlight = fn().finally(() => {
        inFlight = null;
      });
    }
    return inFlight;
  };
}

interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

/** Serializa el refresh entre pestañas/ventanas de la misma PWA cuando el
 * navegador soporta Web Locks (Safari ≥ 15.4); si no, corre directo. */
export function withCrossTabLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const locks = (globalThis.navigator as { locks?: LockManagerLike } | undefined)?.locks;
  return locks ? locks.request(name, fn) : fn();
}

/** `exp` del JWT en milisegundos, o null si no se puede leer. */
export function tokenExpiryMs(token: string | null): number | null {
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Milisegundos hasta que conviene refrescar (un margen antes del `exp`).
 * 0 si ya toca (o si no hay token legible). */
export function msUntilRefresh(token: string | null, now = Date.now(), marginMs = 60_000): number {
  const exp = tokenExpiryMs(token);
  if (exp === null) return 0;
  return Math.max(0, exp - marginMs - now);
}
