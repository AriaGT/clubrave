import type { NextResponse } from "next/server";

import { ADMIN_REFRESH_COOKIE, REFRESH_COOKIE } from "./env";

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

/** La sesión de la consola dura 12 h (igual que `ADMIN_SESSION_LIFETIME` en el
 * backend), no se rota, y la cookie solo viaja a las rutas `/api/admin-auth`. */
export const ADMIN_COOKIE_PATH = "/api/admin-auth";
export const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 12;

export function setAdminRefreshCookie(res: NextResponse, refresh: string) {
  res.cookies.set(ADMIN_REFRESH_COOKIE, refresh, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: ADMIN_COOKIE_PATH,
    maxAge: ADMIN_COOKIE_MAX_AGE,
  });
}

export function clearAdminRefreshCookie(res: NextResponse) {
  res.cookies.set(ADMIN_REFRESH_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: ADMIN_COOKIE_PATH,
    maxAge: 0,
  });
}

export function noStore(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store");
  return res;
}
