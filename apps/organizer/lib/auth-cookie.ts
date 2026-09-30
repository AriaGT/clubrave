import type { NextResponse } from "next/server";

import { REFRESH_COOKIE } from "./env";

/** 30 días, igual que `REFRESH_TOKEN_LIFETIME` en el backend. Con `Max-Age`
 * la cookie es persistente: sin él sería de sesión y iOS la borra al cerrar
 * la PWA instalada. */
export const REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export function setRefreshCookie(res: NextResponse, refresh: string) {
  res.cookies.set(REFRESH_COOKIE, refresh, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: REFRESH_COOKIE_MAX_AGE,
  });
}

export function noStore(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store");
  return res;
}
