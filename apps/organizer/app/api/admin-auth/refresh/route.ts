import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { clearAdminRefreshCookie, noStore } from "@/lib/auth-cookie";
import { ADMIN_REFRESH_COOKIE, API_URL } from "@/lib/env";

/**
 * Access token nuevo para la consola. La sesión es absoluta (12 h): el backend
 * nunca rota el refresh, así que la cookie no se vuelve a escribir. Solo se
 * borra si el backend rechaza el token; un error de red o un 5xx responde 503
 * y conserva la cookie.
 */
export async function POST() {
  const cookieStore = await cookies();
  const refresh = cookieStore.get(ADMIN_REFRESH_COOKIE)?.value;

  if (!refresh) {
    return noStore(NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 }));
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/auth/admin/refresh/`, {
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
    clearAdminRefreshCookie(res);
    return noStore(res);
  }
  if (!response.ok || typeof data?.access !== "string") {
    return noStore(NextResponse.json({ error: { code: "UPSTREAM_UNAVAILABLE" } }, { status: 503 }));
  }
  return noStore(NextResponse.json({ access: data.access }));
}
