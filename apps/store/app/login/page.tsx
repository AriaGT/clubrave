"use client";

import { Button, FieldError, Input, Label, Logo } from "@repo/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { useRequestCode } from "@/features/checkout/hooks";
import { useSession } from "@/lib/session";

/** `useSearchParams()` obliga a envolver en `Suspense`: sin eso, Next intenta
 * prerenderizar la página como estática y el build falla (bailout de CSR). */
function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { verify, status, rememberedEmail } = useSession();
  const requestCode = useRequestCode();

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(rememberedEmail ?? "");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const nextUrl = searchParams.get("next") || "/account/tickets";

  useEffect(() => {
    if (status === "authenticated") router.replace(nextUrl);
  }, [status, router, nextUrl]);

  useEffect(() => {
    if (rememberedEmail) setEmail(rememberedEmail);
  }, [rememberedEmail]);

  async function handleSendCode() {
    setError(null);
    if (!email.includes("@")) {
      setError("Escribe un email válido.");
      return;
    }
    await requestCode.mutateAsync(email);
    setStep("code");
  }

  async function handleVerify() {
    setError(null);
    try {
      await verify({ email, code });
      router.replace(nextUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Código inválido.");
    }
  }

  return (
    <>
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo size={48} />
        <p className="text-[var(--color-text-muted)]">Ingresa con tu email, sin contraseña.</p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-3">
        {step === "email" && (
          <>
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
            <FieldError>{error}</FieldError>
            <Button loading={requestCode.isPending} onClick={handleSendCode}>
              Enviar código
            </Button>
          </>
        )}

        {step === "code" && (
          <>
            <Label htmlFor="login-code">Código de 6 dígitos</Label>
            <Input
              id="login-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="text-center font-mono text-lg tracking-[0.3em]"
            />
            <FieldError>{error}</FieldError>
            <Button onClick={handleVerify} disabled={code.length !== 6}>
              Verificar
            </Button>
            <button type="button" className="text-sm text-[var(--color-text-muted)]" onClick={() => setStep("email")}>
              Cambiar email
            </button>
          </>
        )}
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-[var(--space-6)]">
      <Suspense fallback={<Logo size={48} />}>
        <LoginPageContent />
      </Suspense>
    </main>
  );
}
