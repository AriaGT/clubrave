import * as React from "react";

import { cn } from "../lib/cn";

export interface BottomNavItem {
  key: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  active?: boolean;
  /** La pestaña central con acento (p. ej. "Escanear"): es la única con violeta. */
  accent?: boolean;
}

export interface BottomNavProps {
  items: BottomNavItem[];
  /** Componente de enlace de la app anfitriona (p. ej. `next/link`). */
  linkComponent?: React.ElementType;
}

/** Barra inferior de navegación (ver §10.2): "Inicio · Eventos · Escanear · Ajustes". */
export function BottomNav({ items, linkComponent: Link = "a" }: BottomNavProps) {
  return (
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-[var(--color-border)]",
        "bg-[var(--color-bg-elevated)] pb-[env(safe-area-inset-bottom)]"
      )}
      style={{ height: "calc(var(--density-row, 44px) + 20px + env(safe-area-inset-bottom))" }}
    >
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors duration-[var(--duration-fast)]",
            item.accent
              ? "text-[var(--color-accent-text)]"
              : item.active
                ? "text-[var(--color-text)]"
                : "text-[var(--color-text-subtle)] hover:text-[var(--color-text-muted)]"
          )}
        >
          <span
            className={cn(
              "flex h-8 w-8 items-center justify-center",
              item.accent && "rounded-[var(--radius-full)] bg-[var(--color-accent)] text-white"
            )}
          >
            {item.icon}
          </span>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
