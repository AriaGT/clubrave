"use client";

import { Button, Card, CardContent, TopBar, useAsyncAction } from "@repo/ui";
import { ChevronRight, Globe, KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useSession } from "@/lib/session";

export default function SettingsPage() {
  const { logout, organizationId } = useSession();
  const router = useRouter();
  const signOut = useAsyncAction(async () => {
    await logout();
    router.replace("/login");
  });

  return (
    <>
      <TopBar title="Ajustes" />
      <div className="flex flex-col gap-4 p-[var(--space-4)]">
        <Card>
          <CardContent className="flex flex-col gap-1 pt-4">
            <span className="text-xs uppercase tracking-wide text-[var(--color-text-subtle)]">
              Organización
            </span>
            <span className="font-mono text-sm">{organizationId}</span>
          </CardContent>
        </Card>

        <Link
          href="/settings/site"
          className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-4)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent-soft)] text-[var(--color-accent-text)]">
            <Globe className="h-5 w-5" />
          </span>
          <span className="flex flex-1 flex-col">
            <span className="font-medium">Sitio web</span>
            <span className="text-sm text-[var(--color-text-muted)]">Logo, contacto y redes de la tienda</span>
          </span>
          <ChevronRight className="h-5 w-5 text-[var(--color-text-subtle)]" />
        </Link>

        <Link
          href="/settings/password"
          className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-[var(--space-4)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent-soft)] text-[var(--color-accent-text)]">
            <KeyRound className="h-5 w-5" />
          </span>
          <span className="flex flex-1 flex-col">
            <span className="font-medium">Contraseña</span>
            <span className="text-sm text-[var(--color-text-muted)]">Cambiarla con confirmación por correo</span>
          </span>
          <ChevronRight className="h-5 w-5 text-[var(--color-text-subtle)]" />
        </Link>

        <Button variant="danger" loading={signOut.pending} onClick={() => signOut.run()}>
          Cerrar sesión
        </Button>
      </div>
    </>
  );
}
