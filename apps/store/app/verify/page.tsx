"use client";

import { Logo } from "@repo/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { useSession } from "@/lib/session";

/** Aterrizaje del enlace mágico: `?token=` viene del email (§5.4).
 *
 * `useSearchParams()` obliga a envolver en `Suspense`: sin eso, Next intenta
 * prerenderizar la página como estática y el build falla (bailout de CSR).
 */
function VerifyPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { verify } = useSession();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setError("Enlace inválido.");
      return;
    }
    verify({ token })
      .then(() => router.replace("/account/tickets"))
      .catch((err) => setError(err instanceof Error ? err.message : "El enlace venció."));
  }, [searchParams, verify, router]);

  return (
    <>
      <Logo size={48} />
      {error ? (
        <p className="text-[var(--color-danger)]">{error}</p>
      ) : (
        <p className="text-[var(--color-text-muted)]">Verificando tu enlace…</p>
      )}
    </>
  );
}

export default function VerifyPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-[var(--space-6)] text-center">
      <Suspense
        fallback={
          <>
            <Logo size={48} />
            <p className="text-[var(--color-text-muted)]">Verificando tu enlace…</p>
          </>
        }
      >
        <VerifyPageContent />
      </Suspense>
    </main>
  );
}
