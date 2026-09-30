import { NextResponse } from "next/server";

import { API_URL, REFRESH_COOKIE } from "@/lib/env";

/**
 * Proxy de login: llama a Django, guarda el `refresh` en una cookie
 * `httpOnly` y devuelve solo el `access` al navegador. El refresh nunca
 * toca JavaScript del cliente (ver §10.6 del plan).
 */
export async function POST(request: Request) {
  const body = await request.json();

  const response = await fetch(`${API_URL}/api/auth/org/login/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) {
    return NextResponse.json(data, { status: response.status });
  }

  const res = NextResponse.json({ access: data.access });
  res.cookies.set(REFRESH_COOKIE, data.refresh, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 días, igual que REFRESH_TOKEN_LIFETIME
  });
  return res;
}
