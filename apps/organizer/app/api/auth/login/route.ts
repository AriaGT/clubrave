import { NextResponse } from "next/server";

import { noStore, setRefreshCookie } from "@/lib/auth-cookie";
import { API_URL } from "@/lib/env";

/**
 * Proxy de login: llama a Django, guarda el `refresh` en una cookie
 * `httpOnly` persistente y devuelve solo el `access` al navegador. El
 * refresh nunca toca JavaScript del cliente (ver §10.6 del plan). Mismo
 * login para el organizador y el portero.
 */
export async function POST(request: Request) {
  const body = await request.json();

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/auth/org/login/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return noStore(
      NextResponse.json(
        { error: { code: "UPSTREAM_UNAVAILABLE", message: "No hay conexión con el servidor. Inténtalo de nuevo." } },
        { status: 503 }
      )
    );
  }

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.access) {
    return noStore(
      NextResponse.json(data ?? { error: { message: "No se pudo iniciar sesión." } }, {
        status: response.ok ? 502 : response.status,
      })
    );
  }

  const res = NextResponse.json({ access: data.access });
  setRefreshCookie(res, data.refresh);
  return noStore(res);
}
