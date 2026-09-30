"use client";

import { Button, FieldError, Input, Label, Logo } from "@repo/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useSession } from "@/lib/session";

export default function LoginPage() {
  const { login, status } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("demo@ticketera.pe");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  if (status === "authenticated") return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-[var(--space-6)]">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo size={56} />
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-bold">Club Rave</h1>
          <p className="text-[var(--color-text-muted)]">Inicia sesión para gestionar tus eventos.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <FieldError>{error}</FieldError>
        <Button type="submit" loading={loading}>
          Iniciar sesión
        </Button>
      </form>
    </main>
  );
}
