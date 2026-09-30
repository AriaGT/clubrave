"use client";

import { Button } from "@repo/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { useSession } from "@/lib/session";

const TABS = [
  { href: "/account/tickets", label: "Entradas" },
  { href: "/account/orders", label: "Compras" },
  { href: "/account/profile", label: "Perfil" },
];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const { status, logout } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "anonymous") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  if (status !== "authenticated") {
    return (
      <div className="flex flex-1 items-center justify-center py-16 text-[var(--color-text-muted)]">
        Cargando…
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full flex-1 max-w-[var(--container-max)] flex-col">
      <header className="flex items-center justify-between border-b border-[var(--color-border)] p-[var(--space-4)]">
        <nav className="flex gap-4">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={
                pathname.startsWith(tab.href)
                  ? "font-medium text-[var(--color-text)]"
                  : "text-[var(--color-text-muted)]"
              }
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await logout();
            router.replace("/");
          }}
        >
          Salir
        </Button>
      </header>
      <div className="flex-1 p-[var(--space-4)]">{children}</div>
    </div>
  );
}
