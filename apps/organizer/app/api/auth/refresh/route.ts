import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { API_URL, REFRESH_COOKIE } from "@/lib/env";

/**
 * Rota el refresh token (ROTATE_REFRESH_TOKENS=True en el backend) y
 * devuelve un access token nuevo. Se llama al cargar la app y cuando un
 * fetch responde 401.
 */
export async function POST() {
  const cookieStore = await cookies();
  const refresh = cookieStore.get(REFRESH_COOKIE)?.value;

  if (!refresh) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED" } }, { status: 401 });
  }

  const response = await fetch(`${API_URL}/api/auth/org/refresh/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh }),
  });

  const data = await response.json();
  if (!response.ok) {
    const res = NextResponse.json(data, { status: response.status });
    res.cookies.delete(REFRESH_COOKIE);
    return res;
  }

  const res = NextResponse.json({ access: data.access });
  if (data.refresh) {
    res.cookies.set(REFRESH_COOKIE, data.refresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return res;
}
