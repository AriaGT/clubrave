"use client";

import { Button, FieldError, Logo } from "@repo/ui";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useConfirmPasswordChange } from "@/features/account/hooks";

/** Página pública: el enlace del correo puede abrirse sin sesión. El cambio
 * se aplica con un botón (no al cargar) para que un escáner de enlaces del
 * correo no consuma el token de un solo uso. */
export default function ConfirmPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  const confirm = useConfirmPasswordChange();

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") ?? "");
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-(--space-6) text-center">
      <Logo size={56} />
      {confirm.isSuccess ? (
        <>
          <CheckCircle2 className="h-10 w-10 text-[var(--color-accent-text)]" />
          <h1 className="font-display text-2xl font-bold">Contraseña actualizada</h1>
          <p className="max-w-sm text-text-muted">
            Por seguridad cerramos tus sesiones abiertas. Inicia sesión con tu contraseña nueva.
          </p>
          <Link href="/login">
            <Button>Ir a iniciar sesión</Button>
          </Link>
        </>
      ) : (
        <>
          <h1 className="font-display text-2xl font-bold">Confirmar cambio de contraseña</h1>
          <p className="max-w-sm text-text-muted">
            Confirma para aplicar la contraseña nueva que elegiste en Ajustes.
          </p>
          <FieldError>{token === "" ? "El enlace no es válido." : confirm.error?.message}</FieldError>
          <Button disabled={!token} loading={confirm.isPending} onClick={() => token && confirm.mutate(token)}>
            Confirmar cambio
          </Button>
        </>
      )}
    </main>
  );
}
