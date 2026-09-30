"use client";

import { useMutation } from "@tanstack/react-query";

import { PUBLIC_API_URL } from "@/lib/env";
import { useSession } from "@/lib/session";

async function post(path: string, body: unknown, accessToken?: string | null) {
  const res = await fetch(`${PUBLIC_API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (res.ok) return;
  const data = await res.json().catch(() => null);
  throw new Error(data?.error?.message ?? "Ocurrió un error. Inténtalo de nuevo.");
}

/** Paso 1: valida la contraseña actual y envía el correo de confirmación. */
export function useRequestPasswordChange() {
  const { accessToken } = useSession();
  return useMutation({
    mutationFn: (values: { current_password: string; new_password: string }) =>
      post("/api/auth/org/password-change/", values, accessToken),
  });
}

/** Paso 2: aplica el cambio con el token del enlace del correo. */
export function useConfirmPasswordChange() {
  return useMutation({
    mutationFn: (token: string) => post("/api/auth/org/password-change/confirm/", { token }),
  });
}
