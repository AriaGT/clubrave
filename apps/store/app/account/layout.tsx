"use client";

import { LoadingState } from "@repo/ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { useSession } from "@/lib/session";

const TABS = [
  { href: "/account/tickets", label: "Entradas" },
  { href: "/account/orders", label: "Compras" },
  { href: "/account/profile", label: "Perfil" },
];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const wasAuthenticated = useRef(false);

  // Sin sesión al entrar → a ingresar y volver aquí. Si la sesión se cierra
  // estando aquí (menú de la barra) → al inicio: no tiene sentido pedir el
  // código de nuevo a quien acaba de salir.
  useEffect(() => {
    if (status === "authenticated") wasAuthenticated.current = true;
    if (status !== "anonymous") return;
    router.replace(wasAuthenticated.current ? "/" : `/login?next=${encodeURIComponent(pathname)}`);
  }, [status, router, pathname]);

  if (status !== "authenticated") {
    return <LoadingState label="Cargando tu cuenta…" />;
  }

  return (
    <div className="mx-auto flex w-full flex-1 max-w-[var(--container-max)] flex-col">
      <header className="border-b border-[var(--color-border)] p-[var(--space-4)]">
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
      </header>
      <div className="flex-1 p-[var(--space-4)]">{children}</div>
    </div>
  );
}
