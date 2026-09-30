import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { noStore, setRefreshCookie } from "@/lib/auth-cookie";
import { API_URL, REFRESH_COOKIE } from "@/lib/env";

/**
 * Devuelve un access token nuevo a partir del refresh guardado en la cookie
 * `httpOnly`. Se llama al abrir la app, antes de que venza el access y tras
 * un 401 (el cliente garantiza un solo refresh a la vez: lib/auth-refresh.ts).
 *
 * El backend solo rota el refresh cuando ya tiene cierta antigüedad; si no
 * viene uno nuevo, la cookie se deja como está.
 *
 * La cookie SOLO se borra si el backend rechaza el token (400/401/403). Un
 * error de red o un 5xx responde 503 y conserva la cookie: antes cualquier
 * fallo del backend (un deploy, un 502 del proxy) borraba la sesión.
 */
export async function POST() {
  const cookieStore = await cookies();
  const refresh = cookieStore.get(REFRESH_COOKIE)?.value;

  if (!refresh) {
    return noStore(NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 }));
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/auth/org/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
      cache: "no-store",
    });
  } catch {
    return noStore(NextResponse.json({ error: { code: "UPSTREAM_UNAVAILABLE" } }, { status: 503 }));
  }

  const data = await response.json().catch(() => null);

  if ([400, 401, 403].includes(response.status)) {
    const res = NextResponse.json(data ?? { error: { code: "UNAUTHENTICATED" } }, { status: 401 });
    res.cookies.delete(REFRESH_COOKIE);
    return noStore(res);
  }
  if (!response.ok || typeof data?.access !== "string") {
    return noStore(NextResponse.json({ error: { code: "UPSTREAM_UNAVAILABLE" } }, { status: 503 }));
  }

  const res = NextResponse.json({ access: data.access });
  if (typeof data.refresh === "string") {
    setRefreshCookie(res, data.refresh);
  }
  return noStore(res);
}
