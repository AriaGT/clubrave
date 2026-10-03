"use client";

import { Button, Card, CardContent, Skeleton, TopBar, useAsyncAction } from "@repo/ui";
import { ChevronRight, KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useOrgMe } from "@/features/account/useOrgMe";
import { useSession } from "@/lib/session";

export default function AccountPage() {
  const { logout } = useSession();
  const { data: me, isLoading } = useOrgMe();
  const router = useRouter();
  const signOut = useAsyncAction(async () => {
    await logout();
    router.replace("/login");
  });

  return (
    <>
      <TopBar title="Cuenta" />
      <div className="flex flex-col gap-4 p-[var(--space-4)]">
        <Card>
          <CardContent className="flex flex-col gap-3 pt-4">
            {isLoading && <Skeleton className="h-12 w-full" />}
            {me && (
              <>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs uppercase tracking-wide text-[var(--color-text-subtle)]">Organización</span>
                  <span className="font-medium">{me.organization_name}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs uppercase tracking-wide text-[var(--color-text-subtle)]">Usuario</span>
                  <span className="font-medium">{me.full_name || me.email}</span>
                  {me.full_name && <span className="text-sm text-[var(--color-text-muted)]">{me.email}</span>}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Link
          href="/account/password"
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
