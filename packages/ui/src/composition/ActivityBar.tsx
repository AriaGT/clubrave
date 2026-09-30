"use client";

import * as React from "react";

import { cn } from "../lib/cn";

export interface ActivityBarProps {
  /** Hay trabajo en curso (pedidos a la API, subidas). */
  active: boolean;
  /** Espera antes de mostrarse: lo que termina rápido no parpadea. */
  delayMs?: number;
  className?: string;
}

/**
 * Barra fina e indeterminada en el borde superior de la pantalla: avisa que
 * la app está trabajando aunque la acción ocurra fuera de la vista (guardar,
 * cargar datos, subir una imagen). Complementa, no reemplaza, el estado del
 * botón que disparó la acción.
 */
export function ActivityBar({ active, delayMs = 150, className }: ActivityBarProps) {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const id = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(id);
  }, [active, delayMs]);

  return (
    <div
      role="progressbar"
      aria-label="Cargando"
      aria-hidden={!visible}
      aria-busy={visible}
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden transition-opacity duration-[var(--duration-base)]",
        visible ? "opacity-100" : "opacity-0",
        className
      )}
    >
      <div className="h-full w-1/3 animate-[activity-bar_1.1s_var(--ease-in-out)_infinite] bg-[image:var(--gradient-accent)] motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-60" />
    </div>
  );
}
