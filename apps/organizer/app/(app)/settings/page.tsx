"use client";

import { Button, Card, CardContent, TopBar } from "@repo/ui";
import { useRouter } from "next/navigation";

import { useSession } from "@/lib/session";

export default function SettingsPage() {
  const { logout, organizationId } = useSession();
  const router = useRouter();

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

        <Button
          variant="danger"
          onClick={async () => {
            await logout();
            router.replace("/login");
          }}
        >
          Cerrar sesión
        </Button>
      </div>
    </>
  );
}
