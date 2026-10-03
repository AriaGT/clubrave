import { NextResponse } from "next/server";

import { noStore, setAdminRefreshCookie } from "@/lib/auth-cookie";
import { API_URL } from "@/lib/env";

/**
 * Proxy de login de la consola: llama a Django, guarda el `refresh` en una
 * cookie `httpOnly` propia (12 h, solo para `/api/admin-auth`) y devuelve solo
 * el `access` al navegador. Solo entra un superusuario; para cualquier otra
 * cuenta el backend responde el mismo error genérico.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/auth/admin/login/`, {
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
  setAdminRefreshCookie(res, data.refresh);
  return noStore(res);
}
