"use client";

import { Skeleton, Spinner, buttonVariants, cn, useAsyncAction } from "@repo/ui";
import { ChevronDown, LogIn, LogOut, Receipt, Ticket, UserRound } from "lucide-react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { useMe } from "@/features/account/hooks";
import { useSession } from "@/lib/session";

const MENU = [
  { href: "/account/tickets", label: "Mis entradas", icon: Ticket },
  { href: "/account/orders", label: "Mis compras", icon: Receipt },
  { href: "/account/profile", label: "Perfil", icon: UserRound },
];

/** Rutas donde "Ingresar" sobra: ya estás en el flujo de acceso. */
const AUTH_ROUTES = ["/login", "/verify"];

/**
 * Lado derecho de la barra: "Ingresar" sin sesión, menú de cuenta con sesión.
 * Mientras se resuelve la sesión (un refresh contra el servidor) muestra un
 * esqueleto del mismo tamaño para que la barra no salte.
 */
export function NavbarAccount() {
  const { status, logout } = useSession();
  const pathname = usePathname();

  if (status === "loading") {
    return (
      <>
        <Skeleton className="h-9 w-9 rounded-[var(--radius-full)] sm:w-32" />
        <span className="sr-only" role="status">
          Cargando tu sesión
        </span>
      </>
    );
  }

  if (status === "anonymous") {
    if (AUTH_ROUTES.some((route) => pathname.startsWith(route))) return null;
    const next = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return (
      <Link href={`/login${next}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
        <LogIn className="h-4 w-4" aria-hidden />
        Ingresar
      </Link>
    );
  }

  return <AccountMenu onLogout={logout} />;
}

function AccountMenu({ onLogout }: { onLogout: () => Promise<void> }) {
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  // Se queda en la página actual; las privadas (cuenta) redirigen solas. Se
  // vacía el caché para que los datos del comprador no queden en memoria.
  const signOut = useAsyncAction(async () => {
    await onLogout();
    setOpen(false);
    queryClient.clear();
  });

  // Se cierra al navegar, al tocar fuera y con Escape (devuelve el foco al botón).
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const displayName = me?.full_name?.trim() || me?.email || "";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Mi cuenta"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 items-center gap-2 rounded-[var(--radius-full)] border border-[var(--color-border)] bg-[var(--color-surface)] p-1 pr-1 transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-surface-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] sm:pr-3"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-full)] bg-[image:var(--gradient-accent)] text-sm font-bold text-white">
          {initial || <UserRound className="h-4 w-4" aria-hidden />}
        </span>
        <span className="hidden text-sm font-medium sm:inline">Mi cuenta</span>
        <ChevronDown
          className={cn(
            "hidden h-4 w-4 text-[var(--color-text-muted)] transition-transform duration-[var(--duration-fast)] sm:block",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div
          id={menuId}
          className="absolute right-0 top-[calc(100%+8px)] z-40 w-60 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--elevation-modal)] animate-[fade-in_var(--duration-fast)_var(--ease-out)]"
        >
          {displayName && (
            <div className="border-b border-[var(--color-border-subtle)] px-4 py-3">
              <p className="truncate text-sm font-medium">{me?.full_name || "Tu cuenta"}</p>
              <p className="truncate text-xs text-[var(--color-text-muted)]">{me?.email}</p>
            </div>
          )}
          <ul className="py-1">
            {MENU.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={pathname.startsWith(href) ? "page" : undefined}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--color-text-muted)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)] focus-visible:bg-[var(--color-surface)] focus-visible:text-[var(--color-text)] focus-visible:outline-none aria-[current=page]:text-[var(--color-text)]"
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="border-t border-[var(--color-border-subtle)] py-1">
            <button
              type="button"
              disabled={signOut.pending}
              aria-busy={signOut.pending || undefined}
              onClick={() => signOut.run()}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[var(--color-danger)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-danger-soft)] focus-visible:bg-[var(--color-danger-soft)] focus-visible:outline-none disabled:opacity-60"
            >
              {signOut.pending ? <Spinner size="sm" /> : <LogOut className="h-4 w-4" aria-hidden />}
              {signOut.pending ? "Cerrando sesión…" : "Cerrar sesión"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
